import type { Metadata } from "next";
import { AskAiAboutThis } from "@hraness/ui";

import { publishedRelease } from "../publication";
import { WordcellContentFooter } from "../site-footer";
import { readmeHtml, readmeTitle, readmeVersion } from "../readme.generated";

const docsTitle = `${readmeTitle} documentation`;
const docsDescription = "Start with a local Markdown decision, connect your coding agent, compare alternatives, and publish selected notes.";

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
        {publishedRelease !== null && publishedRelease.version !== readmeVersion && <p className="release-preview">Documentation preview for v{readmeVersion}. Installation examples use verified v{publishedRelease.version}. Features introduced after that release require the newer version; <a href="https://github.com/hraness/wordcell/blob/main/CHANGELOG.md">check the release notes</a>.</p>}
        <article dangerouslySetInnerHTML={{ __html: readmeHtml }} />
      </main>
      <AskAiAboutThis className="ask-ai" url="https://wordcell.io/docs" />
      <WordcellContentFooter />
    </>
  );
}
