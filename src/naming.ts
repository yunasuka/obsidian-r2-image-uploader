// Pure helpers: object keys, public URLs, MIME types and the Markdown we write into notes.

import { encodeKey } from "./sigv4";

export const IMAGE_MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	bmp: "image/bmp",
	svg: "image/svg+xml",
	avif: "image/avif",
};

const MIME_EXT: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/bmp": "bmp",
	"image/svg+xml": "svg",
	"image/avif": "avif",
};

export function isImageExt(ext: string): boolean {
	return ext.toLowerCase() in IMAGE_MIME;
}

export function mimeFromExt(ext: string): string {
	return IMAGE_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

export function extFromMime(mime: string, fallbackName = ""): string {
	const fromName = /\.([a-z0-9]+)$/i.exec(fallbackName)?.[1]?.toLowerCase();
	return MIME_EXT[mime.toLowerCase()] ?? (fromName === "jpeg" ? "jpg" : fromName) ?? "bin";
}

export const DEFAULT_KEY_TEMPLATE = "{hash}.{ext}";

export interface KeyVars {
	/** Hex digest of the uploaded bytes. */
	hash: string;
	ext: string;
	/** Original file name without extension. */
	name: string;
	date: Date;
}

/** Keeps names readable but safe for keys and URLs: no slashes, control chars or edge dots/spaces. */
export function sanitizeName(name: string): string {
	const cleaned = name
		.replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, "-")
		.replace(/\p{Cc}+/gu, "-")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-.]+|[-.]+$/g, "");
	return cleaned || "image";
}

/**
 * Placeholders: {hash} (16 hex chars), {hash:N}, {ext}, {name}, {year}, {month}, {day}, {timestamp}.
 */
export function renderKey(template: string, v: KeyVars): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	const key = (template.trim() || DEFAULT_KEY_TEMPLATE).replace(/\{(\w+)(?::(\d+))?\}/g, (all, name: string, len?: string) => {
		switch (name) {
			case "hash":
				return v.hash.slice(0, Math.min(Math.max(Number(len ?? 16), 8), v.hash.length));
			case "ext":
				return v.ext;
			case "name":
				return sanitizeName(v.name);
			case "year":
				return String(v.date.getFullYear());
			case "month":
				return pad(v.date.getMonth() + 1);
			case "day":
				return pad(v.date.getDate());
			case "timestamp":
				return String(v.date.getTime());
			default:
				return all;
		}
	});
	return key
		.split("/")
		.filter((s) => s && s !== "." && s !== "..")
		.join("/");
}

export function publicUrl(base: string, key: string): string {
	return `${base.trim().replace(/\/+$/, "")}/${encodeKey(key)}`;
}

const SIZE_RE = /^\d+(x\d+)?$/;

/** `![alt|size](url)`, the form Obsidian understands for remote images. */
export function imageMarkdown(url: string, alt = "", size = ""): string {
	const label = size ? `${alt}|${size}` : alt;
	return `![${label.replace(/[[\]]/g, "")}](${url})`;
}

/**
 * Turns an existing embed of a local image (wikilink or Markdown style) into a Markdown
 * image pointing at `url`, keeping alt text and display size.
 */
export function rewriteEmbed(original: string, url: string): string {
	if (original.startsWith("![[")) {
		// Inside tables the pipe is written as "\|" and has to stay escaped.
		const escaped = original.includes("\\|");
		const inner = original.slice(3, -2).replace(/\\\|/g, "|");
		const bar = inner.indexOf("|");
		const alias = bar >= 0 ? inner.slice(bar + 1).trim() : "";
		let md: string;
		if (!alias) md = imageMarkdown(url);
		else if (SIZE_RE.test(alias)) md = imageMarkdown(url, "", alias);
		else {
			const m = /^(.*)\|(\d+(?:x\d+)?)$/.exec(alias);
			md = m ? imageMarkdown(url, m[1].trim(), m[2]) : imageMarkdown(url, alias);
		}
		return escaped ? md.replace(/\|/g, "\\|") : md;
	}
	const m = /^!\[([^\]]*)\]/.exec(original);
	return `![${m ? m[1] : ""}](${url})`;
}
