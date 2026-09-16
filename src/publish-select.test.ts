import { describe, expect, test } from "bun:test";

import { analyzeVault, parseNote, type Note } from "./graph.js";
import {
  MAX_PUBLISH_SLUG_BYTES,
  MAX_PUBLISH_SELECTORS,
  derivePublishSlugs,
  publishAssetTarget,
  publishAssetVaultPath,
  publishSlugSegment,
  selectPublishNotes,
} from "./publish-select.js";

function note(path: string, content: string): Note {
  return parseNote(path, content);
}

function fixture(): readonly Note[] {
  return [
    note("index.md", "# Vault\n\nFront door linking [[docs/alpha]].\n"),
    note("docs/alpha.md", "---\ntags: [public]\ntype: concept\n---\n# Alpha\n\nLinks [[docs/beta]] and [[private/secret]].\n"),
    note("docs/beta.md", "---\ntags: [public]\n---\n# Beta\n\nBack to [[docs/alpha]].\n"),
    note("private/secret.md", "---\npublish: false\n---\n# Secret\n\nDo not publish.\n"),
    note("drafts/wip.md", "# Work in progress\n\nLinks [[docs/alpha]].\n"),
  ];
}

describe("selectPublishNotes", () => {
  test("publishes every public note when no positive selectors apply", () => {
    const notes = fixture();
    const selection = selectPublishNotes(notes, analyzeVault(notes), {});
    expect(selection.notes.map(({ id }) => id)).toEqual([
      "docs/alpha",
      "docs/beta",
      "drafts/wip",
      "index",
    ]);
    expect(selection.excludedPrivate).toBe(1);
    expect(selection.excludedBySelection).toBe(0);
  });

  test("positive selectors form a union, then excludes carve back out", () => {
    const notes = fixture();
    const selection = selectPublishNotes(notes, analyzeVault(notes), {
      includes: ["docs"],
      tags: ["public"],
      excludes: ["docs/beta"],
    });
    expect(selection.notes.map(({ id }) => id)).toEqual(["docs/alpha"]);
    expect(selection.excludedBySelection).toBe(4);
    expect(selection.excludedPrivate).toBe(0);
  });

  test("subset projection drops edges to excluded notes without leaking them", () => {
    const notes = fixture();
    const analysis = analyzeVault(notes);
    const selection = selectPublishNotes(notes, analysis, { includes: ["docs"] });
    const ids = new Set(selection.notes.map(({ id }) => id));
    expect(ids).toEqual(new Set(["docs/alpha", "docs/beta"]));
    for (const link of selection.links) {
      expect(ids.has(link.source)).toBe(true);
      expect(ids.has(link.target)).toBe(true);
    }
    // alpha → private/secret resolves in the vault but is dropped from the site.
    expect(selection.droppedExternalLinks).toBe(1);
    const alphaBacklinks = selection.backlinksById.get("docs/alpha") ?? [];
    expect(alphaBacklinks.map(({ source }) => source)).toEqual(["docs/beta"]);
  });

  test("--from selects a graph neighborhood in both directions", () => {
    const notes = fixture();
    const analysis = analyzeVault(notes);
    const selection = selectPublishNotes(notes, analysis, {
      from: { note: "docs/alpha", depth: 1, direction: "both" },
    });
    const ids = new Set(selection.notes.map(({ id }) => id));
    // alpha's out-neighbor beta and in-neighbor drafts/wip join the seed; the
    // vault index never appears in contextual edges (catalog boundary) and
    // private/secret stays excluded even though alpha links it.
    expect(ids.has("docs/alpha")).toBe(true);
    expect(ids.has("docs/beta")).toBe(true);
    expect(ids.has("drafts/wip")).toBe(true);
    expect(ids.has("index")).toBe(false);
    expect(ids.has("private/secret")).toBe(false);
  });

  test("rejects escaping, absolute, and excessive selectors", () => {
    const notes = fixture();
    const analysis = analyzeVault(notes);
    expect(() =>
      selectPublishNotes(notes, analysis, { includes: ["../outside"] })).toThrow(TypeError);
    expect(() =>
      selectPublishNotes(notes, analysis, { includes: ["/abs"] })).toThrow(TypeError);
    expect(() =>
      selectPublishNotes(notes, analysis, {
        includes: Array.from({ length: MAX_PUBLISH_SELECTORS + 1 }, (_, i) => `n${i}`),
      })).toThrow(RangeError);
    expect(() =>
      selectPublishNotes(notes, analysis, { from: { note: "missing", depth: 1, direction: "both" } }))
      .toThrow("not found");
  });

  test("records a manifest descriptor without leaking filter values", () => {
    const notes = fixture();
    const selection = selectPublishNotes(notes, analyzeVault(notes), {
      includes: ["docs"],
      excludes: ["docs/beta"],
      filters: [{ kind: "equals", path: "type", value: "concept" }],
      tags: ["public"],
      repositoryScopes: ["."],
      from: { note: "docs/alpha", depth: 2, direction: "out" },
    });
    expect(selection.descriptor).toEqual({
      includes: ["docs"],
      excludes: ["docs/beta"],
      from: { note: "docs/alpha", depth: 2, direction: "out" },
      filterCount: 1,
      tagCount: 1,
      scopeCount: 1,
    });
  });
});

