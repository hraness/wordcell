import { stripMarkup } from "./publish-markdown.js";
import type { WordcellSiteCatalogEntryV1 } from "./publish-model.js";

/**
 * Navigation derivation for published sites: the sidebar tree, breadcrumbs,
 * and the per-note table of contents. Everything here is pure data — page
 * chrome renders it to static HTML that works without JavaScript, and the
 * bundled reader never needs it.
 *
 * The tree is built over catalog slugs (the site-facing path hierarchy), not
 * note ids, so what the sidebar shows is exactly what the URL space serves.
 * Deterministic order: directory groups sort before leaves at each level, then
 * code-unit order by label and path — no locale-dependent collation.
 */

export type SiteNavNode = {
  /** Slug path at this level; equals `slug` when a note owns the path. */
  readonly path: string;
  /** Note slug when a published note sits at this path. */
  readonly slug?: string;
  /** Note title for owned paths, otherwise the raw directory segment. */
  readonly label: string;
  readonly children: readonly SiteNavNode[];
  /** Direct children dropped by pruning, rendered as a "+N more" link. */
  readonly hiddenChildren?: number;
};

export type SiteNavTree = {
  readonly nodes: readonly SiteNavNode[];
  /** Top-level nodes dropped by pruning. */
  readonly hiddenRoots: number;
};

export const SITE_NAV_GROUP_LIMIT = 96;
export const SITE_NAV_NODE_BUDGET = 768;
export const SITE_TOC_LIMIT = 128;

type MutableNavNode = {
  path: string;
  slug?: string;
  label: string;
  children: Map<string, MutableNavNode>;
};

function compareNavNodes(left: SiteNavNode, right: SiteNavNode): number {
  return Number(right.children.length > 0) - Number(left.children.length > 0)
    || (left.label < right.label ? -1 : left.label > right.label ? 1 : 0)
    || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

/** Build the publication navigation tree from catalog entries. */
export function siteNavFromCatalog(
  entries: readonly WordcellSiteCatalogEntryV1[],
): SiteNavTree {
  const root = new Map<string, MutableNavNode>();
  for (const entry of entries) {
    // The vault index note owns the site root and never appears in the tree.
    if (entry.s === "") continue;
    const segments = entry.s.split("/");
    let level = root;
    let path = "";
    for (const [index, segment] of segments.entries()) {
      path = path === "" ? segment : `${path}/${segment}`;
      let node = level.get(segment);
      if (node === undefined) {
        node = { path, label: segment, children: new Map() };
        level.set(segment, node);
      }
      if (index === segments.length - 1) {
        node.slug = entry.s;
        node.label = entry.t;
      }
      level = node.children;
    }
  }
  const freeze = (level: Map<string, MutableNavNode>): SiteNavNode[] =>
    [...level.values()]
      .map((node): SiteNavNode => ({
        path: node.path,
        ...(node.slug === undefined ? {} : { slug: node.slug }),
        label: node.label,
        children: freeze(node.children),
      }))
      .toSorted(compareNavNodes);
  return { nodes: freeze(root), hiddenRoots: 0 };
}

/**
 * Bound the tree emitted into each page. Kept nodes are shallow (depth ≤ 2),
 * on the current path, descendants of current, or siblings of a current
 * ancestor — everything else folds into per-group "+N more" links back to the
 * catalog. A global node budget additionally bounds pathological breadth while
 * always preserving the current path's ancestor chain.
 */
export function pruneSiteNav(
  tree: SiteNavTree,
  current: string | undefined,
  groupLimit = SITE_NAV_GROUP_LIMIT,
  nodeBudget = SITE_NAV_NODE_BUDGET,
): SiteNavTree {
  const onPath = (path: string): boolean =>
    current !== undefined && current !== ""
    && (path === current || current.startsWith(`${path}/`));
  const nearCurrent = (path: string): boolean =>
    current !== undefined && current !== ""
    && (path === current
      || current.startsWith(`${path}/`)
      || path.startsWith(`${current}/`));
  const keepNode = (node: SiteNavNode): boolean => {
    if (node.path.split("/").length <= 2) return true;
    if (nearCurrent(node.path)) return true;
    const parent = node.path.slice(0, node.path.lastIndexOf("/"));
    return parent !== "" && onPath(parent);
  };
  const budget = { left: nodeBudget };
  const pruneLevel = (nodes: readonly SiteNavNode[]): SiteNavTree => {
    const kept = nodes.filter(keepNode);
    const required = kept.filter((node) => onPath(node.path) || node.path === current);
    const requiredSet = new Set(required);
    const fillable = Math.max(0, groupLimit - required.length);
    const optional = kept.filter((node) => !requiredSet.has(node)).slice(0, fillable);
    const shown = new Set([...required, ...optional]);
    let hidden = nodes.length - shown.size;
    const out: SiteNavNode[] = [];
    for (const node of kept) {
      if (!shown.has(node)) continue;
      if (budget.left <= 0 && !onPath(node.path)) {
        hidden += 1;
        continue;
      }
      budget.left -= 1;
      const children = node.children.length === 0
        ? { nodes: [] as SiteNavNode[], hiddenRoots: 0 }
        : pruneLevel(node.children);
      out.push({
        path: node.path,
        ...(node.slug === undefined ? {} : { slug: node.slug }),
        label: node.label,
        children: children.nodes,
        ...(children.hiddenRoots === 0 ? {} : { hiddenChildren: children.hiddenRoots }),
      });
    }
    return { nodes: out, hiddenRoots: hidden };
  };
  return pruneLevel(tree.nodes);
}

export type SiteBreadcrumb = {
  readonly label: string;
  /** Published slug for linked ancestors; absent for plain segments. */
  readonly slug?: string;
  readonly current: boolean;
};

/**
 * Breadcrumb segments for a note slug. Ancestor segments link when a published
 * note owns that path; the last segment is the current note (never linked).
 */
export function siteBreadcrumbs(
  slug: string,
  titleBySlug: ReadonlyMap<string, string>,
): readonly SiteBreadcrumb[] {
  if (slug === "") return [];
  const segments = slug.split("/");
  return segments.map((segment, index) => {
    const path = segments.slice(0, index + 1).join("/");
    const current = index === segments.length - 1;
    return {
      label: titleBySlug.get(path) ?? segment,
      ...(current || !titleBySlug.has(path) ? {} : { slug: path }),
      current,
    };
  });
}

export type SiteTocEntry = {
  readonly level: number;
  readonly id: string;
  readonly text: string;
};

const HEADING_PATTERN = /<h([1-6]) id="([^"]{0,256})">([\s\S]*?)<\/h\1>/gu;

/**
 * Table of contents from rendered note HTML. The renderer emits one
 * `<hN id="…">` per authored heading on a single line with no nested headings,
 * so a bounded scan is exact — ids and order come straight from the emitted
 * document rather than a second anchoring implementation.
 */
export function siteTocFromHtml(
  html: string,
  limit = SITE_TOC_LIMIT,
): readonly SiteTocEntry[] {
  const entries: SiteTocEntry[] = [];
  for (const match of html.matchAll(HEADING_PATTERN)) {
    if (entries.length >= limit) break;
    entries.push({
      level: Number(match[1]),
      id: match[2] ?? "",
      text: stripMarkup(match[3] ?? "").replace(/\s+/gu, " ").trim(),
    });
  }
  return entries;
}
