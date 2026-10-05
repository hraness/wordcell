/**
 * Wordcell's launch film: a coding agent that no longer knows why the code is
 * the way it is, the reveal, the launch post's own figures captured from
 * wordcell.io (a decision note, the agent citing it before an edit, search
 * that finds it in different words), the tools it fits into, and an end card
 * that asks your agent to install Wordcell. Values come from
 * site/wordcell/launch/facts.ts.
 */
import { join } from "node:path";

import { launchFacts } from "../../site/wordcell/launch/facts.ts";
import { defineStory } from "./story.ts";
import palette from "./palette.json" with { type: "json" };

const here = import.meta.dir, repo = join(here, "../..");
const shot = (name: string) => join(here, "shots", `${name}.png`);

export default () => defineStory({
  id: "wordcell",
  brand: {
    wordmark: "Wordcell",
    mark: join(repo, "site/public/marks/kb.svg"),
    markAspect: 720 / 471,
    // Read with site-palette.ts from https://wordcell.io in dark mode; see palette.json.
    palette: { values: palette.palette },
    designKit: join(repo, "site/node_modules/@hraness/design-kit"),
  },
  acts: [
    { kind: "chat", headline: "Your coding agent doesn't know why the code is the way it is.", accents: ["why"], sample: true, exchanges: [
      { you: "Make the parser retry five times before failing.", agent: "Done. I changed the limit from three to five." },
    ] },
    { kind: "reveal", tagline: "Give your coding agent the reasons behind the code." },
    {
      kind: "gallery", headline: "Keep the decision and its reason in a Markdown file you own.", accents: ["Markdown"],
      items: [{ image: shot("give-relationships-a-precise-meaning"), caption: "A decision note, scoped to the code it governs" }],
    },
    {
      kind: "gallery", headline: "Before the next edit, your agent finds the reason, even in different words.", accents: ["reason,"],
      items: [
        { image: shot("find-the-reason-in-different-words"), caption: "The agent recovers the note and asks before breaking it" },
        { image: shot("revisit-the-decision-when-an-assumption-changes"), caption: "Search finds the note without its exact words" },
      ],
    },
    {
      kind: "cards", headline: "Keep using your agent, your editor and Git.", accents: ["your", "editor"],
      items: [
        { tag: "Interfaces", title: "A CLI, a local MCP server and a TypeScript SDK" },
        { tag: "Files", title: "Plain Markdown you can read in Obsidian or your editor" },
        { tag: "History", title: "Review every change to the reasoning in Git" },
      ],
    },
  ],
  end: {
    lead: "Ask your agent:", prompt: "Install Wordcell from wordcell.io",
    terms: `Free and MIT licensed · ${launchFacts.status.value}`, url: "wordcell.io",
  },
  formats: ["wide", "square", "portrait"],
});
