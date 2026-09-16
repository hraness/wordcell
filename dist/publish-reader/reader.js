// src/publish-model.ts
var WORDCELL_SITE_FORMAT_V1 = "hraness.wordcell.site.v1";
var WORDCELL_SITE_DOCS_FORMAT_V1 = "hraness.wordcell.site-docs.v1";
var WORDCELL_SITE_TERMS_FORMAT_V1 = "hraness.wordcell.site-terms.v1";
var WORDCELL_SITE_POSTINGS_FORMAT_V1 = "hraness.wordcell.site-postings.v1";
var WORDCELL_SITE_NOTE_FORMAT_V1 = "hraness.wordcell.site-note.v1";
var WORDCELL_SITE_LIMITS_V1 = Object.freeze({
  notes: 1e4,
  assets: 1e4,
  assetBytes: 16 * 1024 * 1024,
  totalAssetBytes: 512 * 1024 * 1024,
  indexTerms: 250000,
  contentShards: 256,
  shardPairs: 250000,
  docPreviewBytes: 240,
  fieldTextBytes: 4 * 1024,
  inlineTextBytes: 16 * 1024,
  inlineTotalBytes: 2 * 1024 * 1024,
  noteTextBytes: 32 * 1024,
  titleBytes: 512,
  descriptionBytes: 4 * 1024,
  searchHydration: 50,
  searchResults: 100
});
var textEncoder = new TextEncoder;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedText(value, maximumBytes, field) {
  if (typeof value !== "string" || textEncoder.encode(value).byteLength > maximumBytes) {
    throw new TypeError(`${field} must be a string of at most ${maximumBytes} bytes`);
  }
  return value;
}
function boundedCount(value, maximum, field) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`${field} must be a safe integer from 0 through ${maximum}`);
  }
  return value;
}
function exactKeys(value, required, optional, field) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      throw new TypeError(`${field} has unexpected key ${JSON.stringify(key)}`);
  }
  for (const key of required) {
    if (!(key in value))
      throw new TypeError(`${field} is missing ${JSON.stringify(key)}`);
  }
}
function stringArray(value, maximum, field) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${field} must be an array of at most ${maximum} strings`);
  }
  for (const item of value) {
    if (typeof item !== "string")
      throw new TypeError(`${field} entries must be strings`);
  }
  return value;
}
function contentSearch(value) {
  if (value === "inline" || value === "shards" || value === "none")
    return value;
  throw new TypeError("search.content must be inline, shards, or none");
}
function parseSiteManifestV1(value) {
  if (!isRecord(value))
    throw new TypeError("manifest must be an object");
  exactKeys(value, ["format", "site", "generated", "source", "paths", "search", "counts", "truncated"], [], "manifest");
  if (value.format !== WORDCELL_SITE_FORMAT_V1) {
    throw new TypeError(`manifest format must be ${WORDCELL_SITE_FORMAT_V1}`);
  }
  const { site, generated, source, paths, search, counts, truncated } = value;
  if (!isRecord(site))
    throw new TypeError("manifest.site must be an object");
  exactKeys(site, ["title", "basePath"], ["description"], "manifest.site");
  if (!isRecord(generated))
    throw new TypeError("manifest.generated must be an object");
  exactKeys(generated, ["by", "version"], ["at"], "manifest.generated");
  if (generated.by !== "@hraness/wordcell") {
    throw new TypeError("manifest.generated.by must be @hraness/wordcell");
  }
  if (!isRecord(source))
    throw new TypeError("manifest.source must be an object");
  exactKeys(source, ["selection", "notes", "digest"], [], "manifest.source");
  if (!isRecord(paths))
    throw new TypeError("manifest.paths must be an object");
  exactKeys(paths, ["catalog", "graph", "docs", "terms", "postingsPrefix", "notePrefix", "assetPrefix", "readerPrefix"], [], "manifest.paths");
  if (!isRecord(search))
    throw new TypeError("manifest.search must be an object");
  exactKeys(search, ["mode", "content", "shards", "hash"], [], "manifest.search");
  if (search.mode !== "exact")
    throw new TypeError("manifest.search.mode must be exact");
  if (search.hash !== "fnv1a32-8bit") {
    throw new TypeError("manifest.search.hash must be fnv1a32-8bit");
  }
  if (!isRecord(counts))
    throw new TypeError("manifest.counts must be an object");
  exactKeys(counts, ["notes", "assets", "bytes"], [], "manifest.counts");
  if (!isRecord(truncated))
    throw new TypeError("manifest.truncated must be an object");
  exactKeys(truncated, [], ["terms", "text", "assets"], "manifest.truncated");
  for (const flag of Object.values(truncated)) {
    if (flag !== true)
      throw new TypeError("manifest.truncated flags must be true");
  }
  const digest = source.digest;
  if (typeof digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw new TypeError("manifest.source.digest must be a sha256 hex digest");
  }
  return {
    format: WORDCELL_SITE_FORMAT_V1,
    site: Object.freeze({
      title: boundedText(site.title, WORDCELL_SITE_LIMITS_V1.titleBytes, "site.title"),
      basePath: boundedText(site.basePath, 1024, "site.basePath"),
      ...site.description === undefined ? {} : { description: boundedText(site.description, WORDCELL_SITE_LIMITS_V1.descriptionBytes, "site.description") }
    }),
    generated: Object.freeze({
      by: "@hraness/wordcell",
      version: boundedText(generated.version, 64, "generated.version"),
      ...generated.at === undefined ? {} : { at: boundedText(generated.at, 64, "generated.at") }
    }),
    source: Object.freeze({
      selection: source.selection,
      notes: boundedCount(source.notes, WORDCELL_SITE_LIMITS_V1.notes, "source.notes"),
      digest
    }),
    paths: Object.freeze({
      catalog: boundedText(paths.catalog, 256, "paths.catalog"),
      graph: boundedText(paths.graph, 256, "paths.graph"),
      docs: boundedText(paths.docs, 256, "paths.docs"),
      terms: boundedText(paths.terms, 256, "paths.terms"),
      postingsPrefix: boundedText(paths.postingsPrefix, 256, "paths.postingsPrefix"),
      notePrefix: boundedText(paths.notePrefix, 256, "paths.notePrefix"),
      assetPrefix: boundedText(paths.assetPrefix, 256, "paths.assetPrefix"),
      readerPrefix: boundedText(paths.readerPrefix, 256, "paths.readerPrefix")
    }),
    search: Object.freeze({
      mode: "exact",
      content: contentSearch(search.content),
      shards: boundedCount(search.shards, WORDCELL_SITE_LIMITS_V1.contentShards, "search.shards"),
      hash: "fnv1a32-8bit"
    }),
    counts: Object.freeze({
      notes: boundedCount(counts.notes, WORDCELL_SITE_LIMITS_V1.notes, "counts.notes"),
      assets: boundedCount(counts.assets, WORDCELL_SITE_LIMITS_V1.assets, "counts.assets"),
      bytes: boundedCount(counts.bytes, Number.MAX_SAFE_INTEGER, "counts.bytes")
    }),
    truncated: Object.freeze({ ...truncated })
  };
}
function docFields(value, field) {
  if (!isRecord(value))
    throw new TypeError(`${field} must be an object`);
  exactKeys(value, ["t", "a", "p", "g", "m"], [], field);
  return {
    t: boundedText(value.t, WORDCELL_SITE_LIMITS_V1.fieldTextBytes, `${field}.t`),
    a: boundedText(value.a, WORDCELL_SITE_LIMITS_V1.fieldTextBytes, `${field}.a`),
    p: boundedText(value.p, WORDCELL_SITE_LIMITS_V1.fieldTextBytes, `${field}.p`),
    g: boundedText(value.g, WORDCELL_SITE_LIMITS_V1.fieldTextBytes, `${field}.g`),
    m: boundedText(value.m, WORDCELL_SITE_LIMITS_V1.fieldTextBytes, `${field}.m`)
  };
}
function parseSiteDocsV1(value) {
  if (!isRecord(value))
    throw new TypeError("docs must be an object");
  exactKeys(value, ["format", "content", "docs"], [], "docs");
  if (value.format !== WORDCELL_SITE_DOCS_FORMAT_V1) {
    throw new TypeError(`docs format must be ${WORDCELL_SITE_DOCS_FORMAT_V1}`);
  }
  const content = contentSearch(value.content);
  if (!Array.isArray(value.docs) || value.docs.length > WORDCELL_SITE_LIMITS_V1.notes) {
    throw new TypeError("docs.docs must be a bounded array");
  }
  const docs = value.docs.map((entry, index) => {
    const field = `docs entry ${index}`;
    if (!isRecord(entry))
      throw new TypeError(`${field} must be an object`);
    exactKeys(entry, ["i", "s", "t", "p", "f"], ["x"], field);
    const inline = entry.x === undefined ? {} : { x: boundedText(entry.x, WORDCELL_SITE_LIMITS_V1.inlineTextBytes, `${field}.x`) };
    return {
      i: boundedCount(entry.i, WORDCELL_SITE_LIMITS_V1.notes, `${field}.i`),
      s: boundedText(entry.s, 1024, `${field}.s`),
      t: boundedText(entry.t, WORDCELL_SITE_LIMITS_V1.titleBytes, `${field}.t`),
      p: boundedText(entry.p, WORDCELL_SITE_LIMITS_V1.docPreviewBytes + 16, `${field}.p`),
      f: docFields(entry.f, `${field}.f`),
      ...inline
    };
  });
  return { format: WORDCELL_SITE_DOCS_FORMAT_V1, content, docs };
}
function parseSiteTermsV1(value) {
  if (!isRecord(value))
    throw new TypeError("terms must be an object");
  exactKeys(value, ["format", "terms"], [], "terms");
  if (value.format !== WORDCELL_SITE_TERMS_FORMAT_V1) {
    throw new TypeError(`terms format must be ${WORDCELL_SITE_TERMS_FORMAT_V1}`);
  }
  return {
    format: WORDCELL_SITE_TERMS_FORMAT_V1,
    terms: stringArray(value.terms, WORDCELL_SITE_LIMITS_V1.indexTerms, "terms.terms")
  };
}
function parseSitePostingsV1(value) {
  if (!isRecord(value))
    throw new TypeError("postings must be an object");
  exactKeys(value, ["format", "shard", "postings"], [], "postings");
  if (value.format !== WORDCELL_SITE_POSTINGS_FORMAT_V1) {
    throw new TypeError(`postings format must be ${WORDCELL_SITE_POSTINGS_FORMAT_V1}`);
  }
  const shard = value.shard;
  if (typeof shard !== "string" || !/^[0-9a-f]{2}$/u.test(shard)) {
    throw new TypeError("postings.shard must be a two-digit lowercase hex string");
  }
  if (!isRecord(value.postings))
    throw new TypeError("postings.postings must be an object");
  const entries = Object.entries(value.postings);
  if (entries.length > WORDCELL_SITE_LIMITS_V1.shardPairs) {
    throw new TypeError("postings.postings exceeds the shard pair limit");
  }
  const postings = Object.create(null);
  for (const [term, docs] of entries) {
    if (!Array.isArray(docs) || docs.length > WORDCELL_SITE_LIMITS_V1.notes) {
      throw new TypeError(`postings for ${JSON.stringify(term)} must be a bounded array`);
    }
    postings[term] = docs.map((doc) => boundedCount(doc, WORDCELL_SITE_LIMITS_V1.notes, "posting document id"));
  }
  return { format: WORDCELL_SITE_POSTINGS_FORMAT_V1, shard, postings: Object.freeze(postings) };
}
function noteLinks(value, field) {
  if (!Array.isArray(value) || value.length > WORDCELL_SITE_LIMITS_V1.notes) {
    throw new TypeError(`${field} must be a bounded array`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry))
      throw new TypeError(`${field} ${index} must be an object`);
    exactKeys(entry, ["s", "t"], [], `${field} ${index}`);
    return {
      s: boundedText(entry.s, 1024, `${field} ${index}.s`),
      t: boundedText(entry.t, WORDCELL_SITE_LIMITS_V1.titleBytes, `${field} ${index}.t`)
    };
  });
}
function parseSiteNoteV1(value) {
  if (!isRecord(value))
    throw new TypeError("note payload must be an object");
  exactKeys(value, ["format", "id", "slug", "title", "aliases", "tags", "summary", "text", "textTruncated", "links", "backlinks", "relations", "relationBacklinks"], ["type"], "note payload");
  if (value.format !== WORDCELL_SITE_NOTE_FORMAT_V1) {
    throw new TypeError(`note payload format must be ${WORDCELL_SITE_NOTE_FORMAT_V1}`);
  }
  if (value.textTruncated !== true && value.textTruncated !== false) {
    throw new TypeError("note payload textTruncated must be boolean");
  }
  return {
    format: WORDCELL_SITE_NOTE_FORMAT_V1,
    id: boundedText(value.id, 1024, "note.id"),
    slug: boundedText(value.slug, 1024, "note.slug"),
    title: boundedText(value.title, WORDCELL_SITE_LIMITS_V1.titleBytes, "note.title"),
    aliases: stringArray(value.aliases, 128, "note.aliases"),
    ...value.type === undefined ? {} : { type: boundedText(value.type, 256, "note.type") },
    tags: stringArray(value.tags, 128, "note.tags"),
    summary: boundedText(value.summary, WORDCELL_SITE_LIMITS_V1.descriptionBytes, "note.summary"),
    text: boundedText(value.text, WORDCELL_SITE_LIMITS_V1.noteTextBytes, "note.text"),
    textTruncated: value.textTruncated,
    links: noteLinks(value.links, "note.links"),
    backlinks: noteLinks(value.backlinks, "note.backlinks"),
    relations: noteRelations(value.relations, "note.relations"),
    relationBacklinks: noteRelations(value.relationBacklinks, "note.relationBacklinks")
  };
}
function noteRelations(value, field) {
  if (!Array.isArray(value) || value.length > WORDCELL_SITE_LIMITS_V1.notes) {
    throw new TypeError(`${field} must be a bounded array`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry))
      throw new TypeError(`${field} ${index} must be an object`);
    exactKeys(entry, ["p", "s", "t"], [], `${field} ${index}`);
    return {
      p: boundedText(entry.p, 256, `${field} ${index}.p`),
      s: boundedText(entry.s, 1024, `${field} ${index}.s`),
      t: boundedText(entry.t, WORDCELL_SITE_LIMITS_V1.titleBytes, `${field} ${index}.t`)
    };
  });
}

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
var textEncoder2 = new TextEncoder;
function publishUtf8Bytes(value) {
  return textEncoder2.encode(value).byteLength;
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
  return `${start > 0 ? "…" : ""}${snippet}${end < text.length ? "…" : ""}`;
}

// src/publish-reader/reader.ts
var dom = globalThis;
async function fetchJson(base, path) {
  const response = await dom.fetch(`${base}${path}`);
  if (!response.ok)
    return;
  return response.json();
}
async function loadIndex(base) {
  const manifestRaw = await fetchJson(base, "manifest.json");
  if (manifestRaw === undefined)
    return;
  const manifest = parseSiteManifestV1(manifestRaw);
  const docsRaw = await fetchJson(base, manifest.paths.docs);
  const termsRaw = await fetchJson(base, manifest.paths.terms);
  if (docsRaw === undefined || termsRaw === undefined)
    return;
  const docs = parseSiteDocsV1(docsRaw);
  const terms = parseSiteTermsV1(termsRaw);
  return {
    manifest,
    docs: docs.docs,
    terms: terms.terms,
    postings: new Map,
    notes: new Map
  };
}
async function loadShard(index, base, shard) {
  const cached = index.postings.get(shard);
  if (cached !== undefined)
    return cached;
  const raw = await fetchJson(base, `${index.manifest.paths.postingsPrefix}${shard}.json`);
  const postings = raw === undefined ? new Map : new Map(Object.entries(parseSitePostingsV1(raw).postings));
  index.postings.set(shard, postings);
  return postings;
}
async function hydrate(index, base, slug) {
  const cached = index.notes.get(slug);
  if (cached !== undefined)
    return cached;
  const path = slug === "" ? "index.json" : `${index.manifest.paths.notePrefix}${slug}.json`;
  const raw = await fetchJson(base, path);
  if (raw === undefined)
    return;
  const note = parseSiteNoteV1(raw);
  index.notes.set(slug, note);
  return note;
}
async function search(index, base, raw) {
  const query = publishQuery(raw);
  if (query.terms.length === 0 && query.normalized === "")
    return [];
  const postingsHits = new Map;
  if (index.manifest.search.content === "shards") {
    const expandedByTerm = new Map;
    const shards = new Set;
    for (const term of query.terms) {
      const expanded = publishPrefixTerms(index.terms, term, MAX_PUBLISH_PREFIX_EXPANSIONS);
      expandedByTerm.set(term, expanded);
      for (const candidate of expanded)
        shards.add(publishShardName(candidate));
    }
    const tables = new Map;
    for (const shard of shards)
      tables.set(shard, await loadShard(index, base, shard));
    for (const doc of index.docs) {
      const hits2 = new Set;
      for (const term of query.terms) {
        const matched = (expandedByTerm.get(term) ?? []).some((candidate) => tables.get(publishShardName(candidate))?.get(candidate)?.includes(doc.i) === true);
        if (matched)
          hits2.add(term);
      }
      postingsHits.set(doc.i, hits2);
    }
  }
  const hits = [];
  for (const doc of index.docs) {
    const inline = index.manifest.search.content === "inline" ? doc.x : undefined;
    const contentTerms = inline !== undefined ? new Set(query.terms.filter((term) => inline.includes(term))) : postingsHits.get(doc.i) ?? new Set;
    const scored = scorePublishDocument({ doc, contentTerms, ...inline === undefined ? {} : { contentText: inline } }, query);
    if (scored === null)
      continue;
    hits.push({ doc, score: scored });
  }
  hits.sort((left, right) => comparePublishScores({ i: left.doc.i, ...left.score }, { i: right.doc.i, ...right.score }));
  return hits.slice(0, WORDCELL_SITE_LIMITS_V1.searchResults);
}
function resultHref(base, slug) {
  return slug === "" ? base : `${base}n/${encodeURI(slug)}/`;
}
function snippetFor(index, doc, query) {
  const hydrated = index.notes.get(doc.s);
  const text = hydrated?.text ?? doc.x;
  return text === undefined ? doc.p : publishSnippet(text, query, doc.p);
}
function buildOverlay(base) {
  const overlay = dom.document.createElement("div");
  overlay.className = "wordcell-search-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Search");
  const panel = dom.document.createElement("div");
  panel.className = "wordcell-search-panel";
  const input = dom.document.createElement("input");
  input.type = "search";
  input.placeholder = "Search this site…";
  input.setAttribute("aria-label", "Search this site");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  const status = dom.document.createElement("div");
  status.className = "wordcell-search-status";
  status.setAttribute("role", "status");
  const list = dom.document.createElement("ul");
  list.className = "wordcell-search-results";
  panel.appendChild(input);
  panel.appendChild(status);
  panel.appendChild(list);
  overlay.appendChild(panel);
  let index;
  let loading;
  let hits = [];
  let active = -1;
  let debounce = 0;
  const render = () => {
    list.innerHTML = "";
    let query;
    try {
      query = publishQuery(input.value);
    } catch {
      query = undefined;
    }
    for (const [position, hit] of hits.entries()) {
      const item = dom.document.createElement("li");
      const link = dom.document.createElement("a");
      link.href = resultHref(base, hit.doc.s);
      link.className = position === active ? "active" : "";
      const title = dom.document.createElement("span");
      title.className = "title";
      title.textContent = hit.doc.t;
      const snippet = dom.document.createElement("span");
      snippet.className = "snippet";
      snippet.textContent = index === undefined || query === undefined ? hit.doc.p : snippetFor(index, hit.doc, query);
      link.appendChild(title);
      link.appendChild(snippet);
      item.appendChild(link);
      list.appendChild(item);
    }
    status.textContent = hits.length === 0 ? input.value.trim() === "" ? "Type to search." : "No results." : `${hits.length} result${hits.length === 1 ? "" : "s"}`;
  };
  const run = () => {
    (async () => {
      if (index === undefined) {
        loading ??= loadIndex(base);
        index = await loading;
        if (index === undefined) {
          status.textContent = "Search is unavailable for this site.";
          return;
        }
      }
      try {
        hits = await search(index, base, input.value);
      } catch {
        hits = [];
      }
      active = hits.length === 0 ? -1 : 0;
      render();
      const current = index;
      Promise.all(hits.slice(0, WORDCELL_SITE_LIMITS_V1.searchHydration).map((hit) => hydrate(current, base, hit.doc.s))).then(() => render());
    })();
  };
  input.addEventListener("input", () => {
    dom.clearTimeout(debounce);
    debounce = dom.setTimeout(run, 80);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (hits.length > 0) {
        active = Math.min(hits.length - 1, active + 1);
        render();
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (hits.length > 0) {
        active = Math.max(0, active - 1);
        render();
      }
    } else if (event.key === "Enter") {
      const hit = hits[active];
      if (hit !== undefined) {
        event.preventDefault();
        dom.location.assign(resultHref(base, hit.doc.s));
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      overlay.remove();
    }
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay)
      overlay.remove();
  });
  return {
    open() {
      dom.document.body.appendChild(overlay);
      hits = [];
      active = -1;
      render();
      input.focus();
      if (index === undefined || input.value.trim() !== "")
        run();
    },
    close() {
      overlay.remove();
    }
  };
}
function start() {
  const content = dom.document.querySelector('meta[name="wordcell:base"]')?.getAttribute("content") ?? "./";
  const base = content.endsWith("/") ? content : `${content}/`;
  const overlay = buildOverlay(base);
  for (const button of Array.from(dom.document.querySelectorAll("[data-wordcell-search]"))) {
    button.addEventListener("click", () => overlay.open());
  }
  dom.document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/u.test(event.target?.tagName ?? "")) {
      event.preventDefault();
      overlay.open();
    }
    if (event.key === "Escape")
      overlay.close();
  });
}
if (dom.document.querySelector("[data-wordcell-search]") !== null) {
  start();
}
