import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { convertMarkdown, transformDocument, type PandocDocument } from "../src/converter";
import { findPandoc, type PandocRunner } from "../src/pandoc";
import { loadSettings } from "../src/settings";

const settings = () => loadSettings(null);
const runner = () => findPandoc(process.env.PANDOC_PATH ?? "");

test("fictional outline becomes three comments and three paragraphs in both formats", async () => {
  const source = await readFile(new URL("../examples/outline.md", import.meta.url), "utf8");
  const pandoc = await runner();
  const parsed = JSON.parse(await pandoc.run(["-f", "markdown+wikilinks_title_after_pipe-smart-citations-auto_identifiers", "-t", "json"], source)) as PandocDocument;
  for (const format of ["latex", "typst"] as const) {
    const transformed = await transformDocument(parsed, format, settings());
    assert.equal(transformed.document.blocks.filter(block => block.t === "RawBlock").length, 3);
    assert.equal(transformed.document.blocks.filter(block => block.t === "Para").length, 3);
    const result = await convertMarkdown(source, format, settings(), pandoc);
    assert.deepEqual(result.citations, ["Example2024-aa", "Demo2023-bb", "Sample2022-cc", "Placeholder2021-dd"]);
    assert.deepEqual(result.warnings, []);
    assert.match(result.body, format === "latex" ? /\\subsection\{Planning a community/ : /^== Planning a community/);
    assert.match(result.body, format === "latex" ? /\\citep\{Example2024-aa,Demo2023-bb\}/ : /#cite\(<Example2024-aa>, form: "prose"\) #cite\(<Demo2023-bb>, form: "prose"\)/);
    assert.match(result.body, /すべて架空のものです：\n/);
    assert.ok(result.body.indexOf("すべて架空") < result.body.indexOf("Compare two"));
    assert.ok(result.body.indexOf("Compare two") < result.body.indexOf("Use a simple"));
    assert.ok(result.body.indexOf("Use a simple") < result.body.indexOf("Keep the introduction"));
    assert.doesNotMatch(result.body, /begin\{itemize\}|^\s*- /m);
  }
});

test("tabs and spaces have the same outline semantics; label-only items are noticed", async () => {
  const pandoc = await runner();
  const tabs = "- Label\n\t- First\n\t\t- Second\n\t- Third\n- Empty\n";
  const spaces = tabs.replace(/\t/g, "    ");
  const left = await convertMarkdown(tabs, "latex", settings(), pandoc);
  const right = await convertMarkdown(spaces, "latex", settings(), pandoc);
  assert.deepEqual(left, right);
  assert.match(left.body, /% Label\n\nFirst\nSecond\nThird\n\n% Empty/);
  assert.deepEqual(left.warnings, ["Label has no body text: Empty"]);
});

test("normal wikilinks, aliases and heading links are deleted; external links survive", async () => {
  const config = settings();
  config.excludedLinks = ["Example2024-aa"];
  config.forcedCitations = ["odd:key", "Example2024-aa"];
  const result = await convertMarkdown("Text [[Note|Display]] [[Example2024-aa]] [[Example2024-aa#Section]] [[odd:key|Alias]] [web](https://example.com)\n", "latex", config, await runner());
  assert.deepEqual(result.removedLinks, ["Note", "Example2024-aa", "Example2024-aa#Section"]);
  assert.deepEqual(result.citations, ["odd:key"]);
  assert.doesNotMatch(result.body, /Display|Section|Alias/);
  assert.match(result.body, /\\citep\{odd:key\}/);
  assert.match(result.body, /https:\/\/example.com/);
});

test("emphasis citations are transformed and code literals are left alone", async () => {
  const source = "- Label\n    - **Strong [[Example2024-aa]]** and `[[Literal]]`\n\n```text\n[[Another literal]]\n![[code-only-embed]]\n```\n";
  const result = await convertMarkdown(source, "typst", settings(), await runner());
  assert.match(result.body, /#cite\(<Example2024-aa>, form: "prose"\)/);
  assert.match(result.body, /\[\[Literal\]\]/);
  assert.match(result.body, /\[\[Another literal\]\]/);
  assert.deepEqual(result.removedLinks, []);
});

test("note embeds are rejected before writing", async () => {
  const pandoc = await runner();
  for (const source of ["![[Other note]]", "Before ![[Other note]] after"]) {
    await assert.rejects(convertMarkdown(source, "latex", settings(), pandoc), /Unsupported content/);
  }
});

test("normal headings, lists, math and source line breaks remain intact", async () => {
  const source = "# One\n\n## Two\n\n### Three\n\nA & B_1 costs 20% and $x^2$.\nNext line.\n\n1. Ordered\n2. Second\n";
  const pandoc = await runner();
  const latex = await convertMarkdown(source, "latex", settings(), pandoc);
  assert.match(latex.body, /\\section\{One\}/);
  assert.match(latex.body, /\\subsection\{Two\}/);
  assert.match(latex.body, /\\subsubsection\{Three\}/);
  assert.match(latex.body, /A \\& B\\_1 costs 20\\%/);
  assert.match(latex.body, /\nNext line\./);
  assert.match(latex.body, /\\begin\{enumerate\}/);
  assert.match(latex.body, /x\^2/);
});

test("citation command and prose/normal settings control output", async () => {
  const pandoc = await runner();
  const config = settings();
  config.latexCitation = "parencite";
  config.typstCitation = "normal";
  config.forcedCitations = ["DBLP:books/lib/Knuth86a"];
  const latex = await convertMarkdown("[[Example2024-aa]]", "latex", config, pandoc);
  assert.match(latex.body, /\\parencite\{Example2024-aa\}/);
  const typst = await convertMarkdown("[[DBLP:books/lib/Knuth86a]]", "typst", config, pandoc);
  assert.match(typst.body, /#cite\(label\("DBLP:books\/lib\/Knuth86a"\), form: "normal"\)/);
});

test("metadata is ignored and empty input / invalid pattern / runner failures propagate", async () => {
  const pandoc = await runner();
  const result = await convertMarkdown("---\ntitle: Ignored title\nauthor: Ignored author\n---\n\nText\n", "latex", settings(), pandoc);
  assert.equal(result.body.trim(), "Text");
  await assert.rejects(convertMarkdown(" ", "latex", settings(), pandoc), /no Markdown/);
  const config = settings(); config.citationPattern = "[";
  await assert.rejects(convertMarkdown("Text", "latex", config, pandoc), /regular expression/);
  const failing: PandocRunner = { run: async () => { throw new Error("Pandoc unavailable"); } };
  await assert.rejects(convertMarkdown("Text", "latex", settings(), failing), /Pandoc unavailable/);
  await assert.rejects(findPandoc("/nonexistent/pandoc-executable"), /configured Pandoc/);
});
