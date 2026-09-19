import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import {
  applyRerank,
  type SearchRerankResult,
} from "./rerank.js";

type Hit = {
  readonly id: string;
  readonly rank: number;
  readonly label: string;
};

function hit(id: string, rank: number): Hit {
  return { id, rank, label: `label-${id}` };
}

function ready(
  ordering: readonly string[],
  probabilities: Readonly<Record<string, number>>,
): SearchRerankResult {
  return { status: "ready", ordering, probabilities };
}

describe("applyRerank", () => {
  test("reorders the window by probability then baseline rank then id", () => {
    const hits = [hit("a", 1), hit("b", 2), hit("c", 3), hit("d", 4)];
    const applied = applyRerank(
      hits,
      ready(["a", "b", "c"], { a: 0.2, b: 0.9, c: 0.5 }),
    );
    expect(applied.status).toBe("ready");
    expect(applied.hits.map(({ id }) => id)).toEqual(["b", "c", "a", "d"]);
    expect(applied.hits.map(({ rank }) => rank)).toEqual([1, 2, 3, 4]);
    expect(applied.placements.get("b")).toEqual({
      baselineRank: 2,
      rerankRank: 1,
      probability: 0.9,
    });
    expect(applied.placements.get("a")).toEqual({
      baselineRank: 1,
      rerankRank: 3,
      probability: 0.2,
    });
    expect(applied.placements.has("d")).toBe(false);
  });

  test("preserves identity priority, permutations, and the untouched tail", () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        identity: fc.boolean(),
        probability: fc.integer({ min: 0, max: 100 }),
      }), { minLength: 1, maxLength: 25 }),
      (entries) => {
        const hits = entries.map((entry, index) => ({
          ...hit(`c${index}`, index + 1), identity: entry.identity,
        }));
        const tail = { ...hit("tail", hits.length + 1), identity: false };
        const probabilities = Object.fromEntries(entries.map((entry, index) =>
          [`c${index}`, entry.probability / 100]));
        const applied = applyRerank([...hits, tail], ready(
          hits.map(({ id }) => id), probabilities,
        ));
        const expected = [...hits].sort((left, right) =>
          Number(right.identity) - Number(left.identity)
          || (probabilities[right.id] ?? 0) - (probabilities[left.id] ?? 0)
          || left.rank - right.rank);
        expect(applied.status).toBe("ready");
        expect(applied.hits.map(({ id }) => id)).toEqual([
          ...expected.map(({ id }) => id), "tail",
        ]);
        expect(applied.hits.at(-1)).toBe(tail);
        expect(applied.hits.map(({ rank }) => rank))
          .toEqual(Array.from({ length: hits.length + 1 }, (_, index) => index + 1));
      },
    ));
  });

  test("keeps non-window hits in baseline order", () => {
    const hits = [hit("a", 1), hit("b", 2), hit("c", 3), hit("d", 4), hit("e", 5)];
    const applied = applyRerank(
      hits,
      ready(["a", "b"], { a: 0.9, b: 0.1 }),
    );
    expect(applied.status).toBe("ready");
    expect(applied.hits.map(({ id }) => id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(applied.hits[2]).toBe(hits[2]);
    expect(applied.hits[3]).toBe(hits[3]);
    expect(applied.hits[4]).toBe(hits[4]);
  });

  test("renumbers rank only where the window moved", () => {
    const hits = [hit("a", 1), hit("b", 2), hit("c", 3)];
    const applied = applyRerank(
      hits,
      ready(["a", "b", "c"], { a: 0.4, b: 0.4, c: 0.4 }),
    );
    expect(applied.hits).toEqual(hits);
    const moved = applyRerank(
      hits,
      ready(["a", "b", "c"], { a: 0.1, b: 0.1, c: 0.9 }),
    );
    expect(moved.hits[0]).toMatchObject({ id: "c", rank: 1 });
    expect(moved.hits[0]).not.toBe(hits[2]);
  });

  test("rejects duplicate, unknown, and missing ordering ids", () => {
    const hits = [hit("a", 1), hit("b", 2), hit("c", 3)];
    const duplicate = applyRerank(hits, ready(["a", "a", "b"], { a: 1, b: 1 }));
    expect(duplicate.status).toBe("failed");
    expect(duplicate.hits).toEqual(hits);
    expect(duplicate.message).toContain("duplicate");

    const unknown = applyRerank(hits, ready(["a", "b", "zz"], { a: 1, b: 1 }));
    expect(unknown.status).toBe("failed");
    expect(unknown.hits).toEqual(hits);
    expect(unknown.message).toContain("unknown");

    const omitted = applyRerank(
      hits,
      ready(["a", "b"], { a: 0.5, b: 0.5 }),
    );
    expect(omitted.status).toBe("ready");

    const skippedWindowMember = applyRerank(
      hits,
      ready(["a", "c"], { a: 0.1, c: 0.9 }),
    );
    expect(skippedWindowMember.status).toBe("failed");
    expect(skippedWindowMember.hits).toEqual(hits);
    expect(skippedWindowMember.message).toContain("unknown");
  });

  test("rejects missing, non-finite, out-of-range, and unknown probabilities", () => {
    const hits = [hit("a", 1), hit("b", 2)];
    for (const probabilities of [
      { a: 0.5 },
      { a: Number.NaN, b: 0.5 },
      { a: 1.1, b: 0.5 },
      { a: -0.1, b: 0.5 },
      { a: 0.5, b: 0.5, c: 0.5 },
    ]) {
      const applied = applyRerank(hits, ready(["a", "b"], probabilities));
      expect(applied.status).toBe("failed");
      expect(applied.hits).toEqual(hits);
      expect(applied.placements.size).toBe(0);
    }
  });

  test("handles empty and single-candidate windows", () => {
    const empty = applyRerank([], ready([], {}));
    expect(empty.status).toBe("ready");
    expect(empty.hits).toEqual([]);

    const single = applyRerank([hit("a", 1)], ready(["a"], { a: 0.75 }));
    expect(single.status).toBe("ready");
    expect(single.hits).toEqual([{ id: "a", rank: 1, label: "label-a" }]);
    expect(single.placements.get("a")).toEqual({
      baselineRank: 1,
      rerankRank: 1,
      probability: 0.75,
    });
  });

  test("is deterministic for equal probabilities", () => {
    const hits = [hit("b", 1), hit("a", 2), hit("c", 3)];
    const first = applyRerank(hits, ready(["b", "a", "c"], { a: 0.5, b: 0.5, c: 0.5 }));
    const second = applyRerank(hits, ready(["c", "a", "b"], { a: 0.5, b: 0.5, c: 0.5 }));
    expect(first.hits.map(({ id }) => id)).toEqual(["b", "a", "c"]);
    expect(second.hits.map(({ id }) => id)).toEqual(["b", "a", "c"]);
  });

  test("passes through unavailable and failed without reordering", () => {
    const hits = [hit("a", 1), hit("b", 2)];
    const unavailable = applyRerank(hits, {
      status: "unavailable",
      message: "no key",
    });
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.hits).toEqual(hits);
    expect(unavailable.message).toBe("no key");

    const failed = applyRerank(hits, { status: "failed", message: "http 500" });
    expect(failed.status).toBe("failed");
    expect(failed.hits).toEqual(hits);
    expect(failed.placements.size).toBe(0);
  });

  test("fails soft for malformed custom-engine results", () => {
    const hits = [hit("a", 1), hit("b", 2)];
    for (const malformed of [
      null,
      {},
      { status: "ready", ordering: null, probabilities: {} },
      { status: "ready", ordering: ["a", "b"], probabilities: null },
      {
        status: "ready",
        ordering: ["a", "b"],
        probabilities: { a: 0.5, b: 0.5 },
        usage: { inputTokens: "secret provider body" },
      },
      {
        status: "ready",
        ordering: ["a", "b"],
        probabilities: { a: 0.5, b: 0.5 },
        extra: true,
      },
      { status: "failed", message: "x".repeat(513) },
    ]) {
      const applied = applyRerank(hits, malformed);
      expect(applied.status).toBe("failed");
      expect(applied.hits).toEqual(hits);
      expect(applied.message).toBe("Rerank engine returned a malformed result.");
    }
  });

  test("rejects a partial result when the caller supplies the full expected window", () => {
    const hits = [hit("a", 1), hit("b", 2), hit("c", 3)];
    const applied = applyRerank(
      hits,
      ready(["a", "b"], { a: 0.8, b: 0.2 }),
      ["a", "b", "c"],
    );
    expect(applied.status).toBe("failed");
    expect(applied.hits).toEqual(hits);
    expect(applied.placements.size).toBe(0);
  });

  test("keeps hits outside the declared ordering window untouched", () => {
    const hits = [hit("a", 1), hit("b", 2), hit("c", 3), hit("d", 4)];
    const applied = applyRerank(
      hits,
      ready(["a", "b"], { a: 0.1, b: 0.8 }),
    );
    expect(applied.status).toBe("ready");
    expect(applied.hits.map(({ id }) => id)).toEqual(["b", "a", "c", "d"]);
    expect(applied.hits[2]).toBe(hits[2]);
    expect(applied.hits[3]).toBe(hits[3]);
  });
});
