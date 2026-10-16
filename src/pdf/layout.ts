import { sanitizeTerminalText } from "../clip/terminal.js";
import type {
  PdfBounds,
  PdfDocumentMetadata,
  PdfImageCandidate,
  PdfImageInterpretation,
  PdfImageSemanticMetadata,
  PdfPageLayout,
  PdfTextFragment,
} from "./model.js";

const MAX_XML_ATTRIBUTE_CODE_UNITS = 64 * 1024;
const MAX_XML_TEXT_CODE_UNITS = 2 * 1024 * 1024;

type FontSpec = {
  readonly size: number;
};

export type ParsedPdfImage = PdfBounds & {
  readonly page: number;
  readonly sourcePath: string;
};

export type ParsedPdfPage = {
  readonly page: number;
  readonly width: number;
  readonly height: number;
  readonly text: readonly PdfTextFragment[];
  readonly images: readonly ParsedPdfImage[];
};

export type ParsedPopplerXml = {
  readonly pages: readonly ParsedPdfPage[];
  readonly popplerVersion: string | null;
  readonly truncated: boolean;
};

export type PdfLayoutBlock =
  | { readonly kind: "table"; readonly page: number; readonly rows: readonly (readonly string[])[] }
  | {
      readonly kind: "heading";
      readonly page: number;
      readonly level: number;
      readonly text: string;
    }
  | {
      readonly kind: "paragraph";
      readonly page: number;
      readonly text: string;
    }
  | {
      readonly kind: "list-item";
      readonly page: number;
      readonly text: string;
    }
  | {
      readonly kind: "image";
      readonly page: number;
      readonly image: PdfImageCandidate;
    };

type TextLine = PdfBounds & {
  readonly page: number;
  readonly text: string;
  readonly fontSize: number;
  readonly boldRatio: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function bounded(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  let end = maximum - 1;
  const final = value.charCodeAt(end - 1);
  if (final >= 0xd800 && final <= 0xdbff) end -= 1;
  return `${value.slice(0, Math.max(0, end))}…`;
}

function decodeXmlEntity(entity: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };
  const numeric = /^#(?:x([0-9a-f]+)|(\d+))$/iu.exec(entity);
  if (numeric !== null) {
    const value = Number.parseInt(numeric[1] ?? numeric[2] ?? "", numeric[1] === undefined ? 10 : 16);
    if (
      Number.isSafeInteger(value)
      && value > 0
      && value <= 0x10ffff
      && !(value >= 0xd800 && value <= 0xdfff)
    ) return String.fromCodePoint(value);
    return "\uFFFD";
  }
  return named[entity] ?? `&${entity};`;
}

export function decodePopplerText(value: string): string {
  const withoutMarkup = value.replace(/<[^>]{0,65536}>/gu, "");
  const decoded = withoutMarkup.replace(/&([a-z]+|#x[0-9a-f]+|#\d+);/giu, (_match, entity: string) =>
    decodeXmlEntity(entity.toLowerCase()));
  return sanitizeTerminalText(decoded)
    .replace(/[ﬁﬂﬀﬃﬄ]/gu, (ligature) => ({
      "ﬁ": "fi",
      "ﬂ": "fl",
      "ﬀ": "ff",
      "ﬃ": "ffi",
      "ﬄ": "ffl",
    })[ligature] ?? ligature)
    .normalize("NFC");
}

function attributes(value: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const pattern = /([a-zA-Z][a-zA-Z0-9_-]*)="([^"]*)"/gu;
  for (const match of value.matchAll(pattern)) {
    const key = match[1];
    const raw = match[2];
    if (key === undefined || raw === undefined || raw.length > MAX_XML_ATTRIBUTE_CODE_UNITS) continue;
    result[key] = decodePopplerText(raw);
  }
  return result;
}

function nonNegativeNumber(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000_000) {
    throw new Error(`Poppler XML contains an invalid ${label}`);
  }
  return parsed;
}

function positiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
    throw new Error(`Poppler XML contains an invalid ${label}`);
  }
  return parsed;
}

