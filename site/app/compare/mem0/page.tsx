import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MarketingSection, ProductHero } from "@hraness/design-kit/react/server";

import { longDate } from "../../../wordcell/format";
import { mem0CheckedOn, mem0Pages } from "../../../wordcell/mem0-sources";
import { WordcellEvidenceStrip } from "../../../wordcell/evidence-strip";
import { WordcellPageChrome } from "../../../wordcell/page-chrome";

const pageTitle = "Wordcell vs Mem0: agent notes or per-user app memory";
const pageDescription =
  "Mem0 vs Wordcell: Mem0 extracts and stores facts about each user of your app; Wordcell keeps your own agents’ memory as Markdown notes you own.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/compare/mem0" },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    siteName: "Wordcell",
    type: "website",
    url: "/compare/mem0",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const checkedOn = longDate(mem0CheckedOn);

type Difference = Readonly<{ topic: string; mem0: ReactNode; wordcell: ReactNode }>;

const differences: readonly Difference[] = [
  {
    topic: "Where memory lives",
    mem0: <>The <a href={mem0Pages.platformOverview}>Platform</a> is managed: Mem0 runs the vector store, language model, and embedder. The <a href={mem0Pages.platformVsOss}>open-source SDK</a> runs them on infrastructure you provision.</>,
    wordcell: "Markdown files in a folder you choose, usually a Git repository you already have.",
  },
  {
    topic: "How memories form",
    mem0: <>Your application sends messages to <code>add</code>; a model <a href={mem0Pages.howItWorks}>extracts durable facts</a>, deduplicates them, and links the entities they mention.</>,
    wordcell: "You or your agent write notes and typed relations, and you review them in Git like code.",
  },
  {
    topic: "Whose memory",
    mem0: <>Memories are scoped by <code>user_id</code>, <code>agent_id</code>, or <code>run_id</code>, and by <code>app_id</code> on the Platform, so <a href={mem0Pages.platformVsOss}>each end user of your product</a> keeps separate memories.</>,
    wordcell: "One person’s or one team’s vault. It does not store memory for the users of your product.",
  },
  {
    topic: "Platform and open source",
    mem0: <><a href={mem0Pages.platformVsOss}>Several features are Platform-only</a>: the entity graph, temporal reasoning, memory decay, webhooks, and memory export. The <a href={mem0Pages.repository}>open-source SDK</a> is Apache-2.0.</>,
    wordcell: "One MIT-licensed codebase. There is no hosted tier, so no feature list is split across one.",
  },
  {
    topic: "Change over time",
    mem0: <>On the Platform, <a href={mem0Pages.platformVsOss}>temporal reasoning</a> boosts memories whose dates match the query’s time, and memory decay dampens stale ones at search time.</>,
    wordcell: <>A <a href="/docs/reference#graph-reference"><code>supersedes</code> relation</a> points from a newer note to the one it replaces, and Git keeps every earlier version.</>,
  },
  {
    topic: "Cost",
    mem0: <>The SDK is free under <a href={mem0Pages.license}>Apache-2.0</a>, and you pay for the vector store, LLM, and embedder you provision. The <a href={mem0Pages.platformVsOss}>Platform</a> is the managed service: an API key is all you configure.</>,
    wordcell: <>Free and MIT licensed. <a href="/docs/reranking">Reranking</a> is optional; it sends the query and each candidate’s title, path, and up to 512 bytes of its snippet to a paid provider.</>,
  },
  {
    topic: "Agent access",
    mem0: <>Python and TypeScript SDKs, a REST API, and a <a href={mem0Pages.mcp}>hosted MCP server</a> at <code>mcp.mem0.ai</code> behind OAuth or an API key.</>,
    wordcell: <><code>wordcell mcp</code> serves a vault to local MCP clients over standard input and output.</>,
  },
];

