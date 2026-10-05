# Agent setup links: implementation notes (2026-09-30)

These notes were published at `/docs/agent-handoffs` until 2026-10-04, when that
page became the reader-facing setup guide, "Connect Wordcell to your coding
agent". They record the sources behind the home page setup links and command
tabs in `site/wordcell/setup-prompt.ts`. They are kept here for maintainers and
are not rendered on wordcell.io.

---

The marketing site uses the shared `agentSetupTargets(prompt)` helper from
`@hraness/design-kit`. Cursor and the Codex desktop app have documented
composer links. Other targets copy the setup prompt and open the product
entry page, where the user can paste it. No button sends the prompt.

Verified public sources, September 30, 2026:

- [Cursor deep links](https://cursor.com/docs/reference/deeplinks):
  `https://cursor.com/link/prompt?text=…` fills the composer. The documented
  URL limit is 10,000 characters.
- [OpenAI desktop deep links](https://learn.chatgpt.com/docs/reference/commands#deep-links):
  `codex://new?prompt=…` fills a local chat composer. A Dot-specific prompt
  URL has not been verified, so its action opens ChatGPT after copying.
- [Grok Bot](https://cursor.com/docs/grok-bot) and
  [getting started](https://cursor.com/docs/grok-bot/get-started): the bot
  has a persistent cloud computer and uses a Cursor account. Its official
  entry is `https://cursor.com/dashboard/bot`; no prompt-prefill URL is
  documented there.
- [Muse](https://ai.meta.com/muse/): the agent has an isolated Linux
  computer. The launch entry is `https://applink.muse.ai/`; no prompt-prefill
  URL is documented there.
- [Devin](https://docs.devin.ai/): the app entry is
  `https://app.devin.ai/`. Repository-backed storage can preserve a Wordcell
  vault when a coding workspace is temporary.

Wordcell needs Git, Bun, and a writable vault. Keeping decisions between
tasks requires persistent files or a synced repository; installing a skill
alone does not preserve files after a workspace is deleted. An agent can
use the CLI directly when its client cannot configure stdio MCP.

The command tabs cover Claude Code, Codex, Cursor, Gemini CLI, and GitHub
Copilot in VS Code. Stack Overflow's [April 2026 pulse survey](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work/)
of 1,100 developers and working professionals reported code-assistant use
of Copilot (61%), Claude Code (51%), Codex (20%), and Cursor (20%). Those
overlapping respondent shares support including these clients. The tabs
show supported commands and configurations. Gemini's server flags
follow `--`, as shown in its [MCP guide](https://geminicli.com/docs/tools/mcp-server/).
Cursor's configuration goes in `~/.cursor/mcp.json`. VS Code's
configuration goes in `.vscode/mcp.json`, with a top-level `servers` object
as described in its [MCP guide](https://code.visualstudio.com/docs/agent-customization/mcp-servers).
