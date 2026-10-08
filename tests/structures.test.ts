import test from "node:test";
import assert from "node:assert/strict";
import { convertMarkdown } from "../src/converter";
import { findPandoc } from "../src/pandoc";
import { loadSettings, LATEX_TEMPLATE } from "../src/settings";

test("excluded sections include subsections, resume at a peer, and leave code intact", async () => {
  const source = "# Main\n\nKeep.\n\n## メモ\n\n![[private-note]]\n\n### Nested\n\nHidden [[Hidden2024-aa]].\n\n## Results\n\nVisible.\n\n#TODO\n\nPrivate.\n\n# End\n\n```md\n#todo\nLiteral.\n```\n";
  for (const format of ["latex", "typst"] as const) {
    const result = await convertMarkdown(source, format, loadSettings(null), await findPandoc(""));
    assert.deepEqual(result.excludedSections, ["メモ", "TODO"]);
    assert.doesNotMatch(result.body, /private-note|Hidden|Private|Nested/);
    assert.match(result.body, /Visible/);
    assert.match(result.body, /#todo/);
    assert.match(result.body, /Literal/);
    assert.deepEqual(result.citations, []);
  }
});

test("section exclusions use exact configurable titles", async () => {
  const settings = loadSettings(null);
  settings.excludedSections = ["Scratch"];
  const result = await convertMarkdown("# todo\n\nKeep default title.\n\n## Scratch work\n\nKeep prefix.\n\n## Scratch\n\nRemove.\n\n## Next\n\nKeep next.", "latex", settings, await findPandoc(""));
  assert.doesNotMatch(result.body, /Remove/);
  assert.match(result.body, /Keep prefix/);
  assert.match(result.body, /Keep default title/);
  assert.deepEqual(result.excludedSections, ["Scratch"]);
});

test("hypothesis and theorem callouts preserve body, citation and escaped titles", async () => {
  const source = "> [!hypothesis]+ A & B [x]\n> Sentence [[Example2024-aa]].\n>\n> Second paragraph.\n\n> [!theorem] Result\n> A theorem.\n\n> [!H: Example] Another hypothesis\n> Last sentence.";
  const settings = loadSettings(null);
  const runner = await findPandoc("");
  const latex = await convertMarkdown(source, "latex", settings, runner);
  assert.match(latex.body, /\\begin\{hypothesis\}\[\{A \\& B \[x\]\}\]/);
  assert.match(latex.body, /\\begin\{theorem\}/);
  assert.match(latex.body, /\\citep\{Example2024-aa\}/);
  assert.match(latex.body, /Second paragraph/);
  assert.doesNotMatch(latex.body, /\[!hypothesis\]/);
  const typst = await convertMarkdown(source, "typst", settings, runner);
  assert.match(typst.body, /#block\(width: 100%, stroke: 0.6pt/);
  assert.match(typst.body, /#cite\(<Example2024-aa>/);
  settings.latexCalloutStyle = "box";
  const box = await convertMarkdown(source, "latex", settings, runner);
  assert.match(box.body, /\\fbox\{/);
  assert.doesNotMatch(box.body, /\\begin\{hypothesis\}/);
});

test("figures and callouts inside outlines split paragraphs without changing order", async () => {
  const source = "- Label\n    - Before.\n    - ![A caption](plot.png)\n    - > [!hypothesis] Claim\n      > Body.\n    - After.\n";
  const result = await convertMarkdown(source, "latex", loadSettings(null), await findPandoc(""));
  assert.match(result.body, /\\begin\{figure\}\[htbp\]/);
  assert.match(result.body, /\\caption\{A caption\}/);
  assert.match(result.body, /\\begin\{hypothesis\}/);
  assert.ok(result.body.indexOf("Before") < result.body.indexOf("begin{figure}"));
  assert.ok(result.body.indexOf("end{figure}") < result.body.indexOf("begin{hypothesis}"));
  assert.ok(result.body.indexOf("end{hypothesis}") < result.body.indexOf("After"));
  assert.deepEqual(result.images, ["plot.png"]);
});

test("wikilink image sizes are not captions and paths resolve relative to export location", async () => {
  const runner = await findPandoc("");
  const settings = loadSettings(null);
  const result = await convertMarkdown("![[plot.png|400]]", "typst", settings, runner, () => "../Attachments/plot.png");
  assert.match(result.body, /#figure\(image\("\.\.\/Attachments\/plot.png"/);
  assert.doesNotMatch(result.body, /caption|400/);
  await assert.rejects(convertMarkdown("![Caption](https://example.com/plot.png)", "latex", settings, runner), /unsafe image path/);
  await assert.rejects(convertMarkdown("![Caption](bad%23name.png)", "latex", settings, runner), /unsafe image path/);
});

test("old starter preamble upgrades without changing custom templates", () => {
  const old = LATEX_TEMPLATE.replace("\\usepackage{amsthm}\n\\newtheorem{hypothesis}{Hypothesis}\n\\newtheorem{theorem}{Theorem}\n", "");
  assert.equal(loadSettings({ latexTemplate: old }).latexTemplate, LATEX_TEMPLATE);
  assert.equal(loadSettings({ latexTemplate: "custom {{body}}" }).latexTemplate, "custom {{body}}");
});
