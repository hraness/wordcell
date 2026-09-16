import type { Note } from "./graph.js";
import { escapeAttribute, escapeHtml } from "./publish-markdown.js";
import type {
  WordcellSiteCatalogEntryV1,
  WordcellSiteManifestV1,
  WordcellSiteNoteLinkV1,
  WordcellSiteNoteRelationV1,
} from "./publish-model.js";

/**
 * Static page chrome for a published site. Pages are complete HTML documents
 * that read without JavaScript; the bundled reader progressively adds search.
 * No inline scripts or styles are emitted so a strict `default-src 'self'`
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

function chrome(
  title: string,
  main: string,
  ctx: PageContext,
  extra: readonly string[] = [],
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    ${head(title, ctx, extra)}
  </head>
  <body>
    <header class="site-header">
      <a class="site-title" href="${escapeAttribute(ctx.rel || "./")}">${escapeHtml(ctx.site.title)}</a>
      <button type="button" class="search-button" data-wordcell-search aria-keyshortcuts="/">
        <span>Search</span><kbd>/</kbd>
      </button>
    </header>
    <main>
${main}
    </main>
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
    `          <li><a href="${escapeAttribute(link.s === "" ? rel || "./" : `${rel}n/${encodeURI(link.s)}/`)}">${escapeHtml(link.t)}</a></li>`,
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
    `          <li><span class="predicate">${escapeHtml(relation.p)}</span> <a href="${escapeAttribute(relation.s === "" ? rel || "./" : `${rel}n/${encodeURI(relation.s)}/`)}">${escapeHtml(relation.t)}</a></li>`,
  ).join("\n");
  return `      <section class="note-relations">
        <h2>${escapeHtml(title)}</h2>
        <ul>
${items}
        </ul>
      </section>`;
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
  const main = `      <article class="note">
        <h1>${escapeHtml(note.title)}</h1>
        ${meta}
        ${aliasRow}
        <div class="note-body">
${bodyHtml}
        </div>
      </article>${aside === "" ? "" : `\n      <aside class="note-aside">\n${aside}\n      </aside>`}`;
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
        `            <li><a href="${escapeAttribute(entry.s === "" ? ctx.rel || "./" : `${ctx.rel}n/${encodeURI(entry.s)}/`)}">${escapeHtml(entry.t)}</a></li>`,
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
  const main = `${body}      <nav class="catalog" aria-label="All published notes">
${sections}
      </nav>`;
  return chrome("", main, ctx, [
    `<meta name="wordcell:landing" content="true">`,
  ]);
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
