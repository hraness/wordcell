import {
  MarketingCallToAction,
  MarketingInstallPanel,
  MarketingInterfaceGrid,
  MarketingPage,
  MarketingPrimitives,
  MarketingQuestionList,
  MarketingRelated,
  MarketingSection,
  MarketingSiteHeader,
  MarketingTrustBoundary,
  ProductHero,
} from "@hraness/design-kit/react/server";
import { ThemeMenuButton } from "@hraness/design-kit/react";
import { product, type PortfolioProductId } from "@hraness/design-kit/portfolio";

import { AskAiAboutThis } from "@hraness/ui";
import { websiteJsonLd } from "@hraness/web-discovery";

import { publishedRelease } from "./publication";
import { WordcellIcon, type WordcellIconName } from "../wordcell/icons";
import { siteDescription } from "./site-description";
import { site } from "./blog/discovery";
import { BenchmarkComparison } from "../wordcell/benchmark-comparison";
import { scifactDetails, scifactStudy } from "../wordcell/benchmark-evidence";
import { SELECTED_PASSAGE_RELEASE, WordcellEvidenceStrip } from "../wordcell/evidence-strip";
import { prose } from "../wordcell/format";
import { formatBytes, handoffEvidence } from "../wordcell/handoff-evidence";
import { passageDetails, passageMissSentence, passageStudy } from "../wordcell/passage-evidence";
import { SetupLinks } from "../wordcell/setup-links";
import { AGENT_MEMORY_RELEASE } from "../wordcell/setup-prompt";

const releaseVersion = publishedRelease?.version;
const releaseSupports0220 = releaseVersion !== undefined && (Number(releaseVersion.split(".")[0]) > 0 || Number(releaseVersion.split(".")[1]) >= 22);
const repository = "https://github.com/hraness/wordcell";
const archiveUrl = releaseVersion === undefined ? null : `${repository}/releases/download/v${releaseVersion}/hraness-wordcell-${releaseVersion}.tgz`;

const heading = "Give coding agents the decisions behind your code.";
const summary =
  "Wordcell is a free, open-source CLI and local MCP server. It gives Claude Code, Codex, and Cursor the notes, plans, and AGENTS.md rules for the file they are about to change, from plain Markdown you review in Git.";
const footnote = releaseVersion === undefined
  ? "Free under the MIT license. Exact search needs no account or model. First Wordcell release in preparation."
  : `Latest release: v${releaseVersion} · Free under the MIT license · Exact search needs no account or model.`;

const primitives = [
  {
    icon: "markdown",
    label: "Files you own",
    summary: "Notes stay plain Markdown with YAML frontmatter. Read them in Obsidian, diff them in Git, rebuild every index from the files.",
  },
  {
    icon: "kb",
    label: "Named relationships",
    summary: "Give a note a type and link it to other notes with named relationships such as supersedes or informed-by. Backlinks and graph queries recover the structure you wrote.",
  },
  {
    icon: "search",
    label: "Search by words or meaning",
    summary: "Exact search needs no model or account. Optional hybrid search adds a local model, combines keyword and vector rankings, and pairs each match with the current version of its note.",
  },
  {
    icon: "backlinks",
    label: "Backlinks",
    summary: "See every note that links to a note, and follow links in either direction with a depth and result limit.",
  },
  {
    icon: "git-provenance",
    label: "History you can inspect",
    summary: "In a vault kept in Git, one command lists the commits that changed a note and the files that changed with it.",
  },
  {
    icon: "capture",
    label: "Sources you can reopen",
    summary: "Save a web page or PDF as Markdown with its assets and a record of where and how it was captured. Keep the source beside the decision it informed.",
  },
  {
    icon: "scopes",
    label: "Context for a code path",
    summary: "Tie notes to paths in a repository. Starting from a file, one command returns the notes and plans tied to it and the AGENTS.md rules that apply.",
  },
  {
    icon: "cli",
    label: "Publish a selection",
    summary: "Choose notes, folders, or the notes within a few links of one note, and build a static site with search that runs in the reader's browser.",
  },
] as const;

