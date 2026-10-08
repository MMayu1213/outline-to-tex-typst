# Outline to TeX & Typst 0.1.2

- Export hypothesis/theorem callouts as LaTeX environments or framed boxes; Typst uses framed blocks.
- Export standalone Markdown and Obsidian images as figures with captions and Vault-relative paths.
- Exclude メモ and todo sections, including subsections. Customize exact heading titles in settings.
- Fix citation matching in the Obsidian renderer using Chromium Web Workers.

Update through BRAT after this release is published, or replace the three plugin files from `outline-to-tex-typst-0.1.2.zip`. Keep `data.json` to preserve settings. Custom LaTeX templates need graphicx and the hypothesis/theorem definitions described in README; the unchanged starter upgrades automatically.

Pandoc 3.4+ is required. Images remain in the Vault and must be available to the compiler. The plugin is not yet listed in the official Community Plugins directory.
