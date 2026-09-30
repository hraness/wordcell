import {
  MarketingCallToAction,
  MarketingActionLink,
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
import { Terminal } from "../wordcell/code-block";
import { SetupLinks } from "../wordcell/setup-links";
import { installPlatforms, runsOnPlatforms } from "../wordcell/install-platforms";
import { SearchShowcase } from "../wordcell/mockups/search-showcase";
import { PublishedNotesWindow } from "../wordcell/mockups/surfaces";
import { ComparisonLinks, SupermemoryMigrationLink } from "../wordcell/comparison-links";
import { ESSAY_URL } from "../wordcell/launch/facts";

import { productMessaging, productName, relatedProduct } from "./messaging";

const releaseVersion = publishedRelease?.version;
const releaseSupports0220 = releaseVersion !== undefined && (Number(releaseVersion.split(".")[0]) > 0 || Number(releaseVersion.split(".")[1]) >= 22);
const repository = "https://github.com/hraness/wordcell";
const archiveUrl = releaseVersion === undefined ? null : `${repository}/releases/download/v${releaseVersion}/hraness-wordcell-${releaseVersion}.tgz`;

const heading = productMessaging.hero.heading;
const summary = productMessaging.hero.summary;
const footnote = releaseVersion === undefined
  ? "Free under the MIT license. Exact search needs no account or model. First Wordcell release in preparation."
  : `Latest release: v${releaseVersion} · Free under the MIT license · Exact search needs no account or model.`;

const primitives = [
  { icon: "markdown", label: productMessaging.headings["home-primitive-files"], summary: "Notes stay plain Markdown. Read them in any editor, review changes in Git, and rebuild every index from the files." },
  { icon: "search", label: productMessaging.headings["home-primitive-decisions"], summary: "Search by exact words without a model or account. Add an optional local model to search by meaning, and follow named links between notes." },
  { icon: "scopes", label: productMessaging.headings["home-primitive-context"], summary: "Tie notes to repository paths. Starting from a file, get the related notes, plans, and AGENTS.md rules before the next edit." },
  { icon: "capture", label: productMessaging.headings["home-primitive-sources"], summary: "Save a web page or PDF as Markdown with its assets and capture details. Keep the source beside the decision it informed." },
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
    detail: "Open the note, authored link, or commit behind a result.",
  },
] as const;

// Sibling cards show each product's registry mark, link, and one-line description.
const related = (id: PortfolioProductId) => ({ ...relatedProduct(id), mark: product(id).mark });

// Only products with a registered relationship to Wordcell appear here.
const relatedGroups = [
  {
    heading: productMessaging.headings["home-related-group"],
    headingId: "related-tools",
    items: [
      related("wrench"),
      related("xcb"),
      related("oh-computer"),
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
  { href: "#memory", label: "Why Wordcell" },
  { href: "/benchmarks", label: "Benchmarks" },
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
      name: productName,
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
      name: productName,
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
        action={{ href: "#install", label: productMessaging.hero.primaryAction }}
        brand={productName}
        brandMark="/marks/kb.svg"
        brandLabel={`${productName} home`}
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
              { href: "#install", label: productMessaging.hero.primaryAction },
              { href: "/docs/getting-started", label: productMessaging.hero.secondaryAction },
            ]}
            boundary={footnote}
            className="wordcell-hero"
            eyebrow={productMessaging.category}
            heading={heading}
            headingId="hero-title"
            name=""
            summary={summary}
          />
          </div>

          <MarketingSection
            heading={productMessaging.headings["home-scopes"]}
            headingId="memory-title"
            id="memory"
            label="Memory for your coding agent"
            summary="Give your agent a memory of past decisions, the reasons behind them, and the sources you relied on. Wordcell keeps that knowledge in Markdown beside your code, ready for the next session."
          >
            <p>Search by exact words, or add a local model to search by meaning. Starting from the file it is changing, your agent gets the notes and AGENTS.md rules that apply, then follows Git history to see why a decision was made.</p>
            <p>Link decisions with named relationships such as <code>depends-on</code> and <code>supersedes</code>. <a href="/docs/graph-authority">Oh, Wordcell’s graph engine</a>, follows those connections and returns the notes that support each result.</p>
            <Terminal code={`wordcell context packages/parser/src/index.ts --root kb --repo .
wordcell history notes/parser-contract --root kb --repo .`} />
            <p className="record-link"><a href="/developers">Explore the developer workflow</a></p>
          </MarketingSection>

          <MarketingSection
            heading={productMessaging.headings["home-fit"]}
            headingId="compare-title"
            id="compare"
            label="Choose your tools"
            summary="Built for coding agents that need lasting decisions, semantic search, and Git context. All in Markdown you control."
          >
            <ComparisonLinks />
            <p className="record-link"><a href="/docs/comparisons">Compare more Markdown and memory tools</a></p>
          </MarketingSection>

          <MarketingSection
            className="wordcell-showcase-section"
            heading={productMessaging.headings["home-preview"]}
            headingId="showcase-title"
            id="showcase"
            label="How it looks"
            summary="The same note, found three ways. Pick one to see the command and what comes back."
          >
            <SearchShowcase />
          </MarketingSection>

          <MarketingInstallPanel
            eyebrow="Get started"
            heading={productMessaging.headings["home-install"]}
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
            heading={productMessaging.headings["home-agent-search"]}
            headingId="agent-memory-title"
            id="agent-memory"
            label="Agent memory"
            summary="Connect your coding agent to the vault. Every note it adds is Markdown you can review in Git."
          >
            <SetupLinks />
            <SupermemoryMigrationLink />
          </MarketingSection>

          <MarketingPrimitives
            columns={2}
            heading={productMessaging.headings["home-primitives"]}
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
            heading={productMessaging.headings["home-publish"]}
            headingId="publish-title"
            id="publish"
            layout="split"
            label="Publish"
            summary="Turn your Markdown notes into a readable website with navigation, search, and backlinks. Build static files locally, then host them where you choose."
            headingContent={(
              <div className="wordcell-publish-actions">
                {releaseSupports0220 ? (
                  <Terminal code="wordcell publish --root kb --out site" />
                ) : <p className="install-note">Static publishing is introduced in v0.22.0. The current verified install above predates this feature; check the release notes before using it.</p>}
                <MarketingActionLink href="/docs/publish" label="Publish your notes" />
                <p className="install-note">Review notes and attachments before sharing.</p>
              </div>
            )}
          >
            <PublishedNotesWindow />
          </MarketingSection>

          <MarketingTrustBoundary
            heading={productMessaging.headings["home-trust"]}
            headingId="boundary-title"
            id="boundary"
            items={trust}
            label="Local by default"
          />

          <MarketingQuestionList
            heading={productMessaging.headings["home-questions"]}
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
            heading={productMessaging.headings["home-related"]}
            headingId="related-title"
            label="Related"
            summary="Tools that capture into, search, or back a Wordcell vault."
          />

          <MarketingCallToAction
            actions={[
              { href: "#install", label: productMessaging.hero.primaryAction },
              { href: "/docs/getting-started", label: productMessaging.hero.secondaryAction },
            ]}
            footnote={footnote}
            heading={productMessaging.headings["home-closing"]}
            headingId="cta-title"
            summary="Save one decision beside the code, then let the agent find it."
          />
        </MarketingPage>
      </main>

      <AskAiAboutThis className="ask-ai" url="https://wordcell.io" />
    </div>
  );
}
