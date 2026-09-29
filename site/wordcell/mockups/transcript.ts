/**
 * One recorded Wordcell session, the only source of command and output text in
 * the site's mockups and the launch film.
 *
 * Recorded on 2026-09-29 with the pinned @hraness/wordcell 0.24.1 package in an
 * empty Git repository that has one source file, packages/parser/src/index.ts,
 * and a packages/parser/AGENTS.md guide. Right after it was created, the
 * parser note was tied to packages/parser by adding `repository_scopes` to its
 * front matter.
 *
 * tests/mockups.test.ts replays every step marked `replay: true` against the
 * pinned CLI and fails when the output drifts. Document IDs and revision hashes
 * are random per run, so the test compares them by shape. The steps run in
 * the order they are listed here. The two steps that
 * need the optional local search model (`index` and the hybrid search) are not
 * replayed in CI, because the first run downloads the model; their output is
 * kept exactly as recorded, with the machine-specific database path left off
 * the index output.
 */

export const RECORDED_VERSION = "0.24.1";
export const RECORDED_ON = "2026-09-29";

export type RecordedStep = Readonly<{
  id: string;
  /** The command as typed, with `wordcell` first. */
  command: readonly string[];
  output: readonly string[];
  /** True when tests/mockups.test.ts reruns it against the pinned CLI. */
  replay: boolean;
}>;

export const NOTE_PATH = "notes/parser-contract.md";
export const NOTE_RULE = "Parser retries stop after three attempts.";
export const SOURCE_FILE = "packages/parser/src/index.ts";

/** The parser note on disk after the scope was added, line by line. */
export const noteFile: readonly string[] = [
  "---",
  "document_id: 03f883ae-0c6a-4dc8-9168-6bc4c21d3303",
  "type: concept",
  "title: Parser contract",
  "repository_scopes:",
  "  - packages/parser",
  "---",
  "",
  NOTE_RULE,
];

const parserSnippet = "--- document_id: 03f883ae-0c6a-4dc8-9168-6bc4c21d3303 type: concept title: Parser contract repository_scopes: - packages/parser --- Parser retries stop after three attempts.";

export const steps = {
  init: {
    id: "init",
    command: ["wordcell", "init", "kb"],
    output: ["Initialized kb with 7 files."],
    replay: true,
  },
  create: {
    id: "create",
    command: ["wordcell", "note", "create", "notes/parser-contract", "--title", "Parser contract", "--type", "concept", "--body", NOTE_RULE, "--root", "kb"],
    output: [
      "Created notes/parser-contract.md",
      "Revision: sha256:b91878b3732a52a91babe482f69bc42c073422cc7f84b67de2b809ec9cc6a8b4; outbound relationships: 0.",
    ],
    replay: true,
  },
  createOther: {
    id: "createOther",
    command: ["wordcell", "note", "create", "notes/release-checklist", "--title", "Release checklist", "--type", "concept", "--body", "Tag a release only after CI passes on main.", "--root", "kb"],
    output: [
      "Created notes/release-checklist.md",
      "Revision: sha256:9d11b5db46dd017d98813e92c52cfdbda5cb555fb5909f2411036eaffe16a37f; outbound relationships: 0.",
    ],
    replay: true,
  },
  exact: {
    id: "exact",
    command: ["wordcell", "search", "parser retries", "--root", "kb", "--mode", "exact"],
    output: [
      "Exact results for “parser retries” (1)",
      "  1. 1.000  notes/parser-contract.md:9 — Parser contract [exact#1]",
      `    ${parserSnippet}`,
    ],
    replay: true,
  },
  exactMiss: {
    id: "exactMiss",
    command: ["wordcell", "search", "how many times do we retry", "--root", "kb", "--mode", "exact"],
    output: ["Exact results for “how many times do we retry” (0)", "  None."],
    replay: true,
  },
  index: {
    id: "index",
    command: ["wordcell", "index", "--root", "kb"],
    output: [
      "Indexed /private/tmp/app/kb with QMD.",
      "Documents: 2 changed, 0 unchanged, 0 removed.",
      "Embeddings: 2 chunks; model: hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf#0f741b5a6585bd53aeb15cd1372c56f2a0f65e12.",
    ],
    replay: false,
  },
  hybrid: {
    id: "hybrid",
    command: ["wordcell", "search", "how many times do we retry", "--root", "kb"],
    output: [
      "Hybrid results for “how many times do we retry” (2)",
      "  1. 1.000  notes/parser-contract.md:1 — Parser contract [qmd#1]",
      `    ${parserSnippet}`,
      "  2. 0.984  notes/release-checklist.md:1 — Release checklist [qmd#2]",
      "    --- document_id: 075f5139-dcf2-4f84-9c3c-0d74b44ef4d2 type: concept title: Release checklist --- Tag a release only after CI passes on main.",
    ],
    replay: false,
  },
  context: {
    id: "context",
    command: ["wordcell", "context", SOURCE_FILE, "--root", "kb", "--repo", "."],
    output: [
      "Agent context for packages/parser/src/index.ts (scope packages/parser/src)",
      "Guides (root → nearest):",
      "  packages/parser/AGENTS.md",
      "Wordcell hubs (nearest → root):",
      "  None.",
      "Repository memory (1 of 1 matched records):",
      "  Maintained knowledge (1/1)",
      "    notes/parser-contract.md — Parser contract  [packages/parser; ancestor; directory]",
      `      ${NOTE_RULE}`,
      "  Active plans (0/0)",
      "    None.",
      "  Dated research (0/0)",
      "    None.",
      "  Reports (0/0)",
      "    None.",
      "  Historical plans (0/0)",
      "    None.",
    ],
    replay: true,
  },
  plan: {
    id: "plan",
    command: ["wordcell", "note", "create", "plans/parser-timeouts", "--title", "Parser timeouts", "--type", "plan", "--body", "Keep the retry limit from [[notes/parser-contract]] when adding timeouts.", "--root", "kb"],
    output: [
      "Created plans/parser-timeouts.md",
      "Revision: sha256:1638d596d33e64140a5227cc449960b671bf8c33336711c676bee60554fabfbe; outbound relationships: 0.",
    ],
    replay: true,
  },
  backlinks: {
    id: "backlinks",
    command: ["wordcell", "graph", "query", "--program", "backlinks", "--note", "notes/parser-contract", "--root", "kb"],
    output: [
      "backlinks: 1 derived graph rows.",
      "Snapshot: c3ee04718fa8d3a269ef01995186146d759208e3b0c6e098a05b006431c65faf",
      "Proofs and exact source record digests are included in --json output.",
      "source    target    line    kind    predicate",
      '"plans/parser-timeouts"    "notes/parser-contract"    7    "link"    ""',
    ],
    replay: true,
  },
  version: {
    id: "version",
    command: ["wordcell", "--version"],
    output: [`wordcell ${RECORDED_VERSION}`],
    replay: true,
  },
} as const satisfies Record<string, RecordedStep>;

export type StepId = keyof typeof steps;

/** Quotes an argument the way a person would type it in a shell. */
export function shellWord(word: string): string {
  return /^[\w./:@=-]+$/u.test(word) ? word : `"${word.replace(/(["\\$`])/gu, "\\$1")}"`;
}

export function commandLine(step: RecordedStep): string {
  return step.command.map(shellWord).join(" ");
}
