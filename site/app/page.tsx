import {
  MarketingCallToAction,
  MarketingInstallPanel,
  MarketingInterfaceGrid,
  MarketingPage,
  MarketingPrimitives,
  MarketingQuestionList,
  MarketingSection,
  MarketingSiteHeader,
  MarketingStatStrip,
  MarketingTrustBoundary,
  ProductHero,
} from "@hraness/design-kit/react/server";
import { ThemeMenuButton } from "@hraness/design-kit/react";

import { AskAiAboutThis } from "@hraness/ui";

import { publishedRelease } from "./publication";
import { WordcellContentFooter } from "./site-footer";
import { WordcellField } from "../wordcell/field";
import { WordcellIcon, type WordcellIconName } from "../wordcell/icons";
import { readmeLead, readmeTitle } from "./readme.generated";

const releaseVersion = publishedRelease?.version;
const releaseSupports0220 = releaseVersion !== undefined && (Number(releaseVersion.split(".")[0]) > 0 || Number(releaseVersion.split(".")[1]) >= 22);
const repository = "https://github.com/hraness/wordcell";
const memoryBenchmarks = "https://github.com/hraness/oh/blob/main/benchmarks/EVOLUTION_RELEASE_RESULTS.md";
const archiveUrl = releaseVersion === undefined ? null : `${repository}/releases/download/v${releaseVersion}/hraness-wordcell-${releaseVersion}.tgz`;

const heading = "The Markdown knowledge base with superpowers";
const footnote =
  `Free and MIT licensed. Local Markdown. No account or model for exact search.${releaseVersion === undefined ? " First Wordcell release in preparation." : ` Current verified release v${releaseVersion}.`}`;

