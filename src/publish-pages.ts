import type { Note } from "./graph.js";
import { escapeAttribute, escapeHtml } from "./publish-markdown.js";
import type {
  WordcellSiteCatalogEntryV1,
  WordcellSiteManifestV1,
  WordcellSiteNoteLinkV1,
  WordcellSiteNoteRelationV1,
} from "./publish-model.js";
import {
  pruneSiteNav,
  siteBreadcrumbs,
  siteTocFromHtml,
  type SiteNavNode,
  type SiteNavTree,
} from "./publish-nav.js";

/**
 * Static page chrome for a published site. Pages are complete HTML documents
 * that read without JavaScript: the sidebar tree, breadcrumbs, table of
 * contents, and graph note index are all prerendered markup, and the bundled
 * reader progressively adds search and the interactive graph. No inline
 * scripts or styles are emitted so a strict `default-src 'self'`
 * Content-Security-Policy applies to every page.
 */

export const SITE_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" as const;

export type PageContext = {
  readonly site: WordcellSiteManifestV1["site"];
  /** Relative path prefix from the current page to the site root ("" or "../"×n). */
  readonly rel: string;
  /** Noindex emitted on every page when the publisher asked for it. */
  readonly noindex: boolean;
  readonly generator: string;
  /** Full catalog nav tree; chrome prunes it around `current` per page. */
  readonly nav: SiteNavTree;
  /** Slug of the page being rendered; "" when nothing in the tree is current. */
  readonly current: string;
  /** Slug → note title for breadcrumb labels. */
  readonly titles: ReadonlyMap<string, string>;
};

export function relativePrefix(slug: string): string {
  if (slug === "") return "";
  const depth = slug.split("/").length;
  return "../".repeat(depth + 1);
}

export function noteHref(rel: string, slug: string): string {
  return slug === "" ? rel || "./" : `${rel}n/${encodeURI(slug)}/`;
}

function head(
  title: string,
  ctx: PageContext,
  extra: readonly string[] = [],
): string {
  const lines = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(title === "" ? ctx.site.title : `${title} — ${ctx.site.title}`)}</title>`,
    `<meta name="generator" content="${escapeAttribute(ctx.generator)}">`,
    `<meta name="wordcell:base" content="${escapeAttribute(ctx.rel || "./")}">`,
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(SITE_CONTENT_SECURITY_POLICY)}">`,
    `<script src="${escapeAttribute(ctx.rel)}reader/theme.js"></script>`,
    `<link rel="stylesheet" href="${escapeAttribute(ctx.rel)}reader/reader.css">`,
    `<script type="module" src="${escapeAttribute(ctx.rel)}reader/reader.js"></script>`,
  ];
  if (ctx.site.description !== undefined) {
    lines.push(`<meta name="description" content="${escapeAttribute(ctx.site.description)}">`);
  }
  if (ctx.noindex) lines.push(`<meta name="robots" content="noindex">`);
  lines.push(...extra);
  return lines.join("\n    ");
}

function navLink(rel: string, node: SiteNavNode, current: string, extraClass = ""): string {
  const isCurrent = node.slug !== undefined && node.slug === current;
  const classes = `site-tree-link${isCurrent ? " site-tree-current" : ""}${extraClass}`;
  return `<a class="${classes}" href="${escapeAttribute(noteHref(rel, node.slug ?? ""))}"${
    isCurrent ? ` aria-current="page"` : ""
  }>${escapeHtml(node.label)}</a>`;
}

function navItems(
  nodes: readonly SiteNavNode[],
  current: string,
  rel: string,
  depth: number,
): string {
  const items = nodes.map((node) => {
    const grouped = node.children.length > 0 || (node.hiddenChildren ?? 0) > 0;
    if (!grouped) {
      const body = node.slug === undefined
        ? `<span class="site-tree-empty">${escapeHtml(node.label)}</span>`
        : navLink(rel, node, current);
      return `          <li class="site-tree-leaf">${body}</li>`;
    }
    const onPath = current !== ""
      && (current === node.path || current.startsWith(`${node.path}/`));
    const open = depth === 0 || onPath;
    const self = node.slug === undefined
      ? ""
      : `            <li class="site-tree-self">${navLink(rel, node, current)}</li>\n`;
    const more = (node.hiddenChildren ?? 0) === 0
      ? ""
      : `            <li class="site-tree-more"><a href="${escapeAttribute(rel)}#catalog">+${String(node.hiddenChildren)} more</a></li>\n`;
    return `          <li class="site-tree-group">
            <details${open ? " open" : ""}>
              <summary>${escapeHtml(node.label)}</summary>
              <ul>
${self}${navItems(node.children, current, rel, depth + 1)}${more}              </ul>
            </details>
          </li>`;
  });
  return items.join("\n") + (items.length === 0 ? "" : "\n");
}

