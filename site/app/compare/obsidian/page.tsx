import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MarketingSection, ProductHero } from "@hraness/design-kit/react/server";

import { longDate } from "../../../wordcell/format";
import { obsidianCheckedOn, obsidianPages } from "../../../wordcell/obsidian-sources";
import { WordcellPageChrome } from "../../../wordcell/page-chrome";
import { routeTitles } from "../../route-titles";

const pageTitle = routeTitles.compareObsidian.title;
const pageDescription = "Use Obsidian to write and browse Markdown notes. Wordcell gives your coding agent search, repository rules, and the history behind decisions.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/compare/obsidian" },
  openGraph: { title: pageTitle, description: pageDescription, siteName: "Wordcell", type: "website", url: "/compare/obsidian" },
  twitter: { card: "summary_large_image", title: pageTitle, description: pageDescription },
};

type Difference = Readonly<{ topic: string; obsidian: ReactNode; wordcell: ReactNode }>;

const differences: readonly Difference[] = [
  {
    topic: "Your notes",
    obsidian: <>Markdown files in a <a href={obsidianPages.storage}>local vault</a>, which other editors and tools can read and change.</>,
    wordcell: "The same Markdown files, with notes, sources, and plans kept beside your code and reviewed in Git.",
  },
  {
    topic: "Daily work",
    obsidian: <>A visual note editor with linked notes. Open an <a href={obsidianPages.vault}>existing folder as a vault</a> and write there.</>,
    wordcell: <>A CLI, TypeScript SDK, and <a href="/docs/reference#connect-a-client">local MCP server</a> that your coding agent uses to find and maintain context.</>,
  },
  {
    topic: "Search",
    obsidian: <><a href={obsidianPages.search}>Core search</a> matches words, phrases, and operators over notes and canvases.</>,
    wordcell: <>Exact search needs no model. Add an optional local model for keyword and semantic retrieval; <a href="/docs/reranking">hosted reranking</a> is optional.</>,
  },
  {
    topic: "Automation",
    obsidian: <>The <a href={obsidianPages.cli}>Obsidian CLI</a> reads, searches, and creates notes through the running desktop app.</>,
    wordcell: <>Run headless commands over a vault. <code>wordcell context</code> returns notes for a code path, applicable AGENTS.md rules, and optional Git context.</>,
  },
  {
    topic: "Decisions and history",
    obsidian: <>Notes remain readable files, and you can <a href={obsidianPages.storage}>manage the vault with Git</a>.</>,
    wordcell: <>Named relationships connect decisions. <a href="/docs/graph-authority">Oh</a> follows the links with source proofs; <code>wordcell history</code> returns commits behind a note.</>,
  },
  {
    topic: "Publishing",
    obsidian: <><a href={obsidianPages.publish}>Obsidian Publish</a> hosts selected notes as a site through an optional subscription.</>,
    wordcell: <><a href="/docs/publish">Publish selected notes</a> as static files with navigation, search, and backlinks, then host them where you choose.</>,
  },
  {
    topic: "Cost",
    obsidian: <><a href={obsidianPages.pricing}>The editor is free</a>. Sync and Publish are optional paid services.</>,
    wordcell: "Free and MIT licensed. Hosted reranking is optional and billed by its provider.",
  },
];

export default function CompareObsidian() {
  return (
    <WordcellPageChrome path="/compare/obsidian">
      <ProductHero
        align="start"
        backdrop={false}
        className="wordcell-marketing-hero"
        eyebrow="Compare"
        heading="Wordcell and Obsidian"
        headingId="hero-title"
        name=""
        summary="Use Obsidian to write and browse linked notes. Use Wordcell to give your coding agent the decisions, rules, and Git history for the file it is changing. They can work on the same Markdown vault."
      />
      <MarketingSection heading="Two ways to work with the same notes" headingId="differences-title" id="differences">
        <div aria-label="Obsidian and Wordcell differences" className="wordcell-comparison wordcell-stack" role="region" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Topic</th><th scope="col">Obsidian</th><th scope="col">Wordcell</th></tr></thead>
            <tbody>
              {differences.map((difference) => (
                <tr key={difference.topic}>
                  <th scope="row">{difference.topic}</th>
                  <td data-label="Obsidian">{difference.obsidian}</td>
                  <td data-label="Wordcell">{difference.wordcell}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="install-note">Obsidian’s documentation and pricing checked {longDate(obsidianCheckedOn)}.</p>
      </MarketingSection>
      <MarketingSection
        heading="Keep your editor and add agent memory"
        headingId="use-both-title"
        id="use-both"
        summary="Point Wordcell at an existing Markdown folder. Keep editing in Obsidian, add repository scopes to the notes that explain your code, and connect your coding agent to the vault."
      >
        <p className="record-link"><a href="/docs/getting-started">Set up Wordcell</a> · <a href="/docs/agent-memory">Give your agent repository context</a></p>
      </MarketingSection>
    </WordcellPageChrome>
  );
}
