/**
 * `hraness.wordcell.site.*` — the versioned static-publication contract emitted
 * by `wordcell publish`. Every JSON file in a published site carries its own
 * format identifier so consumers can reject foreign or mixed-version content
 * before reading fields. All emitted document order and object key order is
 * canonical: builders sort entries deterministically and writers serialize
 * through `@hraness/oh` canonical JSON.
 */
export const WORDCELL_SITE_FORMAT_V1 = "hraness.wordcell.site.v1" as const;
export const WORDCELL_SITE_CATALOG_FORMAT_V1 =
  "hraness.wordcell.site-catalog.v1" as const;
export const WORDCELL_SITE_DOCS_FORMAT_V1 =
  "hraness.wordcell.site-docs.v1" as const;
export const WORDCELL_SITE_TERMS_FORMAT_V1 =
  "hraness.wordcell.site-terms.v1" as const;
export const WORDCELL_SITE_POSTINGS_FORMAT_V1 =
  "hraness.wordcell.site-postings.v1" as const;
export const WORDCELL_SITE_NOTE_FORMAT_V1 =
  "hraness.wordcell.site-note.v1" as const;
export const WORDCELL_SITE_GRAPH_FORMAT_V1 =
  "hraness.wordcell.site-graph.v1" as const;

export const WORDCELL_SITE_LIMITS_V1 = Object.freeze({
  /** Published notes, matching the vault analysis ceiling. */
  notes: 10_000,
  /** Copied attachment files. */
  assets: 10_000,
  /** Bytes accepted from one attachment source file. */
  assetBytes: 16 * 1_024 * 1_024,
  /** Total attachment bytes copied into one artifact. */
  totalAssetBytes: 512 * 1_024 * 1_024,
  /** Unique normalized terms admitted to the content index. */
  indexTerms: 250_000,
  /** Content posting shards; one hex byte names each shard file. */
  contentShards: 256,
  /** Postings pairs stored in one shard before lower-frequency terms drop. */
  shardPairs: 250_000,
  /** Plain-text preview stored per document for result snippets. */
  docPreviewBytes: 240,
  /** Normalized per-document field text retained for eager search. */
  fieldTextBytes: 4 * 1_024,
  /** Per-note normalized content text retained when inline search applies. */
  inlineTextBytes: 16 * 1_024,
  /**
   * Aggregate inline text budget. When the selected corpus fits, the document
   * table carries normalized content text and browser search reproduces the
   * exact lane's substring semantics; larger corpora use postings shards.
   */
  inlineTotalBytes: 2 * 1_024 * 1_024,
  /** Normalized content text retained per note payload for hydration. */
  noteTextBytes: 32 * 1_024,
  /** Site title and description. */
  titleBytes: 512,
  descriptionBytes: 4 * 1_024,
  /** Reader-side result hydration and rendering bounds. */
  searchHydration: 50,
  searchResults: 100,
});

export type WordcellSiteContentSearchV1 = "inline" | "shards" | "none";

export type WordcellSiteManifestV1 = {
  readonly format: typeof WORDCELL_SITE_FORMAT_V1;
  readonly site: Readonly<{
    title: string;
    basePath: string;
    description?: string;
  }>;
  readonly generated: Readonly<{
    by: "@hraness/wordcell";
    version: string;
    /** RFC 3339 instant; absent in deterministic output. */
    at?: string;
  }>;
  readonly source: Readonly<{
    selection: Readonly<Record<string, unknown>>;
    notes: number;
    digest: `sha256:${string}`;
  }>;
  readonly paths: Readonly<{
    catalog: string;
    graph: string;
    docs: string;
    terms: string;
    postingsPrefix: string;
    notePrefix: string;
    assetPrefix: string;
    readerPrefix: string;
  }>;
  readonly search: Readonly<{
    mode: "exact";
    content: WordcellSiteContentSearchV1;
    shards: number;
    hash: "fnv1a32-8bit";
  }>;
  readonly counts: Readonly<{
    notes: number;
    assets: number;
    bytes: number;
  }>;
  /** Truncated aspects; an empty object means complete data. Always present. */
  readonly truncated: Readonly<{
    terms?: true;
    text?: true;
    assets?: true;
  }>;
};

export type WordcellSiteCatalogEntryV1 = {
  /** Numeric document id; indexes docs and graph edges. */
  readonly i: number;
  /** Site-relative note path below the note prefix, no extension. */
  readonly s: string;
  readonly t: string;
  readonly type?: string;
  readonly g?: readonly string[];
};

