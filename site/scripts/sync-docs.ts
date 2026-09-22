import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { docCatalog } from "../app/docs/catalog.ts";
import { publishedRelease } from "../app/publication.ts";
import {
  REPOSITORY_BLOB_ROOT,
  REPOSITORY_RAW_ROOT,
  renderedFragmentIds,
  renderMarkdownHtml,
  renderReadmeHtml,
  type RelativeTargetResolver,
} from "./readme-html.ts";
import { publishedReadme } from "./published-readme.ts";

const siteRoot = resolve(import.meta.dir, "..");
const repositoryRoot = resolve(siteRoot, "..");
const docsRoot = resolve(repositoryRoot, "docs");

/** Repository Markdown under docs/ becomes a site route; other files stay on GitHub. */
export function docsResolver(slugs: ReadonlySet<string>): RelativeTargetResolver {
  return (name, resolved) => {
    const hash = resolved.indexOf("#");
    const path = hash === -1 ? resolved : resolved.slice(0, hash);
    const fragment = hash === -1 ? "" : resolved.slice(hash);
    if (path === "README.md") return `/docs/overview${fragment}`;
    if (path.startsWith("docs/") && path.endsWith(".md")) {
      const slug = basename(path, ".md");
      if (!slugs.has(slug)) {
        throw new Error(`Documentation links an uncataloged page: ${JSON.stringify(resolved)}`);
      }
      return `/docs/${slug}${fragment}`;
    }
    const root = name === "src" ? REPOSITORY_RAW_ROOT : REPOSITORY_BLOB_ROOT;
    return `${root}${resolved}`;
  };
}

/** Fragments that point into another rendered documentation page must resolve there. */
function assertCrossPageFragments(
  rendered: ReadonlyMap<string, string>,
  fragments: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  for (const [slug, html] of rendered) {
    for (const match of html.matchAll(/\shref="\/docs\/([a-z0-9-]+)(?:#([^"]+))?"/gu)) {
      const targetSlug = match[1]!;
      const ids = fragments.get(targetSlug);
      if (ids === undefined) {
        throw new Error(`${slug} links to unknown documentation page /docs/${targetSlug}`);
      }
      const fragment = match[2];
      if (fragment !== undefined && !ids.has(decodeURIComponent(fragment))) {
        throw new Error(`${slug} links to missing fragment /docs/${targetSlug}#${fragment}`);
      }
    }
  }
}

if (import.meta.main) {
  const files = (await readdir(docsRoot))
    .filter((name) => name.endsWith(".md"))
    .map((name) => basename(name, ".md"));
  const cataloged: ReadonlySet<string> = new Set(docCatalog.map((entry) => entry.slug));
  for (const file of files) {
    if (!cataloged.has(file)) {
      throw new Error(`docs/${file}.md is missing from site/app/docs/catalog.ts`);
    }
  }
  for (const entry of docCatalog) {
    if (!files.includes(entry.slug)) {
      throw new Error(`catalog.ts lists ${entry.slug} but docs/${entry.slug}.md does not exist`);
    }
  }

  const resolver = docsResolver(cataloged);
  const rendered = new Map<string, string>();
  for (const entry of docCatalog) {
    const source = await Bun.file(resolve(docsRoot, `${entry.slug}.md`)).text();
    rendered.set(entry.slug, renderMarkdownHtml(source, resolver, "docs"));
  }

  const readmeSource = await Bun.file(resolve(repositoryRoot, "README.md")).text();
  const manifest = await Bun.file(resolve(repositoryRoot, "package.json")).json() as { version: string };
  const overviewHtml = renderReadmeHtml(
    publishedReadme(readmeSource, manifest.version, publishedRelease?.version ?? null),
    resolver,
  );

  const fragments = new Map<string, ReadonlySet<string>>();
  for (const [slug, html] of rendered) fragments.set(slug, renderedFragmentIds(html));
  fragments.set("overview", renderedFragmentIds(overviewHtml));
  const all = new Map(rendered);
  all.set("overview", overviewHtml);
  assertCrossPageFragments(all, fragments);

  const entries = [...rendered.entries(), ["overview", overviewHtml] as const].map(
    ([slug, html]) => `  ${JSON.stringify(slug)}: ${JSON.stringify(html)},\n`,
  );
  await Bun.write(
    resolve(siteRoot, "app/docs/docs.generated.ts"),
    "// Generated from ../docs/*.md and ../README.md by scripts/sync-docs.ts. Do not edit.\n"
      + "export const docHtml: Readonly<Record<string, string>> = {\n"
      + entries.join("")
      + "};\n",
  );
}
