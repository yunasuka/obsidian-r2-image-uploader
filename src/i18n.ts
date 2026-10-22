import { getLanguage } from "obsidian";

const en = {
	uploading: "Uploading",
	notConfigured: "Cloudflare Image Uploader: fill in the R2 settings first.",
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
	accessKeyId: "Access key ID",
	secretAccessKey: "Secret access key",
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
	webpDesc: "PNG / JPEG / BMP are converted before upload; the original is kept if WebP is not smaller. GIF, SVG and animated PNG are never converted.",
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

	cmdArchiveNote: "Save web images in current note to R2",
	cmdArchiveVault: "Save web images in all notes to R2…",
	cmdStop: "Stop the running job",
	noRemoteImages: "R2: no web images to save.",
	scanning: "R2: scanning notes…",
	archiveTitle: "Save web images to R2",
	archiveSummary: (images: number, notes: number) => `${images} web image(s) in ${notes} note(s) will be downloaded, uploaded to your bucket, and the notes will point to your copies.`,
	archiveExplain: "Images that can no longer be downloaded keep their original link and are listed at the end.",
	archiveStopHint: "This can take a while. Use the command “Stop the running job” to stop; finished notes stay done, and running it again continues with the rest.",
	archiveProgress: (done: number, total: number) => `R2: saving web images ${done}/${total}…`,
	stopping: "R2: stopping after the current note…",
	archiveDone: (saved: number, notes: number, failed: number) =>
		`Saved ${saved} image(s), updated ${notes} note(s).` + (failed ? ` ${failed} image(s) could not be downloaded.` : ""),
	archiveCancelled: "(stopped early)",
	archiveReportTitle: "Web images saved",
	archiveFailedHint: "These kept their original link (usually the source has deleted them or blocks downloads):",
	archiveMore: (n: number) => `…and ${n} more. Use “Copy list” for everything.`,
	copyList: "Copy list",
	copied: "Copied.",
	autoArchived: (saved: number, note: string, failed: number) => `R2: saved ${saved} web image(s) in “${note}”` + (failed ? `, ${failed} failed` : ""),

	secRemote: "Web images",
	autoArchive: "Save web images of new notes automatically (this device)",
	autoArchiveDesc:
		"New notes (clipped or synced from another device) get their web images saved to R2. Per device: one computer that is often on is enough.",
	archiveFolders: "Only these folders",
	archiveFoldersDesc: "Comma separated. Empty: whole vault.",
	wholeVault: "Whole vault",
	archiveOnPaste: "Save web images after pasting from a web page",
	archiveOnPasteDesc: "When you paste part of a web page into a note, its images are saved to R2 right after.",
	givenUp: (n: number) => `${n} web image(s) failed twice and are skipped by automatic runs (manual commands still try them).`,
	clearFailures: "Clear",
	archiveVaultDesc: "Downloads the web images in every note into R2 and rewrites the links. Shows a summary first.",
	cmdRestore: "Restore original web links in current note",
	nothingToRestore: "R2: no saved web images with a known original link in this note.",
	restored: (n: number) => `R2: restored ${n} original link(s). Your R2 copies are kept.`,
	sourcesRecorded: (n: number) => `The original web address of ${n} saved image(s) is recorded; “Restore original web links in current note” puts them back.`,
	reason: (raw: string) => {
		const code = Number(/HTTP (\d+)/.exec(raw)?.[1]);
		if (code === 404 || code === 410) return `deleted (${code})`;
		if (code === 401 || code === 403) return `download refused (${code})`;
		if (code === 429) return "rate limited, will retry next run";
		if (code >= 500) return `server error (${code}), will retry next run`;
		if (raw.startsWith("too large")) return raw;
		return code ? `HTTP ${code}` : `network error, will retry next run (${raw})`;
	},
};