/**
 * Parse the small, line-oriented XML vocabulary emitted by `pdftohtml -xml`.
 * Foreign PDF text is never interpreted as XML markup beyond Poppler's fixed
 * page, fontspec, text, and image records.
 */
export function parsePopplerXml(
  xml: string,
  limits: {
    readonly maxPages: number;
    readonly maxImages: number;
    readonly maxTextFragments?: number;
  },
): ParsedPopplerXml {
  const maxTextFragments = Math.max(
    1,
    Math.min(limits.maxTextFragments ?? 500_000, 2_000_000),
  );
  const root = /<pdf2xml\b([^>]*)>/u.exec(xml);
  const popplerVersion = root === null ? null : (attributes(root[1] ?? "").version ?? null);
  const tokenPattern = /<page\b[^>]*>|<\/page>|<fontspec\b[^>]*\/>|<image\b[^>]*\/>|<text\b[^>]*>[\s\S]*?<\/text>/gu;
  const fonts = new Map<string, FontSpec>();
  const pages: ParsedPdfPage[] = [];
  let current: {
    page: number;
    width: number;
    height: number;
    text: PdfTextFragment[];
    images: ParsedPdfImage[];
  } | null = null;
  let imageCount = 0;
  let textCount = 0;
  let truncated = false;

  for (const tokenMatch of xml.matchAll(tokenPattern)) {
    const token = tokenMatch[0];
    if (token.startsWith("<page")) {
      if (current !== null) throw new Error("Poppler XML opened a page before closing the previous page");
      if (pages.length >= limits.maxPages) {
        truncated = true;
        continue;
      }
      const parsed = attributes(token);
      current = {
        page: positiveInteger(parsed.number, "page number"),
        width: nonNegativeNumber(parsed.width, "page width"),
        height: nonNegativeNumber(parsed.height, "page height"),
        text: [],
        images: [],
      };
      continue;
    }
    if (token === "</page>") {
      if (current === null) continue;
      pages.push(current);
      current = null;
      continue;
    }
    if (current === null) continue;
    if (token.startsWith("<fontspec")) {
      const parsed = attributes(token);
      const id = parsed.id;
      if (id !== undefined && id.length <= 256) {
        fonts.set(id, { size: nonNegativeNumber(parsed.size, "font size") });
      }
      continue;
    }
    if (token.startsWith("<image")) {
      if (imageCount >= limits.maxImages) {
        truncated = true;
        continue;
      }
      const parsed = attributes(token);
      const sourcePath = parsed.src;
      if (sourcePath === undefined || sourcePath === "") continue;
      current.images.push({
        page: current.page,
        top: nonNegativeNumber(parsed.top, "image top"),
        left: nonNegativeNumber(parsed.left, "image left"),
        width: nonNegativeNumber(parsed.width, "image width"),
        height: nonNegativeNumber(parsed.height, "image height"),
        sourcePath,
      });
      imageCount += 1;
      continue;
    }
    if (textCount >= maxTextFragments) {
      truncated = true;
      continue;
    }
    const openEnd = token.indexOf(">");
    const closeStart = token.lastIndexOf("</text>");
    if (openEnd < 0 || closeStart <= openEnd) continue;
    const parsed = attributes(token.slice(0, openEnd + 1));
    const fontId = parsed.font ?? "";
    const inner = token.slice(openEnd + 1, closeStart);
    if (inner.length > MAX_XML_TEXT_CODE_UNITS) {
      truncated = true;
      continue;
    }
    const text = bounded(decodePopplerText(inner), MAX_XML_TEXT_CODE_UNITS);
    current.text.push({
      top: nonNegativeNumber(parsed.top, "text top"),
      left: nonNegativeNumber(parsed.left, "text left"),
      width: nonNegativeNumber(parsed.width, "text width"),
      height: nonNegativeNumber(parsed.height, "text height"),
      text,
      fontId,
      fontSize: fonts.get(fontId)?.size ?? nonNegativeNumber(parsed.height, "text height"),
      bold: /<b(?:\s[^>]*)?>/iu.test(inner),
      italic: /<i(?:\s[^>]*)?>/iu.test(inner),
    });
    textCount += 1;
  }
  if (current !== null) throw new Error("Poppler XML ended before the current page was closed");
  if (pages.length === 0) throw new Error("Poppler XML contained no pages");
  return { pages, popplerVersion, truncated };
}

function normalizedInfoKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function boundedMetadata(value: string | undefined, maximum: number): string | null {
  const normalized = value?.trim();
  return normalized === undefined || normalized === ""
    ? null
    : bounded(sanitizeTerminalText(normalized), maximum);
}

/** Parse `pdfinfo`'s C-locale key/value output without trusting unknown fields. */
export function parsePdfInfo(value: string): PdfDocumentMetadata {
  const fields = new Map<string, string>();
  for (const line of value.split(/\r?\n/gu)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = normalizedInfoKey(line.slice(0, separator));
    if (!fields.has(key)) fields.set(key, line.slice(separator + 1).trim());
  }
  const pageCount = Number(fields.get("pages"));
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 1_000_000) {
    throw new Error("pdfinfo did not report a valid positive page count");
  }
  return {
    title: boundedMetadata(fields.get("title"), 2_048),
    author: boundedMetadata(fields.get("author"), 1_024),
    subject: boundedMetadata(fields.get("subject"), 8_192),
    keywords: boundedMetadata(fields.get("keywords"), 8_192),
    creator: boundedMetadata(fields.get("creator"), 1_024),
    producer: boundedMetadata(fields.get("producer"), 1_024),
    createdAt: boundedMetadata(fields.get("creationdate"), 256),
    modifiedAt: boundedMetadata(fields.get("moddate"), 256),
    pageCount,
    encrypted: /^yes\b/iu.test(fields.get("encrypted") ?? ""),
  };
}

function joinFragments(fragments: readonly PdfTextFragment[]): string {
  const sorted = [...fragments].sort((left, right) => left.left - right.left);
  let output = "";
  let previousRight = 0;
  for (const fragment of sorted) {
    const text = fragment.text;
    if (text === "") continue;
    const gap = fragment.left - previousRight;
    const needsSpace = output !== ""
      && !/\s$/u.test(output)
      && !/^\s|^[,.;:!?)}\]]/u.test(text)
      && gap > Math.max(1, fragment.fontSize * 0.08);
    output += `${needsSpace ? " " : ""}${text}`;
    previousRight = Math.max(previousRight, fragment.left + fragment.width);
  }
  return output.replace(/[ \t]+/gu, " ").trim();
}

function splitVisualLine(
  page: number,
  pageWidth: number,
  fragments: readonly PdfTextFragment[],
): readonly TextLine[] {
  const sorted = [...fragments].sort((left, right) => left.left - right.left);
  const groups: PdfTextFragment[][] = [];
  let current: PdfTextFragment[] = [];
  let previousRight = 0;
  for (const fragment of sorted) {
    const gap = fragment.left - previousRight;
    if (current.length > 0 && gap > Math.max(pageWidth * 0.2, fragment.fontSize * 8)) {
      groups.push(current);
      current = [];
    }
    current.push(fragment);
    previousRight = Math.max(previousRight, fragment.left + fragment.width);
  }
  if (current.length > 0) groups.push(current);
  return groups.flatMap((group) => {
    const text = joinFragments(group);
    if (text === "") return [];
    const characters = group.reduce((sum, fragment) => sum + Math.max(1, fragment.text.trim().length), 0);
    const boldCharacters = group.reduce(
      (sum, fragment) => sum + (fragment.bold ? Math.max(1, fragment.text.trim().length) : 0),
      0,
    );
    const fontSize = group.reduce(
      (sum, fragment) => sum + fragment.fontSize * Math.max(1, fragment.text.trim().length),
      0,
    ) / Math.max(1, characters);
    const top = Math.min(...group.map((fragment) => fragment.top));
    const left = Math.min(...group.map((fragment) => fragment.left));
    const right = Math.max(...group.map((fragment) => fragment.left + fragment.width));
    const bottom = Math.max(...group.map((fragment) => fragment.top + fragment.height));
    return [{
      page,
      top,
      left,
      width: right - left,
      height: bottom - top,
      text,
      fontSize,
      boldRatio: boldCharacters / Math.max(1, characters),
    }];
  });
}

