import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { blogArticles } from "../app/blog/articles.ts";
import { docCatalog } from "../app/docs/catalog.ts";
import { publishedRelease } from "../app/publication.ts";
import { isLaunchRoute } from "../wordcell/launch-routes.ts";
import { renderMarkdownHtml, type RelativeTargetResolver } from "./readme-html.ts";

const siteRoot = resolve(import.meta.dir, "..");
const contentRoot = resolve(siteRoot, "content/blog");

const RELEASE_VERSION = "{{release.version}}";

/** Blog Markdown links only to absolute URLs or site paths; a relative file path has no route. */
const rejectRelative: RelativeTargetResolver = (_name, target) => {
  throw new Error(`Blog posts must link with an absolute URL or a site path: ${JSON.stringify(target)}`);
};

/** Replace the release placeholder with the version the site has verified; never type a version by hand. */
export function bindReleaseVersion(source: string, version: string | null): string {
  if (!source.includes(RELEASE_VERSION)) return source;
  if (version === null) throw new Error("A blog post names the latest release, but no release is published yet.");
  return source.replaceAll(RELEASE_VERSION, version);
}

/** Every on-site link from a post must reach a rendered page. */
export function assertSiteLinks(slug: string, html: string, posts: ReadonlySet<string>, docs: ReadonlySet<string>): void {
  for (const [, path] of html.matchAll(/\shref="(\/[^"#?]*)[^"]*"/gu)) {
    if (path === undefined || path === "/" || path === "/docs" || path === "/developers" || path === "/blog" || isLaunchRoute(path)) continue;
    const blog = /^\/blog\/([a-z0-9-]+)$/u.exec(path);
    if (blog !== null && posts.has(blog[1]!)) continue;
    const doc = /^\/docs\/([a-z0-9-]+)$/u.exec(path);
    if (doc !== null && (docs.has(doc[1]!) || doc[1] === "overview")) continue;
    throw new Error(`${slug} links to a page the site does not render: ${path}`);
  }
}

/** The visible text of a heading's inner HTML: every tag dropped, entities decoded with `&amp;` last so nothing is decoded twice. */
function headingLabel(innerHtml: string): string {
  let text = "";
  let inTag = false;
  for (const character of innerHtml) {
    if (character === "<") inTag = true;
    else if (character === ">") inTag = false;
    else if (!inTag) text += character;
  }
  return text.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&").trim();
}

/** Contents entries for each h2, shown only when a post has four or more sections. */
export function contentsFor(html: string): readonly { href: `#${string}`; label: string }[] {
  const items = Array.from(html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/gu), ([, id, body]) => ({
    href: `#${id!}` as const,
    label: headingLabel(body!),
  }));
  return items.length >= 4 ? items.slice(0, 8) : [];
}

if (import.meta.main) {
  const files = (await readdir(contentRoot)).filter((name) => name.endsWith(".md")).map((name) => basename(name, ".md"));
  const slugs: ReadonlySet<string> = new Set(blogArticles.map((article) => article.slug));
  for (const file of files) {
    if (!slugs.has(file)) throw new Error(`content/blog/${file}.md is missing from app/blog/articles.ts`);
  }
  const docs: ReadonlySet<string> = new Set(docCatalog.map((entry) => entry.slug));
  const html: string[] = [];
  const contents: string[] = [];
  for (const article of blogArticles) {
    if (!files.includes(article.slug)) throw new Error(`articles.ts lists ${article.slug} but content/blog/${article.slug}.md does not exist`);
    const source = await Bun.file(resolve(contentRoot, `${article.slug}.md`)).text();
    const bound = bindReleaseVersion(source, publishedRelease?.version ?? null);
    if (bound.includes("{{")) throw new Error(`${article.slug} has an unbound template placeholder.`);
    if (/^#\s/mu.test(bound)) throw new Error(`${article.slug} must not repeat its title as a Markdown h1.`);
    if (bound.includes("—")) throw new Error(`${article.slug} contains an em dash.`);
    const rendered = renderMarkdownHtml(bound, rejectRelative);
    assertSiteLinks(article.slug, rendered, slugs, docs);
    html.push(`  ${JSON.stringify(article.slug)}: ${JSON.stringify(rendered)},\n`);
    contents.push(`  ${JSON.stringify(article.slug)}: ${JSON.stringify(contentsFor(rendered))},\n`);
  }
  await Bun.write(
    resolve(siteRoot, "app/blog/blog.generated.ts"),
    "// Generated from content/blog/*.md by scripts/sync-blog.ts. Do not edit.\n"
      + "export const blogHtml: Readonly<Record<string, string>> = {\n"
      + html.join("")
      + "};\n\n"
      + "export const blogContents: Readonly<Record<string, readonly { href: `#${string}`; label: string }[]>> = {\n"
      + contents.join("")
      + "};\n",
  );
}
