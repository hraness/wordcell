import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MarketingSection, ProductHero } from "@hraness/design-kit/react/server";

import { basicMemoryCheckedOn, basicMemoryPages } from "../../../wordcell/basic-memory-sources";
import { longDate } from "../../../wordcell/format";
import { WordcellPageChrome } from "../../../wordcell/page-chrome";

const pageTitle = "Wordcell vs Basic Memory: two Markdown knowledge graphs";
const pageDescription =
  "Basic Memory vs Wordcell: both keep a knowledge graph in Markdown files. Wordcell adds typed relations, vault checks, and notes tied to code paths.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/compare/basic-memory" },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    siteName: "Wordcell",
    type: "website",
    url: "/compare/basic-memory",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const checkedOn = longDate(basicMemoryCheckedOn);

type Difference = Readonly<{ topic: string; basicMemory: ReactNode; wordcell: ReactNode }>;

const differences: readonly Difference[] = [
  {
    topic: "Where notes live",
    basicMemory: <>Plain Markdown files on your machine, indexed into a <a href={basicMemoryPages.knowledgeFormat}>searchable, connected knowledge graph</a>. <a href={basicMemoryPages.cloud}>Basic Memory Cloud</a> is a hosted tier with a web app and a remote MCP endpoint.</>,
    wordcell: "Markdown files in a folder you choose, usually a Git repository you already have.",
  },
  {
    topic: "How notes form",
    basicMemory: <>An assistant writes and edits them through MCP tools such as <a href={basicMemoryPages.mcpTools}><code>write_note</code> and <code>edit_note</code></a>. You can also edit the files directly.</>,
    wordcell: "You or your agent write notes and typed relations, and you review them in Git like code.",
  },
  {
    topic: "Note structure",
    basicMemory: <>Facts are <a href={basicMemoryPages.knowledgeFormat}><code>[category]</code> observations</a> and links are <code>relation [[Note]]</code> lines. Categories and relation types are free text; optional <a href={basicMemoryPages.schemaSystem}>schemas</a> describe what a note type should contain.</>,
    wordcell: <><a href="/docs/reference#graph-reference">Typed relations</a> live in frontmatter as a predicate and an exact note path, and <code>wordcell check</code> verifies links, metadata, and attachments without changing files.</>,
  },
  {
    topic: "Search",
    basicMemory: <>The <a href={basicMemoryPages.mcpTools}>tool reference</a> documents text, vector, and hybrid search with structured filters and bounded graph traversal.</>,
    wordcell: <>Exact search, links, and Git history need no model. A local index adds keyword and vector retrieval, and <a href="/docs/reranking">hosted reranking</a> is optional.</>,
  },
  {
    topic: "Agent access",
    basicMemory: <>MCP is the interface: <code>search_notes</code>, <code>read_note</code>, and <code>build_context</code> <a href={basicMemoryPages.mcpLocal}>run the same locally and on Cloud</a>.</>,
    wordcell: <>The CLI and TypeScript SDK first. <code>wordcell mcp</code> serves a vault to local MCP clients.</>,
  },
  {
    topic: "Repository context",
    basicMemory: <>Notes group into <a href={basicMemoryPages.projectsAndFolders}>projects and folders</a>: separate knowledge bases, each with its own graph and search index.</>,
    wordcell: <><code>repository_scopes</code> tie a note to code paths, so <a href="/docs/agent-memory#route-current-memory-from-the-code-path"><code>wordcell context</code> for a repository path</a> returns the notes and rules that apply to it.</>,
  },
  {
    topic: "Cost",
    basicMemory: <>Local use is free under the <a href={basicMemoryPages.license}>AGPL-3.0 license</a>. <a href={basicMemoryPages.cloud}>Cloud</a> requires a subscription.</>,
    wordcell: <>Free and MIT licensed. <a href="/docs/reranking">Reranking</a> is optional; it sends the query and each candidate’s title, path, and up to 512 bytes of its snippet to a paid provider.</>,
  },
];