function pageLines(page: PdfPageLayout): readonly TextLine[] {
  const fragments = [...page.text].sort((left, right) => left.top - right.top || left.left - right.left);
  const rows: PdfTextFragment[][] = [];
  for (const fragment of fragments) {
    const row = rows.at(-1);
    const rowTop = row === undefined ? null : Math.min(...row.map((entry) => entry.top));
    const tolerance = Math.max(2, fragment.height * 0.18);
    if (row === undefined || rowTop === null || Math.abs(fragment.top - rowTop) > tolerance) {
      rows.push([fragment]);
    } else row.push(fragment);
  }
  return rows.flatMap((row) => splitVisualLine(page.page, page.width, row))
    .sort((left, right) => left.top - right.top || left.left - right.left);
}

function weightedBodyFontSize(lines: readonly TextLine[]): number {
  const weights = new Map<number, number>();
  for (const line of lines) {
    const rounded = Math.round(line.fontSize * 2) / 2;
    weights.set(rounded, (weights.get(rounded) ?? 0) + line.text.length);
  }
  let selected = 12;
  let greatestWeight = -1;
  for (const [size, weight] of weights) {
    if (weight > greatestWeight || (weight === greatestWeight && size < selected)) {
      selected = size;
      greatestWeight = weight;
    }
  }
  return selected;
}

function median(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? fallback;
}

function normalizedMarginText(value: string): string {
  return value.toLowerCase().replace(/\d+/gu, "#").replace(/\s+/gu, " ").trim();
}

function repeatedMarginLines(
  pages: readonly PdfPageLayout[],
  linesByPage: ReadonlyMap<number, readonly TextLine[]>,
): ReadonlySet<string> {
  const occurrences = new Map<string, Set<number>>();
  for (const page of pages) {
    for (const line of linesByPage.get(page.page) ?? []) {
      const inMargin = line.top <= page.height * 0.06
        || line.top + line.height >= page.height * 0.94;
      if (!inMargin || line.text.length > 160) continue;
      const normalized = normalizedMarginText(line.text);
      if (normalized === "") continue;
      const pageNumbers = occurrences.get(normalized) ?? new Set<number>();
      pageNumbers.add(page.page);
      occurrences.set(normalized, pageNumbers);
    }
  }
  const minimum = Math.max(3, Math.ceil(pages.length * 0.4));
  return new Set(
    [...occurrences.entries()]
      .filter(([, pageNumbers]) => pageNumbers.size >= minimum)
      .map(([text]) => text),
  );
}

function headingLevel(fontSize: number, bodySize: number, headingSizes: readonly number[]): number {
  if (fontSize <= bodySize * 1.08) return 2;
  const index = headingSizes.findIndex((size) => Math.abs(size - fontSize) < 0.25);
  return Math.min(6, 2 + Math.max(0, index));
}

function bulletText(value: string): string | null {
  const bullet = /^(?:[•●◦▪▫‣⁃*-]|\d{1,4}[.)]|[a-zA-Z][.)])\s+(.+)$/u.exec(value);
  return bullet?.[1]?.trim() ?? null;
}

