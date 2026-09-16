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
