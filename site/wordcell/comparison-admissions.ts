/**
 * Review records for the comparison pages that use the shared article
 * admission rubric. A page whose record is not `indexable` is served with
 * noindex and stays out of the sitemap, llms.txt, and the home page links
 * until an independent review admits it.
 */
import { isArticleIndexable, type ArticleAdmission } from "@hraness/design-kit";

import { claudeMemCheckedOn, claudeMemPages } from "./claude-mem-sources";

const wordcellSource = (path: string) => `https://github.com/hraness/wordcell/blob/main/${path}`;

export const claudeMemAdmission = {
  href: "/compare/claude-mem",
  lifecycle: "quarantined",
  readerJob: "I use Claude Code, and sometimes Codex, and want memory between sessions. Should I install Claude-Mem or keep notes with Wordcell, and what does each cost me in setup, model use, and portability?",
  nonObviousAnswer: "Claude-Mem builds memory on its own but runs a model over every captured session and keeps the result in ~/.claude-mem on one machine. Wordcell keeps only what someone writes down, as Markdown that travels with the repository and needs no model to save a note or run an exact search. The two write to different places, so they can run side by side.",
  originalContribution: "Registers Wordcell with Claude Code 2.1.287 and Codex CLI 0.160.0 in empty configuration directories, replays its MCP search and context tools on a test repository, and reads Claude-Mem 13.30.0's hooks file, configuration defaults, storage paths, and project naming from its source and documentation on the same day.",
  hostFit: "A coding-agent memory comparison on wordcell.io, which owns that topic for the portfolio. The documentation's comparison page has one Claude-Mem row and one paragraph; this page adds setup, storage, model use, and what survives a fresh clone.",
  nearestUrls: [
    { url: "https://wordcell.io/docs/comparisons#use-claude-mem-to-capture-sessions-automatically", distinction: "The documentation compares many tools in one row each; this page compares two tools for one reader decision, with sources for every cell." },
    { url: "https://wordcell.io/docs/agent-handoffs", distinction: "The setup guide shows how to connect Wordcell to a client; this page helps a reader decide whether to." },
  ],
  sources: [
    { title: "Claude-Mem README at v13.30.0", url: claudeMemPages.readme, checkedOn: claudeMemCheckedOn },
    { title: "Claude-Mem hooks at v13.30.0", url: claudeMemPages.hooks, checkedOn: claudeMemCheckedOn },
    { title: "Claude-Mem license at v13.30.0", url: claudeMemPages.license, checkedOn: claudeMemCheckedOn },
    { title: "Claude-Mem installation", url: claudeMemPages.installation, checkedOn: claudeMemCheckedOn },
    { title: "Claude-Mem getting started", url: claudeMemPages.gettingStarted, checkedOn: claudeMemCheckedOn },
    { title: "Claude-Mem configuration", url: claudeMemPages.configuration, checkedOn: claudeMemCheckedOn },
    { title: "Claude-Mem platform integration", url: claudeMemPages.platforms, checkedOn: claudeMemCheckedOn },
    { title: "Claude-Mem memory search", url: claudeMemPages.searchTools, checkedOn: claudeMemCheckedOn },
    { title: "Claude-Mem export and import", url: claudeMemPages.exportImport, checkedOn: claudeMemCheckedOn },
    { title: "Claude-Mem cloud sync", url: claudeMemPages.cloudSync, checkedOn: claudeMemCheckedOn },
    { title: "Claude-Mem private tags", url: claudeMemPages.privateTags, checkedOn: claudeMemCheckedOn },
    { title: "Connect Wordcell to your coding agent", url: wordcellSource("docs/agent-handoffs.md"), checkedOn: claudeMemCheckedOn },
    { title: "Wordcell local MCP server reference", url: wordcellSource("docs/reference.md"), checkedOn: claudeMemCheckedOn },
  ],
  observations: [
    "Claude-Mem files memory under the repository folder's name, in a database on one machine. A clone in a differently named folder starts without it unless the project name comes from the Git remote, and a clone on another machine starts without it unless an export is imported or cloud sync is on. A committed vault depends on neither.",
    "Claude-Mem adds a timeline of up to 50 recent observation titles at every session start whether or not the task needs them, while a Wordcell agent spends context only on the searches it runs. The trade is effort: Claude-Mem's memory exists without anyone deciding to write it.",
  ],
  scores: {
    readerUtility: 2,
    originalEvidence: 1,
    factualConfidence: 2,
    hostFit: 2,
    voiceIntegrity: 2,
    maintenanceValue: 1,
  },
  owner: "Hraness",
  drafting: "ai-from-source",
  review: null,
  humanReview: null,
  reassessOn: "2026-11-15",
  harmIfWrong: "A reader could expect Claude-Mem to work without model usage or to follow a repository to another machine, or expect Wordcell to capture sessions on its own.",
  refreshTriggers: [
    "A Claude-Mem release that changes its hooks, storage location, default memory provider, project naming, or session-start context",
    "A change to Claude-Mem's install commands, license, or paid plan",
    "A Wordcell release that changes the wordcell mcp tools or adds automatic capture",
    "A change to the setup commands in docs/agent-handoffs.md",
  ],
} as const satisfies ArticleAdmission;

export const comparisonAdmissions: readonly ArticleAdmission[] = [claudeMemAdmission];

/** True when the comparison at this path may appear in the sitemap, llms.txt, and home page links. */
export function isComparisonIndexable(path: string): boolean {
  const admission = comparisonAdmissions.find((record) => record.href === path);
  if (admission === undefined) throw new Error(`No comparison review record for ${path}`);
  return isArticleIndexable(admission);
}
