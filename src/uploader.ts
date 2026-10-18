import { extFromMime, publicUrl, renderKey } from "./naming";
import { R2Client } from "./r2";
import { sha256Hex } from "./sigv4";

const CONVERTIBLE = new Set(["image/png", "image/jpeg", "image/bmp"]);
// Keys are content hashes by default, so the bytes behind a URL never change.
const IMMUTABLE = "public, max-age=31536000, immutable";

export interface UploadOptions {
	publicUrl: string;
	keyTemplate: string;
	convertToWebp: boolean;
	webpQuality: number;
}

/** Re-encodes with a canvas. Returns null when the platform can't encode WebP (older iOS). */
export async function toWebp(data: ArrayBuffer, mime: string, quality: number): Promise<ArrayBuffer | null> {
	const bitmap = await createImageBitmap(new Blob([data], { type: mime }));
	try {
		const canvas = createEl("canvas");
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.drawImage(bitmap, 0, 0);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
		return blob && blob.type === "image/webp" ? blob.arrayBuffer() : null;
	} finally {
		bitmap.close();
	}
}

/** Converts (optionally), names and uploads one image; returns its public URL. */
export async function uploadImage(client: R2Client, opts: UploadOptions, data: ArrayBuffer, mime: string, fileName: string): Promise<string> {
	let body = data;
	let type = mime;
	if (opts.convertToWebp && CONVERTIBLE.has(mime)) {
		try {
			const webp = await toWebp(data, mime, opts.webpQuality);
			if (webp && webp.byteLength < data.byteLength) {
				body = webp;
				type = "image/webp";
			}
		} catch (e) {
			console.warn("R2 Image Uploader: WebP conversion failed, uploading original", e);
		}
	}
	const hash = await sha256Hex(body);
	const name = fileName.replace(/\.[^.]+$/, "");
	let key = renderKey(opts.keyTemplate, { hash, ext: extFromMime(type, fileName), name, date: new Date() });
	const hashed = /\{hash(:\d+)?\}/.test(opts.keyTemplate.trim() || "{hash}");
	const exists = await client.exists(key);
	if (hashed) {
		// Same key means same content: the image is already there.
		if (exists) return publicUrl(opts.publicUrl, key);
	} else if (exists) {
		// Never overwrite a different image that happens to share the name (e.g. "image.png").
		key = key.replace(/(\.[^./]+)?$/, (ext) => `-${Date.now()}${ext}`);
	}
	await client.put(key, body, type, { bodyHash: hash, cacheControl: hashed ? IMMUTABLE : undefined });
	return publicUrl(opts.publicUrl, key);
}
