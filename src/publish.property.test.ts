import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { parseNote } from "./graph.js";
import {
  parseSiteDocsV1,
  parseSiteTermsV1,
} from "./publish-model.js";
import { buildSiteIndex } from "./publish-index.js";
import {
  publishPrefixTerms,
  publishQuery,
  publishShardName,
} from "./publish-search.js";
import {
  derivePublishSlugs,
  publishAssetTarget,
  publishAssetVaultPath,
  publishSlugSegment,
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
