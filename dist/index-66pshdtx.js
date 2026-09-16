// @bun
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

export { WORDCELL_SITE_FORMAT_V1, WORDCELL_SITE_CATALOG_FORMAT_V1, WORDCELL_SITE_DOCS_FORMAT_V1, WORDCELL_SITE_TERMS_FORMAT_V1, WORDCELL_SITE_POSTINGS_FORMAT_V1, WORDCELL_SITE_NOTE_FORMAT_V1, WORDCELL_SITE_GRAPH_FORMAT_V1, WORDCELL_SITE_LIMITS_V1, parseSiteManifestV1, parseSiteCatalogV1, parseSiteDocsV1, parseSiteTermsV1, parseSitePostingsV1, parseSiteNoteV1, parseSiteGraphV1 };
