import { describe, expect, test } from "bun:test";

import { parseNote, type Note } from "./graph.js";
import { buildSiteIndex } from "./publish-index.js";
import {
  parseSiteDocsV1,
  parseSitePostingsV1,
  parseSiteTermsV1,
  WORDCELL_SITE_LIMITS_V1,
} from "./publish-model.js";
import { publishNormalize, publishQuery, publishShardName, scorePublishDocument } from "./publish-search.js";
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
  test("previews project full authored prose while indexing and scoring retain the original search basis", () => {
    const markdown = "# Invented canary\n\nThe **Amberfin** claim.[^A]\n\n[^A]: [Named source](https://example.com/paper).\n";
    const source = note("canary.md", markdown);
    const build = buildSiteIndex([source], slugs([source]));
    const doc = parseSiteDocsV1(build.docs).docs[0]!;
    expect(doc.p).toBe("The Amberfin claim.");
    expect(doc.x).toBe(publishNormalize(source.searchableText));
    expect(doc.x).toContain("[^a]");
    expect(build.terms.terms).toContain("amberfin");
    const input = { doc, contentText: doc.x!, contentTerms: new Set(["amberfin"]) };
    expect(scorePublishDocument(input, publishQuery("amberfin"))).toEqual(scorePublishDocument({
      ...input, doc: { ...doc, p: source.summary },
    }, publishQuery("amberfin")));
    expect(buildSiteIndex([source], slugs([source]), { indexContent: false }).docs.docs[0]?.p).toBe(doc.p);
    expect(source.content).toBe(markdown);
  });

  test("authored descriptions resolve citations before preview byte clipping and retain literal markup as text", () => {
    const label = `sr-${"x".repeat(100)}`;
    const source = note("canary.md", `---\ndescription: 'Authored **Amberfin**.[^${label}] <img src=x onerror=alert(1)>'\n---\n# Canary\n\nOrdinary body.\n\n[^${label}]: Source.\n`);
    const doc = buildSiteIndex([source], slugs([source])).docs.docs[0]!;
    expect(doc.p).toBe("Authored Amberfin. <img src=x onerror=alert(1)>");
    expect(doc.p).not.toContain(label);
    expect(Buffer.byteLength(doc.p)).toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.docPreviewBytes);
  });

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

  test("multibyte content and metadata remain within the reader byte contracts", () => {
    const text = "界😀é".repeat(6_000);
    const unicode = note("unicode.md", `---\naliases: [${text}]\ntags: [${text}]\ncustom: ${text}\n---\n# Unicode\n\n${text}\n`);
    const build = buildSiteIndex([unicode], slugs([unicode]));
    const docs = parseSiteDocsV1(JSON.parse(JSON.stringify(build.docs)));
    const doc = docs.docs[0];
    expect(doc).toBeDefined();
    expect(Buffer.byteLength(doc?.x ?? "", "utf8")).toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.inlineTextBytes);
    expect(Buffer.byteLength(doc?.p ?? "", "utf8")).toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.docPreviewBytes);
    for (const field of Object.values(doc?.f ?? {})) {
      expect(Buffer.byteLength(field, "utf8")).toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.fieldTextBytes);
      expect(field).not.toContain("�");
    }
    expect(doc?.x).not.toContain("�");
    expect(doc?.p).not.toContain("�");
    expect(build.textTruncated).toBe(true);
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
