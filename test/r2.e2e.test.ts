// Real round trip against R2. Runs only when .env.local has credentials (never in CI).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicUrl } from "../src/naming";
import { HttpFn, R2Client } from "../src/r2";

const env: Record<string, string> = {};
if (existsSync(".env.local"))
	for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
		const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
		if (m) env[m[1]] = m[2];
	}

const http: HttpFn = async (req) => {
	const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
	return { status: res.status, text: await res.text() };
};

describe.skipIf(!env.R2_SECRET_ACCESS_KEY)("R2 round trip", () => {
	const client = new R2Client(
		{ accountId: env.R2_ACCOUNT_ID, bucket: env.R2_BUCKET, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } },
		http,
	);
	const key = `_e2e/测试 ${Date.now()}.txt`;
	const body = new TextEncoder().encode("hello r2 " + key);

	it("put, head, public get, delete", async () => {
		expect(await client.exists(key)).toBe(false);
		await client.put(key, body.buffer, "text/plain; charset=utf-8", { cacheControl: "no-store" });
		expect(await client.exists(key)).toBe(true);
		const res = await fetch(publicUrl(env.R2_PUBLIC_URL, key));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("hello r2 " + key);
		await client.delete(key);
		expect(await client.exists(key)).toBe(false);
	}, 30000);

	it("bad secret is rejected", async () => {
		const bad = new R2Client(
			{ accountId: env.R2_ACCOUNT_ID, bucket: env.R2_BUCKET, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: "0".repeat(64) } },
			http,
		);
		await expect(bad.put("_e2e/x.txt", body.buffer, "text/plain")).rejects.toThrow(/403/);
	}, 30000);
});
