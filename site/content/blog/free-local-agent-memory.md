Wordcell now serves a Markdown vault to local Model Context Protocol (MCP) clients, imports Supermemory exports, and gives agents a workflow for saving what a session decided as a note. The memory stays in files you can read, diff, and commit, with no hosted service, no account, and no usage bill.

On Monday a coding agent works out why the release script pins an older compiler. On Tuesday a new session opens in the same repository and starts without that reason, unless someone wrote it where the agent looks. Wordcell keeps that kind of record as Markdown notes in a folder you control, and this launch lets agents read and write those notes through their own tools.

Latest release: v{{release.version}}. The [migration page](/migrate/supermemory#steps) starts with the release install, and `bunx skills add hraness/wordcell#v{{release.version}} --skill wordcell` adds the skill from that release.

## An MCP server, a Supermemory importer, and a session-memory workflow

`wordcell mcp --root <vault>` serves a vault over standard input and output to local MCP clients such as Claude Code, Claude Desktop, Cursor, and Codex. Agents search, list, and read notes, follow links and backlinks, create notes, replace a note body at the revision they read, and add relations between notes. With `--repo`, the server also returns context for a repository. Every write goes through the same checks as the command line, and `--read-only` leaves the write tools out. The [MCP server reference](/docs/reference#local-mcp-server) lists each tool and shows how to [connect a client](/docs/reference#connect-a-client).

`wordcell import supermemory <export.json>` turns documents and memory entries saved from the Supermemory API into notes. Each version of a memory becomes its own note, linked newest to oldest by `supersedes` relations. Running the import again updates notes you have not edited, skips unchanged ones, and reports notes you changed yourself as conflicts without touching them. The importer reads export files only and makes no network calls. [Import from Supermemory](/docs/reference#import-from-supermemory) lists the fields and where each kind of item lands.

The `wordcell` skill includes a session-memory workflow. When you ask, the agent saves what the conversation decided as a dated session note, links it to the notes it changed, and keeps a profile note with a Stable section and a Recent section. Wordcell extracts nothing on its own: the agent writes the note, and you can read it before anything depends on it. The steps are in the [session-memory reference](https://github.com/hraness/wordcell/blob/d87d4ecdd0a0b1351bc2b0d0f3cdf8de30c047dc/skills/wordcell/references/session-memory.md).

Two guides cover the rest of a move. [Migrate from Supermemory](/docs/migration-from-supermemory) exports your data, imports it, and lists what does not transfer. [Sync a vault with Git](/docs/sync) keeps one vault current on several machines through a private repository.

## Search ranking on public scientific abstracts

On {{evidence.scifact.queries}} BEIR SciFact queries over {{evidence.scifact.corpus}} public scientific abstracts, Wordcell exact search put a relevant abstract first for {{evidence.scifact.exact}} of queries. Optional Jev reranking raised that to {{evidence.scifact.reranked}} in a study run on {{evidence.scifact.measured}}. Reranking sends each query and candidate snippets to a paid provider. The [benchmarks page](/benchmarks#wordcell) has the method and raw results.

## Supermemory extracts memory for you; a Wordcell agent writes it as files

Supermemory builds user profiles automatically through ingestion: a model reads your content for facts about you and adds, updates, or removes them. Its graph memory goes further and “infers a fact you never stated in one place, from patterns across memories” ([graph memory](https://supermemory.ai/docs/concepts/graph-memory) and [user profiles](https://supermemory.ai/docs/concepts/user-profiles), checked September 26, 2026). That suits an application that wants memory built for it. It also means a stored fact can come from a step you never saw.

In Wordcell the agent writes the memory as Markdown, and the file is the memory. You can read a note, diff it, and revert it with Git. `update_note_body` applies an edit only at the revision the agent read, so an edit based on an older copy is refused instead of overwriting a newer one. A `supersedes` relation keeps the older claim readable beside the newer one. Supermemory marks the latest fact for retrieval, and its documentation says the history “can remain for audit” ([graph memory](https://supermemory.ai/docs/concepts/graph-memory), checked September 26, 2026). Graph answers carry a proof that names each source note and a digest of its content, so an edited note no longer matches the proof ([Query the derived graph](/docs/graph-authority)). Search by meaning uses an embedding model that runs on your machine. When a memory is wrong, it is a line in a file you can find and fix. [Markdown memory for coding agents](/docs/agent-memory) covers the approach.

## When Supermemory fits better

Choose Supermemory when you want extraction and connectors run for you: its documentation points to the hosted platform for “connectors, MCP, and the best-tuned extraction pipeline” ([self-hosting overview](https://supermemory.ai/docs/self-hosting/overview), checked September 26, 2026). [When Supermemory fits better](/compare/supermemory#choose-supermemory) lists more cases.

Price does not separate the two. Wordcell is MIT licensed, and the commands above run on your machine without an account. The same self-hosting overview says Supermemory’s self-hosted edition is free and open source.

To move an existing Supermemory account, start with [Migrate from Supermemory](/migrate/supermemory).
