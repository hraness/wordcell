import { describe, expect, test } from "bun:test";

import { analyzeVault, parseNote, type Note } from "./graph.js";
import {
  MAX_PUBLISH_SLUG_BYTES,
  MAX_PUBLISH_FROM_NOTES,
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
    expect(selectPublishNotes(notes, analyzeVault(notes), { includes: ["."] }).notes).toEqual(selection.notes);
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
    for (const path of ["", "   ", "docs/..", "C:/docs"]) {
      expect(() => selectPublishNotes(notes, analysis, { includes: [path] })).toThrow(TypeError);
    }
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

  test("globs select arbitrary paths while excludes and privacy always win", () => {
    const notes = [
      ...fixture(),
      note("docs/deep/a.md", "# Nested\n"),
      note("docs/deep/draft-b.md", "# Draft\n"),
      note("docs2/a.md", "# Other folder\n"),
    ];
    const selection = selectPublishNotes(notes, analyzeVault(notes), {
      includeGlobs: ["docs/**/*.md", "private/**"],
      excludes: ["docs/beta"],
      excludeGlobs: ["**/draft-*"],
    });
    expect(selection.notes.map(({ id }) => id)).toEqual(["docs/alpha", "docs/deep/a"]);
    expect(selection.excludedPrivate).toBe(1);
    expect(selectPublishNotes(notes, analyzeVault(notes), { includeGlobs: ["docs/*"] })
      .notes.map(({ id }) => id)).toEqual(["docs/alpha", "docs/beta"]);
    expect(selectPublishNotes(notes, analyzeVault(notes), { includeGlobs: ["**/?.md"] })
      .notes.map(({ id }) => id)).toEqual(["docs/deep/a", "docs2/a"]);
  });

  test("metadata predicates intersect inside their group and paths add to it", () => {
    const notes = fixture();
    const selection = selectPublishNotes(notes, analyzeVault(notes), {
      includes: ["drafts/wip"],
      tags: ["public"],
      filters: [{ kind: "equals", path: "type", value: "concept" }],
    });
    expect(selection.notes.map(({ id }) => id)).toEqual(["docs/alpha", "drafts/wip"]);
  });

  test("rejects unsupported and escaping globs instead of silently matching nothing", () => {
    const notes = fixture();
    const analysis = analyzeVault(notes);
    for (const pattern of ["", "../**", "/docs/*", "C:/docs/*", "docs/../*", "docs/**a", "[ab]", "{a,b}", "**/\u0000", "a".repeat(1025)]) {
      expect(() => selectPublishNotes(notes, analysis, { includeGlobs: [pattern] })).toThrow(TypeError);
    }
    expect(() => selectPublishNotes(notes, analysis, {
      includes: ["docs"], includeGlobs: Array.from({ length: MAX_PUBLISH_SELECTORS }, () => "**"),
    })).toThrow(RangeError);
  });

  test("publishes graph neighborhoods beyond fifty notes and rejects truncation", () => {
    const leaves = Array.from({ length: MAX_PUBLISH_FROM_NOTES }, (_, index) => note(`n${index}.md`, `# Note ${index}\n`));
    const seed = note("seed.md", leaves.map(({ id }) => `[[${id}]]`).join("\n"));
    const small = [seed, ...leaves.slice(0, 60)];
    expect(selectPublishNotes(small, analyzeVault(small), {
      from: { note: "seed", depth: 1, direction: "out" },
    }).notes).toHaveLength(61);
    const large = [seed, ...leaves];
    expect(() => selectPublishNotes(large, analyzeVault(large, { mentionScope: () => false }), {
      from: { note: "seed", depth: 1, direction: "out" },
    })).toThrow("narrow --depth");
  });

  test("bounds aggregate work across include and exclude globs", () => {
    const notes = [note(`${"a".repeat(240)}.md`, "# Long filename\n")];
    const analysis = analyzeVault(notes);
    const expensive = `${"*a".repeat(500)}b`;
    expect(() => selectPublishNotes(notes, analysis, {
      includeGlobs: Array.from({ length: 128 }, () => expensive),
      excludeGlobs: Array.from({ length: 128 }, () => expensive),
    })).toThrow("work budget");
    expect(selectPublishNotes(notes, analysis, { includes: [notes[0]?.id ?? "missing"] }).notes).toEqual(notes);
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
      includes: [],
      excludes: [],
      includeCount: 1,
      excludeCount: 1,
      includeGlobCount: 0,
      excludeGlobCount: 0,
      fromCount: 1,
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
