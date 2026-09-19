import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";

import { canonicalJson, canonicalSha256 } from "@hraness/oh";

import {
  validateMarkdownAttachments,
} from "./attachments.js";
import { findKbPackageRoot } from "./clip/package-root.js";
import {
  lookupNote,
  normalizeVaultPath,
  type Note,
} from "./graph.js";
import { buildSiteIndex } from "./publish-index.js";
import {
  renderMarkdownToHtml,
  type PublishRenderContext,
} from "./publish-markdown.js";
import {
  parseSiteCatalogV1,
  parseSiteDocsV1,
  parseSiteGraphV1,
  parseSiteManifestV1,
  parseSiteNoteV1,
  parseSitePostingsV1,
  parseSiteTermsV1,
  WORDCELL_SITE_CATALOG_FORMAT_V1,
  WORDCELL_SITE_FORMAT_V1,
  WORDCELL_SITE_GRAPH_FORMAT_V1,
  WORDCELL_SITE_LIMITS_V1,
  WORDCELL_SITE_NOTE_FORMAT_V1,
  type WordcellPublishReport,
  type WordcellSiteCatalogV1,
  type WordcellSiteGraphEdgeV1,
  type WordcellSiteManifestV1,
  type WordcellSiteNoteLinkV1,
  type WordcellSiteNoteRelationV1,
  type WordcellSiteNoteV1,
} from "./publish-model.js";
import { siteNavFromCatalog } from "./publish-nav.js";
import {
  renderGraphPage,
  renderLandingPage,
  renderNotFoundPage,
  renderNotePage,
  renderRobotsTxt,
  renderSitemapXml,
  relativePrefix,
  type PageContext,
} from "./publish-pages.js";
import {
  publishAssetTarget,
  selectPublishNotes,
  type PublishSelection,
  type PublishSelectionInput,
} from "./publish-select.js";
import { publishNormalize } from "./publish-search.js";
import { scanVault, type VaultSnapshot } from "./vault.js";

export const WORDCELL_PUBLISH_GENERATOR = "@hraness/wordcell" as const;

/** Canonical serialization for every artifact file in the contract. */
export function serializeSiteFile(value: unknown): string {
  return `${canonicalJson(value)}\n`;
}

/** Admit generated JSON under the same contract the reader uses, before writes. */
function setSiteJson(
  files: Map<string, Uint8Array>,
  path: string,
  value: unknown,
  parse: (input: unknown) => unknown,
): void {
  try {
    parse(value);
  } catch (error: unknown) {
    throw new Error(`Cannot publish ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  files.set(path, encodeUtf8(serializeSiteFile(value)));
}

export type PublishOptions = {
  /** Vault root (the CLI defaults it to the working directory). */
  readonly root: string;
  /** Output directory for the emitted site. */
  readonly out: string;
  /** Vault-relative index note path when the vault overrides the default. */
  readonly index?: string;
  readonly title?: string;
  readonly description?: string;
  /** URL path prefix the site is served under (default "/"). */
  readonly basePath?: string;
  /** Absolute site origin used for the sitemap. */
  readonly baseUrl?: string;
  /** Emit robots disallow and noindex markers when true. */
  readonly noindex?: boolean;
  /** Disable the content index (fields-only search). */
  readonly indexContent?: boolean;
  /** Omit generatedAt for reproducible artifacts. */
  readonly deterministic?: boolean;
  /** Return the plan and file set without writing to disk. */
  readonly dryRun?: boolean;
  /** Maximum selected ids in the report, default 20; never changes the selection. */
  readonly listLimit?: number;
  /** Replace an existing non-empty output directory. */
  readonly force?: boolean;
  readonly selection?: PublishSelectionInput;
  readonly now?: () => Date;
};

export type PublishProjection = {
  /** Site-relative path → file bytes in deterministic path order. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly manifest: WordcellSiteManifestV1;
  readonly report: WordcellPublishReport;
};

/**
 * Filesystem seam for projection. `resolveAssetPath` maps one decoded
 * attachment target to a vault-relative file path; `readAsset` supplies its
 * bytes. Both are injectable so tests drive the projection without disk.
 */
export type PublishIo = {
  readonly resolveAssetPath: (source: string, target: string) => string | undefined;
  readonly readAsset: (path: string) => Promise<Uint8Array | undefined>;
  readonly readerFiles?: () => Promise<ReadonlyMap<string, Uint8Array>>;
  readonly version?: string;
};

const SITE_PATHS = Object.freeze({
  catalog: "catalog.json",
  graph: "graph.json",
  docs: "index/docs.json",
  terms: "index/terms.json",
  postingsPrefix: "index/c/",
  notePrefix: "n/",
  assetPrefix: "assets/",
  readerPrefix: "reader/",
});

/** Whole-artifact write budget; separate from per-asset and corpus bounds. */
export const MAX_SITE_BYTES = 1_024 * 1_024 * 1_024;
export const DEFAULT_PUBLISH_LIST_LIMIT = 20;
export const MAX_PUBLISH_LIST_LIMIT = 1_000;
export const MAX_PUBLISH_LIST_BYTES = 16_384;

function publishListLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_PUBLISH_LIST_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_PUBLISH_LIST_LIMIT) {
    throw new RangeError(`--list-limit must be an integer from 0 through ${MAX_PUBLISH_LIST_LIMIT}`);
  }
  return limit;
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeBasePath(input: string | undefined): string {
  const raw = (input ?? "/").trim();
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
}

function normalizeBaseUrl(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`--base-url must be an absolute http(s) URL, got ${JSON.stringify(input)}.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`--base-url must use http or https, got ${url.protocol}.`);
  }
  return url.toString().replace(/\/+$/u, "");
}

