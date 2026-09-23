import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import {
  MAX_PUBLISH_PREFIX_EXPANSIONS,
  MAX_PUBLISH_QUERY_BYTES,
  MAX_PUBLISH_QUERY_FILTERS,
  MAX_PUBLISH_QUERY_TERMS,
  PUBLISH_FIELD_CONTENT,
  PUBLISH_FIELD_METADATA,
  PUBLISH_FIELD_TITLE,
  PUBLISH_SEARCH_WEIGHTS_V1,
  comparePublishScores,
  publishDocMatchesFilters,
  publishMarkRanges,
  publishNormalize,
  publishPrefixTerms,
  publishQuery,
  publishQueryParts,
  publishShardName,
  publishSnippet,
  publishUtf8Bytes,
  scorePublishDocument,
  type PublishScoreInput,
} from "./publish-search.js";
import type { WordcellSiteDocV1 } from "./publish-model.js";

function doc(
  index: number,
  fields: Partial<WordcellSiteDocV1["f"]> = {},
  inline?: string,
): WordcellSiteDocV1 {
  return {
    i: index,
    s: `doc-${index}`,
    t: fields.t ?? `Doc ${index}`,
    p: "preview",
    f: { t: "", a: "", p: "", g: "", m: "", ...fields },
    ...(inline === undefined ? {} : { x: inline }),
  };
}

describe("publishNormalize", () => {
  test("normalizes case and unicode for matching", () => {
    expect(publishNormalize("  Héllo WORLD  ")).toBe("  héllo world  ");
    expect(publishNormalize("é")).toBe("é");
  });
});

describe("publishQuery", () => {
  test("extracts unique normalized terms and keeps the phrase", () => {
    const query = publishQuery("  Alpha beta ALPHA  ");
    expect(query.terms).toEqual(["alpha", "beta"]);
    expect(query.normalized).toBe("alpha beta alpha");
  });

  test("rejects non-strings and oversized queries", () => {
    expect(() => publishQuery(42)).toThrow(TypeError);
    expect(() => publishQuery("x".repeat(MAX_PUBLISH_QUERY_BYTES + 1)))
      .toThrow(RangeError);
    const many = Array.from({ length: MAX_PUBLISH_QUERY_TERMS + 1 }, (_, i) => `t${i}`)
      .join(" ");
    expect(() => publishQuery(many)).toThrow(RangeError);
  });

  test("an empty query yields no terms and an empty normalized phrase", () => {
    const query = publishQuery("   ");
    expect(query.terms).toEqual([]);
    expect(query.normalized).toBe("");
  });
});

describe("publishShardName", () => {
  test("produces deterministic two-digit lowercase hex shard names", () => {
    for (const term of ["alpha", "beta", "γ-δ", "x".repeat(64)]) {
      const name = publishShardName(term);
      expect(name).toMatch(/^[0-9a-f]{2}$/u);
      expect(publishShardName(term)).toBe(name);
    }
  });
});

describe("publishPrefixTerms", () => {
  const dictionary = ["app", "apple", "application", "banana", "band", "bandana"];

  test("returns sorted prefix matches via binary search", () => {
    expect(publishPrefixTerms(dictionary, "app")).toEqual(["app", "apple", "application"]);
    expect(publishPrefixTerms(dictionary, "ban")).toEqual(["banana", "band", "bandana"]);
    expect(publishPrefixTerms(dictionary, "zzz")).toEqual([]);
    expect(publishPrefixTerms(dictionary, "")).toEqual([]);
  });

  test("bounds expansion to the caller's maximum", () => {
    expect(publishPrefixTerms(dictionary, "ba", 2)).toEqual(["banana", "band"]);
    const long = Array.from({ length: 100 }, (_, i) => `p${String(i).padStart(3, "0")}`);
    expect(publishPrefixTerms(long, "p")).toHaveLength(MAX_PUBLISH_PREFIX_EXPANSIONS);
  });
});

