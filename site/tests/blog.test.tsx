import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  articleProvenanceFromAdmission,
  articleProvenanceSentence,
  assertArticleAdmissions,
  isArticleIndexable,
} from "@hraness/design-kit";
import { portfolioDigest, relatedFor } from "@hraness/design-kit/portfolio";

import BlogIndex from "../app/blog/page";
import BlogPostPage, { generateMetadata, generateStaticParams } from "../app/blog/[slug]/page";
import { GET as feedRoute } from "../app/blog/feed.xml/route";
import { blogAdmissions, blogArticles, indexableArticles } from "../app/blog/articles";
import { blogHtml } from "../app/blog/blog.generated";
import { blogSitemapPaths } from "../app/blog/discovery";
import { publishedRelease } from "../app/publication";
import { assertSiteLinks, bindReleaseVersion, contentsFor } from "../scripts/sync-blog";
import { launchRoutes } from "../wordcell/launch-routes";

const site = join(import.meta.dir, "..");
const read = async (path: string): Promise<string> => await readFile(join(site, path), "utf8");

const quarantined = blogArticles.filter((article) => !isArticleIndexable(article.admission));

async function renderPost(slug: string): Promise<string> {
  return renderToStaticMarkup(await BlogPostPage({ params: Promise.resolve({ slug }) }));
}

