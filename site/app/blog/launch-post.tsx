import { Fragment } from "react";

import {
  AgentCitesNote,
  MeaningSearchTerminal,
  NoteFileWindow,
} from "../../wordcell/mockups/surfaces";
import { SocialKitDetails } from "./social-kit-details";

export const LAUNCH_POST_SLUG = "introducing-wordcell";

/** Each example follows the explanation it demonstrates. Missing anchors fail
 * rather than silently moving a figure to an unrelated part of the essay. */
const illustrations = [
  { before: "give-relationships-a-precise-meaning", visual: <NoteFileWindow /> },
  { before: "find-the-reason-in-different-words", visual: <AgentCitesNote mode="context" /> },
  { before: "revisit-the-decision-when-an-assumption-changes", visual: <MeaningSearchTerminal /> },
] as const;

/** The Markdown essay supplies every heading and the table of contents.
 * Social posts remain available after the story, without repeating its body. */
export function LaunchPostStory({ html }: Readonly<{ html: string }>) {
  let start = 0;
  const sections = [];
  for (const { before, visual } of illustrations) {
    const boundary = html.indexOf(`<h2 id="${before}">`, start);
    if (boundary === -1) throw new Error(`The launch essay is missing its illustration anchor: ${before}.`);
    const prose = html.slice(start, boundary);
    start = boundary;
    sections.push(
      <Fragment key={before}>
        <div dangerouslySetInnerHTML={{ __html: prose }} />
        <div className="wordcell-launch-figure wordcell-beat-visual" data-wordcell-story-visual={before}>
          {visual}
        </div>
      </Fragment>
    );
  }
  return (
    <>
      {sections}
      <div dangerouslySetInnerHTML={{ __html: html.slice(start) }} />
      <SocialKitDetails />
    </>
  );
}
