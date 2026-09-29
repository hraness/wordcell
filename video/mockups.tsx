/**
 * The film's product surfaces: the same code-built illustrations the site
 * shows on its homepage and in the launch post, imported from
 * site/wordcell/mockups. Their commands and output come from a recorded
 * Wordcell session that site/tests/mockups.test.ts replays against the pinned
 * CLI. The agent's replies and the cold-open cards are made up.
 *
 * `data-film` names are what film.json steps point at. Kit terminal lines and
 * agent turns can also be framed by their beat id (`data-hkm-beat`).
 */
import { AgentCitesNote, NoteFileWindow, SaveAndFindTerminal } from "../site/wordcell/mockups/surfaces.tsx";

/** A desk of three windows: the agent session, the terminal, and the note on disk. */
export function ProductMockup() {
  return (
    <div className="wc-desk" role="img" aria-label="Illustration: a coding agent cites a Wordcell note, beside the terminal that saved it and the Markdown file itself">
      <div className="wc-desk-agent" data-film="agent">
        <AgentCitesNote mode="context" theme="light" />
      </div>
      <div className="wc-desk-side">
        <div data-film="terminal">
          <SaveAndFindTerminal theme="dark" />
        </div>
        <div data-film="note">
          <NoteFileWindow theme="light" />
        </div>
      </div>
    </div>
  );
}

/** Where a decision usually ends up. Made-up text for the cold open collage. */
const lostPlaces = [
  { where: "Chat, closed", text: "ok so we agreed: parser retries stop after three" },
  { where: "Commit message", text: "cap parser retries (see thread)" },
  { where: "Laptop note", text: "retry limit = 3?? ask again" },
  { where: "Call notes", text: "parser: keep retries low, decide later" },
  { where: "Old pull request", text: "Discussed retries offline, leaving as is" },
  { where: "Direct message", text: "did we ever write the retry rule down?" },
] as const;

export function OpenCard({ index }: { index: number }) {
  const place = lostPlaces[index % lostPlaces.length]!;
  return (
    <div className="fm-card">
      <div>
        <b>{place.where}</b>
        <p>{place.text}</p>
      </div>
    </div>
  );
}
