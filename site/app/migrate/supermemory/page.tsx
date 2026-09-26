import type { Metadata } from "next";
import { MarketingSection, ProductHero } from "@hraness/design-kit/react/server";

import { longDate } from "../../../wordcell/format";
import {
  MIGRATION_GUIDE_PATH,
  migrationConcepts,
  migrationSteps,
  supermemoryFeaturesCheckedOn,
  supermemoryPages,
} from "../../../wordcell/migration-steps";
import { WordcellPageChrome } from "../../../wordcell/page-chrome";
import { SetupLinks } from "../../../wordcell/setup-links";

const pageTitle = "Migrate from Supermemory to Wordcell";
const pageDescription =
  "Export your Supermemory documents and memory entries, import them into a Wordcell vault as Markdown notes, and verify the result.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/migrate/supermemory" },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    siteName: "Wordcell",
    type: "website",
    url: "/migrate/supermemory",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const sessionMemoryReference = "https://github.com/hraness/wordcell/blob/main/skills/wordcell/references/session-memory.md#keep-a-profile-note";

export default function MigrateSupermemory() {
  return (
    <WordcellPageChrome path="/migrate/supermemory">
      <ProductHero
        backdrop={false}
        align="start"
        boundary={`Import from Supermemory and the local MCP server are available from source until the next release. Supermemory’s features were checked on ${longDate(supermemoryFeaturesCheckedOn)}.`}
        className="wordcell-marketing-hero"
        eyebrow="Migrate"
        heading="Move your Supermemory documents and memories into Markdown notes."
        headingId="hero-title"
        name=""
        summary="Export with the Supermemory API, import with one command, verify the result, and connect your agent. The full guide has the export scripts, every option, and what to do about connectors."
      />

      <MarketingSection
        heading="How Supermemory concepts map to a vault"
        headingId="concepts-title"
        id="concepts"
        summary="A vault is a folder of Markdown notes in Git. Most Supermemory concepts become notes, fields, or relations."
      >
        <p className="record-link"><a href={MIGRATION_GUIDE_PATH}>Read the full migration guide</a></p>
        <div aria-label="Supermemory concepts and their Wordcell equivalents" className="wordcell-comparison wordcell-stack" role="region" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Supermemory</th>
                <th scope="col">Wordcell</th>
              </tr>
            </thead>
            <tbody>
              {migrationConcepts.map((concept) => (
                <tr key={concept.supermemory}>
                  <th scope="row">{concept.href === undefined ? concept.supermemory : <a href={concept.href}>{concept.supermemory}</a>}</th>
                  <td data-label="Wordcell">{concept.wordcell}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="record-link"><a href={`${MIGRATION_GUIDE_PATH}#map-supermemory-concepts-to-wordcell`}>See the full concept map</a></p>
      </MarketingSection>

      <MarketingSection
        heading="Install, export, import, and verify"
        headingId="steps-title"
        id="steps"
        summary="Work in a directory outside the Wordcell checkout and outside any vault, so that the export files are never committed."
      >
        {migrationSteps.map((step, index) => (
          <figure className="wordcell-step" id={step.id} key={step.id}>
            <figcaption><span>{index + 1}</span>{step.title}</figcaption>
            <p className="install-note wordcell-step__lead">{step.lead}</p>
            <pre className="install-command" tabIndex={0}><code>{step.commands.join("\n")}</code></pre>
            <p className="install-note">{"note" in step ? <>{step.note} </> : null}<a href={step.href}>Details</a></p>
          </figure>
        ))}
      </MarketingSection>

      <MarketingSection
        heading="Connect your agent"
        headingId="connect-title"
        id="connect"
        summary="Wordcell’s local MCP server serves the vault to a local agent over standard input and output. It needs no account."
      >
        <SetupLinks />
        <p className="install-note">
          To keep a profile like Supermemory’s, ask your agent to follow the Wordcell skill’s <a href={sessionMemoryReference}>session-memory reference</a>. <a href={`${MIGRATION_GUIDE_PATH}#connect-your-agent`}>Connect your agent</a> in the guide has each client’s setup.
        </p>
      </MarketingSection>

      <MarketingSection
        heading="What does not transfer"
        headingId="not-transferred-title"
        id="not-transferred"
        summary="These hosted Supermemory features have no Wordcell equivalent."
      >
        <ul className="wordcell-limits">
          <li>The facts and relations Supermemory <a href={supermemoryPages.graphMemory}>infers from patterns across memories</a>, and its time-based forgetting of temporary facts.</li>
          <li><a href={supermemoryPages.connectors}>Managed connectors</a>. The guide shows how to <a href={`${MIGRATION_GUIDE_PATH}#replace-connectors`}>replace them with exports</a>.</li>
          <li>The <a href={supermemoryPages.mcp}>hosted MCP server</a>’s spaces and OAuth sign-in.</li>
        </ul>
        <p className="record-link"><a href={`${MIGRATION_GUIDE_PATH}#what-does-not-transfer`}>Read what does not transfer in the guide</a></p>
        <p className="record-link"><a href="/compare/supermemory">Compare Wordcell and Supermemory</a></p>
      </MarketingSection>
    </WordcellPageChrome>
  );
}
