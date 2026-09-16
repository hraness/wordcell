import {
  posix,
} from "node:path";

import {
  parseLocalAttachmentReferences,
  type LocalAttachmentReference,
} from "./attachments.js";
import type {
  AuthoredRelation,
  Backlink,
  Note,
  VaultAnalysis,
} from "./graph.js";
import { lookupNote } from "./graph.js";
import {
  navigateLinks,
  type LinkDirection,
} from "./navigation.js";
import { queryVault } from "./query.js";
import type {
  MetadataFilter,
} from "./query.js";
import type {
  WordcellSiteSelectionV1,
} from "./publish-model.js";

export const MAX_PUBLISH_SELECTORS = 256;
export const MAX_PUBLISH_FROM_DEPTH = 10;
export const MAX_PUBLISH_SLUG_BYTES = 1_024;

/**
 * Positive selectors form a union: every include prefix, metadata filter,
 * tag, scope, or `--from` neighborhood adds notes. Excludes and the authored
 * `publish: false` flag then carve notes back out. Selection never reads
 * note bodies; a selected note's prose can still mention excluded ids, so the
 * boundary is graph and metadata presence, not text redaction.
 */
export type PublishSelectionInput = {
  readonly includes?: readonly string[];
  readonly excludes?: readonly string[];
  readonly filters?: readonly MetadataFilter[];
  readonly tags?: readonly string[];
  readonly repositoryScopes?: readonly string[];
  readonly from?: Readonly<{
    note: string;
    depth: number;
    direction: LinkDirection;
  }>;
};

export type PublishSelection = {
  /** Selected notes sorted by canonical id. */
  readonly notes: readonly Note[];
  /** Note id to site slug; the vault index note maps to the empty root slug. */
  readonly slugById: ReadonlyMap<string, string>;
  /** Selected-id lookup for closure checks. */
  readonly selected: ReadonlySet<string>;
  /** Resolved contextual links with both endpoints inside the selection. */
  readonly links: readonly { readonly source: string; readonly target: string }[];
  /** Selected-note id to in-selection backlinks. */
  readonly backlinksById: ReadonlyMap<string, readonly Backlink[]>;
  /** Selected-note id to in-selection outbound authored relations. */
  readonly relationsById: ReadonlyMap<string, readonly AuthoredRelation[]>;
  /** Selected-note id to in-selection relation backlinks. */
  readonly relationBacklinksById: ReadonlyMap<string, readonly AuthoredRelation[]>;
  /** Selected-note id to declared local attachment references. */
  readonly attachmentsById: ReadonlyMap<string, readonly LocalAttachmentReference[]>;
  readonly excludedPrivate: number;
  readonly excludedBySelection: number;
  /** Resolved links and relations whose target stayed outside the selection. */
  readonly droppedExternalLinks: number;
  readonly droppedExternalRelations: number;
  /** Manifest record of the selectors that produced this projection. */
  readonly descriptor: WordcellSiteSelectionV1;
};

