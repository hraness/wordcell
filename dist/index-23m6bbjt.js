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
var MAX_PUBLISH_QUERY_FILTERS = 8;
var FILTER_PATTERN = /^(tag|type|path):(\S+)$/u;
function trimSlashes(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === 47)
    start += 1;
  while (end > start && value.charCodeAt(end - 1) === 47)
    end -= 1;
  return value.slice(start, end);
}
function publishQueryParts(raw) {
  const tags = [];
  const types = [];
  const paths = [];
  const rest = [];
  for (const token of raw.split(/\s+/u)) {
    if (token === "")
      continue;
    const match = FILTER_PATTERN.exec(token);
    const value = match === null ? "" : publishNormalize(trimSlashes(match[2] ?? ""));
    if (match === null || value === "") {
      rest.push(token);
      continue;
    }
    const bucket = match[1] === "tag" ? tags : match[1] === "type" ? types : paths;
    if (bucket.length < MAX_PUBLISH_QUERY_FILTERS)
      bucket.push(value);
    else
      rest.push(token);
  }
  return { filters: { tags, types, paths }, text: rest.join(" ") };
}
function publishDocMatchesFilters(doc, filters, type) {
  if (filters.tags.length > 0) {
    const tags = doc.f.g === "" ? [] : doc.f.g.split(`
`);
    for (const tag of filters.tags) {
      if (!tags.includes(publishNormalize(tag)))
        return false;
    }
  }
  if (filters.types.length > 0) {
    const docType = publishNormalize(type === undefined || type === "" ? "note" : type);
    for (const wanted of filters.types) {
      if (docType !== publishNormalize(wanted))
        return false;
    }
  }
  if (filters.paths.length > 0) {
    const slug = publishNormalize(doc.s);
    const fields = doc.f.p === "" ? [] : doc.f.p.split(`
`);
    for (const value of filters.paths) {
      const prefix = publishNormalize(trimSlashes(value));
      const boundary = `${prefix}/`;
      const inSlug = slug === prefix || slug.startsWith(boundary);
      const inFields = fields.some((line) => line === prefix || line.startsWith(boundary));
      if (!inSlug && !inFields)
        return false;
    }
  }
  return true;
}
var MAX_PUBLISH_MARK_RANGES = 32;
function publishMarkRanges(text, terms, maximum = MAX_PUBLISH_MARK_RANGES) {
  const display = text.normalize("NFC");
  let normalized = "";
  const map = [];
  for (let offset = 0;offset < display.length; ) {
    const point = display.codePointAt(offset) ?? 0;
    const character = String.fromCodePoint(point);
    const lowered = character.toLocaleLowerCase("en-US");
    for (let index = 0;index < lowered.length; index += 1)
      map.push(offset);
    normalized += lowered;
    offset += character.length;
  }
  const ranges = [];
  for (const term of terms) {
    const needle = publishNormalize(term);
    if (needle === "")
      continue;
    let from = 0;
    while (ranges.length < maximum) {
      const hit = normalized.indexOf(needle, from);
      if (hit === -1)
        break;
      const start = map[hit] ?? 0;
      const tail = hit + needle.length;
      const end = tail >= map.length ? display.length : map[tail] ?? display.length;
      if (end > start)
        ranges.push({ start, end });
      from = tail === 0 ? 1 : tail;
    }
    if (ranges.length >= maximum)
      break;
  }
  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
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
  if (!Number.isSafeInteger(windowBytes) || windowBytes < 0)
    throw new RangeError("Snippet window must be a nonnegative safe byte count.");
  const display = text.normalize("NFC");
  const normalized = publishNormalize(display);
  let match = query.normalized === "" ? -1 : normalized.indexOf(query.normalized);
  if (match < 0) {
    for (const term of query.terms) {
      match = normalized.indexOf(term);
      if (match >= 0)
        break;
    }
  }
  if (match < 0)
    return fallback;
  let offset = 0, normalizedOffset = 0;
  for (const character of display) {
    const width = character.toLocaleLowerCase("en-US").length;
    if (normalizedOffset + width > match)
      break;
    normalizedOffset += width;
    offset += character.length;
  }
  const edge = windowBytes >= 6 ? "\u2026" : "";
  const budget = windowBytes - 2 * publishUtf8Bytes(edge);
  const previous = (end2) => {
    const last = display.charCodeAt(end2 - 1);
    return end2 > 1 && last >= 56320 && last <= 57343 && display.charCodeAt(end2 - 2) >= 55296 && display.charCodeAt(end2 - 2) <= 56319 ? end2 - 2 : end2 - 1;
  };
  let start = offset, end = offset, used = 0;
  while (start > 0) {
    const before = previous(start), bytes = publishUtf8Bytes(display.slice(before, start));
    if (used + bytes > Math.floor(budget / 2))
      break;
    start = before;
    used += bytes;
  }
  while (end < display.length) {
    const character = String.fromCodePoint(display.codePointAt(end) ?? 0), bytes = publishUtf8Bytes(character);
    if (used + bytes > budget)
      break;
    end += character.length;
    used += bytes;
  }
  while (start > 0) {
    const before = previous(start), bytes = publishUtf8Bytes(display.slice(before, start));
    if (used + bytes > budget)
      break;
    start = before;
    used += bytes;
  }
  const snippet = display.slice(start, end).replace(/\s+/gu, " ").trim();
  return `${start > 0 ? edge : ""}${snippet}${end < display.length ? edge : ""}`;
}

export { PUBLISH_FIELD_TITLE, PUBLISH_FIELD_ALIAS, PUBLISH_FIELD_PATH, PUBLISH_FIELD_TAG, PUBLISH_FIELD_METADATA, PUBLISH_FIELD_CONTENT, PUBLISH_SEARCH_WEIGHTS_V1, MAX_PUBLISH_QUERY_BYTES, MAX_PUBLISH_QUERY_TERMS, MAX_PUBLISH_PREFIX_EXPANSIONS, publishUtf8Bytes, publishNormalize, MAX_PUBLISH_QUERY_FILTERS, publishQueryParts, publishDocMatchesFilters, MAX_PUBLISH_MARK_RANGES, publishMarkRanges, publishQuery, publishShardName, publishPrefixTerms, scorePublishDocument, comparePublishScores, publishSnippet };
