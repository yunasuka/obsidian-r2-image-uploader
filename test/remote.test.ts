import { describe, expect, it } from "vitest";
import { findRemoteImages, isAnimatedPng, nameFromUrl, replaceRemoteImages, sniffImage } from "../src/remote";

const urls = (text: string, own?: (u: string) => boolean) => findRemoteImages(text, own).map((i) => i.url);

describe("findRemoteImages", () => {
	it("markdown images with titles, angle brackets and parentheses", () => {
		const text = [
			"![a](https://pbs.twimg.com/media/X?format=jpg&name=orig)",
			'![b](https://example.com/a.png "title")',
			"![c](<https://example.com/with space.png>)",
			"![d](https://en.wikipedia.org/wiki/File:A_(b).png)",
			"[![e](https://example.com/badge.svg)](https://example.com)",
		].join("\n");
		expect(urls(text)).toEqual([
			"https://pbs.twimg.com/media/X?format=jpg&name=orig",
			"https://example.com/a.png",
			"https://example.com/with space.png",
			"https://en.wikipedia.org/wiki/File:A_(b).png",
			"https://example.com/badge.svg",
		]);
	});

	it("html img with entities", () => {
		expect(urls('<p><img alt="x" src="https://a.com/i.png?x=1&amp;y=2" width="300"></p>')).toEqual(["https://a.com/i.png?x=1&y=2"]);
	});

	it("html img uses src, not data-src", () => {
		const text = '<img data-src="https://a.com/lazy.png" src="https://a.com/shown.png">';
		const [img] = findRemoteImages(text);
		expect(img.url).toBe("https://a.com/shown.png");
		expect(text.slice(img.start, img.end)).toBe("https://a.com/shown.png");
		expect(urls('<img data-src="https://a.com/lazy.png">')).toEqual([]);
	});

	it("skips local images, plain links, code and own URLs", () => {
		const text = [
			"![[local.png]]",
			"![x](backup/a.png)",
			"[link](https://example.com/a.png)",
			"`![x](https://example.com/inline.png)`",
			"```",
			"![x](https://example.com/fenced.png)",
			"```",
			"![x](https://img.mine.dev/abc.webp)",
			"![x](https://example.com/after.png)",
		].join("\n");
		expect(urls(text, (u) => u.startsWith("https://img.mine.dev/"))).toEqual(["https://example.com/after.png"]);
	});

	it("ends fenced code at its closing line, with LF or CRLF", () => {
		const lines = ["```", "line 1", "![x](https://example.com/fenced.png)", "```", "![x](https://example.com/a.png)", "```", "```", "![x](https://example.com/b.png)"];
		for (const eol of ["\n", "\r\n"]) {
			expect(urls(lines.join(eol))).toEqual(["https://example.com/a.png", "https://example.com/b.png"]);
			expect(urls(["~~~", "![x](https://example.com/open.png)", ""].join(eol))).toEqual([]);
		}
	});

	it("replace keeps everything else", () => {
		const text = '前 ![a](https://x.com/1.png "t") 中 <img src="https://x.com/2.png?a=1&amp;b=2"> 后 ![b](https://x.com/3.png)';
		const map = new Map([
			["https://x.com/1.png", "https://img.mine.dev/1.webp"],
			["https://x.com/2.png?a=1&b=2", "https://img.mine.dev/2.webp"],
		]);
		expect(replaceRemoteImages(text, findRemoteImages(text), map)).toBe(
			'前 ![a](https://img.mine.dev/1.webp "t") 中 <img src="https://img.mine.dev/2.webp"> 后 ![b](https://x.com/3.png)',
		);
	});
});

describe("helpers", () => {
	const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(20).fill(0)]).buffer;
	it("sniffImage", () => {
		expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47))).toBe("image/png");
		expect(sniffImage(bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg");
		expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ").buffer)).toBe("image/webp");
		expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>').buffer)).toBe("image/svg+xml");
		expect(sniffImage(new TextEncoder().encode("<!doctype html><html>").buffer, "image/png")).toBeNull();
	});
	it("isAnimatedPng", () => {
		const chunk = (type: string, len = 0) => [0, 0, 0, len, ...new TextEncoder().encode(type), ...new Array<number>(len + 4).fill(0)];
		const png = (...chunks: number[][]) => bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunks.flat());
		expect(isAnimatedPng(png(chunk("IHDR", 13), chunk("acTL", 8), chunk("IDAT", 2), chunk("IEND")))).toBe(true);
		expect(isAnimatedPng(png(chunk("IHDR", 13), chunk("IDAT", 2), chunk("IEND")))).toBe(false);
		expect(isAnimatedPng(png(chunk("IHDR", 13), chunk("IDAT", 2), chunk("acTL", 8)))).toBe(false);
		expect(isAnimatedPng(png(chunk("IHDR", 13)).slice(0, 20))).toBe(false);
	});
	it("nameFromUrl", () => {
		expect(nameFromUrl("https://pbs.twimg.com/media/GxAbC?format=jpg")).toBe("GxAbC");
		expect(nameFromUrl("https://a.com/%E5%9B%BE.png")).toBe("图.png");
		expect(nameFromUrl("https://a.com/")).toBe("image");
	});
});
