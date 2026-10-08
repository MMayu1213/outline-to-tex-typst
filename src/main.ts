import {
  App, ButtonComponent, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting,
} from "obsidian";
import { convertMarkdown, type ConversionResult } from "./converter";
import { saveExport } from "./export";
import { findPandoc } from "./pandoc";
import { DEFAULT_SETTINGS, loadSettings, validateSettings, type OutputFormat, type PluginSettings } from "./settings";
import { applyTemplate, metadataFor } from "./template";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default class OutlineExportPlugin extends Plugin {
  settings: PluginSettings = loadSettings(null);
  private pendingSave: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.addSettingTab(new OutlineSettingsTab(this.app, this));
    this.addCommand({
      id: "convert-current-note", name: "Convert current note",
      checkCallback: checking => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const file = view?.file ?? this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          void (async () => {
            const text = view?.editor ? view.editor.getValue() : await this.app.vault.read(file);
            new ExportPreview(this.app, this, text, file.name).open();
          })().catch(error => new Notice(errorMessage(error), 10_000));
        }
        return true;
      },
    });
    this.addCommand({
      id: "convert-selection", name: "Convert selection",
      editorCallback: (editor, view) => {
        const text = editor.getSelection();
        if (!text.trim()) { new Notice("Select a label and its complete outline first."); return; }
        new ExportPreview(this.app, this, text, view.file?.name ?? "Untitled.md").open();
      },
    });
  }

  saveSettings(): Promise<void> {
    const snapshot = structuredClone(this.settings);
    const operation = this.pendingSave.catch(() => undefined).then(() => this.saveData(snapshot));
    this.pendingSave = operation;
    return operation;
  }

  async onExternalSettingsChange(): Promise<void> {
    await this.pendingSave.catch(() => undefined);
    this.settings = loadSettings(await this.loadData());
  }
}

class ExportPreview extends Modal {
  private format: OutputFormat = "latex";
  private fullDocument = false;
  private output = "";
  private sequence = 0;
  private busySaving = false;
  private source!: HTMLTextAreaElement;
  private status!: HTMLElement;
  private report!: HTMLElement;
  private copyButton!: ButtonComponent;
  private saveButton!: ButtonComponent;
  private outputFolder = "exports";

