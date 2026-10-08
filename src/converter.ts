import type { PandocRunner } from "./pandoc";
import { matchCitationPattern } from "./citation-pattern";
import { excludeSections, normalizeExcludedHeadings, parseCallout, wrapCallout, figureBlocks, type ImageResolver } from "./structures";
import { validateSettings, type OutputFormat, type PluginSettings } from "./settings";

export interface AstNode { t: string; c?: any }
export interface PandocDocument { "pandoc-api-version": number[]; meta: Record<string, unknown>; blocks: AstNode[] }
export interface ConversionResult { body: string; citations: string[]; removedLinks: string[]; warnings: string[]; images: string[]; excludedSections: string[] }
interface Report { citations: Set<string>; removedLinks: Set<string>; warnings: string[]; patternMatches: Set<string>; images: Set<string>; excludedSections: string[]; imageResolver?: ImageResolver }

function plainText(nodes: AstNode[]): string {
  return nodes.map(node => {
    if (node.t === "Str" || node.t === "Code" || node.t === "Math") return node.t === "Str" ? node.c : node.c[1];
    if (["Space", "SoftBreak", "LineBreak"].includes(node.t)) return " ";
    if (node.t === "Link" || node.t === "Image" || node.t === "Span") return plainText(node.c[1]);
    if (["Emph", "Strong", "Strikeout", "Superscript", "Subscript", "SmallCaps"].includes(node.t)) return plainText(node.c);
    if (node.t === "Quoted" || node.t === "Cite") return plainText(node.c[1]);
    return "";
  }).join("");
}

function isWiki(node: AstNode): boolean {
  return node.t === "Link" && node.c[2][1] === "wikilink";
}

function walk(value: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(value)) { for (const item of value) walk(item, visit); }
  else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.t === "string") visit(record as unknown as AstNode);
    for (const item of Object.values(record)) walk(item, visit);
  }
}

function assertSupported(doc: PandocDocument): void {
  const issues = new Set<string>();
  walk(doc.blocks, node => {
    if (node.t === "Image" && node.c[2][1] === "wikilink" && !/\.(png|jpe?g|pdf|svg)$/i.test(node.c[2][0])) {
      issues.add(`Note embed is not supported: ${node.c[2][0]}`);
    }
    if (node.t === "Para" || node.t === "Plain") {
      for (let i = 0; i < node.c.length; i++) {
        if (isWiki(node.c[i]) && node.c[i - 1]?.t === "Str" && node.c[i - 1].c.endsWith("!")) {
          issues.add(`Embed: ![[${node.c[i].c[2][0]}]]`);
        }
      }
    }
    if (node.t === "RawBlock" || node.t === "RawInline") issues.add(`Raw ${node.c[0]} content is not supported. Use a template for target-language code.`);
  });
  if (issues.size) throw new Error(`Unsupported content:\n${[...issues].join("\n")}`);
}

function quoteTypstKey(key: string): string {
  return /^[A-Za-z0-9_:.\-]+$/.test(key) ? `<${key}>` : `label(${JSON.stringify(key)})`;
}

