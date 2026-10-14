import {
  MarketingInstallPanel,
  MarketingPage,
  MarketingQuestionList,
  MarketingRelated,
  MarketingSection,
  MarketingSiteHeader,
  PlatformBadges,
  ProductHero,
  ProviderMark,
} from "@hraness/design-kit/react/server";
import { AgentSetupPrompt, PlatformInstall, ThemeMenuButton } from "@hraness/design-kit/react";
import { portfolioRelatedGroups } from "@hraness/design-kit/portfolio";

import { AskAiAboutThis } from "@hraness/ui";
import { websiteJsonLd } from "@hraness/web-discovery";

import { publishedRelease } from "./publication";
import { WordcellIcon, type WordcellIconName } from "../wordcell/icons";
import { siteDescription } from "./site-description";
import { site } from "./blog/discovery";
import { Terminal } from "../wordcell/code-block";
import { installPlatforms, runsOnPlatforms } from "../wordcell/install-platforms";
import { AgentCitesNote, PublishedNotesWindow } from "../wordcell/mockups/surfaces";
import { CardIndexDiagram } from "../wordcell/mockups/card-index";
import { comparisonLinks } from "../wordcell/comparison-links";
import { SETUP_PROMPT, setupTargets } from "../wordcell/setup-prompt";
import { ESSAY_URL } from "../wordcell/launch/facts";

import { FounderNote } from "./founder-note";
import { Testimonial } from "./testimonial";
import { productMessaging, productName } from "./messaging";

const releaseVersion = publishedRelease?.version;
const releaseSupports0220 = releaseVersion !== undefined && (Number(releaseVersion.split(".")[0]) > 0 || Number(releaseVersion.split(".")[1]) >= 22);
const repository = "https://github.com/hraness/wordcell";
const archiveUrl = releaseVersion === undefined ? null : `${repository}/releases/download/v${releaseVersion}/hraness-wordcell-${releaseVersion}.tgz`;

const heading = productMessaging.hero.heading;
const summary = productMessaging.hero.summary;

const footnote = releaseVersion === undefined
  ? "Free under the MIT license. Exact search needs no account or model. First Wordcell release in preparation."
  : `Latest release: v${releaseVersion} · Free under the MIT license · Exact search needs no account or model.`;

/** The first save-and-find journey, as the install section's one terminal. */
const firstDecision = `wordcell init kb
wordcell note create notes/parser-contract \\
  --title "Parser contract" --type concept \\
  --body "Parser retries stop after three attempts." --root kb
wordcell search "parser retries" --root kb --mode exact`;

const primitives = [
  { icon: "markdown", label: productMessaging.headings["home-primitive-files"], line: "Plain Markdown, reviewed in Git." },
  { icon: "search", label: productMessaging.headings["home-primitive-decisions"], line: "Exact words, or meaning with a local model." },
  { icon: "scopes", label: productMessaging.headings["home-primitive-context"], line: "Notes, plans, and rules tied to a path." },
  { icon: "capture", label: productMessaging.headings["home-primitive-sources"], line: "Web pages and PDFs saved as Markdown." },
] as const;

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
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
  { href: repository, label: "GitHub" },
] as const;

const relatedProducts = portfolioRelatedGroups(["wrench", "xcb", "oh-computer"]).flatMap((group) => group.items);