function boundedNormalized(text: string, maximumBytes: number): {
  readonly text: string;
  readonly truncated: boolean;
} {
  const normalized = publishNormalize(text);
  if (Buffer.byteLength(normalized, "utf8") <= maximumBytes) {
    return { text: normalized, truncated: false };
  }
  const bytes = Buffer.from(normalized, "utf8");
  let end = maximumBytes;
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return { text: bytes.subarray(0, end).toString("utf8"), truncated: true };
}

/**
 * Project a scanned vault into the `hraness.wordcell.site.v1` file set.
 * Selection is resolved first; excluded notes do not enter structured output.
 * Selected prose and attachments are published as authored, without redaction.
 */
export async function projectVault(
  snapshot: Pick<VaultSnapshot, "root" | "notes" | "analysis">,
  options: Omit<PublishOptions, "out" | "dryRun" | "force">,
  io: PublishIo,
): Promise<PublishProjection> {
  const listLimit = publishListLimit(options.listLimit);
  const selection = selectPublishNotes(snapshot.notes, snapshot.analysis, options.selection ?? {});
  if (selection.notes.length > WORDCELL_SITE_LIMITS_V1.notes) {
    throw new RangeError(
      `Publish selection exceeds the ${WORDCELL_SITE_LIMITS_V1.notes}-note contract limit.`,
    );
  }

  const noteById = new Map(selection.notes.map((note) => [note.id, note]));
  const slugFor = (id: string): string => {
    const slug = selection.slugById.get(id);
    if (slug === undefined) throw new Error(`Selected note ${id} has no slug.`);
    return slug;
  };

  // Resolve the attachment closure: only targets referenced by selected notes,
  // only paths the resolver can prove stay inside the vault.
  const assetByPath = new Map<string, { readonly name: string; readonly bytes: Uint8Array }>();
  let assetsSkipped = 0;
  let assetsTruncated = false;
  for (const note of selection.notes) {
    const refs = selection.attachmentsById.get(note.id) ?? [];
    for (const ref of refs) {
      const path = io.resolveAssetPath(note.path, ref.target);
      if (path === undefined || assetByPath.has(path)) continue;
      if (assetByPath.size >= WORDCELL_SITE_LIMITS_V1.assets) {
        assetsTruncated = true;
        continue;
      }
      const bytes = await io.readAsset(path);
      if (bytes === undefined || bytes.byteLength > WORDCELL_SITE_LIMITS_V1.assetBytes) {
        assetsSkipped += 1;
        continue;
      }
      const hash = sha256Hex(bytes).slice(0, 16);
      const dot = path.lastIndexOf(".");
      const extension = dot === -1 ? "bin" : path.slice(dot + 1).toLowerCase();
      assetByPath.set(path, { name: `${hash}.${extension}`, bytes });
    }
  }

  const linkEntries = (links: readonly { source: string; target: string }[], id: string, key: "source" | "target"): WordcellSiteNoteLinkV1[] =>
    links
      .filter((link) => link[key] === id)
      .map((link) => {
        const other = key === "source" ? link.target : link.source;
        const note = noteById.get(other);
        return note === undefined
          ? undefined
          : { s: slugFor(note.id), t: note.title };
      })
      .filter((entry): entry is WordcellSiteNoteLinkV1 => entry !== undefined)
      .toSorted((a, b) => a.s.localeCompare(b.s) || a.t.localeCompare(b.t));

  const relationEntries = (
    relations: readonly { source: string; target: string; predicate: string }[],
    id: string,
    key: "source" | "target",
  ): WordcellSiteNoteRelationV1[] =>
    relations
      .filter((relation) => relation[key] === id)
      .map((relation) => {
        const other = key === "source" ? relation.target : relation.source;
        const note = noteById.get(other);
        return note === undefined
          ? undefined
          : { p: relation.predicate, s: slugFor(note.id), t: note.title };
      })
      .filter((entry): entry is WordcellSiteNoteRelationV1 => entry !== undefined)
      .toSorted((a, b) => a.s.localeCompare(b.s) || a.p.localeCompare(b.p) || a.t.localeCompare(b.t));

  // Pass one: payloads (link panels) for every selected note.
  const payloadBySlug = new Map<string, WordcellSiteNoteV1>();
  let anyTextTruncated = false;
  for (const note of selection.notes) {
    const slug = slugFor(note.id);
    const text = boundedNormalized(note.searchableText, WORDCELL_SITE_LIMITS_V1.noteTextBytes);
    anyTextTruncated ||= text.truncated;
    const payload: WordcellSiteNoteV1 = {
      format: WORDCELL_SITE_NOTE_FORMAT_V1,
      id: note.id,
      slug,
      title: note.title,
      aliases: note.aliases,
      ...(typeof note.metadata["type"] === "string" && note.metadata["type"] !== ""
        ? { type: note.metadata["type"] }
        : {}),
      tags: note.tags,
      summary: note.summary,
      text: text.text,
      textTruncated: text.truncated,
      links: linkEntries(selection.links, note.id, "source"),
      backlinks: linkEntries(selection.links, note.id, "target"),
      relations: relationEntries(selection.relationsById.get(note.id) ?? [], note.id, "source"),
      relationBacklinks: relationEntries(
        selection.relationBacklinksById.get(note.id) ?? [],
        note.id,
        "target",
      ),
    };
    payloadBySlug.set(slug, payload);
  }

  const resolveNote = (source: Note) => (rawTarget: string) => {
    if (rawTarget === "") return undefined;
    const found = lookupNote(selection.notes, rawTarget);
    const note = found.kind === "found"
      ? found.note
      : rawTarget.startsWith(".")
        ? (() => {
            const joined = normalizeVaultPath(posix.join(posix.dirname(source.path), rawTarget));
            const retry = lookupNote(selection.notes, joined);
            return retry.kind === "found" ? retry.note : undefined;
          })()
        : undefined;
    return note === undefined ? undefined : { slug: slugFor(note.id), title: note.title };
  };

  // Pass two: render bodies, then pages (page asides need all payloads).
  const bodyBySlug = new Map<string, string>();
  for (const note of selection.notes) {
    const slug = slugFor(note.id);
    const rel = relativePrefix(slug);
    const ctx: PublishRenderContext = {
      source: note.path,
      resolveNote: resolveNote(note),
      resolveAsset: (rawTarget, from) => {
        const decoded = publishAssetTarget(rawTarget);
        if (decoded === undefined) return undefined;
        const path = io.resolveAssetPath(from, decoded);
        if (path === undefined) return undefined;
        const asset = assetByPath.get(path);
        return asset === undefined ? undefined : `${rel}${SITE_PATHS.assetPrefix}${asset.name}`;
      },
      noteHref: (slugTarget) => (slugTarget === "" ? rel || "./" : `${rel}n/${encodeURI(slugTarget)}/`),
    };
    bodyBySlug.set(slug, renderMarkdownToHtml(note.content, ctx));
  }

  const site = {
    title: options.title?.trim() || basename(resolve(snapshot.root)) || "Vault",
    basePath: normalizeBasePath(options.basePath),
    ...(options.description === undefined ? {} : { description: options.description }),
  };
  const noindex = options.noindex === true;

  const catalog: WordcellSiteCatalogV1 = {
    format: WORDCELL_SITE_CATALOG_FORMAT_V1,
    entries: selection.notes.map((note, index) => ({
      i: index,
      s: slugFor(note.id),
      t: note.title,
      ...(typeof note.metadata["type"] === "string" && note.metadata["type"] !== ""
        ? { type: note.metadata["type"] }
        : {}),
      ...(note.tags.length === 0 ? {} : { g: note.tags }),
    })),
  };
  const nav = siteNavFromCatalog(catalog.entries);
  const titles = new Map(catalog.entries.map((entry) => [entry.s, entry.t]));

  const edgeIndexById = new Map(selection.notes.map((note, index) => [note.id, index]));
  const rawEdges: WordcellSiteGraphEdgeV1[] = [
    ...selection.links.map((link) => ({
      s: edgeIndexById.get(link.source) ?? -1,
      t: edgeIndexById.get(link.target) ?? -1,
      k: "link" as const,
    })),
    ...selection.notes.flatMap((note) =>
      (selection.relationsById.get(note.id) ?? []).map((relation) => ({
        s: edgeIndexById.get(relation.source) ?? -1,
        t: edgeIndexById.get(relation.target) ?? -1,
        k: "relation" as const,
        p: relation.predicate,
      }))),
  ];
  const edges = rawEdges
    .filter((edge) => edge.s >= 0 && edge.t >= 0)
    .toSorted((a, b) => a.s - b.s || a.t - b.t || a.k.localeCompare(b.k) || (a.p ?? "").localeCompare(b.p ?? ""));

  const files = new Map<string, Uint8Array>();
  for (const note of selection.notes) {
    const slug = slugFor(note.id);
    if (slug !== "") {
      setSiteJson(files, `n/${slug}.json`, payloadBySlug.get(slug), parseSiteNoteV1);
      const ctx: PageContext = {
        site,
        rel: relativePrefix(slug),
        noindex,
        generator: WORDCELL_PUBLISH_GENERATOR,
        nav,
        current: slug,
        titles,
      };
      const payload = payloadBySlug.get(slug);
      if (payload === undefined) throw new Error(`Missing payload for ${slug}.`);
      files.set(
        `n/${slug}/index.html`,
        encodeUtf8(renderNotePage(
          note,
          bodyBySlug.get(slug) ?? "",
          {
            links: payload.links,
            backlinks: payload.backlinks,
            relations: payload.relations,
            relationBacklinks: payload.relationBacklinks,
          },
          ctx,
        )),
      );
    }
  }
  const indexPayload = payloadBySlug.get("");
  if (indexPayload !== undefined) {
    setSiteJson(files, "index.json", indexPayload, parseSiteNoteV1);
  }

  const landingCtx: PageContext = {
    site,
    rel: "",
    noindex,
    generator: WORDCELL_PUBLISH_GENERATOR,
    nav,
    current: "",
    titles,
  };
  files.set("index.html", encodeUtf8(renderLandingPage(
    indexPayload === undefined ? undefined : bodyBySlug.get(""),
    catalog.entries,
    landingCtx,
  )));
  files.set("graph/index.html", encodeUtf8(renderGraphPage(
    catalog.entries,
    edges.length,
    { ...landingCtx, rel: "../" },
  )));
  files.set("404.html", encodeUtf8(renderNotFoundPage(landingCtx)));
  files.set("robots.txt", encodeUtf8(renderRobotsTxt(noindex)));

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (baseUrl !== undefined) {
    const slugs = selection.notes.map((note) => slugFor(note.id));
    files.set("sitemap.xml", encodeUtf8(renderSitemapXml(
      slugs,
      `${baseUrl}${site.basePath === "/" ? "" : site.basePath.replace(/\/$/u, "")}`,
    )));
  }

  setSiteJson(files, SITE_PATHS.catalog, catalog, parseSiteCatalogV1);

  const index = buildSiteIndex(selection.notes, selection.slugById, {
    ...(options.indexContent === undefined ? {} : { indexContent: options.indexContent }),
  });
  setSiteJson(files, SITE_PATHS.docs, index.docs, parseSiteDocsV1);
  setSiteJson(files, SITE_PATHS.terms, index.terms, parseSiteTermsV1);
  for (const [shard, postings] of index.postings) {
    setSiteJson(files, `${SITE_PATHS.postingsPrefix}${shard}.json`, postings, parseSitePostingsV1);
  }

  setSiteJson(files, SITE_PATHS.graph, {
    format: WORDCELL_SITE_GRAPH_FORMAT_V1,
    edges,
  }, parseSiteGraphV1);

  for (const [path, asset] of [...assetByPath.entries()].toSorted(([a], [b]) =>
    a.localeCompare(b))) {
    files.set(`${SITE_PATHS.assetPrefix}${asset.name}`, asset.bytes);
    void path;
  }

  const reader = io.readerFiles === undefined
    ? await defaultReaderFiles()
    : await io.readerFiles();
  for (const [name, bytes] of reader) files.set(`${SITE_PATHS.readerPrefix}${name}`, bytes);

  const generatedAt = (options.now ?? (() => new Date()))();
  const digest = canonicalSha256({
    format: "hraness.wordcell.site-source.v1",
    notes: selection.notes.map((note) => ({
      id: note.id,
      slug: slugFor(note.id),
      sha256: sha256Hex(encodeUtf8(note.content)),
    })),
  });

  let totalBytes = 0;
  let assetBytes = 0;
  for (const [path, bytes] of files) {
    totalBytes += bytes.byteLength;
    if (path.startsWith(SITE_PATHS.assetPrefix)) assetBytes += bytes.byteLength;
  }
  if (assetBytes > WORDCELL_SITE_LIMITS_V1.totalAssetBytes) {
    throw new RangeError(
      `Published attachments exceed the ${WORDCELL_SITE_LIMITS_V1.totalAssetBytes}-byte budget.`,
    );
  }
  if (totalBytes > MAX_SITE_BYTES) {
    throw new RangeError(`Published site exceeds the ${MAX_SITE_BYTES}-byte artifact budget.`);
  }

  const truncated = {
    ...(index.termsTruncated ? { terms: true as const } : {}),
    ...(index.textTruncated || anyTextTruncated ? { text: true as const } : {}),
    ...(assetsTruncated ? { assets: true as const } : {}),
  };

  const manifest: WordcellSiteManifestV1 = {
    format: WORDCELL_SITE_FORMAT_V1,
    site,
    generated: {
      by: WORDCELL_PUBLISH_GENERATOR,
      version: io.version ?? "0.0.0-dev",
      ...(options.deterministic === true ? {} : { at: generatedAt.toISOString() }),
    },
    source: {
      selection: selection.descriptor as Readonly<Record<string, unknown>>,
      notes: selection.notes.length,
      digest: `sha256:${digest}`,
    },
    paths: SITE_PATHS,
    search: {
      mode: "exact",
      content: index.mode,
      shards: index.postings.size,
      hash: "fnv1a32-8bit",
    },
    counts: {
      notes: selection.notes.length,
      assets: assetByPath.size,
      bytes: totalBytes,
    },
    truncated,
  };
  setSiteJson(files, "manifest.json", manifest, parseSiteManifestV1);
  const ordered = new Map(
    [...files.entries()].toSorted(([a], [b]) => a.localeCompare(b)),
  );

  const listedIds: string[] = [];
  let listedBytes = 0;
  for (const note of selection.notes) {
    const bytes = Buffer.byteLength(note.id, "utf8");
    if (listedIds.length >= listLimit || listedBytes + bytes > MAX_PUBLISH_LIST_BYTES) break;
    listedIds.push(note.id);
    listedBytes += bytes;
  }

  const report: WordcellPublishReport = {
    format: WORDCELL_SITE_FORMAT_V1,
    out: "",
    deterministic: options.deterministic === true,
    selection: {
      ids: listedIds,
      total: selection.notes.length,
      truncated: listedIds.length < selection.notes.length,
      digest: manifest.source.digest,
    },
    files: ordered.size,
    bytes: totalBytes,
    notes: {
      published: selection.notes.length,
      excludedPrivate: selection.excludedPrivate,
      excludedBySelection: selection.excludedBySelection,
    },
    links: {
      kept: selection.links.length,
      droppedExternal: selection.droppedExternalLinks + selection.droppedExternalRelations,
    },
    assets: {
      count: assetByPath.size,
      bytes: assetBytes,
      skipped: assetsSkipped,
    },
    search: {
      content: index.mode,
      terms: index.termsCount,
      truncated: index.termsTruncated || index.textTruncated,
    },
  };

  return { files: ordered, manifest, report };
}

