import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MarketingSection, ProductHero } from "@hraness/design-kit/react/server";

import { longDate, prose } from "../../../wordcell/format";
import { pilotInterval } from "../../../wordcell/oh-evidence";
import { WordcellPageChrome } from "../../../wordcell/page-chrome";
import {
  formatPlanCredits,
  formatPlanPrice,
  formatUsageRate,
  supermemoryPricing,
} from "../../../wordcell/supermemory-pricing";

const pageTitle = "Wordcell and Supermemory compared";
const pageDescription =
  "Compare Supermemory’s hosted memory engine with a Wordcell vault of Markdown files: where memory lives, how it forms, and what it costs.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/compare/supermemory" },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    siteName: "Wordcell",
    type: "website",
    url: "/compare/supermemory",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const checkedOn = longDate(supermemoryPricing.checkedOn);
const pricedPlans = supermemoryPricing.plans.flatMap((plan) => plan.monthlyUsd === null ? [] : [plan]);
const cheapestPlan = pricedPlans.reduce((low, plan) => (plan.monthlyUsd < low.monthlyUsd ? plan : low));
const dearestPlan = pricedPlans.reduce((high, plan) => (plan.monthlyUsd > high.monthlyUsd ? plan : high));
const selfHosting = "https://supermemory.ai/docs/self-hosting/overview";

type Difference = Readonly<{ topic: string; supermemory: ReactNode; wordcell: ReactNode }>;

const differences: readonly Difference[] = [
  {
    topic: "Where memory lives",
    supermemory: <>A hosted API. <a href={selfHosting}>Supermemory local</a> runs the same engine on your machine with a model you provide.</>,
    wordcell: "Markdown files in a folder you choose, usually a Git repository you already have.",
  },
  {
    topic: "How memories form",
    supermemory: <>It extracts facts and <a href="https://supermemory.ai/docs/concepts/user-profiles">user profiles</a> from the content you send.</>,
    wordcell: "You or your agent write notes and typed relations, and you review them in Git like code.",
  },
  {
    topic: "Whose memory",
    supermemory: <><a href="https://supermemory.ai/docs/concepts/container-tags">Container tags</a> isolate each user’s memories, and API keys can be limited to chosen tags.</>,
    wordcell: "One person’s or one team’s vault. It does not store memory for the users of your product.",
  },
  {
    topic: "Cost",
    supermemory: <><a href={selfHosting}>Supermemory local</a> is free and open source, without connectors or the Supermemory MCP. Hosted <a href={supermemoryPricing.href}>plans</a> run from {formatPlanPrice(cheapestPlan)} to {formatPlanPrice(dearestPlan)}, plus the usage rates below, checked {checkedOn}; Enterprise pricing is custom.</>,
    wordcell: <>Free and MIT licensed. <a href="/docs/reranking">Reranking</a> is optional; it sends the query and each candidate’s title, path, and up to 512 bytes of its snippet to a paid provider.</>,
  },
  {
    topic: "Connectors",
    supermemory: <><a href="https://supermemory.ai/docs/connectors/overview">Connectors</a> sync sources such as Google Drive, Gmail, Notion, and GitHub.</>,
    wordcell: <>No sync service. <code>wordcell clip</code> saves web pages, and the migration guide has <a href="/docs/migration-from-supermemory#replace-connectors">recipes for other sources</a>.</>,
  },
  {
    topic: "Compliance",
    supermemory: <>Its <a href="https://supermemory.ai/docs/overview/security">security page</a> lists SOC 2 Type II and a HIPAA business associate agreement on some plans.</>,
    wordcell: "No hosted memory store. Notes stay on your disk and with the Git host you choose, and publishing sends only the notes you select.",
  },
  {
    topic: "Agent access",
    supermemory: <>A <a href="https://supermemory.ai/docs/supermemory-mcp/mcp">hosted MCP server</a>, after an OAuth sign-in.</>,
    wordcell: <><code>wordcell mcp</code> serves a vault to local MCP clients. It is available from source until the next release.</>,
  },
];

