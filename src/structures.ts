import type { AstNode } from "./converter";
import type { OutputFormat, PluginSettings } from "./settings";
import { escapeMetadata } from "./template";

export function inlineText(nodes: AstNode[]): string {
  return nodes.map(node => {
    if (node.t === "Str") return node.c;
    if (["Space", "SoftBreak", "LineBreak"].includes(node.t)) return " ";
    if (["Code", "Math"].includes(node.t)) return node.c[1];
    if (["Link", "Image", "Span", "Quoted", "Cite"].includes(node.t)) return inlineText(node.c[1]);
    return Array.isArray(node.c) ? inlineText(node.c) : "";
  }).join("");
}

export function excludeSections(blocks: AstNode[], names: string[]): { blocks: AstNode[]; excluded: string[] } {
  const excluded: string[] = [];
  const targets = new Set(names.map(name => name.trim().replace(/^#+\s*/, "").toLowerCase()).filter(Boolean));
  const result: AstNode[] = [];
  let excludedLevel = 0;
  for (const block of blocks) {
    if (block.t === "Header") {
      if (excludedLevel && block.c[0] <= excludedLevel) excludedLevel = 0;
      if (!excludedLevel && targets.has(inlineText(block.c[2]).trim().toLowerCase())) {
        excludedLevel = block.c[0]; excluded.push(inlineText(block.c[2]));
      }
    }
    if (!excludedLevel) result.push(block);
  }
  return { blocks: result, excluded };
}

// Accept the requested compact headings (#メモ / #todo), without changing code.
export function normalizeExcludedHeadings(source: string, names: string[]): string {
  const targets = new Set(names.map(name => name.trim().replace(/^#+\s*/, "").toLowerCase()));
  let fence: { char: string; length: number } | undefined;
  return source.split("\n").map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return line;
    }
    if (fence) return line;
    const heading = line.match(/^( {0,3})(#{1,6})([^#\s].*?)\s*$/);
    return heading && targets.has(heading[3].trim().toLowerCase()) ? `${heading[1]}${heading[2]} ${heading[3]}` : line;
  }).join("\n");
}

export function parseCallout(block: AstNode): { title: string; kind: "hypothesis" | "theorem" | "box"; body: AstNode[] } | null {
  if (block.t !== "BlockQuote" || !["Para", "Plain"].includes(block.c[0]?.t)) return null;
  const first = block.c[0];
  const breakAt = first.c.findIndex((node: AstNode) => ["SoftBreak", "LineBreak"].includes(node.t));
  const header = inlineText(breakAt < 0 ? first.c : first.c.slice(0, breakAt));
  const match = header.match(/^\[!([^\]]+)\][+-]?\s*(.*)$/);
  if (!match) return null;
  const type = match[1].split(":")[0].trim().toLowerCase();
  const kind = ["h", "hypothesis", "仮説"].includes(type) ? "hypothesis" : ["theorem", "定理"].includes(type) ? "theorem" : "box";
  const title = match[2] || match[1].trim();
  const remaining = breakAt < 0 ? [] : first.c.slice(breakAt + 1);
  return { kind, title, body: [...(remaining.length ? [{ ...first, c: remaining }] : []), ...block.c.slice(1)] };
}

export function wrapCallout(title: string, kind: "hypothesis" | "theorem" | "box", body: AstNode[], format: OutputFormat, settings: PluginSettings): AstNode[] {
  const text = escapeMetadata(title, format);
  let opening: string, closing: string;
  if (format === "latex" && settings.latexCalloutStyle === "theorem" && kind !== "box") {
    opening = `\\begin{${kind}}[{${text}}]`; closing = `\\end{${kind}}`;
  } else if (format === "latex") {
    opening = `\\par\\noindent\\fbox{\\begin{minipage}{0.94\\linewidth}\n\\textbf{${text}}\\par\\smallskip`;
    closing = "\\end{minipage}}\\par";
  } else {
    opening = `#block(width: 100%, stroke: 0.6pt, inset: 10pt, breakable: true)[\n#text(weight: "bold")[${text}]\n#parbreak()`;
    closing = "]";
  }
  return [{ t: "RawBlock", c: [format, opening] }, ...body, { t: "RawBlock", c: [format, closing] }];
}

export type ImageResolver = (target: string, wikilink: boolean) => string;

export function figureBlocks(image: AstNode, caption: AstNode[], format: OutputFormat, resolve?: ImageResolver): { blocks: AstNode[]; path: string } {
  let target: string = image.c[2][0];
  try { target = decodeURIComponent(target); } catch { /* Keep literal paths. */ }
  const path = resolve ? resolve(target, image.c[2][1] === "wikilink") : target;
  const extensions = format === "latex" ? /\.(png|jpe?g|pdf)$/i : /\.(png|jpe?g|pdf|svg)$/i;
  if (!extensions.test(path) || /[\x00-\x1f\\{}%#^~]/.test(path) || /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/)/.test(path)) {
    throw new Error(`Unsupported or unsafe image path for ${format}: ${path}. Use a relative PNG, JPG, PDF${format === "typst" ? " or SVG" : ""} path.`);
  }
  const raw = (text: string): AstNode => ({ t: "RawBlock", c: [format, text] });
  const inline = (text: string): AstNode => ({ t: "RawInline", c: [format, text] });
  if (format === "latex") return {
    path, blocks: [raw(`\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=\\linewidth]{\\detokenize{${path}}}`),
      ...(caption.length ? [{ t: "Para", c: [inline("\\caption{"), ...caption, inline("}")] }] : []), raw("\\end{figure}")],
  };
  return { path, blocks: caption.length
    ? [raw(`#figure(\nimage(${JSON.stringify(path)}, width: 100%),\ncaption: [`), { t: "Para", c: caption }, raw("]\n)")]
    : [raw(`#figure(image(${JSON.stringify(path)}, width: 100%))`)] };
}
