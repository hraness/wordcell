// src/publish-model.ts
var WORDCELL_SITE_FORMAT_V1 = "hraness.wordcell.site.v1";
var WORDCELL_SITE_CATALOG_FORMAT_V1 = "hraness.wordcell.site-catalog.v1";
var WORDCELL_SITE_DOCS_FORMAT_V1 = "hraness.wordcell.site-docs.v1";
var WORDCELL_SITE_TERMS_FORMAT_V1 = "hraness.wordcell.site-terms.v1";
var WORDCELL_SITE_POSTINGS_FORMAT_V1 = "hraness.wordcell.site-postings.v1";
var WORDCELL_SITE_NOTE_FORMAT_V1 = "hraness.wordcell.site-note.v1";
var WORDCELL_SITE_GRAPH_FORMAT_V1 = "hraness.wordcell.site-graph.v1";
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
function parseSiteCatalogV1(value) {
  if (!isRecord(value))
    throw new TypeError("catalog must be an object");
  exactKeys(value, ["format", "entries"], [], "catalog");
  if (value.format !== WORDCELL_SITE_CATALOG_FORMAT_V1) {
    throw new TypeError(`catalog format must be ${WORDCELL_SITE_CATALOG_FORMAT_V1}`);
  }
  if (!Array.isArray(value.entries) || value.entries.length > WORDCELL_SITE_LIMITS_V1.notes) {
    throw new TypeError("catalog.entries must be a bounded array");
  }
  const entries = value.entries.map((entry, index) => {
    if (!isRecord(entry))
      throw new TypeError(`catalog entry ${index} must be an object`);
    exactKeys(entry, ["i", "s", "t"], ["type", "g"], `catalog entry ${index}`);
    return {
      i: boundedCount(entry.i, WORDCELL_SITE_LIMITS_V1.notes, `catalog entry ${index}.i`),
      s: boundedText(entry.s, 1024, `catalog entry ${index}.s`),
      t: boundedText(entry.t, WORDCELL_SITE_LIMITS_V1.titleBytes, `catalog entry ${index}.t`),
      ...entry.type === undefined ? {} : { type: boundedText(entry.type, 256, `catalog entry ${index}.type`) },
      ...entry.g === undefined ? {} : { g: stringArray(entry.g, 128, `catalog entry ${index}.g`) }
    };
  });
  return { format: WORDCELL_SITE_CATALOG_FORMAT_V1, entries };
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
function parseSiteGraphV1(value) {
  if (!isRecord(value))
    throw new TypeError("graph must be an object");
  exactKeys(value, ["format", "edges"], [], "graph");
  if (value.format !== WORDCELL_SITE_GRAPH_FORMAT_V1) {
    throw new TypeError(`graph format must be ${WORDCELL_SITE_GRAPH_FORMAT_V1}`);
  }
  if (!Array.isArray(value.edges) || value.edges.length > 1e6) {
    throw new TypeError("graph.edges must be a bounded array");
  }
  const edges = value.edges.map((entry, index) => {
    if (!isRecord(entry))
      throw new TypeError(`graph edge ${index} must be an object`);
    exactKeys(entry, ["s", "t", "k"], ["p"], `graph edge ${index}`);
    if (entry.k !== "link" && entry.k !== "relation") {
      throw new TypeError(`graph edge ${index}.k must be link or relation`);
    }
    return {
      s: boundedCount(entry.s, WORDCELL_SITE_LIMITS_V1.notes, `graph edge ${index}.s`),
      t: boundedCount(entry.t, WORDCELL_SITE_LIMITS_V1.notes, `graph edge ${index}.t`),
      k: entry.k,
      ...entry.p === undefined ? {} : { p: boundedText(entry.p, 256, `graph edge ${index}.p`) }
    };
  });
  return { format: WORDCELL_SITE_GRAPH_FORMAT_V1, edges };
}

// src/publish-graph.ts
var WORDCELL_SITE_GRAPH_VIEW_LIMIT = 1000;
function mulberry32(seed) {
  let state = seed | 0;
  return () => {
    state = state + 1831565813 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
function siteGraphSeed(slugs, edges) {
  let hash = 2166136261;
  const mix = (text) => {
    for (let index = 0;index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  };
  for (const slug of slugs) {
    mix(slug);
    mix(`
`);
  }
  mix("\x00");
  for (const edge of edges) {
    mix(`${String(edge.s)}-${String(edge.t)},`);
  }
  return hash >>> 0;
}
function layoutSiteGraph(nodeCount, edges, options) {
  if (nodeCount <= 0)
    return [];
  const width = options.width ?? 1000;
  const height = options.height ?? 700;
  const iterations = options.iterations ?? Math.max(80, Math.min(260, 24000 / nodeCount));
  const random = mulberry32(options.seed);
  const x = new Float64Array(nodeCount);
  const y = new Float64Array(nodeCount);
  const dx = new Float64Array(nodeCount);
  const dy = new Float64Array(nodeCount);
  for (let index = 0;index < nodeCount; index += 1) {
    x[index] = (random() - 0.5) * width;
    y[index] = (random() - 0.5) * height;
  }
  if (nodeCount === 1) {
    x[0] = 0;
    y[0] = 0;
    return [{ x: 0, y: 0 }];
  }
  const pairs = new Set;
  const deduped = [];
  for (const edge of edges) {
    const s = Math.min(edge.s, edge.t);
    const t = Math.max(edge.s, edge.t);
    if (s === t || s < 0 || t >= nodeCount)
      continue;
    const key = s * nodeCount + t;
    if (pairs.has(key))
      continue;
    pairs.add(key);
    deduped.push({ s, t });
  }
  const area = width * height;
  const k = Math.sqrt(area / nodeCount);
  const centerX = 0;
  const centerY = 0;
  const epsilon = 0.01;
  const gravity = 0.05;
  let temperature = k * 2;
  for (let iteration = 0;iteration < iterations; iteration += 1) {
    dx.fill(0);
    dy.fill(0);
    for (let i = 0;i < nodeCount; i += 1) {
      for (let j = i + 1;j < nodeCount; j += 1) {
        const deltaX = (x[i] ?? 0) - (x[j] ?? 0);
        const deltaY = (y[i] ?? 0) - (y[j] ?? 0);
        const distance = Math.max(Math.sqrt(deltaX * deltaX + deltaY * deltaY), epsilon);
        const force = k * k / distance;
        const ux = deltaX / distance * force;
        const uy = deltaY / distance * force;
        dx[i] = (dx[i] ?? 0) + ux;
        dy[i] = (dy[i] ?? 0) + uy;
        dx[j] = (dx[j] ?? 0) - ux;
        dy[j] = (dy[j] ?? 0) - uy;
      }
    }
    for (const edge of deduped) {
      const deltaX = (x[edge.s] ?? 0) - (x[edge.t] ?? 0);
      const deltaY = (y[edge.s] ?? 0) - (y[edge.t] ?? 0);
      const distance = Math.max(Math.sqrt(deltaX * deltaX + deltaY * deltaY), epsilon);
      const force = distance * distance / k;
      const ux = deltaX / distance * force;
      const uy = deltaY / distance * force;
      dx[edge.s] = (dx[edge.s] ?? 0) - ux;
      dy[edge.s] = (dy[edge.s] ?? 0) - uy;
      dx[edge.t] = (dx[edge.t] ?? 0) + ux;
      dy[edge.t] = (dy[edge.t] ?? 0) + uy;
    }
    for (let i = 0;i < nodeCount; i += 1) {
      dx[i] = (dx[i] ?? 0) + (centerX - (x[i] ?? 0)) * gravity;
      dy[i] = (dy[i] ?? 0) + (centerY - (y[i] ?? 0)) * gravity;
    }
    for (let i = 0;i < nodeCount; i += 1) {
      const moveX = dx[i] ?? 0;
      const moveY = dy[i] ?? 0;
      const length = Math.sqrt(moveX * moveX + moveY * moveY);
      if (length === 0)
        continue;
      const bounded = Math.min(length, temperature);
      x[i] = (x[i] ?? 0) + moveX / length * bounded;
      y[i] = (y[i] ?? 0) + moveY / length * bounded;
    }
    temperature *= 1 - (iteration + 1) / iterations;
  }
  const points = [];
  for (let index = 0;index < nodeCount; index += 1) {
    points.push({ x: x[index] ?? 0, y: y[index] ?? 0 });
  }
  return points;
}
function siteGraphDegrees(nodeCount, edges) {
  const degree = new Array(Math.max(0, nodeCount)).fill(0);
  for (const edge of edges) {
    if (edge.s === edge.t || edge.s < 0 || edge.t < 0)
      continue;
    if (edge.s >= nodeCount || edge.t >= nodeCount)
      continue;
    degree[edge.s] = (degree[edge.s] ?? 0) + 1;
    degree[edge.t] = (degree[edge.t] ?? 0) + 1;
  }
  return degree;
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

// src/publish-theme.ts
var wordcellPalettes = [
  "wordcell",
  "catppuccin",
  "gruvbox",
  "rose-pine",
  "tokyo-night"
];
var wordcellPaletteLabels = {
  wordcell: "Wordcell",
  catppuccin: "Catppuccin",
  gruvbox: "Gruvbox",
  "rose-pine": "Rosé Pine",
  "tokyo-night": "Tokyo Night"
};
var wordcellAppearanceModes = ["system", "light", "dark"];
var wordcellAppearanceModeLabels = {
  system: "System",
  light: "Light",
  dark: "Dark"
};
function wordcellAppearanceBridge() {
  return globalThis.wordcellAppearance;
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
    notes: new Map,
    catalog: undefined
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
async function loadCatalog(index, base) {
  if (index.catalog !== undefined)
    return index.catalog;
  const raw = await fetchJson(base, index.manifest.paths.catalog);
  if (raw === undefined)
    return;
  index.catalog = parseSiteCatalogV1(raw);
  return index.catalog;
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
var FILTER_ONLY_SCORE = Object.freeze({
  score: 0,
  identity: false,
  phraseMatched: false,
  matchedTerms: 0
});
function hasFilters(filters) {
  return filters.tags.length + filters.types.length + filters.paths.length > 0;
}
async function search(index, base, raw) {
  const { filters, text } = publishQueryParts(raw);
  const filtered = hasFilters(filters);
  const query = publishQuery(text);
  if (!filtered && query.terms.length === 0 && query.normalized === "")
    return [];
  let typeByIndex;
  if (filters.types.length > 0) {
    const catalog = await loadCatalog(index, base);
    typeByIndex = new Map((catalog?.entries ?? []).map((entry) => [entry.i, entry.type ?? "note"]));
  }
  const postingsHits = new Map;
  if (index.manifest.search.content === "shards" && query.terms.length > 0) {
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
    if (!publishDocMatchesFilters(doc, filters, typeByIndex?.get(doc.i)))
      continue;
    if (query.terms.length === 0 && query.normalized === "") {
      hits.push({ doc, score: FILTER_ONLY_SCORE });
      continue;
    }
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
function appendMarked(parent, text, terms) {
  const display = text.normalize("NFC");
  const ranges = publishMarkRanges(display, terms);
  if (ranges.length === 0) {
    parent.appendChild(dom.document.createTextNode(display));
    return;
  }
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parent.appendChild(dom.document.createTextNode(display.slice(cursor, range.start)));
    }
    const mark = dom.document.createElement("mark");
    mark.textContent = display.slice(range.start, range.end);
    parent.appendChild(mark);
    cursor = range.end;
  }
  if (cursor < display.length) {
    parent.appendChild(dom.document.createTextNode(display.slice(cursor)));
  }
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
  input.placeholder = "Search this site… (tag:, type:, path:)";
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
      query = publishQuery(publishQueryParts(input.value).text);
    } catch {
      query = undefined;
    }
    const terms = query?.terms ?? [];
    for (const [position, hit] of hits.entries()) {
      const item = dom.document.createElement("li");
      const link = dom.document.createElement("a");
      link.href = resultHref(base, hit.doc.s);
      link.className = position === active ? "active" : "";
      const title = dom.document.createElement("span");
      title.className = "title";
      appendMarked(title, hit.doc.t, terms);
      const snippet = dom.document.createElement("span");
      snippet.className = "snippet";
      const snippetText = index === undefined || query === undefined || query.terms.length === 0 ? hit.doc.p : snippetFor(index, hit.doc, query);
      appendMarked(snippet, snippetText, terms);
      link.appendChild(title);
      link.appendChild(snippet);
      item.appendChild(link);
      list.appendChild(item);
    }
    status.textContent = hits.length === 0 ? input.value.trim() === "" ? "Type to search. Filter with tag:, type:, path:." : "No results." : `${hits.length} result${hits.length === 1 ? "" : "s"}`;
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
var GRAPH_MIN_SCALE = 0.05;
var GRAPH_MAX_SCALE = 8;
function cssVar(shell, name, fallback) {
  const value = dom.getComputedStyle?.(shell).getPropertyValue(name).trim();
  return value === undefined || value === "" ? fallback : value;
}
function graphTheme(shell) {
  return {
    bg: cssVar(shell, "--wordcell-bg", "#ffffff"),
    fg: cssVar(shell, "--wordcell-fg", "#1a1a1a"),
    muted: cssVar(shell, "--wordcell-muted", "#5f6368"),
    border: cssVar(shell, "--wordcell-border", "#e1e4e8"),
    accent: cssVar(shell, "--wordcell-accent", "#0b5bd3")
  };
}
function fitView(points, width, height) {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(maxX - minX, 40);
  const spanY = Math.max(maxY - minY, 40);
  const margin = 48;
  const scale = Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY)));
  return {
    scale,
    tx: width / 2 - (minX + maxX) / 2 * scale,
    ty: height / 2 - (minY + maxY) / 2 * scale,
    hover: -1,
    focus: -1
  };
}
function drawGraph(context, ratio, theme, view, points, titles, degrees, edges, neighborFocus) {
  const { scale, tx, ty } = view;
  context.setTransform(scale * ratio, 0, 0, scale * ratio, tx * ratio, ty * ratio);
  const inv = 1 / scale;
  for (const edge of edges) {
    const a = points[edge.s];
    const b = points[edge.t];
    if (a === undefined || b === undefined)
      continue;
    const focused = view.focus >= 0 && (edge.s === view.focus || edge.t === view.focus);
    const hovered = view.hover >= 0 && (edge.s === view.hover || edge.t === view.hover);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.lineWidth = (focused || hovered ? 1.8 : 1) * inv;
    context.strokeStyle = focused || hovered ? theme.accent : theme.border;
    context.globalAlpha = focused || hovered ? 1 : 0.7;
    context.setLineDash(edge.kind === "relation" ? [4 * inv, 3 * inv] : []);
    context.stroke();
  }
  context.setLineDash([]);
  context.globalAlpha = 1;
  const labelEverywhere = points.length <= 48;
  for (const [index, point] of points.entries()) {
    const degree = degrees[index] ?? 0;
    const radius = Math.min(9, 3 + degree * 0.8);
    const active = index === view.hover || index === view.focus || neighborFocus.has(index);
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = active ? theme.accent : theme.muted;
    context.fill();
    context.lineWidth = 1.2 * inv;
    context.strokeStyle = theme.bg;
    context.stroke();
  }
  context.font = `${11 / scale}px ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "top";
  for (const [index, point] of points.entries()) {
    const degree = degrees[index] ?? 0;
    const active = index === view.hover || index === view.focus || neighborFocus.has(index);
    if (!labelEverywhere && !active && degree < 3)
      continue;
    context.fillStyle = active ? theme.fg : theme.muted;
    context.fillText(titles[index] ?? "", point.x, point.y + Math.min(9, 3 + degree * 0.8) + 4 * inv);
  }
}
function initGraph(base) {
  const shell = dom.document.querySelector("[data-wordcell-graph]");
  if (shell === null)
    return;
  const canvas = shell.querySelector("[data-wordcell-graph-canvas]");
  const status = shell.querySelector("[data-wordcell-graph-status]");
  const reset = shell.querySelector("[data-wordcell-graph-reset]");
  if (canvas === null)
    return;
  const context = canvas.getContext("2d");
  if (context === null) {
    if (status !== null)
      status.textContent = "Canvas is unavailable; every note is listed below.";
    return;
  }
  (async () => {
    const manifestRaw = await fetchJson(base, "manifest.json");
    if (manifestRaw === undefined)
      throw new Error("manifest fetch failed");
    const manifest = parseSiteManifestV1(manifestRaw);
    const [catalogRaw, graphRaw] = await Promise.all([
      fetchJson(base, manifest.paths.catalog),
      fetchJson(base, manifest.paths.graph)
    ]);
    if (catalogRaw === undefined || graphRaw === undefined)
      throw new Error("graph data fetch failed");
    const catalog = parseSiteCatalogV1(catalogRaw);
    const graph = parseSiteGraphV1(graphRaw);
    const nodes = catalog.entries;
    if (nodes.length > WORDCELL_SITE_GRAPH_VIEW_LIMIT) {
      if (status !== null) {
        status.textContent = `This site has ${nodes.length} notes — over the ${WORDCELL_SITE_GRAPH_VIEW_LIMIT}-node interactive limit. Every note is listed below.`;
      }
      return;
    }
    const edges = [];
    const drawn = [];
    for (const edge of graph.edges) {
      if (edge.s === edge.t || edge.s < 0 || edge.t < 0)
        continue;
      if (edge.s >= nodes.length || edge.t >= nodes.length)
        continue;
      edges.push({ s: edge.s, t: edge.t });
      drawn.push({ s: edge.s, t: edge.t, kind: edge.k });
    }
    const slugs = nodes.map((entry) => entry.s);
    const titles = nodes.map((entry) => entry.t);
    const seed = siteGraphSeed(slugs, edges);
    const points = layoutSiteGraph(nodes.length, edges, { seed });
    const degrees = siteGraphDegrees(nodes.length, edges);
    const hrefFor = (index) => resultHref(base, slugs[index] ?? "");
    const rect = canvas.getBoundingClientRect();
    const ratio = dom.devicePixelRatio ?? 1;
    const cssWidth = Math.max(320, rect.width || 960);
    const cssHeight = Math.max(280, rect.height || 560);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    let view = fitView(points, cssWidth, cssHeight);
    const theme = { current: graphTheme(shell) };
    let focusNeighbors = new Set;
    const neighborsOf = (index) => {
      const neighbors = new Set;
      for (const edge of drawn) {
        if (edge.s === index)
          neighbors.add(edge.t);
        if (edge.t === index)
          neighbors.add(edge.s);
      }
      return neighbors;
    };
    const draw = () => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = theme.current.bg;
      context.fillRect(0, 0, cssWidth, cssHeight);
      drawGraph(context, ratio, theme.current, view, points, titles, degrees, drawn, focusNeighbors);
    };
    let scheduled = false;
    const redraw = () => {
      if (dom.requestAnimationFrame === undefined) {
        draw();
        return;
      }
      if (scheduled)
        return;
      scheduled = true;
      dom.requestAnimationFrame(() => {
        scheduled = false;
        draw();
      });
    };
    const nodeAt = (clientX, clientY) => {
      const bounds = canvas.getBoundingClientRect();
      const px = clientX - bounds.left;
      const py = clientY - bounds.top;
      let best = -1;
      let bestDistance = 14;
      for (const [index, point] of points.entries()) {
        const sx = point.x * view.scale + view.tx;
        const sy = point.y * view.scale + view.ty;
        const distance = Math.sqrt((sx - px) * (sx - px) + (sy - py) * (sy - py));
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      return best;
    };
    const focusSlug = () => {
      const hash = dom.location.hash ?? "";
      const match = /^#n=(.+)$/u.exec(hash);
      if (match === null)
        return;
      let slug = match[1] ?? "";
      try {
        slug = decodeURIComponent(slug);
      } catch {
        return;
      }
      const index = slugs.indexOf(slug);
      if (index === -1)
        return;
      view.focus = index;
      focusNeighbors = neighborsOf(index);
      const point = points[index];
      if (point !== undefined) {
        view.tx = cssWidth / 2 - point.x * view.scale;
        view.ty = cssHeight / 2 - point.y * view.scale;
      }
      redraw();
    };
    let dragFrom;
    let dragged = false;
    canvas.addEventListener("pointerdown", (event) => {
      dragFrom = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
      dragged = false;
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", (event) => {
      const clientX = event.clientX ?? 0;
      const clientY = event.clientY ?? 0;
      if (dragFrom !== undefined) {
        const deltaX = clientX - dragFrom.x;
        const deltaY = clientY - dragFrom.y;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 4)
          dragged = true;
        if (dragged) {
          view.tx += deltaX;
          view.ty += deltaY;
          dragFrom = { x: clientX, y: clientY };
          redraw();
        }
        return;
      }
      const hit = nodeAt(clientX, clientY);
      if (hit !== view.hover) {
        view.hover = hit;
        canvas.style.cursor = hit >= 0 ? "pointer" : "grab";
        redraw();
      }
    });
    canvas.addEventListener("pointerup", (event) => {
      canvas.style.cursor = "grab";
      const wasDrag = dragged;
      dragFrom = undefined;
      dragged = false;
      if (wasDrag)
        return;
      const hit = nodeAt(event.clientX ?? 0, event.clientY ?? 0);
      if (hit >= 0)
        dom.location.assign(hrefFor(hit));
    });
    canvas.addEventListener("pointerleave", () => {
      dragFrom = undefined;
      dragged = false;
      if (view.hover !== -1) {
        view.hover = -1;
        redraw();
      }
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const px = (event.clientX ?? 0) - bounds.left;
      const py = (event.clientY ?? 0) - bounds.top;
      const factor = Math.exp(-(event.deltaY ?? 0) * 0.0015);
      const next = Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, view.scale * factor));
      const applied = next / view.scale;
      view.tx = px - (px - view.tx) * applied;
      view.ty = py - (py - view.ty) * applied;
      view.scale = next;
      redraw();
    });
    canvas.addEventListener("keydown", (event) => {
      const panStep = 48;
      if (event.key === "ArrowLeft")
        view.tx += panStep;
      else if (event.key === "ArrowRight")
        view.tx -= panStep;
      else if (event.key === "ArrowUp")
        view.ty += panStep;
      else if (event.key === "ArrowDown")
        view.ty -= panStep;
      else if (event.key === "+" || event.key === "=") {
        view.scale = Math.min(GRAPH_MAX_SCALE, view.scale * 1.25);
      } else if (event.key === "-" || event.key === "_") {
        view.scale = Math.max(GRAPH_MIN_SCALE, view.scale / 1.25);
      } else if (event.key === "0" || event.key === "Escape") {
        view = fitView(points, cssWidth, cssHeight);
      } else if (event.key === "Enter") {
        const target = view.hover >= 0 ? view.hover : view.focus;
        if (target < 0)
          return;
        dom.location.assign(hrefFor(target));
      } else {
        return;
      }
      event.preventDefault();
      redraw();
    });
    reset?.addEventListener("click", () => {
      view = fitView(points, cssWidth, cssHeight);
      redraw();
    });
    const repaintTheme = () => {
      theme.current = graphTheme(shell);
      redraw();
    };
    wordcellAppearanceBridge()?.subscribe(repaintTheme);
    dom.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", repaintTheme);
    if (status !== null)
      status.hidden = true;
    dom.addEventListener?.("hashchange", focusSlug);
    focusSlug();
    draw();
  })().catch(() => {
    if (status !== null) {
      status.hidden = false;
      status.textContent = "The graph data could not be loaded; every note is listed below.";
    }
  });
}
function initAppearance() {
  const bridge = wordcellAppearanceBridge();
  const actions = dom.document.querySelector(".site-actions");
  if (bridge === undefined || actions === null)
    return;
  const wrap = dom.document.createElement("div");
  wrap.className = "appearance";
  const trigger = dom.document.createElement("button");
  trigger.type = "button";
  trigger.className = "appearance-trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "Appearance");
  trigger.innerHTML = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">' + '<circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/>' + '<path d="M8 1.4a6.6 6.6 0 0 1 0 13.2z" fill="currentColor"/></svg>';
  const menu = dom.document.createElement("div");
  menu.className = "appearance-menu";
  menu.hidden = true;
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", "Appearance");
  const paletteInputs = new Map;
  const modeInputs = new Map;
  const modeGroup = dom.document.createElement("div");
  modeGroup.className = "appearance-group";
  const modeLabel = dom.document.createElement("div");
  modeLabel.className = "appearance-label";
  modeLabel.textContent = "Appearance";
  modeGroup.appendChild(modeLabel);
  for (const mode of wordcellAppearanceModes) {
    const label = dom.document.createElement("label");
    label.className = "appearance-option";
    const input = dom.document.createElement("input");
    input.type = "radio";
    input.name = "wordcell-appearance-mode";
    input.value = mode;
    input.addEventListener("change", () => {
      bridge.set({ palette: bridge.get().palette, mode });
    });
    modeInputs.set(mode, input);
    const text = dom.document.createElement("span");
    text.textContent = wordcellAppearanceModeLabels[mode];
    label.appendChild(input);
    label.appendChild(text);
    modeGroup.appendChild(label);
  }
  const paletteGroup = dom.document.createElement("div");
  paletteGroup.className = "appearance-group";
  const paletteLabel = dom.document.createElement("div");
  paletteLabel.className = "appearance-label";
  paletteLabel.textContent = "Palette";
  paletteGroup.appendChild(paletteLabel);
  for (const palette of wordcellPalettes) {
    const label = dom.document.createElement("label");
    label.className = "appearance-option";
    const input = dom.document.createElement("input");
    input.type = "radio";
    input.name = "wordcell-appearance-palette";
    input.value = palette;
    input.addEventListener("change", () => {
      bridge.set({ palette, mode: bridge.get().mode });
    });
    paletteInputs.set(palette, input);
    const swatch = dom.document.createElement("span");
    swatch.className = `swatch swatch-${palette}`;
    const text = dom.document.createElement("span");
    text.textContent = wordcellPaletteLabels[palette];
    label.appendChild(input);
    label.appendChild(swatch);
    label.appendChild(text);
    paletteGroup.appendChild(label);
  }
  menu.appendChild(modeGroup);
  menu.appendChild(paletteGroup);
  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  actions.appendChild(wrap);
  const sync = () => {
    const preference = bridge.get();
    for (const [mode, input] of modeInputs)
      input.checked = mode === preference.mode;
    for (const [palette, input] of paletteInputs)
      input.checked = palette === preference.palette;
  };
  const close = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    sync();
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    paletteInputs.get(bridge.get().palette)?.focus();
  };
  trigger.addEventListener("click", () => {
    if (menu.hidden)
      open();
    else
      close();
  });
  dom.document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      close();
      trigger.focus();
    }
  });
  dom.document.addEventListener("click", (event) => {
    if (!menu.hidden && event.target?.closest?.(".appearance") == null)
      close();
  });
  bridge.subscribe(sync);
  sync();
}
function start() {
  const content = dom.document.querySelector('meta[name="wordcell:base"]')?.getAttribute("content") ?? "./";
  const base = content.endsWith("/") ? content : `${content}/`;
  initAppearance();
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
  initGraph(base);
}
if (dom.document.querySelector("[data-wordcell-search]") !== null) {
  start();
}