/** Convert ordered Poppler geometry into conservative Markdown-oriented blocks. */
export function layoutBlocks(pages: readonly PdfPageLayout[]): readonly PdfLayoutBlock[] {
  const linesByPage = new Map(pages.map((page) => [page.page, pageLines(page)]));
  const allLines = [...linesByPage.values()].flat();
  const bodySize = weightedBodyFontSize(allLines);
  const headingSizes = [...new Set(
    allLines
      .filter((line) => line.fontSize > bodySize * 1.08)
      .map((line) => Math.round(line.fontSize * 2) / 2),
  )].sort((left, right) => right - left);
  const repeatedMargins = repeatedMarginLines(pages, linesByPage);
  const output: PdfLayoutBlock[] = [];

  for (const page of pages) {
    const lines = (linesByPage.get(page.page) ?? []).filter(
      (line) => !(line.top <= page.height * 0.06 || line.top + line.height >= page.height * 0.94) || !repeatedMargins.has(normalizedMarginText(line.text)),
    );
    const steps = lines.slice(1).map((line, index) =>
      Math.max(0, line.top - (lines[index]?.top ?? line.top)));
    const normalStep = median(steps.filter((step) => step > 0), Math.max(1, bodySize * 1.4));
    const events: Array<
      | { readonly kind: "line"; readonly top: number; readonly left: number; readonly line: TextLine; readonly index: number }
      | { readonly kind: "image"; readonly top: number; readonly left: number; readonly image: PdfImageCandidate }
    > = [
      ...lines.map((line, index) => ({ kind: "line" as const, top: line.top, left: line.left, line, index })),
      ...page.images.map((image) => ({ kind: "image" as const, top: image.top, left: image.left, image })),
    ].sort((left, right) => left.top - right.top || left.left - right.left || (
      left.kind === "line" ? -1 : 1
    ));

    let paragraph: string[] = [];
    const flushParagraph = (): void => {
      if (paragraph.length === 0) return;
      output.push({
        kind: "paragraph",
        page: page.page,
        text: paragraph.join(" ").replace(/\s+/gu, " ").trim(),
      });
      paragraph = [];
    };

    for (const event of events) {
      if (event.kind === "image") {
        flushParagraph();
        output.push({ kind: "image", page: page.page, image: event.image });
        continue;
      }
      const { line, index } = event;
      const previous = lines[index - 1];
      const gapBefore = previous === undefined ? Number.POSITIVE_INFINITY : line.top - previous.top;
      const fontHeading = line.fontSize > bodySize * 1.08 && !/[=∫∑√⁰¹²³⁴⁵⁶⁷⁸⁹]/u.test(line.text);
      const boldHeading = line.boldRatio >= 0.78
        && line.text.length <= 180
        && gapBefore >= normalStep * 1.45;
      if (line.text.length <= 240 && (fontHeading || boldHeading)) {
        flushParagraph();
        output.push({
          kind: "heading",
          page: page.page,
          level: headingLevel(line.fontSize, bodySize, headingSizes),
          text: line.text,
        });
        continue;
      }
      const item = bulletText(line.text);
      if (item !== null) {
        flushParagraph();
        output.push({ kind: "list-item", page: page.page, text: item });
        continue;
      }
      if (previous !== undefined && gapBefore >= normalStep * 1.55) flushParagraph();
      paragraph.push(line.text);
    }
    flushParagraph();
  }
  return output.filter((block) => block.kind === "image" || block.kind === "table" || block.text.trim() !== "");
}