describe("scorePublishDocument", () => {
  test("identity title match outranks partial term matches", () => {
    const query = publishQuery("release notes");
    const identity = scorePublishDocument(
      { doc: doc(0, { t: "release notes" }), contentTerms: new Set() },
      query,
    );
    const partial = scorePublishDocument(
      { doc: doc(1, { t: "release" }), contentTerms: new Set(["notes"]) },
      query,
    );
    expect(identity?.identity).toBe(true);
    expect(partial?.identity).toBe(false);
    expect((identity?.score ?? 0)).toBeGreaterThan(partial?.score ?? 0);
  });

  test("multi-term queries require bounded coverage unless phrase matched", () => {
    const query = publishQuery("alpha beta gamma delta");
    const thin = scorePublishDocument(
      { doc: doc(0, { t: "alpha" }), contentTerms: new Set() },
      query,
    );
    expect(thin).toBeNull();
    const covered = scorePublishDocument(
      { doc: doc(1, { t: "alpha beta" }), contentTerms: new Set(["gamma"]) },
      query,
    );
    expect(covered).not.toBeNull();
  });

  test("content terms and text contribute the content field weight", () => {
    const query = publishQuery("needle");
    const input: PublishScoreInput = {
      doc: doc(0),
      contentTerms: new Set(["needle"]),
      contentText: "haystack with a needle inside",
    };
    const scored = scorePublishDocument(input, query);
    expect(scored).not.toBeNull();
    expect(scored?.score).toBeGreaterThanOrEqual(PUBLISH_SEARCH_WEIGHTS_V1.term.content);
  });

  test("zero-match documents score null", () => {
    expect(scorePublishDocument(
      { doc: doc(0, { t: "unrelated" }), contentTerms: new Set() },
      publishQuery("absent"),
    )).toBeNull();
  });

  test("field mask hits accumulate distinct weights", () => {
    const query = publishQuery("graph");
    // A single-term query doubles as the phrase, so a field containing the
    // term earns both the term and phrase weights plus full coverage.
    const titleHit = scorePublishDocument(
      { doc: doc(0, { t: "graph engine" }), contentTerms: new Set() },
      query,
    );
    const metadataHit = scorePublishDocument(
      { doc: doc(1, { m: "graph" }), contentTerms: new Set() },
      query,
    );
    const weights = PUBLISH_SEARCH_WEIGHTS_V1;
    expect(titleHit?.score)
      .toBe(weights.term.title + weights.phrase.title + weights.coverage);
    expect(metadataHit?.score)
      .toBe(weights.term.metadata + weights.phrase.metadata + weights.coverage);
    expect(PUBLISH_FIELD_TITLE).not.toBe(PUBLISH_FIELD_METADATA);
    expect(PUBLISH_FIELD_CONTENT).toBe(32);
  });
});

describe("comparePublishScores", () => {
  test("orders identity first, then score, then document id", () => {
    const a = { i: 0, score: 10, identity: false, phraseMatched: false, matchedTerms: 1 };
    const b = { i: 1, score: 5, identity: true, phraseMatched: false, matchedTerms: 1 };
    const c = { i: 2, score: 10, identity: false, phraseMatched: false, matchedTerms: 1 };
    expect(comparePublishScores(a, b)).toBeGreaterThan(0);
    expect(comparePublishScores(a, c)).toBeLessThan(0);
    expect([c, a, b].toSorted(comparePublishScores).map((s) => s.i)).toEqual([1, 0, 2]);
  });
});

describe("publishSnippet", () => {
  test("centers a bounded window on the first query match", () => {
    const text = `prefix ${"x".repeat(300)} needle ${"y".repeat(300)} suffix`;
    const snippet = publishSnippet(text, publishQuery("needle"), "fallback");
    expect(snippet).toContain("needle");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(publishUtf8Bytes(snippet)).toBeLessThan(400);
  });

  test("falls back when no term matches", () => {
    expect(publishSnippet("nothing here", publishQuery("absent"), "the fallback"))
      .toBe("the fallback");
  });

  test("maps case-expanding matches back to whole NFC display characters", () => {
    const text = `${"İ😀é".repeat(100)} NEEDLE ${"界𝄞".repeat(100)}`;
    const snippet = publishSnippet(text, publishQuery("needle"), "fallback", 64);
    expect(snippet).toContain("NEEDLE");
    expect(snippet).toBe(snippet.normalize("NFC"));
    expect(Buffer.from(snippet, "utf8").toString("utf8")).toBe(snippet);
    expect(publishUtf8Bytes(snippet)).toBeLessThanOrEqual(64);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(publishSnippet(text, publishQuery("needle"), "fallback", 0)).toBe("");
  });

  test("bounds Unicode display windows including ellipses without splitting a code point", () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom("界", "😀", "é", "İ", "𝄞", " ", "\n"), { minLength: 1, maxLength: 20 }),
      fc.integer({ min: 0, max: 240 }),
      (points, maximum) => {
        const text = `${points.join("").repeat(8)} needle ${points.join("").repeat(8)}`;
        const snippet = publishSnippet(text, publishQuery("needle"), "fallback", maximum);
        expect(publishUtf8Bytes(snippet)).toBeLessThanOrEqual(maximum);
        expect(Buffer.from(snippet, "utf8").toString("utf8")).toBe(snippet);
        expect(snippet).toBe(snippet.normalize("NFC"));
      },
    ));
  });
});

