/**
 * Code-built illustrations of Wordcell's real surfaces: a terminal, a coding
 * agent session, and the Markdown note on disk. Every command and every line of
 * tool output comes from ./transcript, which tests/mockups.test.ts replays
 * against the pinned CLI. The agent's own words are made up and labelled so.
 *
 * Plain server-safe React: the launch film renders these with
 * renderToStaticMarkup, and the homepage showcase wraps them in a client shell.
 */
import {
  AgentSession,
  MacWindow,
  TerminalFrame,
  type AgentTurn,
  type MockupTheme,
  type TerminalLine,
} from "@hraness/design-kit/mockups";

import { ESSAY, ESSAY_URL } from "../launch/facts";
import { commandLine, NOTE_PATH, NOTE_RULE, noteFile, SOURCE_FILE, steps, type RecordedStep, type StepId } from "./transcript";

export const ILLUSTRATION_CAPTION = "Illustration. Commands and output are from a recorded Wordcell session; the agent’s replies are made up.";

export type SearchMode = "exact" | "meaning" | "context";

/** Which recorded steps each search mode shows, in order. */
export const modeSteps: Readonly<Record<SearchMode, readonly StepId[]>> = {
  exact: ["exact"],
  meaning: ["exactMiss", "hybrid"],
  context: ["context"],
};

/** Output lines longer than this are cut with an ellipsis so they fit the frame; the full text is in the transcript. */
const OUTPUT_WIDTH = 96;

function clip(text: string): string {
  return text.length > OUTPUT_WIDTH ? `${text.slice(0, OUTPUT_WIDTH - 1)}…` : text;
}

function toneFor(text: string): TerminalLine["tone"] {
  if (/^(Created|Initialized|Indexed) /u.test(text)) return "ok";
  if (/^\s*None\.$/u.test(text)) return "muted";
  return undefined;
}

export function stepLines(ids: readonly StepId[], options: Readonly<{ skipEmptySections?: boolean }> = {}): TerminalLine[] {
  const lines: TerminalLine[] = [];
  for (const id of ids) {
    const step: RecordedStep = steps[id];
    lines.push({ kind: "input", text: commandLine(step), beat: id });
    let output = step.output;
    if (options.skipEmptySections === true && id === "context") output = contextSummary();
    for (const text of output) {
      const tone = toneFor(text);
      lines.push({ kind: "output", text: clip(text), ...(tone === undefined ? {} : { tone }), beat: id });
    }
  }
  return lines;
}

/** The context output without the empty plan, research, and report sections. */
export function contextSummary(): readonly string[] {
  const output = steps.context.output;
  const cut = output.findIndex((line) => line.trim().startsWith("Active plans"));
  return cut === -1 ? output : output.slice(0, cut);
}

type Themed = Readonly<{ theme?: MockupTheme; height?: number }>;

function themed(theme: MockupTheme | undefined): { theme?: MockupTheme } {
  return theme === undefined ? {} : { theme };
}

function sized(height: number | undefined): { height?: number } {
  return height === undefined ? {} : { height };
}

/** Save a rule as a note, then find it by its words. */
export function SaveAndFindTerminal({ height, theme }: Themed) {
  return (
    <TerminalFrame
      {...themed(theme)}
      {...sized(height)}
      describe="Illustration: a terminal where wordcell init creates a vault, note create saves the parser rule as a Markdown note, and an exact search for “parser retries” returns that note and the line it is on."
      lines={stepLines(["init", "create", "exact"])}
      title="Terminal · app"
    />
  );
}

/** Exact words miss a question; meaning search finds the note. */
export function MeaningSearchTerminal({ height, theme }: Themed) {
  return (
    <TerminalFrame
      {...themed(theme)}
      {...sized(height)}
      describe="Illustration: an exact search for “how many times do we retry” finds nothing, then a meaning search with the local model returns the parser contract note first."
      lines={stepLines(["exactMiss", "index", "hybrid"])}
      title="Terminal · app"
    />
  );
}

/** Links you wrote become a graph with the line each link is on. */
export function BacklinksTerminal({ height, theme }: Themed) {
  return (
    <TerminalFrame
      {...themed(theme)}
      {...sized(height)}
      describe="Illustration: a plan note links to the parser contract, and a backlinks query lists the plan, the note it points to, and line 7 where the link is written."
      lines={stepLines(["plan", "backlinks"])}
      title="Terminal · app"
    />
  );
}

/** One search mode in a terminal, for the homepage showcase. */
export function ModeTerminal({ height, mode, theme }: Themed & Readonly<{ mode: SearchMode }>) {
  return (
    <TerminalFrame
      {...themed(theme)}
      {...sized(height)}
      describe={`Illustration: ${modeDescriptions[mode]}`}
      lines={stepLines(modeSteps[mode], { skipEmptySections: true })}
      title="Terminal · app"
    />
  );
}

