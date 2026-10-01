Wordcell gives coding agents memory in Markdown files you can read, diff, and commit. A local Model Context Protocol (MCP) server connects an agent to the vault, and an importer can bring in records exported from Supermemory.

On Monday a coding agent works out why the release script pins an older compiler. On Tuesday a new session opens in the same repository and starts without that reason, unless someone wrote it where the agent looks. Wordcell keeps that record in a folder you control and lets connected agents read and update it through their own tools.

The [migration guide](/migrate/supermemory#steps) covers installation, importing an export, and connecting an agent.

## An MCP server, a Supermemory importer, and a session-memory workflow

`wordcell mcp --root <vault>` serves a vault over standard input and output to local MCP clients such as Claude Code, Claude Desktop, Cursor, and Codex. Agents search, list, and read notes, follow links and backlinks, create notes, replace a note body at the revision they read, and add relations between notes. With `--repo`, the server also returns context for a repository. Every write goes through the same checks as the command line, and `--read-only` leaves the write tools out. The [MCP server reference](/docs/reference#local-mcp-server) lists each tool and shows how to [connect a client](/docs/reference#connect-a-client).

`wordcell import supermemory <export.json>` turns documents and memory entries saved from the Supermemory API into notes. Each version of a memory becomes its own note, linked newest to oldest by `supersedes` relations. Running the import again updates notes you have not edited, skips unchanged ones, and reports notes you changed yourself as conflicts without touching them. The importer reads export files only and makes no network calls. [Import from Supermemory](/docs/reference#import-from-supermemory) lists the fields and where each kind of item lands.

The `wordcell` skill includes a session-memory workflow. When you ask, the agent saves what the conversation decided as a dated session note, links it to the notes it changed, and keeps a profile note with a Stable section and a Recent section. Wordcell extracts nothing on its own: the agent writes the note, and you can read it before anything depends on it. The steps are in the [session-memory reference](https://github.com/hraness/wordcell/blob/d87d4ecdd0a0b1351bc2b0d0f3cdf8de30c047dc/skills/wordcell/references/session-memory.md).

Two guides cover the rest of a move. [Migrate from Supermemory](/docs/migration-from-supermemory) exports your data, imports it, and lists what does not transfer. [Sync a vault with Git](/docs/sync) keeps one vault current on several machines through a private repository.

## Evaluate retrieval on the notes you need

Try questions whose answers you can identify in the vault: an exact name, a design decision, a superseded plan, and a question with no recorded answer. Check the source passages the agent receives, including whether they describe current behavior. The [benchmarks page](/benchmarks#wordcell) reports a separate study on public scientific abstracts; it does not measure the quality of answers from your private notes.

Exact search runs locally. Search by meaning uses a local embedding model. Optional hosted reranking sends the query and candidate snippets to a paid provider, so choose it according to the vault's data policy and the improvement you measure.

## Supermemory extracts memory for you; a Wordcell agent writes it as files

Supermemory describes automatic profile building through ingestion: a model reads content for facts and updates the profile. Its [graph-memory documentation](https://supermemory.ai/docs/concepts/graph-memory) also describes inferences drawn across records; its [profile guide](https://supermemory.ai/docs/concepts/user-profiles) explains how those facts become a user profile. That suits an application that wants an extraction service. A stored fact may be an inference rather than something the person explicitly stated.

In Wordcell the agent writes the memory as Markdown, and the file is the memory. You can read a note, diff it, and revert it with Git. `update_note_body` applies an edit only at the revision the agent read, so an edit based on an older copy is refused. A `supersedes` relation keeps an older claim linked to its replacement. Graph answers carry a proof naming each source note and a digest of its content, so an edited note no longer matches the proof ([graph reference](/docs/graph-authority)). When a memory is wrong, it is a line in a file you can find and fix. [Markdown memory for coding agents](/docs/agent-memory) covers the approach.

## When Supermemory fits better

Consider Supermemory when you want hosted extraction and connectors. Its [self-hosting overview](https://supermemory.ai/docs/self-hosting/overview) distinguishes the hosted platform from the edition you operate yourself. [When Supermemory fits better](/compare/supermemory#choose-supermemory) compares those choices.

Price does not separate the two. Wordcell is MIT licensed, and the commands above run on your machine without an account. The same self-hosting overview says Supermemory’s self-hosted edition is free and open source.

To move an existing Supermemory account, start with [Migrate from Supermemory](/migrate/supermemory).
