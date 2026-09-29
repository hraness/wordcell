"use client";

import { ModeShowcase, type ShowcaseChoice, type ShowcaseSurface } from "@hraness/design-kit/mockups/client";

import { AgentCitesNote, ILLUSTRATION_CAPTION, ModeTerminal, type SearchMode } from "./surfaces";

type Surface = "agent" | "terminal";

const modes: readonly ShowcaseChoice<SearchMode>[] = [
  { id: "exact", label: "Exact words", hint: "Exact search matches the words in your notes. It needs no model, account, or network." },
  { id: "meaning", label: "Meaning", hint: "When the words differ, an optional local model finds the note by what it means." },
  { id: "context", label: "File you’re changing", hint: "Name a file and get the notes and AGENTS.md rules tied to its folder." },
];

const surfaces: readonly ShowcaseSurface<Surface, SearchMode>[] = [
  { id: "agent", label: "Coding agent", render: ({ mode, theme }) => <AgentCitesNote mode={mode} {...(theme === undefined ? {} : { theme })} /> },
  { id: "terminal", label: "Terminal", render: ({ mode, theme }) => <ModeTerminal mode={mode} {...(theme === undefined ? {} : { theme })} /> },
];

/** The homepage's interactive illustration: three ways an agent finds the same note. */
export function SearchShowcase() {
  return (
    <ModeShowcase
      caption={ILLUSTRATION_CAPTION}
      className="wordcell-showcase"
      height={430}
      label={(surface) => `Illustration: finding a Wordcell note from a ${surface.label.toLowerCase()}`}
      minWidth={560}
      modeLabel="Find by"
      modes={modes}
      surfaces={surfaces}
    />
  );
}
