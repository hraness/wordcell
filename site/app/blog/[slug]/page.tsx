import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AskAiAboutThis } from "@hraness/ui";
import { articleProvenanceFromAdmission } from "@hraness/design-kit";
import { relatedFor } from "@hraness/design-kit/portfolio";
import {
  ArticleRelatedProducts,
  ArticleSources,
  MarketingArticle,
} from "@hraness/design-kit/react/server";
import { JsonLdScript } from "@hraness/web-discovery/json-ld";

import { WordcellContentFooter } from "../../site-footer";
import { blogArticles, findArticle } from "../articles";
import { blogContents, blogHtml } from "../blog.generated";
import { articleMetadata, articleSchema } from "../discovery";

export function generateStaticParams() {
  return blogArticles.map((article) => ({ slug: article.slug }));
}

export const dynamicParams = false;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const article = findArticle(slug);
  return article === null ? {} : articleMetadata(article);
}

export default async function BlogPostPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const article = findArticle(slug);
  const html = blogHtml[slug];
  if (article === null || html === undefined) notFound();
  const related = relatedFor("kb");

  return (
    <>
      <JsonLdScript data={articleSchema(article)} id="article-schema" />
      <a className="skip-link" href="#main">Skip to content</a>
      <main id="main" tabIndex={-1} className="document-page blog-page">
        <nav aria-label="Site" className="document-nav">
          <a href="/">Wordcell home</a>
          <a href="/blog">Blog</a>
          <a href="/docs">Documentation</a>
        </nav>
        <MarketingArticle
          after={(
            <>
              <ArticleSources headingId="sources" sources={article.sources} />
              {related.length === 0 ? null : <ArticleRelatedProducts headingId="related" items={related} />}
            </>
          )}
          author={{ kind: "organization", name: "Hraness" }}
          dek={article.dek}
          eyebrow={article.eyebrow}
          heading={article.title}
          provenance={articleProvenanceFromAdmission(article.admission)}
          published={article.published}
          toc={blogContents[slug] ?? []}
          {...(article.updated === undefined ? {} : { updated: article.updated })}
        >
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </MarketingArticle>
      </main>
      <AskAiAboutThis className="ask-ai" url={`https://wordcell.io/blog/${article.slug}`} />
      <WordcellContentFooter />
    </>
  );
}
