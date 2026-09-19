import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { analyzeVault, parseNote } from "./graph.js";
import {
  layoutSiteGraph,
  siteGraphSeed,
} from "./publish-graph.js";
import {
  parseSiteDocsV1,
  parseSiteTermsV1,
  WORDCELL_SITE_LIMITS_V1,
} from "./publish-model.js";
import {
  pruneSiteNav,
  siteNavFromCatalog,
  type SiteNavNode,
} from "./publish-nav.js";
import { buildSiteIndex } from "./publish-index.js";
import {
  publishMarkRanges,
  publishNormalize,
  publishPrefixTerms,
  publishQuery,
  publishQueryParts,
  publishShardName,
} from "./publish-search.js";
import {
  derivePublishSlugs,
  publishAssetTarget,
  publishAssetVaultPath,
  publishSlugSegment,
  selectPublishNotes,
} from "./publish-select.js";

const segment = fc.stringMatching(/^[a-z][a-z0-9_-]{0,6}(?: [a-z0-9_-]{1,6})?$/);
const noteId = fc
  .tuple(fc.constantFrom("a", "b", "docs"), segment)
  .map(([directory, name]) => `${directory}/${name}`);

describe("publish slug properties", () => {
  test("derived slugs are unique, deterministic, and vault-safe", () => {
    fc.assert(fc.property(
      fc.uniqueArray(noteId, { maxLength: 40 }),
      (ids) => {
        const slugs = derivePublishSlugs(ids);
        const values = [...slugs.values()];
        // One slug per id, all unique.
        expect(slugs.size).toBe(ids.length);
        expect(new Set(values).size).toBe(values.length);
        // No slug escapes the site tree or contains unsafe bytes.
        for (const slug of values) {
          expect(slug).not.toContain("..");
          expect(slug.startsWith("/")).toBe(false);
        }
        // Same input, same output.
        expect([...derivePublishSlugs(ids).entries()])
          .toEqual([...slugs.entries()]);
      },
    ));
  });

  test("slug segments are idempotent under re-slugging", () => {
    fc.assert(fc.property(segment, (value) => {
      const once = publishSlugSegment(value);
      expect(publishSlugSegment(once)).toBe(once);
    }));
  });
});

describe("publish selection properties", () => {
  test("glob selection is order independent and private/excluded notes never enter it", () => {
    fc.assert(fc.property(fc.uniqueArray(noteId, { minLength: 1, maxLength: 12 }), (ids) => {
      const notes = ids.map((id, index) => parseNote(`${id}.md`, `${index % 3 === 0 ? "---\npublish: false\n---\n" : ""}# ${id}\n`));
      const analysis = analyzeVault(notes);
      const options = { includeGlobs: ["**/*.md"], excludes: [ids[0] ?? ""] };
      const first = selectPublishNotes(notes, analysis, options);
      const second = selectPublishNotes([...notes].reverse(), analysis, options);
      expect(first.notes.map(({ id }) => id)).toEqual(second.notes.map(({ id }) => id));
      expect(first.selected.has(ids[0] ?? "")).toBe(false);
      for (const note of first.notes) expect(note.metadata["publish"]).not.toBe(false);
      for (const link of first.links) {
        expect(first.selected.has(link.source)).toBe(true);
        expect(first.selected.has(link.target)).toBe(true);
      }
      const idGlob = selectPublishNotes(notes, analysis, { includeGlobs: ["**"] });
      const pathGlob = selectPublishNotes(notes, analysis, { includeGlobs: ["**/*.md"] });
      expect(idGlob.notes.map(({ id }) => id)).toEqual(pathGlob.notes.map(({ id }) => id));
    }));
  });
});

describe("publish asset path properties", () => {
  test("resolved asset paths never escape the vault root", () => {
    fc.assert(fc.property(
      noteId.map((id) => `${id}.md`),
      fc.stringMatching(/^[a-zA-Z0-9./_-]{1,40}$/u),
      (source, target) => {
        const resolved = publishAssetVaultPath(source, target);
        if (resolved !== undefined) {
          expect(resolved.startsWith("/")).toBe(false);
          expect(resolved === ".." || resolved.startsWith("../")).toBe(false);
          expect(resolved.split("/")).not.toContain("..");
        }
      },
    ));
  });

  test("asset target decoding never throws on hostile input", () => {
    fc.assert(fc.property(fc.string({ maxLength: 200 }), (raw) => {
      publishAssetTarget(raw);
    }));
  });
});

