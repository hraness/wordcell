import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AskAiAboutThis } from "@hraness/ui";

import { WordcellContentFooter } from "../../site-footer";
import { docCatalog, docQuadrants, type DocQuadrant } from "../catalog";
import { docHtml } from "../docs.generated";

const repository = "https://github.com/hraness/wordcell";

const overviewEntry = {
  slug: "overview",
  title: "Wordcell overview",
  summary: "The complete product README rendered as one page.",
  quadrant: null,
  sourcePath: "README.md",
} as const;

interface DocSource {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly quadrant: DocQuadrant | null;
  readonly sourcePath: string;
  readonly html: string;
}

function findDoc(slug: string): DocSource | null {
  const html = docHtml[slug];
  if (slug === overviewEntry.slug) {
    return html === undefined ? null : { ...overviewEntry, html };
  }
  const entry = docCatalog.find((candidate) => candidate.slug === slug);
  if (entry === undefined || html === undefined) return null;
  return { ...entry, sourcePath: `docs/${entry.slug}.md`, html };
}

export function generateStaticParams() {
  return [...docCatalog.map((entry) => ({ slug: entry.slug })), { slug: overviewEntry.slug }];
}

export const dynamicParams = false;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const doc = findDoc(slug);
  if (doc === null) return {};
  const title = `${doc.title} · Wordcell documentation`;
  return {
    title,
    description: doc.summary,
    alternates: { canonical: `/docs/${doc.slug}` },
    openGraph: {
      title,
      description: doc.summary,
      siteName: "Wordcell",
      type: "article",
      url: `/docs/${doc.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: doc.summary,
    },
  };
}

export default async function DocPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const doc = findDoc(slug);
  if (doc === null) notFound();
  const quadrant = docQuadrants.find((candidate) => candidate.id === doc.quadrant);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <main id="main" tabIndex={-1} className="document-page">
        <nav aria-label="Site" className="document-nav">
          <a href="/">Wordcell home</a>
          <a href="/docs">Documentation</a>
          {quadrant !== undefined && <span className="document-nav-quadrant">{quadrant.label}</span>}
        </nav>
        <article dangerouslySetInnerHTML={{ __html: doc.html }} />
        <p className="document-source">
          Source: <a href={`${repository}/blob/main/${doc.sourcePath}`}>{doc.sourcePath} on GitHub</a>
        </p>
      </main>
      <AskAiAboutThis className="ask-ai" url={`https://wordcell.io/docs/${doc.slug}`} />
      <WordcellContentFooter />
    </>
  );
}