function normalizeSelectorPrefix(value: string, flag: string): string {
  const trimmed = value.trim().replaceAll("\\", "/");
  const normalized = posix.normalize(trimmed).replace(/^\.\//u, "").replace(/\/+$/u, "");
  if (
    normalized === ""
    || normalized.startsWith("/")
    || normalized === ".."
    || normalized.startsWith("../")
    || normalized.split("/").includes("..")
  ) {
    throw new TypeError(`${flag} must be a vault-relative path prefix or note id`);
  }
  return normalized;
}

function selectorIncludes(prefixes: readonly string[], id: string): boolean {
  return prefixes.some((prefix) =>
    id === prefix
    || id.startsWith(`${prefix}/`)
    || (prefix.endsWith(".md") && id === prefix.slice(0, -3)));
}

function isPrivate(note: Note): boolean {
  return note.metadata["publish"] === false;
}

const SLUG_UNSAFE = /[^\p{L}\p{N}._~-]+/gu;
const SLUG_EDGE = /^[-._~]+|[-._~]+$/gu;

export function publishSlugSegment(segment: string): string {
  const cleaned = segment
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
    .replace(SLUG_UNSAFE, "-")
    .replace(SLUG_EDGE, "")
    .replace(/-{2,}/gu, "-");
  return cleaned === "" ? "x" : cleaned;
}

/**
 * Deterministically assign collision-free slugs to selected note ids. The
 * vault index note publishes at the site root with the empty slug; every other
 * note nests under the note prefix by its slugified id path.
 */
export function derivePublishSlugs(ids: readonly string[]): ReadonlyMap<string, string> {
  const sorted = [...ids].toSorted((left, right) => left.localeCompare(right));
  const slugById = new Map<string, string>();
  const used = new Set<string>();
  for (const id of sorted) {
    const segments = id.split("/").map(publishSlugSegment);
    // The index note owns the root slug outright — a second index can't exist
    // (ids are unique), and no other id can slugify to "" (segments bottom out
    // at "x").
    let slug = id === "index" ? "" : segments.join("/");
    if (slug !== "" && used.has(slug)) {
      let suffix = 2;
      while (used.has(`${slug}-${suffix}`)) suffix += 1;
      slug = `${slug}-${suffix}`;
    }
    if (Buffer.byteLength(slug, "utf8") > MAX_PUBLISH_SLUG_BYTES) {
      throw new RangeError(`Published slug for ${JSON.stringify(id)} exceeds the byte limit.`);
    }
    used.add(slug);
    slugById.set(id, slug);
  }
  return slugById;
}

/**
 * Decode an authored attachment target like the vault validator: strip query,
 * heading, block and page fragments, percent-decode, unescape, NFC.
 */
export function publishAssetTarget(rawTarget: string): string | undefined {
  const withoutDecoration = rawTarget.trim().split(/[?#^]/u, 1)[0] ?? "";
  if (withoutDecoration === "" || withoutDecoration.startsWith("#")) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutDecoration)
      .replace(/\\([\\()[\] ])/gu, "$1")
      .normalize("NFC");
  } catch {
    return undefined;
  }
  if (decoded === "" || /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(decoded)) return undefined;
  return decoded;
}

/**
 * Resolve a decoded attachment target against its source note's directory.
 * Returns the normalized vault-relative path or undefined when the target
 * escapes the vault. This is the canonical lexical resolver: `publishVault`
 * answers it through real filesystem validation, and custom `PublishIo`
 * implementations should use it (or stricter) for traversal confinement.
 */
export function publishAssetVaultPath(source: string, target: string): string | undefined {
  const base = posix.dirname(source);
  const resolved = posix.normalize(posix.join(base, target));
  if (
    resolved === ".."
    || resolved.startsWith("../")
    || resolved.startsWith("/")
    || resolved.split("/").includes("..")
  ) {
    return undefined;
  }
  return resolved;
}

export function selectPublishNotes(
  notes: readonly Note[],
  analysis: VaultAnalysis,
  input: PublishSelectionInput = {},
): PublishSelection {
  const includes = (input.includes ?? []).map((value) =>
    normalizeSelectorPrefix(value, "--include"));
  const excludes = (input.excludes ?? []).map((value) =>
    normalizeSelectorPrefix(value, "--exclude"));
  if (includes.length + excludes.length > MAX_PUBLISH_SELECTORS) {
    throw new RangeError(`Publish selectors may contain at most ${MAX_PUBLISH_SELECTORS} entries.`);
  }
  const filters = input.filters ?? [];
  const tags = input.tags ?? [];
  const repositoryScopes = input.repositoryScopes ?? [];

  const candidates = new Set<string>();
  const hasPositive = includes.length > 0
    || filters.length > 0
    || tags.length > 0
    || repositoryScopes.length > 0
    || input.from !== undefined;

  for (const note of notes) {
    if (includes.length > 0 && selectorIncludes(includes, note.id)) candidates.add(note.id);
  }
  if (filters.length > 0 || tags.length > 0 || repositoryScopes.length > 0) {
    for (const row of queryVault(notes, analysis, { filters, tags, repositoryScopes })) {
      candidates.add(row.id);
    }
  }
  if (input.from !== undefined) {
    const lookup = lookupNote(notes, input.from.note);
    if (lookup.kind === "missing") {
      throw new Error(`Publish seed ${JSON.stringify(input.from.note)} was not found.`);
    }
    if (lookup.kind === "ambiguous") {
      throw new Error(
        `Publish seed ${JSON.stringify(input.from.note)} is ambiguous: `
          + lookup.candidates.map(({ path }) => path).join(", "),
      );
    }
    const neighborhood = navigateLinks(notes, analysis, lookup.note, {
      direction: input.from.direction,
      depth: input.from.depth,
    });
    for (const node of neighborhood.nodes) candidates.add(node.id);
  }

  let excludedPrivate = 0;
  let excludedBySelection = 0;
  const selected: Note[] = [];
  for (const note of notes) {
    const chosen = hasPositive ? candidates.has(note.id) : true;
    const excluded = excludes.length > 0 && selectorIncludes(excludes, note.id);
    if (!chosen || excluded) {
      excludedBySelection += 1;
      continue;
    }
    if (isPrivate(note)) {
      excludedPrivate += 1;
      continue;
    }
    selected.push(note);
  }
  selected.sort((left, right) => left.id.localeCompare(right.id));

  const selectedIds = new Set(selected.map(({ id }) => id));
  const slugById = derivePublishSlugs(selected.map(({ id }) => id));

  // contextualLinks carry vault paths (`a/b.md`); authored relations carry
  // canonical ids (`a/b`). Normalize links to ids so every downstream map is
  // keyed identically.
  const idByPath = new Map(notes.map((note) => [note.path, note.id]));
  let droppedExternalLinks = 0;
  const links: { source: string; target: string }[] = [];
  const backlinksById = new Map<string, Backlink[]>();
  for (const link of analysis.contextualLinks) {
    const sourceId = idByPath.get(link.source);
    const targetId = idByPath.get(link.target);
    if (sourceId === undefined || targetId === undefined) continue;
    const sourceInside = selectedIds.has(sourceId);
    const targetInside = selectedIds.has(targetId);
    if (sourceInside && !targetInside) droppedExternalLinks += 1;
    if (!sourceInside || !targetInside) continue;
    links.push({ source: sourceId, target: targetId });
    const list = backlinksById.get(targetId) ?? [];
    list.push({ source: sourceId, target: targetId, line: link.line });
    backlinksById.set(targetId, list);
  }

  let droppedExternalRelations = 0;
  const relationsById = new Map<string, AuthoredRelation[]>();
  const relationBacklinksById = new Map<string, AuthoredRelation[]>();
  for (const relation of analysis.authoredRelations) {
    const sourceInside = selectedIds.has(relation.source);
    const targetInside = selectedIds.has(relation.target);
    if (sourceInside && !targetInside) droppedExternalRelations += 1;
    if (!sourceInside || !targetInside) continue;
    const outbound = relationsById.get(relation.source) ?? [];
    outbound.push(relation);
    relationsById.set(relation.source, outbound);
    const inbound = relationBacklinksById.get(relation.target) ?? [];
    inbound.push(relation);
    relationBacklinksById.set(relation.target, inbound);
  }

  const attachmentsById = new Map<string, readonly LocalAttachmentReference[]>();
  for (const note of selected) {
    const parsed = parseLocalAttachmentReferences(note.path, note.content);
    if (parsed.references.length > 0) attachmentsById.set(note.id, parsed.references);
  }

  const descriptor: WordcellSiteSelectionV1 = {
    includes,
    excludes,
    ...(input.from === undefined
      ? {}
      : {
          from: Object.freeze({
            note: input.from.note,
            depth: input.from.depth,
            direction: input.from.direction,
          }),
        }),
    filterCount: filters.length,
    tagCount: tags.length,
    scopeCount: repositoryScopes.length,
  };

  return {
    notes: selected,
    slugById,
    selected: selectedIds,
    links,
    backlinksById,
    relationsById,
    relationBacklinksById,
    attachmentsById,
    excludedPrivate,
    excludedBySelection,
    droppedExternalLinks,
    droppedExternalRelations,
    descriptor,
  };
}
