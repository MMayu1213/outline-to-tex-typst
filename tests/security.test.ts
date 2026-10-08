import test from "node:test";
import assert from "node:assert/strict";
import { matchCitationPattern } from "../src/citation-pattern";
import { convertMarkdown } from "../src/converter";
import { findPandoc } from "../src/pandoc";
import { loadSettings } from "../src/settings";

test("a pathological citation pattern times out without blocking the event loop", async () => {
  let ticks = 0;
  const interval = setInterval(() => ticks++, 20);
  try {
    await assert.rejects(matchCitationPattern("^(a+)+$", ["a".repeat(100) + "!"]), /took too long/);
    assert.ok(ticks >= 5, "UI event loop should keep running while matching");
    assert.deepEqual(await matchCitationPattern("^Example", ["Example2024-aa", "Note"]), new Set(["Example2024-aa"]));
  } finally { clearInterval(interval); }
});

test("citation limits reject excessive input before creating a worker", async () => {
  await assert.rejects(matchCitationPattern("a".repeat(4097), ["key"]), /too large/);
  await assert.rejects(matchCitationPattern(".*", ["a".repeat(4097)]), /too large/);
});

test("excluded and forced citations bypass a pathological pattern", async () => {
  const settings = loadSettings(null);
  const key = "a".repeat(100) + "!";
  settings.citationPattern = "^(a+)+$";
  settings.forcedCitations = [key];
  const runner = await findPandoc(process.env.PANDOC_PATH ?? "");
  const cited = await convertMarkdown(`[[${key}]]`, "typst", settings, runner);
  assert.deepEqual(cited.citations, [key]);
  settings.excludedLinks = [key];
  const excluded = await convertMarkdown(`[[${key}]]`, "typst", settings, runner);
  assert.deepEqual(excluded.citations, []);
  assert.deepEqual(excluded.removedLinks, [key]);
});
