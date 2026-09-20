import {
  MarketingCallToAction,
  MarketingInstallPanel,
  MarketingInterfaceGrid,
  MarketingPage,
  MarketingPrimitives,
  MarketingProofFrame,
  MarketingQuestionList,
  MarketingSection,
  MarketingSiteHeader,
  MarketingTrustBoundary,
  ProductHero,
} from "@hraness/design-kit/react/server";
import { ThemeMenuButton } from "@hraness/design-kit/react";

import { AskAiAboutThis } from "@hraness/ui";

function TopicIcon({ slug }: Readonly<{ slug: string }>) {
  // Decorative local SVG; next/image cannot optimize vector sources.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="wordcell-topic-icon" src={`/icons/${slug}.svg`} alt="" aria-hidden="true" width="88" height="88" loading="lazy" decoding="async" />
  );
}

import { publishedRelease } from "./publication";
import { WordcellContentFooter } from "./site-footer";
import { readmeLead, readmeTitle } from "./readme.generated";

const releaseVersion = publishedRelease?.version;
const releaseSupports0220 = releaseVersion !== undefined && (Number(releaseVersion.split(".")[0]) > 0 || Number(releaseVersion.split(".")[1]) >= 22);
const repository = "https://github.com/hraness/wordcell";
const archiveUrl = releaseVersion === undefined ? null : `${repository}/releases/download/v${releaseVersion}/hraness-wordcell-${releaseVersion}.tgz`;

const heading = "Give coding agents the decisions behind your code";
const footnote =
  `Free and MIT licensed. Local Markdown. No account or model for exact search.${releaseVersion === undefined ? " First Wordcell release in preparation." : ` Current verified release v${releaseVersion}.`}`;

const primitives = [
  {
    icon: "markdown",
    label: "Notes",
    summary: "Keep decisions and explanations in files you can open in any editor. Obsidian, grep, Git, and Wordcell read the same record.",
  },
  {
    icon: "backlinks",
    label: "Connected decisions",
    summary: "Link a plan to the decision behind it. Backlinks show the work that depends on that note, using the links you authored.",
  },
  {
    icon: "search",
    label: "Local search",
    summary: "Find a saved phrase without a model. Add optional local semantic search through QMD when the right wording is hard to remember.",
  },
  {
    icon: "git-provenance",
    label: "Recorded history",
    summary: "Inspect the commits behind a note when its history matters. Git context is optional and comes from your repository's own log.",
  },
  {
    icon: "capture",
    label: "Sources you can reopen",
    summary: "Save a web page or PDF with its source details and assets. Keep the evidence alongside the decisions it informed.",
  },
  {
    icon: "scopes",
    label: "Context for a code path",
    summary: "Start from a file you are changing. Find its saved notes, plans, and applicable AGENTS.md rules before opening more context.",
  },
] as const;

const trust = [
  {
    label: "Your Markdown is the record",
    detail: "Notes and Git history stay in your files. Search indexes and graph caches are replaceable, and you can keep reading the vault without Wordcell.",
  },
  {
    label: "Local core, explicit external work",
    detail: "Exact search and graph queries need no account or hosted service. Web capture contacts its source. Optional Jev reranking and your agent's provider can receive selected content.",
  },
  {
    label: "Sources stay inspectable",
    detail: "Open the note, authored link, or commit behind a result. Saved context can be incomplete or out of date; Wordcell does not prove a note is true or recover unsaved conversations.",
  },
] as const;

