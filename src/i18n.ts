import { getLanguage } from "obsidian";

const en = {
	uploading: "Uploading",
	notConfigured: "R2 Image Uploader: fill in the R2 settings first.",
	uploadFailedSaved: (n: number) => `Upload failed, ${n} image(s) saved locally. They will be uploaded again automatically. `,
	retryDone: (ok: number, left: number) => `R2: re-uploaded ${ok} image(s)` + (left ? `, ${left} still waiting` : ""),
	noPending: "R2: nothing waiting to be uploaded.",
	noLocalImages: "R2: no local images found.",
	progress: (done: number, total: number) => `R2: uploading ${done}/${total}…`,
	migrateDone: (ok: number, failed: number, notes: number) =>
		`R2: uploaded ${ok} image(s), updated ${notes} note(s)` + (failed ? `, ${failed} failed (see console)` : ""),
	busy: "R2: another upload job is running, try again when it finishes.",

	cmdUploadNote: "Upload local images in current note",
	cmdUploadVault: "Upload all local images in vault…",
	cmdRetry: "Retry failed uploads",

	migrateTitle: "Upload all local images to R2",
	migrateSummary: (images: number, mb: string, notes: number) =>
		`${images} local image(s) (${mb} MB) embedded in ${notes} note(s) will be uploaded, and those embeds will be replaced with R2 links.`,
	migrateAfterKeep: "Local files are kept (see the “After uploading local files” setting).",
	migrateAfterTrash: "Local files that are no longer embedded anywhere will be moved to trash.",
	migrateBackup: "Notes are rewritten in place. Make a backup of the vault first if you are unsure.",
	start: "Start",
	cancel: "Cancel",

	secConnection: "Connection",
	accountId: "Account ID",
	accountIdDesc: "Found on the R2 overview page in the Cloudflare dashboard.",
	bucket: "Bucket",
	accessKeyId: "Access Key ID",
	secretAccessKey: "Secret Access Key",
	secretDesc: "Stored in Obsidian's secret storage on this device, not in the plugin's data.json, so it is not synced with the vault.",
	publicUrl: "Public URL",
	publicUrlDesc: "Custom domain (or r2.dev URL) of the bucket, e.g. https://img.example.com",
	endpoint: "S3 endpoint (optional)",
	endpointDesc: "Leave empty to use https://<account id>.r2.cloudflarestorage.com. Set it for EU / FedRAMP jurisdictions.",
	test: "Test connection",
	testDesc: "Uploads a small text file, reads it back through the public URL, then deletes it.",
	testRun: "Test",
	testOk: "Connection OK: upload, public URL and delete all work.",
	testPublicFail: (status: number) => `Upload works, but the public URL returned HTTP ${status}. Check the bucket's public access / custom domain.`,

	secUpload: "Uploading",
	onPaste: "Upload on paste",
	onDrop: "Upload on drop",
	onPasteDesc: "If the clipboard also contains text (e.g. copied from a spreadsheet), Obsidian's normal paste is used.",
	keyTemplate: "File name template",
	keyTemplateDesc:
		"Placeholders: {hash} (content hash, so the same image is stored once), {hash:N}, {ext}, {name}, {year}, {month}, {day}, {timestamp}. Slashes create folders.",
	webp: "Convert to WebP",
	webpDesc: "PNG / JPEG / BMP are converted before upload; the original is kept if WebP is not smaller. GIF and SVG are never converted.",
	webpQuality: "WebP quality",
	afterUpload: "After uploading local files",
	afterUploadDesc: "Applies to the upload commands. Files only go to trash when no note embeds them any more.",
	afterKeep: "Keep local file",
	afterTrash: "Move to trash",

	pendingCount: (n: number) => `${n} image(s) waiting for re-upload.`,

	syncSecrets: "Sync keys with the vault",
	syncSecretsDesc:
		"Off: keys stay in this device's secret storage and must be entered on every device. On: keys are saved in plain text in the plugin's data.json and travel with Obsidian Sync (or any file sync / git) together with the plugin. Only turn on if that sync is private, and use a token limited to the image bucket.",
	plainKeyDesc: "Saved in data.json (synced).",
	secTools: "Tools",
	uploadVaultDesc: "Uploads every local image embedded in your notes and rewrites the embeds. Shows a summary before anything changes.",
	open: "Open…",
};

