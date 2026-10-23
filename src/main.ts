import { Editor, MarkdownFileInfo, MarkdownView, normalizePath, Notice, Plugin, requestUrl, TAbstractFile, TFile } from "obsidian";
import { ArchiveHost, emptyStats, KEEP_ORIGINAL, RemoteArchiver, resetHostLimits } from "./archive";
import { t } from "./i18n";
import { ArchiveReportModal, ConfirmModal } from "./modals";
import { findRemoteImages } from "./remote";
import { extFromMime, imageMarkdown, mimeFromExt } from "./naming";
import { HttpFn, R2Client } from "./r2";
import { collectLocalImages, notesReferencing, rewriteNote, stillReferenced } from "./relink";
import { DEFAULT_SETTINGS, R2SettingTab, R2UploaderSettings } from "./settings";
import { uploadImage, UploadOptions } from "./uploader";

const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const CONCURRENCY = 3;
/** Wait after a note appears (Web Clipper, sync) before touching it. */
const AUTO_DELAY_MS = 5000;
/** On startup, notes in the watched folders changed within this window are checked. */
const STARTUP_SCAN_DAYS = 14;
// Kept from before the plugin ID changed, so existing devices keep their choice.
const AUTO_ARCHIVE_KEY = "r2-image-uploader-auto-archive";

// requestUrl goes through Electron / the native layer, so the bucket needs no CORS rules.
const obsidianHttp: HttpFn = async ({ url, method, headers, body }) => {
	const { "content-type": contentType, ...rest } = headers;
	const res = await requestUrl({ url, method, headers: rest, body, contentType, throw: false });
	let text = "";
	if (method !== "HEAD") {
		try {
			text = res.text;
		} catch {
			// empty or non-text body
		}
	}
	return { status: res.status, text };
};

function imageFiles(list: FileList | null | undefined): File[] {
	const files = Array.from(list ?? []);
	return files.length && files.every((f) => f.type.startsWith("image/")) ? files : [];
}