describe("derivePublishSlugs", () => {
  test("maps the vault index to the empty root slug", () => {
    const slugs = derivePublishSlugs(["index", "docs/a"]);
    expect(slugs.get("index")).toBe("");
    expect(slugs.get("docs/a")).toBe("docs/a");
  });

  test("resolves collisions deterministically with unique suffixes", () => {
    const ids = ["a/b c", "a/b-c", "a/b_c"];
    const slugs = derivePublishSlugs(ids);
    const values = [...slugs.values()];
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain("a/b-c");
    // A colliding id always receives a deterministic -N suffix.
    const rerun = derivePublishSlugs(ids);
    expect([...rerun.entries()]).toEqual([...slugs.entries()]);
  });

  test("rejects slugs beyond the byte limit", () => {
    const long = "a/".repeat(1) + "x".repeat(MAX_PUBLISH_SLUG_BYTES);
    expect(() => derivePublishSlugs([long])).toThrow(RangeError);
  });
});

describe("publishSlugSegment", () => {
  test("slugifies deterministically and never returns empty", () => {
    expect(publishSlugSegment("Hello World!")).toBe("hello-world");
    expect(publishSlugSegment("---")).toBe("x");
    expect(publishSlugSegment("café")).toBe("café");
    expect(publishSlugSegment("a__b")).toBe("a__b");
  });
});

describe("publishAssetTarget", () => {
  test("decodes local targets and rejects remote or empty ones", () => {
    expect(publishAssetTarget("my%20image.png")).toBe("my image.png");
    expect(publishAssetTarget("dir/file.pdf#page=2")).toBe("dir/file.pdf");
    expect(publishAssetTarget("a.tldr^frame")).toBe("a.tldr");
    expect(publishAssetTarget("https://example.com/x.png")).toBeUndefined();
    expect(publishAssetTarget("data:image/png;base64,abc")).toBeUndefined();
    expect(publishAssetTarget("#fragment")).toBeUndefined();
    expect(publishAssetTarget("bad%ZZ.png")).toBeUndefined();
  });
});

describe("publishAssetVaultPath", () => {
  test("resolves source-relative paths inside the vault only", () => {
    expect(publishAssetVaultPath("notes/deep/a.md", "../../assets/x.png"))
      .toBe("assets/x.png");
    expect(publishAssetVaultPath("a.md", "img.png")).toBe("img.png");
    expect(publishAssetVaultPath("a.md", "../outside.png")).toBeUndefined();
    expect(publishAssetVaultPath("a/b/c.md", "../../../out.png")).toBeUndefined();
    // A leading slash resolves to the vault root, never the filesystem root.
    expect(publishAssetVaultPath("a.md", "/abs.png")).toBe("abs.png");
  });
});