export function parsePdfImageInterpretations(value: unknown): readonly PdfImageInterpretation[] {
  if (!Array.isArray(value)) throw new Error("PDF image annotations must be an array");
  if (value.length > 10_000) throw new Error("PDF image annotations exceed the 10000-item limit");
  const output: PdfImageInterpretation[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) throw new Error("each PDF image annotation must be an object");
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const sha256 = typeof entry.sha256 === "string" ? entry.sha256.trim().toLowerCase() : "";
    if (!/^[a-z0-9][a-z0-9._:-]{0,255}$/u.test(id)) throw new Error("PDF image annotation has an invalid id");
    if (!/^[0-9a-f]{64}$/u.test(sha256)) throw new Error("PDF image annotation has an invalid sha256");
    if (entry.kind !== "text" && entry.kind !== "mixed" && entry.kind !== "visual") {
      throw new Error("PDF image annotation kind must be text, mixed, or visual");
    }
    if (
      entry.method !== undefined
      && entry.method !== "agent"
      && entry.method !== "manual"
    ) {
      throw new Error("PDF image annotation method must be agent or manual");
    }
    const method = entry.method;
    let metadata: PdfImageSemanticMetadata | undefined;
    if (entry.metadata !== undefined) {
      if (!isRecord(entry.metadata)) throw new Error("PDF image annotation metadata must be an object");
      const metadataRecord = entry.metadata;
      const optional = (name: string, maximum = 2_048): string | undefined => {
        const candidate = metadataRecord[name];
        if (candidate === undefined) return undefined;
        if (typeof candidate !== "string" || candidate.trim() === "") {
          throw new Error(`PDF image annotation metadata ${name} must be a non-empty string`);
        }
        return bounded(sanitizeTerminalText(candidate.trim()), maximum);
      };
      const participantsValue = metadataRecord.participants;
      let participants: readonly string[] | undefined;
      if (participantsValue !== undefined) {
        if (!Array.isArray(participantsValue) || participantsValue.length > 256) {
          throw new Error("PDF image annotation participants must be non-empty strings");
        }
        const parsedParticipants: string[] = [];
        for (const participant of participantsValue as readonly unknown[]) {
          if (typeof participant !== "string" || participant.trim() === "") {
            throw new Error("PDF image annotation participants must be non-empty strings");
          }
          parsedParticipants.push(bounded(sanitizeTerminalText(participant.trim()), 2_048));
        }
        participants = parsedParticipants;
      }
      const platform = optional("platform", 256);
      const contentType = optional("contentType", 256);
      const channel = optional("channel");
      const author = optional("author");
      const timestamp = optional("timestamp", 512);
      metadata = {
        ...(platform === undefined ? {} : { platform }),
        ...(contentType === undefined ? {} : { contentType }),
        ...(channel === undefined ? {} : { channel }),
        ...(author === undefined ? {} : { author }),
        ...(timestamp === undefined ? {} : { timestamp }),
        ...(participants === undefined ? {} : { participants }),
      };
    }
    if (entry.kind === "text" || entry.kind === "mixed") {
      if (typeof entry.markdown !== "string" || entry.markdown.trim() === "") {
        throw new Error("text PDF image annotations require non-empty markdown");
      }
      output.push({
        id,
        sha256,
        kind: entry.kind,
        markdown: bounded(sanitizeTerminalText(entry.markdown.trim()), 2 * 1024 * 1024),
        ...(metadata === undefined ? {} : { metadata }),
        ...(method === undefined ? {} : { method }),
      });
    } else {
      const alt = entry.alt === undefined
        ? undefined
        : typeof entry.alt === "string" && entry.alt.trim() !== ""
          ? bounded(sanitizeTerminalText(entry.alt.trim()), 2_048)
          : (() => { throw new Error("visual PDF image annotation alt must be a non-empty string"); })();
      output.push({
        id,
        sha256,
        kind: "visual",
        ...(alt === undefined ? {} : { alt }),
        ...(metadata === undefined ? {} : { metadata }),
        ...(method === undefined ? {} : { method }),
      });
    }
  }
  const keys = new Set<string>();
  for (const entry of output) {
    if (keys.has(entry.id)) throw new Error(`duplicate PDF image annotation id: ${entry.id}`);
    keys.add(entry.id);
  }
  return output;
}

