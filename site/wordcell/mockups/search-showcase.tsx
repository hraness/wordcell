"use client";

import { ModeShowcase, type ShowcaseChoice, type ShowcaseSurface } from "@hraness/design-kit/mockups/client";

import { AgentCitesNote, ModeTerminal, type SearchMode } from "./surfaces";

type Surface = "agent" | "terminal";

const modes: readonly ShowcaseChoice<SearchMode>[] = [
  { id: "exact", label: "Exact words" },
  { id: "meaning", label: "Meaning" },
  { id: "context", label: "File you’re changing" },
];

const surfaces: readonly ShowcaseSurface<Surface, SearchMode>[] = [
  { id: "agent", label: "Coding agent", render: ({ mode, theme }) => <AgentCitesNote mode={mode} {...(theme === undefined ? {} : { theme })} /> },
  { id: "terminal", label: "Terminal", render: ({ mode, theme }) => <ModeTerminal mode={mode} {...(theme === undefined ? {} : { theme })} /> },
];

/** The homepage's interactive illustration: three ways an agent finds the same note. */
export function SearchShowcase() {
  return (
    <ModeShowcase
      className="wordcell-showcase"
      height={600}
      label={(surface) => `Find a Wordcell note with ${surface.label.toLowerCase()}`}
      minWidth={560}
      modeLabel="Find by"
      modes={modes}
      surfaces={surfaces}
    />
  );
}
