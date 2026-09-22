import type { Metadata } from "next";
import {
  MarketingCallToAction,
  MarketingFlow,
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

import { publishedRelease } from "../publication";
import { WordcellContentFooter } from "../site-footer";

const releaseVersion = publishedRelease?.version;
const repository = "https://github.com/hraness/wordcell";
const archiveUrl = releaseVersion === undefined ? null : `${repository}/releases/download/v${releaseVersion}/hraness-wordcell-${releaseVersion}.tgz`;

const heading = "Give coding agents the decisions behind your code";
const lead =
  "A local Markdown knowledge base beside your repository. Save decisions, scope them to code paths, and give the next session only the context it needs.";
const footnote =
  `Free and MIT licensed. Local Markdown. No account or model for exact search.${releaseVersion === undefined ? " First Wordcell release in preparation." : ` Current verified release v${releaseVersion}.`}`;

const pageTitle = "Wordcell for developers and coding agents";
const pageDescription = lead;

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/developers" },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    siteName: "Wordcell",
    type: "website",
    url: "/developers",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const primitives = [
  {
    icon: "scopes",
    label: "Context for a code path",
    summary: "A note declares the repository paths it is about. Starting from the file you are changing returns its scoped notes, plans, and the AGENTS.md guides that govern the edit.",
  },
  {
    icon: "markdown",
    label: "Rules and rationale, separated",
    summary: "AGENTS.md stays the normative, always-loaded rule file. The vault holds the pull-based history, evidence, and reasoning behind those rules.",
  },
  {
    icon: "git-provenance",
    label: "Commits behind the note",
    summary: "A vault committed with the repository keeps its history. Inspect the commits behind a decision when provenance matters.",
  },
  {
    icon: "backlinks",
    label: "Plans linked to their reasons",
    summary: "A plan wikilinks to the constraint it implements. Backlinks on the decision recover the work that depends on it.",
  },
  {
    icon: "capture",
    label: "Evidence saved with the work",
    summary: "Clip the issue, discussion, or PDF that motivated a decision. The capture keeps its provenance receipt beside the note.",
  },
  {
    icon: "sdk",
    label: "Sessions for your own tools",
    summary: "The TypeScript SDK opens a read-only snapshot over one vault scan. Compose bounded workflows for your agent or CI.",
  },
] as const;

const loop = [
  {
    label: "Initialize the vault",
    code: "wordcell init kb",
    detail: "Creates a folder of Markdown that any editor can read.",
  },
  {
    label: "Save the decision",
    code: "wordcell note create notes/parser-contract --type concept --root kb",
    detail: "One file holds the constraint; frontmatter makes it queryable.",
  },
  {
    label: "Scope it to the code",
    code: "repository_scopes: [packages/parser]",
    detail: "A frontmatter field on the note, not a central database row.",
  },
  {
    label: "Let the agent pull context",
    code: "wordcell context packages/parser/src/index.ts --root kb --repo .",
    detail: "Returns scoped notes, related plans, and inherited AGENTS.md rules.",
  },
  {
    label: "Recover the history",
    code: "wordcell history notes/parser-contract --root kb --repo .",
    detail: "The commits behind the note, when provenance matters.",
  },
] as const;

const questions = [
  {
    question: "How does the agent know what to read?",
    answer: "wordcell context starts from a repository path and returns only the notes, plans, and rules scoped to it. Exact and hybrid search cover the cases where you know the words. The agent opens full notes only for the results it needs.",
  },
  {
    question: "What does the Agent Skill do?",
    answer: "It installs instructions for a compatible agent, such as Claude Code, Codex, Cursor, or GitHub Copilot. It does not start a service, create a vault, or grant access to external accounts.",
  },
  {
    question: "Can I use it on an existing vault or repository?",
    answer: "Yes. Exact search reads any existing Markdown folder without initialization. Repository scopes are optional frontmatter you add where the context is worth recovering.",
  },
  {
    question: "Does it record my agent sessions?",
    answer: "No. Wordcell stores only what you save as notes. It does not reconstruct private chat or silently record agent actions; Git history is opt-in and covers recorded commits.",
  },
] as const;

const navigation = [
  { href: "/#model", label: "Why Wordcell" },
  { href: "/#compare", label: "Compare" },
  { href: "#install", label: "Install" },
  { href: "/docs", label: "Docs" },
  { href: repository, label: "GitHub" },
] as const;

export default function Developers() {
  return (
    <div data-hraness-marketing-preset="editorial">
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
            align="start"
            actions={[
              { href: "#install", label: "Install Wordcell" },
              { href: "/docs/agent-workflow", label: "Read the agent workflow" },
            ]}
            boundary={footnote}
            className="wordcell-marketing-hero"
            eyebrow=""
            frame={(
              <MarketingProofFrame
                className="hraness-material-pane"
                caption="Start from the file you are changing. The scoped notes, plans, and rules come back in one bounded result."
                credit="From the README"
                title="Context that starts from the code"
              >
                <pre className="transcript" tabIndex={0}><code>{`$ wordcell context packages/parser/src/index.ts \\
    --root kb --repo .
$ wordcell backlinks notes/parser-contract --root kb
$ wordcell history notes/parser-contract --root kb --repo .`}</code></pre>
                <p>Path-scoped notes, their dependents, and their provenance. Nothing else enters the conversation.</p>
              </MarketingProofFrame>
            )}
            heading={heading}
            headingId="hero-title"
            name=""
            summary={lead}
          />
          </div>

          <MarketingInstallPanel
            eyebrow=""
            heading="Install and connect your agent"
            headingId="install-title"
            id="install"
          >
            <p className="install-note">{releaseVersion === undefined ? "First Wordcell release in preparation" : `Current verified release · v${releaseVersion}`}</p>
            {publishedRelease !== null && archiveUrl !== null ? (
              <>
                <pre className="install-command" tabIndex={0}><code>{`bun add --global --ignore-scripts ${archiveUrl}
wordcell --help`}</code></pre>
                <pre className="install-command" tabIndex={0}><code>{`bunx skills add hraness/wordcell#v${releaseVersion} --skill wordcell`}</code></pre>
                <p className="install-note">
                  <a href={publishedRelease.verificationRun}>Public release verification</a>.{" "}
                  The skill installs instructions for a compatible agent, not a service.{" "}
                  <a href="/docs/agent-workflow">Set up repository memory step by step</a>.
                </p>
              </>
            ) : (
              <p className="install-note">
                Wordcell is being prepared for its first release under the new name.{" "}
                <a href={`${repository}/releases`}>Check published releases</a>.
              </p>
            )}
          </MarketingInstallPanel>

          <MarketingSection
            heading="The loop, end to end"
            headingId="loop-title"
            id="loop"
            label=""
            summary="Every step writes or reads plain Markdown. The agent pulls the record when the task needs it."
          >
            <MarketingFlow ariaLabel="The repository-memory loop" steps={loop} />
          </MarketingSection>

          <MarketingPrimitives
            heading="Context an agent can inspect"
            headingId="model-title"
            id="model"
            items={primitives.map((primitive) => ({
              example: <TopicIcon slug={primitive.icon} />,
              label: primitive.label,
              summary: primitive.summary,
            }))}
            label=""
            summary="Search returns bounded results with sources an agent can open, not a dump of the whole vault."
          />

          <MarketingSection
            heading="Measured context, stated limits"
            headingId="evidence-title"
            id="evidence"
            label=""
            summary="In a four-query example over a seven-note public vault, packed search snippets used 80% fewer UTF-8 bytes than passing the same matching notes in full: 12,126 versus 60,584 bytes."
          >
            <p className="install-note">This measures context payload size, not tokens, answer quality, or a win over another search tool. <a href={`${repository}/blob/main/docs/evidence.md`}>Method and raw report</a>.</p>
            <p className="install-note">The graph core is Oh, the Hraness memory kernel. Its completed memory studies reached 89.8% answer accuracy on LongMemEval-S and 84.4% on LoCoMo, descriptive in-sample scores with stated limits. <a href="https://github.com/hraness/oh/blob/main/benchmarks/EVOLUTION_RELEASE_RESULTS.md">Results and method</a>.</p>
          </MarketingSection>

          <MarketingInterfaceGrid
            heading="CLI, skill, or SDK"
            headingId="interfaces-title"
            id="interfaces"
            interfaces={[
              {
                label: "CLI",
                summary: "Search, context, history, and validation from a terminal or script.",
                example: (
                  <>
                    <TopicIcon slug="cli" />
                    <pre tabIndex={0}><code>{`wordcell context packages/parser/src/index.ts \\
  --root kb --repo .`}</code></pre>
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

const session = await openKnowledgeBase({ root: "kb" });`}</code></pre>
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
            summary="The CLI is the smallest commitment. The skill teaches an agent the same commands; the SDK embeds them in your tools."
          />

          <MarketingSection
            heading="Boundaries the agent respects"
            headingId="boundary-title"
            id="boundary"
            label=""
            summary="Only saved context becomes part of the record, and external lanes stay explicit."
          >
            <MarketingTrustBoundary
              heading="What reaches the model"
              headingId="kernel-title"
              id="kernel"
              items={[
                {
                  label: "Nothing is recorded for you",
                  detail: "Wordcell stores only what you save as notes. It does not reconstruct private chat or silently log agent actions.",
                },
                {
                  label: "Local retrieval by default",
                  detail: "Exact search, graph queries, and optional local semantic search run on your machine. Optional hosted reranking sends a bounded window and is off by default.",
                },
                {
                  label: "The agent keeps its own rules",
                  detail: "A connected agent still follows its provider's data-handling settings. Keep private records out of public repositories and outputs.",
                },
              ]}
              label=""
              summary="Know what stays on your machine and what a connected agent can see."
            />
          </MarketingSection>

          <MarketingQuestionList
            heading="Before you connect an agent"
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
              { href: "/docs/agent-workflow", label: "Read the agent workflow" },
            ]}
            footnote={footnote}
            heading="Give the next session what this one learned"
            headingId="cta-title"
            summary="Save one decision beside the code, then let the agent find it."
          />
        </MarketingPage>
      </main>

      <AskAiAboutThis className="ask-ai" url="https://wordcell.io/developers" />

      <WordcellContentFooter />
    </div>
  );
}
