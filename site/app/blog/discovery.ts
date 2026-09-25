import type { Metadata } from "next";
import {
  articleJsonLd,
  blogJsonLd,
  createArticleMetadata,
  createAtomFeed,
  createBlogSitemapPaths,
  createFeedEntry,
  NOINDEX_ROBOTS,
  type ArticleDiscovery,
  type ArticleParty,
  type FeedDiscovery,
  type SearchSite,
} from "@hraness/web-discovery";
import { isArticleIndexable, type ArticleIsoDate } from "@hraness/design-kit";

import { siteDescription } from "../site-description";
import {
  articlePath,
  BLOG_DESCRIPTION,
  BLOG_FEED_PATH,
  BLOG_PATH,
  BLOG_TITLE,
  indexableArticles,
  type BlogArticle,
} from "./articles";

export const site = {
  description: siteDescription,
  name: "Wordcell",
  origin: "https://wordcell.io",
  title: "Wordcell",
} as const satisfies SearchSite;

export const hraness = { kind: "Organization", name: "Hraness" } as const satisfies ArticleParty;

/** The site's social card, reused as each post's representative image. */
const socialImage = {
  alt: "Wordcell: Give the next session what this one learned",
  contentType: "image/png",
  height: 630,
  path: "/opengraph-image",
  width: 1200,
} as const;

/** Article dates are calendar days; discovery records take UTC midnight of that day. */
export function timestamp(date: ArticleIsoDate): string {
  return `${date}T00:00:00.000Z`;
}

export function articleDiscovery(article: BlogArticle): ArticleDiscovery {
  return {
    authors: [hraness],
    blogPath: BLOG_PATH,
    canonicalPath: articlePath(article),
    description: article.dek,
    image: socialImage,
    keywords: article.tags,
    publishedTime: timestamp(article.published),
    ...(article.updated === undefined ? {} : { modifiedTime: timestamp(article.updated) }),
    publisher: hraness,
    section: article.eyebrow,
    title: article.title,
    type: "BlogPosting",
  };
}

/** Page metadata; a post that has not passed review is served with noindex. */
export function articleMetadata(article: BlogArticle): Metadata {
  const metadata = createArticleMetadata(site, articleDiscovery(article));
  return {
    ...metadata,
    title: `${article.title} · Wordcell blog`,
    alternates: { ...metadata.alternates, types: { "application/atom+xml": BLOG_FEED_PATH } },
    robots: isArticleIndexable(article.admission) ? metadata.robots : NOINDEX_ROBOTS,
  };
}

export function articleSchema(article: BlogArticle) {
  return articleJsonLd(site, articleDiscovery(article));
}

export const blogDiscovery = {
  description: BLOG_DESCRIPTION,
  name: BLOG_TITLE,
  path: BLOG_PATH,
  publisher: hraness,
} as const;

export function blogSchema() {
  return blogJsonLd(site, blogDiscovery, indexableArticles.map(articleDiscovery));
}

export const feed = {
  authors: [hraness],
  description: BLOG_DESCRIPTION,
  homePath: BLOG_PATH,
  path: BLOG_FEED_PATH,
  title: BLOG_TITLE,
} as const satisfies FeedDiscovery;

/** Atom feed of indexable posts only, with each post's rendered body. */
export function blogAtomFeed(bodies: Readonly<Record<string, string>>): string {
  return createAtomFeed(site, feed, indexableArticles.map((article) => {
    const contentHtml = bodies[article.slug];
    if (contentHtml === undefined) throw new Error(`No rendered body for ${article.slug}.`);
    return createFeedEntry(articleDiscovery(article), { contentHtml, summary: article.dek });
  }));
}

/** Sitemap entries for the blog index and every indexable post, dated by publication or update. */
export function blogSitemapPaths() {
  return createBlogSitemapPaths({ path: BLOG_PATH }, indexableArticles.map(articleDiscovery));
}
