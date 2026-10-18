# R2 Image Uploader

[中文说明](README.zh.md)

Keep the images of your notes in your own [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket.

Clipped web pages only *link* to their images. When the author deletes the post or the site goes away, the pictures in your notes are gone too. This plugin downloads those images into your bucket and points the note at your copy. It also uploads images you paste or drop, so they don't bloat the vault.

## Features

**Web images (clipped articles)**
- **Automatic for new clippings**: when a note appears in a watched folder (default `Clippings`, where Obsidian Web Clipper saves), its web images are saved to R2 a few seconds later. Notes synced in from your phone are handled too. This is a per-device switch: turn it on on one computer that is usually running.
- **After pasting part of a web page**, its images are saved right away.
- **Commands** for the current note and for the whole vault (with a summary first and a report of images that could not be downloaded; those keep their original link).
- **The original address is remembered** for every saved image (in the plugin's `data.json`); the command *Restore original web links in current note* puts them back (your R2 copy stays).
- Polite downloading: at most 2 requests per site at a time, waits and retries when rate limited, a browser user agent and referer fallback for hotlink protection. Links inside code blocks are left alone.

**Local images**
- **Paste & drop upload** with a placeholder while uploading.
- **Never loses an image**: if the upload fails, the image is saved as a normal attachment and re-uploaded automatically later (on startup, every 5 minutes, when the network comes back), then the link is rewritten.
- **Upload local images** of the current note or the whole vault; embed size and alt text are kept (`![[a.png|300]]` → `![|300](https://…)`).

**General**
- **Content-hash file names** (`{hash}.{ext}` by default): the same image is stored once, links never change.
- **Optional WebP conversion** before upload (kept only if it is smaller; GIF/SVG untouched).
- Keys stay on the device by default (Obsidian secret storage); optional *Sync keys with the vault*.
- Desktop and mobile; no dependencies, small SigV4 signer on Web Crypto; uses Obsidian's `requestUrl`, so the bucket needs no CORS rules.

## Setup

1. **Create a bucket** in the Cloudflare dashboard (R2 Object Storage → Create bucket).
2. **Make it publicly readable**: bucket → Settings → Custom Domains → connect a (sub)domain on Cloudflare, e.g. `img.example.com`. The `r2.dev` URL also works but is rate limited and meant for testing.
3. **Create an API token**: R2 → Manage API tokens → Create Account API token → permission *Object Read & Write*, limited to that bucket. Copy the *Access Key ID* and *Secret Access Key*.
4. In Obsidian: Settings → R2 Image Uploader. Fill in Account ID, bucket, the two keys and the public URL, then press **Test** (it uploads a small file, reads it back through the public URL and deletes it).
5. Under *Web images*, turn on automatic saving on the device you want, and check the watched folders.

## How to use

Once set up, it mostly runs by itself. Typical cases:

**1. Clipping an article with Web Clipper**
Clip with Obsidian Web Clipper into `Clippings`. A few seconds later the plugin downloads the article's images into your R2 bucket and shows "saved … web image(s)". The note now points at your own domain, so it survives the original post being deleted.
> Turn on *Save web images of new notes automatically (this device)* under *Web images* first. With several devices, one computer that is usually running is enough; clippings made on your phone are handled after they sync.

**2. Copying part of a web page into a note**
Right after you paste, the images in the pasted part are saved.

**3. Screenshots and dropped images**
Paste a screenshot or drop an image file into a note: it is uploaded to R2 and a link is inserted, the file doesn't go into the vault. Offline, the image is kept locally and uploaded later.

**4. Older notes**
In the plugin settings, under *Tools*:
- *Save web images in all notes to R2…* saves the images of everything you clipped before. It shows how many images first and only starts when you press *Start*; at the end it lists images that could not be downloaded (usually deleted at the source).
- *Upload all local images in vault…* moves existing local images to R2.
For a single note, open it, press `Ctrl/Cmd + P`, search "R2" and use the *current note* command.

**5. Going back to the original links**
Open the note and run *Restore original web links in current note*. The R2 copy stays, so you can save it again any time.

**6. Does deleting a note delete its images?**
No. The plugin only adds images to R2 and never deletes them, so a note restored from trash still shows its images.

## Commands

The vault-wide ones are also in the plugin settings under *Tools*.

| Command | What it does |
|---|---|
| Save web images in current note to R2 | Downloads the note's web images into R2 and rewrites the links |
| Save web images in all notes to R2… | Same for every note, after a summary; shows what failed at the end |
| Upload local images in current note | Uploads local images embedded in the note and rewrites the embeds |
| Upload all local images in vault… | Same for every note, after a summary |
| Retry failed uploads | Re-uploads images saved locally because an upload failed |
| Restore original web links in current note | Swaps saved images back to the web addresses they came from |
| Stop the running job | Stops a vault-wide run after the current note; run again to continue |

Images that fail twice are skipped by automatic runs (manual commands still try them; the counter can be cleared in settings). Rate limits and network errors don't count as failures.

After uploading *local* files through the commands, they are kept by default. Set *After uploading local files* to *Move to trash* to remove them; a file is only trashed when no note or canvas mentions it any more.

## File name template

Default `{hash}.{ext}`. Placeholders: `{hash}` (first 16 hex chars of the SHA-256 of the uploaded bytes), `{hash:N}`, `{ext}`, `{name}` (original file name), `{year}`, `{month}`, `{day}`, `{timestamp}`. Slashes create folders, e.g. `notes/{year}/{month}/{hash}.{ext}`.

With `{hash}` in the template an image that already exists is not uploaded again. Without it, an existing object with the same name is never overwritten; a timestamp is appended instead.

## Privacy and security

- **Network use**: the plugin talks to your R2 S3 endpoint (`https://<account id>.r2.cloudflarestorage.com` or the endpoint you set), to your public URL (only for *Test connection*), and to the sites hosting the web images in your notes (only to download those images). No telemetry.
- **Uploaded images are public to anyone who has the link.** R2 does not let visitors list a bucket, and hash names cannot be guessed, but do not upload anything you would not share by link.
- Keys are stored with Obsidian's secret storage on each device by default (you enter them once per device). Optionally turn on *Sync keys with the vault*: the keys are then kept in plain text in the plugin's `data.json` and reach your other devices together with the plugin (Obsidian Sync with community plugins enabled, a file sync tool, git…). Only do that if the sync is private. Either way, use a token that is limited to the image bucket.
- Saved copies of web images are for your own archive; respect the rights of the original authors.

## Development

```bash
npm install
npm run dev        # watch build to main.js
npm test           # unit tests (SigV4 against AWS test vectors, naming, link parsing/rewriting)
npm run build      # type check + production build
npm run install-vault -- /path/to/vault   # copy main.js, manifest.json, styles.css into the vault
```

The R2 round-trip test (`test/r2.e2e.test.ts`) runs only when a `.env.local` with `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` exists.

Releases: bump `version` in `manifest.json`, `package.json` and `versions.json`, run `npm run build`, then create a GitHub release whose tag equals the version (e.g. `1.0.1`) with `main.js`, `manifest.json` and `styles.css` attached:

```bash
gh release create 1.0.1 main.js manifest.json styles.css --title 1.0.1 --notes "..."
```

## License

MIT
