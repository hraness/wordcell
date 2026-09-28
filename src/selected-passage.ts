import { createHash } from "node:crypto";

/** Maximum UTF-8 bytes in one selected passage; matches the reranker snippet budget. */
export const SELECTED_PASSAGE_MAX_BYTES = 512;
/** Maximum UTF-8 bytes of one heading line returned as section context. */
export const SELECTED_PASSAGE_MAX_HEADING_BYTES = 256;
/** Notes larger than this report `source-limit` instead of being scanned. */
export const SELECTED_PASSAGE_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
/** Total note bytes one search may scan for selected passages. */
export const SELECTED_PASSAGE_MAX_SEARCH_BYTES = 8 * 1024 * 1024;
const MAX_QUERY_BYTES = 16 * 1024;
const MAX_QUERY_TERMS = 64;
const MAX_CANDIDATES = 10_000;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;
// Generic grammatical words, not corpus terms or benchmark-specific expansions.
const STOP_WORDS = new Set((
  "a an and are as at be been being but by can could did do does doing each either "
  + "for from had has have having he her here hers herself him himself his how i "
  + "if in into is it its itself may me might mine more most must my myself neither "
  + "no nor not of on once only or our ours ourselves out own same she should so "
  + "some such than that the their theirs them themselves then there these they "
  + "this those through to too under until up us very was we were what when where "
  + "which while who whom why will with would you your yours yourself yourselves"
).split(" "));

/** One enclosing ATX heading line, returned as its own exact source span. */
export type SelectedPassageHeading = Readonly<{
  level: number;
  text: string;
  /** Half-open offsets into the UTF-8 encoding of the note snapshot. */
  startByte: number;
  endByte: number;
  startLine: number;
  endLine: number;
  /** True when the heading line was shortened to the heading byte budget. */
  truncated: boolean;
}>;

export type SelectedPassage = Readonly<{
  status: "selected";
  /** Exact contiguous source text; never rewritten, joined, or prefixed. */
  text: string;
  /** Half-open offsets into the UTF-8 encoding of the note snapshot. */
  startByte: number;
  endByte: number;
  /** One-based inclusive lines occupied by the selected bytes. */
  startLine: number;
  endLine: number;
  /** SHA-256 of the UTF-8 encoded snapshot text these offsets address. */
  sourceSha256: string;
  /** The snapshot is decoded text re-encoded as UTF-8, so a leading BOM is absent. */
  sourceEncoding: "utf8-snapshot";
  /** True when the passage starts or ends inside a longer paragraph. */
  clippedStart: boolean;
  clippedEnd: boolean;
  /** Enclosing headings from outermost to innermost, excluding any heading inside `text`. */
  headings: readonly SelectedPassageHeading[];
}>;

export type SelectedPassageNone = Readonly<{
  status: "none";
  reason: "no-query-terms" | "no-lexical-match";
}>;

export type SelectedPassageUnavailable = Readonly<{
  status: "unavailable";
  reason:
    | "query-limit"
    | "source-limit"
    | "search-budget"
    | "candidate-limit"
    | "grapheme-limit"
    | "invalid-source"
    | "display-sanitized";
}>;

export type SelectedPassageResult = SelectedPassage | SelectedPassageNone | SelectedPassageUnavailable;

export const SELECTED_PASSAGE_NONE_REASONS: readonly SelectedPassageNone["reason"][] = Object.freeze([
  "no-query-terms",
  "no-lexical-match",
]);

export const SELECTED_PASSAGE_UNAVAILABLE_REASONS: readonly SelectedPassageUnavailable["reason"][] = Object.freeze([
  "query-limit",
  "source-limit",
  "search-budget",
  "candidate-limit",
  "grapheme-limit",
  "invalid-source",
  "display-sanitized",
]);

/** Tracks the note bytes one search has scanned. */
export type SelectedPassageBudget = {
  readonly take: (bytes: number) => boolean;
};

export function createSelectedPassageBudget(
  maximumBytes = SELECTED_PASSAGE_MAX_SEARCH_BYTES,
): SelectedPassageBudget {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError("Selected passage budget must be a non-negative safe integer.");
  }
  let remaining = maximumBytes;
  return Object.freeze({
    take: (bytes: number) => {
      if (bytes > remaining) return false;
      remaining -= bytes;
      return true;
    },
  });
}

function unavailable(reason: SelectedPassageUnavailable["reason"]): SelectedPassageUnavailable {
  return Object.freeze({ status: "unavailable", reason });
}

function none(reason: SelectedPassageNone["reason"]): SelectedPassageNone {
  return Object.freeze({ status: "none", reason });
}

