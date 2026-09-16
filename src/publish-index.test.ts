import { describe, expect, test } from "bun:test";

import { parseNote, type Note } from "./graph.js";
import { buildSiteIndex } from "./publish-index.js";
import {
  parseSiteDocsV1,
  parseSitePostingsV1,
  parseSiteTermsV1,
  WORDCELL_SITE_LIMITS_V1,
} from "./publish-model.js";
import { publishShardName } from "./publish-search.js";
import { derivePublishSlugs } from "./publish-select.js";

function note(path: string, content: string): Note {
  return parseNote(path, content);
}

const NOTES = [
  note("index.md", "# Vault\n\nFront door.\n"),
  note("docs/alpha.md", "---\ntags: [public]\n---\n# Alpha\n\nAlpha searchable content needle\n"),
  note("docs/beta.md", "# Beta\n\nBeta content.\n"),
];

function slugs(notes: readonly Note[]): ReadonlyMap<string, string> {
  return derivePublishSlugs(notes.map(({ id }) => id));
}

describe("buildSiteIndex", () => {
  test("small corpora use inline content search with parseable artifacts", () => {
    const build = buildSiteIndex(NOTES, slugs(NOTES));
    expect(build.mode).toBe("inline");
    expect(build.postings.size).toBe(0);

    const docs = parseSiteDocsV1(JSON.parse(JSON.stringify(build.docs)));
    expect(docs.docs).toHaveLength(3);
    const alpha = docs.docs.find((entry) => entry.s === "docs/alpha");
    expect(alpha?.x).toContain("needle");
    expect(alpha?.f.t).toBe("alpha");
    expect(alpha?.f.g).toContain("public");

    const terms = parseSiteTermsV1(JSON.parse(JSON.stringify(build.terms)));
    expect(terms.terms).toContain("needle");
    expect(terms.terms).toContain("alpha");
    expect(build.termsTruncated).toBe(false);
  });

  test("indexContent: false emits no content index or postings", () => {
    const build = buildSiteIndex(NOTES, slugs(NOTES), { indexContent: false });
    expect(build.mode).toBe("none");
    expect(build.postings.size).toBe(0);
    for (const doc of build.docs.docs) {
      expect(doc.x).toBeUndefined();
    }
    // Fields still index — field search works without content.
    expect(build.terms.terms).toContain("alpha");
  });

  test("corpora beyond the inline budget fall back to sharded postings", () => {
    // Each note's inline text is capped at inlineTextBytes, so crossing the
    // aggregate inline budget needs > inlineTotalBytes/inlineTextBytes notes.
    const needed = Math.floor(
      WORDCELL_SITE_LIMITS_V1.inlineTotalBytes / WORDCELL_SITE_LIMITS_V1.inlineTextBytes,
    ) + 2;
    const body = "shared body content ".repeat(1_000);
    const notes = Array.from({ length: needed }, (_, index) =>
      note(`n/${index}.md`, `# Note ${index}\n\n${body} unique-${index}.\n`));
    const build = buildSiteIndex(notes, slugs(notes));
    expect(build.mode).toBe("shards");
    expect(build.postings.size).toBeGreaterThan(0);
    for (const doc of build.docs.docs) {
      expect(doc.x).toBeUndefined();
    }
    // Every postings shard parses and is named by its hash.
    for (const [shard, postings] of build.postings) {
      const parsed = parseSitePostingsV1(JSON.parse(JSON.stringify(postings)));
      expect(parsed.shard).toBe(shard);
      for (const term of Object.keys(parsed.postings)) {
        expect(publishShardName(term)).toBe(shard);
      }
    }
  });

  test("output is deterministic for identical input", () => {
    const first = buildSiteIndex(NOTES, slugs(NOTES));
    const second = buildSiteIndex(NOTES, slugs(NOTES));
    expect(JSON.stringify(first.docs)).toBe(JSON.stringify(second.docs));
    expect(JSON.stringify(first.terms)).toBe(JSON.stringify(second.terms));
  });

  test("document previews stay within the byte cap", () => {
    const long = note("long.md", `# Long\n\n${"lorem ipsum ".repeat(200)}\n`);
    const build = buildSiteIndex([long], slugs([long]));
    const doc = build.docs.docs[0];
    expect(doc).toBeDefined();
    expect(Buffer.byteLength(doc?.p ?? "", "utf8"))
      .toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.docPreviewBytes);
  });
});