function citation(keys: string[], format: OutputFormat, settings: PluginSettings): AstNode {
  if (format === "latex") {
    if (keys.some(key => /[\\{}%,\s#&$^~]/.test(key))) throw new Error(`Citation key cannot be safely represented in LaTeX: ${keys.join(", ")}`);
    return { t: "RawInline", c: ["latex", `\\${settings.latexCitation}{${keys.join(",")}}`] };
  }
  return { t: "RawInline", c: ["typst", keys.map(key => `#cite(${quoteTypstKey(key)}, form: "${settings.typstCitation}")`).join(" ")] };
}

function transformInlines(nodes: AstNode[], format: OutputFormat, settings: PluginSettings, report: Report): AstNode[] {
  const forced = new Set(settings.forcedCitations);
  const excluded = new Set(settings.excludedLinks);
  const keyFor = (node: AstNode): string | null => {
    if (!isWiki(node)) return null;
    const target: string = node.c[2][0];
    // Links to a heading, block, or path are ordinary links unless explicitly forced.
    return !excluded.has(target) && (forced.has(target) || report.patternMatches.has(target)) ? target : null;
  };
  const output: AstNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (isWiki(node)) {
      const key = keyFor(node);
      if (!key) { report.removedLinks.add(node.c[2][0]); continue; }
      const keys = [key];
      while (i + 1 < nodes.length) {
        const next = keyFor(nodes[i + 1]);
        if (!next) break;
        keys.push(next); i++;
      }
      keys.forEach(item => report.citations.add(item));
      output.push(citation(keys, format, settings));
    } else if (["Emph", "Strong", "Strikeout", "Superscript", "Subscript", "SmallCaps"].includes(node.t)) {
      output.push({ ...node, c: transformInlines(node.c, format, settings, report) });
    } else if (["Link", "Span", "Quoted"].includes(node.t)) {
      output.push({ ...node, c: [node.c[0], transformInlines(node.c[1], format, settings, report), ...node.c.slice(2)] });
    } else if (node.t === "Image") {
      throw new Error("Inline images cannot become figures. Put each image on its own line.");
    } else if (node.t === "Note") {
      output.push({ ...node, c: transformBlocks(node.c, format, settings, report, false) });
    } else output.push(node);
  }
  // Remove whitespace left at edges by deleted links; retain internal line breaks.
  while (output.length && ["Space", "SoftBreak"].includes(output[0].t)) output.shift();
  while (output.length && ["Space", "SoftBreak"].includes(output[output.length - 1].t)) output.pop();
  return output;
}

function flattenChildren(blocks: AstNode[], format: OutputFormat, settings: PluginSettings, report: Report): AstNode[] {
  let lines: AstNode[][] = [];
  const result: AstNode[] = [];
  const flush = (): void => {
    if (lines.length) result.push({ t: "Para", c: lines.flatMap((line, index) => index ? [{ t: "SoftBreak" }, ...line] : line) });
    lines = [];
  };
  const collect = (items: AstNode[]): void => {
    for (const block of items) {
      if (block.t === "Plain" || block.t === "Para") {
        const line = transformInlines(block.c, format, settings, report);
        if (line.length) lines.push(line);
      } else if (block.t === "BulletList" || block.t === "OrderedList") {
        const children: AstNode[][] = block.t === "BulletList" ? block.c : block.c[1];
        children.forEach(collect);
      } else if (block.t === "Figure" || parseCallout(block)) {
        flush();
        result.push(...transformBlocks([block], format, settings, report, false));
      } else {
        throw new Error(`Cannot flatten ${block.t} inside an outline paragraph. Move this block outside the outline.`);
      }
    }
  };
  collect(blocks);
  flush();
  return result;
}

function transformBlocks(blocks: AstNode[], format: OutputFormat, settings: PluginSettings, report: Report, outline: boolean): AstNode[] {
  return blocks.flatMap(block => {
    if (block.t === "BulletList" && outline) {
      return (block.c as AstNode[][]).flatMap(item => {
        const firstChild = item.findIndex(child => child.t === "BulletList" || child.t === "OrderedList" || child.t === "Figure" || parseCallout(child));
        const labelBlocks = firstChild === -1 ? item : item.slice(0, firstChild);
        if (labelBlocks.some(label => !["Plain", "Para"].includes(label.t))) {
          throw new Error("Outline labels must contain text. Move structured blocks outside the outline.");
        }
        const label = labelBlocks.map(label => plainText(label.c)).join(" ").replace(/[\r\n]+/g, " ");
        const prefix = format === "latex" ? "%" : "//";
        const result: AstNode[] = [{ t: "RawBlock", c: [format, `${prefix} ${label}`] }];
        const body = firstChild === -1 ? [] : flattenChildren(item.slice(firstChild), format, settings, report);
        if (body.length) result.push(...body);
        else report.warnings.push(`Label has no body text: ${label}`);
        return result;
      });
    }
    const callout = parseCallout(block);
    if (callout) {
      if (format === "latex" && settings.latexCalloutStyle === "theorem" && callout.kind !== "box") {
        const message = `Callout uses the ${callout.kind} environment. Define it in your LaTeX preamble; the starter template includes it.`;
        if (!report.warnings.includes(message)) report.warnings.push(message);
      }
      return wrapCallout(callout.title, callout.kind, transformBlocks(callout.body, format, settings, report, false), format, settings);
    }
    if (block.t === "Figure") {
      const images: AstNode[] = [];
      walk(block.c[2], node => { if (node.t === "Image") images.push(node); });
      if (images.length !== 1) throw new Error("Each figure must contain exactly one image.");
      const image = images[0];
      const captionBlocks: AstNode[] = block.c[1][1];
      let caption = captionBlocks.flatMap((part, i) => {
        if (!["Plain", "Para"].includes(part.t)) throw new Error("Figure captions must contain inline text.");
        return [...(i ? [{ t: "Space" }] : []), ...part.c];
      });
      // Obsidian's numeric alias means display size, not a caption.
      if (image.c[2][1] === "wikilink" && (/^\d+(?:x\d+)?$/.test(plainText(caption)) || plainText(caption) === image.c[2][0])) caption = [];
      const figure = figureBlocks(image, transformInlines(caption, format, settings, report), format, report.imageResolver);
      report.images.add(figure.path);
      return figure.blocks;
    }
    if (block.t === "Plain" || block.t === "Para") {
      const inlines = transformInlines(block.c, format, settings, report);
      return inlines.length ? [{ ...block, c: inlines }] : [];
    }
    if (block.t === "Header") return [{ ...block, c: [block.c[0], block.c[1], transformInlines(block.c[2], format, settings, report)] }];
    if (block.t === "BlockQuote") return [{ ...block, c: transformBlocks(block.c, format, settings, report, false) }];
    if (block.t === "BulletList") return [{ ...block, c: block.c.map((item: AstNode[]) => transformBlocks(item, format, settings, report, false)) }];
    if (block.t === "OrderedList") return [{ ...block, c: [block.c[0], block.c[1].map((item: AstNode[]) => transformBlocks(item, format, settings, report, false))] }];
    if (block.t === "HorizontalRule" || block.t === "CodeBlock") return [block];
    throw new Error(`Unsupported Markdown block: ${block.t}. Move it to your document template or convert it manually.`);
  });
}

export async function transformDocument(doc: PandocDocument, format: OutputFormat, settings: PluginSettings, imageResolver?: ImageResolver): Promise<{ document: PandocDocument; report: Omit<ConversionResult, "body"> }> {
  validateSettings(settings);
  const filtered = excludeSections(doc.blocks, settings.excludedSections);
  doc = { ...doc, blocks: filtered.blocks };
  assertSupported(doc);
  const targets = new Set<string>();
  const forced = new Set(settings.forcedCitations);
  const excluded = new Set(settings.excludedLinks);
  walk(doc.blocks, node => {
    if (isWiki(node)) {
      const target: string = node.c[2][0];
      if (!forced.has(target) && !excluded.has(target) && !/[\/#]/.test(target)) targets.add(target);
    }
  });
  const patternMatches = await matchCitationPattern(settings.citationPattern, [...targets]);
  const report: Report = { citations: new Set(), removedLinks: new Set(), warnings: [], patternMatches, images: new Set(), excludedSections: filtered.excluded, imageResolver };
  return {
    document: { ...doc, meta: {}, blocks: transformBlocks(doc.blocks, format, settings, report, true) },
    report: { citations: [...report.citations], removedLinks: [...report.removedLinks], warnings: report.warnings, images: [...report.images], excludedSections: report.excludedSections },
  };
}

export async function convertMarkdown(markdown: string, format: OutputFormat, settings: PluginSettings, runner: PandocRunner, imageResolver?: ImageResolver): Promise<ConversionResult> {
  validateSettings(settings);
  if (!markdown.trim()) throw new Error("There is no Markdown text to convert.");
  const parsed = await runner.run([
    "--from=markdown+wikilinks_title_after_pipe+lists_without_preceding_blankline-smart-citations-auto_identifiers-raw_tex-raw_html",
    "--to=json", "--tab-stop=4",
  ], normalizeExcludedHeadings(markdown, settings.excludedSections));
  const doc = JSON.parse(parsed) as PandocDocument;
  if (!Array.isArray(doc.blocks) || !Array.isArray(doc["pandoc-api-version"])) throw new Error("Pandoc returned an invalid document.");
  const { document, report } = await transformDocument(doc, format, settings, imageResolver);
  const body = await runner.run(["--from=json", `--to=${format}`, "--wrap=preserve"], JSON.stringify(document));
  return { body, ...report };
}
