import type { Metadata } from "next";
import { AskAiAboutThis } from "@hraness/ui";

import { publishedRelease } from "../publication";
import { WordcellContentFooter } from "../site-footer";
import { readmeHtml, readmeTitle } from "../readme.generated";

const docsTitle = `${readmeTitle} documentation`;
const docsDescription = "The complete Wordcell README: installation, vault format, command surface, capture, graph, skills, and release notes.";

export const metadata: Metadata = {
  title: docsTitle,
  description: docsDescription,
  alternates: { canonical: "/docs" },
  openGraph: {
    title: docsTitle,
    description: docsDescription,
    siteName: "Wordcell",
    type: "article",
    url: "/docs",
  },
  twitter: {
    card: "summary_large_image",
    title: docsTitle,
    description: docsDescription,
  },
};

export default function Docs() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <main id="main" tabIndex={-1} className="document-page">
        <nav aria-label="Site" className="document-nav">
          <a href="/">Wordcell home</a>
          <a href="https://github.com/hraness/wordcell">Source on GitHub</a>
          <a href="https://github.com/hraness/wordcell/releases">Releases</a>
        </nav>
        {publishedRelease === null && <p>Release preview: the installation examples below target the forthcoming Wordcell release. <a href="https://github.com/hraness/wordcell/releases">Check published releases before installing</a>.</p>}
        <article dangerouslySetInnerHTML={{ __html: readmeHtml }} />
      </main>
      <AskAiAboutThis className="ask-ai" url="https://wordcell.io/docs" />
      <WordcellContentFooter />
    </>
  );
}
