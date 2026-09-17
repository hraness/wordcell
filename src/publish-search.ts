import type {
  WordcellSiteDocFieldsV1,
  WordcellSiteDocV1,
} from "./publish-model.js";

/**
 * Shared pure search core for published sites. The index builder, the bundled
 * browser reader, and tests all import these functions, so this module must
 * stay free of Node and DOM dependencies.
 *
 * Field weights and admission rules mirror the exact lane in `search.ts`:
 * field matching is normalized substring matching, identity and phrase matches
 * outrank term coverage, and multi-term queries require bounded coverage unless
 * an identity or phrase match already admits the document.
 */

export const PUBLISH_FIELD_TITLE = 1;
export const PUBLISH_FIELD_ALIAS = 2;
export const PUBLISH_FIELD_PATH = 4;
export const PUBLISH_FIELD_TAG = 8;
export const PUBLISH_FIELD_METADATA = 16;
export const PUBLISH_FIELD_CONTENT = 32;

export const PUBLISH_SEARCH_WEIGHTS_V1 = Object.freeze({
  identity: Object.freeze({ title: 1_000, alias: 950, path: 900 }),
  phrase: Object.freeze({
    title: 400,
    alias: 350,
    path: 300,
    tag: 250,
    content: 150,
    metadata: 100,
  }),
  term: Object.freeze({
    title: 40,
    alias: 35,
    path: 30,
    tag: 30,
    metadata: 10,
    content: 5,
  }),
  /** Scaled by the fraction of unique query terms that matched anywhere. */
  coverage: 100,
});

export const MAX_PUBLISH_QUERY_BYTES = 16 * 1_024;
export const MAX_PUBLISH_QUERY_TERMS = 64;
export const MAX_PUBLISH_PREFIX_EXPANSIONS = 32;

const TERM_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}._/-]*/gu;

const textEncoder = new TextEncoder();

/** UTF-8 byte length without Node's Buffer — this module ships to browsers. */
export function publishUtf8Bytes(value: string): number {
  return textEncoder.encode(value).byteLength;
}

export function publishNormalize(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

export type PublishQuery = {
  readonly raw: string;
  readonly normalized: string;
  readonly terms: readonly string[];
};

export const MAX_PUBLISH_QUERY_FILTERS = 8;

export type PublishQueryFilters = {
  /** Normalized tag values; a document must carry every one. */
  readonly tags: readonly string[];
  /** Normalized note types; absent catalog types count as "note". */
  readonly types: readonly string[];
  /** Normalized slug/path/id prefixes, matched on segment boundaries. */
  readonly paths: readonly string[];
};

export type PublishQueryParts = {
  readonly filters: PublishQueryFilters;
  /** Query text with filter tokens removed, ready for `publishQuery`. */
  readonly text: string;
};

const FILTER_PATTERN = /^(tag|type|path):(\S+)$/u;

/** Trim `/` runs at both ends without a regex (CodeQL-safe, linear). */
function trimSlashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === 0x2f) start += 1;
  while (end > start && value.charCodeAt(end - 1) === 0x2f) end -= 1;
  return value.slice(start, end);
}

/**
 * Split a raw query into field filters and free text. `tag:`, `type:`, and
 * `path:` tokens become filters (values normalized like query text); anything
 * else — including a malformed `name:` token with an empty value — stays in
 * the free-text query. Each filter family keeps at most
 * MAX_PUBLISH_QUERY_FILTERS values; overflow falls back to free text.
 */
export function publishQueryParts(raw: string): PublishQueryParts {
  const tags: string[] = [];
  const types: string[] = [];
  const paths: string[] = [];
  const rest: string[] = [];
  for (const token of raw.split(/\s+/u)) {
    if (token === "") continue;
    const match = FILTER_PATTERN.exec(token);
    const value = match === null
      ? ""
      : publishNormalize(trimSlashes(match[2] ?? ""));
    if (match === null || value === "") {
      rest.push(token);
      continue;
    }
    const bucket = match[1] === "tag" ? tags : match[1] === "type" ? types : paths;
    if (bucket.length < MAX_PUBLISH_QUERY_FILTERS) bucket.push(value);
    else rest.push(token);
  }
  return { filters: { tags, types, paths }, text: rest.join(" ") };
}

/**
 * Whether a document satisfies parsed filters. `type` is the catalog type for
 * the document (raw); both sides normalize before comparing so filter casing
 * matches the indexed value.
 */
