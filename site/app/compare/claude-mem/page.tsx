import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NOINDEX_ROBOTS } from "@hraness/web-discovery";
import { MarketingComparison, MarketingSection, ProductHero } from "@hraness/design-kit/react/server";

import { claudeMemCheckedOn, claudeMemPages, claudeMemVersion } from "../../../wordcell/claude-mem-sources";
import { isComparisonIndexable } from "../../../wordcell/comparison-admissions";
import { longDate } from "../../../wordcell/format";
import { WordcellPageChrome } from "../../../wordcell/page-chrome";
import { routeTitles } from "../../route-titles";

const path = "/compare/claude-mem";
const pageTitle = routeTitles.compareClaudeMem.title;
const pageDescription =
  "Claude-Mem records each coding-agent session and loads recent observations into the next. Wordcell keeps the notes you choose to write as Markdown in Git.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: path },
  ...(isComparisonIndexable(path) ? {} : { robots: NOINDEX_ROBOTS }),
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    siteName: "Wordcell",
    type: "website",
    url: path,
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const checkedOn = longDate(claudeMemCheckedOn);

type Difference = Readonly<{ topic: string; claudeMem: ReactNode; wordcell: ReactNode }>;

const differences: readonly Difference[] = [
  {
    topic: "How memory forms",
    claudeMem: <>Its <a href={claudeMemPages.hooks}>hooks</a> run on every session start, prompt, and tool call. A model condenses the <a href={claudeMemPages.gettingStarted}>captured tool calls</a> into observations with a title, narrative, and facts, and writes a summary when Claude finishes responding. Content inside <a href={claudeMemPages.privateTags}><code>&lt;private&gt;</code> tags</a> is not stored.</>,
    wordcell: <>You or your agent write notes, with <code>wordcell note create</code>, the <code>create_note</code> tool, or any editor. Wordcell writes no note on its own.</>,
  },
  {
    topic: "Session start",
    claudeMem: <>The SessionStart hook adds the project’s recent observations, <a href={claudeMemPages.configuration}>50 by default</a>, to the agent’s context as a <a href={claudeMemPages.gettingStarted}>timeline of titles</a>, with the latest session summary when it is newer than those observations.</>,
    wordcell: <>No notes are loaded. The agent calls <code>search</code>, or <code>context</code> for the file it is changing, when it needs memory.</>,
  },
  {
    topic: "Storage",
    claudeMem: <>A SQLite database at <a href={claudeMemPages.installation}><code>~/.claude-mem/claude-mem.db</code></a>, a Chroma vector index, settings, and logs, all under <code>~/.claude-mem</code>.</>,
    wordcell: "Markdown files with YAML frontmatter in a folder you choose, usually kb/ in the repository.",
  },
  {
    topic: "Fresh clone or another machine",
    claudeMem: <>Memory is filed under the repository folder’s name, or under its <code>org/repo</code> remote with <a href={claudeMemPages.configuration}><code>CLAUDE_MEM_PROJECT_NAME_SOURCE=git-remote</code></a>. Another machine needs an <a href={claudeMemPages.exportImport}>export and import</a> or <a href={claudeMemPages.cloudSync}>cloud sync</a>, which uploads observations, summaries, and prompts to cmem.ai.</>,
    wordcell: "A committed vault arrives with every clone, and Git history shows who changed each note.",
  },
  {
    topic: "Model use",
    claudeMem: <>A model processes every captured session: your Claude plan, your own OpenRouter or Gemini key, your Codex sign-in, or the CMEM Pro service that the <a href={claudeMemPages.installation}>interactive installer</a> selects first and offers free for up to 14 days.</>,
    wordcell: <>Writing notes and exact search need no model. Semantic search runs a local model after a one-time download, and <a href="/docs/reranking">hosted reranking</a> is optional and paid.</>,
  },
  {
    topic: "Agents",
    claudeMem: <><a href={claudeMemPages.platforms}>Installers</a> for Claude Code, Codex CLI, Cursor, Windsurf, OpenCode, and others, and four <a href={claudeMemPages.searchTools}>MCP search tools</a>. Codex’s session start includes Claude Code’s observations only with <code>CLAUDE_MEM_SESSION_START_INCLUDE_ALL_SOURCES</code> set.</>,
    wordcell: <>Any MCP client that starts a local server, including Claude Code, Codex, and Cursor; see <a href="/docs/agent-handoffs">Connect Wordcell to your coding agent</a>. The CLI works without MCP.</>,
  },
  {
    topic: "Review and edit",
    claudeMem: <>A <a href={claudeMemPages.readme}>local web viewer</a> shows the memory stream. Observations are rows in the database.</>,
    wordcell: "Edit notes in any editor and review each change with git diff.",
  },
  {
    topic: "License",
    claudeMem: <><a href={claudeMemPages.license}>Apache-2.0</a>.</>,
    wordcell: "MIT.",
  },
];

