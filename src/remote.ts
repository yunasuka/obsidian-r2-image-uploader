// Pure helpers for remote (http/https) images inside note text.

export interface RemoteImage {
	/** Offsets of the URL text inside the note (what gets replaced). */
	start: number;
	end: number;
	/** URL to download (HTML entities decoded for <img src>). */
	url: string;
}

const MD_IMAGE = /!\[((?:[^[\]\n]|\[[^\]\n]*\])*)\]\(\s*(<[^>\n]+>|(?:[^()\s]|\([^()\s]*\))+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
const HTML_IMG = /<img\b[^>]*?\bsrc\s*=\s*(["'])([^"'\n]*?)\1[^>]*>/gi;
// Runs to the closing fence line, or to the end of the note if never closed. Notes may use CRLF.
const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n(?:(?:[^\n]*\n)*? {0,3}\1[`~]*[ \t]*\r?$|[\s\S]*)/gm;
const INLINE_CODE = /`[^`\n]+`/g;

function codeRanges(text: string): [number, number][] {
	const ranges: [number, number][] = [];
	for (const re of [FENCE, INLINE_CODE]) {
		re.lastIndex = 0;
		for (let m; (m = re.exec(text)); ) ranges.push([m.index, m.index + m[0].length]);
	}
	return ranges;
}

function decodeEntities(s: string): string {
	return s.replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Remote images in Markdown `![](url)` and HTML `<img src>` form, outside code. Sorted by position. */
export function findRemoteImages(text: string, isOwn: (url: string) => boolean = () => false): RemoteImage[] {
	const code = codeRanges(text);
	const inCode = (i: number) => code.some(([a, b]) => i >= a && i < b);
	const out: RemoteImage[] = [];
	const push = (start: number, raw: string, url: string) => {
		if (!/^https?:\/\//i.test(url) || isOwn(url) || inCode(start)) return;
		out.push({ start, end: start + raw.length, url });
	};

	MD_IMAGE.lastIndex = 0;
	for (let m; (m = MD_IMAGE.exec(text)); ) {
		let raw = m[2];
		let offset = m.index + m[0].indexOf(raw, 2 + m[1].length);
		if (raw.startsWith("<")) {
			raw = raw.slice(1, -1);
			offset += 1;
		}
		push(offset, raw, raw);
	}
	HTML_IMG.lastIndex = 0;
	for (let m; (m = HTML_IMG.exec(text)); ) {
		const raw = m[2];
		push(m.index + m[0].indexOf(raw, m[0].search(/\bsrc\s*=/i)), raw, decodeEntities(raw));
	}
	return out.sort((a, b) => a.start - b.start);
}

/** Replaces the URLs that have a mapping; others are left alone. */
export function replaceRemoteImages(text: string, images: RemoteImage[], map: Map<string, string>): string {
	let out = text;
	for (const img of [...images].sort((a, b) => b.start - a.start)) {
		const to = map.get(img.url);
		if (to) out = out.slice(0, img.start) + to + out.slice(img.end);
	}
	return out;
}

/** Identifies image bytes by their signature; servers often send a wrong or generic Content-Type. */
export function sniffImage(buf: ArrayBuffer, contentType = ""): string | null {
	const b = new Uint8Array(buf.slice(0, 64));
	const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
	if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
	if (ascii(0, 4) === "GIF8") return "image/gif";
	if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
	if (ascii(4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(8, 12))) return "image/avif";
	if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
	const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 512))).trimStart().toLowerCase();
	if (contentType.includes("svg") || head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
	return null;
}

/** APNG shares the PNG signature; it has an acTL chunk before the first IDAT. Re-encoding would keep only frame one. */
export function isAnimatedPng(buf: ArrayBuffer): boolean {
	const view = new DataView(buf);
	for (let i = 8; i + 8 <= buf.byteLength; ) {
		const type = String.fromCharCode(...new Uint8Array(buf, i + 4, 4));
		if (type === "acTL") return true;
		if (type === "IDAT" || type === "IEND") return false;
		i += 12 + view.getUint32(i);
	}
	return false;
}

/** A readable file name for {name}, from the last path segment of the URL. */
export function nameFromUrl(url: string): string {
	try {
		const seg = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
		return decodeURIComponent(seg) || "image";
	} catch {
		return "image";
	}
}
