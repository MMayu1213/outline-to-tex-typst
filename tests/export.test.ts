import test from "node:test";
import assert from "node:assert/strict";
import { saveExport, type ExportStorage } from "../src/export";

function memoryStorage(): ExportStorage & { files: Map<string, string>; folders: Set<string> } {
  const files = new Map<string, string>(); const folders = new Set<string>();
  return {
    files, folders,
    exists: async path => files.has(path) || folders.has(path),
    mkdir: async path => { folders.add(path); },
    create: async (path, text) => {
      if (files.has(path)) throw new Error("Exists");
      files.set(path, text);
    },
  };
}

test("exports create nested folders and never overwrite existing files", async () => {
  const storage = memoryStorage();
  assert.equal(await saveExport(storage, "Papers/exports", "Note.md", "latex", "first"), "Papers/exports/Note.tex");
  assert.equal(await saveExport(storage, "Papers/exports", "Note.md", "latex", "second"), "Papers/exports/Note-1.tex");
  assert.equal(await saveExport(storage, "Papers/exports", "Note.md", "typst", "typst"), "Papers/exports/Note.typ");
  assert.equal(storage.files.get("Papers/exports/Note.tex"), "first");
  assert.deepEqual([...storage.folders], ["Papers", "Papers/exports"]);
});

test("concurrent exports choose separate files and save failures propagate", async () => {
  const storage = memoryStorage();
  const paths = await Promise.all([saveExport(storage, "exports", "Note", "latex", "a"), saveExport(storage, "exports", "Note", "latex", "b")]);
  assert.equal(new Set(paths).size, 2);
  assert.equal(await saveExport(storage, "exports", "A/B:note.md", "typst", "x"), "exports/A_B_note.typ");
  const failing = { ...storage, create: async () => { throw new Error("Disk error"); } };
  await assert.rejects(saveExport(failing, "exports", "Other", "latex", "x"), /Disk error/);
});
