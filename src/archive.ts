// Saving remote images (from clipped web pages) into R2 and pointing the note at the copy.

import { App, Editor, MarkdownView, requestUrl, TFile } from "obsidian";
import { findRemoteImages, nameFromUrl, replaceRemoteImages, sniffImage } from "./remote";
import type { R2Client } from "./r2";
import { uploadImage, UploadOptions } from "./uploader";

const CONCURRENCY = 4;
/** Politeness towards each source site; forums like linux.do rate-limit quickly. */
const PER_HOST = 2;
const HOST_GAP_MS = 300;
/** After this many rate-limited images in a row, a host is skipped for a while. */
const HOST_STRIKES = 5;
const HOST_BLOCK_MS = 30 * 60 * 1000;
const MAX_BYTES = 50 * 1024 * 1024;
// Some CDNs (v2ex, Cloudflare-fronted sites) reject Electron's default user agent.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
/** Failure count at which automatic runs stop retrying a URL. Manual runs always retry. */
export const GIVE_UP_AFTER = 2;
/** Stored for URLs whose original link was put back on purpose; only manual runs save them again. */
export const KEEP_ORIGINAL = 98;
/** Stored for URLs that answered with something other than an image (web page embeds etc.). */
export const NOT_IMAGE = 99;

/** Who asked: automatic runs skip given-up URLs, the whole-vault run also skips restored links, a single note retries everything. */
export type ArchiveRun = "auto" | "vault" | "note";
const RETRY_BELOW: Record<ArchiveRun, number> = { auto: GIVE_UP_AFTER, vault: KEEP_ORIGINAL, note: NOT_IMAGE };

export interface ArchiveFailure {
	note: string;
	url: string;
	reason: string;
}

export interface ArchiveStats {
	notes: number;
	saved: number;
	failed: ArchiveFailure[];
}

export const emptyStats = (): ArchiveStats => ({ notes: 0, saved: 0, failed: [] });

class NotAnImage extends Error {}

/** Rate limits, server errors and network trouble: worth trying again later, not a dead link. */
class Temporary extends Error {}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** Limits parallel requests per host and spaces them out; hosts can be put on cooldown. */
class HostGate {
	private readonly active = new Map<string, number>();
	private readonly notBefore = new Map<string, number>();
	private readonly strikes = new Map<string, number>();
	private readonly blockedUntil = new Map<string, number>();

	blocked(host: string): boolean {
		if ((this.blockedUntil.get(host) ?? 0) > Date.now()) return true;
		if (this.blockedUntil.delete(host)) this.strikes.delete(host);
		return false;
	}

	result(host: string, rateLimited: boolean) {
		const strikes = rateLimited ? (this.strikes.get(host) ?? 0) + 1 : 0;
		this.strikes.set(host, strikes);
		if (strikes >= HOST_STRIKES) this.blockedUntil.set(host, Date.now() + HOST_BLOCK_MS);
	}

	/** Called at the start of each manual run so earlier strikes don't carry over. */
	reset() {
		this.strikes.clear();
		this.blockedUntil.clear();
	}

	async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
		for (;;) {
			const wait = (this.notBefore.get(host) ?? 0) - Date.now();
			if ((this.active.get(host) ?? 0) < PER_HOST && wait <= 0) break;
			await sleep(Math.max(wait, 100));
		}
		this.active.set(host, (this.active.get(host) ?? 0) + 1);
		this.notBefore.set(host, Date.now() + HOST_GAP_MS);
		try {
			return await fn();
		} finally {
			this.active.set(host, (this.active.get(host) ?? 1) - 1);
		}
	}

	cooldown(host: string, ms: number) {
		this.notBefore.set(host, Math.max(this.notBefore.get(host) ?? 0, Date.now() + ms));
	}
}

const gate = new HostGate();

export function resetHostLimits() {
	gate.reset();
}

export interface ArchiveHost {
	app: App;
	uploadOptions(): UploadOptions;
	/** url → number of failed attempts, persisted in settings. */
	failures(): Record<string, number>;
	saveFailures(): Promise<void>;
	isOwnUrl(url: string): boolean;
	/** Remembers where an R2 copy came from (saved together with the failures). */
	recordSource(r2Url: string, source: string): void;
}