export default function CompareClaudeMem() {
  return (
    <WordcellPageChrome path={path}>
      <ProductHero
        backdrop={false}
        align="start"
        boundary={`Claude-Mem ${claudeMemVersion}, its documentation, and its source were checked on ${checkedOn}.`}
        className="wordcell-marketing-hero"
        eyebrow="Compare"
        heading="Wordcell and Claude-Mem"
        headingId="hero-title"
        name=""
        summary="Claude-Mem records what your coding agent does in each session, has a model condense it, and loads recent observations into the next session without being asked. Wordcell keeps only the notes you or your agent choose to write, as Markdown files in your repository. Pick Claude-Mem for memory that builds itself; pick Wordcell for memory you review in Git and get with every clone."
      />

      <MarketingSection
        heading="How they differ"
        headingId="differences-title"
        id="differences"
      >
        <MarketingComparison
          caption="Wordcell and Claude-Mem at a glance"
          highlight={0}
          options={[{ name: "Wordcell", mark: "/marks/kb.svg" }, { name: "Claude-Mem" }]}
          rows={[
              {"label": "Writes memory without being asked", "values": [false, true]},
              {"label": "Loaded at session start", "values": ["No notes until the agent searches", "50 recent observations by default"]},
              {"label": "Stored as", "values": ["Markdown files", "SQLite and a vector index"]},
              {"label": "Kept in", "values": ["Your repository or a folder you choose", "~/.claude-mem on one machine"]},
              {"label": "After a fresh clone", "values": ["The notes come with it", {"status": "partial", "label": "On the same machine", "detail": "Same folder name by default"}]},
              {"label": "Model calls to save memory", "values": ["None", "Every captured session"]},
              {"label": "Codex sees Claude Code’s memory", "values": [true, {"status": "optional", "label": "With a setting"}]},
              {"label": "Software cost", "values": ["Free · MIT", "Free · Apache-2.0"]},
          ]}
          note={`Claude-Mem’s cells come from its documentation and its ${claudeMemVersion} source, checked ${checkedOn}; it was not run for this page. Its memory model runs on your Claude plan, your Codex sign-in, your own key, or its paid CMEM Pro service. Another machine gets Claude-Mem’s memory only through an export or cloud sync.`}
        />
        <details className="wordcell-comparison-sources">
          <summary>Sources and details</summary>
          <dl>
            {differences.map((difference) => (
              <div key={difference.topic}>
                <dt>{difference.topic}</dt>
                <dd><strong>Claude-Mem:</strong> {difference.claudeMem}</dd>
                <dd><strong>Wordcell:</strong> {difference.wordcell}</dd>
              </div>
            ))}
          </dl>
        </details>
      </MarketingSection>

      <MarketingSection
        heading="Where the text goes"
        headingId="flow-title"
        id="flow"
        summary="Each tool sends your work to a different place, and a different account pays for the processing."
      >
        <h3 className="wordcell-limits-title" id="flow-claude-mem">Claude-Mem</h3>
        <ol className="wordcell-limits">
          <li>Hooks in Claude Code, or in another agent it supports, send each tool call and its result to a local worker on your machine.</li>
          <li>The worker sends them to the memory model you chose, such as Claude on your plan, your own API key, or CMEM Pro on cmem.ai.</li>
          <li>The condensed observations land in <code>~/.claude-mem</code>, and the next session starts with the recent ones in its context.</li>
        </ol>
        <h3 className="wordcell-limits-title" id="flow-wordcell">Wordcell</h3>
        <ol className="wordcell-limits">
          <li>You or your agent write a note into the vault, a folder of Markdown on your machine.</li>
          <li>You commit it, and the note travels wherever the repository goes.</li>
          <li>In the next session, the agent’s client starts <code>wordcell mcp</code> on your machine and the agent searches the files. No model is involved unless you turn on semantic search or reranking.</li>
        </ol>
      </MarketingSection>

      <MarketingSection
        heading="Who should pick which"
        headingId="choose-title"
        id="choose"
        summary="The deciding question is whether you want memory to build itself, or memory that someone writes and reviews."
      >
        <h3 className="wordcell-limits-title" id="choose-claude-mem">Choose Claude-Mem when</h3>
        <ul className="wordcell-limits">
          <li>You want memory to build up without asking the agent to save anything.</li>
          <li>You work in one repository on one machine and want recent work loaded into each new session.</li>
          <li>You accept a model reading every session, on your Claude plan, your own key, or its paid service.</li>
          <li>You want the same automatic capture in several agents it has installers for, such as Claude Code, Codex, and Cursor.</li>
        </ul>
        <h3 className="wordcell-limits-title" id="choose-wordcell">Choose Wordcell when</h3>
        <ul className="wordcell-limits">
          <li>You want memory you can read, edit, and review in Git, like code.</li>
          <li>You want the memory to come with every clone of the repository, on any machine.</li>
          <li>You want saving and exact search to work without a model or an account.</li>
          <li>You want notes tied to code paths, so an agent changing a file gets the notes for it.</li>
        </ul>
      </MarketingSection>

      <MarketingSection
        heading="Run both"
        headingId="both-title"
        id="both"
        summary="The two tools write to different places, so they can share one agent."
      >
        <ul className="wordcell-limits">
          <li>Claude-Mem fills its own database, and Wordcell reads only the vault you name with <code>--root</code>.</li>
          <li>Claude-Mem’s capture hook matches every tool, so with both installed it also records Wordcell’s tool calls and their results. Its <code>CLAUDE_MEM_SKIP_TOOLS</code> setting lists tools to leave out.</li>
          <li>Keep the decisions you want in the repository as Wordcell notes, and let Claude-Mem hold the session history.</li>
        </ul>
        <p className="record-link"><a href="/docs/agent-handoffs">Connect Wordcell to your coding agent</a> · <a href="/docs/getting-started">Set up a vault</a> · <a href="/docs/comparisons">Compare more tools</a></p>
      </MarketingSection>
    </WordcellPageChrome>
  );
}