export type WordcellSiteCatalogV1 = {
  readonly format: typeof WORDCELL_SITE_CATALOG_FORMAT_V1;
  readonly entries: readonly WordcellSiteCatalogEntryV1[];
};

export type WordcellSiteDocFieldsV1 = {
  /** Normalized title. */
  readonly t: string;
  /** Normalized aliases joined by newline. */
  readonly a: string;
  /** Normalized path and id joined by newline. */
  readonly p: string;
  /** Normalized tags joined by newline. */
  readonly g: string;
  /** Normalized canonical metadata JSON. */
  readonly m: string;
};

export type WordcellSiteDocV1 = {
  readonly i: number;
  readonly s: string;
  readonly t: string;
  /** Bounded plain-text preview for result snippets. */
  readonly p: string;
  readonly f: WordcellSiteDocFieldsV1;
  /** Normalized content text, present only in inline search mode. */
  readonly x?: string;
};

export type WordcellSiteDocsV1 = {
  readonly format: typeof WORDCELL_SITE_DOCS_FORMAT_V1;
  readonly content: WordcellSiteContentSearchV1;
  readonly docs: readonly WordcellSiteDocV1[];
};

export type WordcellSiteTermsV1 = {
  readonly format: typeof WORDCELL_SITE_TERMS_FORMAT_V1;
  /** Sorted unique normalized content terms for prefix expansion. */
  readonly terms: readonly string[];
};

export type WordcellSitePostingsV1 = {
  readonly format: typeof WORDCELL_SITE_POSTINGS_FORMAT_V1;
  /** Two-digit lowercase hex shard name. */
  readonly shard: string;
  /** Normalized content term to document ids, both sorted. */
  readonly postings: Readonly<Record<string, readonly number[]>>;
};

export type WordcellSiteNoteLinkV1 = {
  readonly s: string;
  readonly t: string;
};

export type WordcellSiteNoteRelationV1 = {
  readonly p: string;
  readonly s: string;
  readonly t: string;
};

export type WordcellSiteNoteV1 = {
  readonly format: typeof WORDCELL_SITE_NOTE_FORMAT_V1;
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly type?: string;
  readonly tags: readonly string[];
  readonly summary: string;
  /** Bounded normalized content text for search hydration. */
  readonly text: string;
  readonly textTruncated: boolean;
  readonly links: readonly WordcellSiteNoteLinkV1[];
  readonly backlinks: readonly WordcellSiteNoteLinkV1[];
  readonly relations: readonly WordcellSiteNoteRelationV1[];
  readonly relationBacklinks: readonly WordcellSiteNoteRelationV1[];
};

export type WordcellSiteGraphEdgeV1 = {
  readonly s: number;
  readonly t: number;
  readonly k: "link" | "relation";
  readonly p?: string;
};

export type WordcellSiteGraphV1 = {
  readonly format: typeof WORDCELL_SITE_GRAPH_FORMAT_V1;
  readonly edges: readonly WordcellSiteGraphEdgeV1[];
};

export type WordcellSiteSelectionV1 = {
  /** New publishers record counts only; legacy manifests may carry selectors. */
  readonly includeCount?: number;
  readonly excludeCount?: number;
  readonly includeGlobCount?: number;
  readonly excludeGlobCount?: number;
  readonly fromCount?: number;
  readonly includes: readonly string[];
  readonly excludes: readonly string[];
  readonly from?: Readonly<{
    note: string;
    depth: number;
    direction: "in" | "out" | "both";
  }>;
  readonly filterCount: number;
  readonly tagCount: number;
  readonly scopeCount: number;
};

export type WordcellPublishReport = {
  readonly format: typeof WORDCELL_SITE_FORMAT_V1;
  readonly out: string;
  readonly deterministic: boolean;
  /** Bounded selected ids for local review; never includes note bodies or excluded ids. */
  readonly selection: Readonly<{
    ids: readonly string[];
    total: number;
    truncated: boolean;
    digest: string;
  }>;
  readonly files: number;
  readonly bytes: number;
  readonly notes: Readonly<{
    published: number;
    excludedPrivate: number;
    excludedBySelection: number;
  }>;
  readonly links: Readonly<{
    kept: number;
    droppedExternal: number;
  }>;
  readonly assets: Readonly<{
    count: number;
    bytes: number;
    skipped: number;
  }>;
  readonly search: Readonly<{
    content: WordcellSiteContentSearchV1;
    terms: number;
    truncated: boolean;
  }>;
};

