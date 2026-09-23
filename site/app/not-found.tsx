import type { Metadata } from "next";

import { WordcellField } from "../wordcell/field";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div data-hraness-marketing-preset="editorial">
      <main className="wordcell-404" id="main">
        <WordcellField />
        <div className="wordcell-404-card">
          <span className="wordcell-note-type">missing note</span>
          <h1>Page not found</h1>
          <p>This page is not in the vault. The link may have moved, or the note was never written.</p>
          <p className="wordcell-404-links">
            <a href="/">Wordcell home</a>
            <span aria-hidden="true">·</span>
            <a href="/docs">Documentation</a>
            <span aria-hidden="true">·</span>
            <a href="/developers">For developers</a>
          </p>
        </div>
      </main>
    </div>
  );
}
