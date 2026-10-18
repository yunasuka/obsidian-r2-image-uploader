import { App, Modal, Notice, Setting } from "obsidian";
import type { ArchiveStats } from "./archive";
import { t } from "./i18n";

export class ConfirmModal extends Modal {
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

const MAX_ROWS = 300;

/** Result of a manual remote-image run, with the images that could not be saved. */
export class ArchiveReportModal extends Modal {
	constructor(
		app: App,
		private readonly stats: ArchiveStats,
		private readonly cancelled: boolean,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl, stats } = this;
		this.setTitle(t.archiveReportTitle);
		contentEl.createEl("p", { text: t.archiveDone(stats.saved, stats.notes, stats.failed.length) + (this.cancelled ? " " + t.archiveCancelled : "") });
		if (!stats.failed.length) return;
		contentEl.createEl("p", { text: t.archiveFailedHint });

		const byNote = new Map<string, typeof stats.failed>();
		for (const f of stats.failed) byNote.set(f.note, [...(byNote.get(f.note) ?? []), f]);
		const list = contentEl.createDiv({ cls: "r2-uploader-report" });
		let rows = 0;
		for (const [note, items] of byNote) {
			if (rows >= MAX_ROWS) break;
			const link = list.createEl("a", { text: note.replace(/\.md$/, ""), cls: "r2-uploader-report-note" });
			link.addEventListener("click", () => {
				void this.app.workspace.openLinkText(note, "", true);
			});
			const ul = list.createEl("ul");
			for (const f of items) {
				if (rows++ >= MAX_ROWS) break;
				ul.createEl("li", { text: `${t.reason(f.reason)} — ${f.url}` });
			}
		}
		if (stats.failed.length > MAX_ROWS) contentEl.createEl("p", { text: t.archiveMore(stats.failed.length - MAX_ROWS) });

		new Setting(contentEl).addButton((b) =>
			b.setButtonText(t.copyList).onClick(async () => {
				await navigator.clipboard.writeText(stats.failed.map((f) => `${f.note}\t${f.reason}\t${f.url}`).join("\n"));
				new Notice(t.copied);
			}),
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
