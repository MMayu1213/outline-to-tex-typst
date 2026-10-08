import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSettings } from "../src/settings";
import { applyTemplate, metadataFor } from "../src/template";

const typstAvailable = spawnSync("typst", ["--version"], { encoding: "utf8" }).status === 0;

test("Typst starter compiles with escaped metadata and a prose citation", { skip: !typstAvailable }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "outline-typst-test-"));
  const settings = loadSettings(null);
  settings.authorValue = "Example & Author";
  const document = applyTemplate(settings.typstTemplate,
    '== Heading\n\n// Label\nText #cite(<Example2024-aa>, form: "prose").\nAnother line.\n',
    metadataFor("Example [Title] #1.md", settings, new Date(2026, 9, 8)), "typst");
  await writeFile(join(directory, "document.typ"), document);
  await writeFile(join(directory, "references.bib"), '@article{Example2024-aa, author={Example, Author}, title={Example Article}, year={2021}, journal={Example Journal}}\n');
  execFileSync("typst", ["compile", join(directory, "document.typ"), join(directory, "document.pdf")], { timeout: 30_000, stdio: "pipe" });
  const pdf = await readFile(join(directory, "document.pdf"));
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});
