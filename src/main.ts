import { App, Editor, MarkdownFileInfo, MarkdownView, Modal, moment, Notice, Plugin, requestUrl, Setting, TFile } from "obsidian";
import { t } from "./i18n";
import { extFromMime, imageMarkdown, mimeFromExt } from "./naming";
import { HttpFn, R2Client } from "./r2";
import { collectLocalImages, notesReferencing, rewriteNote, stillReferenced } from "./relink";
import { DEFAULT_SETTINGS, R2SettingTab, R2UploaderSettings } from "./settings";
import { uploadImage, UploadOptions } from "./uploader";

const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const CONCURRENCY = 3;

// requestUrl goes through Electron / the native layer, so the bucket needs no CORS rules.
const obsidianHttp: HttpFn = async ({ url, method, headers, body }) => {
	const { "content-type": contentType, ...rest } = headers;
	const res = await requestUrl({ url, method, headers: rest, body, contentType, throw: false });
	let text = "";
	if (method !== "HEAD") {
		try {
			text = res.text;
		} catch {
			// empty or non-text body
		}
	}
	return { status: res.status, text };
};

function imageFiles(list: FileList | null | undefined): File[] {
	const files = Array.from(list ?? []);
	return files.length && files.every((f) => f.type.startsWith("image/")) ? files : [];
}

