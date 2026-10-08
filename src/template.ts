import type { OutputFormat, PluginSettings } from "./settings";

export interface Metadata { title: string; author: string; date: string }

export function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function metadataFor(filename: string, settings: PluginSettings, now = new Date()): Metadata {
  return {
    title: settings.titleMode === "filename" ? filename.replace(/\.md$/i, "") : settings.titleMode === "fixed" ? settings.titleValue : "",
    author: settings.authorMode === "fixed" ? settings.authorValue : "",
    date: settings.dateMode === "today" ? localDate(now) : settings.dateMode === "fixed" ? settings.dateValue : "",
  };
}

export function escapeMetadata(value: string, format: OutputFormat): string {
  // Metadata fields are single-line text, never executable target-language code.
  const text = value.replace(/[\r\n]+/g, " ");
  if (format === "latex") {
    const replacements: Record<string, string> = {
      "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "$": "\\$", "&": "\\&", "#": "\\#",
      "%": "\\%", "_": "\\_", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}",
    };
    return text.replace(/[\\{}$&#%_~^]/g, char => replacements[char]);
  }
  return text.replace(/[\\#*_@$<>\[\]`~=+\-\/]/g, char => `\\${char}`);
}

export function applyTemplate(template: string, body: string, metadata: Metadata, format: OutputFormat): string {
  if ((template.match(/\{\{body\}\}/g) ?? []).length !== 1) {
    throw new Error("Template must contain exactly one {{body}} placeholder.");
  }
  const replacements: Record<string, string> = { body };
  for (const key of ["title", "author", "date"] as const) replacements[key] = escapeMetadata(metadata[key], format);
  return template.replace(/\{\{(body|title|author|date)\}\}/g, (_match, key: string) => replacements[key]);
}