const textEncoder = new TextEncoder();

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(
  value: unknown,
  maximumBytes: number,
  field: string,
): string {
  if (typeof value !== "string" || textEncoder.encode(value).byteLength > maximumBytes) {
    throw new TypeError(`${field} must be a string of at most ${maximumBytes} bytes`);
  }
  return value;
}

function boundedCount(value: unknown, maximum: number, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`${field} must be a safe integer from 0 through ${maximum}`);
  }
  return value;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[],
  field: string,
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${field} has unexpected key ${JSON.stringify(key)}`);
  }
  for (const key of required) {
    if (!(key in value)) throw new TypeError(`${field} is missing ${JSON.stringify(key)}`);
  }
}

function stringArray(value: unknown, maximum: number, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${field} must be an array of at most ${maximum} strings`);
  }
  for (const item of value) {
    if (typeof item !== "string") throw new TypeError(`${field} entries must be strings`);
  }
  return value as readonly string[];
}

function contentSearch(value: unknown): WordcellSiteContentSearchV1 {
  if (value === "inline" || value === "shards" || value === "none") return value;
  throw new TypeError("search.content must be inline, shards, or none");
}

export function parseSiteManifestV1(value: unknown): WordcellSiteManifestV1 {
  if (!isRecord(value)) throw new TypeError("manifest must be an object");
  exactKeys(value, ["format", "site", "generated", "source", "paths", "search", "counts", "truncated"], [], "manifest");
  if (value.format !== WORDCELL_SITE_FORMAT_V1) {
    throw new TypeError(`manifest format must be ${WORDCELL_SITE_FORMAT_V1}`);
  }
  const { site, generated, source, paths, search, counts, truncated } = value;
  if (!isRecord(site)) throw new TypeError("manifest.site must be an object");
  exactKeys(site, ["title", "basePath"], ["description"], "manifest.site");
  if (!isRecord(generated)) throw new TypeError("manifest.generated must be an object");
  exactKeys(generated, ["by", "version"], ["at"], "manifest.generated");
  if (generated.by !== "@hraness/wordcell") {
    throw new TypeError("manifest.generated.by must be @hraness/wordcell");
  }
  if (!isRecord(source)) throw new TypeError("manifest.source must be an object");
  exactKeys(source, ["selection", "notes", "digest"], [], "manifest.source");
  if (!isRecord(paths)) throw new TypeError("manifest.paths must be an object");
  exactKeys(
    paths,
    ["catalog", "graph", "docs", "terms", "postingsPrefix", "notePrefix", "assetPrefix", "readerPrefix"],
    [],
    "manifest.paths",
  );
  if (!isRecord(search)) throw new TypeError("manifest.search must be an object");
  exactKeys(search, ["mode", "content", "shards", "hash"], [], "manifest.search");
  if (search.mode !== "exact") throw new TypeError("manifest.search.mode must be exact");
  if (search.hash !== "fnv1a32-8bit") {
    throw new TypeError("manifest.search.hash must be fnv1a32-8bit");
  }
  if (!isRecord(counts)) throw new TypeError("manifest.counts must be an object");
  exactKeys(counts, ["notes", "assets", "bytes"], [], "manifest.counts");
  if (!isRecord(truncated)) throw new TypeError("manifest.truncated must be an object");
  exactKeys(truncated, [], ["terms", "text", "assets"], "manifest.truncated");
  for (const flag of Object.values(truncated)) {
    if (flag !== true) throw new TypeError("manifest.truncated flags must be true");
  }
  const digest = source.digest;
  if (typeof digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw new TypeError("manifest.source.digest must be a sha256 hex digest");
  }
  return {
    format: WORDCELL_SITE_FORMAT_V1,
    site: Object.freeze({
      title: boundedText(site.title, WORDCELL_SITE_LIMITS_V1.titleBytes, "site.title"),
      basePath: boundedText(site.basePath, 1_024, "site.basePath"),
      ...(site.description === undefined
        ? {}
        : { description: boundedText(site.description, WORDCELL_SITE_LIMITS_V1.descriptionBytes, "site.description") }),
    }),
    generated: Object.freeze({
      by: "@hraness/wordcell",
      version: boundedText(generated.version, 64, "generated.version"),
      ...(generated.at === undefined
        ? {}
        : { at: boundedText(generated.at, 64, "generated.at") }),
    }),
    source: Object.freeze({
      selection: source.selection as Readonly<Record<string, unknown>>,
      notes: boundedCount(source.notes, WORDCELL_SITE_LIMITS_V1.notes, "source.notes"),
      digest: digest as `sha256:${string}`,
    }),
    paths: Object.freeze({
      catalog: boundedText(paths.catalog, 256, "paths.catalog"),
      graph: boundedText(paths.graph, 256, "paths.graph"),
      docs: boundedText(paths.docs, 256, "paths.docs"),
      terms: boundedText(paths.terms, 256, "paths.terms"),
      postingsPrefix: boundedText(paths.postingsPrefix, 256, "paths.postingsPrefix"),
      notePrefix: boundedText(paths.notePrefix, 256, "paths.notePrefix"),
      assetPrefix: boundedText(paths.assetPrefix, 256, "paths.assetPrefix"),
      readerPrefix: boundedText(paths.readerPrefix, 256, "paths.readerPrefix"),
    }),
    search: Object.freeze({
      mode: "exact",
      content: contentSearch(search.content),
      shards: boundedCount(search.shards, WORDCELL_SITE_LIMITS_V1.contentShards, "search.shards"),
      hash: "fnv1a32-8bit",
    }),
    counts: Object.freeze({
      notes: boundedCount(counts.notes, WORDCELL_SITE_LIMITS_V1.notes, "counts.notes"),
      assets: boundedCount(counts.assets, WORDCELL_SITE_LIMITS_V1.assets, "counts.assets"),
      bytes: boundedCount(counts.bytes, Number.MAX_SAFE_INTEGER, "counts.bytes"),
    }),
    truncated: Object.freeze({ ...(truncated as Record<string, true>) }),
  };
}

