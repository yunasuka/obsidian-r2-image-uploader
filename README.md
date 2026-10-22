# Cloudflare Image Uploader

[中文说明](README.zh.md)

Saves the web images in your notes to your own [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket and points the links at your copy, so they stay when the source deletes them. Pasted and dropped images are uploaded too.

## Features

**Web images**
- **Automatic**: a few seconds after a new note appears (clipped, or synced from another device), its web images are saved. Off by default, set per device; one computer that is often on is enough. Can be limited to some folders.
- **After pasting** part of a web page.
- **Commands** for the current note or all notes. Images that can't be downloaded keep their link and are listed at the end.
- **Original addresses are recorded**; *Restore original web links in current note* switches back.
- At most 2 requests per site, waits when rate limited. Links in code blocks are left alone.

**Local images**
- **Paste & drop upload.** If an upload fails, the image is saved as an attachment and uploaded later.
- **Upload existing local images** of the current note or the whole vault; size and alt text are kept (`![[a.png|300]]` → `![|300](https://…)`).

**General**
- File names are content hashes (`{hash}.{ext}`): each image is stored once.
- Optional WebP conversion, kept only if smaller (GIF, SVG and animated PNG unchanged).
- Nothing is ever deleted from R2.
- Desktop and mobile. The bucket needs no CORS rules.

## Setup

1. Cloudflare dashboard → R2 → **Create bucket**.
2. Bucket → Settings → **Custom Domains**: connect a domain on Cloudflare, e.g. `img.example.com` (`r2.dev` is rate limited, for testing only).
3. R2 → **Manage API tokens** → Create Account API token, permission *Object Read & Write*, limited to the bucket.
4. Obsidian → Settings → Cloudflare Image Uploader: fill in Account ID, bucket, the two keys and the public URL, then **Test connection**.
5. Under *Web images*, turn on automatic saving on the device you want.

## Commands

The vault-wide ones are also under *Tools* in the settings.

| Command | What it does |
|---|---|
| Save web images in current note to R2 | Saves the note's web images and rewrites the links |
| Save web images in all notes to R2… | Same for all notes, after a summary |
| Upload local images in current note | Uploads the note's local images and rewrites the embeds |
| Upload all local images in vault… | Same for all notes, after a summary |
| Retry failed uploads | Uploads images kept locally after a failed upload |
| Restore original web links in current note | Switches saved images back to their web addresses |
| Stop the running job | Stops after the current note; run again to continue |

Automatic runs skip images that failed twice (manual commands still try; the count can be cleared in settings). Rate limits and network errors don't count.

Local files are kept after upload. With *After uploading local files* → *Move to trash*, a file is trashed only when no note or canvas mentions it.

## File name template

Default `{hash}.{ext}`. Placeholders: `{hash}` (first 16 hex chars of the SHA-256), `{hash:N}`, `{ext}`, `{name}`, `{year}`, `{month}`, `{day}`, `{timestamp}`. Slashes make folders: `notes/{year}/{month}/{hash}.{ext}`.

With `{hash}`, existing images aren't uploaded again. Without it, an object with the same name is never overwritten; a timestamp is appended.

## Privacy and security

- Connects only to your R2 endpoint, your public URL (*Test connection*), and the sites hosting the images in your notes. No telemetry.
- **Uploaded images are public to anyone with the link.** Buckets can't be listed and hash names can't be guessed.
- Keys are kept in Obsidian's secret storage on each device. *Sync keys with the vault* stores them in plain text in `data.json` instead; use it only with a private sync. Use a token limited to the image bucket.
- Saved web images are for your own archive; respect the authors' rights.

## Development

```bash
npm install
npm run dev        # watch build
npm test           # unit tests
npm run build      # type check + production build
npm run install-vault -- /path/to/vault
```

`test/r2.e2e.test.ts` runs against a real bucket when `.env.local` has `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

Release: bump the version in `manifest.json`, `package.json` and `versions.json`, `npm run build`, then:

```bash
gh release create 1.0.1 main.js manifest.json styles.css --title 1.0.1 --notes "..."
```

## License

MIT
