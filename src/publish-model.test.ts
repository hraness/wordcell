import { describe, expect, test } from "bun:test";

import {
  parseSiteCatalogV1,
  parseSiteDocsV1,
  parseSiteGraphV1,
  parseSiteManifestV1,
  parseSiteNoteV1,
  parseSitePostingsV1,
  parseSiteTermsV1,
  WORDCELL_SITE_CATALOG_FORMAT_V1,
  WORDCELL_SITE_DOCS_FORMAT_V1,
  WORDCELL_SITE_FORMAT_V1,
  WORDCELL_SITE_GRAPH_FORMAT_V1,
  WORDCELL_SITE_LIMITS_V1,
  WORDCELL_SITE_NOTE_FORMAT_V1,
  WORDCELL_SITE_POSTINGS_FORMAT_V1,
  WORDCELL_SITE_TERMS_FORMAT_V1,
  type WordcellSiteManifestV1,
} from "./publish-model.js";

function validManifest(): WordcellSiteManifestV1 {
  return {
    format: WORDCELL_SITE_FORMAT_V1,
    site: { title: "Vault", basePath: "/" },
    generated: { by: "@hraness/wordcell", version: "0.0.0-test" },
    source: {
      selection: { includes: [], excludes: [], filterCount: 0, tagCount: 0, scopeCount: 0 },
      notes: 1,
      digest: `sha256:${"0".repeat(64)}`,
    },
    paths: {
      catalog: "catalog.json",
      graph: "graph.json",
      docs: "index/docs.json",
      terms: "index/terms.json",
      postingsPrefix: "index/c/",
      notePrefix: "n/",
      assetPrefix: "assets/",
      readerPrefix: "reader/",
    },
    search: { mode: "exact", content: "inline", shards: 0, hash: "fnv1a32-8bit" },
    counts: { notes: 1, assets: 0, bytes: 100 },
    truncated: {},
  };
}

describe("parseSiteManifestV1", () => {
  test("accepts a well-formed manifest and preserves optional fields", () => {
    const manifest = {
      ...validManifest(),
      site: { title: "Docs", basePath: "/kb/", description: "Public docs" },
      generated: { by: "@hraness/wordcell", version: "1.2.3", at: "2026-01-01T00:00:00.000Z" },
      truncated: { terms: true },
    };
    const parsed = parseSiteManifestV1(manifest);
    expect(parsed.site.title).toBe("Docs");
    expect(parsed.site.description).toBe("Public docs");
    expect(parsed.generated.at).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed.truncated.terms).toBe(true);
  });

  test("round-trips through JSON without losing required shape", () => {
    const manifest = validManifest();
    const parsed = parseSiteManifestV1(JSON.parse(JSON.stringify(manifest)));
    expect(parsed.format).toBe(WORDCELL_SITE_FORMAT_V1);
    expect(parsed.counts).toEqual({ notes: 1, assets: 0, bytes: 100 });
    expect(parsed.search).toEqual({
      mode: "exact",
      content: "inline",
      shards: 0,
      hash: "fnv1a32-8bit",
    });
  });

  test("rejects wrong format, extra keys, and missing keys", () => {
    expect(() => parseSiteManifestV1({ ...validManifest(), format: "other" }))
      .toThrow("format");
    expect(() => parseSiteManifestV1({ ...validManifest(), extra: true }))
      .toThrow("unexpected key");
    const { counts: _omitted, ...missing } = validManifest();
    expect(() => parseSiteManifestV1(missing)).toThrow("missing");
  });

  test("rejects malformed digests and non-true truncation flags", () => {
    const manifest = validManifest();
    expect(() =>
      parseSiteManifestV1({
        ...manifest,
        source: { ...manifest.source, digest: "md5:abc" },
      })).toThrow("sha256");
    expect(() =>
      parseSiteManifestV1({ ...manifest, truncated: { terms: false } }))
      .toThrow("must be true");
  });

  test("rejects counts above contract limits", () => {
    const manifest = validManifest();
    expect(() =>
      parseSiteManifestV1({
        ...manifest,
        counts: { ...manifest.counts, notes: WORDCELL_SITE_LIMITS_V1.notes + 1 },
      })).toThrow("counts.notes");
  });
});

