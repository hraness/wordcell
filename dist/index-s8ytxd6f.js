// @bun
// src/publish-search.ts
var PUBLISH_FIELD_TITLE = 1;
var PUBLISH_FIELD_ALIAS = 2;
var PUBLISH_FIELD_PATH = 4;
var PUBLISH_FIELD_TAG = 8;
var PUBLISH_FIELD_METADATA = 16;
var PUBLISH_FIELD_CONTENT = 32;
var PUBLISH_SEARCH_WEIGHTS_V1 = Object.freeze({
  identity: Object.freeze({ title: 1000, alias: 950, path: 900 }),
  phrase: Object.freeze({
    title: 400,
    alias: 350,
    path: 300,
    tag: 250,
    content: 150,
    metadata: 100
  }),
  term: Object.freeze({
    title: 40,
    alias: 35,
    path: 30,
    tag: 30,
    metadata: 10,
    content: 5
  }),
  coverage: 100
});
var MAX_PUBLISH_QUERY_BYTES = 16 * 1024;
var MAX_PUBLISH_QUERY_TERMS = 64;
var MAX_PUBLISH_PREFIX_EXPANSIONS = 32;
var TERM_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}._/-]*/gu;
var textEncoder = new TextEncoder;
function publishUtf8Bytes(value) {
  return textEncoder.encode(value).byteLength;
}
function publishNormalize(value) {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}
function publishQuery(value) {
  if (typeof value !== "string") {
    throw new TypeError("Search query must be a string.");
  }
  if (publishUtf8Bytes(value) > MAX_PUBLISH_QUERY_BYTES) {
    throw new RangeError(`Search query exceeds the ${MAX_PUBLISH_QUERY_BYTES}-byte limit.`);
  }
  const raw = value.trim();
  const normalized = publishNormalize(raw);
  const terms = [];
  const seen = new Set;
  for (const match of normalized.matchAll(TERM_PATTERN)) {
    if (seen.has(match[0]))
      continue;
    seen.add(match[0]);
    terms.push(match[0]);
    if (terms.length > MAX_PUBLISH_QUERY_TERMS) {
      throw new RangeError(`Search query may contain at most ${MAX_PUBLISH_QUERY_TERMS} unique normalized terms.`);
    }
  }
  return { raw, normalized, terms };
}
function publishShardName(term) {
  let hash = 2166136261;
  for (let index = 0;index < term.length; index += 1) {
    hash ^= term.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash >>> 24).toString(16).padStart(2, "0");
}
function publishPrefixTerms(dictionary, prefix, maximum = MAX_PUBLISH_PREFIX_EXPANSIONS) {
  if (prefix === "")
    return [];
  let low = 0;
  let high = dictionary.length;
  while (low < high) {
    const middle = low + high >> 1;
    if ((dictionary[middle] ?? "") < prefix)
      low = middle + 1;
    else
      high = middle;
  }
  const found = [];
  for (let index = low;index < dictionary.length && found.length < maximum; index += 1) {
    const term = dictionary[index] ?? "";
    if (!term.startsWith(prefix))
      break;
    found.push(term);
  }
  return found;
}
function fieldMasks(term, fields) {
  let mask = 0;
  if (fields.t.includes(term))
    mask |= PUBLISH_FIELD_TITLE;
  if (fields.a.includes(term))
    mask |= PUBLISH_FIELD_ALIAS;
  if (fields.p.includes(term))
    mask |= PUBLISH_FIELD_PATH;
  if (fields.g.includes(term))
    mask |= PUBLISH_FIELD_TAG;
  if (fields.m.includes(term))
    mask |= PUBLISH_FIELD_METADATA;
  return mask;
}
function scorePublishDocument(input, query) {
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
    if (fields.a.split(`
`).includes(phrase)) {
      identity = true;
      score += weights.identity.alias;
    }
    if (fields.p.split(`
`).includes(phrase)) {
      identity = true;
      score += weights.identity.path;
    }
    const phraseFields = [
      [PUBLISH_FIELD_TITLE, fields.t, weights.phrase.title],
      [PUBLISH_FIELD_ALIAS, fields.a, weights.phrase.alias],
      [PUBLISH_FIELD_PATH, fields.p, weights.phrase.path],
      [PUBLISH_FIELD_TAG, fields.g, weights.phrase.tag],
      [PUBLISH_FIELD_METADATA, fields.m, weights.phrase.metadata]
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
    const mask = fieldMasks(term, fields) | (input.contentTerms.has(term) ? PUBLISH_FIELD_CONTENT : 0);
    if (mask === 0)
      continue;
    matchedTerms += 1;
    if (mask & PUBLISH_FIELD_TITLE)
      score += weights.term.title;
    if (mask & PUBLISH_FIELD_ALIAS)
      score += weights.term.alias;
    if (mask & PUBLISH_FIELD_PATH)
      score += weights.term.path;
    if (mask & PUBLISH_FIELD_TAG)
      score += weights.term.tag;
    if (mask & PUBLISH_FIELD_METADATA)
      score += weights.term.metadata;
    if (mask & PUBLISH_FIELD_CONTENT)
      score += weights.term.content;
  }
  const requiredTerms = query.terms.length <= 1 ? query.terms.length : Math.min(3, Math.ceil(query.terms.length / 2));
  if (!identity && !phraseMatched && matchedTerms < requiredTerms)
    return null;
  if (query.terms.length > 0) {
    score += Math.round(matchedTerms / query.terms.length * weights.coverage);
  }
  if (score === 0)
    return null;
  return { score, identity, phraseMatched, matchedTerms };
}
function comparePublishScores(left, right) {
  return Number(right.identity) - Number(left.identity) || right.score - left.score || left.i - right.i;
}
function publishSnippet(text, query, fallback, windowBytes = 160) {
  const normalized = publishNormalize(text);
  let offset = query.normalized === "" ? -1 : normalized.indexOf(query.normalized);
  if (offset < 0) {
    for (const term of query.terms) {
      offset = normalized.indexOf(term);
      if (offset >= 0)
        break;
    }
  }
  if (offset < 0)
    return fallback;
  const half = Math.floor(windowBytes / 2);
  const start = Math.max(0, offset - half);
  const end = Math.min(text.length, offset + half);
  const snippet = text.slice(start, end).replace(/\s+/gu, " ").trim();
  return `${start > 0 ? "\u2026" : ""}${snippet}${end < text.length ? "\u2026" : ""}`;
}

export { PUBLISH_FIELD_TITLE, PUBLISH_FIELD_ALIAS, PUBLISH_FIELD_PATH, PUBLISH_FIELD_TAG, PUBLISH_FIELD_METADATA, PUBLISH_FIELD_CONTENT, PUBLISH_SEARCH_WEIGHTS_V1, MAX_PUBLISH_QUERY_BYTES, MAX_PUBLISH_QUERY_TERMS, MAX_PUBLISH_PREFIX_EXPANSIONS, publishUtf8Bytes, publishNormalize, publishQuery, publishShardName, publishPrefixTerms, scorePublishDocument, comparePublishScores, publishSnippet };