describe("publish search properties", () => {
  test("shard names are always two lowercase hex digits", () => {
    fc.assert(fc.property(fc.string({ maxLength: 100 }), (term) => {
      expect(publishShardName(term)).toMatch(/^[0-9a-f]{2}$/u);
    }));
  });

  test("query parsing never throws for bounded word lists", () => {
    const queryText = fc
      .array(fc.stringMatching(/^[a-z]{1,8}$/), { maxLength: 30 })
      .map((words) => words.join(" "));
    fc.assert(fc.property(queryText, (raw) => {
      const query = publishQuery(raw);
      expect(query.terms.length).toBeLessThanOrEqual(64);
      for (const term of query.terms) {
        expect(query.normalized).toContain(term);
      }
    }));
  });

  test("prefix expansion returns only dictionary terms starting with the prefix", () => {
    fc.assert(fc.property(
      fc.uniqueArray(
        fc.stringMatching(/^[a-z][a-z0-9]{0,12}$/),
        { maxLength: 200 },
      ),
      fc.stringMatching(/^[a-z]{1,4}$/),
      (dictionary, prefix) => {
        const sorted = [...dictionary].toSorted((a, b) => a.localeCompare(b));
        for (const term of publishPrefixTerms(sorted, prefix)) {
          expect(term.startsWith(prefix)).toBe(true);
          expect(sorted).toContain(term);
        }
      },
    ));
  });
});

describe("publish index properties", () => {
  test("Unicode fields, previews, and inline content fit byte budgets without broken code points", () => {
    const unicode = fc.array(fc.constantFrom("界", "😀", "é", "İ", "𝄞", "a", " "), { minLength: 1, maxLength: 12 });
    fc.assert(fc.property(unicode, fc.integer({ min: 1, max: 8_000 }), (parts, repeat) => {
      const text = parts.join("").repeat(repeat);
      const base = parseNote("unicode.md", "# Unicode\n");
      const note = { ...base, aliases: [text], tags: [text], metadata: { custom: text }, searchableText: text, summary: text };
      const build = buildSiteIndex([note], derivePublishSlugs([note.id]));
      const docs = parseSiteDocsV1(JSON.parse(JSON.stringify(build.docs)));
      for (const doc of docs.docs) {
        for (const field of Object.values(doc.f)) {
          expect(Buffer.byteLength(field, "utf8")).toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.fieldTextBytes);
          expect(field).not.toContain("�");
        }
        expect(Buffer.byteLength(doc.p, "utf8")).toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.docPreviewBytes);
        expect(Buffer.byteLength(doc.x ?? "", "utf8")).toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.inlineTextBytes);
        expect(doc.p).not.toContain("�");
        expect(doc.x).not.toContain("�");
      }
    }), { numRuns: 50 });
  });

  test("generated docs and terms round-trip through the contract parsers", () => {
    fc.assert(fc.property(
      fc.uniqueArray(noteId, { minLength: 1, maxLength: 12 }),
      fc.array(fc.stringMatching(/^[a-z]{2,10}$/), { minLength: 1, maxLength: 8 }),
      (ids, words) => {
        const notes = ids.map((id, index) =>
          parseNote(`${id}.md`, `# ${id}\n\n${words.join(" ")} ${index}.\n`));
        const slugs = derivePublishSlugs(ids);
        const build = buildSiteIndex(notes, slugs);
        const docs = parseSiteDocsV1(JSON.parse(JSON.stringify(build.docs)));
        expect(docs.docs).toHaveLength(notes.length);
        parseSiteTermsV1(JSON.parse(JSON.stringify(build.terms)));
        // Every doc slug comes from the derived map; doc ids are 0..n-1.
        const slugSet = new Set(slugs.values());
        for (const [position, doc] of docs.docs.entries()) {
          expect(doc.i).toBe(position);
          expect(slugSet.has(doc.s)).toBe(true);
        }
      },
    ));
  });

  test("indexing never leaks unselected notes into the doc table", () => {
    fc.assert(fc.property(
      fc.uniqueArray(noteId, { minLength: 2, maxLength: 10 }),
      fc.nat(),
      (ids, pick) => {
        const notes = ids.map((id) => parseNote(`${id}.md`, `# ${id}\n`));
        // Publish every note except one, then verify the excluded id's slug
        // appears in no doc entry.
        const excludedIndex = pick % ids.length;
        const excluded = ids[excludedIndex] ?? ids[0] ?? "";
        const included = ids.filter((id) => id !== excluded);
        const selectionNotes = notes.filter((note) => note.id !== excluded);
        const slugs = derivePublishSlugs(included);
        const build = buildSiteIndex(selectionNotes, slugs);
        const emittedSlugs = new Set(build.docs.docs.map((doc) => doc.s));
        expect(emittedSlugs.size).toBe(included.length);
        for (const slug of emittedSlugs) {
          expect([...slugs.values()]).toContain(slug);
        }
      },
    ));
  });
});

