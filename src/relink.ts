// Finding local image embeds in notes and rewriting them to R2 URLs.

import { App, EmbedCache, getLinkpath, TFile } from "obsidian";
import { isImageExt, rewriteEmbed } from "./naming";

interface ResolvedEmbed {
	embed: EmbedCache;
	target: TFile;
}

function resolveEmbeds(app: App, note: TFile): ResolvedEmbed[] {
	const out: ResolvedEmbed[] = [];
	for (const embed of app.metadataCache.getFileCache(note)?.embeds ?? []) {
		const path = getLinkpath(embed.link);
		let target = app.metadataCache.getFirstLinkpathDest(path, note.path);
		if (!target) {
			try {
				// Markdown-style embeds may be percent-encoded: ![](backup/a%20b.png)
				target = app.metadataCache.getFirstLinkpathDest(decodeURIComponent(path), note.path);
			} catch {
				// malformed escape, not a local file
			}
		}
		if (target && isImageExt(target.extension)) out.push({ embed, target });
	}
	return out;
}

/** Local images embedded in the given notes, and which of those notes embed them. */
export function collectLocalImages(app: App, notes: TFile[]): { images: TFile[]; notes: TFile[] } {
	const images = new Map<string, TFile>();
	const withImages: TFile[] = [];
	for (const note of notes) {
		const found = resolveEmbeds(app, note);
		if (!found.length) continue;
		withImages.push(note);
		for (const { target } of found) images.set(target.path, target);
	}
	return { images: [...images.values()], notes: withImages };
}

/** Notes that link to or embed any of the given files, according to the metadata cache. */
export function notesReferencing(app: App, paths: Set<string>): TFile[] {
	const out: TFile[] = [];
	for (const [source, links] of Object.entries(app.metadataCache.resolvedLinks)) {
		if (!Object.keys(links).some((p) => paths.has(p))) continue;
		const f = app.vault.getFileByPath(source);
		if (f) out.push(f);
	}
	return out;
}

/** Replaces embeds of uploaded files (path → URL) in one note. Returns how many were replaced. */
export async function rewriteNote(app: App, note: TFile, urls: Map<string, string>): Promise<number> {
	const hits = resolveEmbeds(app, note)
		.filter((h) => urls.has(h.target.path))
		.sort((a, b) => b.embed.position.start.offset - a.embed.position.start.offset);
	if (!hits.length) return 0;
	let count = 0;
	await app.vault.process(note, (content) => {
		let out = content;
		for (const { embed, target } of hits) {
			const replacement = rewriteEmbed(embed.original, urls.get(target.path)!);
			const { start, end } = embed.position;
			if (out.slice(start.offset, end.offset) === embed.original) {
				out = out.slice(0, start.offset) + replacement + out.slice(end.offset);
				count++;
			} else if (out.includes(embed.original)) {
				// The metadata cache lags behind an edit; fall back to a text match.
				out = out.replace(embed.original, () => replacement);
				count++;
			}
		}
		return out;
	});
	return count;
}

/**
 * Conservative check before trashing a local file: does any note or canvas still mention
 * its file name? False positives only mean a file is kept.
 */
export async function stillReferenced(app: App, file: TFile, candidates: TFile[]): Promise<boolean> {
	const names = [file.name, encodeURI(file.name), file.name.replace(/ /g, "%20")];
	const canvases = app.vault.getFiles().filter((f) => f.extension === "canvas");
	for (const f of [...candidates, ...canvases]) {
		const text = await app.vault.cachedRead(f);
		if (names.some((n) => text.includes(n))) return true;
	}
	return false;
}