/** YYYYMMDDHHmmss, the same stamp Obsidian uses for pasted images. */
function timestamp(d = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length) await fn(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

interface RelinkResult {
	urls: Map<string, string>;
	failed: { file: TFile; error: unknown }[];
	changedNotes: number;
}

export default class R2ImageUploader extends Plugin implements ArchiveHost {
	settings!: R2UploaderSettings;
	private busy = false;
	private stopRequested = false;
	private readonly archiver = new RemoteArchiver(this);
	private readonly autoTimers = new Map<string, number>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new R2SettingTab(this.app, this));

		this.registerEvent(this.app.workspace.on("editor-paste", (evt, editor, info) => this.onPaste(evt, editor, info)));
		this.registerEvent(this.app.workspace.on("editor-drop", (evt, editor, info) => this.onDrop(evt, editor, info)));

		this.addCommand({
			id: "upload-current-note",
			name: t.cmdUploadNote,
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.uploadNote(file);
				return true;
			},
		});
		this.addCommand({ id: "upload-vault", name: t.cmdUploadVault, callback: () => this.confirmUploadVault() });
		this.addCommand({ id: "retry-pending", name: t.cmdRetry, callback: () => this.retryPending(true) });
		this.addCommand({
			id: "archive-current-note",
			name: t.cmdArchiveNote,
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.archiveNoteCommand(file);
				return true;
			},
		});
		this.addCommand({ id: "archive-vault", name: t.cmdArchiveVault, callback: () => this.confirmArchiveVault() });
		this.addCommand({
			id: "restore-original-links",
			name: t.cmdRestore,
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.restoreOriginalLinks(file);
				return true;
			},
		});
		this.addCommand({ id: "stop", name: t.cmdStop, callback: () => (this.stopRequested = true) });

		// Keep the retry list in step with renames and deletions done by the user.
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				const i = this.settings.pending.indexOf(oldPath);
				if (i >= 0) {
					this.settings.pending[i] = file.path;
					void this.saveSettings();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.settings.pending.includes(file.path)) {
					this.settings.pending = this.settings.pending.filter((p) => p !== file.path);
					void this.saveSettings();
				}
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			window.setTimeout(() => void this.retryPending(false), 10_000);
			// Registered only now: while the vault loads, "create" fires for every existing file.
			this.registerEvent(this.app.vault.on("create", (f) => this.scheduleAutoArchive(f, true)));
			this.registerEvent(this.app.vault.on("modify", (f) => this.scheduleAutoArchive(f, false)));
			window.setTimeout(() => void this.startupArchiveScan(), 20_000);
		});
		this.registerInterval(window.setInterval(() => void this.retryPending(false), RETRY_INTERVAL_MS));
		this.registerDomEvent(window, "online", () => void this.retryPending(false));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<R2UploaderSettings> | null);
		this.settings.pending = [...(this.settings.pending ?? [])];
		this.settings.remoteFailures = { ...(this.settings.remoteFailures ?? {}) };
		this.settings.sources = { ...(this.settings.sources ?? {}) };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** data.json was changed by sync from another device. */
	async onExternalSettingsChange() {
		await this.loadSettings();
	}

	/** A client for the current settings, or null if something is missing. */
	client(): R2Client | null {
		const s = this.settings;
		const read = (name: string) => (name ? this.app.secretStorage.getSecret(name) : null);
		const accessKeyId = s.syncSecrets ? s.accessKeyId : read(s.accessKeyIdSecret);
		const secretAccessKey = s.syncSecrets ? s.secretAccessKey : read(s.secretAccessKeySecret);
		if (!(s.accountId || s.endpoint) || !s.bucket || !s.publicUrl || !accessKeyId || !secretAccessKey) return null;
		return new R2Client(
			{ accountId: s.accountId, bucket: s.bucket, endpoint: s.endpoint, credentials: { accessKeyId, secretAccessKey } },
			obsidianHttp,
		);
	}

	uploadOptions(): UploadOptions {
		const s = this.settings;
		return { publicUrl: s.publicUrl, keyTemplate: s.keyTemplate, convertToWebp: s.convertToWebp, webpQuality: s.webpQuality };
	}

	// ---- paste & drop ----

	private onPaste(evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
		if (evt.defaultPrevented || !evt.clipboardData) return;
		const files = imageFiles(evt.clipboardData.files);
		if (!files.length) {
			// Pasted a piece of a web page: let Obsidian convert it, then save its images.
			const note = info.file;
			if (note && this.settings.archiveOnPaste && /<img\b/i.test(evt.clipboardData.getData("text/html")) && this.client()) {
				window.setTimeout(() => void this.autoArchiveNote(note), 1500);
			}
			return;
		}
		// Spreadsheets and rich text put a picture of the selection on the clipboard too.
		if (!this.settings.uploadOnPaste || evt.clipboardData.getData("text/plain").trim()) return;
		const client = this.client();
		if (!client) {
			new Notice(t.notConfigured);
			return;
		}
		evt.preventDefault();
		void this.insertAndUpload(client, files, editor, info.file, true);
	}

	private onDrop(evt: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
		if (evt.defaultPrevented || !this.settings.uploadOnDrop) return;
		const files = imageFiles(evt.dataTransfer?.files);
		if (!files.length) return;
		const client = this.client();
		if (!client) {
			new Notice(t.notConfigured);
			return;
		}
		evt.preventDefault();
		// Editor has no public API for this; CodeMirror's view does.
		const cm = (editor as unknown as { cm?: { posAtCoords(c: { x: number; y: number }): number | null } }).cm;
		const offset = cm?.posAtCoords({ x: evt.clientX, y: evt.clientY });
		if (offset != null) editor.setCursor(editor.offsetToPos(offset));
		void this.insertAndUpload(client, files, editor, info.file, false);
	}

	private async insertAndUpload(client: R2Client, files: File[], editor: Editor, note: TFile | null, pasted: boolean) {
		const items = files.map((file) => ({ file, placeholder: `![${t.uploading} ${Math.random().toString(36).slice(2, 8)}…]()` }));
		editor.replaceSelection(items.map((i) => i.placeholder).join("\n"));

		const errors: string[] = [];
		await Promise.all(
			items.map(async ({ file, placeholder }) => {
				const data = await file.arrayBuffer();
				const mime = file.type || mimeFromExt(extFromMime("", file.name));
				let replacement: string;
				try {
					replacement = imageMarkdown(await uploadImage(client, this.uploadOptions(), data, mime, file.name));
				} catch (e) {
					console.error("Cloudflare Image Uploader: upload failed", e);
					errors.push(errorText(e));
					const name = pasted ? `Pasted image ${timestamp()}.${extFromMime(mime, file.name)}` : file.name;
					replacement = await this.saveLocally(data, name, note);
				}
				await this.replacePlaceholder(editor, note, placeholder, replacement);
			}),
		);
		if (errors.length) new Notice(t.uploadFailedSaved(errors.length) + "\n" + errors[0], 10000);
	}

	/** Fallback when the upload fails: keep the image as a normal attachment and queue it. */
	private async saveLocally(data: ArrayBuffer, name: string, note: TFile | null): Promise<string> {
		const path = await this.app.fileManager.getAvailablePathForAttachment(name, note?.path);
		const file = await this.app.vault.createBinary(path, data);
		this.settings.pending.push(file.path);
		await this.saveSettings();
		return "!" + this.app.fileManager.generateMarkdownLink(file, note?.path ?? "");
	}

	private async replacePlaceholder(editor: Editor, note: TFile | null, placeholder: string, replacement: string) {
		const tryEditor = (ed: Editor) => {
			const offset = ed.getValue().indexOf(placeholder);
			if (offset < 0) return false;
			ed.replaceRange(replacement, ed.offsetToPos(offset), ed.offsetToPos(offset + placeholder.length));
			return true;
		};
		if (tryEditor(editor) || !note) return;
		// The user switched notes while uploading: find another editor or patch the file.
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.file === note && tryEditor(leaf.view.editor)) return;
		}
		if (note.extension === "md") await this.app.vault.process(note, (c) => c.replace(placeholder, () => replacement));
	}

	// ---- local files → R2 ----

	/**
	 * Uploads local images, rewrites their embeds in `notes`, then (optionally) trashes
	 * the ones nothing refers to any more.
	 */
	private async uploadAndRelink(client: R2Client, images: TFile[], notes: TFile[], trash: boolean, quiet = false): Promise<RelinkResult> {
		const progress = quiet ? null : new Notice(t.progress(0, images.length), 0);
		const referencing = notesReferencing(this.app, new Set(images.map((f) => f.path)));
		const urls = new Map<string, string>();
		const failed: RelinkResult["failed"] = [];
		let done = 0;
		try {
			await pool(images, CONCURRENCY, async (file) => {
				try {
					const data = await this.app.vault.readBinary(file);
					urls.set(file.path, await uploadImage(client, this.uploadOptions(), data, mimeFromExt(file.extension), file.name));
				} catch (error) {
					console.error(`Cloudflare Image Uploader: failed to upload ${file.path}`, error);
					failed.push({ file, error });
				}
				progress?.setMessage(t.progress(++done, images.length));
			});

			let changedNotes = 0;
			for (const note of notes) if ((await rewriteNote(this.app, note, urls)) > 0) changedNotes++;

			if (trash) {
				for (const file of images) {
					if (urls.has(file.path) && !(await stillReferenced(this.app, file, referencing))) await this.app.fileManager.trashFile(file);
				}
			}

			const before = this.settings.pending.length;
			this.settings.pending = this.settings.pending.filter((p) => !urls.has(p) && this.app.vault.getFileByPath(p));
			if (this.settings.pending.length !== before) await this.saveSettings();
			return { urls, failed, changedNotes };
		} finally {
			progress?.hide();
		}
	}

	private async runExclusive(fn: (client: R2Client) => Promise<void>, quiet = false) {
		const client = this.client();
		if (!client) {
			if (!quiet) new Notice(t.notConfigured);
			return;
		}
		if (this.busy) {
			if (!quiet) new Notice(t.busy);
			return;
		}
		this.busy = true;
		try {
			await fn(client);
		} finally {
			this.busy = false;
		}
	}

	private report(r: RelinkResult) {
		new Notice(t.migrateDone(r.urls.size, r.failed.length, r.changedNotes), 8000);
	}

	async uploadNote(note: TFile) {
		await this.runExclusive(async (client) => {
			const { images } = collectLocalImages(this.app, [note]);
			if (!images.length) return void new Notice(t.noLocalImages);
			this.report(await this.uploadAndRelink(client, images, [note], this.settings.afterUpload === "trash"));
		});
	}

	confirmUploadVault() {
		const { images, notes } = collectLocalImages(this.app, this.app.vault.getMarkdownFiles());
		if (!images.length) return void new Notice(t.noLocalImages);
		const mb = (images.reduce((sum, f) => sum + f.stat.size, 0) / 1024 / 1024).toFixed(1);
		new ConfirmModal(
			this.app,
			t.migrateTitle,
			[
				t.migrateSummary(images.length, mb, notes.length),
				this.settings.afterUpload === "trash" ? t.migrateAfterTrash : t.migrateAfterKeep,
				t.migrateBackup,
			],
			() =>
				void this.runExclusive(async (client) => {
					this.report(await this.uploadAndRelink(client, images, notes, this.settings.afterUpload === "trash"));
				}),
		).open();
	}

	/** Re-uploads images that were saved locally after a failed upload. */
	async retryPending(manual: boolean) {
		this.settings.pending = this.settings.pending.filter((p) => this.app.vault.getFileByPath(p));
		if (!this.settings.pending.length) {
			if (manual) new Notice(t.noPending);
			return;
		}
		await this.runExclusive(async (client) => {
			const files = this.settings.pending.map((p) => this.app.vault.getFileByPath(p)).filter((f): f is TFile => !!f);
			const notes = notesReferencing(this.app, new Set(files.map((f) => f.path))).filter((f) => f.extension === "md");
			// These files only exist because an upload failed, so they always go once relinked.
			const r = await this.uploadAndRelink(client, files, notes, true, !manual);
			if (r.urls.size || manual) new Notice(t.retryDone(r.urls.size, this.settings.pending.length), 6000);
		}, !manual);
	}

	// ---- remote images (clipped web pages) ----

	failures(): Record<string, number> {
		return this.settings.remoteFailures;
	}

	async saveFailures() {
		await this.saveSettings();
	}

	recordSource(r2Url: string, source: string) {
		this.settings.sources[r2Url] ??= source;
	}

	/** Puts the original web addresses back for images that were saved from the web. */
	async restoreOriginalLinks(note: TFile) {
		const text = await this.archiver.noteText(note);
		const map = new Map<string, string>();
		for (const img of findRemoteImages(text)) {
			const source = this.settings.sources[img.url];
			if (source && /^https?:\/\//.test(source)) map.set(img.url, source);
		}
		if (!map.size) return void new Notice(t.nothingToRestore);
		// Treat nothing as "own" so the R2 links themselves are found and replaced.
		await this.archiver.apply(note, map, () => false);
		// Otherwise automatic saving would swap them back to R2 the next time it looks at the note.
		for (const source of map.values()) this.settings.remoteFailures[source] = KEEP_ORIGINAL;
		await this.saveSettings();
		new Notice(t.restored(map.size), 6000);
	}

	isOwnUrl(url: string): boolean {
		const base = this.settings.publicUrl.trim().replace(/\/+$/, "");
		return !!base && url.startsWith(base + "/");
	}

	/** Automatic saving is a per-device choice: one always-on device is enough. */
	get autoArchive(): boolean {
		return this.app.loadLocalStorage(AUTO_ARCHIVE_KEY) === "on";
	}

	set autoArchive(on: boolean) {
		this.app.saveLocalStorage(AUTO_ARCHIVE_KEY, on ? "on" : null);
	}

	private inWatchedFolder(path: string): boolean {
		const folders = this.settings.archiveFolders
			.split(/[,\n]/)
			.map((f) => (f.trim() ? normalizePath(f.trim()) : ""))
			.filter((f) => f && f !== "/");
		return !folders.length || folders.some((f) => path.startsWith(f + "/"));
	}

	private scheduleAutoArchive(file: TAbstractFile, created: boolean) {
		if (!(file instanceof TFile) || file.extension !== "md") return;
		const timer = this.autoTimers.get(file.path);
		// Modifications only matter right after creation (a clipper may write in steps).
		if (!created && timer === undefined) return;
		if (!this.autoArchive || !this.inWatchedFolder(file.path)) return;
		window.clearTimeout(timer);
		this.autoTimers.set(
			file.path,
			window.setTimeout(() => {
				this.autoTimers.delete(file.path);
				void this.autoArchiveNote(file);
			}, AUTO_DELAY_MS),
		);
	}

	/** Quiet run for one note: no report, failed images are retried a limited number of times. */
	private async autoArchiveNote(note: TFile) {
		const client = this.client();
		if (!client || !this.app.vault.getFileByPath(note.path)) return;
		const stats = emptyStats();
		await this.archiver.archiveNote(client, note, stats, { run: "auto" });
		if (stats.failed.length) console.warn("Cloudflare Image Uploader: could not save", stats.failed);
		if (stats.notes) new Notice(t.autoArchived(stats.saved, note.basename, stats.failed.length), 5000);
	}

	/** Catches notes that arrived while Obsidian was closed. */
	private async startupArchiveScan() {
		if (!this.autoArchive || !this.client()) return;
		const since = Date.now() - STARTUP_SCAN_DAYS * 86400_000;
		for (const note of this.app.vault.getMarkdownFiles()) {
			if (note.stat.mtime < since || !this.inWatchedFolder(note.path)) continue;
			if (this.archiver.pendingUrls(await this.app.vault.cachedRead(note), "auto").length) await this.autoArchiveNote(note);
		}
	}

	async archiveNoteCommand(note: TFile) {
		const client = this.client();
		if (!client) return void new Notice(t.notConfigured);
		const total = this.archiver.pendingUrls(await this.archiver.noteText(note), "note").length;
		if (!total) return void new Notice(t.noRemoteImages);
		const stats = emptyStats();
		resetHostLimits();
		const progress = new Notice(t.archiveProgress(0, total), 0);
		let done = 0;
		try {
			await this.archiver.archiveNote(client, note, stats, {
				run: "note",
				onImage: () => progress.setMessage(t.archiveProgress(++done, total)),
			});
		} finally {
			progress.hide();
		}
		if (stats.failed.length) new ArchiveReportModal(this.app, stats, false).open();
		else new Notice(t.archiveDone(stats.saved, stats.notes, 0), 6000);
	}

	async confirmArchiveVault() {
		if (!this.client()) return void new Notice(t.notConfigured);
		const scanning = new Notice(t.scanning, 0);
		const notes: TFile[] = [];
		const unique = new Set<string>();
		let total = 0;
		try {
			for (const note of this.app.vault.getMarkdownFiles()) {
				const urls = this.archiver.pendingUrls(await this.app.vault.cachedRead(note), "vault");
				if (!urls.length) continue;
				notes.push(note);
				total += urls.length;
				urls.forEach((u) => unique.add(u));
			}
		} finally {
			scanning.hide();
		}
		if (!notes.length) return void new Notice(t.noRemoteImages);
		new ConfirmModal(this.app, t.archiveTitle, [t.archiveSummary(unique.size, notes.length), t.archiveExplain, t.archiveStopHint, t.migrateBackup], () =>
			void this.runExclusive((client) => this.archiveVault(client, notes, total)),
		).open();
	}

	private async archiveVault(client: R2Client, notes: TFile[], total: number) {
		this.stopRequested = false;
		resetHostLimits();
		const stats = emptyStats();
		let done = 0;
		const progress = new Notice("", 0);
		const update = () => progress.setMessage(this.stopRequested ? t.stopping : t.archiveProgress(done, total));
		update();
		try {
			for (const note of notes) {
				if (this.stopRequested) break;
				await this.archiver.archiveNote(client, note, stats, {
					run: "vault",
					onImage: () => {
						done++;
						update();
					},
				});
			}
		} finally {
			progress.hide();
		}
		new ArchiveReportModal(this.app, stats, this.stopRequested).open();
		this.stopRequested = false;
	}
}
