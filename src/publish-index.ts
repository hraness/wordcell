import { canonicalJson } from "@hraness/oh";

import type { Note } from "./graph.js";
import {
  WORDCELL_SITE_DOCS_FORMAT_V1,
  WORDCELL_SITE_LIMITS_V1,
  WORDCELL_SITE_POSTINGS_FORMAT_V1,
  WORDCELL_SITE_TERMS_FORMAT_V1,
  type WordcellSiteContentSearchV1,
  type WordcellSiteDocsV1,
  type WordcellSiteDocV1,
  type WordcellSitePostingsV1,
  type WordcellSiteTermsV1,
} from "./publish-model.js";
import {
  publishNormalize,
  publishShardName,
} from "./publish-search.js";

const TERM_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}._/-]*/gu;

export type SiteIndexBuild = {
  readonly docs: WordcellSiteDocsV1;
  readonly terms: WordcellSiteTermsV1;
  readonly postings: ReadonlyMap<string, WordcellSitePostingsV1>;
  readonly termsCount: number;
  readonly termsTruncated: boolean;
  readonly textTruncated: boolean;
  readonly mode: WordcellSiteContentSearchV1;
};

function bounded(value: string, maximumBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) return { text: value, truncated: false };
  const bytes = Buffer.from(value, "utf8");
  let end = maximumBytes;
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return { text: bytes.subarray(0, end).toString("utf8"), truncated: true };
}

function previewText(note: Note): string {
  const basis = note.summary !== "" ? note.summary : note.searchableText;
  const collapsed = basis.replace(/\s+/gu, " ").trim();
  return bounded(collapsed, WORDCELL_SITE_LIMITS_V1.docPreviewBytes).text;
}

function indexableTerms(text: string): readonly string[] {
  const terms = new Set<string>();
  for (const match of text.matchAll(TERM_PATTERN)) terms.add(match[0]);
  return [...terms];
}

/**
 * Build the document table, term dictionary, and content postings for a
 * published selection. The document table always carries normalized eager
 * fields (title, aliases, path/id, tags, metadata) so browser field matching
 * reproduces the exact lane's substring semantics. Content is indexed inline
 * when the whole selection fits the inline budget, otherwise by sharded
 * postings; `indexContent: false` emits no content index at all.
 */
export function buildSiteIndex(
  notes: readonly Note[],
  slugById: ReadonlyMap<string, string>,
  options: { readonly indexContent?: boolean } = {},
): SiteIndexBuild {
  const indexContent = options.indexContent !== false;
  const fields: WordcellSiteDocV1["f"][] = [];
  const inlineTexts: string[] = [];
  let textTruncated = false;
  let inlineTotal = 0;

  for (const note of notes) {
    const title = bounded(publishNormalize(note.title), WORDCELL_SITE_LIMITS_V1.fieldTextBytes);
    const aliases = bounded(
      note.aliases.map(publishNormalize).join("\n"),
      WORDCELL_SITE_LIMITS_V1.fieldTextBytes,
    );
    const path = bounded(
      `${publishNormalize(note.path)}\n${publishNormalize(note.id)}`,
      WORDCELL_SITE_LIMITS_V1.fieldTextBytes,
    );
    const tags = bounded(
      note.tags.map(publishNormalize).join("\n"),
      WORDCELL_SITE_LIMITS_V1.fieldTextBytes,
    );
    const metadata = bounded(
      publishNormalize(canonicalJson(note.metadata)),
      WORDCELL_SITE_LIMITS_V1.fieldTextBytes,
    );
    textTruncated ||= title.truncated || aliases.truncated || path.truncated
      || tags.truncated || metadata.truncated;
    fields.push({ t: title.text, a: aliases.text, p: path.text, g: tags.text, m: metadata.text });

    if (indexContent) {
      // Match the exact lane's basis: searchableText strips frontmatter,
      // code fences, and comments before indexing.
      const inline = bounded(
        publishNormalize(note.searchableText),
        WORDCELL_SITE_LIMITS_V1.inlineTextBytes,
      );
      textTruncated ||= inline.truncated;
      inlineTexts.push(inline.text);
      inlineTotal += Buffer.byteLength(inline.text, "utf8");
    }
  }

  const mode: WordcellSiteContentSearchV1 = !indexContent
    ? "none"
    : inlineTotal <= WORDCELL_SITE_LIMITS_V1.inlineTotalBytes
      ? "inline"
      : "shards";

  const allTerms = new Set<string>();
  const contentPostings = new Map<string, number[]>();
  const docs: WordcellSiteDocV1[] = [];

  for (const [index, note] of notes.entries()) {
    const slug = slugById.get(note.id);
    if (slug === undefined) throw new Error(`Missing published slug for ${note.id}.`);
    const field = fields[index];
    if (field === undefined) throw new Error(`Missing indexed fields for ${note.id}.`);
    const inline = mode === "inline" ? inlineTexts[index] : undefined;

    const fieldTerms = indexableTerms(
      `${field.t}\n${field.a}\n${field.p}\n${field.g}\n${field.m}`,
    );
    for (const term of fieldTerms) allTerms.add(term);

    if (mode !== "none") {
      const content = inlineTexts[index] ?? "";
      for (const term of indexableTerms(content)) {
        allTerms.add(term);
        if (mode === "shards") {
          const list = contentPostings.get(term) ?? [];
          list.push(index);
          contentPostings.set(term, list);
        }
      }
    }

    docs.push({
      i: index,
      s: slug,
      t: note.title,
      p: previewText(note),
      f: field,
      ...(inline === undefined ? {} : { x: inline }),
    });
  }

  let termsTruncated = false;
  let sortedTerms = [...allTerms].toSorted((left, right) => left.localeCompare(right));
  if (sortedTerms.length > WORDCELL_SITE_LIMITS_V1.indexTerms) {
    sortedTerms = sortedTerms.slice(0, WORDCELL_SITE_LIMITS_V1.indexTerms);
    termsTruncated = true;
  }
  const admitted = new Set(sortedTerms);

  const postings = new Map<string, WordcellSitePostingsV1>();
  if (mode === "shards") {
    const grouped = new Map<string, Record<string, readonly number[]>>();
    for (const [term, docIds] of [...contentPostings.entries()].toSorted(([a], [b]) =>
      a.localeCompare(b))) {
      if (!admitted.has(term)) continue;
      const shard = publishShardName(term);
      const bucket = grouped.get(shard) ?? Object.create(null) as Record<string, readonly number[]>;
      bucket[term] = docIds;
      grouped.set(shard, bucket);
    }
    for (const [shard, bucket] of [...grouped.entries()].toSorted(([a], [b]) =>
      a.localeCompare(b))) {
      postings.set(shard, {
        format: WORDCELL_SITE_POSTINGS_FORMAT_V1,
        shard,
        postings: Object.freeze(bucket),
      });
    }
  }

  return {
    docs: {
      format: WORDCELL_SITE_DOCS_FORMAT_V1,
      content: mode,
      docs,
    },
    terms: {
      format: WORDCELL_SITE_TERMS_FORMAT_V1,
      terms: sortedTerms,
    },
    postings,
    termsCount: sortedTerms.length,
    termsTruncated,
    textTruncated,
    mode,
  };
}