const trust = [
  {
    label: "Your Markdown is the record",
    detail: "Notes and Git history stay in your files. Search indexes and graph caches are replaceable, and you can keep reading the vault without Wordcell.",
  },
  {
    label: "What can leave your machine",
    detail: "Exact search and graph queries need no account or hosted service. Web capture contacts its source. Optional Jev reranking and your agent's provider can receive selected content.",
  },
  {
    label: "Sources stay inspectable",
    detail: "Open the note, authored link, or commit behind a result. Saved context can be incomplete or out of date; Wordcell does not prove a note is true or recover unsaved conversations.",
  },
] as const;

// Sibling cards show each product's registry mark, link, and one-line description.
const related = (id: PortfolioProductId, name: string) => {
  const { canonicalUrl, mark, oneLiner } = product(id);
  return { href: canonicalUrl, mark, name, role: oneLiner };
};

// Only products with a registered relationship to Wordcell appear here.
const relatedGroups = [
  {
    heading: "Works with Wordcell",
    headingId: "related-tools",
    items: [
      related("wrench", "Ghostget"),
      related("xcb", "xcb"),
      related("oh-computer", "Oh"),
    ],
  },
];

const questions: readonly { question: string; answer: string; after?: React.ReactNode }[] = [
  {
    question: "Is Wordcell only for code?",
    answer: "No. The vault itself is general: notes, captured sources, plans, and research in plain Markdown. The code-related features (repository scopes, AGENTS.md rules, and Git history) apply when the vault sits beside a repository.",
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
    answer: "The core is local: your Markdown, exact search, graph queries, and optional QMD semantic search run on your machine. Semantic models download on first use. Web capture contacts the source. Opt-in Jev reranking sends TypeSafe your query and each candidate note's identifier, title, path, and up to 512 bytes of its snippet. Hosted agents follow their own data-handling settings.",
  },
  {
    question: "Do I need an embedding model or an account?",
    answer: "Not for the quick start. Exact search, backlinks, and publishing need neither. Hybrid and semantic search add an optional local model through QMD. Bun 1.3.14 or newer and Git are required to use the CLI.",
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
    question: "How does Wordcell use Oh?",
    answer: "Wordcell is the Markdown knowledge base. Oh is the embedded memory framework that backs its named graph queries and source proofs. Your files and Git remain authoritative, and graph queries work without an Oh account or separate service. Wordcell search uses its own exact search and optional QMD or Jev integrations; Oh's conversation-memory benchmark scores do not measure that search path.",
    after: <>{" "}<a href="/docs/graph-authority#how-wordcell-and-oh-fit-together">Read the integration guide</a>.</>,
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
    answer: "",
    after: <><a href="https://hraness.com">Hraness</a>, which makes tools for agents and humans. Wordcell is MIT licensed, and its source is <a href={repository}>on GitHub</a>.</>,
  },
] as const;