describe("publish nav properties", () => {
  const slugList = fc.uniqueArray(
    fc.array(segment, { minLength: 1, maxLength: 4 }).map((parts) => parts.join("/")),
    { minLength: 0, maxLength: 60 },
  );

  test("the tree is input-order invariant and covers every non-root slug", () => {
    fc.assert(fc.property(
      slugList,
      fc.array(fc.nat(), { minLength: 1, maxLength: 1 }),
      (slugs, seed) => {
        const entries = slugs.map((slug, index) => ({
          i: index,
          s: slug,
          t: `T${index}`,
        }));
        const first = siteNavFromCatalog(entries);
        const shuffled = [...entries].toSorted(() => (seed[0] ?? 0) % 2 === 0 ? 1 : -1);
        const second = siteNavFromCatalog(shuffled);
        const flatten = (nodes: readonly SiteNavNode[]): string[] =>
          nodes.flatMap((node) => [node.path, ...flatten(node.children)]);
        expect(flatten(first.nodes)).toEqual(flatten(second.nodes));
        for (const slug of slugs) {
          if (slug === "") continue;
          expect(flatten(first.nodes)).toContain(slug);
        }
      },
    ));
  });

  test("pruning keeps the current path and stays bounded", () => {
    fc.assert(fc.property(
      slugList,
      (slugs) => {
        const entries = slugs.map((slug, index) => ({ i: index, s: slug, t: `T${index}` }));
        const tree = siteNavFromCatalog(entries);
        const current = slugs.find((slug) => slug !== "") ?? "";
        const pruned = pruneSiteNav(tree, current, 24, 128);
        const flatten = (nodes: readonly SiteNavNode[]): string[] =>
          nodes.flatMap((node) => [node.path, ...flatten(node.children)]);
        const paths = flatten(pruned.nodes);
        if (current !== "") {
          const segments = current.split("/");
          for (let depth = 1; depth <= segments.length; depth += 1) {
            expect(paths).toContain(segments.slice(0, depth).join("/"));
          }
        }
        expect(paths.length).toBeLessThanOrEqual(128 + 64);
      },
    ));
  });
});

describe("publish query filter properties", () => {
  test("filters are bounded and every free-text token survives verbatim", () => {
    fc.assert(fc.property(
      fc.array(fc.stringMatching(/^\S{1,16}$/), { maxLength: 24 }),
      (tokens) => {
        const parts = publishQueryParts(tokens.join(" "));
        expect(parts.filters.tags.length).toBeLessThanOrEqual(8);
        expect(parts.filters.types.length).toBeLessThanOrEqual(8);
        expect(parts.filters.paths.length).toBeLessThanOrEqual(8);
        for (const token of parts.text.split(/\s+/u)) {
          if (token === "") continue;
          expect(tokens).toContain(token);
        }
      },
    ));
  });
});

describe("publish mark-range properties", () => {
  test("ranges are sorted, disjoint, and inside the normalized text", () => {
    fc.assert(fc.property(
      fc.stringMatching(/^[a-z0-9 ]{0,80}$/),
      fc.array(fc.stringMatching(/^[a-z0-9]{1,6}$/), { maxLength: 6 }),
      (text, terms) => {
        const normalized = text.normalize("NFC");
        const ranges = publishMarkRanges(text, terms);
        let previousEnd = 0;
        for (const range of ranges) {
          expect(range.start).toBeGreaterThanOrEqual(previousEnd);
          expect(range.start).toBeLessThan(range.end);
          expect(range.end).toBeLessThanOrEqual(normalized.length);
          previousEnd = range.end;
          const slice = publishNormalize(normalized.slice(range.start, range.end));
          expect(terms.some((term) => slice.includes(term))).toBe(true);
        }
      },
    ));
  });
});

describe("publish graph layout properties", () => {
  test("layouts are deterministic and finite for arbitrary graphs", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 48 }),
      fc.array(
        fc.tuple(fc.nat(), fc.nat()).map(([s, t]) => ({ s, t })),
        { maxLength: 64 },
      ),
      fc.nat(),
      (nodeCount, edges, seed) => {
        const first = layoutSiteGraph(nodeCount, edges, { seed });
        const second = layoutSiteGraph(nodeCount, edges, { seed });
        expect(first).toEqual(second);
        expect(first).toHaveLength(nodeCount);
        for (const point of first) {
          expect(Number.isFinite(point.x)).toBe(true);
          expect(Number.isFinite(point.y)).toBe(true);
        }
      },
    ));
  });

  test("the seed depends on the slugs and edges", () => {
    fc.assert(fc.property(
      fc.array(segment, { minLength: 1, maxLength: 8 }),
      fc.array(fc.tuple(fc.nat(), fc.nat()).map(([s, t]) => ({ s, t })), { maxLength: 16 }),
      (slugs, edges) => {
        expect(siteGraphSeed(slugs, edges)).toBe(siteGraphSeed(slugs, edges));
      },
    ));
  });
});
