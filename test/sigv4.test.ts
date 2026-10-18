import { describe, expect, it } from "vitest";
import { sha256Hex, signRequest, uriEncode } from "../src/sigv4";

// Examples from the AWS docs ("Signature Calculations for the Authorization Header", S3)
// and the SigV4 test suite (get-vanilla).
const s3Creds = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };
const sig = (h: Record<string, string>) => /Signature=([0-9a-f]+)/.exec(h.authorization)![1];

describe("signRequest", () => {
	it("S3 GET object", async () => {
		const h = await signRequest({
			method: "GET",
			url: "https://examplebucket.s3.amazonaws.com/test.txt",
			headers: { Range: "bytes=0-9" },
			payloadHash: await sha256Hex(""),
			credentials: s3Creds,
			region: "us-east-1",
			service: "s3",
			date: new Date("2013-05-24T00:00:00Z"),
		});
		expect(h.authorization).toContain("SignedHeaders=host;range;x-amz-content-sha256;x-amz-date");
		expect(sig(h)).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
	});

	it("S3 PUT object with an encoded key", async () => {
		const body = new TextEncoder().encode("Welcome to Amazon S3.");
		const h = await signRequest({
			method: "PUT",
			url: "https://examplebucket.s3.amazonaws.com/" + uriEncode("test$file.text"),
			headers: { Date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY" },
			payloadHash: await sha256Hex(body.buffer),
			credentials: s3Creds,
			region: "us-east-1",
			service: "s3",
			date: new Date("2013-05-24T00:00:00Z"),
		});
		expect(sig(h)).toBe("98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
	});

	it("S3 GET with query string", async () => {
		const h = await signRequest({
			method: "GET",
			url: "https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J",
			headers: {},
			payloadHash: await sha256Hex(""),
			credentials: s3Creds,
			region: "us-east-1",
			service: "s3",
			date: new Date("2013-05-24T00:00:00Z"),
		});
		expect(sig(h)).toBe("34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7");
	});
});