const questions = [
  {
    question: "Can I use my existing Markdown or Obsidian vault?",
    answer: releaseSupports0220
      ? "Yes. Point exact search at your existing directory with --root. You can read and search without initializing or converting the files. Add links and repository scopes as you need them."
      : "Version 0.22.0 adds read-only search of an existing Markdown folder without initialization or an index.md file. The current verified install still needs a Wordcell index.md. Check the release notes before using the new existing-folder workflow.",
  },
  {
    question: "Is Wordcell fully local?",
    answer: "The core is local: your Markdown, exact search, graph queries, and optional QMD semantic search run on your machine. Semantic models download on first use. Web capture contacts the source, opt-in Jev reranking sends bounded context to a remote provider, and hosted agents follow their own data-handling settings.",
  },
  {
    question: "Do I need an embedding model or an account?",
    answer: "No for the quick start. Exact search, backlinks, and publishing need neither. Hybrid and semantic search add an optional local model through QMD. Bun 1.3.14 or newer and Git are required to use the CLI.",
  },
  {
    question: "What does Wordcell add to QMD?",
    answer: "QMD provides local retrieval and agent integrations, and Wordcell uses it for optional semantic search. Wordcell brings that retrieval together with authored relationships, repository-path context, AGENTS.md rules, Git history, and selective static publishing. Use QMD alone when document search covers your needs.",
  },
  {
    question: "Does publishing upload my whole vault?",
    answer: "No. Choose notes, folders, metadata, or linked neighborhoods, inspect a dry run, then build a local static site. You decide where to upload it. Notes marked publish: false stay out, but review selected text and attachments for private content before sharing.",
  },
  {
    question: "How do I connect my coding agent?",
    answer: "Install the wordcell Agent Skill after trying the CLI. It gives compatible agents instructions for working with a vault; it does not start a service, create a vault, or grant access to external accounts.",
  },
  {
    question: "Can I keep using an older kb vault?",
    answer: "Yes. Existing kb folders, Markdown, and identifiers need no migration. The command is wordcell; the deprecated kb command was removed in version 0.21.0.",
  },
  {
    question: "How are releases verified?",
    answer: "Each release is an immutable GitHub Release with a packing receipt, checksums, and signed provenance. The same archive bytes are mirrored to npm. The install section links the verification run for the advertised release.",
  },
  {
    question: "Who made it?",
    answer: "Built by Hraness. Hraness is an advanced software research organization dedicated to advancing the frontier of machine intelligence. Wordcell is published under the MIT license.",
  },
] as const;

const navigation = [
  { href: "#model", label: "Why Wordcell" },
  { href: "#compare", label: "Compare" },
  { href: "#install", label: "Install" },
  { href: "/docs", label: "Docs" },
  { href: repository, label: "GitHub" },
] as const;

function BrandMark() {
  return <img alt="" height={20} src="/icon.png" width={20} />;
}