export function parseSiteCatalogV1(value: unknown): WordcellSiteCatalogV1 {
  if (!isRecord(value)) throw new TypeError("catalog must be an object");
  exactKeys(value, ["format", "entries"], [], "catalog");
  if (value.format !== WORDCELL_SITE_CATALOG_FORMAT_V1) {
    throw new TypeError(`catalog format must be ${WORDCELL_SITE_CATALOG_FORMAT_V1}`);
  }
  if (!Array.isArray(value.entries) || value.entries.length > WORDCELL_SITE_LIMITS_V1.notes) {
    throw new TypeError("catalog.entries must be a bounded array");
  }
  const entries = (value.entries as unknown[]).map((entry, index): WordcellSiteCatalogEntryV1 => {
    if (!isRecord(entry)) throw new TypeError(`catalog entry ${index} must be an object`);
    exactKeys(entry, ["i", "s", "t"], ["type", "g"], `catalog entry ${index}`);
    return {
      i: boundedCount(entry.i, WORDCELL_SITE_LIMITS_V1.notes, `catalog entry ${index}.i`),
      s: boundedText(entry.s, 1_024, `catalog entry ${index}.s`),
      t: boundedText(entry.t, WORDCELL_SITE_LIMITS_V1.titleBytes, `catalog entry ${index}.t`),
      ...(entry.type === undefined
        ? {}
        : { type: boundedText(entry.type, 256, `catalog entry ${index}.type`) }),
      ...(entry.g === undefined
        ? {}
        : { g: stringArray(entry.g, 128, `catalog entry ${index}.g`) }),
    };
  });
  return { format: WORDCELL_SITE_CATALOG_FORMAT_V1, entries };
}

