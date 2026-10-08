import { validateOutputFolder, type OutputFormat } from "./settings";

export interface ExportStorage {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  create(path: string, text: string): Promise<void>;
}

export async function saveExport(storage: ExportStorage, folder: string, basename: string, format: OutputFormat, text: string): Promise<string> {
  validateOutputFolder(folder);
  const name = basename.replace(/\.md$/i, "").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().replace(/[. ]+$/g, "") || "Untitled";
  const extension = format === "latex" ? "tex" : "typ";
  let directory = "";
  for (const part of folder.split("/")) {
    directory = directory ? `${directory}/${part}` : part;
    if (!await storage.exists(directory)) {
      try { await storage.mkdir(directory); }
      catch (error) { if (!await storage.exists(directory)) throw error; }
    }
  }
  for (let index = 0; index < 10_000; index++) {
    const path = `${folder}/${name}${index ? `-${index}` : ""}.${extension}`;
    if (await storage.exists(path)) continue;
    try { await storage.create(path, text); return path; }
    catch (error) { if (!await storage.exists(path)) throw error; }
  }
  throw new Error("Too many exports with the same filename. Choose another output folder.");
}