function withinRoot(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

/** Resolve missing output suffixes against the nearest existing real directory. */
async function canonicalOutputPath(path: string): Promise<string> {
  let ancestor = path;
  const suffix: string[] = [];
  for (;;) {
    try {
      const stat = await lstat(ancestor);
      if (ancestor === path && stat.isSymbolicLink()) {
        throw new Error("--out must not be a symbolic link.");
      }
      return resolve(await realpath(ancestor), ...suffix);
    } catch (error: unknown) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      suffix.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
}

function assertSeparateOutput(root: string, out: string): void {
  if (withinRoot(root, out)) {
    throw new Error("--out must not be the vault root or a directory inside it.");
  }
  if (withinRoot(out, root)) {
    throw new Error("--out must not contain the vault root; replacement would delete the vault.");
  }
}

const READER_FILES = ["reader.js", "reader.css", "theme.js"] as const;

async function defaultReaderFiles(): Promise<Map<string, Uint8Array>> {
  const packageRoot = findKbPackageRoot();
  const files = new Map<string, Uint8Array>();
  for (const name of READER_FILES) {
    for (const candidate of [
      `${packageRoot}/dist/publish-reader/${name}`,
      `${packageRoot}/src/publish-reader/${name}`,
    ]) {
      try {
        files.set(name, new Uint8Array(await readFile(candidate)));
        break;
      } catch {
        continue;
      }
    }
  }
  return files;
}

async function defaultVersion(): Promise<string> {
  try {
    const manifest: unknown = JSON.parse(
      await readFile(`${findKbPackageRoot()}/package.json`, "utf8"),
    );
    if (
      typeof manifest === "object" && manifest !== null
      && "version" in manifest && typeof manifest.version === "string"
    ) {
      return manifest.version;
    }
  } catch {
    // Fall through to the development placeholder.
  }
  return "0.0.0-dev";
}

/**
 * Publish a vault on disk to a static site directory. `dryRun: true` returns
 * the plan and projected file set without touching the output directory.
 */
export async function publishVault(
  options: PublishOptions,
): Promise<PublishProjection & { readonly out: string }> {
  publishListLimit(options.listLimit);
  const requestedRoot = resolve(options.root);
  const requestedOut = resolve(options.out);
  assertSeparateOutput(requestedRoot, requestedOut);
  const resolvedRoot = await realpath(requestedRoot);
  const out = await canonicalOutputPath(requestedOut);
  assertSeparateOutput(resolvedRoot, out);

  const snapshot = await scanVault(resolvedRoot, {
    mentionScope: false,
    ...(options.index === undefined ? {} : { index: options.index }),
  });
  const selection = selectPublishNotes(snapshot.notes, snapshot.analysis, options.selection ?? {});
  if (selection.notes.length === 0 && !options.dryRun) {
    throw new Error("Publish selection is empty; check the selectors with --dry-run before replacing output.");
  }

  // Validate attachments once against the real filesystem, over selected
  // documents only; the resolver then answers lookups from memory.
  const validation = await validateMarkdownAttachments({
    root: resolvedRoot,
    documents: selection.notes.map((note) => ({ path: note.path, content: note.content })),
  });
  const resolvedByRef = new Map<string, string>();
  for (const attachment of validation.attachments) {
    resolvedByRef.set(`${attachment.source}\0${attachment.target}`, attachment.path);
  }
  const missing = new Set(
    validation.issues
      .filter((issue) => issue.kind === "missing" || issue.kind === "ambiguous"
        || issue.kind === "case-mismatch" || issue.kind === "case-collision")
      .map((issue) => `${issue.source}\0${issue.target}`),
  );

  const io: PublishIo = {
    resolveAssetPath: (source, target) => {
      const key = `${source}\0${target}`;
      if (missing.has(key)) return undefined;
      return resolvedByRef.get(key);
    },
    readAsset: async (path) => {
      const absolute = resolve(resolvedRoot, path);
      if (!withinRoot(resolvedRoot, absolute)) return undefined;
      let stat;
      try {
        stat = await lstat(absolute);
      } catch {
        return undefined;
      }
      if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
      if (stat.size > WORDCELL_SITE_LIMITS_V1.assetBytes) return undefined;
      return new Uint8Array(await readFile(absolute));
    },
    version: await defaultVersion(),
  };

  const projection = await projectVault(snapshot, options, io);
  const report = { ...projection.report, out };

  if (!options.dryRun) {
    assertSeparateOutput(await realpath(resolvedRoot), await canonicalOutputPath(out));
    let stat;
    try {
      stat = await lstat(out);
    } catch {
      stat = undefined;
    }
    if (stat !== undefined) {
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`--out ${options.out} exists and is not a directory.`);
      }
      if ((await readdir(out)).length > 0) {
        if (options.force !== true) {
          throw new Error(`--out ${options.out} is not empty (pass --force to overwrite).`);
        }
        await rm(out, { recursive: true });
        await mkdir(out, { recursive: true });
      }
    } else {
      await mkdir(out, { recursive: true });
    }
    for (const [path, bytes] of projection.files) {
      const absolute = resolve(out, path);
      if (!withinRoot(out, absolute)) {
        throw new Error(`Refusing to write outside --out: ${path}`);
      }
      await mkdir(resolve(out, posix.dirname(path)), { recursive: true });
      await writeFile(absolute, bytes);
    }
  }

  return { ...projection, report, out };
}