export default function CompareSupermemory() {
  return (
    <WordcellPageChrome path="/compare/supermemory">
      <ProductHero
        backdrop={false}
        align="start"
        boundary={`Supermemory’s features and prices were checked on ${checkedOn}.`}
        className="wordcell-marketing-hero"
        eyebrow="Compare"
        heading="Supermemory is a hosted memory engine for agents and the apps you build. Wordcell keeps your memory in Markdown files you own."
        headingId="hero-title"
        name=""
        summary="Both give agents a memory. They differ in where it lives, how it forms, who owns the files, and what it costs."
      />

      <MarketingSection
        heading="How they differ"
        headingId="differences-title"
        id="differences"
        summary="Each Supermemory entry links the page it comes from."
      >
        <div aria-label="Supermemory and Wordcell differences" className="wordcell-comparison wordcell-stack" role="region" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                <th scope="col">Supermemory</th>
                <th scope="col">Wordcell</th>
              </tr>
            </thead>
            <tbody>
              {differences.map((difference) => (
                <tr key={difference.topic}>
                  <th scope="row">{difference.topic}</th>
                  <td data-label="Supermemory">{difference.supermemory}</td>
                  <td data-label="Wordcell">{difference.wordcell}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MarketingSection>

      <MarketingSection
        heading="Which to choose"
        headingId="choose-title"
        id="choose"
        summary="The deciding question is whose memory you keep, and whether you want the files themselves to be that memory."
      >
        <h3 className="wordcell-limits-title" id="choose-supermemory">Choose Supermemory when</h3>
        <ul className="wordcell-limits">
          <li>You build a product that stores memory for many users.</li>
          <li>You want connectors, fact extraction, and user profiles to run for you.</li>
          <li>You need SOC 2 Type II or a HIPAA business associate agreement from the memory provider.</li>
          <li>You want one hosted memory shared across ChatGPT, Claude, Cursor, and other clients through its <a href="https://supermemory.ai/">MCP server or plugins</a>, without running anything locally.</li>
        </ul>
        <h3 className="wordcell-limits-title" id="choose-wordcell">Choose Wordcell when</h3>
        <ul className="wordcell-limits">
          <li>Your agents keep memory about your own work, and you want it in files you can read, edit, and diff.</li>
          <li>You want every memory change reviewed in Git, like code.</li>
          <li>You want memory as plain files, with no server to run, account, or usage bill.</li>
        </ul>
        <p className="record-link"><a href="/docs/comparisons#consider-supermemory-for-a-memory-api-inside-your-product">Read the full comparison with Mem0, Zep, and other tools</a></p>
      </MarketingSection>

      <MarketingSection
        heading="Supermemory pricing"
        headingId="pricing-title"
        id="pricing"
        summary="Supermemory’s published monthly plans and usage rates."
      >
        <div aria-label="Supermemory plans" className="wordcell-comparison wordcell-stack" role="region" tabIndex={0}>
          <table>
            <caption className="wordcell-table-caption">Monthly plans, checked {checkedOn}</caption>
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Price</th>
                <th scope="col">Included credits</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {supermemoryPricing.plans.map((plan) => (
                <tr key={plan.name}>
                  <th scope="row">{plan.name}</th>
                  <td data-label="Price">{formatPlanPrice(plan)}</td>
                  <td data-label="Included credits">{formatPlanCredits(plan)}</td>
                  <td data-label="Notes">{plan.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div aria-label="Supermemory usage rates" className="wordcell-comparison wordcell-stack" role="region" tabIndex={0}>
          <table>
            <caption className="wordcell-table-caption">Usage rates on every plan, checked {checkedOn}</caption>
            <thead>
              <tr>
                <th scope="col">Usage</th>
                <th scope="col">Rate</th>
              </tr>
            </thead>
            <tbody>
              {supermemoryPricing.usage.map((rate) => (
                <tr key={rate.item}>
                  <th scope="row">{rate.item}</th>
                  <td data-label="Rate">{formatUsageRate(rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="wordcell-limits">
          {supermemoryPricing.terms.map((term) => <li key={term}>{term}</li>)}
        </ul>
        <p className="install-note">Source: <a href={supermemoryPricing.href}>Supermemory pricing</a>. Wordcell has no plan or usage charge; optional reranking is billed by its provider.</p>
      </MarketingSection>

      <MarketingSection
        heading="Evidence"
        headingId="evidence-title"
        id="evidence"
        summary="Wordcell has published no head-to-head comparison with Supermemory of retrieval quality or speed."
      >
        <p>The Oh memory kernel that Wordcell embeds published a {prose(pilotInterval.pairedQuestions)}-question pilot that includes Supermemory. It is Oh’s result, not Wordcell’s, and {pilotInterval.crossesZero ? `it does not separate ${pilotInterval.left} from ${pilotInterval.right}` : "it is a small pilot"}. The benchmarks page shows it with its limits.</p>
        <ul className="wordcell-limits">
          <li><a href="/benchmarks#comparisons">Benchmarks: matched and published comparisons</a></li>
          <li><a href="/migrate/supermemory">Move from Supermemory to Wordcell</a></li>
          <li><a href="/docs/migration-from-supermemory#what-does-not-transfer">What does not transfer from Supermemory</a></li>
        </ul>
      </MarketingSection>
    </WordcellPageChrome>
  );
}
