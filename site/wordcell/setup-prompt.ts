/* One setup prompt for the copy button and every assistant link. The install
 * and skill commands bind to the release this site has admitted in
 * published-release.json, never to a typed version. SETUP_COMMANDS.install is
 * also the /migrate/supermemory install step, so a change here must stay a
 * command block that docs/getting-started.md shows. */

import { agentSetupTargets, MAX_AGENT_SETUP_URL, type AgentSetupDestination } from "@hraness/design-kit";
import { publishedRelease } from "../app/publication";

/** The first release with `wordcell mcp`, `wordcell import supermemory`, and the skill's session-memory reference. */
export const AGENT_MEMORY_RELEASE = "0.23.0";

if (publishedRelease === null) {
  throw new Error("The setup prompt installs the published release, but the site has not admitted one.");
}
const releaseVersion = publishedRelease.version;

export const SETUP_VAULT_PATH = "/absolute/path/to/kb";

export const SETUP_COMMANDS = {
  install: [
    `bun add --global --ignore-scripts https://github.com/hraness/wordcell/releases/download/v${releaseVersion}/hraness-wordcell-${releaseVersion}.tgz`,
    "wordcell --help",
  ],
  init: "wordcell init ~/kb",
  claudeCode: `claude mcp add --transport stdio --scope user wordcell -- wordcell mcp --root ${SETUP_VAULT_PATH}`,
  codex: `codex mcp add wordcell -- wordcell mcp --root ${SETUP_VAULT_PATH}`,
  cursor: JSON.stringify({ mcpServers: { wordcell: { command: "wordcell", args: ["mcp", "--root", SETUP_VAULT_PATH] } } }, null, 2),
  gemini: `gemini mcp add --scope user wordcell wordcell mcp -- --root ${SETUP_VAULT_PATH}`,
  copilot: JSON.stringify({ servers: { wordcell: { type: "stdio", command: "wordcell", args: ["mcp", "--root", SETUP_VAULT_PATH] } } }, null, 2),
  skill: `bunx skills add hraness/wordcell#v${releaseVersion} --skill wordcell`,
} as const;

export const CONNECT_CLIENT_URL = "https://wordcell.io/docs/reference#connect-a-client";

export function buildSetupPrompt(): string {
  return [
    "Set up Wordcell as memory you can use between tasks. Keep my decisions, reasoning, and sources in a Markdown vault on my local machine or in persistent project storage. Use your terminal to install and connect it.",
    "",
    `1. Install Wordcell unless \`wordcell --version\` already shows ${AGENT_MEMORY_RELEASE} or later, the first release with \`wordcell mcp\`. This needs Git and Bun 1.3.14 or later:`,
    ...SETUP_COMMANDS.install.map((command) => `   ${command}`),
    `2. Choose a vault that will be available on future tasks. On a local or persistent computer, create one with ${SETUP_COMMANDS.init}. On a disposable session computer, put kb/ in the repository and preserve the notes with the project. Reuse my existing vault when there is one.`,
    `3. If your client supports stdio MCP, connect \`wordcell mcp --root <vault-absolute-path>\` using its setup guide: ${CONNECT_CLIENT_URL}. Claude Code: ${SETUP_COMMANDS.claudeCode}. Codex: ${SETUP_COMMANDS.codex}. Otherwise use the Wordcell CLI directly.`,
    `4. If you support skills, install the Wordcell skill: ${SETUP_COMMANDS.skill}`,
    "5. Save decisions with their reasons and sources. Before changing related code, search the vault and check the repository context. When I ask you to remember a conversation, follow the skill's session-memory reference.",
  ].join("\n");
}

export const SETUP_PROMPT = buildSetupPrompt();

/* Cursor documents a 10,000-character URL limit. Personal-agent links copy
 * first: their public docs do not document a prompt-prefill URL. Sources and
 * the capability review are in docs/agent-handoffs.md (2026-09-30). */
export const MAX_SETUP_URL = MAX_AGENT_SETUP_URL;

export type SetupTarget =
  | Readonly<AgentSetupDestination & { kind: "link" }>
  | Readonly<{ id: "claude-code" | "codex" | "cursor-config" | "gemini-cli" | "github-copilot"; kind: "command"; label: string; mark: string; command: string; filename?: string }>;

/** Prefer personal agents and coding environments with a computer. No action sends the prompt. */
export function setupTargets(prompt: string = SETUP_PROMPT): readonly SetupTarget[] {
  return [
    ...agentSetupTargets(prompt).map((target) => ({ ...target, kind: "link" as const })),
    { id: "claude-code", kind: "command", label: "Claude Code", mark: "claude code", command: SETUP_COMMANDS.claudeCode },
    { id: "codex", kind: "command", label: "Codex", mark: "codex", command: SETUP_COMMANDS.codex },
    { id: "cursor-config", kind: "command", label: "Cursor", mark: "cursor", command: SETUP_COMMANDS.cursor, filename: "~/.cursor/mcp.json" },
    { id: "gemini-cli", kind: "command", label: "Gemini CLI", mark: "gemini cli", command: SETUP_COMMANDS.gemini },
    { id: "github-copilot", kind: "command", label: "GitHub Copilot", mark: "github copilot", command: SETUP_COMMANDS.copilot, filename: ".vscode/mcp.json" },
  ];
}
