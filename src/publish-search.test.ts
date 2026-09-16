import { describe, expect, test } from "bun:test";

import {
  MAX_PUBLISH_PREFIX_EXPANSIONS,
  MAX_PUBLISH_QUERY_BYTES,
  MAX_PUBLISH_QUERY_TERMS,
  PUBLISH_FIELD_CONTENT,
  PUBLISH_FIELD_METADATA,
  PUBLISH_FIELD_TITLE,
  PUBLISH_SEARCH_WEIGHTS_V1,
  comparePublishScores,
  publishNormalize,
  publishPrefixTerms,
  publishQuery,
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
});