function normalize(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

function wellFormed(value: string): boolean {
  return !/\p{Surrogate}/u.test(value);
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

type Paragraph = { start: number; end: number; headingOnly: boolean };
type HeadingLine = { start: number; end: number; level: number; line: number };

function sourceLayout(text: string): {
  bodyStart: number;
  lineStarts: number[];
  paragraphs: Paragraph[];
  headings: HeadingLine[];
} {
  const lineStarts = [0];
  for (let index = text.indexOf("\n"); index >= 0; index = text.indexOf("\n", index + 1)) {
    lineStarts.push(index + 1);
  }
  const lineEnd = (index: number): number => {
    const next = lineStarts[index + 1];
    let end = next === undefined ? text.length : next - 1;
    if (end > lineStarts[index]! && text[end - 1] === "\r") end--;
    return end;
  };
  let firstBodyLine = 0;
  if (text.slice(0, lineEnd(0)).trim() === "---") {
    for (let index = 1; index < lineStarts.length; index++) {
      if (text.slice(lineStarts[index], lineEnd(index)).trim() === "---") {
        firstBodyLine = index + 1;
        break;
      }
    }
  }
  const bodyStart = lineStarts[firstBodyLine] ?? text.length;
  const paragraphs: Paragraph[] = [];
  const headings: HeadingLine[] = [];
  let fence: { character: string; length: number } | undefined;
  let current: Paragraph | undefined;
  for (let index = firstBodyLine; index < lineStarts.length; index++) {
    const start = lineStarts[index]!;
    const end = lineEnd(index);
    const line = text.slice(start, end);
    if (line.trim() === "") {
      if (current !== undefined) paragraphs.push(current);
      current = undefined;
      continue;
    }
    const delimiter = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    const marker = fence === undefined ? /^\s{0,3}(#{1,6})(?:\s|$)/u.exec(line)?.[1] : undefined;
    const heading = marker !== undefined;
    if (heading) headings.push({ start, end, level: marker.length, line: index + 1 });
    if (delimiter !== undefined) {
      if (fence === undefined) fence = { character: delimiter[0]!, length: delimiter.length };
      else if (delimiter[0] === fence.character && delimiter.length >= fence.length
        && line.trim() === delimiter) fence = undefined;
    }
    if (current === undefined) current = { start, end, headingOnly: heading };
    else {
      current.end = end;
      current.headingOnly &&= heading;
    }
  }
  if (current !== undefined) paragraphs.push(current);
  return { bodyStart, lineStarts, paragraphs, headings };
}

/** Longest grapheme-aligned prefix of `value` within `maximumBytes` UTF-8 bytes. */
function graphemePrefix(value: string, maximumBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) return { text: value, truncated: false };
  let end = 0;
  let bytes = 0;
  for (const part of new Intl.Segmenter("en-US", { granularity: "grapheme" }).segment(value)) {
    const width = Buffer.byteLength(part.segment, "utf8");
    if (bytes + width > maximumBytes) break;
    bytes += width;
    end = part.index + part.segment.length;
  }
  return { text: value.slice(0, end), truncated: true };
}

function enclosingHeadings(
  text: string,
  headings: readonly HeadingLine[],
  passageStart: number,
  passageEnd: number,
): readonly SelectedPassageHeading[] {
  const stack: HeadingLine[] = [];
  const pop = (level: number): void => {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
  };
  for (const heading of headings) {
    if (heading.start >= passageEnd) break;
    if (heading.start >= passageStart) {
      // Leading headings inside the passage close earlier sections but are already in the text.
      const before = text.slice(passageStart, heading.start).split("\n");
      if (!before.every((line) => line.trim() === "" || /^\s{0,3}#{1,6}(?:\s|$)/u.test(line))) break;
      pop(heading.level);
      continue;
    }
    pop(heading.level);
    stack.push(heading);
  }
  return Object.freeze(stack.map((heading) => {
    // A window may begin inside a long heading line; the context span stops where the passage starts.
    const end = Math.min(heading.end, passageStart);
    const clipped = graphemePrefix(text.slice(heading.start, end), SELECTED_PASSAGE_MAX_HEADING_BYTES);
    const startByte = Buffer.byteLength(text.slice(0, heading.start), "utf8");
    return Object.freeze({
      level: heading.level,
      text: clipped.text,
      startByte,
      endByte: startByte + Buffer.byteLength(clipped.text, "utf8"),
      startLine: heading.line,
      endLine: heading.line,
      truncated: clipped.truncated || end < heading.end,
    });
  }));
}

type Candidate = {
  start: number;
  end: number;
  startByte: number;
  endByte: number;
  regionStart: number;
  regionEnd: number;
  score: number;
};

/**
 * Select one exact passage from a note that search already returned. Ranking,
 * retrieval evidence, and reranker input are unaffected.
 *
 * Passages score by distinct non-stop-word query terms with a small density
 * tie-break, so term order and repetition do not matter. Closed opening
 * frontmatter is skipped, headings travel with the following paragraph instead
 * of scoring on their own when body text exists, fenced code stays eligible,
 * and paragraphs longer than the budget use half-overlapping grapheme-aligned
 * byte windows. Every bound reports a status rather than a partial scan.
 */
export function selectSearchPassage(input: {
  readonly query: string;
  readonly text: string;
  readonly budget: SelectedPassageBudget;
}): SelectedPassageResult {
  const { query, text, budget } = input;
  if (typeof query !== "string" || Buffer.byteLength(query, "utf8") > MAX_QUERY_BYTES) {
    return unavailable("query-limit");
  }
  if (typeof text !== "string" || !wellFormed(text)) return unavailable("invalid-source");
  const allTerms = new Set([...normalize(query).matchAll(WORD)].map((match) => match[0]));
  if (allTerms.size > MAX_QUERY_TERMS) return unavailable("query-limit");
  const terms = new Set([...allTerms].filter((term) => !STOP_WORDS.has(term)));
  if (terms.size === 0) return none("no-query-terms");
  const sourceBytes = Buffer.byteLength(text, "utf8");
  if (sourceBytes > SELECTED_PASSAGE_MAX_SOURCE_BYTES) return unavailable("source-limit");
  if (!budget.take(sourceBytes)) return unavailable("search-budget");
  if (text.length === 0) return none("no-lexical-match");

  const maxBytes = SELECTED_PASSAGE_MAX_BYTES;
  const { bodyStart, lineStarts, paragraphs, headings } = sourceLayout(text);
  const headingStarts = new Set(headings.map(({ start }) => start));
  const headingOnlyFile = paragraphs.every((paragraph) => paragraph.headingOnly);
  const positions = [bodyStart];
  const bytePositions = [Buffer.byteLength(text.slice(0, bodyStart), "utf8")];
  let bytes = bytePositions[0]!;
  for (const part of new Intl.Segmenter("en-US", { granularity: "grapheme" }).segment(text.slice(bodyStart))) {
    const width = Buffer.byteLength(part.segment, "utf8");
    if (width > maxBytes) return unavailable("grapheme-limit");
    bytes += width;
    positions.push(bodyStart + part.index + part.segment.length);
    bytePositions.push(bytes);
  }

  const tokens: { start: number; end: number; term: string | undefined }[] = [];
  const tokenStarts: number[] = [];
  for (const match of text.slice(bodyStart).matchAll(WORD)) {
    const start = bodyStart + match.index;
    const term = normalize(match[0]);
    const inHeading = headingStarts.has(lineStarts[upperBound(lineStarts, start) - 1]!);
    tokenStarts.push(start);
    tokens.push({
      start,
      end: start + match[0].length,
      term: terms.has(term) && (headingOnlyFile || !inHeading) ? term : undefined,
    });
  }

  const regions: { start: number; end: number }[] = [];
  let pendingHeading: Paragraph | undefined;
  for (const paragraph of paragraphs) {
    if (paragraph.headingOnly) {
      pendingHeading = pendingHeading === undefined
        ? paragraph
        : { ...pendingHeading, end: paragraph.end };
    } else {
      regions.push({ start: pendingHeading?.start ?? paragraph.start, end: paragraph.end });
      pendingHeading = undefined;
    }
  }
  if (regions.length === 0 && pendingHeading !== undefined) regions.push(pendingHeading);

  let best: Candidate | undefined;
  let considered = 0;
  for (const region of regions) {
    // Line and paragraph boundaries must also be grapheme boundaries; CRLF stays whole.
    const first = lowerBound(positions, region.start);
    const last = upperBound(positions, region.end) - 1;
    if (first >= last) continue;
    let startIndex = first;
    for (;;) {
      const endIndex = Math.min(last, upperBound(bytePositions, bytePositions[startIndex]! + maxBytes) - 1);
      if (endIndex <= startIndex) return unavailable("grapheme-limit");
      if (++considered > MAX_CANDIDATES) return unavailable("candidate-limit");
      const start = positions[startIndex]!;
      const end = positions[endIndex]!;
      const matched = new Set<string>();
      let tokenCount = 0;
      for (let index = lowerBound(tokenStarts, start); index < tokens.length; index++) {
        const token = tokens[index]!;
        if (token.start >= end) break;
        if (token.end > end) continue;
        tokenCount++;
        if (token.term !== undefined) matched.add(token.term);
      }
      if (matched.size > 0) {
        const score = matched.size + matched.size / (tokenCount + 1) / 10;
        // Candidates arrive in source order, so a strict comparison keeps the earliest tie.
        if (best === undefined || score > best.score) {
          best = {
            start,
            end,
            startByte: bytePositions[startIndex]!,
            endByte: bytePositions[endIndex]!,
            regionStart: positions[first]!,
            regionEnd: positions[last]!,
            score,
          };
        }
      }
      if (endIndex === last) break;
      const stepped = lowerBound(bytePositions, bytePositions[startIndex]! + Math.max(1, Math.floor(maxBytes / 2)));
      const finalStart = lowerBound(bytePositions, bytePositions[last]! - maxBytes);
      startIndex = Math.max(startIndex + 1, Math.min(stepped, finalStart));
    }
  }
  if (best === undefined) return none("no-lexical-match");

  return Object.freeze({
    status: "selected",
    text: text.slice(best.start, best.end),
    startByte: best.startByte,
    endByte: best.endByte,
    startLine: upperBound(lineStarts, best.start),
    endLine: upperBound(lineStarts, best.end - 1),
    sourceSha256: createHash("sha256").update(text, "utf8").digest("hex"),
    sourceEncoding: "utf8-snapshot",
    clippedStart: best.start > best.regionStart,
    clippedEnd: best.end < best.regionEnd,
    headings: enclosingHeadings(text, headings, best.start, best.end),
  });
}