describe("publishQueryParts", () => {
  test("splits tag/type/path filters from free text", () => {
    const parts = publishQueryParts("alpha tag:Public type:concept path:docs/");
    expect(parts.filters.tags).toEqual(["public"]);
    expect(parts.filters.types).toEqual(["concept"]);
    expect(parts.filters.paths).toEqual(["docs"]);
    expect(parts.text).toBe("alpha");
  });

  test("keeps malformed or unknown name: tokens as free text", () => {
    const parts = publishQueryParts("tag: foo:bar path:");
    expect(parts.filters.tags).toEqual([]);
    expect(parts.filters.paths).toEqual([]);
    expect(parts.text).toBe("tag: foo:bar path:");
  });

  test("strips leading and trailing slashes from path values", () => {
    expect(publishQueryParts("path:/docs/").filters.paths).toEqual(["docs"]);
  });

  test("bounds each filter family and overflows into free text", () => {
    const raw = Array.from(
      { length: MAX_PUBLISH_QUERY_FILTERS + 2 },
      (_, index) => `tag:t${index}`,
    ).join(" ");
    const parts = publishQueryParts(raw);
    expect(parts.filters.tags).toHaveLength(MAX_PUBLISH_QUERY_FILTERS);
    expect(parts.text).toBe("tag:t8 tag:t9");
  });

  test("an empty query yields empty filters and text", () => {
    const parts = publishQueryParts("   ");
    expect(parts.text).toBe("");
    expect(parts.filters.tags).toEqual([]);
    expect(parts.filters.types).toEqual([]);
    expect(parts.filters.paths).toEqual([]);
  });
});

describe("publishDocMatchesFilters", () => {
  const target = {
    ...doc(0, { g: "public\nhandbook", p: "docs/alpha\ndocs/alpha" }),
    s: "docs/alpha",
  };

  test("tag filters require every normalized tag line", () => {
    expect(publishDocMatchesFilters(
      target,
      { tags: ["public"], types: [], paths: [] },
      undefined,
    )).toBe(true);
    expect(publishDocMatchesFilters(
      target,
      { tags: ["public", "missing"], types: [], paths: [] },
      undefined,
    )).toBe(false);
  });

  test("type filters compare against the catalog type, defaulting to note", () => {
    expect(publishDocMatchesFilters(
      target,
      { tags: [], types: ["concept"], paths: [] },
      "concept",
    )).toBe(true);
    expect(publishDocMatchesFilters(
      target,
      { tags: [], types: ["Concept"], paths: [] },
      "concept",
    )).toBe(true);
    expect(publishDocMatchesFilters(
      target,
      { tags: [], types: ["note"], paths: [] },
      undefined,
    )).toBe(true);
    expect(publishDocMatchesFilters(
      target,
      { tags: [], types: ["concept"], paths: [] },
      undefined,
    )).toBe(false);
  });

  test("path filters match on segment boundaries only", () => {
    expect(publishDocMatchesFilters(
      target,
      { tags: [], types: [], paths: ["docs"] },
      undefined,
    )).toBe(true);
    expect(publishDocMatchesFilters(
      target,
      { tags: [], types: [], paths: ["docs/alpha"] },
      undefined,
    )).toBe(true);
    expect(publishDocMatchesFilters(
      target,
      { tags: [], types: [], paths: ["doc"] },
      undefined,
    )).toBe(false);
    expect(publishDocMatchesFilters(
      target,
      { tags: [], types: [], paths: ["alpha"] },
      undefined,
    )).toBe(false);
  });

  test("hostile values never throw and never match", () => {
    const hostile = publishQueryParts("tag:<script> path:../.. type:x");
    expect(publishDocMatchesFilters(target, hostile.filters, "note")).toBe(false);
    expect(publishDocMatchesFilters(
      target,
      { tags: ["<img src=x>"], types: [], paths: [] },
      "note",
    )).toBe(false);
  });
});

describe("publishMarkRanges", () => {
  test("maps normalized term hits back to display ranges", () => {
    const ranges = publishMarkRanges("The Alpha Beta Guide", ["alpha", "guide"]);
    expect(ranges).toEqual([
      { start: 4, end: 9 },
      { start: 15, end: 20 },
    ]);
    expect("The Alpha Beta Guide".slice(4, 9)).toBe("Alpha");
  });

  test("case-folds across unicode and merges overlaps", () => {
    const ranges = publishMarkRanges("café CAFÉ", ["café"]);
    expect(ranges).toEqual([{ start: 0, end: 4 }, { start: 5, end: 9 }]);
    const merged = publishMarkRanges("ababab", ["ab", "ba"]);
    expect(merged).toEqual([{ start: 0, end: 6 }]);
  });

  test("case-folding expansions map back without zero-width ranges", () => {
    // İ lowercases to i̇ (two UTF-16 units): matches stay inside the text.
    const ranges = publishMarkRanges("İx i̇y", ["i̇"]);
    for (const range of ranges) {
      expect(range.end).toBeGreaterThan(range.start);
      expect(range.end).toBeLessThanOrEqual(6);
    }
  });

  test("bounds the range count and returns [] without terms", () => {
    expect(publishMarkRanges("anything", [])).toEqual([]);
    const dense = "a ".repeat(64);
    expect(publishMarkRanges(dense, ["a"]).length)
      .toBeLessThanOrEqual(32);
  });

  test("never emits a range covering hostile markup text", () => {
    const text = "<script>alert(1)</script>";
    for (const range of publishMarkRanges(text, ["script", "alert"])) {
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(text.normalize("NFC").length);
    }
  });
});
