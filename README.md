# Outline to TeX & Typst

An Obsidian desktop plugin that converts academic Markdown outlines to **LaTeX or Typst source**. Keep writing with Outliner and Paperpile-style `[[citation-key]]` links; export source for your manuscript without rewriting headings and citations by hand.

> This project is not yet listed in Obsidian Community Plugins. Install from GitHub Releases manually or through BRAT. PDF compilation and bibliography synchronization are outside the plugin's scope.

## Installation

Requirements: Obsidian **1.5+** on desktop and **Pandoc 3.4+**. Typst / LaTeX are only needed when you compile the exported source elsewhere.

### Install through BRAT

1. Install and enable **BRAT** from Obsidian's Community Plugins.
2. Open BRAT settings, choose **Add beta plugin**, and enter `MMayu1213/outline-to-tex-typst`.
3. Enable **Outline to TeX & Typst** under Community plugins.
4. Open **Settings → Outline to TeX & Typst**, configure your author, templates, and export folder, then click **Check configuration**.

BRAT downloads the assets from GitHub Releases; no manual file copying is needed. See the [BRAT guide](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md).

### Download a release manually

1. Open [Releases](https://github.com/MMayu1213/outline-to-tex-typst/releases/latest) and download `outline-to-tex-typst-<version>.zip` from **Assets**.
2. Extract its `outline-to-tex-typst` folder into `<vault>/.obsidian/plugins/` (or your Vault's custom configuration directory).
3. Enable the plugin and configure it as described above. The ZIP contains **`main.js`, `manifest.json`, and `styles.css`**. These files are also downloadable individually.

### Build from source

Clone this repository, run `npm ci` and `npm run build` with Node.js 22+, then copy `main.js`, `manifest.json`, and `styles.css` into the plugin folder described above.

On macOS, install Pandoc with `brew install pandoc`. Auto-detection checks PATH and common installation paths, including Homebrew. If needed, enter the full executable path in settings, without quotes or extra arguments.

## Workflow

Run **Outline to TeX & Typst: Convert current note** from the command palette. The active editor's unsaved text is included. For a selection, select a complete top-level label and all its children, then run **Convert selection**.

Choose LaTeX or Typst and switch **Include document template** on or off. Review the output, citation keys, removed links and notices. **Copy** copies the current output; **Save in Vault** writes a `.tex` or `.typ` file to the configured folder. Existing files receive a numeric suffix and are never overwritten. The source note is never modified.

Settings apply to both commands. A selection still uses the original note's filename for its title. Refresh reuses the Markdown captured when the preview opened; to include further note edits, close the preview and run the command again.

## Outline rules

```markdown
## Puzzle

- Paragraph label
    - First sentence [[Example2024-aa]].
        - Further detail.
    - Another sentence.
- Second label
    - Next paragraph.
```

LaTeX:

```tex
\subsection{Puzzle}

% Paragraph label
First sentence \citep{Example2024-aa}.
Further detail.
Another sentence.

% Second label
Next paragraph.
```

Typst:

```typst
== Puzzle

// Paragraph label
First sentence #cite(<Example2024-aa>, form: "prose").
Further detail.
Another sentence.

// Second label
Next paragraph.
```

Top-level bullet text is a **label**, not manuscript body. All descendant text is flattened in its original depth-first order. Single newlines are preserved in source; blank lines separate paragraphs. No punctuation, transitions, spelling corrections or translations are added. Labels without children become comments with a notice. Tabs and spaces are accepted according to Markdown indentation (tabs use four-column stops).

Headings keep their Markdown level: `#` → `\section` / `=`, `##` → `\subsection` / `==`. Plain paragraphs, emphasis, external Markdown links, fenced code, ordered lists outside outlines and ordinary math are handled by Pandoc. Source layout can change to target-language syntax; typographic rendering is not a copy of Obsidian.

## Citations and ordinary links

The default citation-key pattern is:

```regex
^[A-Za-z][A-Za-z0-9_]*[12][0-9]{3}-[A-Za-z]{2}$
```

It recognizes keys such as `Example2024-aa` and `Example2024-aa`. Configure your own expression if Paperpile uses another key convention. No `.bib` file is read and no source existence check is performed.

- **Never cite** overrides **Always cite**, which overrides the pattern. Both lists use exact link targets, one per line.
- Citation aliases do not change the key: `[[Example2024-aa|Example]]` still cites `Example2024-aa`.
- Path / heading links are ordinary links unless explicitly forced as citations.
- Non-citation wikilinks are **removed together with their display text** and listed in the preview. Text inside code remains literal. Label comments preserve their original text rather than processing citations.
- Adjacent citation links are combined as `\citep{key1,key2}` for LaTeX. Typst emits one explicit `#cite(...)` per key with an intervening space.
- LaTeX supports `citep`, `cite`, and `parencite`; Typst supports `prose` and `normal`. Keys with characters unsuitable for Typst angle labels use `label("key")`. Unsafe LaTeX keys cause a conversion error.

The destination manuscript needs the matching bibliography setup: natbib for `\citep`, biblatex for `\parencite`, or Typst's `#bibliography(...)`. A prose citation puts the author in the sentence; it does not edit your surrounding words.

## Callouts, figures and excluded sections

```markdown
> [!hypothesis] Participation
> Giving everyone equal time encourages participation.

> [!theorem] Example statement
> A fictional theorem for demonstrating the format.

![A descriptive caption](plot.png)

## todo
This section is excluded.

## Results
This section is included.
```

`[!hypothesis]`, `[!h]`, `[!H: Example]` and `[!仮説]` become `hypothesis` environments in LaTeX; `[!theorem]` and `[!定理]` become `theorem` environments. Other callout types become framed boxes. Choose **LaTeX callout style → Framed boxes** to use boxes for every callout. Typst always uses a framed block. Fold markers (`+` / `-`) do not affect export. The callout title and body are retained, and citations in the body are converted.

The starter LaTeX preamble includes `amsthm`, `graphicx`, `\newtheorem{hypothesis}{Hypothesis}` and `\newtheorem{theorem}{Theorem}`. An unchanged old starter template upgrades automatically; personal templates are retained. Add the corresponding definitions to your own preamble when using theorem mode or body-only output. LaTeX boxes use a minipage and do not split across pages.

Standalone `![caption](plot.png)` and `![[plot.png]]` become LaTeX `figure` / Typst `#figure(...)`. Markdown alt text and nonnumeric wikilink aliases become captions; `![[plot.png|400]]` treats 400 as a display size, not a caption. Exports currently fit images to the text width rather than preserving Obsidian pixel sizes. PNG, JPG and PDF work in both formats; SVG is supported for Typst only. Remote image URLs and unsafe filenames cause an error; images are never downloaded.

In Obsidian, image files are resolved from the original note and referenced relative to the configured export folder. Images are not moved or copied. Keep that folder layout when compiling, or adjust image paths if you copy the source to another project. Preview lists the figure paths. For body-only output pasted into another manuscript, adjust paths relative to that manuscript.

**Exclude these sections** defaults to `メモ` and `todo`. It matches exact heading titles, case-insensitively, and removes each matching heading and its descendants until the next heading of the same or higher level. Both `# メモ` / `# todo` and the compact forms `#メモ` / `#todo` are accepted. Heading-like text inside code is retained. Exclusions happen before image/embed validation or citation matching, and the preview lists the omitted sections. A selection is parsed independently, so select its exclusion heading too if you want that section omitted.

## Document settings and templates

All settings are edited through the **Obsidian settings GUI** and saved through the standard API to the plugin's `data.json`. No manual JSON editing is needed. Settings are local to the Vault's plugin installation; personal `data.json` is not part of this repository.

| Field | Choices | Default |
| --- | --- | --- |
| Title | Note filename (without `.md`), fixed text, omit | Filename |
| Author | Fixed text, omit | Empty |
| Date | Today's local date, fixed text, omit | Today, `YYYY-MM-DD` |

The note's YAML properties do **not** override these settings. Enter your author name in the GUI.

Paste a full document wrapper in each format's template field. Use **exactly one `{{body}}`**. Optional placeholders `{{title}}`, `{{author}}`, and `{{date}}` can occur more than once; omitted fields insert empty text. Metadata is escaped as text while template code and converted body remain intact. Placeholder replacement is single-pass.

For Typst, insert text placeholders in **markup/content**, for example `[{{title}}]`, not in quoted strings or raw code expressions. The bundled template demonstrates this. For LaTeX, use ordinary text arguments such as `\title{ {{title}} }`.

The starter LaTeX template uses `article` and natbib. Change the class, fonts and packages to match your paper, especially for Japanese text. If you choose `parencite`, replace the natbib/bibliography setup with your own biblatex setup. The Typst starter includes page/text/heading settings and a bibliography call; replace these with your usual `#import` / `#show` rules if desired.

Place or configure `references.bib` yourself. Relative bibliography and import paths are resolved **from the exported document**, not from the note or plugin. The plugin does not copy supporting files; image references use paths relative to the configured export folder. Source-only export adds no preamble, title or bibliography.

## Limits and error handling

- Desktop only; local Pandoc 3.4+ is required. No AI service, network conversion, compiler or font downloads occur at runtime.
- Obsidian note embeds stop conversion. Standalone images and callouts are supported as described above; inline images must be moved onto their own line. Tables, definition lists, raw blocks and other unsupported block structures also produce explicit errors rather than silently dropping content.
- Put fenced code, display-math paragraphs and ordinary block quotes outside flattened outlines when their block structure needs to survive. Figures and callouts inside outlines are kept as separate blocks, with surrounding paragraphs split in their original order. Inline code and inline math are supported inside outline text.
- Obsidian-specific comment syntax `%%...%%` and plugin-generated views are not interpreted. Review notes containing them before export.
- Custom LaTeX math macros may not translate to Typst; Pandoc warnings stop conversion. Math and target-language features depend on the receiving manuscript's configuration.
- LaTeX math commands and document templates are preserved as source code. Conversion does not execute them or make them safe to compile. Compile documents from trusted sources, or use an isolated compilation environment for documents supplied by others.
- Custom citation patterns run in a Chromium Web Worker in Obsidian, with a one-second deadline. A pattern that takes too long stops conversion with an error while the interface remains responsive. Patterns and individual link targets are limited to 4,096 characters; at most 50,000 distinct targets are matched per conversion. CLI tests use Node workers; the Electron renderer does not use Node worker_threads.
- Partial selections are parsed independently: select the complete label and its descendants to avoid treating a child as a label.
- Invalid patterns, output paths, templates, unsupported content, execution failures and Pandoc warnings are shown in the preview. Copy/save remain disabled until conversion succeeds.

## Development

```sh
npm ci
npm run check
npm run dev
```

Tests exercise the actual Pandoc reader/writers using the example outline plus metadata, templates and export collisions. When Typst is installed, an additional test compiles the starter template with escaped metadata and a prose citation. Set `PANDOC_PATH` for test environments with a custom executable path. CI uses Node.js 22 and Pandoc 3.4 and uploads `main.js`, `manifest.json`, and `styles.css` as a build artifact.

Source layout: `src/converter.ts` handles AST transformation, `src/settings.ts` / `src/template.ts` handle configuration and document wrappers, and `src/main.ts` implements the Obsidian commands/settings/preview. `examples/` contains a fictional reading-event outline and its source exports. All sample bibliography keys are fictional.

The **Publish release** workflow runs the checks and attaches the three plugin files plus an installable ZIP to a release whose tag exactly matches `manifest.json`. Start it manually from Actions only after reviewing the files for publication; pushing code does not publish a release automatically. Existing releases are left unchanged. Increment the manifest version (and keep `package.json`, `package-lock.json`, and `versions.json` consistent) for a new release; update the release notes before publishing.

Workflow actions are pinned to full commit SHAs. Review upstream changes before updating those pins. Checkout does not persist Git credentials.

## 日本語の概要

最上位の箇条書きをコメントのラベルにし、その子・孫を1段落にまとめます。引用リンクは `\citep{key}` または `#cite(<key>, form: "prose")` に変換し、通常のノートリンクは表示名ごと削除します。変換前のMarkdownには変更を加えません。

著者・日付・タイトルの取得方法、引用の判定、プレアンブルを含むテンプレートはすべてプラグイン設定画面で指定できます。保存先に同名ファイルがある場合は連番を付けます。PDF生成や文献データの同期は行いません。

## License

MIT. Copyright © 2026 MMayu1213.
