export type OutputFormat = "latex" | "typst";
export type TitleMode = "filename" | "fixed" | "omit";
export type AuthorMode = "fixed" | "omit";
export type DateMode = "today" | "fixed" | "omit";
export type LatexCitation = "citep" | "cite" | "parencite";
export type TypstCitation = "prose" | "normal";

export interface PluginSettings {
  schemaVersion: 1;
  titleMode: TitleMode;
  titleValue: string;
  authorMode: AuthorMode;
  authorValue: string;
  dateMode: DateMode;
  dateValue: string;
  latexCitation: LatexCitation;
  typstCitation: TypstCitation;
  citationPattern: string;
  forcedCitations: string[];
  excludedLinks: string[];
  latexTemplate: string;
  typstTemplate: string;
  pandocPath: string;
  outputFolder: string;
}

export const LATEX_TEMPLATE = String.raw`\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{natbib}
\usepackage{hyperref}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}

\title{ {{title}} }
\author{ {{author}} }
\date{ {{date}} }

\begin{document}
\maketitle

{{body}}

% Supply references.bib alongside the exported document.
\bibliographystyle{plainnat}
\bibliography{references}
\end{document}
`;

export const TYPST_TEMPLATE = `#set page(paper: "a4")
#set text(size: 11pt)
#set heading(numbering: "1.1")

#align(center)[
  #text(size: 16pt, weight: "bold")[{{title}}]

  {{author}}

  {{date}}
]

{{body}}

// Supply references.bib alongside the exported document.
#bibliography("references.bib")
`;

export const DEFAULT_SETTINGS: PluginSettings = {
  schemaVersion: 1,
  titleMode: "filename",
  titleValue: "",
  authorMode: "fixed",
  authorValue: "",
  dateMode: "today",
  dateValue: "",
  latexCitation: "citep",
  typstCitation: "prose",
  citationPattern: "^[A-Za-z][A-Za-z0-9_]*[12][0-9]{3}-[A-Za-z]{2}$",
  forcedCitations: [],
  excludedLinks: [],
  latexTemplate: LATEX_TEMPLATE,
  typstTemplate: TYPST_TEMPLATE,
  pandocPath: "",
  outputFolder: "exports",
};

export function loadSettings(data: unknown): PluginSettings {
  const input = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const settings: PluginSettings = { ...DEFAULT_SETTINGS, forcedCitations: [], excludedLinks: [] };
  const strings = ["titleValue", "authorValue", "dateValue", "citationPattern", "latexTemplate", "typstTemplate", "pandocPath", "outputFolder"] as const;
  for (const key of strings) if (typeof input[key] === "string") settings[key] = input[key];
  const enums = {
    titleMode: ["filename", "fixed", "omit"], authorMode: ["fixed", "omit"],
    dateMode: ["today", "fixed", "omit"], latexCitation: ["citep", "cite", "parencite"],
    typstCitation: ["prose", "normal"],
  } as const;
  for (const [key, values] of Object.entries(enums)) {
    if (typeof input[key] === "string" && (values as readonly string[]).includes(input[key])) {
      Object.assign(settings, { [key]: input[key] });
    }
  }
  for (const key of ["forcedCitations", "excludedLinks"] as const) {
    if (Array.isArray(input[key])) settings[key] = input[key].filter((item): item is string => typeof item === "string");
  }
  return settings;
}

export function validateSettings(settings: PluginSettings): void {
  if (!settings.citationPattern.trim()) throw new Error("Citation pattern must not be empty.");
  try { new RegExp(settings.citationPattern); }
  catch { throw new Error("Citation pattern is not a valid regular expression."); }
  validateOutputFolder(settings.outputFolder);
}

export function validateOutputFolder(folder: string): void {
  if (!folder.trim() || /[\\:]/.test(folder) || folder.startsWith("/") || folder.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Output folder must be a relative Vault folder, e.g. exports. Use / between folders and no . or .. segments.");
  }
}