describe("Wordcell blog", () => {
  test("every post has a valid review record, and every record has a post", () => {
    assertArticleAdmissions(blogAdmissions);
    expect(blogAdmissions.map((admission) => admission.href)).toEqual(blogArticles.map((article) => `/blog/${article.slug}`));
    for (const admission of blogAdmissions) {
      expect(admission.review?.reviewerType).toBe("ai");
      expect(admission.humanReview).toBeNull();
    }
  });

  test("the registry, rendered bodies, and static routes cover the same posts", () => {
    expect(Object.keys(blogHtml).sort()).toEqual(blogArticles.map((article) => article.slug).sort());
    expect(generateStaticParams().map(({ slug }) => slug).sort()).toEqual(blogArticles.map((article) => article.slug).sort());
  });

  test("today's posts are one indexable introduction and one quarantined integration post", () => {
    expect(indexableArticles.map((article) => article.slug)).toEqual(["introducing-wordcell"]);
    expect(quarantined.map((article) => article.slug)).toEqual(["how-wordcell-uses-oh"]);
  });

  test("every post shows the Hraness byline and the provenance note from its review record", async () => {
    for (const article of blogArticles) {
      const html = await renderPost(article.slug);
      const sentence = articleProvenanceSentence(articleProvenanceFromAdmission(article.admission));
      expect(sentence).toBe("Drafted with AI from the source code and reviewed by Claude Opus 5.5 (claude-opus-5-5) editorial review.");
      expect(html).toContain(sentence);
      expect(html).toContain("By");
      expect(html).toContain("Hraness");
      expect(html).not.toMatch(/human/iu);
      expect(html).toContain('"@type":"BlogPosting"');
      expect(html).toContain(`https://wordcell.io/blog/${article.slug}`);
    }
  });

  test("quarantined posts are noindex and indexable posts are indexable, both with a canonical URL", async () => {
    for (const article of blogArticles) {
      const metadata = await generateMetadata({ params: Promise.resolve({ slug: article.slug }) });
      expect(metadata.alternates?.canonical).toBe(`https://wordcell.io/blog/${article.slug}`);
      expect(metadata.openGraph).toMatchObject({ type: "article", url: `https://wordcell.io/blog/${article.slug}` });
      const robots = metadata.robots as { index?: boolean } | undefined;
      expect(robots?.index).toBe(isArticleIndexable(article.admission));
    }
  });

  test("quarantined posts stay out of the index page, feed, sitemap, and llms.txt", async () => {
    const [index, feed, sitemap, llms] = await Promise.all([
      Promise.resolve(renderToStaticMarkup(<BlogIndex />)),
      feedRoute().text(),
      read("public/sitemap.xml"),
      read("public/llms.txt"),
    ]);
    for (const article of quarantined) {
      const url = `https://wordcell.io/blog/${article.slug}`;
      expect(index).not.toContain(`href="/blog/${article.slug}"`);
      expect(feed).not.toContain(`<id>${url}</id>`);
      expect(sitemap).not.toContain(`<loc>${url}</loc>`);
      expect(llms).not.toContain(url);
    }
    for (const article of indexableArticles) {
      expect(index).toContain(`href="/blog/${article.slug}"`);
      for (const document of [feed, sitemap, llms]) expect(document).toContain(`https://wordcell.io/blog/${article.slug}`);
    }
    expect(feed).toStartWith('<?xml version="1.0" encoding="utf-8"?>');
    expect(feed).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    expect(index).toContain('"@type":"Blog"');
  });

  test("the static sitemap dates each blog entry from its record", async () => {
    const sitemap = (await read("public/sitemap.xml")).replace(/\s+/gu, "");
    for (const entry of blogSitemapPaths()) {
      const lastmod = String(entry.lastModified).slice(0, 10);
      expect(sitemap).toContain(`<url><loc>https://wordcell.io${entry.path}</loc><lastmod>${lastmod}</lastmod>`);
    }
  });

  test("bodies render the verified release version and link only to pages that exist", () => {
    for (const html of Object.values(blogHtml)) {
      expect(html).not.toContain("{{");
      expect(html).not.toContain("—");
      if (publishedRelease !== null) expect(html).toContain(`Latest release: v${publishedRelease.version}.`);
    }
    expect(bindReleaseVersion("v{{release.version}}", "1.2.3")).toBe("v1.2.3");
    expect(bindReleaseVersion("no version", null)).toBe("no version");
    expect(() => bindReleaseVersion("v{{release.version}}", null)).toThrow();
    const posts = new Set(["a"]);
    const docs = new Set(["reference"]);
    expect(() => assertSiteLinks("x", '<a href="/blog/a">', posts, docs)).not.toThrow();
    expect(() => assertSiteLinks("x", '<a href="/docs/reference#install">', posts, docs)).not.toThrow();
    expect(() => assertSiteLinks("x", '<a href="/blog/missing">', posts, docs)).toThrow();
    expect(() => assertSiteLinks("x", '<a href="/docs/missing">', posts, docs)).toThrow();
    for (const path of launchRoutes) expect(() => assertSiteLinks("x", `<a href="${path}#top">`, posts, docs), path).not.toThrow();
    expect(() => assertSiteLinks("x", '<a href="/migrate/supermemory#steps">', posts, docs)).not.toThrow();
    expect(() => assertSiteLinks("x", '<a href="/compare/missing">', posts, docs)).toThrow();
  });

  test("the introduction leaves the xcb post unlinked until that post is live", () => {
    // The draft keeps this link conditional on xcb.sh/blog/how-xcb-uses-wordcell returning 200.
    expect(blogHtml["introducing-wordcell"]).toContain("How xcb uses Wordcell explains.");
    expect(blogHtml["introducing-wordcell"]).not.toContain('href="https://xcb.sh/');
  });

  test("contents lists appear only for posts with four or more sections", () => {
    const three = '<h2 id="a">A</h2><h2 id="b">B</h2><h2 id="c">C</h2>';
    expect(contentsFor(three)).toEqual([]);
    expect(contentsFor(`${three}<h2 id="d">D &amp; E</h2>`).map((item) => item.label)).toEqual(["A", "B", "C", "D & E"]);
  });

  test("related products come from the pinned portfolio facts", () => {
    // Wordcell has no registered relation with a detail sentence in this
    // snapshot, so the related block stays empty until one is registered.
    expect(portfolioDigest).toBe("sha256:87e824bc78a68dd862aeee804443a6120ac91889dbfa890d2d8b5126bb4b7834");
    expect(relatedFor("kb")).toEqual([]);
  });

  test("the blog is linked from the site header and footer", async () => {
    const [home, developers, footer] = await Promise.all([
      read("app/page.tsx"),
      read("app/developers/page.tsx"),
      read("app/site-footer.tsx"),
    ]);
    for (const source of [home, developers, footer]) expect(source).toContain('{ href: "/blog", label: "Blog" }');
  });
});
