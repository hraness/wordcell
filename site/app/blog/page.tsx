import type { Metadata } from "next";
import { AskAiAboutThis } from "@hraness/ui";
import { ArticleIndex } from "@hraness/design-kit/react/server";
import { JsonLdScript } from "@hraness/web-discovery/json-ld";

import { WordcellContentFooter } from "../site-footer";
import {
  articlePath,
  BLOG_DESCRIPTION,
  BLOG_FEED_PATH,
  BLOG_PATH,
  BLOG_TITLE,
  indexableArticles,
} from "./articles";
import { blogSchema } from "./discovery";

export const metadata: Metadata = {
  title: BLOG_TITLE,
  description: BLOG_DESCRIPTION,
  alternates: {
    canonical: BLOG_PATH,
    types: { "application/atom+xml": BLOG_FEED_PATH },
  },
  openGraph: {
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    siteName: "Wordcell",
    type: "website",
    url: BLOG_PATH,
  },
  twitter: {
    card: "summary_large_image",
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
  },
};

export default function BlogIndex() {
  return (
    <>
      <JsonLdScript data={blogSchema()} id="blog-schema" />
      <a className="skip-link" href="#main">Skip to content</a>
      <main id="main" tabIndex={-1} className="document-page blog-page">
        <nav aria-label="Site" className="document-nav">
          <a href="/">Wordcell home</a>
          <a href="/docs">Documentation</a>
          <a href={BLOG_FEED_PATH}>Atom feed</a>
        </nav>
        <ArticleIndex
          heading={BLOG_TITLE}
          headingId="blog-title"
          headingLevel={1}
          items={indexableArticles.map((article) => ({
            href: articlePath(article),
            title: article.title,
            dek: article.dek,
            eyebrow: article.eyebrow,
            published: article.published,
            ...(article.updated === undefined ? {} : { updated: article.updated }),
          }))}
          summary={BLOG_DESCRIPTION}
        />
      </main>
      <AskAiAboutThis className="ask-ai" url="https://wordcell.io/blog" />
      <WordcellContentFooter />
    </>
  );
}