function renderSiteNav(tree: SiteNavTree, current: string, rel: string): string {
  if (tree.nodes.length === 0) return "";
  const more = tree.hiddenRoots === 0
    ? ""
    : `          <li class="site-tree-more"><a href="${escapeAttribute(rel)}#catalog">+${String(tree.hiddenRoots)} more</a></li>\n`;
  return `    <nav class="site-nav" aria-label="Published notes">
      <ul class="site-tree">
${navItems(tree.nodes, current, rel, 0)}${more}      </ul>
    </nav>`;
}

function breadcrumbsHtml(ctx: PageContext): string {
  const crumbs = siteBreadcrumbs(ctx.current, ctx.titles);
  if (crumbs.length === 0) return "";
  const items = [
    `          <li><a href="${escapeAttribute(ctx.rel || "./")}">Home</a></li>`,
    ...crumbs.map((crumb) => {
      if (crumb.current) {
        return `          <li><span aria-current="page">${escapeHtml(crumb.label)}</span></li>`;
      }
      if (crumb.slug === undefined) {
        return `          <li><span>${escapeHtml(crumb.label)}</span></li>`;
      }
      return `          <li><a href="${escapeAttribute(noteHref(ctx.rel, crumb.slug))}">${escapeHtml(crumb.label)}</a></li>`;
    }),
  ];
  return `      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <ol>
${items.join("\n")}
        </ol>
      </nav>\n`;
}

function tocHtml(bodyHtml: string): string {
  const toc = siteTocFromHtml(bodyHtml);
  if (toc.length < 2) return "";
  const items = toc.map((entry) =>
    `          <li class="toc-level-${String(Math.min(entry.level, 4))}"><a href="#${escapeAttribute(entry.id)}">${escapeHtml(entry.text)}</a></li>`,
  );
  return `      <nav class="note-toc" aria-label="On this page">
        <h2>On this page</h2>
        <ol>
${items.join("\n")}
        </ol>
      </nav>`;
}

function chrome(
  title: string,
  main: string,
  ctx: PageContext,
  extra: readonly string[] = [],
  options: { readonly graph?: boolean } = {},
): string {
  const nav = renderSiteNav(pruneSiteNav(ctx.nav, ctx.current), ctx.current, ctx.rel);
  const graphCurrent = options.graph === true ? ` aria-current="page"` : "";
  const layoutClass = nav === "" ? "site-layout site-layout-flat" : "site-layout";
  return `<!doctype html>
<html lang="en">
  <head>
    ${head(title, ctx, extra)}
  </head>
  <body>
    <a class="skip-link" href="#wordcell-main">Skip to content</a>
    <header class="site-header">
      <a class="site-title" href="${escapeAttribute(ctx.rel || "./")}">${escapeHtml(ctx.site.title)}</a>
      <nav class="site-actions" aria-label="Site">
        <a class="graph-link" href="${escapeAttribute(ctx.rel)}graph/"${graphCurrent}>Graph</a>
        <button type="button" class="search-button" data-wordcell-search aria-keyshortcuts="/">
          <span>Search</span><kbd>/</kbd>
        </button>
      </nav>
    </header>
    <div class="${layoutClass}">
${nav}
      <main id="wordcell-main">
${main}
      </main>
    </div>
    <footer class="site-footer">
      <span>Published with <a href="https://wordcell.io" rel="noopener noreferrer">Wordcell</a>.</span>
    </footer>
  </body>
</html>
`;
}

function propertiesBlock(note: Note): string {
  const rows: string[] = [];
  const type = note.metadata["type"];
  if (typeof type === "string" && type !== "") {
    rows.push(`<span class="note-type">${escapeHtml(type)}</span>`);
  }
  for (const tag of note.tags) {
    rows.push(`<span class="note-tag">${escapeHtml(tag)}</span>`);
  }
  if (rows.length === 0) return "";
  return `<div class="note-meta">${rows.join("\n        ")}</div>`;
}

function linkList(title: string, links: readonly WordcellSiteNoteLinkV1[], rel: string): string {
  if (links.length === 0) return "";
  const items = links.map((link) =>
    `          <li><a href="${escapeAttribute(noteHref(rel, link.s))}">${escapeHtml(link.t)}</a></li>`,
  ).join("\n");
  return `      <section class="note-links">
        <h2>${escapeHtml(title)}</h2>
        <ul>
${items}
        </ul>
      </section>`;
}

function relationList(
  title: string,
  relations: readonly WordcellSiteNoteRelationV1[],
  rel: string,
): string {
  if (relations.length === 0) return "";
  const items = relations.map((relation) =>
    `          <li><span class="predicate">${escapeHtml(relation.p)}</span> <a href="${escapeAttribute(noteHref(rel, relation.s))}">${escapeHtml(relation.t)}</a></li>`,
  ).join("\n");
  return `      <section class="note-relations">
        <h2>${escapeHtml(title)}</h2>
        <ul>
${items}
        </ul>
      </section>`;
}

/** Reuse only a plain leading title; preserve its authored anchor and all other HTML. */
function notePageTitle(title: string, bodyHtml: string): { heading: string; body: string } {
  const leading = /^\s*(<h1 id="[^"]*">([^<]*)<\/h1>)/u.exec(bodyHtml);
  if (leading !== null && leading[2] === escapeHtml(title)) {
    return { heading: leading[1] ?? "", body: bodyHtml.slice(leading[0].length) };
  }
  return { heading: `<h1>${escapeHtml(title)}</h1>`, body: bodyHtml };
}