function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length) await fn(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

interface RelinkResult {
	urls: Map<string, string>;
	failed: { file: TFile; error: unknown }[];
	changedNotes: number;
}

export default class R2ImageUploader extends Plugin {
	settings!: R2UploaderSettings;
	private busy = false;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new R2SettingTab(this.app, this));

		this.registerEvent(this.app.workspace.on("editor-paste", (evt, editor, info) => this.onPaste(evt, editor, info)));
		this.registerEvent(this.app.workspace.on("editor-drop", (evt, editor, info) => this.onDrop(evt, editor, info)));

		this.addCommand({
			id: "upload-current-note",
			name: t.cmdUploadNote,
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.uploadNote(file);
				return true;
			},
		});
		this.addCommand({ id: "upload-vault", name: t.cmdUploadVault, callback: () => this.confirmUploadVault() });
		this.addCommand({ id: "retry-pending", name: t.cmdRetry, callback: () => this.retryPending(true) });

		// Keep the retry list in step with renames and deletions done by the user.
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				const i = this.settings.pending.indexOf(oldPath);
				if (i >= 0) {
					this.settings.pending[i] = file.path;
					void this.saveSettings();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.settings.pending.includes(file.path)) {
					this.settings.pending = this.settings.pending.filter((p) => p !== file.path);
					void this.saveSettings();
				}
			}),
		);

		this.app.workspace.onLayoutReady(() => window.setTimeout(() => void this.retryPending(false), 10_000));
		this.registerInterval(window.setInterval(() => void this.retryPending(false), RETRY_INTERVAL_MS));
		this.registerDomEvent(window, "online", () => void this.retryPending(false));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings.pending = [...(this.settings.pending ?? [])];
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** data.json was changed by sync from another device. */
	async onExternalSettingsChange() {
		await this.loadSettings();
	}

	/** A client for the current settings, or null if something is missing. */
	client(): R2Client | null {
		const s = this.settings;
		const read = (name: string) => (name ? this.app.secretStorage.getSecret(name) : null);
		const accessKeyId = s.syncSecrets ? s.accessKeyId : read(s.accessKeyIdSecret);
		const secretAccessKey = s.syncSecrets ? s.secretAccessKey : read(s.secretAccessKeySecret);
		if (!(s.accountId || s.endpoint) || !s.bucket || !s.publicUrl || !accessKeyId || !secretAccessKey) return null;
		return new R2Client(
			{ accountId: s.accountId, bucket: s.bucket, endpoint: s.endpoint, credentials: { accessKeyId, secretAccessKey } },
			obsidianHttp,
		);
	}

	private uploadOptions(): UploadOptions {
		const s = this.settings;
		return { publicUrl: s.publicUrl, keyTemplate: s.keyTemplate, convertToWebp: s.convertToWebp, webpQuality: s.webpQuality };
	}

	// ---- paste & drop ----

	private onPaste(evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
		if (evt.defaultPrevented || !this.settings.uploadOnPaste || !evt.clipboardData) return;
		const files = imageFiles(evt.clipboardData.files);
		// Spreadsheets and rich text put a picture of the selection on the clipboard too.
		if (!files.length || evt.clipboardData.getData("text/plain").trim()) return;
		const client = this.client();
		if (!client) {
			new Notice(t.notConfigured);
			return;
		}
		evt.preventDefault();
		void this.insertAndUpload(client, files, editor, info.file, true);
	}

	private onDrop(evt: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
		if (evt.defaultPrevented || !this.settings.uploadOnDrop) return;
		const files = imageFiles(evt.dataTransfer?.files);
		if (!files.length) return;
		const client = this.client();
		if (!client) {
			new Notice(t.notConfigured);
			return;
		}
		evt.preventDefault();
		// Editor has no public API for this; CodeMirror's view does.
		const cm = (editor as unknown as { cm?: { posAtCoords(c: { x: number; y: number }): number | null } }).cm;
		const offset = cm?.posAtCoords({ x: evt.clientX, y: evt.clientY });
		if (offset != null) editor.setCursor(editor.offsetToPos(offset));
		void this.insertAndUpload(client, files, editor, info.file, false);
	}

	private async insertAndUpload(client: R2Client, files: File[], editor: Editor, note: TFile | null, pasted: boolean) {
		const items = files.map((file) => ({ file, placeholder: `![${t.uploading} ${Math.random().toString(36).slice(2, 8)}…]()` }));
		editor.replaceSelection(items.map((i) => i.placeholder).join("\n"));

		const errors: string[] = [];
		await Promise.all(
			items.map(async ({ file, placeholder }) => {
				const data = await file.arrayBuffer();
				const mime = file.type || mimeFromExt(extFromMime("", file.name));
				let replacement: string;
				try {
					replacement = imageMarkdown(await uploadImage(client, this.uploadOptions(), data, mime, file.name));
				} catch (e) {
					console.error("R2 Image Uploader: upload failed", e);
					errors.push(errorText(e));
					const name = pasted ? `Pasted image ${moment().format("YYYYMMDDHHmmss")}.${extFromMime(mime, file.name)}` : file.name;
					replacement = await this.saveLocally(data, name, note);
				}
				await this.replacePlaceholder(editor, note, placeholder, replacement);
			}),
		);
		if (errors.length) new Notice(t.uploadFailedSaved(errors.length) + "\n" + errors[0], 10000);
	}

	/** Fallback when the upload fails: keep the image as a normal attachment and queue it. */
	private async saveLocally(data: ArrayBuffer, name: string, note: TFile | null): Promise<string> {
		const path = await this.app.fileManager.getAvailablePathForAttachment(name, note?.path);
		const file = await this.app.vault.createBinary(path, data);
		this.settings.pending.push(file.path);
		await this.saveSettings();
		return "!" + this.app.fileManager.generateMarkdownLink(file, note?.path ?? "");
	}

	private async replacePlaceholder(editor: Editor, note: TFile | null, placeholder: string, replacement: string) {
		const tryEditor = (ed: Editor) => {
			const offset = ed.getValue().indexOf(placeholder);
			if (offset < 0) return false;
			ed.replaceRange(replacement, ed.offsetToPos(offset), ed.offsetToPos(offset + placeholder.length));
			return true;
		};
		if (tryEditor(editor) || !note) return;
		// The user switched notes while uploading: find another editor or patch the file.
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.file === note && tryEditor(leaf.view.editor)) return;
		}
		if (note.extension === "md") await this.app.vault.process(note, (c) => c.replace(placeholder, () => replacement));
	}

	// ---- local files → R2 ----

	/**
	 * Uploads local images, rewrites their embeds in `notes`, then (optionally) trashes
	 * the ones nothing refers to any more.
	 */
	private async uploadAndRelink(client: R2Client, images: TFile[], notes: TFile[], trash: boolean, quiet = false): Promise<RelinkResult> {
		const progress = quiet ? null : new Notice(t.progress(0, images.length), 0);
		const referencing = notesReferencing(this.app, new Set(images.map((f) => f.path)));
		const urls = new Map<string, string>();
		const failed: RelinkResult["failed"] = [];
		let done = 0;
		try {
			await pool(images, CONCURRENCY, async (file) => {
				try {
					const data = await this.app.vault.readBinary(file);
					urls.set(file.path, await uploadImage(client, this.uploadOptions(), data, mimeFromExt(file.extension), file.name));
				} catch (error) {
					console.error(`R2 Image Uploader: failed to upload ${file.path}`, error);
					failed.push({ file, error });
				}
				progress?.setMessage(t.progress(++done, images.length));
			});

			let changedNotes = 0;
			for (const note of notes) if ((await rewriteNote(this.app, note, urls)) > 0) changedNotes++;

			if (trash) {
				for (const file of images) {
					if (urls.has(file.path) && !(await stillReferenced(this.app, file, referencing))) await this.app.fileManager.trashFile(file);
				}
			}

			const before = this.settings.pending.length;
			this.settings.pending = this.settings.pending.filter((p) => !urls.has(p) && this.app.vault.getFileByPath(p));
			if (this.settings.pending.length !== before) await this.saveSettings();
			return { urls, failed, changedNotes };
		} finally {
			progress?.hide();
		}
	}

	private async runExclusive(fn: (client: R2Client) => Promise<void>, quiet = false) {
		const client = this.client();
		if (!client) {
			if (!quiet) new Notice(t.notConfigured);
			return;
		}
		if (this.busy) {
			if (!quiet) new Notice(t.busy);
			return;
		}
		this.busy = true;
		try {
			await fn(client);
		} finally {
			this.busy = false;
		}
	}

	private report(r: RelinkResult) {
		new Notice(t.migrateDone(r.urls.size, r.failed.length, r.changedNotes), 8000);
	}

	async uploadNote(note: TFile) {
		await this.runExclusive(async (client) => {
			const { images } = collectLocalImages(this.app, [note]);
			if (!images.length) return void new Notice(t.noLocalImages);
			this.report(await this.uploadAndRelink(client, images, [note], this.settings.afterUpload === "trash"));
		});
	}

	confirmUploadVault() {
		const { images, notes } = collectLocalImages(this.app, this.app.vault.getMarkdownFiles());
		if (!images.length) return void new Notice(t.noLocalImages);
		const mb = (images.reduce((sum, f) => sum + f.stat.size, 0) / 1024 / 1024).toFixed(1);
		new ConfirmModal(
			this.app,
			t.migrateTitle,
			[
				t.migrateSummary(images.length, mb, notes.length),
				this.settings.afterUpload === "trash" ? t.migrateAfterTrash : t.migrateAfterKeep,
				t.migrateBackup,
			],
			() =>
				this.runExclusive(async (client) => {
					this.report(await this.uploadAndRelink(client, images, notes, this.settings.afterUpload === "trash"));
				}),
		).open();
	}

	/** Re-uploads images that were saved locally after a failed upload. */
	async retryPending(manual: boolean) {
		this.settings.pending = this.settings.pending.filter((p) => this.app.vault.getFileByPath(p));
		if (!this.settings.pending.length) {
			if (manual) new Notice(t.noPending);
			return;
		}
		await this.runExclusive(async (client) => {
			const files = this.settings.pending.map((p) => this.app.vault.getFileByPath(p)).filter((f): f is TFile => !!f);
			const notes = notesReferencing(this.app, new Set(files.map((f) => f.path))).filter((f) => f.extension === "md");
			// These files only exist because an upload failed, so they always go once relinked.
			const r = await this.uploadAndRelink(client, files, notes, true, !manual);
			if (r.urls.size || manual) new Notice(t.retryDone(r.urls.size, this.settings.pending.length), 6000);
		}, !manual);
	}
}

class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly heading: string,
		private readonly lines: string[],
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen() {
		this.setTitle(this.heading);
		for (const line of this.lines) this.contentEl.createEl("p", { text: line });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText(t.cancel).onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText(t.start)
					.setCta()
					.onClick(() => {
						this.close();
						this.onConfirm();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