describe("collection parsers", () => {
  test("parseSiteCatalogV1 accepts entries and rejects non-integer ids", () => {
    const catalog = {
      format: WORDCELL_SITE_CATALOG_FORMAT_V1,
      entries: [{ i: 0, s: "", t: "Index" }, { i: 1, s: "a/b", t: "B", g: ["x"] }],
    };
    expect(parseSiteCatalogV1(catalog).entries).toHaveLength(2);
    expect(() =>
      parseSiteCatalogV1({ ...catalog, entries: [{ i: 0.5, s: "", t: "x" }] }))
      .toThrow();
    expect(() =>
      parseSiteCatalogV1({ ...catalog, entries: [{ i: 0, s: "", t: "x", nope: 1 }] }))
      .toThrow("unexpected key");
  });

  test("parseSiteDocsV1 validates doc fields and optional inline text", () => {
    const docs = {
      format: WORDCELL_SITE_DOCS_FORMAT_V1,
      content: "inline",
      docs: [{
        i: 0,
        s: "a",
        t: "A",
        p: "preview",
        f: { t: "a", a: "", p: "a.md\na", g: "", m: "{}" },
        x: "inline text",
      }],
    };
    const parsed = parseSiteDocsV1(docs);
    expect(parsed.docs[0]?.x).toBe("inline text");
    expect(() =>
      parseSiteDocsV1({ ...docs, content: "bogus" })).toThrow("content");
  });

  test("parseSiteTermsV1 requires a bounded string array", () => {
    const terms = { format: WORDCELL_SITE_TERMS_FORMAT_V1, terms: ["alpha", "beta"] };
    expect(parseSiteTermsV1(terms).terms).toEqual(["alpha", "beta"]);
    expect(() =>
      parseSiteTermsV1({ ...terms, terms: [1] })).toThrow();
    expect(() =>
      parseSiteTermsV1({ ...terms, extra: [] })).toThrow("unexpected key");
  });

  test("parseSitePostingsV1 validates shard name and bounded doc ids", () => {
    const postings = {
      format: WORDCELL_SITE_POSTINGS_FORMAT_V1,
      shard: "ab",
      postings: { alpha: [0, 3, 9] },
    };
    expect(parseSitePostingsV1(postings).postings["alpha"]).toEqual([0, 3, 9]);
    expect(() => parseSitePostingsV1({ ...postings, shard: "xyz" })).toThrow();
    expect(() => parseSitePostingsV1({ ...postings, shard: "AB" })).toThrow();
    expect(() =>
      parseSitePostingsV1({ ...postings, postings: { a: [-1] } })).toThrow();
    expect(() =>
      parseSitePostingsV1({
        ...postings,
        postings: { a: [WORDCELL_SITE_LIMITS_V1.notes + 1] },
      })).toThrow();
  });

  test("parseSiteNoteV1 accepts a hydrated payload and rejects unsafe shape", () => {
    const note = {
      format: WORDCELL_SITE_NOTE_FORMAT_V1,
      id: "notes/a",
      slug: "notes/a",
      title: "A",
      aliases: ["a-alias"],
      type: "concept",
      tags: ["x"],
      summary: "Summary",
      text: "normalized text",
      textTruncated: false,
      links: [{ s: "b", t: "B" }],
      backlinks: [],
      relations: [{ p: "depends-on", s: "b", t: "B" }],
      relationBacklinks: [],
    };
    const parsed = parseSiteNoteV1(note);
    expect(parsed.relations[0]?.p).toBe("depends-on");
    expect(() => parseSiteNoteV1({ ...note, links: [{ s: "b" }] })).toThrow();
    expect(() => parseSiteNoteV1({ ...note, textTruncated: "yes" })).toThrow();
  });

  test("parseSiteGraphV1 accepts link and relation edges, rejects stray keys", () => {
    const graph = {
      format: WORDCELL_SITE_GRAPH_FORMAT_V1,
      edges: [
        { s: 0, t: 1, k: "link" },
        { s: 1, t: 0, k: "relation", p: "depends-on" },
      ],
    };
    expect(parseSiteGraphV1(graph).edges).toHaveLength(2);
    expect(() =>
      parseSiteGraphV1({ ...graph, edges: [{ s: 0, t: 1, k: "mention" }] }))
      .toThrow("link or relation");
    expect(() =>
      parseSiteGraphV1({ ...graph, edges: [{ s: 0, t: 1, k: "link", x: 1 }] }))
      .toThrow("unexpected key");
    expect(() =>
      parseSiteGraphV1({ ...graph, edges: [{ s: 0, t: -1, k: "link" }] }))
      .toThrow();
  });
});