async function download(url: string): Promise<{ data: ArrayBuffer; mime: string }> {
	const host = new URL(url).host;
	if (gate.blocked(host)) throw new Temporary("HTTP 429");
	const attempt = (headers: Record<string, string>) =>
		gate.run(host, async () => {
			try {
				return await requestUrl({
					url,
					headers: { "User-Agent": BROWSER_UA, Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8", ...headers },
					throw: false,
				});
			} catch (e) {
				throw new Temporary(e instanceof Error ? e.message : String(e));
			}
		});
	let res;
	for (let tries = 0; ; tries++) {
		res = await attempt({});
		// Hotlink protection usually accepts the site's own origin as referer.
		if (res.status === 403 || res.status === 401) res = await attempt({ Referer: new URL(url).origin + "/" });
		if ((res.status !== 429 && res.status !== 503) || tries >= 2) break;
		const retryAfter = Number(res.headers["retry-after"]);
		gate.cooldown(host, Math.min(retryAfter > 0 ? retryAfter * 1000 : tries ? 20_000 : 5_000, 60_000));
	}
	gate.result(host, res.status === 429);
	if (res.status === 429 || res.status >= 500) throw new Temporary(`HTTP ${res.status}`);
	if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
	const data = res.arrayBuffer;
	if (data.byteLength > MAX_BYTES) throw new Error(`too large (${(data.byteLength / 1048576).toFixed(0)} MB)`);
	const mime = sniffImage(data, res.headers["content-type"] ?? "");
	if (!mime) throw new NotAnImage();
	return { data, mime };
}

export class RemoteArchiver {
	/** Already archived in this session: source URL → R2 URL. */
	private readonly done = new Map<string, string>();
	private readonly busyNotes = new Set<string>();

	constructor(private readonly host: ArchiveHost) {}

	/** Remote image URLs of a note that are worth trying. */
	pendingUrls(text: string, run: ArchiveRun): string[] {
		const failures = this.host.failures();
		const urls = new Set(findRemoteImages(text, (u) => this.host.isOwnUrl(u)).map((i) => i.url));
		return [...urls].filter((u) => (failures[u] ?? 0) < RETRY_BELOW[run]);
	}

	/** The editor of the note if it is open for editing; it can be ahead of the file on disk. */
	private openEditor(note: TFile): Editor | null {
		for (const leaf of this.host.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file === note && view.getMode() === "source") return view.editor;
		}
		return null;
	}

	/** Current text of a note, including edits (like a paste) that are not saved yet. */
	async noteText(note: TFile): Promise<string> {
		return this.openEditor(note)?.getValue() ?? (await this.host.app.vault.read(note));
	}

	async archiveNote(client: R2Client, note: TFile, stats: ArchiveStats, opts: { run: ArchiveRun; onImage?: () => void }): Promise<void> {
		if (this.busyNotes.has(note.path)) return;
		this.busyNotes.add(note.path);
		try {
			const urls = this.pendingUrls(await this.noteText(note), opts.run);
			if (!urls.length) return;
			const failures = this.host.failures();
			const map = new Map<string, string>();
			let next = 0;
			const worker = async () => {
				while (next < urls.length) {
					const url = urls[next++];
					try {
						let saved = this.done.get(url);
						if (!saved) {
							const { data, mime } = await download(url);
							// An R2 problem says nothing about the web image, so it must not count against it.
							saved = await uploadImage(client, this.host.uploadOptions(), data, mime, nameFromUrl(url)).catch((e: unknown) => {
								throw new Temporary(e instanceof Error ? e.message : String(e));
							});
							this.done.set(url, saved);
							stats.saved++;
						}
						map.set(url, saved);
						this.host.recordSource(saved, url);
						delete failures[url];
					} catch (e) {
						if (e instanceof NotAnImage) failures[url] = NOT_IMAGE;
						else {
							if (!(e instanceof Temporary)) failures[url] = (failures[url] ?? 0) + 1;
							stats.failed.push({ note: note.path, url, reason: e instanceof Error ? e.message : String(e) });
						}
					}
					opts.onImage?.();
				}
			};
			await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
			await this.host.saveFailures();
			if (map.size) {
				await this.apply(note, map);
				stats.notes++;
			}
		} finally {
			this.busyNotes.delete(note.path);
		}
	}

	/** Writes the new URLs, through the editor when the note is open so typing isn't clobbered. */
	async apply(note: TFile, map: Map<string, string>, isOwn: (url: string) => boolean = (u) => this.host.isOwnUrl(u)) {
		const editor = this.openEditor(note);
		if (editor) {
			// Synchronous from read to write, so the offsets are still valid.
			const images = findRemoteImages(editor.getValue(), isOwn).filter((i) => map.has(i.url));
			for (const img of images.reverse()) {
				editor.replaceRange(map.get(img.url)!, editor.offsetToPos(img.start), editor.offsetToPos(img.end));
			}
			return;
		}
		await this.host.app.vault.process(note, (text) => replaceRemoteImages(text, findRemoteImages(text, isOwn), map));
	}
}
