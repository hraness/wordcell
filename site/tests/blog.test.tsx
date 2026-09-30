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
import {
  assertBoundFigures,
  assertSiteLinks,
  bindEvidence,
  bindReleaseVersion,
  contentsFor,
  evidenceFigures,
  figureTokens,
} from "../scripts/sync-blog";
import { scifactStudy } from "../wordcell/benchmark-evidence";
import { launchRoutes } from "../wordcell/launch-routes";
import { ohLinks } from "../wordcell/oh-evidence";

const site = join(import.meta.dir, "..");
const read = async (path: string): Promise<string> => await readFile(join(site, path), "utf8");

const quarantined = blogArticles.filter((article) => !isArticleIndexable(article.admission));
const unreviewed = blogArticles.filter((article) => article.admission.review === null);
const launchSlug = "free-local-agent-memory";
// The commit that added /benchmarks, /compare/supermemory, and /migrate/supermemory (PR #137); the launch post pins its Wordcell sources there.
const launchCommit = "d87d4ecdd0a0b1351bc2b0d0f3cdf8de30c047dc";

async function renderPost(slug: string): Promise<string> {
  return renderToStaticMarkup(await BlogPostPage({ params: Promise.resolve({ slug }) }));
}

describe("Wordcell blog", () => {
  test("every post has a valid review record, and every record has a post", () => {
    assertArticleAdmissions(blogAdmissions);
    expect(blogAdmissions.map((admission) => admission.href)).toEqual(blogArticles.map((article) => `/blog/${article.slug}`));
    for (const admission of blogAdmissions) {
      // A post without a review stays quarantined; the drafting run never records itself as the reviewer.
      if (admission.review === null) expect(admission.lifecycle, admission.href).toBe("quarantined");
      else expect(admission.review.reviewerType).toBe("ai");
      expect(admission.humanReview).toBeNull();
    }
    expect(unreviewed.map((article) => article.slug)).toEqual([]);
  });

  test("the registry, rendered bodies, and static routes cover the same posts", () => {
    expect(Object.keys(blogHtml).sort()).toEqual(blogArticles.map((article) => article.slug).sort());
    expect(generateStaticParams().map(({ slug }) => slug).sort()).toEqual(blogArticles.map((article) => article.slug).sort());
  });

  test("today's posts are three indexable posts, newest first", () => {
    expect(indexableArticles.map((article) => article.slug)).toEqual(["free-local-agent-memory", "introducing-wordcell", "how-wordcell-uses-oh"]);
    expect(quarantined.map((article) => article.slug)).toEqual([]);
  });

  test("every post shows the Hraness byline and the provenance note from its review record", async () => {
    for (const article of blogArticles) {
      const html = await renderPost(article.slug);
      const sentence = articleProvenanceSentence(articleProvenanceFromAdmission(article.admission));
      expect(sentence, article.slug).toBe(
        article.admission.review === null
          ? "Drafted with AI from the source code. It has not been reviewed yet."
          : `Drafted with AI from the source code and reviewed by ${article.admission.review.reviewer}.`,
      );
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

  test("the evidence binder replaces known keys, rejects unknown ones, and leaves other text alone", () => {
    const bound = bindEvidence("{{evidence.scifact.exact}} then {{evidence.scifact.reranked}} and {{evidence.scifact.exact}}");
    expect(bound.text).toBe(`${evidenceFigures["scifact.exact"]} then ${evidenceFigures["scifact.reranked"]} and ${evidenceFigures["scifact.exact"]}`);
    expect(bound.figures).toEqual([evidenceFigures["scifact.exact"], evidenceFigures["scifact.reranked"]]);
    expect(bindEvidence("{{evidence.x}}.", { x: "1.5%" })).toEqual({ text: "1.5%.", figures: ["1.5%"] });
    expect(() => bindEvidence("{{evidence.missing}}")).toThrow("Unknown evidence figure {{evidence.missing}}.");
    expect(() => bindEvidence("{{evidence.toString}}")).toThrow("Unknown evidence figure {{evidence.toString}}.");
    expect(bindEvidence("no figures, {{release.version}}")).toEqual({ text: "no figures, {{release.version}}", figures: [] });
    expect(evidenceFigures["scifact.queries"]).toBe(scifactStudy.sampleSize.toLocaleString("en-US"));
    expect([evidenceFigures["scifact.exact"], evidenceFigures["scifact.reranked"]]).toEqual(scifactStudy.rows.map((row) => `${Number(row.value).toFixed(1)}%`));
    for (const [key, value] of Object.entries(evidenceFigures)) {
      expect(value, key).not.toBe("");
      expect(value, key).not.toContain("{{");
      expect(value, key).not.toContain("NaN");
    }
  });

  test("the study scale matches /benchmarks and the in-sample pilot stays off that page", async () => {
    expect(scifactStudy.evaluator).toContain(`over ${evidenceFigures["scifact.corpus"]} abstracts`);
    expect(await read("app/benchmarks/page.tsx")).not.toContain("<BenchmarkComparison study={pilotStudy}");
  });

  test("only bound figures may appear as percentages or decimals", () => {
    expect(figureTokens("<p>Up 12.5% or 79.98 %, from −13.33 to +6.67.</p>")).toEqual(["12.5%", "79.98%", "−13.33", "+6.67"]);
    expect(figureTokens('<p>GPT-5 mini, GPT-4o, <a href="/x-1.5">1,540 questions</a> on September 26, 2026, v0.22.5, 0.19.6, 0.19.x.</p>')).toEqual([]);
    expect(() => assertBoundFigures("x", "<p>12.5% better</p>", ["79.98%"])).toThrow("x shows figures the evidence binder did not produce: 12.5%");
    expect(() => assertBoundFigures("x", "<p>3.33 points</p>", ["−3.33"])).toThrow();
    expect(() => assertBoundFigures("x", "<p>From −3.33 (79.98%) in v1.2.3.</p>", ["−3.33", "79.98%", "1.2.3"])).not.toThrow();
  });

  test("every post shows only the figures its placeholders bind", async () => {
    for (const article of blogArticles) {
      const source = bindReleaseVersion(await read(`content/blog/${article.slug}.md`), publishedRelease?.version ?? null);
      const { figures } = bindEvidence(source);
      const produced = publishedRelease === null ? figures : [...figures, publishedRelease.version];
      expect(() => assertBoundFigures(article.slug, blogHtml[article.slug] ?? "", produced), article.slug).not.toThrow();
    }
  });

  test("every evidence figure is bound by some post", async () => {
    const used = new Set<string>();
    for (const article of blogArticles) {
      for (const match of (await read(`content/blog/${article.slug}.md`)).matchAll(/\{\{evidence\.([^{}]*)\}\}/gu)) used.add(match[1] ?? "");
    }
    expect([...used].sort()).toEqual(Object.keys(evidenceFigures).sort());
  });

  test("titles, deks, and eyebrows fit the article copy limits", () => {
    for (const article of blogArticles) {
      expect(article.title.length, article.slug).toBeLessThanOrEqual(70);
      expect(article.dek.length, article.slug).toBeLessThanOrEqual(200);
      expect(article.eyebrow.split(/\s+/u).length, article.slug).toBeLessThanOrEqual(3);
    }
    // The dek is also the page description, which STYLE.md keeps between 110 and 160 characters.
    const launchDek = blogArticles.find((article) => article.slug === launchSlug)?.dek ?? "";
    expect(launchDek.length).toBeGreaterThanOrEqual(110);
    expect(launchDek.length).toBeLessThanOrEqual(160);
  });

  test("the launch post types no figure of its own: digits appear only in names, dates, links, and code", async () => {
    const source = await read(`content/blog/${launchSlug}.md`);
    const prose = source
      .replaceAll(/\{\{[^{}]*\}\}/gu, "")
      .replaceAll(/\]\([^()]*\)/gu, "]")
      .replaceAll(/`[^`]*`/gu, "")
      .replaceAll(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/gu, "")
      .replaceAll(/\b(?:GPT-5|GPT-4o|BM25|UTF-8)\b/gu, "");
    expect(prose.match(/\d+/gu) ?? []).toEqual([]);
    expect(source).not.toContain("%");
    expect(figureTokens(blogHtml[launchSlug] ?? "").length).toBeGreaterThan(0);
  });

  test("the launch post leads the Wordcell workflow and links actual Wordcell search evidence", async () => {
    const source = await read(`content/blog/${launchSlug}.md`);
    expect(blogHtml[launchSlug]).toContain(evidenceFigures["scifact.queries"]);
    // The in-sample lab pipeline is never cited in the post, so its figure cannot read as a product score.
    expect(blogHtml[launchSlug]).not.toContain("93.07");
    expect(blogHtml[launchSlug]).not.toContain("Oh’s conversation-memory studies");
    expect(source.match(/Latest release: /gu)?.length).toBe(1);
    // The launch commands shipped in a release, so the post points to the release install and the release-pinned skill.
    expect(source).not.toMatch(/from source|source build|source install|until the next release|main branch/iu);
    expect(source).toContain("`bunx skills add hraness/wordcell#v{{release.version}} --skill wordcell`");
    const article = blogArticles.find((candidate) => candidate.slug === launchSlug);
    expect(article?.dek).not.toMatch(/source build/iu);
    for (const banned of [/\bSOTA\b/iu, /state of the art/iu, /CLONEMEM/iu, /\bwe\b/iu, /\bour\b/iu, /honest/iu, /\bthe first\b/iu, /\bthe only\b/iu]) {
      expect(source, String(banned)).not.toMatch(banned);
    }
  });

  test("the launch post links the Supermemory launch pages and pins every repository link", () => {
    const article = blogArticles.find((candidate) => candidate.slug === launchSlug);
    if (article === undefined) throw new Error(`${launchSlug} is missing from the registry.`);
    const hrefs = [...(blogHtml[launchSlug] ?? "").matchAll(/href="([^"]*)"/gu)].map((match) => match[1] ?? "");
    // The post covers these three pages; later launch routes, such as other comparison pages, are not its subject.
    const supermemoryLaunchPages = ["/benchmarks", "/compare/supermemory", "/migrate/supermemory"] as const;
    for (const route of supermemoryLaunchPages) {
      expect(launchRoutes, route).toContain(route);
      expect(hrefs.some((href) => href === route || href.startsWith(`${route}#`)), route).toBe(true);
    }
    const ohHrefs = hrefs.filter((href) => href.startsWith("https://github.com/hraness/oh/"));
    expect(ohHrefs).toHaveLength(0);
    const ohValues: string[] = Object.values(ohLinks);
    for (const href of ohHrefs) expect(ohValues).toContain(href);
    const sourceHrefs: string[] = article.sources.map((source) => source.href);
    for (const href of hrefs.filter((candidate) => /^https?:/u.test(candidate))) expect(sourceHrefs, href).toContain(href);
    for (const source of article.sources) {
      if (source.href.startsWith("https://github.com/hraness/wordcell/")) expect(source.href).toContain(`/blob/${launchCommit}/`);
      if (source.href.startsWith("https://github.com/hraness/oh/")) expect(ohValues).toContain(source.href);
      expect(source.checkedOn).toBe(article.published);
    }
    expect(article.admission.sources.map(({ title, url }) => ({ title, href: url }))).toEqual(
      article.sources.map(({ title, href }) => ({ title, href })),
    );
  });

  test("the introduction links the xcb post now that it is live", () => {
    expect(blogHtml["introducing-wordcell"]).toContain('href="https://xcb.sh/blog/how-xcb-uses-wordcell"');
  });

  test("contents lists appear only for posts with four or more sections", () => {
    const three = '<h2 id="a">A</h2><h2 id="b">B</h2><h2 id="c">C</h2>';
    expect(contentsFor(three)).toEqual([]);
    expect(contentsFor(`${three}<h2 id="d">D &amp; E</h2>`).map((item) => item.label)).toEqual(["A", "B", "C", "D & E"]);
  });

  test("related products come from the pinned portfolio facts", () => {
    // Design-kit v0.19.0 carries Wordcell's runtime relation to Oh and xcb's
    // relation to Wordcell. Posts show one card per relation: the product's
    // mark, name, and one-line description.
    expect(portfolioDigest).toBe("sha256:d43bbc1113c077b872d2e11a4a70490cd537d5734951d0c3c4bd8e061ce583a9");
    const related = relatedFor("kb");
    expect(related.map((entry) => entry.productId)).toEqual(["oh-computer", "xcb", "sponge"]);
    for (const entry of related) {
      expect(entry.mark).toStartWith("data:image/svg+xml,");
      expect(entry.role.length).toBeGreaterThan(0);
    }
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
