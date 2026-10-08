import test from "node:test";
import assert from "node:assert/strict";
import { loadSettings, validateSettings } from "../src/settings";
import { applyTemplate, escapeMetadata, localDate, metadataFor } from "../src/template";

test("settings JSON round trip, defaults, and invalid stored value recovery", () => {
  const defaults = loadSettings(null);
  assert.equal(defaults.authorValue, "");
  const modified = { ...defaults, authorValue: "Example Author", dateMode: "fixed", dateValue: "2026-10-08" };
  assert.deepEqual(loadSettings(JSON.parse(JSON.stringify(modified))), modified);
  const invalid = loadSettings({ titleMode: "wrong", forcedCitations: ["key", 12], pandocPath: 42 });
  assert.equal(invalid.titleMode, "filename");
  assert.equal(invalid.pandocPath, "");
  assert.deepEqual(invalid.forcedCitations, ["key"]);
  const first = loadSettings(null); first.forcedCitations.push("private");
  assert.deepEqual(loadSettings(null).forcedCitations, []);
});

test("all metadata modes use filename and local conversion date", () => {
  const config = loadSettings(null);
  const date = new Date(2026, 9, 8, 0, 5);
  assert.equal(localDate(date), "2026-10-08");
  assert.deepEqual(metadataFor("My note.md", config, date), { title: "My note", author: "", date: "2026-10-08" });
  config.authorValue = "An Author"; config.titleMode = "fixed"; config.titleValue = "A title";
  config.dateMode = "fixed"; config.dateValue = "October 2026";
  assert.deepEqual(metadataFor("Other.md", config, date), { title: "A title", author: "An Author", date: "October 2026" });
  config.titleMode = "omit"; config.authorMode = "omit"; config.dateMode = "omit";
  assert.deepEqual(metadataFor("Other.md", config, date), { title: "", author: "", date: "" });
});

test("template insertion is single pass and escapes metadata without escaping body", () => {
  const result = applyTemplate("{{title}}\n{{author}}\n{{date}}\n{{body}}\n{{title}}", "\\citep{x}\n{{author}}", { title: "A&B_1%", author: "User", date: "today" }, "latex");
  assert.equal(result, "A\\&B\\_1\\%\nUser\ntoday\n\\citep{x}\n{{author}}\nA\\&B\\_1\\%");
  assert.equal(escapeMetadata("[x] #evil(1) $y$", "typst"), "\\[x\\] \\#evil(1) \\$y\\$");
  assert.equal(escapeMetadata("日本語", "latex"), "日本語");
  for (const template of ["no body", "{{body}} {{body}}"]) assert.throws(() => applyTemplate(template, "", { title: "", author: "", date: "" }, "typst"), /exactly one/);
});

test("bundled templates accept all placeholders and retain reference paths", () => {
  const config = loadSettings(null);
  const meta = metadataFor("Title.md", config, new Date(2026, 9, 8));
  for (const format of ["latex", "typst"] as const) {
    const source = applyTemplate(format === "latex" ? config.latexTemplate : config.typstTemplate, "BODY", meta, format);
    assert.doesNotMatch(source, /\{\{(body|title|author|date)\}\}/);
    assert.match(source, /BODY/); assert.match(source, /references/);
  }
});

test("invalid export folders are rejected", () => {
  for (const outputFolder of ["", "/absolute", "../escape", "exports/../escape", "C:\\exports", "exports//nested"]) {
    assert.throws(() => validateSettings({ ...loadSettings(null), outputFolder }), /Output folder/);
  }
});
