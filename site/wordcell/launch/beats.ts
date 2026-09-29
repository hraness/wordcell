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
 * The beats of "Introducing Wordcell". Each one is a short section of the post
 * and one post in the launch threads, so each reads on its own. Numbers are
 * {placeholders} filled from ./facts; the design kit rejects a beat that types
 * a digit. Every visual is a code-built illustration from ../mockups, whose
 * commands and output tests/mockups.test.ts replays against the pinned CLI.
 */
const authoredBeats: readonly LaunchBeat[] = [
  {
    id: "what",
    part: "what",
    headline: "Wordcell lets your coding agent read your team's notes",
    post: "Wordcell keeps your decisions, plans, and sources as Markdown notes beside your code. Your coding agent finds the right note before it changes a file, and tells you which file the answer came from.",
    visual: { kind: "mockup", id: "answer-beside-file", state: { mode: "context" } },
    alt: "Illustration: a coding agent quotes a parser rule, next to the Markdown note it came from.",
  },
  {
    id: "save",
    part: "does",
    headline: "Save a decision once, as a plain file",
    post: "Decided something? Save it as a note with one command. It is an ordinary Markdown file you can open, edit, and commit. Exact search finds it again with no model, account, or network.",
    visual: { kind: "mockup", id: "save-and-find", state: {} },
    alt: "Illustration: a terminal saves a parser rule as a note, then an exact search returns it and its line.",
  },
  {
    id: "meaning",
    part: "does",
    headline: "Find a note even when the words differ",
    post: "Ask \"how many times do we retry\" and exact words find nothing. Turn on search by meaning, and a small model on your own machine finds the parser rule anyway.",
    visual: { kind: "mockup", id: "meaning-search", state: {} },
    alt: "Illustration: an exact search for a question finds nothing, then a search by meaning returns the rule.",
  },
  {
    id: "context",
    part: "does",
    headline: "Your agent checks the rules before it edits a file",
    post: "Before an agent edits a file, it can ask Wordcell for the notes tied to that folder and the AGENTS.md rules that apply. It spots the rule it was about to break and asks you first.",
    visual: { kind: "mockup", id: "agent", state: { mode: "context" } },
    alt: "Illustration: asked to change a retry limit, a coding agent finds the rule that sets it and asks first.",
  },
  {
    id: "graph",
    part: "does",
    headline: "Links you write become a map of what depends on what",
    post: "Link one note to another and Wordcell can tell you what depends on it. Each answer names the note that links, the note it points to, and the line the link is on.",
    visual: { kind: "mockup", id: "backlinks", state: {} },
    alt: "Illustration: a backlinks query lists the plan that links to the parser rule and the line of the link.",
    detailHref: "/blog/how-wordcell-uses-oh",
  },
  {
    id: "files",
    part: "how",
    headline: "Your notes stay ordinary Markdown files",
    post: "Wordcell never moves your notes into a database of its own. Its search indexes and graph are built from the files and can be deleted and rebuilt. Obsidian, Git, and any text editor still read them.",
    visual: { kind: "mockup", id: "note-file", state: {} },
    alt: "Illustration: the saved note open in a text editor, a short Markdown file with the rule highlighted.",
  },
  {
    id: "who",
    part: "who",
    headline: "For people who keep notes in Markdown and code with agents",
    post: "Wordcell is for people who keep decisions in Markdown or Obsidian and work with Claude Code, Codex, or Cursor. A handful of notes may need only a text search, and Wordcell keeps only what you choose to save.",
    visual: { kind: "mockup", id: "agent", state: { mode: "exact" } },
    alt: "Illustration: a coding agent answers a question about retries by quoting the note and its line number.",
  },
  {
    id: "vision",
    part: "vision",
    headline: "Coding agents are wordcels, so give them a library",
    post: "The name nods to roon's essay A Song of Shapes and Words, where a wordcel thinks in words. Coding agents are made of words. Wordcell is building toward every new session starting from the notes the last one left, in files you can read.",
    visual: { kind: "mockup", id: "name-card", state: {} },
    alt: "Illustration: a card citing roon's essay A Song of Shapes and Words, beside a cube that turns into lines of text.",
  },
  {
    id: "limits",
    part: "limits",
    headline: "It finds notes; your agent writes the answer",
    post: "Wordcell returns notes, snippets, and graph rows, and your agent writes the answer from them. A graph proof shows a file said something, not that it is right. Graph queries cover vaults of up to {graphNotes} notes.",
    visual: { kind: "mockup", id: "mode-terminal", state: { mode: "context" } },
    alt: "Illustration: a terminal lists the AGENTS.md guide and the one note tied to the parser folder.",
    facts: ["graphNotes"],
  },
  {
    id: "status",
    part: "status",
    headline: "Free and open source, on GitHub and npm",
    post: "{status}. Wordcell is free and MIT licensed. It needs Bun {bunVersion} or newer and Git. Install it from GitHub Releases or npm, then add the agent skill so your agent knows the commands.",
    visual: { kind: "mockup", id: "mode-terminal", state: { mode: "exact" } },
    alt: "Illustration: a terminal runs an exact search for parser retries and returns the note and line.",
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