export default function Home() {
  const setupLinks = setupTargets(SETUP_PROMPT).filter((target) => target.kind === "link");
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
        <MarketingPage landscape="page">
          <div className="hraness-material-wall">
          <ProductHero
            backdrop={false}
            align="start"
            actions={[
              { href: "#install", label: productMessaging.hero.primaryAction, emphasis: "primary" },
              { href: "#example", label: productMessaging.hero.secondaryAction, emphasis: "secondary" },
            ]}
            boundary={footnote}
            className="wordcell-hero"
            eyebrow="Markdown memory for coding agents"
            frame={(
              <div className="wordcell-hero-proof" id="example">
                <AgentCitesNote mode="exact" />
              </div>
            )}
            heading={heading}
            headingId="hero-title"
            name=""
            summary={summary}
          />
          </div>

          <Testimonial
            quote={
              <>
                I really like wordcell tbh, gone are the days where i have to send a <code>handoff.md</code> to a colleague to get a <code>handoff.md</code> from them
              </>
            }
            name="Fahad"
          />

          <FounderNote
            emoji="🧠"
            paragraphs={[
              "Wordcell hands the next agent session what this one learned. Decisions, plans, and sources live as Markdown files beside your code. Tie a note to the paths it explains, and an agent about to change that code gets the note first. Search matches exact words or meaning, with an optional local model, and every index rebuilds from files you can read in any editor.",
            ]}
            action={{ label: "Ask your agent to set it up:", href: "https://wordcell.io" }}
          />

          <MarketingSection
            heading={productMessaging.headings["home-scopes"]}
            headingId="memory-title"
            id="memory"
            label="Memory for agents"
            summary="Tie a note to the paths it explains, and the agent about to change that code gets the note first."
          >
            <CardIndexDiagram />
            <p className="record-link"><a href="/developers">Read how the developer workflow fits together</a></p>
          </MarketingSection>

          <MarketingInstallPanel
            eyebrow="Get started"
            heading={productMessaging.headings["home-install"]}
            headingId="install-title"
            id="install"
          >
            <p className="install-note">{releaseVersion === undefined ? "First Wordcell release in preparation" : <>Installs Wordcell v{releaseVersion}. <a href="https://bun.sh/docs/installation">Get Bun</a> first.</>}</p>
            {releaseVersion !== undefined ? (
              <>
                <PlatformInstall platforms={installPlatforms(releaseVersion)} />
                <PlatformBadges platforms={runsOnPlatforms} />
                <Terminal code={firstDecision} />
                <p className="install-note">
                  Next, <a href="/docs/getting-started">follow the first-vault tutorial</a> or{" "}
                  <a href="/docs/overview#install">search an existing vault</a>.
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
            label="Connect an agent"
            summary="Paste one prompt into your coding agent; its notes are Markdown you review in Git."
          >
            <div className="wordcell-setup">
              <AgentSetupPrompt label="Set up Wordcell with your coding agent" prompt={SETUP_PROMPT} targets={setupLinks} />
              <p className="install-note">Your agent’s AI provider and optional hosted search ranking can receive selected note content.</p>
            </div>
            <p className="record-link">
              <a href="/docs/agent-handoffs">Register the MCP server by hand</a> · <a href="/migrate/supermemory">Move from Supermemory to Wordcell</a>
            </p>
          </MarketingSection>

          <MarketingSection
            heading={productMessaging.headings["home-primitives"]}
            headingId="model-title"
            id="model"
            label="Capabilities"
            summary="A vault is a folder of Markdown files; Wordcell adds the structure a database would, and the files stay readable in any editor."
          >
            <ul aria-label="What a vault gives you" className="wordcell-icon-row">
              {primitives.map((primitive) => (
                <li key={primitive.icon}>
                  <WordcellIcon className="wordcell-topic-icon" name={primitive.icon as WordcellIconName} />
                  <strong>{primitive.label}</strong>
                  <span>{primitive.line}</span>
                </li>
              ))}
            </ul>
          </MarketingSection>

          <MarketingSection
            heading={productMessaging.headings["home-fit"]}
            headingId="compare-title"
            id="compare"
            label="Compare"
            summary="Built for coding agents that need lasting decisions, semantic search, and Git context, in Markdown you control."
          >
            <table className="wordcell-compare-table">
              <caption className="visually-hidden">Compare Wordcell with other tools</caption>
              <thead>
                <tr><th scope="col">Tool</th><th scope="col">What Wordcell adds</th></tr>
              </thead>
              <tbody>
                {comparisonLinks.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">
                      <a href={item.href}>
                        <ProviderMark mark={item.label} size={28} tone="solid" />
                        <span>{item.label}</span>
                      </a>
                    </th>
                    <td>{item.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="record-link"><a href="/docs/comparisons">Compare more Markdown and memory tools</a></p>
          </MarketingSection>

          <MarketingSection
            heading={productMessaging.headings["home-publish"]}
            headingId="publish-title"
            id="publish"
            label="Publish"
            summary="Turn selected notes into a static website with navigation, search, and backlinks, built on your machine and hosted where you choose."
          >
            <PublishedNotesWindow />
            <p className="record-link">
              {releaseSupports0220 ? <><code>wordcell publish --root kb --out site</code> · </> : null}
              <a href="/docs/publish">Read how publishing works</a>
            </p>
          </MarketingSection>

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
            className="wordcell-related"
            columns={3}
            heading={productMessaging.headings["home-related"]}
            headingId="related-title"
            items={relatedProducts}
          />
        </MarketingPage>
      </main>

      <AskAiAboutThis className="ask-ai" url="https://wordcell.io" />
    </div>
  );
}
