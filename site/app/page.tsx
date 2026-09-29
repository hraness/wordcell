import {
  MarketingCallToAction,
  MarketingInstallPanel,
  MarketingPage,
  MarketingPrimitives,
  MarketingQuestionList,
  MarketingRelated,
  MarketingSection,
  MarketingSiteHeader,
  MarketingTrustBoundary,
  PlatformBadges,
  ProductHero,
} from "@hraness/design-kit/react/server";
import { PlatformInstall, ThemeMenuButton } from "@hraness/design-kit/react";
import { product, type PortfolioProductId } from "@hraness/design-kit/portfolio";

import { AskAiAboutThis } from "@hraness/ui";
import { websiteJsonLd } from "@hraness/web-discovery";

import { publishedRelease } from "./publication";
import { WordcellIcon, type WordcellIconName } from "../wordcell/icons";
import { siteDescription } from "./site-description";
import { site } from "./blog/discovery";
import { passageDetails } from "../wordcell/passage-evidence";
import { Terminal } from "../wordcell/code-block";
import { SetupLinks } from "../wordcell/setup-links";
import { installPlatforms, runsOnPlatforms } from "../wordcell/install-platforms";
import { SearchShowcase } from "../wordcell/mockups/search-showcase";
import { ESSAY_URL } from "../wordcell/launch/facts";

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
  { icon: "markdown", label: "Files you own", summary: "Notes stay plain Markdown. Read them in any editor, review changes in Git, and rebuild every index from the files." },
  { icon: "search", label: "Find a past decision", summary: "Search by exact words without a model or account. Add an optional local model to search by meaning, and follow named links between notes." },
  { icon: "scopes", label: "Context for the file at hand", summary: "Tie notes to repository paths. Starting from a file, get the related notes, plans, and AGENTS.md rules before the next edit." },
  { icon: "capture", label: "Sources you can reopen", summary: "Save a web page or PDF as Markdown with its assets and capture details. Keep the source beside the decision it informed." },
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
    question: "Do I need an embedding model or an account?",
    answer: "Not for the quick start. Exact search, backlinks, and publishing need neither. Hybrid and semantic search add an optional local model through QMD. Bun 1.3.14 or newer and Git are required to use the CLI.",
  },

  {
    question: "Why is it called Wordcell?",
    answer: "The name nods to roon’s essay A Song of Shapes and Words, which split thinking into wordcels, who think in words, and shape rotators. Coding agents are made of words, so Wordcell gives them a library of your notes.",
    after: <>{" "}Read <a href={ESSAY_URL}>the essay</a>.</>,
  },

  {
    question: "Does publishing upload my whole vault?",
    answer: "No. Choose notes, folders, metadata, or linked neighborhoods, inspect a dry run, then build a local static site. You decide where to upload it. Notes marked publish: false stay out, but review selected text and attachments for private content before sharing.",
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
              { href: "/docs/getting-started", label: "See an example" },
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

          <MarketingSection
            className="wordcell-showcase-section"
            heading="Your agent finds the rule and names the file"
            headingId="showcase-title"
            id="showcase"
            label="How it looks"
            summary="The same note, found three ways. Pick one to see the command and what comes back."
          >
            <SearchShowcase />
          </MarketingSection>

          <MarketingInstallPanel
            eyebrow="Get started"
            heading="Save and find your first decision"
            headingId="install-title"
            id="install"
          >
            <p className="install-note">{releaseVersion === undefined ? "First Wordcell release in preparation" : <>You need <a href="https://bun.sh/docs/installation">Bun 1.3.14 or newer</a> and Git. These steps install Wordcell v{releaseVersion}.</>}</p>
            {releaseVersion !== undefined ? (
              <>
                <PlatformBadges platforms={runsOnPlatforms} />
                <figure className="wordcell-step">
                  <figcaption><span>1</span>Install the CLI</figcaption>
                  <PlatformInstall platforms={installPlatforms(releaseVersion)} />
                </figure>
                <figure className="wordcell-step">
                  <figcaption><span>2</span>Create a vault and save a note</figcaption>
                  <Terminal code={`wordcell init kb
wordcell note create notes/parser-contract \\
  --title "Parser contract" --type concept \\
  --body "Parser retries stop after three attempts." --root kb`} />
                </figure>
                <figure className="wordcell-step">
                  <figcaption><span>3</span>Find it again</figcaption>
                  <Terminal code={`wordcell search "parser retries" --root kb --mode exact`} />
                </figure>
                <p className="install-note">
                  Next, <a href="/docs/getting-started">follow the first-vault tutorial</a> or{" "}
                  <a href="/docs/overview#install">search an existing vault or connect a coding agent</a>.
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
            <SetupLinks />
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
            heading="Find the passage with the answer"
            headingId="memory-title"
            id="evidence"
            label="Measured September 27, 2026"
            summary={`On ${passageDetails.questions} sealed questions about Wordcell’s public notes, selected passages contained the labeled answer ${passageDetails.passageAnswers} times, compared with ${passageDetails.snippetAnswers} for older snippets. Both used the same retrieved notes and 512-byte limit.`}
          >
            <span aria-hidden="true" id="memory" style={{ position: "absolute" }} />
            <p>Passages are chosen locally, with no model. This measures whether an excerpt contains the answer on one small corpus; it does not establish that an agent will answer correctly.</p>
            <p className="record-link"><a href="/benchmarks">Explore the search measurements and their limits</a></p>
          </MarketingSection>

          <MarketingSection
            heading="At home beside a repository"
            headingId="developers-title"
            id="developers"
            label="For agents"
            summary="Beside a repository, the same vault gives a coding agent the notes tied to the file it is changing, the AGENTS.md rules that apply, and the commits behind a decision."
          >
            <Terminal code={`wordcell context packages/parser/src/index.ts --root kb --repo .
wordcell history notes/parser-contract --root kb --repo .`} />
            <p className="record-link"><a href="/developers">Wordcell for developers and their agents</a></p>
          </MarketingSection>

          <MarketingSection
            heading="Where Wordcell fits"
            headingId="compare-title"
            id="compare"
            label="Compare"
            summary="Use the lightest tool that holds what your agent needs. Wordcell fits when that memory outgrows one file and should be reviewed in Git like code."
          >
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
              <Terminal code={`wordcell publish --root kb --out site \\
  --include notes/parser-contract --include plans/parser-v2 \\
  --dry-run --json`} />
            ) : <p className="install-note">Static publishing is introduced in v0.22.0. The current verified install above predates this feature; check the release notes before using it.</p>}
            <p className="install-note">Publishing writes a local folder, and you choose when and where to upload it. Selection does not remove secrets, so review the selected text and attachments before you share the site.</p>
            <p className="record-link"><a href="/docs/publish">Select notes, inspect the output, and host your site</a></p>
          </MarketingSection>

          <MarketingTrustBoundary
            heading="The record stays yours"
            headingId="boundary-title"
            id="boundary"
            items={trust}
            label="Local by default"
          />

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
              { href: "/docs/getting-started", label: "See an example" },
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
