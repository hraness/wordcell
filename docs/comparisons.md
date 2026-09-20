# Choose a Markdown knowledge workflow

Wordcell is for people who want their coding agent to reuse decisions, follow
authored links, recover Git context, and publish selected notes from a local
Markdown knowledge base. It combines those operations in a CLI and TypeScript
SDK. You can keep your text editor, Git workflow, and existing Markdown files.

Local storage is a shared strength of this category. QMD, Basic Memory's local
mode, and Obsidian also work with files on your machine. Choose by the workflow
you need, rather than by a claim that only one of these projects is local.

This comparison was checked against the linked primary documentation on
September 19, 2026. It describes the documented products and standard workflows;
plugins or custom scripts can add other behavior. The selection advice below is
our assessment of those documented capabilities.

## At a glance

| Approach | A good fit when you want… | What Wordcell adds or changes |
| --- | --- | --- |
| Plain Markdown with your editor, Git, and `rg` | Portable files and a small toolset you already know. | Consistent metadata queries, derived backlinks and typed relations, repository-scope context, bounded agent handoffs, and a publication workflow. |
| QMD | Local search over document collections, with keyword, vector, and hybrid retrieval. | Uses QMD as an optional retrieval layer, then joins results to current authored metadata, explicit graph context, and bounded Git provenance. |
| Basic Memory | A Markdown knowledge graph that AI assistants can read and update through MCP. | A headless CLI/SDK workflow centered on repository scopes, code-mode composition, explicit Git evidence, and static publication. |
| Obsidian | An interactive editor for a local vault, with links, graph navigation, and optional publishing. | Agent-oriented operations over compatible Markdown; it can accompany your editor. Wordcell does not supply a desktop note editor. |
| Quartz | A customizable website or digital garden built from Markdown. | Publishes selected slices directly from the same agent knowledge workflow, with paths, metadata, tags, or graph neighborhoods as selectors. |

## Start with Markdown when it already solves the problem

Markdown is a plain-text document format. Its readability and ordinary files
are part of Wordcell's foundation, not a limitation to replace. The format
itself does not define a search service, repository-context router, or publishing
policy. [CommonMark's specification](https://spec.commonmark.org/0.31.2/)
describes the document syntax.

A small set of notes and `rg` may be enough. Wordcell becomes useful when you
repeatedly reconstruct backlinks, filter frontmatter, connect a decision to a
repository path, or prepare the same context for another agent session. It adds
those operations while keeping Markdown authoritative. There is no evidence
here that Wordcell beats a carefully scripted Markdown workflow on speed or
answer quality.

## Use QMD for retrieval, or use it inside Wordcell

[QMD](https://github.com/tobi/qmd) provides on-device BM25 keyword search,
vector search, query expansion, and reranking. Its CLI, SDK, and MCP interfaces
return structured results; it supports collection context, metadata filtering,
snippets, and bounded document retrieval. Those are substantial agent features.

Wordcell's optional semantic search uses a pinned QMD implementation. Its
additional workflow combines current Markdown metadata with authored
relationships, repository scopes, graph neighbors, and Git history. Search
evidence keeps exact matches and QMD matches inspectable; graph neighbors and
history remain context instead of silently changing relevance scores.
See [the design](design.md) and [agent workflow](agent-workflow.md).

If all you need is local retrieval, standalone QMD may be the shorter path.
Choose Wordcell when maintaining and reusing the knowledge around retrieval
matters too. We have not published a head-to-head retrieval-quality or latency
benchmark. The [payload demonstration](evidence.md) compares full-note and
snippet handoffs within Wordcell.

## Consider Basic Memory for an MCP-centered knowledge graph

[Basic Memory's knowledge format](https://docs.basicmemory.com/concepts/knowledge-format)
uses Markdown, observations, and relations to derive a connected knowledge
graph. Its [local MCP tools](https://docs.basicmemory.com/local/mcp-tools-local)
include note reading, writing, editing, search, and graph context. Its
[current tool reference](https://docs.basicmemory.com/reference/mcp-tools-reference)
also documents text, vector, and hybrid search plus structured filters and
bounded graph traversal. Local mode and a cloud service are available.

Both projects preserve editable Markdown and expose connected knowledge to
agents. Wordcell's emphasis is repository work: exact authored path scopes,
`AGENTS.md` context routing, Git provenance, deterministic graph maintenance,
and composable read-only SDK sessions. Basic Memory is worth considering when
you prefer its MCP tools and observation/relation format. Review both formats
before sharing the same authored vault between them; Markdown compatibility
does not imply identical metadata conventions.

## Keep Obsidian as an editor

[Obsidian](https://obsidian.md/) is a local note-taking application with linked
notes and a plugin ecosystem. Wordcell is headless. You can edit an
Obsidian-compatible Markdown vault in Obsidian while using Wordcell for agent
queries and repository context; Wordcell does not replace Obsidian's editor.

[Obsidian Publish](https://obsidian.md/help/publish/publish) lets you select
content for a hosted site. Its
[headless publishing commands](https://obsidian.md/help/publish/headless) also
support automation and require a Publish subscription. Wordcell instead emits
ordinary static files that you can host with a provider you choose. The hosting
provider may still charge you.

## Consider Quartz when the website is the main product

[Quartz](https://quartz.jzhao.xyz/) is a Markdown static-site generator with
search, backlinks, graph views, and customizable layouts. It supports
[private-page filtering](https://quartz.jzhao.xyz/features/private-pages),
including an explicit `publish: true` workflow. Selective publishing is not
unique to Wordcell.

Wordcell is useful when the published site is one output of an agent-maintained
knowledge base. Its [publish command](publish.md) selects note paths, tags,
metadata, repository scopes, or bounded link neighborhoods, previews the
selection, and emits a self-contained reader. Quartz may be a better fit if
custom website layouts and its publishing ecosystem are your main concern.
Wordcell's built-in reader deliberately has a smaller customization surface.

## What “local” means in Wordcell

Authored Markdown and Git remain yours. Exact queries, graph operations, and
static site generation run locally without a hosted model or account. Optional
QMD search runs local models after setup. Package installation and model
downloads require network access. Opt-in `--rerank typesafe` sends bounded
candidate context to the external Jev provider; capturing a URL contacts that
source, and publishing files to a host makes the selected content available
there. A cloud agent can receive whatever context you send it. Local storage
does not change the agent host's data handling. See
[security and data boundaries](../SECURITY.md).
