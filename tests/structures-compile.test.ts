import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { convertMarkdown } from "../src/converter";
import { findPandoc } from "../src/pandoc";
import { loadSettings } from "../src/settings";
import { applyTemplate, metadataFor } from "../src/template";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGMImLABK2IYWhIA+wJkAfJEDbsAAAAASUVORK5CYII=", "base64");
const source = "> [!hypothesis] A & B [x]\n> A test claim.\n\n> [!theorem] Result\n> Another statement.\n\n![A caption with & and underscore_](plot.png)\n\n## todo\n\nExcluded.\n";

for (const format of ["latex", "typst"] as const) {
  const compiler = format === "latex" ? "pdflatex" : "typst";
  const available = spawnSync(compiler, ["--version"], { encoding: "utf8" }).status === 0;
  test(`${format} callouts and figures compile in both callout styles`, { skip: !available }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "outline-structures-test-"));
    await writeFile(join(directory, "plot.png"), png);
    await writeFile(join(directory, "references.bib"), '@article{Example2024-aa, author={Example, Author}, title={Example}, year={2024}}');
    const settings = loadSettings(null);
    const runner = await findPandoc("");
    for (const style of ["theorem", "box"] as const) {
      settings.latexCalloutStyle = style;
      const converted = await convertMarkdown(source, format, settings, runner);
      assert.doesNotMatch(converted.body, /Excluded/);
      const document = applyTemplate(format === "latex" ? settings.latexTemplate : settings.typstTemplate, converted.body, metadataFor("Example.md", settings), format);
      const filename = `${style}.${format === "latex" ? "tex" : "typ"}`;
      await writeFile(join(directory, filename), document);
      const args = format === "latex" ? ["-no-shell-escape", "-interaction=batchmode", "-halt-on-error", filename] : ["compile", filename, `${style}.pdf`];
      try { execFileSync(compiler, args, { cwd: directory, timeout: 30_000, stdio: "pipe" }); }
      catch (error) {
        if (format === "latex") throw new Error(await readFile(join(directory, `${style}.log`), "utf8"));
        throw error;
      }
      assert.equal((await readFile(join(directory, `${style}.pdf`))).subarray(0, 4).toString(), "%PDF");
    }
  });
}
