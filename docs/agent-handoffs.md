# Connect Wordcell to your coding agent

`wordcell mcp` serves one Markdown vault to a coding agent over the Model
Context Protocol (MCP). The agent starts the server itself, then searches,
reads, and follows links between your notes, and it can write notes unless you
start the server with `--read-only`. This guide registers the server with
Claude Code, Codex, and Cursor, checks that the agent can start it, and lists
the errors you are most likely to see.

Checked on October 4, 2026: Claude Code 2.1.287 and Codex CLI 0.160.0
registered Wordcell 0.26.3 with the commands below, in a test project with
empty configuration directories. The command output on this page comes from
those runs and from calling the server's tools directly, without an agent.

## Before you start

1. Install Wordcell 0.23.0 or newer, the first release with `wordcell mcp`.
   [Get started](getting-started.md#install-the-cli) has the install command.
2. Find the absolute path of your vault, such as a `kb/` folder in your
   repository or an existing notes folder.
3. Search the vault from a terminal for a phrase you know is in one note:

```sh
wordcell search "a phrase from your notes" --root /absolute/path/to/kb --mode exact
```

If the result names the note you expected, the vault and the installation
work, and any later problem is in the agent's configuration. Exact search
reads the Markdown directly and needs no index or model.

Every client runs the same server command. Choose its arguments first:

- `--root /absolute/path/to/kb` names the vault and is required.
- `--repo /absolute/path/to/repository` adds the `context` tool, which returns
  the notes and `AGENTS.md` files that apply to a path in that repository.
- `--read-only` leaves out the three tools that write notes.

Use absolute paths. A client can start the server from a different working
directory than your terminal's, and a relative path resolves from there.

## Claude Code

Add the server with `claude mcp add`. Everything after `--` is the server
command:

```sh
claude mcp add --transport stdio --scope project wordcell -- wordcell mcp --root /absolute/path/to/kb
```

`--scope` decides where Claude Code saves the server, as its
[MCP guide](https://code.claude.com/docs/en/mcp) describes:

| Scope | Saved in | Available to |
| --- | --- | --- |
| `local`, the default | `~/.claude.json`, under this project | You, in this project |
| `project` | `.mcp.json` at the project root | Everyone who uses the repository, after each person approves it |
| `user` | `~/.claude.json` | You, in every project |

`claude mcp list` starts each configured server to check it. A server that
started prints `✔ Connected`:

```text
$ claude mcp list
Checking MCP server health…

wordcell: wordcell mcp --root /tmp/wordcell-demo/kb --repo /tmp/wordcell-demo - ✔ Connected
```

A server saved with `--scope project` waits until you start `claude` in that
project and approve it. Until then the list shows:

```text
wordcell: wordcell mcp --root /tmp/wordcell-demo/kb - ⏸ Pending approval (run `claude` to approve)
```

An absolute vault path in `.mcp.json` works only on your machine. When the
vault is a `kb/` folder in the repository, a shared `.mcp.json` can name it
through the `CLAUDE_PROJECT_DIR` variable that Claude Code sets for the
server. Keep the `:-.` default, which Claude Code requires for this variable
in `.mcp.json`:

```json
{
  "mcpServers": {
    "wordcell": {
      "type": "stdio",
      "command": "wordcell",
      "args": ["mcp", "--root", "${CLAUDE_PROJECT_DIR:-.}/kb"]
    }
  }
}
```

With the server approved, `claude mcp list` showed this entry connected in the
same test.

## Codex

```sh
codex mcp add wordcell -- wordcell mcp --root /absolute/path/to/kb
```

The command adds this table to `~/.codex/config.toml`. The
[Codex MCP guide](https://developers.openai.com/codex/mcp) says the Codex CLI,
the IDE extension, and the ChatGPT desktop app share that file. You can also
write the table yourself, there or in `.codex/config.toml` inside a trusted
project:

```toml
[mcp_servers.wordcell]
command = "wordcell"
args = ["mcp", "--root", "/absolute/path/to/kb"]
```

`codex mcp list` shows the configuration without starting the server:

```text
$ codex mcp list
Name      Command   Args                                                        Env  Cwd  Status   Auth
wordcell  wordcell  mcp --root /tmp/wordcell-demo/kb --repo /tmp/wordcell-demo  -    -    enabled  Unsupported
```

`enabled` means the entry is switched on, not that the server works: a vault
path that does not exist also shows `enabled`. Start `codex` and run `/mcp` to
see the servers that started. By default Codex waits 10 seconds for a server
to start and 60 seconds for a tool call; `startup_timeout_sec` and
`tool_timeout_sec` in the same table change those limits.

## Cursor

Cursor reads MCP servers from `.cursor/mcp.json` in a project, or from
`~/.cursor/mcp.json` for every project, as its
[MCP guide](https://cursor.com/docs/context/mcp) describes:

```json
{
  "mcpServers": {
    "wordcell": {
      "type": "stdio",
      "command": "wordcell",
      "args": ["mcp", "--root", "/absolute/path/to/kb"]
    }
  }
}
```

When the vault is a `kb/` folder in the project, the project file can use
Cursor's `${workspaceFolder}` variable instead of a fixed path:
`"args": ["mcp", "--root", "${workspaceFolder}/kb"]`. Turn servers on or off
from Customize in the sidebar. Server errors appear in the Output panel under
MCP Logs, and Cursor asks before it runs an MCP tool unless your run mode
allows it.

These steps come from Cursor's documentation, read on October 4, 2026. They
were not run in Cursor for this guide.

## Claude Desktop

From the Claude menu, open Settings, then Developer, then Edit Config, and add
the server to `claude_desktop_config.json`. The file is in
`~/Library/Application Support/Claude/` on macOS and `%APPDATA%\Claude\` on
Windows. Quit and restart Claude Desktop after you save it.

```json
{
  "mcpServers": {
    "wordcell": {
      "command": "wordcell",
      "args": ["mcp", "--root", "/absolute/path/to/kb"]
    }
  }
}
```

On macOS, the server's standard error goes to
`~/Library/Logs/Claude/mcp-server-wordcell.log`. These steps follow the
[local server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers),
read on October 4, 2026, and were not run for this guide.

## Other MCP clients

A client that starts local stdio servers can run Wordcell with the command
`wordcell` and the arguments `mcp --root /absolute/path/to/kb`. The server
writes only protocol messages to standard output and its errors to standard
error. The [local MCP server reference](reference.md#local-mcp-server) lists
the protocol versions it accepts.

## Check that the agent reads your notes

Ask the agent to call Wordcell's `search` tool with the phrase you searched in
the terminal, in exact mode:

```json
{"query": "a phrase from your notes", "mode": "exact", "limit": 3}
```

The result should name the same note as the terminal search. Then ask for
`get_note` with that note's ID, its vault path without `.md`, and compare the
body with the file. Called directly in the test project, `search` for
`parser retries` returned `notes/parser-contract` at line 11, and `context` for
`src/parser.ts` returned the same note, which declares that file in its
`repository_scopes`.

Start with exact mode. The default mode, `hybrid`, adds local semantic search,
and the first hybrid search on a machine downloads an embedding model. In one
run on October 4, 2026, that download was 334 MB and the first call took 26.5
seconds. When semantic search is unavailable, the result is marked partial and
`diagnostics.lanes` gives the reason.

The tools the agent sees depend on the server arguments:

| Server arguments | Tools |
| --- | --- |
| `--root` | `search`, `list_notes`, `get_note`, `backlinks`, `links`, `create_note`, `update_note_body`, `add_relation` |
| `--root` and `--repo` | The same tools and `context` |
| `--root`, `--repo`, and `--read-only` | `search`, `context`, `list_notes`, `get_note`, `backlinks`, `links` |

## Keep results within the agent's limits

Wordcell caps each tool result at 64 KiB of JSON and sends the same JSON again
as text. When the cap applies, it leaves out the items that do not fit and
sets `truncated: true` and an `omitted` count. On a test vault of 400 notes:

| Call | JSON returned as text |
| --- | --- |
| `search`, exact, default 10 results | 13.2 KiB |
| `search`, exact, `limit: 3` | 4.3 KiB |
| `search`, exact, `limit: 100` | 62.9 KiB, with 49 results returned and 51 omitted |
| `list_notes`, `limit: 1000` | 63.7 KiB, with 142 of 400 notes returned |

Claude Code warns when an MCP tool result passes 10,000 tokens and limits
results to 25,000 tokens by default. Set `MAX_MCP_OUTPUT_TOKENS` before you
start `claude` to raise the limit; a result over the limit is saved to a file
that Claude reads when it needs to, according to its
[output limits](https://code.claude.com/docs/en/mcp#mcp-output-limits-and-warnings).
Codex takes a per-tool `output_token_limit` in a table such as
`[mcp_servers.wordcell.tools.search]` in `config.toml`, as its
[MCP guide](https://developers.openai.com/codex/mcp) describes. Token counts
depend on each model's tokenizer and were not measured here, so keep `limit`
at 10 or lower and open notes one at a time with `get_note`.

## Troubleshoot the connection

| Symptom | What to check or change |
| --- | --- |
| `claude mcp list` shows `Failed to connect` with `ENOENT: Executable not found in $PATH: "wordcell"` | The client cannot find `wordcell` on its `PATH`, which can be shorter than your terminal's. Use the absolute path that `which wordcell` prints as the command, then restart the client. |
| `claude mcp list` shows `Failed to connect` with `CONNECTION_CLOSED: Connection closed` | The server started and exited. Run the same command in a terminal to see why. A vault path that does not exist prints `✗ ENOENT: no such file or directory` and `→ wordcell mcp --help`, then exits with status 2. With an absolute `wordcell` path, Bun must also be on the client's `PATH`, because `wordcell` runs on Bun. |
| `claude mcp list` shows ``⏸ Pending approval (run `claude` to approve)`` | A server from `.mcp.json` waits for approval. Start `claude` in the project and accept it. |
| Codex lists the server, but its tools never appear | `codex mcp list` does not start servers. Run the server command in a terminal, fix the path or `PATH`, and check `/mcp` again. |
| Search returns a partial result | Read `diagnostics.lanes`, then search again with `mode: "exact"`, which reads the current Markdown without the semantic index. Read [optional adapters](reference.md#review-lifecycle-scripts-before-enabling-optional-adapters) before you set up semantic search. |
| A result has `truncated: true` | Lower `limit` on `search` or `list_notes`, or `limit` and `depth` on `backlinks` and `links`. Read the `omitted` count, then open notes one at a time with `get_note`. |
| `get_note` reports `truncated: true` | The read stopped at 64 KiB. Open the Markdown file itself, and do not send the shortened body to `update_note_body`, which replaces the whole body. |
| `context` or the write tools are missing | `context` needs `--repo`, and `--read-only` removes the write tools. Change the server arguments and restart the connection. |

## Remove the server

- Claude Code: `claude mcp remove wordcell -s local`, with the scope you used.
- Codex: `codex mcp remove wordcell`.
- Cursor and Claude Desktop: delete the `wordcell` entry from the file you
  edited.

Next, [use Wordcell with a coding agent](agent-workflow.md) to keep decisions
and plans beside the code, or
[search an existing Obsidian vault](obsidian.md) from the agent without
changing it.