export function renderNotePage(
  note: Note,
  bodyHtml: string,
  sides: {
    readonly links: readonly WordcellSiteNoteLinkV1[];
    readonly backlinks: readonly WordcellSiteNoteLinkV1[];
    readonly relations: readonly WordcellSiteNoteRelationV1[];
    readonly relationBacklinks: readonly WordcellSiteNoteRelationV1[];
  },
  ctx: PageContext,
): string {
  const meta = propertiesBlock(note);
  const aliasRow = note.aliases.length === 0
    ? ""
    : `<p class="note-aliases">Also known as ${escapeHtml(note.aliases.join(", "))}</p>`;
  const aside = [
    linkList("Linked from", sides.backlinks, ctx.rel),
    relationList("Relations", sides.relations, ctx.rel),
    relationList("Referenced by", sides.relationBacklinks, ctx.rel),
  ].filter((section) => section !== "").join("\n");
  const toc = tocHtml(bodyHtml);
  const title = notePageTitle(note.title, bodyHtml);
  const article = `        <article class="note">
          ${title.heading}
          ${meta}
          ${aliasRow}
          <div class="note-body">
${title.body}
          </div>
        </article>${aside === "" ? "" : `\n        <aside class="note-aside">\n${aside}\n        </aside>`}`;
  const main = `${breadcrumbsHtml(ctx)}      <div class="note-columns">
${article}
${toc}
      </div>`;
  return chrome(note.title, main, ctx);
}

export function renderLandingPage(
  indexBodyHtml: string | undefined,
  entries: readonly WordcellSiteCatalogEntryV1[],
  ctx: PageContext,
): string {
  const groups = new Map<string, WordcellSiteCatalogEntryV1[]>();
  for (const entry of entries) {
    const top = entry.s.split("/")[0] ?? "";
    const group = groups.get(top) ?? [];
    group.push(entry);
    groups.set(top, group);
  }
  const sections = [...groups.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([group, members]) => {
      const items = members.map((entry) =>
        `            <li><a href="${escapeAttribute(noteHref(ctx.rel, entry.s))}">${escapeHtml(entry.t)}</a></li>`,
      ).join("\n");
      return `        <section class="catalog-group">
          <h2>${escapeHtml(group === "" ? "Notes" : group)}</h2>
          <ul>
${items}
          </ul>
        </section>`;
    }).join("\n");
  const body = indexBodyHtml === undefined || indexBodyHtml === ""
    ? ""
    : `      <div class="note-body index-body">\n${indexBodyHtml}\n      </div>\n`;
  const main = `${body}      <nav class="catalog" id="catalog" aria-label="All published notes">
${sections}
      </nav>`;
  return chrome("", main, ctx, [
    `<meta name="wordcell:landing" content="true">`,
  ]);
}

export function renderGraphPage(
  entries: readonly WordcellSiteCatalogEntryV1[],
  edgeCount: number,
  ctx: PageContext,
): string {
  const items = entries.map((entry) =>
    `          <li><a href="${escapeAttribute(noteHref(ctx.rel, entry.s))}">${escapeHtml(entry.t)}</a></li>`,
  ).join("\n");
  const main = `      <article class="note graph-page">
        <h1>Graph</h1>
        <p class="graph-lede">${String(entries.length)} notes and ${String(edgeCount)} links. Drag to pan, scroll or pinch to zoom, click a node to open the note.</p>
        <div class="graph-shell" data-wordcell-graph>
          <canvas class="graph-canvas" data-wordcell-graph-canvas width="1280" height="720" tabindex="0" role="img" aria-label="Interactive map of ${String(entries.length)} published notes"></canvas>
          <div class="graph-status" data-wordcell-graph-status>The interactive map needs JavaScript. Every note is listed below.</div>
          <div class="graph-toolbar">
            <button type="button" class="graph-reset" data-wordcell-graph-reset>Reset view</button>
            <span class="graph-legend"><span class="graph-edge graph-edge-link"></span> link <span class="graph-edge graph-edge-relation"></span> typed relation</span>
          </div>
        </div>
        <h2>All notes</h2>
        <ul class="graph-index">
${items}
        </ul>
      </article>`;
  return chrome("Graph", main, ctx, [], { graph: true });
}

export function renderNotFoundPage(ctx: PageContext): string {
  return chrome("Not found", `      <article class="note">
        <h1>Not found</h1>
        <p>This page is not part of the published site.</p>
      </article>`, { ...ctx, noindex: true });
}

export function renderRobotsTxt(noindex: boolean): string {
  return noindex
    ? "User-agent: *\nDisallow: /\n"
    : "User-agent: *\nAllow: /\n";
}

export function renderSitemapXml(slugs: readonly string[], baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const urls = slugs.map((slug) =>
    `  <url><loc>${escapeHtml(base + (slug === "" ? "" : `n/${encodeURI(slug)}/`))}</loc></url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
