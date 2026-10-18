import { describe, expect, it } from "vitest";
import { extFromMime, publicUrl, renderKey, rewriteEmbed, sanitizeName } from "../src/naming";

const vars = { hash: "0123456789abcdef0123456789abcdef", ext: "webp", name: "Pasted image 2026", date: new Date(2026, 0, 5, 9) };

describe("renderKey", () => {
	it("default template", () => expect(renderKey("{hash}.{ext}", vars)).toBe("0123456789abcdef.webp"));
	it("date folders and name", () =>
		expect(renderKey("img/{year}/{month}/{day}/{name}-{hash:8}.{ext}", vars)).toBe("img/2026/01/05/Pasted-image-2026-01234567.webp"));
	it("drops empty and dot segments", () => expect(renderKey("/a//../{hash:8}.{ext}", vars)).toBe("a/01234567.webp"));
	it("empty template falls back", () => expect(renderKey("  ", vars)).toBe("0123456789abcdef.webp"));
});

describe("helpers", () => {
	it("sanitizeName", () => {
		expect(sanitizeName("a/b:c?.png")).toBe("a-b-c-.png");
		expect(sanitizeName("..")).toBe("image");
	});
	it("extFromMime", () => {
		expect(extFromMime("image/jpeg")).toBe("jpg");
		expect(extFromMime("", "x.JPEG")).toBe("jpg");
		expect(extFromMime("", "noext")).toBe("bin");
	});
	it("publicUrl encodes but keeps slashes", () =>
		expect(publicUrl("https://img.example.com/", "a b/c.png")).toBe("https://img.example.com/a%20b/c.png"));
});

describe("rewriteEmbed", () => {
	const u = "https://img.example.com/x.webp";
	it("wikilink", () => expect(rewriteEmbed("![[Pasted image.png]]", u)).toBe(`![](${u})`));
	it("wikilink with size", () => expect(rewriteEmbed("![[a.png|300]]", u)).toBe(`![|300](${u})`));
	it("wikilink with alias and size", () => expect(rewriteEmbed("![[a.png|cat|300x200]]", u)).toBe(`![cat|300x200](${u})`));
	it("wikilink with alias", () => expect(rewriteEmbed("![[a.png|my cat]]", u)).toBe(`![my cat](${u})`));
	it("markdown keeps alt", () => expect(rewriteEmbed("![a cat|200](backup/a%20b.png)", u)).toBe(`![a cat|200](${u})`));
});