/** Geometry evidence is deliberately conservative: uncertain structure remains visible in quality. */
export function analyzePdfLayout(pages: readonly PdfPageLayout[]): { readonly blocks: readonly PdfLayoutBlock[]; readonly issues: readonly import("./model.js").PdfQualityIssue[] } {
  const issues: import("./model.js").PdfQualityIssue[] = [];
  const blocks: PdfLayoutBlock[] = [];
  const marginLines = new Map(pages.filter(page => page.text.length <= 4000).map(page => [page.page, pageLines(page)]));
  const margins = repeatedMarginLines(pages, marginLines);
  for (const originalInput of pages) {
    const original = { ...originalInput, text: originalInput.text.filter(fragment => !(fragment.top <= originalInput.height * 0.06 || fragment.top + fragment.height >= originalInput.height * 0.94) || !margins.has(normalizedMarginText(fragment.text))) };
    const warn = (code: import("./model.js").PdfQualityIssue["code"]): void => {
      if (!issues.some(issue => issue.page === original.page && issue.code === code)) issues.push({ page: original.page, code });
    };
    // Bound quadratic geometry analysis independently of the parser's byte limit.
    if (original.text.length > 4000) {
      warn("reading-order-uncertain"); blocks.push(...layoutBlocks([original])); continue;
    }
    if (original.text.some(fragment => /[∫∑√]/u.test(fragment.text))) warn("math-structure-uncertain");
    const text = [...original.text].sort((a, b) => a.top - b.top || a.left - b.left);
    const consumed = new Set<PdfTextFragment>();
    const replacements = new Map<PdfTextFragment, PdfTextFragment>();
    const superscripts: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ" };
    for (const small of text) {
      const bases = text.filter(base => base !== small && base.fontSize >= small.fontSize * 1.3
        && small.top < base.top && small.top + small.height > base.top - base.height * 0.25
        && Math.abs(small.left - (base.left + base.width)) < base.fontSize * 0.6);
      if (bases.length === 0) continue;
      const base = bases[0]!;
      const glyphs = [...small.text.trim()];
      if (bases.length === 1 && glyphs.length > 0 && glyphs.length <= 8 && glyphs.every(glyph => superscripts[glyph] !== undefined) && !replacements.has(base)) {
        replacements.set(base, { ...base, text: base.text + glyphs.map(glyph => superscripts[glyph]).join(""), width: small.left + small.width - base.left });
        consumed.add(small);
      } else warn("math-structure-uncertain");
    }
    const fragments = text.filter(fragment => !consumed.has(fragment)).map(fragment => replacements.get(fragment) ?? fragment);
    const page: PdfPageLayout = { ...original, text: fragments };
    const rows: PdfTextFragment[][] = [];
    for (const fragment of fragments) {
      const row = rows.at(-1);
      if (row === undefined || Math.abs(fragment.top - row[0]!.top) > Math.max(2, fragment.height * 0.2)) rows.push([fragment]);
      else row.push(fragment);
    }
    const cellRows = rows.map(row => {
      const groups: PdfTextFragment[][] = [];
      for (const fragment of [...row].sort((a, b) => a.left - b.left)) {
        const prior = groups.at(-1), last = prior?.at(-1);
        if (last === undefined || fragment.left - (last.left + last.width) > Math.max(12, fragment.fontSize * 1.5)) groups.push([fragment]);
        else prior!.push(fragment);
      }
      return groups;
    });
    const tables: Array<{ top: number; bottom: number; block: PdfLayoutBlock; fragments: PdfTextFragment[] }> = [];
    for (let index = 0; index < cellRows.length; index++) {
      const first = cellRows[index]!;
      if (first.length < 2 || first.length > 12) continue;
      const group = [first];
      let next = index + 1;
      for (; next < cellRows.length; next++) {
        const candidate = cellRows[next]!;
        if (candidate.length !== first.length || candidate.some((cell, column) => Math.abs(cell[0]!.left - first[column]![0]!.left) > 4)) break;
        if (candidate[0]![0]!.top - group.at(-1)![0]![0]!.top > Math.max(40, candidate[0]![0]!.height * 3)) break;
        group.push(candidate);
      }
      const cells = group.map(row => row.map(cell => joinFragments(cell)));
      const header = first.every(cell => cell.every(fragment => fragment.bold));
      const numeric = cells.slice(1).some(row => row.slice(1).some(cell => /^[-+\d$€£]/u.test(cell.trim())));
      const compact = cells.every(row => row.every(cell => cell.length <= 100));
      if (group.length >= 3 && compact && header && numeric) {
        const members = group.flat(2);
        tables.push({ top: Math.min(...members.map(fragment => fragment.top)), bottom: Math.max(...members.map(fragment => fragment.top + fragment.height)), block: { kind: "table", page: page.page, rows: cells }, fragments: members });
        index = next - 1;
      } else if (group.length >= 3 && first.length >= 3) warn("table-structure-uncertain");
    }
    const tableFragments = new Set(tables.flatMap(table => table.fragments));
    const remaining = fragments.filter(fragment => !tableFragments.has(fragment));
    const emitBand = (band: readonly PdfTextFragment[], images: readonly PdfImageCandidate[]): void => {
      if (band.length === 0 && images.length === 0) return;
      // Repeated gutters are detected before line grouping can join adjacent columns.
      const candidates = new Set<number>();
      for (const row of cellRows) {
        for (let i = 1; i < row.length; i++) {
          const left = row[i - 1]!.at(-1)!, right = row[i]![0]!;
          const gap = right.left - (left.left + left.width);
          if (gap >= Math.max(page.width * 0.025, left.fontSize * 1.5)) candidates.add(Math.round((left.left + left.width + right.left) / 2));
        }
      }
      const valid = [...candidates].filter(gutter => {
        const left = band.filter(fragment => fragment.left + fragment.width <= gutter);
        const right = band.filter(fragment => fragment.left >= gutter);
        if (left.length + right.length !== band.length || left.length < 3 || right.length < 3) return false;
        if (left.filter(fragment => fragment.width > page.width * 0.18).length < 2 || right.filter(fragment => fragment.width > page.width * 0.18).length < 2) return false;
        const overlap = Math.min(Math.max(...left.map(fragment => fragment.top)), Math.max(...right.map(fragment => fragment.top))) - Math.max(Math.min(...left.map(fragment => fragment.top)), Math.min(...right.map(fragment => fragment.top)));
        return overlap > Math.max(...band.map(fragment => fragment.height)) * 1.5;
      });
      if (valid.length > 0) {
        const gutter = valid[Math.floor(valid.length / 2)]!;
        if (images.some(image => image.left < gutter && image.left + image.width > gutter)) {
          warn("reading-order-uncertain"); blocks.push(...layoutBlocks([{ ...page, text: band, images }])); return;
        }
        for (const left of [true, false]) blocks.push(...layoutBlocks([{ ...page, text: band.filter(fragment => left ? fragment.left + fragment.width <= gutter : fragment.left >= gutter), images: images.filter(image => left ? image.left + image.width <= gutter : image.left >= gutter) }]));
      } else {
        if (band.length >= 6 && cellRows.filter(row => row.length >= 2 && row.some(cell => band.includes(cell[0]!))).length >= 3) warn("reading-order-uncertain");
        blocks.push(...layoutBlocks([{ ...page, text: band, images }]));
      }
    };
    // Spanning headings split vertical regions; tables retain their exact place.
    const bodyFont = weightedBodyFontSize(pageLines(page));
    const gutterVotes = new Map<number, number>();
    for (const row of cellRows) for (let i = 1; i < row.length; i++) {
      const left = row[i - 1]!.at(-1)!, right = row[i]![0]!;
      if (right.left - (left.left + left.width) < Math.max(12, left.fontSize * 1.5)) continue;
      const gutter = Math.round((left.left + left.width + right.left) / 20) * 10;
      gutterVotes.set(gutter, (gutterVotes.get(gutter) ?? 0) + 1);
    }
    const repeatedGutters = [...gutterVotes].filter(([, votes]) => votes >= 3).map(([gutter]) => gutter);
    const spans = remaining.filter(fragment => fragment.width > page.width * 0.65 || (fragment.fontSize > bodyFont * 1.08 && repeatedGutters.some(gutter => fragment.left < gutter && fragment.left + fragment.width > gutter)));
    const boundaries = [...tables.map(table => ({ top: table.top, bottom: table.bottom, table, span: null as PdfTextFragment | null })), ...spans.map(span => ({ top: span.top, bottom: span.top + span.height, table: null, span }))].sort((a, b) => a.top - b.top);
    const emitted = new Set<PdfTextFragment>(), emittedImages = new Set<PdfImageCandidate>();
    for (const boundary of boundaries) {
      const band = remaining.filter(fragment => !emitted.has(fragment) && fragment !== boundary.span && fragment.top < boundary.top);
      const images = page.images.filter(image => !emittedImages.has(image) && image.top < boundary.top);
      emitBand(band, images); for (const fragment of band) emitted.add(fragment); for (const image of images) emittedImages.add(image);
      if (boundary.table !== null) blocks.push(boundary.table.block);
      if (boundary.span !== null) {
        const span = boundary.span;
        blocks.push(span.fontSize > bodyFont * 1.08 ? { kind: "heading", page: page.page, level: 2, text: span.text } : { kind: "paragraph", page: page.page, text: span.text });
        emitted.add(span);
      }
    }
    emitBand(remaining.filter(fragment => !emitted.has(fragment)), page.images.filter(image => !emittedImages.has(image)));
  }
  return { blocks, issues };
}
