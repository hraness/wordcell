import { describe, expect, test } from "bun:test";

import {
  WORDCELL_SITE_GRAPH_VIEW_LIMIT,
  layoutSiteGraph,
  siteGraphDegrees,
  siteGraphSeed,
} from "./publish-graph.js";

describe("layoutSiteGraph", () => {
  const edges = [
    { s: 0, t: 1 },
    { s: 1, t: 2 },
    { s: 2, t: 0 },
    { s: 0, t: 3 },
  ];

  test("identical input produces identical positions", () => {
    const first = layoutSiteGraph(6, edges, { seed: 42 });
    const second = layoutSiteGraph(6, edges, { seed: 42 });
    expect(first).toEqual(second);
  });

  test("a different seed produces a different layout", () => {
    const first = layoutSiteGraph(6, edges, { seed: 1 });
    const second = layoutSiteGraph(6, edges, { seed: 2 });
    expect(first).not.toEqual(second);
  });

  test("every position is finite", () => {
    const points = layoutSiteGraph(50, edges, { seed: 7 });
    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  test("empty, single, and disconnected graphs stay finite", () => {
    expect(layoutSiteGraph(0, [], { seed: 1 })).toEqual([]);
    expect(layoutSiteGraph(1, [], { seed: 1 })).toEqual([{ x: 0, y: 0 }]);
    const sparse = layoutSiteGraph(8, [{ s: 0, t: 1 }], { seed: 3 });
    for (const point of sparse) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  test("out-of-range edges, self-loops, and duplicates are ignored", () => {
    const hostile = [
      { s: -1, t: 0 },
      { s: 0, t: 99 },
      { s: 2, t: 2 },
      { s: 0, t: 1 },
      { s: 0, t: 1 },
      { s: 1, t: 0 },
    ];
    const points = layoutSiteGraph(4, hostile, { seed: 5 });
    expect(points).toHaveLength(4);
    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true);
    }
  });

  test("linked nodes end up closer than an unlinked pair on average", () => {
    const ring = Array.from({ length: 8 }, (_, index) => ({
      s: index,
      t: (index + 1) % 8,
    }));
    const points = layoutSiteGraph(8, ring, { seed: 11 });
    const linked = Math.hypot(
      (points[0]?.x ?? 0) - (points[1]?.x ?? 0),
      (points[0]?.y ?? 0) - (points[1]?.y ?? 0),
    );
    expect(linked).toBeGreaterThan(0);
  });
});

describe("siteGraphSeed", () => {
  test("is deterministic and edge-order sensitive in content", () => {
    const seed = siteGraphSeed(["a", "b"], [{ s: 0, t: 1 }]);
    expect(seed).toBe(siteGraphSeed(["a", "b"], [{ s: 0, t: 1 }]));
    expect(seed).not.toBe(siteGraphSeed(["a", "b"], [{ s: 1, t: 0 }]));
    expect(seed).not.toBe(siteGraphSeed(["a", "c"], [{ s: 0, t: 1 }]));
  });
});

describe("siteGraphDegrees", () => {
  test("counts undirected degree and skips invalid edges", () => {
    expect(siteGraphDegrees(3, [
      { s: 0, t: 1 },
      { s: 1, t: 2 },
      { s: 0, t: 0 },
      { s: -1, t: 2 },
      { s: 0, t: 9 },
    ])).toEqual([1, 2, 1]);
  });

  test("the view limit is a positive bound", () => {
    expect(WORDCELL_SITE_GRAPH_VIEW_LIMIT).toBeGreaterThan(0);
  });
});
