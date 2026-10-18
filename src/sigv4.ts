// AWS Signature Version 4, just enough for the S3 API that R2 speaks.
// Uses only Web Crypto, so it runs on desktop and mobile (and in Node for tests).

const encoder = new TextEncoder();

export interface Credentials {
	accessKeyId: string;
	secretAccessKey: string;
}

export interface SignParams {
	method: string;
	/** Fully encoded URL; its path is used verbatim as the canonical URI (S3 does not normalize). */
	url: string;
	/** Headers to sign besides `host`. Names are case-insensitive. */
	headers: Record<string, string>;
	/** Hex SHA-256 of the body, or "UNSIGNED-PAYLOAD". */
	payloadHash: string;
	credentials: Credentials;
	region: string;
	service: string;
	date?: Date;
}

export function toHex(buf: ArrayBuffer): string {
	return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
	const bytes = typeof data === "string" ? encoder.encode(data) : data;
	return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
	const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return crypto.subtle.sign("HMAC", k, encoder.encode(data));
}

/** RFC 3986 encoding as required by SigV4 (encodeURIComponent leaves !'()* alone). */
export function uriEncode(s: string): string {
	return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Encode an object key for use in a URL path, keeping the slashes. */
export function encodeKey(key: string): string {
	return key.split("/").map(uriEncode).join("/");
}

function amzDate(d: Date): string {
	return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalQuery(params: URLSearchParams): string {
	return [...params.entries()]
		.map(([k, v]) => [uriEncode(k), uriEncode(v)])
		.sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
		.map(([k, v]) => `${k}=${v}`)
		.join("&");
}

/**
 * Returns the headers to send: the given ones plus `x-amz-date`, `x-amz-content-sha256`
 * and `authorization`. `host` is signed but not returned; the HTTP stack sets it.
 */
export async function signRequest(p: SignParams): Promise<Record<string, string>> {
	const url = new URL(p.url);
	const datetime = amzDate(p.date ?? new Date());
	const day = datetime.slice(0, 8);

	const headers: Record<string, string> = {};
	for (const [k, v] of Object.entries(p.headers)) headers[k.toLowerCase()] = v;
	headers["x-amz-date"] = datetime;
	headers["x-amz-content-sha256"] = p.payloadHash;

	const all: Record<string, string> = { ...headers, host: url.host };
	const names = Object.keys(all).sort();
	const canonicalHeaders = names.map((n) => `${n}:${all[n].trim().replace(/\s+/g, " ")}\n`).join("");
	const signedHeaders = names.join(";");

	const canonicalRequest = [
		p.method.toUpperCase(),
		url.pathname || "/",
		canonicalQuery(url.searchParams),
		canonicalHeaders,
		signedHeaders,
		p.payloadHash,
	].join("\n");

	const scope = `${day}/${p.region}/${p.service}/aws4_request`;
	const stringToSign = ["AWS4-HMAC-SHA256", datetime, scope, await sha256Hex(canonicalRequest)].join("\n");

	let key = await hmac(encoder.encode("AWS4" + p.credentials.secretAccessKey), day);
	key = await hmac(key, p.region);
	key = await hmac(key, p.service);
	key = await hmac(key, "aws4_request");
	const signature = toHex(await hmac(key, stringToSign));

	headers["authorization"] =
		`AWS4-HMAC-SHA256 Credential=${p.credentials.accessKeyId}/${scope}, ` +
		`SignedHeaders=${signedHeaders}, Signature=${signature}`;
	return headers;
}
