<!-- hraness:wordcell-landing:start -->
# Wordcell

[![Agent Skill](https://raw.githubusercontent.com/hraness/wordcell/main/assets/agent-skill.svg)](https://github.com/hraness/wordcell/tree/main/skills/wordcell)

Wordcell keeps decisions, plans, and sources as Markdown files beside your
code. Coding agents find them by exact words, by meaning with an optional
local model, or from the file they are about to change.

A new coding-agent session can read your code, but not the decisions that
stayed in the last session's chat. Wordcell keeps those decisions as Markdown
files beside the repository, with the plans that depend on them and the web
pages and PDFs that informed them. Tie a note to the paths it explains, and an
agent about to change that code runs one command to get the notes and plans
for that path. Exact search, backlinks, and Git history run on your machine
with no account or model, and every index rebuilds from files you can read in
any editor. Wordcell is free and open source.

Web capture, optional hosted reranking, and your agent's provider reach other
services; [Privacy and boundaries](#privacy-and-boundaries) says what each one
sends.

[Documentation](https://wordcell.io/docs) · [Comparisons](https://github.com/hraness/wordcell/blob/main/docs/comparisons.md) · [Measured evidence](https://github.com/hraness/wordcell/blob/main/docs/evidence.md) · [Changelog](https://github.com/hraness/wordcell/blob/main/CHANGELOG.md)

## Why Wordcell

- **Keep what you learn in files you own.** Write decisions, sources, and plans
  in Markdown. Obsidian, Git, and Wordcell read the same record, and every
  index rebuilds from the files.
- **Find it by words or by meaning.** Exact search needs no model or account.
  Optional local semantic search joins each match to current metadata, links,
  and history instead of returning isolated text.
- **Author the connections.** Wikilinks and typed relationships turn notes into
  a graph you can query. Backlinks and graph queries use only what you wrote,
  and `wordcell percolate` suggests missing links for you to review without
  writing them into your notes.
- **Give coding agents the reasons behind the code.** Tie notes to repository
  paths, list the commits behind a note, and let the next session start from
  the notes for the file it is changing. Only context you save becomes part of
  the record.

Plain Markdown may be enough for a small set of notes. QMD is a good fit for
local document retrieval and also supplies Wordcell's optional semantic search.
Wordcell adds a connected workflow for repository context, authored relationships,
Git evidence, and selective publishing. [Compare the tradeoffs](https://github.com/hraness/wordcell/blob/main/docs/comparisons.md).

Wordcell keeps the record in Markdown files you own, rebuilds every index from those files, and lets the next session start from the notes for the file it is changing: the design every Hraness project shares. [The thread through hraness](https://hraness.com/writing/the-thread-through-hraness) follows that design across the projects, and the [ALGAL vision](https://algal.computer/docs/vision/) states the bet behind it.

## Install

[Bun 1.3.14 or newer](https://bun.sh/docs/installation) and Git are required.
The CLI and TypeScript SDK run with Bun. Install the versioned GitHub archive:

```sh
bun add --global --ignore-scripts https://github.com/hraness/wordcell/releases/download/v0.22.5/hraness-wordcell-0.22.5.tgz
wordcell --help
```

Prefer npm? The same release is [mirrored there](https://www.npmjs.com/package/@hraness/wordcell):

```sh
npm install --global --ignore-scripts @hraness/wordcell@0.22.5
wordcell --help
```

Keep Bun in `PATH` for either installation. If your shell cannot find `wordcell`,
add your package manager's global executable directory to `PATH` and reopen the
terminal. Optional semantic search, browser capture, and PDF tools have
[additional prerequisites](https://github.com/hraness/wordcell/blob/main/docs/reference.md#review-lifecycle-scripts-before-enabling-optional-adapters).

## Keep one decision available to the next session

Run this from a directory where you want a new `kb/` folder. It creates one
Markdown note and finds it without downloading a model or contacting a service:

```sh
wordcell init kb
wordcell note create notes/parser-contract \
  --title "Parser contract" --type concept --tag architecture \
  --body "Parser retries stop after three attempts." --root kb
wordcell search "parser retries" --root kb --mode exact
```

The result includes `notes/parser-contract` and the saved retry constraint.
Open `kb/notes/parser-contract.md` to see the ordinary Markdown file. Wordcell
adds a stable `document_id` in its frontmatter; you can edit the prose normally.

Already have Markdown or an Obsidian vault? In **v0.22.0 or newer**, search
the existing folder without initialization or an `index.md` file:

```sh
wordcell search "a phrase from your notes" --root /path/to/your/vault --mode exact
```

Replace the path and phrase with your own. You don't need to initialize,
convert, or move the existing files to search them.

### Use with a coding agent

After trying the CLI, install the public Agent Skill into a compatible agent,
such as Claude Code, Codex, Cursor, or GitHub Copilot:

```sh
bunx skills add hraness/wordcell#v0.22.5 --skill wordcell
```

Then ask:

```text
Use Wordcell to search for "parser retries" in ./kb using exact mode.
Read the matching note and explain the saved constraint.
```

The skill installs instructions, not a service. Installation does not create a
vault, modify your notes, or grant an agent permission to access other accounts.
The agent still follows its own provider and data-handling settings.
[Inspect the skill](https://github.com/hraness/wordcell/blob/main/skills/wordcell/SKILL.md).

## Recover the stopped session

Link a plan to the decision you saved:

```sh
wordcell note create plans/parser-v2 \
  --title "Parser v2" --type plan \
  --body "The plan implements [[notes/parser-contract|the parser contract]]." \
  --root kb
wordcell backlinks notes/parser-contract --root kb
```

The backlink result includes `plans/parser-v2`, so a later session can find the
work that depends on the constraint.

For code-path lookup, add this field inside the existing frontmatter of
`kb/notes/parser-contract.md`:

```yaml
repository_scopes:
  - packages/parser
```

From your repository root, use an actual path under that scope and inspect the
returned notes and inherited `AGENTS.md` guides:

```sh
wordcell context packages/parser/src/index.ts --root kb --repo .
```

Commit the vault with your repository to preserve its history, then use
`wordcell history notes/parser-contract --root kb --repo .` to inspect the
commits behind the note. History is optional and requires recorded Git commits.

These views recover saved decisions, related work, rules, and provenance.
They do not reconstruct private chat or prove that the note is still correct.
Open the returned Markdown and guides before acting on them.

<!-- hraness:wordcell-landing:end -->

## Rerank a search window

```sh
wordcell search "why releases use immutable archives" --root kb --mode exact \
  --rerank typesafe --rerank-limit 25 --limit 5 --json
```

This optional hosted lane uses TypeSafe's pinned `jev-1.13.0` model. It sends
bounded query and note snippets to the provider, needs a private local
credential, and incurs provider charges. Exact identities remain first; a
provider failure retains the baseline order with a diagnostic. See the
[setup, SDK examples, measured results, and limits](https://github.com/hraness/wordcell/blob/main/docs/reranking.md).

## What you can do

| Task | Command | Evidence and effects |
| --- | --- | --- |
| Find a saved decision | `wordcell search "parser retries" --root kb --mode exact` | Reads current Markdown; no model or network request. |
| Recover context for code | `wordcell context packages/parser/src/index.ts --root kb --repo .` | Returns scoped notes, plans, and inherited `AGENTS.md` rules. |
| Inspect explicit connections | `wordcell backlinks notes/parser-contract --root kb` | Returns notes that link to the decision. |
| Search by meaning | `wordcell search "retry policy" --root kb --mode hybrid` | Adds optional local QMD keyword and vector retrieval; model setup is required. |
| Query with graph proofs | `wordcell graph query --program scope-route --scope packages/parser --root kb` | Returns bounded results tied to the source revision. Queries do not write a cache. |
| Capture a source | `wordcell clip https://example.com/article --output kb/articles` | Reads the selected URL and writes a Markdown bundle with a capture receipt. |
| Capture a PDF | `wordcell pdf /absolute/path/to/document.pdf --output kb/articles` | Preserves the original PDF and extracted evidence; Poppler is required. |
| Check the vault | `wordcell check --root kb` | Reports structural and attachment problems without editing files. |
| Publish selected notes | `wordcell publish --root kb --out site/ --include notes/parser-contract --dry-run --json` | Previews a static site selection locally; remove `--dry-run` to build it. |
| Preview a site | `wordcell serve --root site --port 8080` | Serves a published site on a loopback static file server with the emitted `404.html` fallback. |

Use `--json` for structured output and `wordcell --help` for the complete command
surface. [Full command reference](https://github.com/hraness/wordcell/blob/main/docs/reference.md#command-surface).

## Publish a selected part of your vault

Preview the decision and plan from the example before writing an output folder:

```sh
wordcell publish --root kb --out site \
  --include notes/parser-contract --include plans/parser-v2 --dry-run --json
```

Review the selection, then build and preview it:

```sh
wordcell publish --root kb --out site \
  --include notes/parser-contract --include plans/parser-v2
wordcell serve --root site --port 8080
```

Open `http://127.0.0.1:8080`. You get readable pages, linked notes, and search
that runs in the browser. Upload the `site/` folder to your chosen static host
when you want to share it; `publish` itself never uploads anything.

For a repeatable slice, use path patterns or combine folders, tags, metadata,
code scopes, and linked neighborhoods:

```sh
wordcell publish --root kb --out site-notes \
  --include-glob 'notes/**/*.md' --exclude-glob '**/draft-*' --dry-run --json
```

Preview reports show up to 20 selected IDs by default, with a total count and
selection digest. They keep note bodies out of the agent's context. Use
`--list-limit` to adjust that preview without changing what gets published. `publish: false` excludes a note, but selected
prose and attachments still need review before sharing: selection is not secret
redaction. [Selection recipes and hosting guide](https://github.com/hraness/wordcell/blob/main/docs/publish.md).

## Evidence and comparisons

In a four-query example over a seven-note public vault, packed search snippets
used **80% fewer UTF-8 bytes** than passing the same matching notes in full:
12,126 versus 60,584 bytes. This measures context payload size, not tokenizer
counts, answer quality, latency, or a win over another search tool.

In a separate public SciFact study, optional hosted Jev reranking placed a
judged relevant result first for **161 of 300 queries**, versus **101** with
Wordcell exact search alone. It sends bounded context to a paid provider;
this is evidence on scientific abstracts, not a comparison with QMD or a
guarantee for repository notes. [Results and limits](https://github.com/hraness/wordcell/blob/main/docs/reranking.md#evidence-and-limits).

Wordcell's benefit is selecting relevant context and keeping its sources
inspectable. Local ownership is also available in other tools, and Wordcell
does not claim to beat QMD's retrieval quality or every Markdown workflow.

[Measured evidence](https://github.com/hraness/wordcell/blob/main/docs/evidence.md)
shows a reproducible public-vault example, with the inputs, output sizes, and
limits beside each result. [The comparison guide](https://github.com/hraness/wordcell/blob/main/docs/comparisons.md)
covers Markdown alone, QMD, Basic Memory, Obsidian, and static publishing tools
using their own documentation. Choose the smallest workflow that meets your
needs.

## How the files fit together

```text
repository/
├── AGENTS.md                # rules that govern edits
├── packages/parser/
│   └── AGENTS.md            # rules scoped to this code
└── kb/
    ├── index.md             # authored or managed front door
    ├── articles/            # captured sources and assets
    ├── notes/               # maintained explanations
    └── plans/               # decisions and outcomes
```

Markdown, YAML frontmatter, explicit wikilinks, and Git hold the record. Open
the same files in Obsidian, a text editor, or ordinary file-search tools.
Application code does not need to import Wordcell or its vault.

Wordcell is the Markdown knowledge base. [Oh](https://oh.computer) is the
embedded memory framework that backs its named graph queries and source proofs.
Markdown and Git remain authoritative. Query the graph immediately without an
Oh account, service, or persisted database:

```sh
wordcell graph query --program backlinks --note notes/parser-contract --root kb --json
```

The result traces each returned link to its source note and revision. Only an explicit
`wordcell graph rebuild --root kb` writes `.wordcell/oh.sqlite`, the file stays
ignored and rebuildable, and nothing flows from the projection back into notes.
Backlinks and typed relationships come from authored links. Percolation
suggests connections for review and does not add inferred edges to notes.

Wordcell search combines its own exact matching with optional QMD local search
and optional hosted Jev reranking. Oh also offers memory retrieval for applications;
its conversation-memory benchmark scores measure that separate path. They do not
establish Wordcell's retrieval or answer quality. [How the integration works](https://github.com/hraness/wordcell/blob/main/docs/graph-authority.md#how-wordcell-and-oh-fit-together).

Graph proofs explain a supported derivation from a specific source revision.
They do not prove that a note is true or that a missing relationship cannot
exist. [Graph queries and proof limits](https://github.com/hraness/wordcell/blob/main/docs/graph-authority.md).

## Build with the TypeScript SDK

Add the same immutable release to a Bun project:

```sh
bun add --exact --ignore-scripts https://github.com/hraness/wordcell/releases/download/v0.22.5/hraness-wordcell-0.22.5.tgz
```

The SDK provides read-only vault sessions, metadata queries, search, graph
proofs, Git context, and composable workflows. A session owns one snapshot;
reopen it after Markdown changes. [SDK and workflow examples](https://github.com/hraness/wordcell/blob/main/docs/reference.md#graph-reference)
show the public imports and lifecycle.

## Privacy and boundaries

- Structural queries and exact search read local files. Optional semantic
  search downloads its model on first use and runs locally. Optional Jev
  reranking sends the query and bounded candidate context to a remote provider;
  it is off by default.
- URL capture contacts the requested source. Signed-in capture uses only
  explicitly selected browser state. Review the [security policy](https://github.com/hraness/wordcell/blob/main/SECURITY.md)
  before using it with private sources.
- An agent that reads the vault follows its own provider and data-handling
  settings. Keep private records out of public repositories and outputs.
- Git history is opt-in. Saved notes preserve recorded context; Wordcell does
  not reconstruct unsaved conversations or silently record every agent action.

## Documentation

The documentation follows the Diataxis split: a tutorial to learn the loop,
how-to guides for tasks, reference for exact interfaces, and explanation for
the design. Browse it on the [documentation index](https://wordcell.io/docs).

| Read next | Purpose |
| --- | --- |
| [Get started](https://github.com/hraness/wordcell/blob/main/docs/getting-started.md) | Learn the full loop on a first vault: save, find, connect, and publish one note. |
| [Agent workflow](https://github.com/hraness/wordcell/blob/main/docs/agent-workflow.md) | Set up, query, maintain, and revise repository memory. |
| [Installation and command reference](https://github.com/hraness/wordcell/blob/main/docs/reference.md) | Exact interfaces, SDK imports, optional adapters, and troubleshooting prerequisites. |
| [Web capture](https://github.com/hraness/wordcell/blob/main/docs/capture.md) and [PDF capture](https://github.com/hraness/wordcell/blob/main/docs/pdf.md) | Save sources with provenance, assets, and explicit completeness limits. |
| [Publish selected notes](https://github.com/hraness/wordcell/blob/main/docs/publish.md) | Preview a slice, build a static site, and choose how to host it. |
| [Graph guide](https://github.com/hraness/wordcell/blob/main/docs/graph-authority.md) | Named queries, proofs, revisions, resource limits, and cache recovery. |
| [Portfolio federation](https://github.com/hraness/wordcell/blob/main/docs/portfolio.md) | Search only selected, authorized vaults. |
| [Design](https://github.com/hraness/wordcell/blob/main/docs/design.md) and [memory rationale](https://github.com/hraness/wordcell/blob/main/docs/agent-memory.md) | File contracts, design choices, and evaluation context. |
| [Release verification](https://github.com/hraness/wordcell/blob/main/docs/publishing.md#verify-a-published-release) | Verify archive identity, signatures, and provenance. |

### Installation reference

[Alternative installs and optional capabilities](https://github.com/hraness/wordcell/blob/main/docs/reference.md#installation-reference).

### The kb vault format

Existing `kb/`, `index.md`, `kb://` identifiers, and Markdown formats remain
compatible. [Vault format reference](https://github.com/hraness/wordcell/blob/main/docs/reference.md#the-kb-vault-format).

### Command surface

[Complete CLI reference](https://github.com/hraness/wordcell/blob/main/docs/reference.md#command-surface).

### Capture reference

[Capture commands and dependencies](https://github.com/hraness/wordcell/blob/main/docs/reference.md#capture-reference).

### Graph reference

[Graph and SDK interfaces](https://github.com/hraness/wordcell/blob/main/docs/reference.md#graph-reference).

### Agent skills

[Installation and runtime contract](https://github.com/hraness/wordcell/blob/main/docs/reference.md#agent-skills).
The same skill is included at `node_modules/@hraness/wordcell/skills/wordcell/`.

## Release notes

Version 0.22 adds selective static publishing and local preview. Choose notes,
folders, path patterns, metadata, or linked neighborhoods, then inspect a
bounded selection report before building. Existing vaults need no migration.
The deprecated `kb` command was removed in 0.21.0; use `wordcell`.
[All release notes and upgrade instructions](https://github.com/hraness/wordcell/blob/main/CHANGELOG.md).

## Contributing

Run `bun run check` for source, architecture, package installation, types, and
native-helper validation. The site has its own `bun run check` under `site/`.
See [Contributing](https://github.com/hraness/wordcell/blob/main/CONTRIBUTING.md), [Security](https://github.com/hraness/wordcell/blob/main/SECURITY.md), and the [MIT License](https://github.com/hraness/wordcell/blob/main/LICENSE).

[Install Wordcell from GitHub Releases](https://github.com/hraness/wordcell/releases) ·
[Wordcell source on GitHub](https://github.com/hraness/wordcell) ·
[Wordcell overview](https://wordcell.io)

## Optional development support

`wordcell support` shows optional development support for Wordcell. Features stay
free and no account is required. Accounts presents current terms; the person
confirms any payment in their browser. Wordcell has no product newsletter and
does not look up an email address for support.

After useful standalone work, agents can receive a discovery record on stderr.
Read `wordcell support protocol --json` for the shared closeout procedure.
Help, diagnostics, evaluation, SDK calls and nested commands stay quiet.
`HRANESS_SUPPORT=off` or `HRANESS_SUPPORT_AUDIENCE=off` suppresses incidental
invitations. Explicit human terminal rendering requires
`HRANESS_SUPPORT_AUDIENCE=human`; the default audience is an agent, including in
a pseudo-terminal.

`wordcell support dismiss` disables invitations across participating tools on
this machine. `snooze` pauses them for thirty days, `enable` restores them, and
`status --json` shows their separate local preferences. These commands do not
change a vault, sign up or pay. Acknowledged invitations share a seven-day
cooldown; discovery itself does not consume it.