export function publishDocMatchesFilters(
  doc: Pick<WordcellSiteDocV1, "s" | "f">,
  filters: PublishQueryFilters,
  type: string | undefined,
): boolean {
  if (filters.tags.length > 0) {
    const tags = doc.f.g === "" ? [] : doc.f.g.split("\n");
    for (const tag of filters.tags) {
      if (!tags.includes(publishNormalize(tag))) return false;
    }
  }
  if (filters.types.length > 0) {
    const docType = publishNormalize(type === undefined || type === "" ? "note" : type);
    for (const wanted of filters.types) {
      if (docType !== publishNormalize(wanted)) return false;
    }
  }
  if (filters.paths.length > 0) {
    const slug = publishNormalize(doc.s);
    const fields = doc.f.p === "" ? [] : doc.f.p.split("\n");
    for (const value of filters.paths) {
      const prefix = publishNormalize(trimSlashes(value));
      const boundary = `${prefix}/`;
      const inSlug = slug === prefix || slug.startsWith(boundary);
      const inFields = fields.some((line) => line === prefix || line.startsWith(boundary));
      if (!inSlug && !inFields) return false;
    }
  }
  return true;
}

export type PublishMarkRange = {
  /** Start and end offsets into the NFC-normalized input text (UTF-16). */
  readonly start: number;
  readonly end: number;
};

export const MAX_PUBLISH_MARK_RANGES = 32;

/**
 * Locate query terms in display text for `<mark>` highlighting. The search
 * index normalizes with NFC + en-US lowercase, so this builds the same
 * normalized form code point by code point and maps matches back to ranges in
 * the NFC-normalized input. Ranges are sorted, non-overlapping, and bounded.
 */
export function publishMarkRanges(
  text: string,
  terms: readonly string[],
  maximum = MAX_PUBLISH_MARK_RANGES,
): readonly PublishMarkRange[] {
  const display = text.normalize("NFC");
  let normalized = "";
  const map: number[] = [];
  for (let offset = 0; offset < display.length;) {
    const point = display.codePointAt(offset) ?? 0;
    const character = String.fromCodePoint(point);
    const lowered = character.toLocaleLowerCase("en-US");
    for (let index = 0; index < lowered.length; index += 1) map.push(offset);
    normalized += lowered;
    offset += character.length;
  }
  const ranges: PublishMarkRange[] = [];
  for (const term of terms) {
    const needle = publishNormalize(term);
    if (needle === "") continue;
    let from = 0;
    while (ranges.length < maximum) {
      const hit = normalized.indexOf(needle, from);
      if (hit === -1) break;
      const start = map[hit] ?? 0;
      const tail = hit + needle.length;
      const end = tail >= map.length ? display.length : (map[tail] ?? display.length);
      if (end > start) ranges.push({ start, end });
      from = tail === 0 ? 1 : tail;
    }
    if (ranges.length >= maximum) break;
  }
  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: PublishMarkRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, range.end) };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/** Normalize and bound a published-site query like `validateSearchQuery`. */
export function publishQuery(value: unknown): PublishQuery {
  if (typeof value !== "string") {
    throw new TypeError("Search query must be a string.");
  }
  if (publishUtf8Bytes(value) > MAX_PUBLISH_QUERY_BYTES) {
    throw new RangeError(
      `Search query exceeds the ${MAX_PUBLISH_QUERY_BYTES}-byte limit.`,
    );
  }
  const raw = value.trim();
  const normalized = publishNormalize(raw);
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const match of normalized.matchAll(TERM_PATTERN)) {
    if (seen.has(match[0])) continue;
    seen.add(match[0]);
    terms.push(match[0]);
    if (terms.length > MAX_PUBLISH_QUERY_TERMS) {
      throw new RangeError(
        `Search query may contain at most ${MAX_PUBLISH_QUERY_TERMS} unique normalized terms.`,
      );
    }
  }
  return { raw, normalized, terms };
}

/** FNV-1a 32-bit; the top byte names the content postings shard. */
export function publishShardName(term: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < term.length; index += 1) {
    hash ^= term.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 24).toString(16).padStart(2, "0");
}

/** Sorted dictionary terms that start with the normalized prefix, bounded. */
export function publishPrefixTerms(
  dictionary: readonly string[],
  prefix: string,
  maximum = MAX_PUBLISH_PREFIX_EXPANSIONS,
): readonly string[] {
  if (prefix === "") return [];
  let low = 0;
  let high = dictionary.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((dictionary[middle] ?? "") < prefix) low = middle + 1;
    else high = middle;
  }
  const found: string[] = [];
  for (let index = low; index < dictionary.length && found.length < maximum; index += 1) {
    const term = dictionary[index] ?? "";
    if (!term.startsWith(prefix)) break;
    found.push(term);
  }
  return found;
}

function fieldMasks(term: string, fields: WordcellSiteDocFieldsV1): number {
  let mask = 0;
  if (fields.t.includes(term)) mask |= PUBLISH_FIELD_TITLE;
  if (fields.a.includes(term)) mask |= PUBLISH_FIELD_ALIAS;
  if (fields.p.includes(term)) mask |= PUBLISH_FIELD_PATH;
  if (fields.g.includes(term)) mask |= PUBLISH_FIELD_TAG;
  if (fields.m.includes(term)) mask |= PUBLISH_FIELD_METADATA;
  return mask;
}

