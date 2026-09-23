import type { Metadata } from "next";
import { AskAiAboutThis } from "@hraness/ui";

import { publishedRelease } from "../publication";
import { WordcellContentFooter } from "../site-footer";
import { readmeVersion } from "../readme.generated";
import { docCatalog, docQuadrants } from "./catalog";

const docsTitle = "Wordcell documentation";
const docsDescription =
  "Learn the loop on a first vault, finish a task, look up an exact interface, or read why the design works the way it does.";

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

const repository = "https://github.com/hraness/wordcell";

export default function Docs() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <main id="main" tabIndex={-1} className="document-page docs-index">
        <nav aria-label="Site" className="document-nav">
          <a href="/">Wordcell home</a>
          <a href="/developers">For developers</a>
          <a href={repository}>Source on GitHub</a>
          <a href={`${repository}/releases`}>Releases</a>
        </nav>
        {publishedRelease === null && <p>Release preview: the installation examples below target the forthcoming Wordcell release. <a href={`${repository}/releases`}>Check published releases before installing</a>.</p>}
        {publishedRelease !== null && publishedRelease.version !== readmeVersion && <p className="release-preview">Documentation preview for v{readmeVersion}. Installation examples use verified v{publishedRelease.version}. Features introduced after that release require the newer version; <a href={`${repository}/blob/main/CHANGELOG.md`}>check the release notes</a>.</p>}

        <h1>Wordcell documentation</h1>
        <p>
          The documentation follows the Diataxis split. Tutorials teach the full
          loop on a small vault. How-to guides finish a specific task. Reference
          pages state exact commands, formats, and limits. Explanation pages
          carry the design and its evidence. Prefer one page?{" "}
          <a href="/docs/overview">Read the complete product overview</a>.
        </p>

        <section aria-labelledby="install" className="docs-install">
          <h2 id="install">Install</h2>
          {publishedRelease === null ? (
            <p className="install-note">
              The first Wordcell release under this name is in preparation.{" "}
              <a href={`${repository}/releases`}>Check published releases</a>.
            </p>
          ) : (
            <>
              <pre className="install-command" tabIndex={0}><code>{`bun add --global --ignore-scripts https://github.com/hraness/wordcell/releases/download/v${publishedRelease.version}/hraness-wordcell-${publishedRelease.version}.tgz
wordcell --help`}</code></pre>
              <p className="install-note">
                Requires <a href="https://bun.sh/docs/installation">Bun 1.3.14 or newer</a> and Git.{" "}
                <a href="/docs/getting-started">Walk through the first vault</a> or{" "}
                <a href="/docs/reference">read the installation reference</a>.
              </p>
            </>
          )}
        </section>

        {docQuadrants.map((quadrant) => (
          <section aria-labelledby={`docs-${quadrant.id}`} key={quadrant.id}>
            <h2 id={`docs-${quadrant.id}`}>{quadrant.label}</h2>
            <p className="docs-quadrant-hint">{quadrant.hint}</p>
            <ul className="docs-list">
              {docCatalog.filter((entry) => entry.quadrant === quadrant.id).map((entry) => (
                <li key={entry.slug}>
                  <a href={`/docs/${entry.slug}`}>{entry.title}</a>
                  <p>{entry.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <AskAiAboutThis className="ask-ai" url="https://wordcell.io/docs" />
      <WordcellContentFooter />
    </>
  );
}
