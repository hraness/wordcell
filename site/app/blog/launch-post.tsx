import type { ArticleTocItem } from "@hraness/design-kit";
import type { LaunchBeat } from "@hraness/design-kit/launch";
import { LaunchBeats } from "@hraness/design-kit/react/server";

import {
  AgentCitesNote,
  AnswerBesideFile,
  BacklinksTerminal,
  ILLUSTRATION_CAPTION,
  MeaningSearchTerminal,
  ModeTerminal,
  NameCard,
  NoteFileWindow,
  SaveAndFindTerminal,
  type SearchMode,
} from "../../wordcell/mockups/surfaces";
import { launchBeats } from "../../wordcell/launch/beats";
import { SocialKitDetails } from "./social-kit-details";

/** The post that opens with the launch beats, above its long-form walkthrough. */
export const LAUNCH_POST_SLUG = "introducing-wordcell";

/** The heading the long-form walkthrough starts under, after the beats. */
export const DETAILS_HEADING = { id: "the-details", label: "The details" } as const;

const SURFACE_IDS = [
  "answer-beside-file",
  "save-and-find",
  "meaning-search",
  "agent",
  "backlinks",
  "note-file",
  "mode-terminal",
  "name-card",
] as const;

export type SurfaceId = (typeof SURFACE_IDS)[number];

function isSurfaceId(id: string): id is SurfaceId {
  return (SURFACE_IDS as readonly string[]).includes(id);
}

function modeOf(state: Readonly<Record<string, string>>): SearchMode {
  const mode = state["mode"];
  return mode === "exact" || mode === "meaning" || mode === "context" ? mode : "context";
}

/** One beat's code-built surface. LaunchBeats wraps it in a figure captioned with the beat's alt text. */
export function BeatSurface({ beat }: Readonly<{ beat: LaunchBeat }>) {
  const visual = beat.visual;
  if (visual.kind !== "mockup") throw new Error(`Beat ${beat.id} names a ${visual.kind}; this post shows mockups only.`);
  if (!isSurfaceId(visual.id)) throw new Error(`Beat ${beat.id} names an unknown surface ${JSON.stringify(visual.id)}.`);
  const mode = modeOf(visual.state as Readonly<Record<string, string>>);
  switch (visual.id) {
    case "answer-beside-file":
      return <AnswerBesideFile mode={mode} />;
    case "save-and-find":
      return <SaveAndFindTerminal />;
    case "meaning-search":
      return <MeaningSearchTerminal />;
    case "agent":
      return <AgentCitesNote mode={mode} />;
    case "backlinks":
      return <BacklinksTerminal />;
    case "note-file":
      return <NoteFileWindow />;
    case "mode-terminal":
      return <ModeTerminal mode={mode} />;
    case "name-card":
      return <NameCard />;
  }
}

/** Table of contents entries for the beats, ahead of the walkthrough's own headings. */
export function launchBeatToc(): ArticleTocItem[] {
  return [
    ...launchBeats.map((beat): ArticleTocItem => ({ href: `#beat-${beat.id}`, label: beat.headline })),
    { href: `#${DETAILS_HEADING.id}`, label: DETAILS_HEADING.label },
  ];
}

/** The launch beats: short standalone sections, each one post in the launch threads. */
export function LaunchPostBeats() {
  return (
    <>
      <p className="wordcell-beats-note">{ILLUSTRATION_CAPTION}</p>
      <LaunchBeats beats={launchBeats} renderVisual={(beat) => <div className="wordcell-beat-visual"><BeatSurface beat={beat} /></div>} />
      <SocialKitDetails />
      <h2 id={DETAILS_HEADING.id}>{DETAILS_HEADING.label}</h2>
    </>
  );
}