export function renderPublishReportText(
  report: WordcellPublishReport,
  dryRun: boolean,
): string {
  const lines = [
    `${dryRun ? "Publish plan" : "Published"} ${report.notes.published} note${report.notes.published === 1 ? "" : "s"}`
      + `${report.out === "" ? "" : ` → ${report.out}`}`,
    `  bytes: ${report.bytes.toLocaleString("en-US")} across ${report.files} files`,
    `  attachments: ${report.assets.count} copied, ${report.assets.skipped} skipped`,
    `  links: ${report.links.kept} kept, ${report.links.droppedExternal} dropped (targets outside the selection)`,
    `  excluded: ${report.notes.excludedPrivate} private, ${report.notes.excludedBySelection} by selection`,
    `  search: ${report.search.content} content index, ${report.search.terms.toLocaleString("en-US")} terms`,
  ];
  if (report.selection.ids.length > 0) {
    lines.push(`  selected ids: ${report.selection.ids.join(", ")}`);
  }
  if (report.selection.truncated) {
    lines.push(`  selected ids shown: ${report.selection.ids.length} of ${report.selection.total} (use --list-limit to change the report bound)`);
  }
  lines.push(`  source: ${report.selection.digest}`);
  if (report.search.truncated) {
    lines.push("  warning: search index truncated at contract limits");
  }
  return `${lines.join("\n")}\n`;
}

export type { PublishSelection, PublishSelectionInput };
