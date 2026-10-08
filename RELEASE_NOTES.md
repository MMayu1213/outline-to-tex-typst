# Outline to TeX & Typst 0.1.0

Initial desktop release for Obsidian 1.5+ and Pandoc 3.4+.

- Export the active note or selected outline to LaTeX or Typst source.
- Turn top-level labels into comments and their descendants into paragraphs.
- Convert citation wikilinks to LaTeX citation commands or Typst prose citations.
- Configure document metadata, templates, citation patterns and output folders in Obsidian settings.
- Preview citation decisions, copy source, and save without overwriting files.
- Run custom citation patterns in a worker with a timeout to keep the interface responsive.
- Pin build and release actions to full commit SHAs.

Validated with automated conversion tests and an Obsidian 1.13.7 GUI test in an isolated Vault.

## Install through BRAT

1. Install and enable **BRAT** from Obsidian's Community Plugins.
2. In BRAT settings, choose **Add beta plugin** and enter `MMayu1213/outline-to-tex-typst`.
3. Enable **Outline to TeX & Typst** and configure it in Obsidian settings.

This plugin is not yet listed in Obsidian's official Community Plugins directory.

## Manual installation

Download `outline-to-tex-typst-0.1.0.zip`, extract its `outline-to-tex-typst` folder into your Vault's `.obsidian/plugins/`, then enable the plugin. Alternatively download `main.js`, `manifest.json`, and `styles.css` individually into that folder.

Pandoc must be installed separately. Bibliography files, fonts and target-language compilation are configured in your manuscript environment; this plugin exports source and does not produce PDFs.