function docFields(value: unknown, field: string): WordcellSiteDocFieldsV1 {
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`);
  exactKeys(value, ["t", "a", "p", "g", "m"], [], field);
  return {
    t: boundedText(value.t, WORDCELL_SITE_LIMITS_V1.fieldTextBytes, `${field}.t`),
    a: boundedText(value.a, WORDCELL_SITE_LIMITS_V1.fieldTextBytes, `${field}.a`),
    p: boundedText(value.p, WORDCELL_SITE_LIMITS_V1.fieldTextBytes, `${field}.p`),
    g: boundedText(value.g, WORDCELL_SITE_LIMITS_V1.fieldTextBytes, `${field}.g`),
    m: boundedText(value.m, WORDCELL_SITE_LIMITS_V1.fieldTextBytes, `${field}.m`),
  };
}

export function parseSiteDocsV1(value: unknown): WordcellSiteDocsV1 {
  if (!isRecord(value)) throw new TypeError("docs must be an object");
  exactKeys(value, ["format", "content", "docs"], [], "docs");
  if (value.format !== WORDCELL_SITE_DOCS_FORMAT_V1) {
    throw new TypeError(`docs format must be ${WORDCELL_SITE_DOCS_FORMAT_V1}`);
  }
  const content = contentSearch(value.content);
  if (!Array.isArray(value.docs) || value.docs.length > WORDCELL_SITE_LIMITS_V1.notes) {
    throw new TypeError("docs.docs must be a bounded array");
  }
  const docs = (value.docs as unknown[]).map((entry, index): WordcellSiteDocV1 => {
    const field = `docs entry ${index}`;
    if (!isRecord(entry)) throw new TypeError(`${field} must be an object`);
    exactKeys(entry, ["i", "s", "t", "p", "f"], ["x"], field);
    const inline = entry.x === undefined
      ? {}
      : { x: boundedText(entry.x, WORDCELL_SITE_LIMITS_V1.inlineTextBytes, `${field}.x`) };
    return {
      i: boundedCount(entry.i, WORDCELL_SITE_LIMITS_V1.notes, `${field}.i`),
      s: boundedText(entry.s, 1_024, `${field}.s`),
      t: boundedText(entry.t, WORDCELL_SITE_LIMITS_V1.titleBytes, `${field}.t`),
      p: boundedText(entry.p, WORDCELL_SITE_LIMITS_V1.docPreviewBytes + 16, `${field}.p`),
      f: docFields(entry.f, `${field}.f`),
      ...inline,
    };
  });
  return { format: WORDCELL_SITE_DOCS_FORMAT_V1, content, docs };
}

export function parseSiteTermsV1(value: unknown): WordcellSiteTermsV1 {
  if (!isRecord(value)) throw new TypeError("terms must be an object");
  exactKeys(value, ["format", "terms"], [], "terms");
  if (value.format !== WORDCELL_SITE_TERMS_FORMAT_V1) {
    throw new TypeError(`terms format must be ${WORDCELL_SITE_TERMS_FORMAT_V1}`);
  }
  return {
    format: WORDCELL_SITE_TERMS_FORMAT_V1,
    terms: stringArray(value.terms, WORDCELL_SITE_LIMITS_V1.indexTerms, "terms.terms"),
  };
}

export function parseSitePostingsV1(value: unknown): WordcellSitePostingsV1 {
  if (!isRecord(value)) throw new TypeError("postings must be an object");
  exactKeys(value, ["format", "shard", "postings"], [], "postings");
  if (value.format !== WORDCELL_SITE_POSTINGS_FORMAT_V1) {
    throw new TypeError(`postings format must be ${WORDCELL_SITE_POSTINGS_FORMAT_V1}`);
  }
  const shard = value.shard;
  if (typeof shard !== "string" || !/^[0-9a-f]{2}$/u.test(shard)) {
    throw new TypeError("postings.shard must be a two-digit lowercase hex string");
  }
  if (!isRecord(value.postings)) throw new TypeError("postings.postings must be an object");
  const entries = Object.entries(value.postings);
  if (entries.length > WORDCELL_SITE_LIMITS_V1.shardPairs) {
    throw new TypeError("postings.postings exceeds the shard pair limit");
  }
  const postings: Record<string, readonly number[]> = Object.create(null);
  for (const [term, docs] of entries) {
    if (!Array.isArray(docs) || docs.length > WORDCELL_SITE_LIMITS_V1.notes) {
      throw new TypeError(`postings for ${JSON.stringify(term)} must be a bounded array`);
    }
    postings[term] = (docs as unknown[]).map((doc) =>
      boundedCount(doc, WORDCELL_SITE_LIMITS_V1.notes, "posting document id"));
  }
  return { format: WORDCELL_SITE_POSTINGS_FORMAT_V1, shard, postings: Object.freeze(postings) };
}

function noteLinks(value: unknown, field: string): readonly WordcellSiteNoteLinkV1[] {
  if (!Array.isArray(value) || value.length > WORDCELL_SITE_LIMITS_V1.notes) {
    throw new TypeError(`${field} must be a bounded array`);
  }
  return (value as unknown[]).map((entry, index): WordcellSiteNoteLinkV1 => {
    if (!isRecord(entry)) throw new TypeError(`${field} ${index} must be an object`);
    exactKeys(entry, ["s", "t"], [], `${field} ${index}`);
    return {
      s: boundedText(entry.s, 1_024, `${field} ${index}.s`),
      t: boundedText(entry.t, WORDCELL_SITE_LIMITS_V1.titleBytes, `${field} ${index}.t`),
    };
  });
}

export function parseSiteNoteV1(value: unknown): WordcellSiteNoteV1 {
  if (!isRecord(value)) throw new TypeError("note payload must be an object");
  exactKeys(
    value,
    ["format", "id", "slug", "title", "aliases", "tags", "summary", "text", "textTruncated", "links", "backlinks", "relations", "relationBacklinks"],
    ["type"],
    "note payload",
  );
  if (value.format !== WORDCELL_SITE_NOTE_FORMAT_V1) {
    throw new TypeError(`note payload format must be ${WORDCELL_SITE_NOTE_FORMAT_V1}`);
  }
  if (value.textTruncated !== true && value.textTruncated !== false) {
    throw new TypeError("note payload textTruncated must be boolean");
  }
  return {
    format: WORDCELL_SITE_NOTE_FORMAT_V1,
    id: boundedText(value.id, 1_024, "note.id"),
    slug: boundedText(value.slug, 1_024, "note.slug"),
    title: boundedText(value.title, WORDCELL_SITE_LIMITS_V1.titleBytes, "note.title"),
    aliases: stringArray(value.aliases, 128, "note.aliases"),
    ...(value.type === undefined
      ? {}
      : { type: boundedText(value.type, 256, "note.type") }),
    tags: stringArray(value.tags, 128, "note.tags"),
    summary: boundedText(value.summary, WORDCELL_SITE_LIMITS_V1.descriptionBytes, "note.summary"),
    text: boundedText(value.text, WORDCELL_SITE_LIMITS_V1.noteTextBytes, "note.text"),
    textTruncated: value.textTruncated,
    links: noteLinks(value.links, "note.links"),
    backlinks: noteLinks(value.backlinks, "note.backlinks"),
    relations: noteRelations(value.relations, "note.relations"),
    relationBacklinks: noteRelations(value.relationBacklinks, "note.relationBacklinks"),
  };
}

function noteRelations(
  value: unknown,
  field: string,
): readonly WordcellSiteNoteRelationV1[] {
  if (!Array.isArray(value) || value.length > WORDCELL_SITE_LIMITS_V1.notes) {
    throw new TypeError(`${field} must be a bounded array`);
  }
  return (value as unknown[]).map((entry, index): WordcellSiteNoteRelationV1 => {
    if (!isRecord(entry)) throw new TypeError(`${field} ${index} must be an object`);
    exactKeys(entry, ["p", "s", "t"], [], `${field} ${index}`);
    return {
      p: boundedText(entry.p, 256, `${field} ${index}.p`),
      s: boundedText(entry.s, 1_024, `${field} ${index}.s`),
      t: boundedText(entry.t, WORDCELL_SITE_LIMITS_V1.titleBytes, `${field} ${index}.t`),
    };
  });
}

export function parseSiteGraphV1(value: unknown): WordcellSiteGraphV1 {
  if (!isRecord(value)) throw new TypeError("graph must be an object");
  exactKeys(value, ["format", "edges"], [], "graph");
  if (value.format !== WORDCELL_SITE_GRAPH_FORMAT_V1) {
    throw new TypeError(`graph format must be ${WORDCELL_SITE_GRAPH_FORMAT_V1}`);
  }
  if (!Array.isArray(value.edges) || value.edges.length > 1_000_000) {
    throw new TypeError("graph.edges must be a bounded array");
  }
  const edges = (value.edges as unknown[]).map((entry, index): WordcellSiteGraphEdgeV1 => {
    if (!isRecord(entry)) throw new TypeError(`graph edge ${index} must be an object`);
    exactKeys(entry, ["s", "t", "k"], ["p"], `graph edge ${index}`);
    if (entry.k !== "link" && entry.k !== "relation") {
      throw new TypeError(`graph edge ${index}.k must be link or relation`);
    }
    return {
      s: boundedCount(entry.s, WORDCELL_SITE_LIMITS_V1.notes, `graph edge ${index}.s`),
      t: boundedCount(entry.t, WORDCELL_SITE_LIMITS_V1.notes, `graph edge ${index}.t`),
      k: entry.k,
      ...(entry.p === undefined
        ? {}
        : { p: boundedText(entry.p, 256, `graph edge ${index}.p`) }),
    };
  });
  return { format: WORDCELL_SITE_GRAPH_FORMAT_V1, edges };
}