const primitives = [
  {
    icon: "markdown",
    label: "Files you own",
    summary: "Notes stay plain Markdown with YAML frontmatter. Read them in Obsidian, diff them in Git, rebuild every index from the files.",
  },
  {
    icon: "kb",
    label: "A typed ontology",
    summary: "Give a note a type and typed relationships: supports, supersedes, informed-by. Backlinks and graph queries recover the structure you authored.",
  },
  {
    icon: "search",
    label: "Search by words or meaning",
    summary: "Exact search needs no model or account. Optional semantic search fuses keyword and vector ranks, then joins each match to live metadata.",
  },
  {
    icon: "backlinks",
    label: "Backlinks",
    summary: "Every note knows what links to it. Traverse authored connections in either direction with explicit depth and node limits.",
  },
  {
    icon: "git-provenance",
    label: "History you can inspect",
    summary: "In a Git-backed vault, the commits behind a note are one command away. History returns as evidence, not a rewrite.",
  },
  {
    icon: "capture",
    label: "Sources you can reopen",
    summary: "Save a web page or PDF with its assets and a provenance receipt. Keep evidence beside the decision it informed.",
  },
  {
    icon: "scopes",
    label: "Context for a code path",
    summary: "Scope notes to repository paths. Starting from a file returns its notes, plans, and the rules that govern the edit.",
  },
  {
    icon: "cli",
    label: "Publish a selection",
    summary: "Choose notes, folders, or a linked neighborhood and emit a static site with browser-local search. You decide what ships.",
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

const questions: readonly { question: string; answer: string; after?: React.ReactNode }[] = [
  {
    question: "What does \"superpowers\" mean here?",
    answer: "The vault keeps Markdown authoritative while adding the structure a database usually owns: typed relationships, backlinks, graph proofs, semantic search joined to live metadata, Git provenance, and selective publishing. Each layer rebuilds from the files.",
  },
  {
    question: "Is Wordcell only for code?",
    answer: "No. The vault itself is general: notes, captured sources, plans, and research in plain Markdown. The code-related layers, repository scopes, AGENTS.md rules, and Git history, activate when the vault sits beside a repository.",
    after: <>{" "}The developer workflow has <a href="/developers">its own page</a>.</>,
  },
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
    answer: "QMD provides local document retrieval; Wordcell joins that retrieval to authored relationships, repository-path context, AGENTS.md rules, Git history, and selective publishing. Use QMD alone when search covers your needs.",
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
  { href: "#evidence", label: "Evidence" },
  { href: "/developers", label: "Developers" },
  { href: "#install", label: "Install" },
  { href: "/docs", label: "Docs" },
  { href: repository, label: "GitHub" },
] as const;

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
        brand="Wordcell"
        brandMark="/marks/kb.svg"
        brandLabel="Wordcell home"
        links={navigation}
        trailing={<ThemeMenuButton aria-label="Appearance" />}
      />

      <main id="main" tabIndex={-1}>
        <MarketingPage>
          <div className="hraness-material-wall">
          <WordcellField />
          <ProductHero
            align="start"
            actions={[
              { href: "#install", label: "Install Wordcell" },
              { href: "/docs", label: "Read the docs" },
            ]}
            boundary={footnote}
            className="wordcell-marketing-hero"
            eyebrow="Plain Markdown · typed links · local-first"
            heading={heading}
            headingId="hero-title"
            name=""
            summary={readmeLead}
          />
          </div>

          <MarketingInstallPanel
            eyebrow="Get started"
            heading="Save and find your first decision"
            headingId="install-title"
            id="install"
          >
            <p className="install-note">{releaseVersion === undefined ? "First Wordcell release in preparation" : `Current verified release · v${releaseVersion}`}</p>
            {publishedRelease !== null && archiveUrl !== null ? (
              <>
                <figure className="wordcell-step">
                  <figcaption><span>1</span>Install the CLI</figcaption>
                  <pre className="install-command" tabIndex={0}><code>{`bun add --global --ignore-scripts ${archiveUrl}
wordcell --help`}</code></pre>
                </figure>
                <figure className="wordcell-step">
                  <figcaption><span>2</span>Create a vault and save a note</figcaption>
                  <pre className="install-command" tabIndex={0}><code>{`wordcell init kb
wordcell note create notes/parser-contract \\
  --title "Parser contract" --type concept \\
  --body "Parser retries stop after three attempts." --root kb`}</code></pre>
                </figure>
                <figure className="wordcell-step">
                  <figcaption><span>3</span>Find it again</figcaption>
                  <pre className="install-command" tabIndex={0}><code>{`wordcell search "parser retries" --root kb --mode exact`}</code></pre>
                </figure>
                <p className="install-note">
                  <a href={publishedRelease.verificationRun}>Public release verification</a>.{" "}
                  Install <a href="https://bun.sh/docs/installation">Bun 1.3.14 or newer</a> and Git first.{" "}
                  <a href="/docs/getting-started">Walk the first-vault tutorial</a> or{" "}
                  <a href="/docs/overview#install">use an existing vault or connect your agent</a>.
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
            heading="The superpowers, concretely"
            headingId="model-title"
            id="model"
            items={primitives.map((primitive) => ({
              example: <WordcellIcon className="wordcell-topic-icon" name={primitive.icon as WordcellIconName} />,
              label: primitive.label,
              summary: primitive.summary,
            }))}
            label="Capabilities"
            summary="A vault is a folder of Markdown. Wordcell layers the structure a database would own over files you can still read anywhere."
          />

          <MarketingSection
            heading="A memory core with published numbers"
            headingId="memory-title"
            id="memory"
            label="Benchmarks"
            summary="Wordcell derives its graph authority from Oh, the Hraness memory kernel. Its completed retrieval studies measure the engine your vault builds on."
          >
            <MarketingStatStrip
              ariaLabel="Oh memory-kernel benchmark results"
              columns={3}
              source={<>Oh full-release studies, September 2026. In-sample scores measure the kernel, not retrieval on your vault. <a href={memoryBenchmarks}>Method, limits, and raw reports</a>.</>}
              stats={[
                {
                  label: "LongMemEval-S",
                  value: "89.8%",
                  detail: "500 questions. Identical-budget BM25 reached 85.4%.",
                },
                {
                  label: "LoCoMo",
                  value: "84.4%",
                  detail: "1,540 questions at a 24 KB budget. Published peers score 66.9-75.1.",
                },
                {
                  label: "Paired wins vs BM25",
                  value: "39-17",
                  detail: "Same reader, same frozen contexts. Sign test p = 0.0023.",
                },
              ]}
            />
          </MarketingSection>

          <MarketingSection
            heading="A fifth of the context for the same answer"
            headingId="evidence-title"
            id="evidence"
            label="Measured"
            summary="Packed snippets carry what matched, not the whole note. Across four queries on a seven-note public vault, snippets used 80% fewer UTF-8 bytes than the same notes in full."
          >
            <div aria-label="Packed snippets: 12,126 bytes. The same notes in full: 60,584 bytes." className="wordcell-bytes" role="group">
              <div className="wordcell-bytes-row">
                <div className="wordcell-bytes-track"><div className="wordcell-bytes-bar wordcell-bytes-bar--primary" style={{ inlineSize: "20%" }} /></div>
                <p className="wordcell-bytes-meta"><strong>12,126 bytes</strong><span>Packed snippets</span></p>
              </div>
              <div className="wordcell-bytes-row">
                <div className="wordcell-bytes-track"><div className="wordcell-bytes-bar" style={{ inlineSize: "100%" }} /></div>
                <p className="wordcell-bytes-meta"><strong>60,584 bytes</strong><span>The same notes in full</span></p>
              </div>
            </div>
            <p className="install-note">Payload size, not accuracy; savings depend on your notes and query. <a href={`${repository}/blob/main/docs/evidence.md`}>Method, raw results, and reproduction</a>.</p>
            <p className="install-note">In a separate opt-in study, hosted Jev reranking put a relevant result first for 161 of 300 SciFact queries, versus 101 without it. Scientific abstracts, paid provider. <a href={`${repository}/blob/main/docs/reranking.md#evidence-and-limits`}>Study and limits</a>.</p>
          </MarketingSection>

          <MarketingSection
            heading="At home beside a repository"
            headingId="developers-title"
            id="developers"
            label="For agents"
            summary="The same vault grounds a coding agent: scope notes to repository paths, inherit the rules that govern an edit, recover the commits behind a decision."
          >
            <pre className="install-command" tabIndex={0}><code>{`wordcell context packages/parser/src/index.ts --root kb --repo .
wordcell history notes/parser-contract --root kb --repo .`}</code></pre>
            <p className="record-link"><a href="/developers">Wordcell for developers and their agents</a></p>
          </MarketingSection>

          <MarketingSection
            heading="Where Wordcell fits"
            headingId="compare-title"
            id="compare"
            label="Compare"
            summary="Local files are a shared strength. Wordcell brings authored structure, retrieval, and publishing into one workflow."
          >
            <div className="wordcell-comparison" role="region" aria-label="Workflow comparison" tabIndex={0}>
              <table>
                <thead><tr><th scope="col">Start with</th><th scope="col">When it fits</th><th scope="col">What Wordcell adds</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Markdown + Git</th><td>A small set of notes you can navigate yourself.</td><td>Backlinks, typed relationships, metadata queries, and code-path context without moving the files.</td></tr>
                  <tr><th scope="row">QMD</th><td>Local document search with CLI, SDK, and agent integrations.</td><td>Current notes joined to authored relationships, AGENTS.md rules, Git evidence, and publishing.</td></tr>
                  <tr><th scope="row">Basic Memory</th><td>A local Markdown knowledge graph for AI conversations.</td><td>A workflow centered on repository paths, explicit edit rules, and code history.</td></tr>
                  <tr><th scope="row">Obsidian or a static publisher</th><td>An interactive notes workspace or a site built from Markdown.</td><td>Headless agent workflows and repeatable selection of notes to publish.</td></tr>
                </tbody>
              </table>
            </div>
            <p className="record-link"><a href={`${repository}/blob/main/docs/comparisons.md`}>Compare capabilities, tradeoffs, and primary sources</a></p>
          </MarketingSection>

          <MarketingSection
            heading="Publish exactly the slice you choose"
            headingId="publish-title"
            id="publish"
            label="Publish"
            summary="Select notes, preview the selection, and build a static site with readable pages and browser-local search. No model or hosted service required."
          >
            {releaseSupports0220 ? (
              <pre className="install-command" tabIndex={0}><code>{`wordcell publish --root kb --out site \\
  --include notes/parser-contract --include plans/parser-v2 \\
  --dry-run --json`}</code></pre>
            ) : <p className="install-note">Static publishing is introduced in v0.22.0. The current verified install above predates this feature; check the release notes before using it.</p>}
            <p className="install-note">Publishing writes a local folder; you choose when and where to upload it. Review selected text and attachments before sharing, selection does not redact secrets.</p>
            <p className="record-link"><a href={`${repository}/blob/main/docs/publish.md`}>Select notes, inspect the output, and host your site</a></p>
          </MarketingSection>

          <MarketingInterfaceGrid
            heading="Terminal, agent, or code"
            headingId="interfaces-title"
            id="interfaces"
            interfaces={[
              {
                label: "CLI",
                summary: "Search, capture, link, and validate from a terminal or a script.",
                example: (
                  <>
                    <WordcellIcon className="wordcell-topic-icon" name="cli" />
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
                    <WordcellIcon className="wordcell-topic-icon" name="sdk" />
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
                    <WordcellIcon className="wordcell-topic-icon" name="agent-skill" />
                    {releaseVersion === undefined ? <p>The first Wordcell skill release is in preparation.</p> : <pre tabIndex={0}><code>{`bunx skills add hraness/wordcell#v${releaseVersion} --skill wordcell`}</code></pre>}
                    <p className="interface-link"><a href={`${repository}/blob/main/skills/wordcell/SKILL.md`}>Inspect the packaged skill</a></p>
                  </>
                ),
              },
            ]}
            label="Interfaces"
            summary="Start with the CLI. Add the Agent Skill for guided workflows, or use the SDK to build read-only context retrieval into your own tools."
          />

          <MarketingSection
            heading="The record stays yours"
            headingId="boundary-title"
            id="boundary"
            label="Trust"
            summary="The local core runs without a hosted knowledge service. External capabilities have separate, explicit boundaries."
          >
            <MarketingTrustBoundary
              heading="Files, processing, and evidence"
              headingId="kernel-title"
              id="kernel"
              items={trust}
              label="Local by default"
              summary="Know what stays on your machine and what each result can tell you."
            />
          </MarketingSection>



          <MarketingQuestionList
            heading="Before you install"
            headingId="questions-title"
            id="questions"
            label="FAQ"
            questions={questions.map(({ after, answer, question }) => ({
              answer: <p>{answer}{after}</p>,
              question,
            }))}
          />

          <MarketingCallToAction
            actions={[
              { href: "#install", label: "Install Wordcell" },
              { href: "/docs", label: "Read the docs" },
            ]}
            footnote={footnote}
            heading="Knowledge that outlives the session"
            headingId="cta-title"
            summary="Save one decision. Find it in search months later. Connect an agent when you are ready."
          />
        </MarketingPage>
      </main>

      <AskAiAboutThis className="ask-ai" url="https://wordcell.io" />

      <WordcellContentFooter />
    </div>
  );
}
