import { Credentials, encodeKey, sha256Hex, signRequest } from "./sigv4";

export interface HttpRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: ArrayBuffer;
}

export interface HttpResponse {
	status: number;
	text: string;
}

/** Injected so the plugin can use Obsidian's requestUrl (no CORS) and tests can use fetch. */
export type HttpFn = (req: HttpRequest) => Promise<HttpResponse>;

export interface R2Config {
	accountId: string;
	bucket: string;
	credentials: Credentials;
	/** Optional S3 endpoint override, e.g. https://<account>.eu.r2.cloudflarestorage.com */
	endpoint?: string;
}

export class R2Error extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code?: string,
	) {
		super(message);
	}
}

export class R2Client {
	constructor(
		private readonly cfg: R2Config,
		private readonly http: HttpFn,
	) {}

	get endpoint(): string {
		const custom = this.cfg.endpoint?.trim().replace(/\/+$/, "");
		return custom || `https://${this.cfg.accountId.trim()}.r2.cloudflarestorage.com`;
	}

	private objectUrl(key: string): string {
		return `${this.endpoint}/${encodeURIComponent(this.cfg.bucket.trim())}/${encodeKey(key)}`;
	}

	private async send(
		method: string,
		key: string,
		opts: { body?: ArrayBuffer; bodyHash?: string; headers?: Record<string, string> } = {},
	): Promise<HttpResponse> {
		const url = this.objectUrl(key);
		const payloadHash = opts.bodyHash ?? (await sha256Hex(opts.body ?? new ArrayBuffer(0)));
		const signed = await signRequest({
			method,
			url,
			headers: {},
			payloadHash,
			credentials: this.cfg.credentials,
			region: "auto",
			service: "s3",
		});
		// Plain headers like content-type are sent unsigned, so nothing the HTTP stack
		// adds or rewrites can break the signature.
		return this.http({ url, method, headers: { ...signed, ...opts.headers }, body: opts.body });
	}

	private fail(action: string, res: HttpResponse): never {
		const code = /<Code>([^<]+)<\/Code>/.exec(res.text)?.[1];
		const msg = /<Message>([^<]+)<\/Message>/.exec(res.text)?.[1];
		throw new R2Error(`${action} failed: HTTP ${res.status}${code ? ` ${code}` : ""}${msg ? ` (${msg})` : ""}`, res.status, code);
	}

	async exists(key: string): Promise<boolean> {
		const res = await this.send("HEAD", key);
		if (res.status === 200) return true;
		if (res.status === 404) return false;
		this.fail("HEAD", res);
	}

	async put(key: string, body: ArrayBuffer, contentType: string, opts: { bodyHash?: string; cacheControl?: string } = {}): Promise<void> {
		const headers: Record<string, string> = { "content-type": contentType };
		if (opts.cacheControl) headers["cache-control"] = opts.cacheControl;
		const res = await this.send("PUT", key, { body, bodyHash: opts.bodyHash, headers });
		if (res.status !== 200) this.fail("PUT", res);
	}

	async delete(key: string): Promise<void> {
		const res = await this.send("DELETE", key);
		if (res.status !== 204 && res.status !== 200) this.fail("DELETE", res);
	}
}
