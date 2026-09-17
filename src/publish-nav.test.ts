import { describe, expect, test } from "bun:test";

import {
  SITE_NAV_GROUP_LIMIT,
  pruneSiteNav,
  siteBreadcrumbs,
  siteNavFromCatalog,
  siteTocFromHtml,
  type SiteNavNode,
} from "./publish-nav.js";
import type { WordcellSiteCatalogEntryV1 } from "./publish-model.js";

function entry(slug: string, title = slug): WordcellSiteCatalogEntryV1 {
  return { i: 0, s: slug, t: title };
}

function flatten(nodes: readonly SiteNavNode[]): string[] {
  return nodes.flatMap((node) => [node.path, ...flatten(node.children)]);
}

describe("siteNavFromCatalog", () => {
  test("builds a nested tree over slug paths with note titles", () => {
    const tree = siteNavFromCatalog([
      entry("", "Index"),
      entry("docs", "Docs home"),
      entry("docs/alpha", "Alpha"),
      entry("docs/beta", "Beta"),
      entry("guide/start", "Start"),
      entry("solo", "Solo"),
    ]);
    const paths = flatten(tree.nodes);
    expect(paths).toContain("docs");
    expect(paths).toContain("docs/alpha");
    expect(paths).toContain("guide");
    expect(paths).not.toContain("");

    const docs = tree.nodes.find((node) => node.path === "docs");
    expect(docs?.slug).toBe("docs");
    expect(docs?.label).toBe("Docs home");
    expect(docs?.children.map((child) => child.path)).toEqual(["docs/alpha", "docs/beta"]);

    const guide = tree.nodes.find((node) => node.path === "guide");
    expect(guide?.slug).toBeUndefined();
    expect(guide?.label).toBe("guide");
  });

  test("sorts groups before leaves, then by label, deterministically", () => {
    const entries = [
      entry("zeta", "Zeta"),
      entry("alpha/leaf", "Leaf"),
      entry("beta", "Beta"),
      entry("alpha", "Alpha dir"),
    ];
    const first = siteNavFromCatalog(entries);
    const second = siteNavFromCatalog([...entries].reverse());
    expect(first).toEqual(second);
    expect(first.nodes[0]?.path).toBe("alpha");
    expect(first.nodes.map((node) => node.path)).toEqual(["alpha", "beta", "zeta"]);
  });
});

describe("pruneSiteNav", () => {
  test("keeps deep trees bounded around the current path", () => {
    const tree = siteNavFromCatalog([
      entry("a/b/c/d/current", "Current"),
      entry("a/b/c/sibling", "Sibling"),
      entry("a/other/deep", "Other"),
      entry("b/x/y", "BX"),
    ]);
    const pruned = pruneSiteNav(tree, "a/b/c/d/current");
    const paths = flatten(pruned.nodes);
    expect(paths).toContain("a/b/c/d/current");
    expect(paths).toContain("a/b/c/sibling");
    expect(paths).not.toContain("a/other/deep");
    expect(paths).not.toContain("b/x/y");
  });

  test("caps each group's children and reports the hidden count", () => {
    const many = Array.from(
      { length: SITE_NAV_GROUP_LIMIT + 10 },
      (_, index) => entry(`top/n${String(index).padStart(3, "0")}`),
    );
    const tree = siteNavFromCatalog(many);
    const pruned = pruneSiteNav(tree, undefined);
    const top = pruned.nodes.find((node) => node.path === "top");
    expect(top?.children.length).toBe(SITE_NAV_GROUP_LIMIT);
    expect(top?.hiddenChildren).toBe(10);
  });

  test("honors the global node budget while keeping the current chain", () => {
    const wide = siteNavFromCatalog([
      ...Array.from({ length: 40 }, (_, index) =>
        entry(`flat-${String(index).padStart(2, "0")}`)),
      entry("deep/a/b/c/current", "Current"),
    ]);
    const pruned = pruneSiteNav(wide, "deep/a/b/c/current", 8, 24);
    const paths = flatten(pruned.nodes);
    expect(paths).toContain("deep/a/b/c/current");
    expect(flatten(pruned.nodes).length).toBeLessThanOrEqual(24 + 4);
  });

  test("an unbounded tree passes through unchanged when under limits", () => {
    const tree = siteNavFromCatalog([entry("a", "A"), entry("b", "B")]);
    const pruned = pruneSiteNav(tree, "a");
    expect(flatten(pruned.nodes)).toEqual(["a", "b"]);
    expect(pruned.hiddenRoots).toBe(0);
  });
});

describe("siteBreadcrumbs", () => {
  const titles = new Map([
    ["docs", "Docs"],
    ["docs/alpha", "Alpha"],
  ]);

  test("links note-owned ancestors and marks the leaf current", () => {
    const crumbs = siteBreadcrumbs("docs/alpha", titles);
    expect(crumbs).toEqual([
      { label: "Docs", slug: "docs", current: false },
      { label: "Alpha", current: true },
    ]);
  });

  test("plain segments carry no link and unknown titles fall back to the segment", () => {
    const crumbs = siteBreadcrumbs("a/b/c", new Map());
    expect(crumbs.map((crumb) => crumb.label)).toEqual(["a", "b", "c"]);
    expect(crumbs[0]?.slug).toBeUndefined();
    expect(crumbs[2]?.current).toBe(true);
  });

  test("the root note has no crumbs", () => {
    expect(siteBreadcrumbs("", titles)).toEqual([]);
  });
});

describe("siteTocFromHtml", () => {
  test("extracts emitted headings with ids, levels, and text", () => {
    const html = [
      `<p>intro</p>`,
      `<h2 id="alpha">Alpha</h2>`,
      `<h3 id="beta"><a href="/x">Beta</a> &amp; gamma</h3>`,
      `<p>tail</p>`,
      `<h4 id="dup">Same</h4><h4 id="dup-2">Same</h4>`,
    ].join("\n");
    expect(siteTocFromHtml(html)).toEqual([
      { level: 2, id: "alpha", text: "Alpha" },
      { level: 3, id: "beta", text: "Beta & gamma" },
      { level: 4, id: "dup", text: "Same" },
      { level: 4, id: "dup-2", text: "Same" },
    ]);
  });

  test("bounds entries and ignores non-heading markup", () => {
    const html = Array.from(
      { length: 200 },
      (_, index) => `<h2 id="h${index}">H${index}</h2>`,
    ).join("\n");
    expect(siteTocFromHtml(html)).toHaveLength(128);
    expect(siteTocFromHtml(`<div><h2>no id</h2><p id="x">no</p></div>`)).toEqual([]);
  });
});