export default function CompareBasicMemory() {
  return (
    <WordcellPageChrome path="/compare/basic-memory">
      <ProductHero
        backdrop={false}
        align="start"
        boundary={`Basic Memory’s features and license were checked on ${checkedOn}.`}
        className="wordcell-marketing-hero"
        eyebrow="Compare"
        heading="Wordcell and Basic Memory"
        headingId="hero-title"
        name=""
        summary="Basic Memory indexes Markdown notes into a knowledge graph your assistant works through MCP tools. Wordcell adds typed relations, vault checks, and memory scoped to repository paths. Pick Basic Memory if you want the assistant to write the structure through MCP tools; pick Wordcell if you want links checked and notes tied to your code."
      />

      <MarketingSection
        heading="How they differ"
        headingId="differences-title"
        id="differences"
        summary="Each Basic Memory entry links the page it comes from."
      >
        <div aria-label="Basic Memory and Wordcell differences" className="wordcell-comparison wordcell-stack" role="region" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                <th scope="col">Basic Memory</th>
                <th scope="col">Wordcell</th>
              </tr>
            </thead>
            <tbody>
              {differences.map((difference) => (
                <tr key={difference.topic}>
                  <th scope="row">{difference.topic}</th>
                  <td data-label="Basic Memory">{difference.basicMemory}</td>
                  <td data-label="Wordcell">{difference.wordcell}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MarketingSection>

      <MarketingSection
        heading="Who should pick which"
        headingId="choose-title"
        id="choose"
        summary="The deciding question is who writes the structure, and whether memory should know about your code."
      >
        <h3 className="wordcell-limits-title" id="choose-basic-memory">Choose Basic Memory when</h3>
        <ul className="wordcell-limits">
          <li>You want the assistant to do the structuring: it writes categorized observations and wikilink relations through MCP tools.</li>
          <li>You want a hosted tier with a <a href={basicMemoryPages.cloud}>web app, a remote MCP endpoint, and snapshots</a>.</li>
          <li>You prefer <a href={basicMemoryPages.knowledgeFormat}>memory:// permalinks</a> and forgiving link resolution over exact note paths.</li>
        </ul>
        <h3 className="wordcell-limits-title" id="choose-wordcell">Choose Wordcell when</h3>
        <ul className="wordcell-limits">
          <li>Your agents keep memory about your own work, and you want it in files you can read, edit, and diff.</li>
          <li>You want every memory change reviewed in Git, like code.</li>
          <li>You want notes tied to repository paths, so an agent opening a file gets the memory that applies to it.</li>
          <li>You want memory as plain files, with no hosted tier, account, or usage bill.</li>
        </ul>
        <p className="record-link"><a href="/docs/comparisons#consider-basic-memory-for-an-mcp-centered-knowledge-graph">Read the full comparison with QMD, Obsidian, and other tools</a></p>
      </MarketingSection>

      <MarketingSection
        heading="What carries over from Basic Memory"
        headingId="moving-title"
        id="moving"
        summary="Basic Memory notes are already Markdown, so the files themselves carry over. The markup around them does not, and there is no importer."
      >
        <ul className="wordcell-limits">
          <li>Copy the files into a vault and run <code>wordcell check --root kb</code>. Wikilinks written as <code>[[note-id]]</code> keep resolving; a link written as a title or permalink is reported as broken.</li>
          <li>A <code>relation [[Note]]</code> line reads as an ordinary link. A <a href="/docs/reference#graph-reference">typed relation</a> needs <code>relations:</code> frontmatter with the target’s exact vault path.</li>
          <li><code>[category]</code> observations stay as plain list items; Wordcell does not index categories separately.</li>
          <li>Schema notes do not carry over. Wordcell validation comes from <code>wordcell check</code> and the frontmatter format, not per-type schemas.</li>
        </ul>
      </MarketingSection>

      <MarketingSection
        heading="What has been measured"
        headingId="evidence-title"
        id="evidence"
        summary="Wordcell has published no head-to-head comparison with Basic Memory of retrieval quality or speed."
      >
        <p>Both tools keep the record in files on your machine, so this page compares documented capabilities. Each Basic Memory claim links the page it comes from.</p>
        <ul className="wordcell-limits">
          <li><a href="/docs/getting-started">Set up a vault on your own notes</a></li>
          <li><a href="/docs/comparisons">The comparisons guide covers QMD, Obsidian, Mem0, and more</a></li>
        </ul>
      </MarketingSection>
    </WordcellPageChrome>
  );
}