const zh: typeof en = {
	uploading: "上传中",
	notConfigured: "Cloudflare Image Uploader：请先在设置里填好 R2 信息。",
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
	webpDesc: "PNG / JPEG / BMP 上传前转成 WebP，转完没变小就传原图。GIF、SVG 和动态 PNG 不转。",
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

	cmdArchiveNote: "把当前笔记的网络图片转存到 R2",
	cmdArchiveVault: "把所有笔记的网络图片转存到 R2…",
	cmdStop: "停止正在进行的任务",
	noRemoteImages: "R2：没有需要转存的网络图片。",
	scanning: "R2：正在扫描笔记…",
	archiveTitle: "把网络图片转存到 R2",
	archiveSummary: (images, notes) => `将下载 ${images} 张网络图片（在 ${notes} 篇笔记里），传到你的存储桶，并把笔记里的链接改成你自己的。`,
	archiveExplain: "已经下载不到的图片保留原链接，最后会列出清单。",
	archiveStopHint: "可能要跑一段时间。想停就运行命令「停止正在进行的任务」；已经处理完的笔记不受影响，再运行一次会接着处理剩下的。",
	archiveProgress: (done, total) => `R2：正在转存网络图片 ${done}/${total}…`,
	stopping: "R2：处理完当前笔记就停…",
	archiveDone: (saved, notes, failed) => `转存了 ${saved} 张图，改了 ${notes} 篇笔记。` + (failed ? `${failed} 张下载不到。` : ""),
	archiveCancelled: "（中途停止）",
	archiveReportTitle: "网络图片转存结果",
	archiveFailedHint: "下面这些保留了原链接（一般是原网站已经删图或者不让下载）：",
	archiveMore: (n) => `……还有 ${n} 条，点「复制清单」可以拿到全部。`,
	copyList: "复制清单",
	copied: "已复制。",
	autoArchived: (saved, note, failed) => `R2：已转存「${note}」里的 ${saved} 张网络图片` + (failed ? `，${failed} 张失败` : ""),

	secRemote: "网络图片",
	autoArchive: "新笔记自动转存网络图片（本设备）",
	autoArchiveDesc:
		"新笔记（剪藏或从其他设备同步来）里的网络图片自动转存到 R2。只对本设备生效，一台常开的电脑打开即可。",
	archiveFolders: "只处理这些文件夹",
	archiveFoldersDesc: "多个用逗号隔开，留空为整个库。",
	wholeVault: "整个库",
	archiveOnPaste: "粘贴网页内容后自动转存",
	archiveOnPasteDesc: "从网页复制一段内容粘贴进笔记后，马上把里面的图片转存到 R2。",
	givenUp: (n) => `有 ${n} 张网络图片已经失败两次，自动转存会跳过它们（手动命令仍会再试）。`,
	clearFailures: "清空",
	archiveVaultDesc: "把所有笔记里的网络图片下载下来存进 R2，并改写链接。执行前会先显示数量。",
	cmdRestore: "把当前笔记的图片换回原网络链接",
	nothingToRestore: "R2：这篇笔记里没有记录过原链接的转存图片。",
	restored: (n) => `R2：换回了 ${n} 个原链接，R2 里的副本仍然保留。`,
	sourcesRecorded: (n) => `已记录 ${n} 张转存图片的原网络地址，用命令「把当前笔记的图片换回原网络链接」可以换回去。`,
	reason: (raw) => {
		const code = Number(/HTTP (\d+)/.exec(raw)?.[1]);
		if (code === 404 || code === 410) return `已删除（${code}）`;
		if (code === 401 || code === 403) return `不让下载（${code}）`;
		if (code === 429) return "请求太频繁被限流，下次再试";
		if (code >= 500) return `对方服务器出错（${code}），下次再试`;
		if (raw.startsWith("too large")) return "文件太大（超过 50MB）";
		return code ? `HTTP ${code}` : `连不上，下次再试（${raw}）`;
	},
};

export const t: typeof en = getLanguage().toLowerCase().startsWith("zh") ? zh : en;