const zh: typeof en = {
	uploading: "上传中",
	notConfigured: "R2 Image Uploader：请先在设置里填好 R2 信息。",
	uploadFailedSaved: (n) => `上传失败，${n} 张图先存在本地了，之后会自动补传。`,
	retryDone: (ok, left) => `R2：补传了 ${ok} 张图` + (left ? `，还有 ${left} 张待传` : ""),
	noPending: "R2：没有等待补传的图片。",
	noLocalImages: "R2：没有找到本地图片。",
	progress: (done, total) => `R2：正在上传 ${done}/${total}…`,
	migrateDone: (ok, failed, notes) => `R2：上传了 ${ok} 张图，改了 ${notes} 篇笔记` + (failed ? `，${failed} 张失败（详见控制台）` : ""),
	busy: "R2：另一个上传任务还在进行，等它结束再试。",

	cmdUploadNote: "上传当前笔记里的本地图片",
	cmdUploadVault: "上传整个库的本地图片…",
	cmdRetry: "补传上传失败的图片",

	migrateTitle: "把本地图片全部上传到 R2",
	migrateSummary: (images, mb, notes) => `将上传 ${images} 张本地图片（${mb} MB），涉及 ${notes} 篇笔记，这些笔记里的图片嵌入会改成 R2 链接。`,
	migrateAfterKeep: "本地文件会保留（见设置「上传本地文件后」）。",
	migrateAfterTrash: "不再被任何笔记引用的本地文件会移到回收站。",
	migrateBackup: "会直接改写笔记内容，不放心的话先备份一下库。",
	start: "开始",
	cancel: "取消",

	secConnection: "连接",
	accountId: "账户 ID（Account ID）",
	accountIdDesc: "在 Cloudflare 后台 R2 概览页可以找到。",
	bucket: "存储桶",
	accessKeyId: "访问密钥 ID（Access Key ID）",
	secretAccessKey: "机密访问密钥（Secret Access Key）",
	secretDesc: "保存在本机 Obsidian 的密钥存储里，不写进插件的 data.json，不会随库同步。",
	publicUrl: "公开访问地址",
	publicUrlDesc: "存储桶绑定的自定义域名（或 r2.dev 地址），例如 https://img.example.com",
	endpoint: "S3 接口地址（可选）",
	endpointDesc: "留空就用 https://<账户 ID>.r2.cloudflarestorage.com。欧盟等特殊辖区的桶才需要填。",
	test: "测试连接",
	testDesc: "上传一个小文本文件，通过公开地址读回来，再删掉。",
	testRun: "测试",
	testOk: "连接正常：上传、公开访问、删除都没问题。",
	testPublicFail: (status) => `上传成功，但公开地址返回 HTTP ${status}，请检查存储桶的公开访问 / 自定义域名。`,

	secUpload: "上传",
	onPaste: "粘贴时上传",
	onDrop: "拖入时上传",
	onPasteDesc: "如果剪贴板里同时有文字（比如从表格复制的），就按 Obsidian 原来的方式粘贴。",
	keyTemplate: "文件名模板",
	keyTemplateDesc:
		"可用占位符：{hash}（内容哈希，同一张图只存一份）、{hash:N}、{ext}、{name}、{year}、{month}、{day}、{timestamp}。用斜杠可以分文件夹。",
	webp: "转成 WebP",
	webpDesc: "PNG / JPEG / BMP 上传前转成 WebP，转完没变小就传原图。GIF 和 SVG 不转。",
	webpQuality: "WebP 质量",
	afterUpload: "上传本地文件后",
	afterUploadDesc: "用于上传命令。只有在没有任何笔记再引用它时，才会移到回收站。",
	afterKeep: "保留本地文件",
	afterTrash: "移到回收站",

	pendingCount: (n) => `有 ${n} 张图等待补传。`,

	syncSecrets: "密钥随库同步",
	syncSecretsDesc:
		"关：密钥存在本机 Obsidian 的密钥存储里，每台设备都要填一次。开：密钥以明文存进插件的 data.json，跟着插件一起被 Obsidian 同步（或网盘、git）带到其他设备。只在同步渠道是自己私有的情况下打开，并且用只能访问图床存储桶的令牌。",
	plainKeyDesc: "保存在 data.json 里（会同步）。",
	secTools: "工具",
	uploadVaultDesc: "把所有笔记里嵌入的本地图片上传到 R2 并改成链接。执行前会先显示要改动的数量。",
	open: "打开…",
};

export const t: typeof en = getLanguage().toLowerCase().startsWith("zh") ? zh : en;
