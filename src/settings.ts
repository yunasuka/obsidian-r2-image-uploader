import { App, Notice, PluginSettingTab, requestUrl, SecretComponent, Setting } from "obsidian";
import { t } from "./i18n";
import { DEFAULT_KEY_TEMPLATE, publicUrl } from "./naming";
import type R2ImageUploader from "./main";

export interface R2UploaderSettings {
	accountId: string;
	bucket: string;
	/** Names of entries in app.secretStorage, never the secrets themselves. */
	accessKeyIdSecret: string;
	secretAccessKeySecret: string;
	publicUrl: string;
	endpoint: string;
	uploadOnPaste: boolean;
	uploadOnDrop: boolean;
	keyTemplate: string;
	convertToWebp: boolean;
	webpQuality: number;
	afterUpload: "keep" | "trash";
	/** Vault paths of images saved locally because their upload failed. */
	pending: string[];
}

export const DEFAULT_SETTINGS: R2UploaderSettings = {
	accountId: "",
	bucket: "",
	accessKeyIdSecret: "",
	secretAccessKeySecret: "",
	publicUrl: "",
	endpoint: "",
	uploadOnPaste: true,
	uploadOnDrop: true,
	keyTemplate: DEFAULT_KEY_TEMPLATE,
	convertToWebp: false,
	webpQuality: 0.85,
	afterUpload: "keep",
	pending: [],
};

export class R2SettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: R2ImageUploader,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();
		containerEl.empty();

		new Setting(containerEl).setName(t.secConnection).setHeading();

		new Setting(containerEl)
			.setName(t.accountId)
			.setDesc(t.accountIdDesc)
			.addText((c) => c.setValue(s.accountId).onChange((v) => ((s.accountId = v.trim()), save())));
		new Setting(containerEl).setName(t.bucket).addText((c) =>
			c
				.setPlaceholder("my-images")
				.setValue(s.bucket)
				.onChange((v) => ((s.bucket = v.trim()), save())),
		);
		new Setting(containerEl)
			.setName(t.accessKeyId)
			.setDesc(t.secretDesc)
			.addComponent((el) =>
				new SecretComponent(this.app, el).setValue(s.accessKeyIdSecret).onChange((v) => ((s.accessKeyIdSecret = v ?? ""), save())),
			);
		new Setting(containerEl)
			.setName(t.secretAccessKey)
			.setDesc(t.secretDesc)
			.addComponent((el) =>
				new SecretComponent(this.app, el).setValue(s.secretAccessKeySecret).onChange((v) => ((s.secretAccessKeySecret = v ?? ""), save())),
			);
		new Setting(containerEl)
			.setName(t.publicUrl)
			.setDesc(t.publicUrlDesc)
			.addText((c) =>
				c
					.setPlaceholder("https://img.example.com")
					.setValue(s.publicUrl)
					.onChange((v) => ((s.publicUrl = v.trim()), save())),
			);
		new Setting(containerEl)
			.setName(t.endpoint)
			.setDesc(t.endpointDesc)
			.addText((c) => c.setValue(s.endpoint).onChange((v) => ((s.endpoint = v.trim()), save())));

		const test = new Setting(containerEl).setName(t.test).setDesc(t.testDesc);
		test.addButton((b) =>
			b.setButtonText(t.testRun).onClick(async () => {
				b.setDisabled(true);
				try {
					new Notice(await this.testConnection(), 8000);
				} catch (e) {
					new Notice(`R2: ${e instanceof Error ? e.message : String(e)}`, 10000);
				} finally {
					b.setDisabled(false);
				}
			}),
		);

		new Setting(containerEl).setName(t.secUpload).setHeading();

		new Setting(containerEl)
			.setName(t.onPaste)
			.setDesc(t.onPasteDesc)
			.addToggle((c) => c.setValue(s.uploadOnPaste).onChange((v) => ((s.uploadOnPaste = v), save())));
		new Setting(containerEl).setName(t.onDrop).addToggle((c) => c.setValue(s.uploadOnDrop).onChange((v) => ((s.uploadOnDrop = v), save())));
		new Setting(containerEl)
			.setName(t.keyTemplate)
			.setDesc(t.keyTemplateDesc)
			.addText((c) =>
				c
					.setPlaceholder(DEFAULT_KEY_TEMPLATE)
					.setValue(s.keyTemplate)
					.onChange((v) => ((s.keyTemplate = v.trim() || DEFAULT_KEY_TEMPLATE), save())),
			);
		new Setting(containerEl)
			.setName(t.webp)
			.setDesc(t.webpDesc)
			.addToggle((c) => c.setValue(s.convertToWebp).onChange((v) => ((s.convertToWebp = v), save())));
		new Setting(containerEl).setName(t.webpQuality).addSlider((c) =>
			c
				.setLimits(0.5, 1, 0.05)
				.setValue(s.webpQuality)
				.setDynamicTooltip()
				.onChange((v) => ((s.webpQuality = v), save())),
		);
		new Setting(containerEl)
			.setName(t.afterUpload)
			.setDesc(t.afterUploadDesc)
			.addDropdown((c) =>
				c
					.addOption("keep", t.afterKeep)
					.addOption("trash", t.afterTrash)
					.setValue(s.afterUpload)
					.onChange((v) => ((s.afterUpload = v as R2UploaderSettings["afterUpload"]), save())),
			);

		if (s.pending.length) {
			new Setting(containerEl).setName(t.pendingCount(s.pending.length)).addButton((b) =>
				b.setButtonText(t.cmdRetry).onClick(async () => {
					await this.plugin.retryPending(true);
					this.display();
				}),
			);
		}
	}

	private async testConnection(): Promise<string> {
		const client = this.plugin.client();
		if (!client) return t.notConfigured;
		const key = "r2-image-uploader-test.txt";
		const body = `r2-image-uploader ${new Date().toISOString()}`;
		await client.put(key, new TextEncoder().encode(body).buffer, "text/plain; charset=utf-8", { cacheControl: "no-store" });
		try {
			const res = await requestUrl({ url: `${publicUrl(this.plugin.settings.publicUrl, key)}?t=${Date.now()}`, throw: false });
			if (res.status !== 200 || res.text !== body) return t.testPublicFail(res.status);
		} finally {
			await client.delete(key);
		}
		return t.testOk;
	}
}