  constructor(app: App, private plugin: OutlineExportPlugin, private markdown: string, private filename: string) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("outline-export-modal");
    this.titleEl.setText("Outline to TeX & Typst");
    new Setting(this.contentEl).setName("Output format").addDropdown(dropdown => dropdown
      .addOptions({ latex: "LaTeX (.tex)", typst: "Typst (.typ)" })
      .setValue(this.format).onChange(value => { this.format = value as OutputFormat; void this.refresh(); }));
    new Setting(this.contentEl).setName("Include document template")
      .setDesc("Add the template, title, author and date from plugin settings.")
      .addToggle(toggle => toggle.setValue(this.fullDocument).onChange(value => {
        this.fullDocument = value; void this.refresh();
      }));
    this.status = this.contentEl.createDiv({ cls: "outline-export-status" });
    this.report = this.contentEl.createDiv({ cls: "outline-export-report" });
    this.source = this.contentEl.createEl("textarea", { cls: "outline-export-source" });
    this.source.readOnly = true;
    this.source.setAttribute("aria-label", "Converted source");
    this.source.setAttribute("spellcheck", "false");
    this.source.setAttribute("wrap", "off");
    new Setting(this.contentEl).addButton(button => {
      this.copyButton = button.setButtonText("Copy").onClick(() => { void this.copy(); });
    }).addButton(button => {
      this.saveButton = button.setButtonText("Save in Vault").setCta().onClick(() => { void this.save(); });
    }).addButton(button => button.setButtonText("Refresh").onClick(() => { void this.refresh(); }));
    void this.refresh();
  }

  private setReady(ready: boolean): void {
    this.copyButton.setDisabled(!ready);
    this.saveButton.setDisabled(!ready || this.busySaving);
  }

  private async refresh(): Promise<void> {
    const sequence = ++this.sequence;
    const format = this.format;
    const fullDocument = this.fullDocument;
    this.output = "";
    this.source.value = "";
    this.setReady(false);
    this.report.empty();
    this.status.setText("Converting…");
    this.status.removeClass("outline-export-error");
    try {
      const settings = loadSettings(this.plugin.settings);
      validateSettings(settings);
      const template = format === "latex" ? settings.latexTemplate : settings.typstTemplate;
      if (fullDocument) applyTemplate(template, "", metadataFor(this.filename, settings), format);
      const runner = await findPandoc(settings.pandocPath);
      const result = await convertMarkdown(this.markdown, format, settings, runner);
      if (sequence !== this.sequence) return;
      this.output = fullDocument ? applyTemplate(template, result.body, metadataFor(this.filename, settings), format) : result.body;
      this.outputFolder = settings.outputFolder;
      this.source.value = this.output;
      this.status.setText("Ready. Review the source and link decisions before copying or saving.");
      this.showReport(result);
      this.setReady(true);
    } catch (error) {
      if (sequence !== this.sequence) return;
      this.status.addClass("outline-export-error");
      this.status.setText(errorMessage(error));
    }
  }

  private showReport(result: ConversionResult): void {
    const details = this.report.createEl("details");
    details.open = result.removedLinks.length > 0 || result.warnings.length > 0;
    details.createEl("summary", { text: `${result.citations.length} citation keys · ${result.removedLinks.length} removed links · ${result.warnings.length} notices` });
    for (const [label, entries] of [["Citation keys", result.citations], ["Removed links (including display text)", result.removedLinks], ["Notices", result.warnings]] as const) {
      if (!entries.length) continue;
      details.createEl("h4", { text: label });
      const list = details.createEl("ul");
      for (const entry of entries) list.createEl("li", { text: entry });
    }
  }

  private async copy(): Promise<void> {
    if (!this.output) return;
    try { await navigator.clipboard.writeText(this.output); new Notice("Converted source copied."); }
    catch (error) { new Notice(`Could not copy: ${errorMessage(error)}`, 10_000); }
  }

  private async save(): Promise<void> {
    if (!this.output || this.busySaving) return;
    const text = this.output;
    const format = this.format;
    const folder = this.outputFolder;
    this.busySaving = true;
    this.saveButton.setDisabled(true);
    try {
      const path = await saveExport({
        exists: path => this.app.vault.adapter.exists(path),
        mkdir: async path => { await this.app.vault.createFolder(path); },
        create: async (path, content) => { await this.app.vault.create(path, content); },
      }, folder, this.filename, format, text);
      new Notice(`Saved ${path}`, 8000);
    } catch (error) { new Notice(`Could not save: ${errorMessage(error)}`, 10_000); }
    finally { this.busySaving = false; this.setReady(Boolean(this.output)); }
  }

  onClose(): void { this.sequence++; this.contentEl.empty(); }
}

class OutlineSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: OutlineExportPlugin) { super(app, plugin); }

  private save(): void {
    void this.plugin.saveSettings().catch(error => new Notice(`Settings could not be saved: ${errorMessage(error)}`, 10_000));
  }

  private heading(name: string): void { new Setting(this.containerEl).setName(name).setHeading(); }

  private text(key: "titleValue" | "authorValue" | "dateValue" | "pandocPath" | "outputFolder" | "citationPattern", name: string, description: string): void {
    new Setting(this.containerEl).setName(name).setDesc(description).addText(text => text
      .setValue(this.plugin.settings[key]).onChange(value => { this.plugin.settings[key] = value; this.save(); }));
  }

  private choice(key: "titleMode" | "authorMode" | "dateMode" | "latexCitation" | "typstCitation", name: string, options: Record<string, string>): void {
    new Setting(this.containerEl).setName(name).addDropdown(dropdown => dropdown.addOptions(options)
      .setValue(this.plugin.settings[key]).onChange(value => {
        Object.assign(this.plugin.settings, { [key]: value }); this.save();
      }));
  }

  private multiline(key: "forcedCitations" | "excludedLinks" | "latexTemplate" | "typstTemplate", name: string, description: string): void {
    const setting = new Setting(this.containerEl).setName(name).setDesc(description);
    setting.settingEl.addClass("outline-export-multiline");
    setting.addTextArea(area => {
      const value = this.plugin.settings[key];
      area.setValue(Array.isArray(value) ? value.join("\n") : value).onChange(text => {
        if (key === "forcedCitations" || key === "excludedLinks") this.plugin.settings[key] = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        else this.plugin.settings[key] = text;
        this.save();
      });
      area.inputEl.rows = key.endsWith("Template") ? 14 : 4;
      area.inputEl.spellcheck = false;
      area.inputEl.setAttribute("aria-label", name);
    });
  }

  display(): void {
    this.containerEl.empty();
    this.heading("Document information");
    this.choice("titleMode", "Title source", { filename: "Note filename", fixed: "Fixed text", omit: "Omit" });
    this.text("titleValue", "Fixed title", "Used when title source is Fixed text.");
    this.choice("authorMode", "Author source", { fixed: "Fixed text", omit: "Omit" });
    this.text("authorValue", "Author", "Your name as it should appear in exported documents.");
    this.choice("dateMode", "Date source", { today: "Today", fixed: "Fixed text", omit: "Omit" });
    this.text("dateValue", "Fixed date", "Today uses your computer's local date in YYYY-MM-DD format.");
    this.heading("Citations");
    this.choice("latexCitation", "LaTeX citation command", { citep: "\\citep (natbib)", cite: "\\cite", parencite: "\\parencite (biblatex)" });
    this.choice("typstCitation", "Typst citation form", { prose: "Prose (author in text)", normal: "Normal (document style)" });
    this.text("citationPattern", "Citation key pattern", "A regular expression matched against the complete wikilink target. No bibliography file is read.");
    this.multiline("forcedCitations", "Always cite these targets", "One exact wikilink target per line. Use for keys outside the pattern.");
    this.multiline("excludedLinks", "Never cite these targets", "One exact target per line. These links and their display text are removed. Overrides Always cite.");
    this.heading("Document templates");
    this.containerEl.createEl("p", { text: "Use exactly one {{body}}. Optional fields: {{title}}, {{author}}, {{date}}. Fields are escaped text; Typst text fields belong in content, outside quoted strings. Relative bibliography and import paths are resolved from the exported document." });
    this.multiline("latexTemplate", "LaTeX template", "The starter uses natbib. Change the packages and bibliography settings if you use biblatex. Configure a Japanese-capable document class/fonts for Japanese text.");
    this.multiline("typstTemplate", "Typst template", "Paste your page, font, import, show and bibliography settings around {{body}}.");
    this.heading("Export");
    this.text("pandocPath", "Pandoc executable", "Leave empty to auto-detect. Pandoc 3.4+ is required. Enter a path without shell quotes or arguments.");
    this.text("outputFolder", "Output folder", "A Vault-relative folder, e.g. exports or Papers/exports. Existing files receive a numeric suffix.");
    new Setting(this.containerEl).setName("Check configuration").addButton(button => button.setButtonText("Check").onClick(() => {
      void (async () => {
        validateSettings(this.plugin.settings);
        for (const format of ["latex", "typst"] as const) {
          applyTemplate(format === "latex" ? this.plugin.settings.latexTemplate : this.plugin.settings.typstTemplate, "", metadataFor("Example.md", this.plugin.settings), format);
        }
        const runner = await findPandoc(this.plugin.settings.pandocPath);
        new Notice(`Configuration valid. Pandoc: ${runner.executable}`);
      })().catch(error => new Notice(errorMessage(error), 10_000));
    }));
    new Setting(this.containerEl).setName("Restore starter templates").setDesc("Replace both template fields with the bundled examples.")
      .addButton(button => button.setButtonText("Restore").onClick(() => {
        this.plugin.settings.latexTemplate = DEFAULT_SETTINGS.latexTemplate;
        this.plugin.settings.typstTemplate = DEFAULT_SETTINGS.typstTemplate;
        this.save(); this.display();
      }));
  }
}