const modeDescriptions: Readonly<Record<SearchMode, string>> = {
  exact: "an exact search for “parser retries” returns the parser contract note and line 9, where the rule is written.",
  meaning: "an exact search for a question finds nothing; a meaning search returns the parser contract note first.",
  context: `wordcell context for ${SOURCE_FILE} lists the AGENTS.md guide for the package and the parser contract note tied to it.`,
};

/** What the made-up user asks, and how the made-up agent answers, in each mode. */
const agentScript: Readonly<Record<SearchMode, Readonly<{ ask: string; answer: string }>>> = {
  exact: {
    ask: "Do we have a rule about parser retries?",
    answer: `Yes. ${NOTE_PATH}, line 9: “${NOTE_RULE}”`,
  },
  meaning: {
    ask: "How many times do we retry before the parser gives up?",
    answer: `Three. ${NOTE_PATH} says “${NOTE_RULE}” Exact words found nothing, so I searched by meaning.`,
  },
  context: {
    ask: "Make the parser retry five times before failing.",
    answer: `Before I change ${SOURCE_FILE}: ${NOTE_PATH} says “${NOTE_RULE}” Five would break that rule. Should I update the note in the same change, or keep three?`,
  },
};

export function agentTurns(mode: SearchMode): AgentTurn[] {
  const script = agentScript[mode];
  const tools: AgentTurn[] = modeSteps[mode].map((id) => {
    const step = steps[id];
    const output = id === "context" ? contextSummary() : step.output;
    return {
      role: "tool",
      tool: "Run command",
      text: [commandLine(step), ...output.map(clip)].join("\n"),
      status: "ok",
      beat: id,
    };
  });
  return [
    { role: "user", text: script.ask },
    ...tools,
    { role: "agent", text: script.answer, beat: "answer" },
  ];
}

/** A coding agent that runs a Wordcell command and cites the note it found. */
export function AgentCitesNote({ height, mode, theme }: Themed & Readonly<{ mode: SearchMode }>) {
  return (
    <AgentSession
      {...themed(theme)}
      {...sized(height)}
      agent="generic-cli"
      describe={`Illustration: a coding agent runs a Wordcell command, then answers by quoting ${NOTE_PATH}. ${modeDescriptions[mode]}`}
      title="Coding agent · app"
      turns={agentTurns(mode)}
    />
  );
}

/** The note on disk, as any editor shows it. */
export function NoteFileWindow({ theme }: Readonly<{ theme?: MockupTheme }>) {
  return (
    <MacWindow
      {...themed(theme)}
      describe={`Illustration: the file ${NOTE_PATH} open in a plain text editor. It is Markdown with a short front matter block and the rule “${NOTE_RULE}”`}
      title={NOTE_PATH}
    >
      <pre className="wordcell-note-file" data-film="note-file">
        {noteFile.map((line, index) => (
          <span className="wordcell-note-line" data-film={line === NOTE_RULE ? "note-rule" : undefined} data-rule={line === NOTE_RULE ? "" : undefined} key={index}>
            <span aria-hidden="true" className="wordcell-note-number">{index + 1}</span>
            {line === "" ? " " : line}
          </span>
        ))}
      </pre>
    </MacWindow>
  );
}

/** The agent's answer beside the file it cites. */
export function AnswerBesideFile({ mode = "context", theme }: Readonly<{ mode?: SearchMode; theme?: MockupTheme }>) {
  return (
    <div className="wordcell-mockup-pair" data-film="pair">
      <AgentCitesNote mode={mode} {...themed(theme)} />
      <NoteFileWindow {...themed(theme)} />
    </div>
  );
}

/**
 * Why the name: a citation card for roon's essay, built from our own markup
 * (no third-party embed or meme image), beside a cube that turns into lines of
 * text. It credits the essay and implies no endorsement.
 */
export function NameCard() {
  return (
    <figure aria-label={`Illustration: a card citing ${ESSAY.author}'s essay ${ESSAY.title}, beside a cube that turns into lines of text.`} className="hkm-root wordcell-name-card" data-film="name-card">
      <svg aria-hidden="true" className="wordcell-name-shape" focusable="false" viewBox="0 0 120 120">
        <g fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2.5">
          <path d="M60 14 98 34v44L60 98 22 78V34Z" />
          <path d="M22 34l38 20 38-20M60 54v44" />
        </g>
      </svg>
      <span aria-hidden="true" className="wordcell-name-arrow">→</span>
      <div aria-hidden="true" className="wordcell-name-words">
        <span>wordcel</span>
        <span />
        <span />
        <span />
      </div>
      <figcaption className="wordcell-name-cite">
        <span className="wordcell-name-kicker">Why the name</span>
        <a href={ESSAY_URL} rel="noopener" target="_blank">{ESSAY.title}</a>
        <span>{ESSAY.author} · {ESSAY.published} · {ESSAY.host}</span>
      </figcaption>
    </figure>
  );
}
