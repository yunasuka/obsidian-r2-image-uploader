# R2 Image Uploader

[中文说明](README.zh.md)

Paste or drop an image into a note and it is uploaded to your own [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket; a public link is inserted instead of a local attachment. Existing local images can be moved to R2 with one command.

- **Paste & drop upload** with a placeholder while uploading
- **Never loses an image**: if the upload fails, the image is saved as a normal local attachment and re-uploaded automatically later (on startup, every 5 minutes, and when the network comes back), then the link is rewritten
- **Content-hash file names** (`{hash}.{ext}` by default): the same image is stored once, links never change
- **Optional WebP conversion** before upload (kept only if it is actually smaller; GIF/SVG untouched)
- **Upload local images** of the current note, or of the whole vault (with a preview of what will change); embed size and alt text are kept (`![[a.png|300]]` → `![|300](https://…)`)
- **Credentials stay on the device**: keys live in Obsidian's secret storage, not in `data.json`, so they are not synced with the vault
- Works on desktop and mobile; no dependencies, small SigV4 signer on Web Crypto; uses Obsidian's `requestUrl`, so the bucket needs no CORS rules

## Setup

1. **Create a bucket** in the Cloudflare dashboard (R2 Object Storage → Create bucket).
2. **Make it publicly readable**: bucket → Settings → Custom Domains → connect a (sub)domain on Cloudflare, e.g. `img.example.com`. The `r2.dev` URL also works but is rate limited and meant for testing.
3. **Create an API token**: R2 → Manage API tokens → Create Account API token → permission *Object Read & Write*, limited to that bucket. Copy the *Access Key ID* and *Secret Access Key*.
4. In Obsidian: Settings → R2 Image Uploader (the vault-wide upload is also available there under *Tools*). Fill in Account ID, bucket, the two keys and the public URL, then press **Test** (it uploads a small file, reads it back through the public URL and deletes it).

## Commands

| Command | What it does |
|---|---|
| Upload local images in current note | Uploads every local image embedded in the active note and rewrites those embeds |
| Upload all local images in vault… | Same for every note, after showing how many images / notes are affected |
| Retry failed uploads | Re-uploads images that were saved locally because an upload failed |

After uploading through these commands, local files are kept by default. Set *After uploading local files* to *Move to trash* to remove them; a file is only trashed when no note or canvas mentions it any more.

## File name template

Default `{hash}.{ext}`. Placeholders: `{hash}` (first 16 hex chars of the SHA-256 of the uploaded bytes), `{hash:N}`, `{ext}`, `{name}` (original file name), `{year}`, `{month}`, `{day}`, `{timestamp}`. Slashes create folders, e.g. `notes/{year}/{month}/{hash}.{ext}`.

With `{hash}` in the template an image that already exists is not uploaded again. Without it, an existing object with the same name is never overwritten; a timestamp is appended instead.

## Privacy and security

- **Network use**: the plugin only talks to your R2 S3 endpoint (`https://<account id>.r2.cloudflarestorage.com` or the endpoint you set) and to your public URL (only for *Test connection*). No telemetry.
- **Uploaded images are public to anyone who has the link.** R2 does not let visitors list a bucket, and hash names cannot be guessed, but do not upload anything you would not share by link.
- Keys are stored with Obsidian's secret storage on each device by default (you enter them once per device). Optionally turn on *Sync keys with the vault*: the keys are then kept in plain text in the plugin's `data.json` and reach your other devices together with the plugin (Obsidian Sync with community plugins enabled, a file sync tool, git…). Only do that if the sync is private. Either way, use a token that is limited to the image bucket.

## Development

```bash
npm install
npm run dev        # watch build to main.js
npm test           # unit tests (SigV4 against AWS test vectors, naming, link rewriting)
npm run build      # type check + production build
npm run install-vault -- /path/to/vault   # copy main.js + manifest.json into the vault
```

The R2 round-trip test (`test/r2.e2e.test.ts`) runs only when a `.env.local` with `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` exists.

Releases: push a tag equal to the version in `manifest.json` (e.g. `0.1.0`); the GitHub workflow builds and attaches `main.js` and `manifest.json` to a draft release.

## License

MIT
