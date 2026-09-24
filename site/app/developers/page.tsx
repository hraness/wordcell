import type { Metadata } from "next";
import {
  MarketingCallToAction,
  MarketingFlow,
  MarketingInstallPanel,
  MarketingInterfaceGrid,
  MarketingPage,
  MarketingPrimitives,
  MarketingQuestionList,
  MarketingSection,
  MarketingSiteHeader,
  MarketingTrustBoundary,
  ProductHero,
} from "@hraness/design-kit/react/server";
import { ThemeMenuButton } from "@hraness/design-kit/react";

import { AskAiAboutThis } from "@hraness/ui";

function TopicIcon({ slug }: Readonly<{ slug: WordcellIconName }>) {
  return <WordcellIcon className="wordcell-topic-icon" name={slug} />;
}

import { DEVELOPER_EDGES, DEVELOPER_NOTES, WordcellField } from "../../wordcell/field";
import { WordcellIcon, type WordcellIconName } from "../../wordcell/icons";
import { publishedRelease } from "../publication";
import { WordcellContentFooter } from "../site-footer";

const releaseVersion = publishedRelease?.version;
const repository = "https://github.com/hraness/wordcell";
const archiveUrl = releaseVersion === undefined ? null : `${repository}/releases/download/v${releaseVersion}/hraness-wordcell-${releaseVersion}.tgz`;

const heading = "Give coding agents the decisions behind your code";
const lead =
  "Keep a Markdown knowledge base beside your repository. Save decisions, tie them to code paths, and let the next agent look them up from the file it edits.";
const footnote =
  `Free under the MIT license. Exact search needs no account or model.${releaseVersion === undefined ? " First Wordcell release in preparation." : ""}`;

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
    summary: "A note lists the repository paths it is about. Starting from the file you are changing, one command returns the notes and plans tied to it and the AGENTS.md guides that apply.",
  },
  {
    icon: "markdown",
    label: "Rules in AGENTS.md, reasons in the vault",
    summary: "AGENTS.md holds the rules an agent loads on every task. The vault holds the history, evidence, and reasoning behind those rules, and the agent reads it when a task calls for it.",
  },
  {
    icon: "git-provenance",
    label: "Commits behind the note",
    summary: "A vault committed with the repository keeps its history. List the commits behind a decision when you need to know how it changed.",
  },
  {
    icon: "backlinks",
    label: "Plans linked to their reasons",
    summary: "A plan wikilinks to the constraint it implements. Backlinks on the decision recover the work that depends on it.",
  },
  {
    icon: "capture",
    label: "Evidence saved with the work",
    summary: "Clip the issue, discussion, or PDF that motivated a decision. The capture keeps a record of where and how it was saved, beside the note.",
  },
  {
    icon: "sdk",
    label: "Sessions for your own tools",
    summary: "The TypeScript SDK opens a read-only snapshot of a vault. Build agent or CI workflows on top of it.",
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
    code: "wordcell note create notes/parser-contract --title \"Parser contract\" --type concept --root kb",
    detail: "One file holds the constraint; frontmatter makes it queryable.",
  },
  {
    label: "Scope it to the code",
    code: "repository_scopes: [packages/parser]",
    detail: "The scope lives in the note's own frontmatter, so there is no central table to update.",
  },
  {
    label: "Let the agent pull context",
    code: "wordcell context packages/parser/src/index.ts --root kb --repo .",
    detail: "Returns scoped notes, related plans, and inherited AGENTS.md rules.",
  },
  {
    label: "Look up the history",
    code: "wordcell history notes/parser-contract --root kb --repo .",
    detail: "Lists the commits that changed the note.",
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
          <WordcellField edges={DEVELOPER_EDGES} notes={DEVELOPER_NOTES} />
          <ProductHero
            backdrop={false}
            align="start"
            actions={[
              { href: "#install", label: "Install Wordcell" },
              { href: "/docs/agent-workflow", label: "Read the agent workflow" },
            ]}
            boundary={footnote}
            className="wordcell-marketing-hero"
            eyebrow="For coding agents"
            heading={heading}
            headingId="hero-title"
            name=""
            summary={lead}
          />
          </div>

          <MarketingInstallPanel
            eyebrow="Get started"
            heading="Install and connect your agent"
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
                  <figcaption><span>2</span>Teach your agent the commands</figcaption>
                  <pre className="install-command" tabIndex={0}><code>{`bunx skills add hraness/wordcell#v${releaseVersion} --skill wordcell`}</code></pre>
                </figure>
                <p className="install-note">
                  The skill gives a compatible agent instructions; it does not run a service.{" "}
                  <a href="/docs/agent-workflow">Set up repository memory step by step</a>.{" "}
                  <a href={publishedRelease.verificationRun}>See how this release was built and verified</a>.
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
            label="The workflow"
            summary="Every step writes or reads plain Markdown. The agent pulls the record when the task needs it."
          >
            <MarketingFlow ariaLabel="The repository-memory loop" steps={loop} />
            <div className="wordcell-pane">
              <pre className="transcript" tabIndex={0}><code>{`$ wordcell context packages/parser/src/index.ts \\
    --root kb --repo .
$ wordcell backlinks notes/parser-contract --root kb
$ wordcell history notes/parser-contract --root kb --repo .`}</code></pre>
              <p className="wordcell-pane-note">Start from the file you are changing. <code>context</code> lists the notes and AGENTS.md guides that apply to it, <code>backlinks</code> shows what links to the note, and <code>history</code> lists the commits that changed it. They print paths and short summaries, and the agent opens a full note when it needs one.</p>
            </div>
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
            label="In the vault"
            summary="Search returns a limited set of results, each with a source the agent can open."
          />

          <MarketingSection
            heading="A fifth of the context, measured"
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
            <p className="install-note">Payload size, not accuracy; savings depend on your notes and query. <a href={`${repository}/blob/main/docs/evidence.md`}>Method and raw report</a>.</p>
            <p className="install-note">Oh backs Wordcell’s graph queries and source proofs. Markdown and Git remain authoritative; Wordcell search has its own retrieval path and evidence. <a href="/docs/graph-authority#how-wordcell-and-oh-fit-together">How the integration works</a> · <a href="/#evidence">Wordcell’s retrieval study</a>.</p>
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
                    <WordcellIcon className="wordcell-topic-icon" name="cli" />
                    <pre tabIndex={0}><code>{`wordcell context packages/parser/src/index.ts \\
  --root kb --repo .`}</code></pre>
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

const session = await openKnowledgeBase({ root: "kb" });`}</code></pre>
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
            summary="The CLI is the smallest commitment. The skill teaches an agent the same commands; the SDK embeds them in your tools."
          />

          <MarketingSection
            heading="What Wordcell shares"
            headingId="boundary-title"
            id="boundary"
            label="Trust"
            summary="Wordcell records only what you save as notes, and its hosted features stay off until you use them."
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
                  detail: "Exact search, graph queries, and optional local semantic search run on your machine. Optional hosted reranking is off by default. When you turn it on, it sends TypeSafe your query and, for up to 25 candidates, each note's identifier, title, path, and up to 512 bytes of its snippet.",
                },
                {
                  label: "The agent keeps its own rules",
                  detail: "A connected agent still follows its provider's data-handling settings. Keep private records out of public repositories and outputs.",
                },
              ]}
              label="Data"
              summary="Know what stays on your machine and what a connected agent can see."
            />
          </MarketingSection>

          <MarketingQuestionList
            heading="Before you connect an agent"
            headingId="questions-title"
            id="questions"
            label="FAQ"
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