export type PublishScoreInput = {
  readonly doc: WordcellSiteDocV1;
  /**
   * True when the content field contains the term: inline text scan, a
   * postings hit, or a hydrated note payload match.
   */
  readonly contentTerms: ReadonlySet<string>;
  /**
   * Full normalized content text when available (inline mode or a hydrated
   * note payload); enables the content phrase bonus.
   */
  readonly contentText?: string;
};

export type PublishScore = {
  readonly score: number;
  readonly identity: boolean;
  readonly phraseMatched: boolean;
  readonly matchedTerms: number;
};

/**
 * Score one document against a validated query, reproducing the exact lane's
 * rank inputs. Returns null when the document is not admissible: a multi-term
 * query needs bounded coverage unless identity or phrase already matched.
 */
export function scorePublishDocument(
  input: PublishScoreInput,
  query: PublishQuery,
): PublishScore | null {
  const fields = input.doc.f;
  const phrase = query.normalized;
  const weights = PUBLISH_SEARCH_WEIGHTS_V1;
  let score = 0;
  let identity = false;
  let phraseMatched = false;

  if (phrase !== "") {
    if (fields.t === phrase) {
      identity = true;
      score += weights.identity.title;
    }
    if (fields.a.split("\n").includes(phrase)) {
      identity = true;
      score += weights.identity.alias;
    }
    if (fields.p.split("\n").includes(phrase)) {
      identity = true;
      score += weights.identity.path;
    }
    const phraseFields: readonly [number, string, number][] = [
      [PUBLISH_FIELD_TITLE, fields.t, weights.phrase.title],
      [PUBLISH_FIELD_ALIAS, fields.a, weights.phrase.alias],
      [PUBLISH_FIELD_PATH, fields.p, weights.phrase.path],
      [PUBLISH_FIELD_TAG, fields.g, weights.phrase.tag],
      [PUBLISH_FIELD_METADATA, fields.m, weights.phrase.metadata],
    ];
    for (const [, value, weight] of phraseFields) {
      if (value.includes(phrase)) {
        phraseMatched = true;
        score += weight;
      }
    }
    if (input.contentText !== undefined && input.contentText.includes(phrase)) {
      phraseMatched = true;
      score += weights.phrase.content;
    }
  }

  let matchedTerms = 0;
  for (const term of query.terms) {
    const mask = fieldMasks(term, fields)
      | (input.contentTerms.has(term) ? PUBLISH_FIELD_CONTENT : 0);
    if (mask === 0) continue;
    matchedTerms += 1;
    if (mask & PUBLISH_FIELD_TITLE) score += weights.term.title;
    if (mask & PUBLISH_FIELD_ALIAS) score += weights.term.alias;
    if (mask & PUBLISH_FIELD_PATH) score += weights.term.path;
    if (mask & PUBLISH_FIELD_TAG) score += weights.term.tag;
    if (mask & PUBLISH_FIELD_METADATA) score += weights.term.metadata;
    if (mask & PUBLISH_FIELD_CONTENT) score += weights.term.content;
  }
  const requiredTerms = query.terms.length <= 1
    ? query.terms.length
    : Math.min(3, Math.ceil(query.terms.length / 2));
  if (!identity && !phraseMatched && matchedTerms < requiredTerms) return null;
  if (query.terms.length > 0) {
    score += Math.round((matchedTerms / query.terms.length) * weights.coverage);
  }
  if (score === 0) return null;
  return { score, identity, phraseMatched, matchedTerms };
}

/** Deterministic rank: identity first, then score, then document id. */
export function comparePublishScores(
  left: PublishScore & { i: number },
  right: PublishScore & { i: number },
): number {
  return Number(right.identity) - Number(left.identity)
    || right.score - left.score
    || left.i - right.i;
}

/**
 * Bounded context window around the first query match in normalized text.
 * Mirrors `exactSnippet`: collapse whitespace, ellipsize edges.
 */
export function publishSnippet(
  text: string,
  query: PublishQuery,
  fallback: string,
  windowBytes = 160,
): string {
  const normalized = publishNormalize(text);
  let offset = query.normalized === "" ? -1 : normalized.indexOf(query.normalized);
  if (offset < 0) {
    for (const term of query.terms) {
      offset = normalized.indexOf(term);
      if (offset >= 0) break;
    }
  }
  if (offset < 0) return fallback;
  const half = Math.floor(windowBytes / 2);
  const start = Math.max(0, offset - half);
  const end = Math.min(text.length, offset + half);
  const snippet = text.slice(start, end).replace(/\s+/gu, " ").trim();
  return `${start > 0 ? "…" : ""}${snippet}${end < text.length ? "…" : ""}`;
}