export default function CompareMem0() {
  return (
    <WordcellPageChrome path="/compare/mem0">
      <ProductHero
        backdrop={false}
        align="start"
        boundary={`Mem0’s features and license were checked on ${checkedOn}.`}
        className="wordcell-marketing-hero"
        eyebrow="Compare"
        heading="Wordcell and Mem0"
        headingId="hero-title"
        name=""
        summary="Mem0 extracts and stores memories about each user of your application. Wordcell keeps your own working memory in Markdown files you own. Mem0 distills the messages you send into stored facts, managed or self-hosted; Wordcell notes hold what a person or agent chose to write."
      />

      <MarketingSection
        heading="How they differ"
        headingId="differences-title"
        id="differences"
        summary="Each Mem0 entry links the page it comes from."
      >
        <div aria-label="Mem0 and Wordcell differences" className="wordcell-comparison wordcell-stack" role="region" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                <th scope="col">Mem0</th>
                <th scope="col">Wordcell</th>
              </tr>
            </thead>
            <tbody>
              {differences.map((difference) => (
                <tr key={difference.topic}>
                  <th scope="row">{difference.topic}</th>
                  <td data-label="Mem0">{difference.mem0}</td>
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
        summary="The deciding question is whose memory you keep: the users of your product, or yourself and your agents."
      >
        <h3 className="wordcell-limits-title" id="choose-mem0">Choose Mem0 when</h3>
        <ul className="wordcell-limits">
          <li>Your product should remember facts about each end user without anyone writing notes.</li>
          <li>You want extraction, storage, and retrieval managed for you, with webhooks and memory export on top.</li>
          <li>You are prepared to provision a vector store, a language model, and an embedder for the open-source SDK.</li>
        </ul>
        <h3 className="wordcell-limits-title" id="choose-wordcell">Choose Wordcell when</h3>
        <ul className="wordcell-limits">
          <li>Your agents keep memory about your own work, and you want it in files you can read, edit, and diff.</li>
          <li>You want every memory change reviewed in Git, like code.</li>
          <li>You want memory as plain files, with no hosted service, no account, and no usage bill.</li>
        </ul>
        <p className="record-link"><a href="/docs/comparisons#consider-mem0-for-extracted-memories-in-your-application">Read the full comparison with Supermemory, Zep, and other tools</a></p>
      </MarketingSection>

      <MarketingSection
        heading="Moving from Mem0 means writing notes"
        headingId="moving-title"
        id="moving"
        summary="Mem0 memories are extracted facts behind an API, not files you already have. There is no importer."
      >
        <ul className="wordcell-limits">
          <li>Export what exists first: the Platform’s <a href={mem0Pages.platformVsOss}>memory export</a> runs structured jobs over filtered memories, and the open-source SDK returns them from <code>get_all</code>.</li>
          <li>Decide which facts deserve a note. A Wordcell note holds what a person or agent chose to write, so author it rather than convert it.</li>
          <li>There is no <code>wordcell import mem0</code> and no <code>/migrate</code> page; moving means writing the notes.</li>
        </ul>
      </MarketingSection>

      <MarketingSection
        heading="What has been measured"
        headingId="evidence-title"
        id="evidence"
        summary="Wordcell has published no head-to-head comparison with Mem0 of retrieval quality or speed."
      >
        <p>Mem0 publishes its own figures on its <a href="https://mem0.ai/research">research page</a>. The benchmarks page shows them with their sources, as published figures rather than a matched ranking.</p>
        <p>Wordcell does publish measurements against its own baseline, each with raw results you can rerun:</p>
        <WordcellEvidenceStrip />
        <ul className="wordcell-limits">
          <li><a href="/benchmarks#comparisons">Benchmarks: matched and published comparisons</a></li>
          <li><a href="/docs/comparisons">The comparisons guide covers Supermemory, Zep, and more</a></li>
        </ul>
      </MarketingSection>
    </WordcellPageChrome>
  );
}
