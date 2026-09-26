/* One setup prompt for the copy button and every assistant link. The local
 * MCP server and the session-memory reference are on the default branch and
 * not in the latest release yet, so the prompt installs both from source.
 * When a release includes them, pin the skill and switch to the release
 * archive, and drop the from-source sentence. */

export const SETUP_VAULT_PATH = "/absolute/path/to/kb";

export const SETUP_COMMANDS = {
  install: [
    "git clone https://github.com/hraness/wordcell.git",
    "cd wordcell",
    "bun install --frozen-lockfile",
    "bun link",
  ],
  init: "wordcell init ~/kb",
  claudeCode: `claude mcp add --transport stdio --scope user wordcell -- wordcell mcp --root ${SETUP_VAULT_PATH}`,
  codex: `codex mcp add wordcell -- wordcell mcp --root ${SETUP_VAULT_PATH}`,
  skill: "bunx skills add hraness/wordcell --skill wordcell",
} as const;

export const CONNECT_CLIENT_URL = "https://wordcell.io/docs/reference#connect-a-client";

export function buildSetupPrompt(): string {
  return [
    "Set up Wordcell as local memory for my coding agent. Wordcell keeps notes as Markdown files in a vault on my computer. If you can run commands, ask me before each one. Otherwise, give me each command to run.",
    "",
    "1. Install Wordcell from source, because `wordcell mcp` is available from source until the next release. This needs Git and Bun 1.3.14 or later:",
    ...SETUP_COMMANDS.install.map((command) => `   ${command}`),
    `2. Unless I already have a vault, create one: ${SETUP_COMMANDS.init}`,
    `3. Register the MCP server with the vault's absolute path. Claude Code: ${SETUP_COMMANDS.claudeCode}`,
    `   Codex: ${SETUP_COMMANDS.codex}`,
    `   Cursor: add a "wordcell" server to ~/.cursor/mcp.json. Other clients: ${CONNECT_CLIENT_URL}`,
    `4. Install the Wordcell skill: ${SETUP_COMMANDS.skill}`,
    "5. When I ask you to remember a conversation, follow the skill's session-memory reference.",
  ].join("\n");
}

export const SETUP_PROMPT = buildSetupPrompt();

/* Kept below Cursor's documented 10,000-character deeplink limit
 * (https://cursor.com/docs/integrations/deeplinks, checked 2026-09-26).
 * ChatGPT and Grok publish no limit. */
export const MAX_SETUP_URL = 2000;

export type SetupTarget =
  | Readonly<{ id: "chatgpt" | "grok" | "cursor"; kind: "link"; label: string; href: string; note: string }>
  | Readonly<{ id: "claude-code" | "codex"; kind: "command"; label: string; command: string }>;

/* Each link target was checked on 2026-09-26: ChatGPT starts a chat with the
 * prompt at once, Grok and Cursor open with it filled in. Claude.ai drops the
 * prompt for signed-out visitors, so it is not offered. */
export function setupTargets(prompt: string = SETUP_PROMPT): readonly SetupTarget[] {
  const encoded = encodeURIComponent(prompt);
  return [
    {
      id: "chatgpt",
      kind: "link",
      label: "ChatGPT",
      href: `https://chatgpt.com/?q=${encoded}`,
      note: "Starts a chat with the prompt right away.",
    },
    {
      id: "grok",
      kind: "link",
      label: "Grok",
      href: `https://grok.com/?q=${encoded}`,
      note: "Opens with the prompt filled in.",
    },
    {
      id: "cursor",
      kind: "link",
      label: "Cursor",
      href: `https://cursor.com/link/prompt?text=${encoded}`,
      note: "Opens Cursor with the prompt filled in. Cursor does not run it until you send it.",
    },
    { id: "claude-code", kind: "command", label: "Claude Code", command: SETUP_COMMANDS.claudeCode },
    { id: "codex", kind: "command", label: "Codex", command: SETUP_COMMANDS.codex },
  ];
}
