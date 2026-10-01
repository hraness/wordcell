import {
  assertLaunchKit,
  buildSocialKit,
  resolveLaunchBeats,
  type LaunchBeat,
  type LaunchKitOptions,
  type LaunchMessaging,
  type LaunchRelease,
  type SocialKit,
} from "@hraness/design-kit/launch";
import { product } from "@hraness/design-kit/portfolio";

import { publishedRelease } from "../../app/publication";
import { LAUNCH_STATUS, launchFacts } from "./facts";

/**
 * The social beats of "Introducing Wordcell". Each reads on its own; the
 * article develops the same workflow as a continuous illustrated essay. Numbers are
 * {placeholders} filled from ./facts; the design kit rejects a beat that types
 * a digit. Every visual is a code-built illustration from ../mockups, whose
 * commands and output tests/mockups.test.ts replays against the pinned CLI.
 */
const authoredBeats: readonly LaunchBeat[] = [
  {
    id: "what",
    part: "what",
    headline: "Give your coding agent the reasons behind the code",
    post: "Wordcell connects decisions to evidence, plans, and code. Your coding agent recovers the reasoning before an edit and leaves it ready for the next session, in Markdown files you own.",
    visual: { kind: "mockup", id: "answer-beside-file", state: { mode: "context" } },
    alt: "Illustration: A coding agent quotes the retry decision beside the Markdown note that records it.",
  },
  {
    id: "save",
    part: "does",
    headline: "Keep the decision and the reasoning together",
    post: "Save the rule, why you chose it, and the source that informed it. Wordcell keeps the record in an ordinary Markdown file your agent can search, update, and commit with the code.",
    visual: { kind: "mockup", id: "save-and-find", state: {} },
    alt: "Illustration: A terminal saves the retry decision, then exact search returns the note and its matching line.",
  },
  {
    id: "meaning",
    part: "does",
    headline: "Find the decision in different words",
    post: "A question about how many times to retry can lead back to a note about the parser limit. Optional local semantic search helps your agent find the reasoning when it does not remember the phrase or filename.",
    visual: { kind: "mockup", id: "meaning-search", state: {} },
    alt: "Illustration: A question about retries finds the saved parser rule through local search by meaning.",
  },
  {
    id: "context",
    part: "does",
    headline: "Recover context before the next edit",
    post: "Start from the file your agent is changing. Wordcell returns the decisions, active plans, and AGENTS.md rules tied to that path, giving the agent the context to investigate a change to an earlier decision.",
    visual: { kind: "mockup", id: "agent", state: { mode: "context" } },
    alt: "Illustration: An agent finds the existing retry constraint before acting on a request to increase the limit.",
  },
  {
    id: "graph",
    part: "does",
    headline: "Connect a decision to the work that depends on it",
    post: "A plan links to the decision it implements. Wordcell follows that connection with Oh and returns the supporting note and line, so your agent can inspect the reasoning when an assumption changes.",
    visual: { kind: "mockup", id: "backlinks", state: {} },
    alt: "Illustration: A backlinks query finds the parser plan that refers to the saved decision.",
    detailHref: "/blog/how-wordcell-uses-oh",
  },
  {
    id: "files",
    part: "how",
    headline: "Keep using your agent, editor, and Git workflow",
    post: "Wordcell is a CLI, local MCP server, and TypeScript SDK over Markdown you own. Read the files in Obsidian or your editor, review their history in Git, and add local search and graph queries as the knowledge grows.",
    visual: { kind: "mockup", id: "note-file", state: {} },
    alt: "Illustration: The decision remains a Markdown file with the repository path it explains.",
  },
  {
    id: "who",
    part: "who",
    headline: "Carry useful decisions across coding sessions",
    post: "Wordcell fits projects where Claude Code, Codex, Cursor, or another coding agent needs the evidence behind the implementation. Each session can recover the record and update it as the work changes what you know.",
    visual: { kind: "mockup", id: "agent", state: { mode: "exact" } },
    alt: "Illustration: A coding agent answers a question using the saved retry decision and its source line.",
  },
  {
    id: "vision",
    part: "vision",
    headline: "Give the next session a library to build on",
    post: "The name nods to roon’s essay A Song of Shapes and Words. Wordcell gives coding agents a library of decisions and sources they can revisit, with working methods that improve as you use them.",
    visual: { kind: "mockup", id: "name-card", state: {} },
    alt: "Illustration: A citation for roon’s essay A Song of Shapes and Words beside the Wordcell name.",
  },
  {
    id: "limits",
    part: "limits",
    headline: "Inspect the recorded connections behind a result",
    post: "Wordcell’s Oh graph queries cover vaults of up to {graphNotes} notes and trace results to the files that support each connection. Open those sources when reviewing the reasoning behind a decision.",
    visual: { kind: "mockup", id: "mode-terminal", state: { mode: "context" } },
    alt: "Illustration: The context command returns the guide and saved decision associated with the parser folder.",
    facts: ["graphNotes"],
  },
  {
    id: "status",
    part: "status",
    headline: "Start with one decision worth keeping",
    post: "{status}. Wordcell is free under the MIT license. Install it with Bun {bunVersion} or newer and Git, then add the Agent Skill to teach your coding agent how to find and maintain the knowledge.",
    visual: { kind: "mockup", id: "mode-terminal", state: { mode: "exact" } },
    alt: "Illustration: An exact search returns the saved retry decision and the line containing the rule.",
    facts: ["status", "bunVersion"],
  },
];

export const launchBeats: readonly LaunchBeat[] = resolveLaunchBeats(authoredBeats, launchFacts);

export const LAUNCH_POST_URL = "https://wordcell.io/blog/introducing-wordcell";

const messaging = product("kb").messaging;

/** The product's messaging record from the pinned portfolio. */
export const launchMessaging: LaunchMessaging = {
  names: { name: messaging.names.name },
  tagline: messaging.tagline,
  meta: messaging.meta,
};

export const launchRelease: LaunchRelease = {
  status: LAUNCH_STATUS,
  tags: ["Developer Tools", "Productivity", "Artificial Intelligence"],
};

export const launchKitOptions: LaunchKitOptions = {
  status: LAUNCH_STATUS,
  // A verified release on GitHub Releases and npm is a public install.
  publicInstall: publishedRelease !== null,
  tagline: launchMessaging.tagline,
  canonicalUrl: LAUNCH_POST_URL,
  forbiddenNames: ["Supermemory", "Mem0", "Basic Memory", "QMD"],
};

export const socialKit: SocialKit = buildSocialKit(launchBeats, launchMessaging, launchRelease, LAUNCH_POST_URL);
assertLaunchKit(launchBeats, socialKit, launchKitOptions);