const navigation = [
  { href: "#model", label: "Why Wordcell" },
  { href: "#evidence", label: "Evidence" },
  { href: "/developers", label: "Developers" },
  { href: "#install", label: "Install" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
  { href: repository, label: "GitHub" },
] as const;

export default function Home() {
  const structuredData = [
    websiteJsonLd(site),
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": "https://wordcell.io/#software",
      name: "Wordcell",
      url: "https://wordcell.io/",
      description: siteDescription,
      applicationCategory: "DeveloperApplication",
      license: "https://opensource.org/license/mit",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": "https://hraness.com/#organization" },
      ...(releaseVersion !== undefined && archiveUrl !== null ? { downloadUrl: archiveUrl, softwareVersion: releaseVersion } : {}),
      sameAs: [repository, "https://www.npmjs.com/package/@hraness/wordcell"],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      codeRepository: repository,
      description: siteDescription,
      license: "https://opensource.org/license/mit",
      name: "Wordcell",
      programmingLanguage: "TypeScript",
      runtimePlatform: "Bun",
      targetProduct: { "@id": "https://wordcell.io/#software" },
      url: "https://wordcell.io",
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
          <ProductHero
            backdrop={false}
            align="start"
            actions={[
              { href: "#install", label: "Install Wordcell" },
              { href: "/docs/getting-started", label: "See a note work" },
            ]}
            boundary={footnote}
            className="wordcell-hero"
            eyebrow="Markdown knowledge base"
            heading={heading}
            headingId="hero-title"
            name=""
            summary={summary}
          />
          </div>

          <MarketingInstallPanel
            eyebrow="Get started"
            heading="Save and find your first decision"
            headingId="install-title"
            id="install"
          >
            <p className="install-note">{releaseVersion === undefined ? "First Wordcell release in preparation" : <>You need <a href="https://bun.sh/docs/installation">Bun 1.3.14 or newer</a> and Git. These steps install Wordcell v{releaseVersion}.</>}</p>
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
                  Next, <a href="/docs/getting-started">follow the first-vault tutorial</a> or{" "}
                  <a href="/docs/overview#install">search an existing vault or connect a coding agent</a>.{" "}
                  <a href={publishedRelease.verificationRun}>See how this release was built and verified</a>.
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

          <MarketingSection
            heading="Let your agent search and add notes"
            headingId="agent-memory-title"
            id="agent-memory"
            label="Agent memory"
            summary="Wordcell’s local MCP server serves a vault to an agent such as Claude Code, Codex, or Cursor over standard input and output. Each note the agent adds or edits is a Markdown file you review in Git."
          >
            <p className="install-note">
              <code>wordcell mcp</code> and <code>wordcell import supermemory</code> need Wordcell {AGENT_MEMORY_RELEASE} or later. The prompt below installs Wordcell v{releaseVersion}.
            </p>
            <SetupLinks />
            <p className="install-note">
              <code>wordcell import supermemory</code> turns documents and memory entries exported from the Supermemory API into notes, and a later import updates the notes you have not edited.
            </p>
            <p className="record-link"><a href="/migrate/supermemory">Move your Supermemory documents and memories into Markdown notes</a></p>
          </MarketingSection>

          <MarketingPrimitives
            heading="What a vault gives you"
            headingId="model-title"
            id="model"
            items={primitives.map((primitive) => ({
              example: <WordcellIcon className="wordcell-topic-icon" name={primitive.icon as WordcellIconName} />,
              label: primitive.label,
              summary: primitive.summary,
            }))}
            label="Capabilities"
            summary="A vault is a folder of Markdown files. Wordcell adds the structure a database would provide, and the files stay readable in any editor."
          />

          <MarketingSection
            heading="Excerpts that contain the answer"
            headingId="memory-title"
            id="evidence"
            summary={`On sealed questions, Wordcell’s selected passages held the answer ${passageDetails.passageAnswers} times out of ${passageDetails.questions}, against ${passageDetails.snippetAnswers} for older snippets. Optional hosted Jev reranking put a relevant source first for ${scifactDetails.additionalFirstResults} more of ${scifactDetails.queries} public queries.`}
          >
            <span aria-hidden="true" id="memory" style={{ position: "absolute" }} />
            <WordcellEvidenceStrip />
            <BenchmarkComparison study={passageStudy}>
              <p>Both excerpts come from the same retrieved notes. Passages gained {passageDetails.gained} answers and lost {passageDetails.lost}. {passageMissSentence}</p>
              <p>Passages are chosen locally with <code>--selected-passage</code>, available in Wordcell {SELECTED_PASSAGE_RELEASE} and later. Ranking, scores, and reranker input stay the same.</p>
            </BenchmarkComparison>
            <BenchmarkComparison study={scifactStudy}>
              <p>nDCG at five rose from {scifactDetails.baselineNdcg} to {scifactDetails.rerankedNdcg}. It improved for {scifactDetails.improved} queries and regressed for {scifactDetails.regressed}. For {scifactDetails.missing} queries, neither candidate window contained a judged relevant source.</p>
              <p>Reranking sends bounded query and candidate context to a paid provider. It is optional; the local search path runs without it. QMD, Letta, and Supermemory were not evaluated under this protocol.</p>
            </BenchmarkComparison>
            <p className="record-link"><a href="/benchmarks">See Wordcell and Oh benchmark results with their sources and limits</a></p>
          </MarketingSection>

          <MarketingSection
            heading="A smaller first context handoff"
            headingId="evidence-title"
            id="context"
            summary={`Packed snippets carry what matched, not the whole note. Across ${prose(handoffEvidence.queries)} queries on a ${prose(handoffEvidence.noteCount)}-note public vault, snippets used ${Math.round(handoffEvidence.reductionPercent)}% fewer UTF-8 bytes than the same notes in full.`}
          >
            <div aria-label={`Packed snippets: ${formatBytes(handoffEvidence.packedBytes)}. The same notes in full: ${formatBytes(handoffEvidence.fullNoteBytes)}.`} className="wordcell-bytes" role="group">
              <div className="wordcell-bytes-row">
                <div className="wordcell-bytes-track"><div className="wordcell-bytes-bar wordcell-bytes-bar--primary" style={{ inlineSize: `${Math.round((handoffEvidence.packedBytes / handoffEvidence.fullNoteBytes) * 100)}%` }} /></div>
                <p className="wordcell-bytes-meta"><strong>{formatBytes(handoffEvidence.packedBytes)}</strong><span>Packed snippets</span></p>
              </div>
              <div className="wordcell-bytes-row">
                <div className="wordcell-bytes-track"><div className="wordcell-bytes-bar" style={{ inlineSize: "100%" }} /></div>
                <p className="wordcell-bytes-meta"><strong>{formatBytes(handoffEvidence.fullNoteBytes)}</strong><span>The same notes in full</span></p>
              </div>
            </div>
            <p className="install-note">Payload size, not accuracy; savings depend on your notes and query. <a href="/docs/evidence">Method, raw results, and reproduction</a>.</p>
          </MarketingSection>

          <MarketingSection
            heading="Your Markdown, backed by Oh"
            headingId="oh-title"
            id="oh"
            summary="Wordcell gives you the vault: notes, capture, search, and publishing. Oh supplies the embedded graph engine that traces a query result back to the authored links and source revision behind it."
          >
            <p className="wordcell-seam-copy">Markdown and Git remain authoritative. Graph queries work immediately in memory, with no Oh account or service to set up. An explicit rebuild can save a disposable local cache; nothing in that cache writes back to your notes.</p>
            <pre className="install-command" tabIndex={0}><code>{`wordcell graph query --program backlinks --note notes/parser-contract --root kb --json`}</code></pre>
            <p className="wordcell-seam-copy">Oh also provides a memory framework for applications. Its conversation-memory studies evaluate that separate retrieval path. Wordcell’s search results are measured above on their own inputs.</p>
            <p className="record-link"><a href="/docs/graph-authority#how-wordcell-and-oh-fit-together">Follow a note into its graph proof</a> · <a href="https://oh.computer/#benchmarks">Explore Oh and its benchmark evidence</a></p>
          </MarketingSection>

          <MarketingSection
            heading="At home beside a repository"
            headingId="developers-title"
            id="developers"
            label="For agents"
            summary="Beside a repository, the same vault gives a coding agent the notes tied to the file it is changing, the AGENTS.md rules that apply, and the commits behind a decision."
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
            summary="Use the lightest tool that holds what your agent needs. Wordcell fits when that memory outgrows one file and should be reviewed in Git like code."
          >
            <div className="wordcell-comparison" role="region" aria-label="Workflow comparison" tabIndex={0}>
              <table>
                <thead><tr><th scope="col">Start with</th><th scope="col">When it fits</th><th scope="col">What Wordcell adds</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Claude Code memory (CLAUDE.md and auto memory)</th><td>Rules and preferences Claude Code loads automatically, with no setup.</td><td>A searchable vault reviewed in Git, with links and history, that Codex and Cursor can read too.</td></tr>
                  <tr><th scope="row">claude-mem</th><td>You want every session recorded and summarized for you.</td><td>Only notes someone chose to write, kept as Markdown in Git. Writing and exact search need no model.</td></tr>
                  <tr><th scope="row">Markdown + Git</th><td>A small set of notes you can navigate yourself.</td><td>Backlinks, typed relationships, metadata queries, and code-path context without moving the files.</td></tr>
                  <tr><th scope="row">QMD</th><td>Local document search with CLI, SDK, and agent integrations.</td><td>Current notes joined to authored relationships, AGENTS.md rules, Git evidence, and publishing.</td></tr>
                  <tr><th scope="row">Basic Memory</th><td>A local Markdown knowledge graph for AI conversations.</td><td>A workflow centered on repository paths, explicit edit rules, and code history.</td></tr>
                  <tr><th scope="row">Obsidian or a static publisher</th><td>An interactive notes workspace or a site built from Markdown.</td><td>Headless agent workflows and repeatable selection of notes to publish.</td></tr>
                </tbody>
              </table>
            </div>
            <p className="record-link"><a href="/docs/comparisons">Compare capabilities, tradeoffs, and primary sources</a> · <a href="/compare/supermemory">Compare Wordcell and Supermemory</a> · <a href="/compare/basic-memory">Compare Wordcell and Basic Memory</a> · <a href="/compare/mem0">Compare Wordcell and Mem0</a></p>
          </MarketingSection>

          <MarketingSection
            heading="Publish exactly the slice you choose"
            headingId="publish-title"
            id="publish"
            label="Publish"
            summary="Select notes, preview the selection, and build a static site with readable pages and search that runs in the browser. Publishing needs no model or hosted service."
          >
            {releaseSupports0220 ? (
              <pre className="install-command" tabIndex={0}><code>{`wordcell publish --root kb --out site \\
  --include notes/parser-contract --include plans/parser-v2 \\
  --dry-run --json`}</code></pre>
            ) : <p className="install-note">Static publishing is introduced in v0.22.0. The current verified install above predates this feature; check the release notes before using it.</p>}
            <p className="install-note">Publishing writes a local folder, and you choose when and where to upload it. Selection does not remove secrets, so review the selected text and attachments before you share the site.</p>
            <p className="record-link"><a href="/docs/publish">Select notes, inspect the output, and host your site</a></p>
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
                summary: "Open a read-only snapshot of a vault from TypeScript and run searches and workflows against it.",
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
            summary="Your notes, exact search, and graph queries stay on your machine. The features that reach another service are listed below."
          >
            <MarketingTrustBoundary
              heading="What stays local and what leaves"
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

          <MarketingRelated
            groups={relatedGroups}
            heading="Related Hraness tools"
            headingId="related-title"
            label="Related"
            summary="Tools that capture into, search, or back a Wordcell vault."
          />

          <MarketingCallToAction
            actions={[
              { href: "#install", label: "Install Wordcell" },
              { href: "/docs/getting-started", label: "See a note work" },
            ]}
            footnote={footnote}
            heading="Give the next session what this one learned."
            headingId="cta-title"
            summary="Save one decision beside the code, then let the agent find it."
          />
        </MarketingPage>
      </main>

      <AskAiAboutThis className="ask-ai" url="https://wordcell.io" />
    </div>
  );
}