export default function Home() {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      codeRepository: repository,
      description: readmeLead,
      license: "https://opensource.org/license/mit",
      name: readmeTitle,
      programmingLanguage: "TypeScript",
      runtimePlatform: "Bun",
      url: "https://wordcell.io",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: questions.map(({ answer, question }) => ({
        "@type": "Question",
        acceptedAnswer: { "@type": "Answer", text: answer },
        name: question,
      })),
    },
  ];

  return (
    <div data-hraness-marketing-preset="editorial">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        type="application/ld+json"
      />
      <a className="skip-link" href="#main">Skip to content</a>
      <MarketingSiteHeader
        className="hraness-material-chrome"
        action={{ href: "#install", label: "Install Wordcell" }}
        brand={<><BrandMark />Wordcell</>}
        brandLabel="Wordcell home"
        links={navigation}
        trailing={<ThemeMenuButton aria-label="Appearance" />}
      />

      <main id="main" tabIndex={-1}>
        <MarketingPage>
          <div className="hraness-material-wall">
          <ProductHero
            align="start"
            actions={[
              { href: "#install", label: "Install Wordcell" },
              { href: "/docs", label: "Read the docs" },
            ]}
            boundary={footnote}
            className="wordcell-marketing-hero"
            eyebrow=""
            frame={(
              <MarketingProofFrame
                className="hraness-material-pane"
                caption="Example commands: save a decision, then find it locally. No model or account required."
                credit="From the README"
                title="Save once. Find it next session."
              >
                <pre className="transcript" tabIndex={0}><code>{`$ wordcell init kb
$ wordcell note create notes/parser-contract \\
    --title "Parser contract" --type concept \\
    --body "Parser retries stop after three attempts." --root kb
$ wordcell search "parser retries" --root kb --mode exact`}</code></pre>
                <p>The result points to <code>notes/parser-contract</code> and the saved constraint.</p>
              </MarketingProofFrame>
            )}
            heading={heading}
            headingId="hero-title"
            name=""
            summary={readmeLead}
          />
          </div>

          <MarketingInstallPanel
            eyebrow=""
            heading="Save and find your first decision"
            headingId="install-title"
            id="install"
          >
            <p className="install-note">{releaseVersion === undefined ? "First Wordcell release in preparation" : `Current verified release · v${releaseVersion}`}</p>
            {publishedRelease !== null && archiveUrl !== null ? (
              <>
                <pre className="install-command" tabIndex={0}><code>{`bun add --global --ignore-scripts ${archiveUrl}
wordcell --help`}</code></pre>
                <pre className="install-command" tabIndex={0}><code>{`wordcell init kb
wordcell note create notes/parser-contract \\
  --title "Parser contract" --type concept \\
  --body "Parser retries stop after three attempts." --root kb
wordcell search "parser retries" --root kb --mode exact`}</code></pre>
                <p className="install-note">
                  <a href={publishedRelease.verificationRun}>Public release verification</a>.{" "}
                  Install <a href="https://bun.sh/docs/installation">Bun 1.3.14 or newer</a> and Git first.{" "}
                  <a href="/docs#install">Use an existing vault or connect your agent</a>.
                </p>
              </>
            ) : (
              <p className="install-note">
                Wordcell is being prepared for its first release under the new name.{" "}
                <a href={`${repository}/releases`}>Check published releases</a> or{" "}
                <a href="/docs">read the documentation</a>.
              </p>
            )}
          </MarketingInstallPanel>

          <MarketingPrimitives
            heading="Find the context behind the change"
            headingId="model-title"
            id="model"
            items={primitives.map((primitive) => ({
              example: <TopicIcon slug={primitive.icon} />,
              label: primitive.label,
              summary: primitive.summary,
            }))}
            label=""
            summary="A vault is a folder of Markdown. Wordcell connects its notes to your code and returns focused results you can inspect before an agent acts."
          />

          <MarketingSection
            heading="Smaller context, with a measurement you can inspect"
            headingId="evidence-title"
            id="evidence"
            label=""
            summary="In a four-query example over a seven-note public vault, packed search snippets used 80% fewer UTF-8 bytes than passing the same matching notes in full."
          >
            <div className="wordcell-measurement">
              <p><strong>12,126 bytes</strong><span>Packed snippets</span></p>
              <p><strong>60,584 bytes</strong><span>The same notes in full</span></p>
            </div>
            <p className="install-note">This measures context payload size. It is not a token, accuracy, latency, or competitor benchmark. Actual savings depend on your notes and query.</p>
            <p className="record-link"><a href={`${repository}/blob/main/docs/evidence.md`}>Read the method, raw results, and reproduction command</a></p>
            <p className="install-note">Optional hosted Jev reranking put a relevant result first for 161 of 300 public SciFact queries, versus 101 with Wordcell exact search alone. This paid external-provider study tests scientific abstracts, not repository notes or QMD. <a href={`${repository}/blob/main/docs/reranking.md#evidence-and-limits`}>Study and limits</a></p>
          </MarketingSection>

          <MarketingSection
            heading="Choose the workflow you need"
            headingId="compare-title"
            id="compare"
            label=""
            summary="Local files are a shared strength. Wordcell brings repository context, retrieval, and publishing into one workflow."
          >
            <div className="wordcell-comparison" role="region" aria-label="Workflow comparison" tabIndex={0}>
              <table>
                <thead><tr><th scope="col">Start with</th><th scope="col">When it fits</th><th scope="col">What Wordcell adds</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Markdown + Git</th><td>A small set of notes you can navigate yourself.</td><td>Backlinks, metadata queries, and code-path context without moving the files.</td></tr>
                  <tr><th scope="row">QMD</th><td>Local document search with CLI, SDK, and agent integrations.</td><td>Current notes joined to authored relationships, AGENTS.md rules, Git evidence, and publishing.</td></tr>
                  <tr><th scope="row">Basic Memory</th><td>A local Markdown knowledge graph for AI conversations.</td><td>A workflow centered on repository paths, explicit edit rules, and code history.</td></tr>
                  <tr><th scope="row">Obsidian or a static publisher</th><td>An interactive notes workspace or a site built from Markdown.</td><td>Headless agent workflows and repeatable selection of notes to publish.</td></tr>
                </tbody>
              </table>
            </div>
            <p className="record-link"><a href={`${repository}/blob/main/docs/comparisons.md`}>Compare capabilities, tradeoffs, and primary sources</a></p>
          </MarketingSection>

          <MarketingSection
            heading="Share a selected part of your knowledge"
            headingId="publish-title"
            id="publish"
            label=""
            summary="Choose the notes, preview the selection, and build a static site with readable pages and browser-local search. No model or hosted knowledge service is required."
          >
            {releaseSupports0220 ? (
              <pre className="install-command" tabIndex={0}><code>{`wordcell publish --root kb --out site \\
  --include notes/parser-contract --include plans/parser-v2 \\
  --dry-run --json`}</code></pre>
            ) : <p className="install-note">Static publishing is introduced in v0.22.0. The current verified install above predates this feature; check the release notes before using it.</p>}
            <p className="install-note">Publishing writes a local folder. You choose when and where to upload it. Review selected text and attachments before sharing; selection does not redact secrets.</p>
            <p className="record-link"><a href={`${repository}/blob/main/docs/publish.md`}>Select notes, inspect the output, and host your site</a></p>
          </MarketingSection>

          <MarketingInterfaceGrid
            heading="Use it from your terminal, agent, or code"
            headingId="interfaces-title"
            id="interfaces"
            interfaces={[
              {
                label: "CLI",
                summary: "Search, capture, link, and validate from a terminal or a script.",
                example: (
                  <>
                    <TopicIcon slug="cli" />
                    <pre tabIndex={0}><code>{`wordcell search "parser retries" \\
  --root kb --mode exact --history --repo .`}</code></pre>
                  </>
                ),
              },
              {
                label: "TypeScript SDK",
                summary: "Open a read-only session over one vault scan and compose bounded workflows.",
                example: (
                  <>
                    <TopicIcon slug="sdk" />
                    <pre tabIndex={0}><code>{`import { openKnowledgeBase } from "@hraness/wordcell/sdk";

const session = await openKnowledgeBase({ root: "kb" });
const hits = await session.search({ query: "parser contract", mode: "exact" });`}</code></pre>
                  </>
                ),
              },
              {
                label: "Agent Skill",
                summary: "Give your agent instructions for finding and maintaining saved context.",
                example: (
                  <>
                    <TopicIcon slug="agent-skill" />
                    {releaseVersion === undefined ? <p>The first Wordcell skill release is in preparation.</p> : <pre tabIndex={0}><code>{`bunx skills add hraness/wordcell#v${releaseVersion} --skill wordcell`}</code></pre>}
                    <p className="interface-link"><a href={`${repository}/blob/main/skills/wordcell/SKILL.md`}>Inspect the packaged skill</a></p>
                  </>
                ),
              },
            ]}
            label=""
            summary="Start with the CLI. Add the Agent Skill for guided workflows, or use the SDK to build read-only context retrieval into your own tools."
          />

          <MarketingSection
            heading="Keep control of the record"
            headingId="boundary-title"
            id="boundary"
            label=""
            summary="The local core runs without a hosted knowledge service. External capabilities have separate, explicit boundaries."
          >
            <MarketingTrustBoundary
              heading="Files, processing, and evidence"
              headingId="kernel-title"
              id="kernel"
              items={trust}
              label=""
              summary="Know what stays on your machine and what each result can tell you."
            />
          </MarketingSection>



          <MarketingQuestionList
            heading="Before you install"
            headingId="questions-title"
            id="questions"
            label=""
            questions={questions.map(({ answer, question }) => ({
              answer: <p>{answer}</p>,
              question,
            }))}
          />

          <MarketingCallToAction
            actions={[
              { href: "#install", label: "Install Wordcell" },
              { href: "/docs", label: "Read the docs" },
            ]}
            footnote={footnote}
            heading="Give the next session what this one learned"
            headingId="cta-title"
            summary="Save one decision, find it with exact search, and connect your agent when you are ready."
          />
        </MarketingPage>
      </main>

      <AskAiAboutThis className="ask-ai" url="https://wordcell.io" />

      <WordcellContentFooter />
    </div>
  );
}
