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
export const MAX_PUBLISH_FROM_NOTES = 1_000;
export const MAX_PUBLISH_SELECTOR_BYTES = 1_024;
export const MAX_PUBLISH_SLUG_BYTES = 1_024;

/**
 * Include prefixes/globs, the combined metadata query, and a `--from`
 * neighborhood form a union. Excludes and the authored
 * `publish: false` flag then carve notes back out. Selection never reads
 * note bodies; a selected note's prose can still mention excluded ids, so the
 * boundary is graph and metadata presence, not text redaction.
 */
export type PublishSelectionInput = {
  readonly includes?: readonly string[];
  readonly excludes?: readonly string[];
  /** Case-sensitive globs over note ids or Markdown paths; * and ? stay in a segment. */
  readonly includeGlobs?: readonly string[];
  readonly excludeGlobs?: readonly string[];
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
  /** Manifest counts of the selectors; their raw values stay local. */
  readonly descriptor: WordcellSiteSelectionV1;
};

function normalizeSelectorPrefix(value: string, flag: string): string {
  const trimmed = value.trim().replaceAll("\\", "/");
  if (trimmed === "" || Buffer.byteLength(trimmed, "utf8") > MAX_PUBLISH_SELECTOR_BYTES || /[\u0000-\u001f\u007f]/u.test(trimmed)) {
    throw new TypeError(`${flag} must be bounded text without control characters`);
  }
  const normalized = posix.normalize(trimmed).replace(/^\.\//u, "").replace(/\/+$/u, "");
  if (
    normalized === ""
    || trimmed.split("/").includes("..")
    || /^[a-z]:\//iu.test(normalized)
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
    prefix === "."
    || id === prefix
    || id.startsWith(`${prefix}/`)
    || (prefix.endsWith(".md") && id === prefix.slice(0, -3)));
}

/** Small glob grammar with bounded work and no filesystem traversal. */
function publishGlob(value: string, flag: string): readonly string[] {
  const pattern = value.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
  const segments = pattern.split("/");
  if (
    pattern === "" || /^[a-z]:\//iu.test(pattern)
    || Buffer.byteLength(pattern, "utf8") > MAX_PUBLISH_SELECTOR_BYTES
    || /[\u0000-\u001f\u007f\[\]{}]/u.test(pattern)
    || segments.some((segment) => segment === "" || segment === "." || segment === ".."
      || (segment.includes("**") && segment !== "**"))
  ) {
    throw new TypeError(`${flag} must be a vault-relative glob using *, ?, or whole-segment **`);
  }
  return segments;
}

function wildcardSegment(pattern: string, value: string): boolean {
  const tokens = Array.from(pattern);
  const characters = Array.from(value);
  let previous = new Uint8Array(characters.length + 1);
  previous[0] = 1;
  for (const token of tokens) {
    const current = new Uint8Array(characters.length + 1);
    if (token === "*") current[0] = previous[0] ?? 0;
    for (let index = 1; index <= characters.length; index += 1) {
      current[index] = token === "*"
        ? (previous[index] || current[index - 1] ? 1 : 0)
        : (previous[index - 1] && (token === "?" || token === characters[index - 1]) ? 1 : 0);
    }
    previous = current;
  }
  return previous[characters.length] === 1;
}

function globMatches(pattern: readonly string[], path: string): boolean {
  const segments = path.split("/");
  let previous = new Uint8Array(segments.length + 1);
  previous[0] = 1;
  for (const token of pattern) {
    const current = new Uint8Array(segments.length + 1);
    if (token === "**") current[0] = previous[0] ?? 0;
    for (let index = 1; index <= segments.length; index += 1) {
      current[index] = token === "**"
        ? (previous[index] || current[index - 1] ? 1 : 0)
        : (previous[index - 1] && wildcardSegment(token, segments[index - 1] ?? "") ? 1 : 0);
    }
    previous = current;
  }
  return previous[segments.length] === 1;
}

function selectorGlobs(patterns: readonly (readonly string[])[], note: Note): boolean {
  return patterns.some((pattern) => globMatches(pattern, note.id) || globMatches(pattern, note.path));
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
  const selectorCount = (input.includes?.length ?? 0) + (input.excludes?.length ?? 0)
    + (input.includeGlobs?.length ?? 0) + (input.excludeGlobs?.length ?? 0);
  if (selectorCount > MAX_PUBLISH_SELECTORS) {
    throw new RangeError(`Publish selectors may contain at most ${MAX_PUBLISH_SELECTORS} entries.`);
  }
  const includes = (input.includes ?? []).map((value) =>
    normalizeSelectorPrefix(value, "--include"));
  const excludes = (input.excludes ?? []).map((value) =>
    normalizeSelectorPrefix(value, "--exclude"));
  const includeGlobs = (input.includeGlobs ?? []).map((value) => publishGlob(value, "--include-glob"));
  const excludeGlobs = (input.excludeGlobs ?? []).map((value) => publishGlob(value, "--exclude-glob"));
  const filters = input.filters ?? [];
  const tags = input.tags ?? [];
  const repositoryScopes = input.repositoryScopes ?? [];

  const candidates = new Set<string>();
  const hasPositive = includes.length > 0
    || includeGlobs.length > 0
    || filters.length > 0
    || tags.length > 0
    || repositoryScopes.length > 0
    || input.from !== undefined;

  for (const note of notes) {
    if (selectorIncludes(includes, note.id) || selectorGlobs(includeGlobs, note)) candidates.add(note.id);
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
      limit: MAX_PUBLISH_FROM_NOTES,
    });
    if (neighborhood.truncated) {
      throw new RangeError(`Publish neighborhood exceeds the ${MAX_PUBLISH_FROM_NOTES}-note or connection limit; narrow --depth or select explicit paths instead.`);
    }
    for (const node of neighborhood.nodes) candidates.add(node.id);
  }

  let excludedPrivate = 0;
  let excludedBySelection = 0;
  const selected: Note[] = [];
  for (const note of notes) {
    const chosen = hasPositive ? candidates.has(note.id) : true;
    const excluded = selectorIncludes(excludes, note.id) || selectorGlobs(excludeGlobs, note);
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
    // Raw selectors can identify private paths and metadata; publish counts only.
    includes: [],
    excludes: [],
    includeCount: includes.length,
    excludeCount: excludes.length,
    includeGlobCount: includeGlobs.length,
    excludeGlobCount: excludeGlobs.length,
    fromCount: input.from === undefined ? 0 : 1,
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
