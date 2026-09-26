# Wordcell installation and command reference

[Back to the quick start](../README.md#install)

## Installation reference

[Bun](https://bun.sh/docs/installation) is the required runtime. GitHub Releases are the canonical distribution, and each release publishes the same archive to npm as `@hraness/wordcell`. The examples use exact versioned releases. Historical `@hraness/kb` installs remain available under their original package name. For signed artifact verification, see [the release procedure](publishing.md#verify-a-published-release).

### Tell your coding agent to install it

Copy this prompt into Codex, Claude Code, or another coding agent:

```text
Install the `wordcell` Agent Skill from `hraness/wordcell#v0.22.5` with the standard skills
CLI. Use the skill's runtime instructions to install the exact
versioned GitHub release archive only when the command is missing. Verify it
with `wordcell doctor` and `wordcell --help`, but do not initialize or modify a vault until
I ask.
```

Install the single public skill with either runner:

```sh
npx skills add hraness/wordcell#v0.22.5
bunx skills add hraness/wordcell#v0.22.5
```

Both commands discover the same `wordcell` skill and install it into the selected
agent runner. Skill installation is inert: it does not initialize a vault,
refresh a catalog, or edit Markdown. When invoked, the skill uses an existing
`wordcell` command or, when the command is missing, checks for Bun and installs the
CLI from the immutable GitHub release archive.

The public skills CLI reads `skills/wordcell/` from the repository. The immutable
packed release includes the same tree under
`node_modules/@hraness/wordcell/skills/wordcell/`, and the package check verifies that the
installed skill is byte-identical to the repository source.

Install the two global commands with Bun:

```sh
bun add --global --ignore-scripts https://github.com/hraness/wordcell/releases/download/v0.22.5/hraness-wordcell-0.22.5.tgz
wordcell --help
wordcell-evaluation-builder --help
```

The same GitHub archive can be installed with npm:

```sh
npm install --global --ignore-scripts https://github.com/hraness/wordcell/releases/download/v0.22.5/hraness-wordcell-0.22.5.tgz
wordcell --help
```

Both commands are Bun executables. Bun `1.3.14` or newer must remain in `PATH`
even when npm performs the global installation. The conservative npm command
above disables dependency lifecycle scripts. Optional native search and
rendered-browser setup remain unavailable until the relevant scripts are
reviewed and enabled; run `wordcell doctor` to inspect the resulting capabilities.

For programmatic use, add the versioned GitHub archive to a Bun project:

```sh
bun add --exact --ignore-scripts https://github.com/hraness/wordcell/releases/download/v0.22.5/hraness-wordcell-0.22.5.tgz
```

The resulting dependency should remain exact:

```json
{
  "dependencies": {
    "@hraness/wordcell": "https://github.com/hraness/wordcell/releases/download/v0.22.5/hraness-wordcell-0.22.5.tgz"
  }
}
```

Wordcell uses three public GitHub dependencies: `@hraness/oh` at
immutable release archive `v0.12.0` for graph projection and closure verification and `@tobilu/qmd` at commit
`aa993dceb3ef8cfb71d470554ca437570f5a2b3c` for store-local model behavior, plus
`@hraness/support-foundation` at commit
`b32c1c81bb2444f50509ed54388758ecfab1f1c0` for standalone optional support.
Installation also needs Git and public GitHub access while it resolves those
dependencies. Browser-cookie capture uses the exact upstream registry release
`@steipete/sweet-cookie` `0.4.3`, which includes the host-scope, isolation, and
explicit Chromium Keychain fixes previously carried by the Hraness fork.

### Review lifecycle scripts before enabling optional adapters

[Bun blocks dependency lifecycle scripts](https://bun.sh/docs/pm/lifecycle)
unless the consumer trusts them. Run
`bun pm untrusted` in the consuming project and inspect the exact resolved
versions and scripts before allowing any of them. Do not use `bun pm trust
--all` for this package's dependency graph.

The pinned QMD Git dependency has a `prepare` script that installs development
hooks only when its own `.git` directory exists; the packaged runtime does not
need that script. Optional rendered capture uses `agent-browser`, whose
postinstall downloads a platform-specific executable. QMD's native semantic
and language-parser paths can report lifecycle scripts for `node-llama-cpp`,
`tree-sitter-go`, `tree-sitter-javascript`, `tree-sitter-python`, and
`tree-sitter-rust`. Trust only the packages required by the capability you have
chosen, then reinstall and run `wordcell doctor` to verify that capability. npm runs
dependency lifecycle scripts by default, so inspect the same packages before
omitting `--ignore-scripts` from an npm installation.

Wordcell can read explicitly selected signed-in browser state and perform
bounded capture and network operations. Read the [security
policy](../SECURITY.md) before using authenticated capture.

Contributors can install from a checkout instead:

```sh
git clone https://github.com/hraness/wordcell.git
cd wordcell
bun install --frozen-lockfile
bun link
wordcell --help
```

HTTP and Archive.today capture work with the installed JavaScript dependencies. Rendered capture additionally needs a local Chromium-compatible browser. [yt-dlp](https://github.com/yt-dlp/yt-dlp) adds YouTube metadata, thumbnails, and transcripts; full audio or video localization is opt-in and some formats also need [FFmpeg](https://ffmpeg.org). PDF ingestion uses the open-source Poppler tools `pdfinfo` and `pdftohtml`; [Tesseract](https://github.com/tesseract-ocr/tesseract) adds local OCR for scans and screenshots. URL metadata backfill requires Rust on macOS or Linux to build the immutable, fixed-network, memory-confined `metadata-search-engine-rs` helper included in the installed package. Run `wordcell url-metadata tool build` once, then use `wordcell url-metadata backfill` from any working directory.

Structural commands and exact search read the current Markdown directly and
need no service, model, or graph database. Wordcell pins
[QMD](https://github.com/tobi/qmd) 2.5.3 for local keyword and vector search.
`--mode keyword` uses its full-text index without an embedding model. Hybrid
and semantic search use a revision-pinned compact local EmbeddingGemma model;
the first index or vector query downloads about 300 MB. On macOS with Bun,
install extension-capable Homebrew SQLite with `brew install sqlite` before
using vector retrieval.

`wordcell doctor` statically checks the pinned QMD, SQLite, sqlite-vec,
node-llama-cpp, and matching native packages without importing native code or
downloading the model. Exact and keyword search remain model-free. Wordcell also
refuses an older adjacent `.snapshot` directory that lacks its ownership
marker; inspect and remove only the explicitly named disposable directory,
then retry so Wordcell never guesses that unrelated files are cache data.

## The kb vault format

Wordcell is the product; `kb` is the vault format. The conventional vault
directory is `kb/`, managed regions use the `<!-- kb:catalog:start -->` and
`<!-- kb:context … -->` markers, the front-door frontmatter key is
`kb_catalog`, portfolio identities use `kb://<owner>/<vault>/<document_id>`
URIs, and the shell conventions in the skill and docs are `KB_ROOT` and
`KB_REPO`. These names identify files that many repositories already commit,
so they did not change with the product name. Every `wordcell` command reads
and writes the same vaults that `kb` did.

## Start a vault

Existing Markdown folders can be searched without initialization or an
`index.md` file:

```sh
wordcell search "a phrase from your notes" --root /path/to/notes --mode exact
```

This reads the existing files without writing a catalog. `refresh` still
requires an explicit `index.md` front door; use `kb_catalog: authored` in its
frontmatter if you want to keep it entirely hand-written. `init` creates a new
directory and never merges into your existing notes.

```sh
wordcell init my-kb
cd my-kb
wordcell clip https://example.com/article --output articles
wordcell refresh --root .
wordcell check --root .
```

`wordcell init` creates an `index.md` front door plus `articles/`, `notes/`,
`plans/`, `riffs/`, and optional repository-context `scopes/` boundaries. The
generated Markdown remains ordinary Markdown: open it in Obsidian, edit it in a
text editor, search it with standard tools, and version it with Git.

When a vault lives at `kb/` inside a repository, inspect the instructions and
mapped context for a repository path from the repository root:

```sh
wordcell agents identity packages/parser --json
wordcell context packages/parser/src/index.ts --root kb --repo .
wordcell agents check --root kb --repo .
```

A note that declares `repository_scopes` asserts something checkable: the
repository still has that path. `wordcell check --root kb --repo .` compares every
authored declaration with the working tree and reports each current record whose
scope is now absent, so a note left behind by a rename or deletion becomes
visible instead of being read as current fact. The pass is advisory: it never
changes the exit code, terminal plans stay silent because an absent path is
valid authored history, and nothing is inferred from prose. Absent-scope
advisories point at a note to reread, not at a proven error.

```sh
wordcell check --root kb --repo . --json
```

`wordcell agents identity` derives a canonical mapping without writing files.
`wordcell context` lists inherited `AGENTS.md` files from the repository root toward
the target, verified context hubs from the nearest scope back toward the root,
and bounded repository-scoped memory. Maintained knowledge, active plans,
dated research, reports, and terminal plans stay in separate groups. Every
record states the exact authored scope that matched and whether it exists.
Open only the useful summaries, then use `wordcell links`, `wordcell backlinks`, `wordcell list`,
or `wordcell search` to expand the question deliberately.

## Command surface

| Command | Purpose |
| --- | --- |
| `wordcell init [directory]` | Create a new vault without merging into or overwriting an existing path; the default directory is `kb`. |
| `wordcell clip <url\|current>` | Capture a source and write an article bundle. `current` reads an attached active tab without navigating it; `wordcell capture <url>` is the explicit URL form. |
| `wordcell capture show\|verify\|diff <bundle>` | Inspect a stored capture as hostile content, verify its recorded document and optional asset hashes, or compare its exact Markdown bytes with a bounded Git ref. |
| `wordcell inspect <url>` | Run acquisition and extraction without writing a bundle. |
| `wordcell pdf <file-or-url> [--slug <slug>]` | Convert a local or public remote PDF into Markdown while retaining the original bytes, extracted images, OCR-derived text, URL provenance, and page provenance. |
| `wordcell refresh --root <directory>` | Rebuild a managed catalog atomically and report graph findings. An authored-catalog vault remains unchanged. |
| `wordcell check --root <directory>` | Verify catalog policy, graph integrity, and confined local image, PDF, and tldraw attachments without changing files. `--no-catalog` gates an edit lane without requiring the shared catalog refresh. `--repo <repository>` adds an advisory-only pass over authored `repository_scopes` against that working tree. |
| `wordcell catalog --root <directory>` | Render an exhaustive disposable catalog without modifying an authored or managed front door. |
| `wordcell graph query --program <name> --root <directory>` | Query a bounded, proof-bearing Oh projection; see [the graph guide](graph-authority.md). |
| `wordcell graph rebuild\|verify --root <directory>` | Rebuild or verify the disposable local graph cache without editing Markdown. |
| `wordcell graph --root <directory>` | Print the resolved contextual and typed graph, broken or ambiguous targets, orphans, and advisory mention candidates. |
| `wordcell backlinks <note> --root <directory>` | Show incoming contextual links and typed relationships for a note resolved by path, title, or alias. |
| `wordcell links <note> --root <directory>` | Traverse incoming, outgoing, or bidirectional contextual links and typed relationships with explicit depth and node limits. |
| `wordcell note create <id> --title <title> --root <directory>` | Atomically create one confined Markdown note; use `--type concept` for a reusable concept. |
| `wordcell note create <id> --title <title> --body-file - --root <directory>` | Read the note body from standard input, such as a transcript piped from another command. Standard input must not be a terminal or blank. Name a file called `-` as `./-`. Available from source until the next release. |
| `wordcell import supermemory <export.json>... --root <vault>` | Import documents and memory entries saved from the Supermemory API as Markdown notes; see [Import from Supermemory](#import-from-supermemory). Available from source until the next release. |
| `wordcell relation add\|remove <source> <predicate> <target>` | Idempotently edit one source note's typed outbound relationship using an exact local note ID or canonical stable `kb://` URI. |
| `wordcell relation list <note> --root <directory>` | List a note's authored outbound and derived inbound typed relationships. |
| `wordcell percolate [note] --root <directory>` | Report evidence-backed recurring-concept and missing-relationship candidates without writing notes. |
| `wordcell list --root <directory>` | Filter typed nested frontmatter, tags, and repeated exact `--scope` declarations; sort by metadata, title, path, or graph counts. `wordcell notes` is an alias. |
| `wordcell index --root <directory>` | Build or incrementally refresh the optional local QMD embedding index. |
| `wordcell search <query> --root <directory>` | Combine live exact matches with local QMD keyword and vector retrieval. Use `--mode exact\|keyword\|semantic\|hybrid`, metadata, tags, exact `--scope` filters, or bounded graph context. `--rules <file>` enables reviewed aliases; add `--priority` for explicit rule-based ordering. Omitted history performs no Git work; `--history` requests best-effort provenance and `--require-history` rejects unavailable or incomplete selected-note provenance. |
| `wordcell portfolio search <query> --registry <file> --workspace <directory>` | Search only explicitly authorized vaults. Use `--shared` for public and organization entries or repeat `--vault owner/id` for a deliberate selection. The same `--rules <file>` and opt-in `--priority` apply within each selected vault before deterministic federation. |
| `wordcell portfolio audit --registry <file> --workspace <directory>` | Audit selected vault identities, authority groups, graph references, attachments, exact duplicate content, catalogs, and Git availability without repairing or electing an authority. |
| `wordcell history <note> --root <vault> --repo <repository>` | Return bounded direct provenance for one resolved note, including explicit oversized-commit limitations. |
| `wordcell history search <query-or-path> --root <vault> --repo <repository>` | Search bounded commit subjects, note paths, and co-change paths without authoring links or repository scopes. |
| `wordcell context <repository-path> --root <vault> --repo <repository>` | List inherited guides root to nearest, reciprocal hubs nearest to root, and grouped repository-scoped current and historical memory. Use `--kind auto\|file\|directory` to control path interpretation. |
| `wordcell mcp --root <vault> [--repo <repository>] [--read-only]` | Serve one vault to a local MCP client over standard input and output with search, note, link, and authoring tools; see [Local MCP server](#local-mcp-server). Available from source until the next release. |
| `wordcell inbox --root <vault>` | List recent captures without a maintained-note disposition. This is advisory and never creates links or fails merely because a source is a leaf. |
| `wordcell evaluate <manifest.json> --root <vault> --repo <repository>` | Verify an exact frozen Git/vault snapshot and run built-in exact, QMD, metadata, graph, path-context, and Git retrievers with raw evidence, latency, resource counters, metrics, and paired intervals. |
| `wordcell publish --root <directory> --out <directory>` | Project a vault or a selected subsection into a self-contained `hraness.wordcell.site.v1` static site with prerendered read-only pages, browser-local search, and content-addressed assets. See [Publish a static site](publish.md). |
| `wordcell serve --root <directory> [--host <host>] [--port <port>]` | Preview a published site over a loopback-default static file server that maps directories to `index.html`, returns the published `404.html`, and confines requests and symlinks to the root. |
| `wordcell-evaluation-builder --anchor-seal\|--build --config <file> --artifact-root <directory>` | Anchor or build a frozen evaluation corpus through the installed package boundary. |
| `wordcell url-metadata tool build\|check` | Build or validate the pinned Rust metadata-search helper through the installed package boundary. |
| `wordcell url-metadata backfill --root <vault>` | Add resumable `url-metadata.json` sidecars for saved external URLs through the pinned metadata search helper and optional read-only Archive.today discovery. |
| `wordcell agents identity <repository-scope>` | Derive the normalized scope, canonical hub ID and path, owning guide path, and exact reciprocal marker without writing files. |
| `wordcell agents check --root <vault> --repo <repository>` | Validate context identities, exact scopes, reciprocal markers, real guide paths, collisions, confinement, and guide shape. Unmapped guides remain valid. |
| `wordcell agents audit --root <vault> --repo <repository>` | Run the same correctness gate, then report deterministic per-guide, section, inherited-chain, long-bullet, and exact-duplicate advisories. |
| `wordcell doctor` | Report capture capabilities and statically inspect local QMD, SQLite, sqlite-vec, node-llama-cpp, and native search prerequisites without loading a model. |
| `wordcell adapters` | Print the installed platform capability matrix. |

Vault commands default to the current directory and `index.md`; use `--root` and `--index` to select alternatives. Commands that report structured data accept `--json`. Run `wordcell --help` for the complete top-level surface and `wordcell clip --help` for capture, authentication, evidence, and resource-bound options.

`wordcell check` and `wordcell refresh` find unlinked mentions through a phrase index. They retain every admitted note, link, relationship and mention; a resource limit fails the command without returning a partial analysis. This lets larger vaults complete without checking every possible pair of notes.

For programmatic use, `analyzeVaultComplete`, `scanVaultComplete` and `refreshVaultComplete` provide the same complete analysis. The existing `analyzeVault`, `scanVault` and `refreshVault` keep their pair-search behavior and limits. Complete analysis preserves title and alias ownership, phrase precedence, word boundaries, line numbers and result ordering.

Both paths retain the limits of 10,000 notes, 250,000 connection observations and 50,000 returned mentions. In complete analysis, `maxMentionPairs` limits matching source/target candidates. Its phrase index also has aggregate ceilings of 262,144 nodes, 67,108,864 work steps, 1,000,000 pattern occurrences and 268,435,456 UTF-16 input units. Occurrences include repeats and matches rejected by word boundaries. Input is bounded before and after case normalization. Callers can lower those four ceilings with `mentionIndexLimits.maxNodes`, `maxWork`, `maxMatches` and `maxInputCodeUnits`. Exhaustion raises `VaultAnalysisBudgetError` with the resource kind and limit.

## Capture reference

Use the current browser tab without navigating it:

```sh
wordcell clip current --browser-live --output articles
wordcell clip current --cdp 9222 --output articles
```

For `--browser-live`, first enable Chrome's local debugging connection at `chrome://inspect/#remote-debugging` (Chrome 144+). If Chrome was launched with an explicit loopback debugging port, pass that numeric port to `--cdp` instead.

To open a URL with state from a path-backed Chromium profile, pass its path. The capture runs against a temporary copy, leaving the source profile unchanged. A named profile selects reusable agent-browser-managed state instead:

```sh
wordcell clip https://example.com/private --browser-profile <path> --output articles
```

Each web capture writes readable Markdown, `capture.json`, localized assets, and optional evidence under `articles/<slug>/`. Unless media is disabled, YouTube captures add the title, description, duration, channel, thumbnail, and a locally extracted transcript when available; other video surfaces retain a poster or thumbnail instead of downloading the video by default. See [Capture web content](capture.md) for scopes, saved files, browser modes, media, evidence, completeness states, and limits.

Schema v4 manifests bind the exact saved Markdown path, byte count, and SHA-256
digest. `wordcell capture verify articles/<slug>` checks that digest without executing
the content. Add `--verify-assets` to check recorded assets. Source HTML remains
omitted unless `wordcell capture show` receives `--include-source-html`.

PDF capture uses the same bundle boundary:

```sh
wordcell pdf "/absolute/path/to/document.pdf" --output articles
wordcell pdf "https://example.com/document.pdf" --output articles
```

The bundle includes byte-identical `source.pdf`, readable Markdown, `capture.json`, and content-addressed extracted images. A reviewed second pass also retains its hash-bound `annotations.json`. See [Capture PDF documents](pdf.md) for heading inference, OCR, screenshot metadata, completeness, and review.

## Graph reference

Vault-root wikilinks such as
`[[notes/context-engineering|context engineering]]` and source-owned typed
frontmatter relationships are the graph's authored facts:

```yaml
type: concept
document_id: durable-agent-memory
relations:
  supports:
    - notes/durable-agent-memory
```

Predicates use lower-kebab-case. Local targets use exact vault-root IDs without
`.md`; cross-vault targets use canonical stable `kb://` URIs. `wordcell graph`, `wordcell backlinks`, `wordcell relation list`, and `wordcell links` derive
inverse edges and bounded paths without injecting reciprocal or inferred facts into notes.
`wordcell percolate` proposes reusable concepts and missing connections with explicit
support; an agent reviews the cited prose before authoring anything. In its V2
result, a missing relationship is an unordered endpoint pair with a required
predicate, never an executable directed assertion or an automatic
`related-to`. Common reviewed claims use `synthesizes`, `evidenced-by`,
`informed-by`, `supersedes`, or `contradicts`; other canonical custom predicates
remain valid when their meaning is supported.

Within a portfolio, a note can target a stable cross-vault identity such as
`kb://hraness/sleepyland/sound-wellness-expansion`. The target vault must be
explicitly selected for `wordcell portfolio audit` to resolve it. Missing or invalid
`document_id` values remain legacy path identities and never gain a stable URI
by inference.

These focused views are rebuilt from current Markdown. Wordcell never commits a graph
database, generated fact file, or engine entity ID. Parallel agents therefore
keep editing separate notes. Each lane can run `wordcell check --no-catalog`, and the
integrator runs one final `wordcell refresh` for the only shared generated region in
`index.md`. Use `wordcell graph --json` for a whole-vault structural question; when a
question recurs, prefer adding a focused command with a bounded output contract
over introducing a parallel query store.

Frontmatter retains nested objects, arrays, finite numbers with safe integer precision, booleans, strings, and nulls. `wordcell list --where type=plan --tag ingestion --sort metadata.updated --order desc` answers exact questions from that authored data. Unquoted `true`, `false`, `null`, and numeric filter values are typed; keep the quotes inside the argument to match a string with the same spelling, for example `wordcell list --where 'external_id="9007199254740993"'`. Hybrid search fuses exact and QMD result orders, then joins each match back to live metadata. Graph neighbors and Git provenance are returned as separate evidence. Similarity never becomes a link automatically.

Repository context preserves a stricter authority boundary. `AGENTS.md` remains
the always-loaded, normative home for ownership, required commands,
prohibitions, and edit gates. An optional `type: agent-context` note under
`scopes/` holds rationale, history, examples, evidence, and links for one exact
repository-relative directory. Its reciprocal
`<!-- kb:context scopes/<id> -->` marker appears before the guide headings.
A hub cannot override its guide or become the only home of a load-bearing
editing rule. Moving the scoped directory changes its identity.

Scope hubs are ordinary Markdown in the graph and optional QMD index;
`AGENTS.md` files remain excluded. This workflow reads repository and vault
files at development time. Applications do not need to import Wordcell or couple
their runtime to the vault.

The package exports its full programmatic surface from `@hraness/wordcell`. Open one
read-only vault session through `@hraness/wordcell/sdk` to share a live Markdown scan
across exact search, metadata queries, reads, navigation, hybrid search, and Git
provenance. Compose finite parallel retrieval graphs with
`@hraness/wordcell/workflow`. `@hraness/wordcell/workflows` includes editable
`decision-context`, `explain-change`, and `plan-radar` compositions. Focused
lower-level entry points include
`@hraness/wordcell/search`, `@hraness/wordcell/git`,
`@hraness/wordcell/agent-context`,
`@hraness/wordcell/agent-guide-audit`, `@hraness/wordcell/attachments`,
`@hraness/wordcell/authoring`, `@hraness/wordcell/evaluation`,
`@hraness/wordcell/evaluation-kb`, and `@hraness/wordcell/evaluation-builder`. The builder
entry point owns frozen-corpus authoring, evidence compilation, implementation
commitments, seal validation, and the bounded v2 evaluation mechanics. A
consumer keeps its corpus, build configuration, repository-specific retriever
descriptors, and promotion expectations in its own repository. The installed
`wordcell-evaluation-builder` binary exposes the same build lifecycle without a
source checkout.
Other focused entries include
`@hraness/wordcell/graph-authority`, `@hraness/wordcell/graph-percolation`, `@hraness/wordcell/graph`, `@hraness/wordcell/navigation`, `@hraness/wordcell/percolate`,
`@hraness/wordcell/portfolio`, `@hraness/wordcell/query`, `@hraness/wordcell/repository-memory`,
`@hraness/wordcell/search-rules`, `@hraness/wordcell/untrusted-content`,
`@hraness/wordcell/source-inbox`, and `@hraness/wordcell/semantic`; web-capture orchestration and
diagnostics from
`@hraness/wordcell/capture`; metadata search, Archive.today discovery, sidecar parsing,
and backfill composition from `@hraness/wordcell/url-intelligence`; PDF ingestion from `@hraness/wordcell/pdf`; and reusable
disposable-profile helpers from `@hraness/wordcell/browser-profiles`. Embedders that
need the CLI's lower-level ingestion machinery can use the explicit
capture-primitive subpaths listed in `package.json`, including
`@hraness/wordcell/clip/acquire`, `@hraness/wordcell/clip/args`, the DNS-pinned request and
connection-pool boundary at `@hraness/wordcell/clip/network`, and the browser proxy at
`@hraness/wordcell/clip/network-proxy`. Stored-bundle inspection, capture refresh
diffs, and the explicit local job ledger are available from
`@hraness/wordcell/clip/bundle-reader`, `@hraness/wordcell/clip/refresh`, and
`@hraness/wordcell/clip/jobs`.

### Update a note body conditionally

`updateNoteBody` replaces the prose in one existing note. Read its revision
before preparing the replacement:

```ts
import { noteRevision, updateNoteBody } from "@hraness/wordcell/authoring";

const root = "kb";
const id = "reports/weekly";
const expectedRevision = await noteRevision(root, id);
const body = "# Weekly report\n\nThe current findings cite [[sources/study]].\n";
const result = await updateNoteBody(root, id, body, { expectedRevision });
console.log(result.changed, result.revision, result.documentId);
```

`UpdateNoteBodyOptions` requires `expectedRevision`; it also accepts the same
local lock options as other authoring operations. The update preserves the
exact frontmatter bytes, including comments, custom fields, relations, and
`document_id`. It adds a final newline when missing and uses one blank line
between frontmatter and the new body, with the existing delimiter newline
style. A note without frontmatter remains without it and gains no identity.
The operation refuses to introduce frontmatter through such a note's body.
Input must be well-formed Unicode, and the complete rendered note must fit the
16 MiB authoring bound.

An identical result at the expected revision returns `changed: false` without
replacing the file. A stale revision throws `NoteRevisionConflictError`, even
if the requested body happens to match the latest body. The operation uses the
existing same-note lease, replacement checks, and recovery paths; it does not
create a missing note or update another file.

When a replacement depends on the current prose, pair it with that prose's
exact revision. An open knowledge-base session retains an older snapshot:
read the revision before opening a fresh session, or derive the revision from
the exact complete UTF-8 content you read. Reject a truncated read. Close and
reopen the session after a successful update. After an interrupted operation,
read back the document and reconcile its content and revision before retrying;
do not assume that an error means the replacement did not become visible.
If a conflict or `NoteRecoveryRequiredError` reports `recoveryPath`, retain
those displaced bytes until recovery is resolved.

## Import from Supermemory

`wordcell import supermemory` is available from source until the next release.

`wordcell import supermemory` turns JSON responses saved from the Supermemory
API into Markdown notes in a vault. It reads only the files you name and never
calls the Supermemory API. Run `wordcell refresh` and then `wordcell check`
afterward, as you would after `wordcell note create`.

```sh
wordcell import supermemory <export.json>... [--root <vault>] [--prefix <directory>] [--dry-run] [--json]
```

- `--root <vault>` defaults to the current directory.
- `--prefix <directory>` writes every note directly under that vault
  directory instead of the locations below.
- `--dry-run` reports the same outcomes and writes nothing.
- `--json` prints one report object with counts and, for each item, its
  outcome, file, JSON Pointer, Supermemory ID, and note.

### Save an export

The importer reads responses from two endpoints, as the Supermemory API
reference documented them when checked on 2026-09-26:

- [List documents](https://supermemory.ai/docs/api-reference/documents/list-documents):
  `POST https://api.supermemory.ai/v3/documents/list` returns
  `{"memories": [...], "pagination": {...}}`. Send `"includeContent": true`.
  Without it a document carries only its `summary`, and the importer uses the
  summary as the note body.
- [List memory entries](https://supermemory.ai/docs/api-reference/content-management/list-memory-entries-with-history):
  `POST https://api.supermemory.ai/v4/memories/list` requires `containerTags`
  and returns `{"memoryEntries": [...], "pagination": {...}}`. Each entry
  carries its earlier versions in `history`.

A file can also hold `{"documents": [...]}`, an array of such pages, or an
array of document or memory-entry objects. This request saves the first page of
documents:

```sh
curl -fsS https://api.supermemory.ai/v3/documents/list \
  -H "Authorization: Bearer $SUPERMEMORY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"includeContent": true, "limit": 100, "page": 1}' \
  -o documents-1.json
wordcell import supermemory documents-1.json --root kb --dry-run
```

When `pagination.totalPages` is greater than 1, save each page to its own file
and name every file in one import. For memory entries, post to
`https://api.supermemory.ai/v4/memories/list` with `"containerTags": ["<tag>"]`
in place of `"includeContent": true`, and save the pages under another name,
such as `memories-1.json`.

Wordcell's tests use files built from these documented schemas and the
reference's example document, not recorded API responses.

### Where notes go

| Item | Note | `type` |
| --- | --- | --- |
| A document with a public `http` or `https` URL, or with a Supermemory type other than `text` | `articles/<slug>/<slug>.md` | `article` |
| Any other document | `notes/imported/<slug>.md` | `note` |
| Each memory entry version | `notes/imported/memories/<slug>.md` | `memory` |

With `--prefix <directory>`, every note goes to `<directory>/<slug>.md` and
keeps its type. The directory must be outside `articles/`, because each
directory there holds one captured source. The slug comes from `customId`,
then the title, then the ID, with the rules `wordcell clip` uses. When a slug
is taken, the importer adds `-2`, `-3`, and so on. The note title is the
document title, or the first line of a memory, up to 200 characters. The body
is the imported text (`content`, else `summary`, or the memory text) followed
by one line that names the export file and the import date.

### Frontmatter

Every imported note records `imported_from: supermemory`, `external_id` (the
Supermemory ID), `created` and `updated` (the Supermemory timestamps, converted
to UTC), and `import_digest`. The importer adds these fields when the item has
a value:

| Field | Written for | Value |
| --- | --- | --- |
| `custom_id` | Documents | `customId` |
| `supermemory_type` | Documents | `type`, such as `text` or `google_doc` |
| `status` | Documents | `status`, only when it is not `done` |
| `container_tag`, `container_tags` | Documents | The first container tag, and the full list when there are several |
| `source` | Documents | A public `http` or `https` URL that `wordcell url-metadata` accepts, the field `wordcell clip` writes |
| `url` | Documents | Any other URL, such as one on a private network. A URL that carries credentials, such as a signed download link, is dropped with a diagnostic |
| `connection_id`, `filepath` | Documents | `connectionId` and `filepath` |
| `clipped` | Notes under `articles/` | The UTC date of `createdAt` |
| `version`, `parent_id`, `root_id` | Memory entries | The version number and the IDs of the previous and first versions |
| `is_static`, `is_inference` | Memory entries | `true` when Supermemory set it |
| `forget_after` | Memory entries | `forgetAfter` |
| `source_document_ids` | Memory entries | `documentIds` |
| `metadata` | Both | String, number, and boolean values from `metadata`, at most 64 keys; nested values and integers too large to store exactly are dropped with a diagnostic |

Each memory version gets a `supersedes` relation to the version before it when
that version is in the vault or in the same import. The importer adds it only
when it creates or updates the newer version, or creates the older one, so a
relation you remove stays removed. It omits a relation that would make versions
supersede each other in a loop, with a diagnostic, and reports a relation as
`omitted` when either note ended as a conflict or was rejected. Forgotten
entries are skipped. The importer does not convert `memoryRelations`, because
Supermemory [creates those links itself](https://supermemory.ai/docs/concepts/graph-memory)
(checked on 2026-09-26) and a Wordcell vault does not store inferred
relationships. It also drops `spaceId`, `orgId`, `sourceCount`, and
`forgetReason`.

### Import again

A later import finds notes by `imported_from` and `external_id`, wherever you
have moved them, and reports each item as one of these outcomes:

- `created`: the importer wrote a new note.
- `updated`: the item changed in Supermemory and the note has no local edits.
  The importer replaces the body and its own fields in one write, which fails
  as a conflict if the note changes during the import.
- `skipped`: the item is unchanged, is a forgotten memory, or shares its ID
  with a newer copy in the same export. The copy with the latest `updatedAt`
  is imported, and ties keep the first.
- `conflict`: the note was edited since the last import, has no
  `import_digest`, or shares its `external_id` with another note. The importer
  leaves the note unchanged.
- `rejected`: the item failed validation or cannot be written, for example
  because its note would exceed 16 MiB. The reason names the field or the
  problem.

`import_digest` covers the title, the fields the importer writes, and the
imported text, so an edit to any of them is a local edit. Tags and fields you
add yourself are not covered.

The command exits with status 0 when every file parses and not every item is
rejected. An export with no items also exits with status 0, and conflicts do
not change the status. It exits with status 1, and writes nothing, when a file
cannot be read or parsed or when the vault would pass its size limits. It also
exits with status 1 when every item is rejected, and with status 2 for invalid
arguments. One run reads at most 1,000 files of up to 128 MiB each and 10,000
items, counting each memory version. After the import the vault must hold at
most 10,000 notes and 256 MiB of Markdown. JSON may nest 32 levels deep. An
item whose note would exceed 16 MiB is rejected, not truncated.

## Local MCP server

`wordcell mcp` is available from source until the next release.

`wordcell mcp` serves one vault to a Model Context Protocol (MCP) client, such
as Claude Code, Claude Desktop, Cursor, or Codex. The client starts the
command, writes JSON-RPC requests to its standard input, and reads one JSON-RPC
message per line from its standard output. Keyword, semantic, and hybrid
search use the same optional local QMD index as `wordcell search`.

```sh
wordcell mcp --root /absolute/path/to/kb [--repo /absolute/path/to/repository] [--read-only]
```

- `--root <vault>` is required. The server checks that it is a real directory
  before it reads a request. A missing or invalid root prints one `error:`
  line to standard error and exits with status 2.
- `--repo <repository>` adds the `context` tool for that working tree.
- `--read-only` removes the three write tools.

Standard output carries only protocol messages. Diagnostics, including QMD
model-loading progress, go to standard error, and the command prints no
support message. The server exits with status 0 when the client closes
standard input and with status 1 when it cannot read or write the stream.

The server answers `initialize` before it scans the vault. The first tool call
scans the vault, and later calls reuse that scan until a Markdown file under
the root is added, removed, or changed, or a write tool runs. Edits from an
editor or Git are visible on the next call.

### Protocol versions

The server supports MCP revisions `2025-11-25` and `2025-06-18`. It answers
`initialize` with the revision the client requests when it supports that
revision, and with `2025-11-25` otherwise. The response names the server
`hraness-wordcell`, gives the package version, and includes short
instructions for the client's model. Each message must fit on one line of at
most 1 MiB. The server does not accept JSON-RPC batches, and its tool list
does not change during a session.

MCP revision `2026-07-28` drops the `initialize` handshake: each request
carries its protocol version
([versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning),
checked 2026-09-26). A stdio client that also supports older revisions probes
with `server/discover` first. This server answers `server/discover` with
JSON-RPC error -32601, so such a client falls back to `initialize`. A client
that supports only `2026-07-28` cannot use this server.

### Tools

Note IDs are vault-relative paths without `.md`, such as `notes/decision`.

| Tool | Arguments | Result |
| --- | --- | --- |
| `search` | `query`; optional `mode` (`exact`, `keyword`, `semantic`, or `hybrid`, default `hybrid`), `limit` (1-100, default 10), `tags`, `where` (exact metadata values), `has` (metadata paths that must exist), and `scope` (exact repository scopes) | Ranked hits, each with its own exact or QMD evidence. When QMD is unavailable, the result is partial and `diagnostics.lanes` gives the reason. |
| `context` (with `--repo`) | `path` (repository-relative); optional `kind` (`auto`, `file`, or `directory`, default `auto`) | Inherited guides, reciprocal hubs, and repository-scoped memory, as in `wordcell context --json`. |
| `list_notes` | Optional `where`, `has`, `tags`, `scope`, `sort` (`title`, `path`, `inbound`, `outbound`, or `metadata.<path>`), `order` (`asc` or `desc`), and `limit` (1-1,000, default 100) | Matching notes with metadata and link counts, and the total number of matches. |
| `get_note` | `id` | The note's `frontmatter` as JSON, its `body`, and its `revision`. The read stops at 64 KiB. |
| `backlinks` | `id`; optional `depth` (1-10, default 1) and `limit` (1-1,000, default 50) | Incoming contextual links and typed relationships. |
| `links` | `id`; optional `direction` (`in`, `out`, or `both`, default `both`), `depth`, and `limit` | Linked notes, edges, and typed relationships in that direction. |
| `create_note` | `id` and `title`; optional `type` (default `note`), `tags`, and `body` | The new note's `path` and `revision`. |
| `update_note_body` | `id`, `body`, and `expected_revision` | The note's new `revision`. |
| `add_relation` | `source`, `predicate`, and `target`; optional `expected_revision` | The source note's new `revision`. |

Each result is JSON, sent as structured content and repeated as one text
block. The structured value is capped at 64 KiB, and the text block carries the
same JSON, so a response line can be more than twice that size. When the cap
applies, the server leaves out the items of the result's main list that do not
fit, keeps the rest in order, and sets `truncated: true` and an `omitted`
count. `get_note` shortens the body instead and sets `truncated: true`.
Invalid arguments, a missing note, and a refused write return a tool error
with a message the client's model can act on. The session continues after a
tool error.

### Write safety

The write tools use the same authoring operations as `wordcell note create`,
`updateNoteBody`, and `wordcell relation add`.

- `create_note` never replaces a note. If the ID exists, it returns a tool
  error and leaves the file unchanged. It does not create directories.
- `update_note_body` requires the `revision` from `get_note`. If the note
  changed after that read, the call fails, reports the current revision, and
  leaves the file unchanged. The update keeps the note's frontmatter bytes.
  When `get_note` reports `truncated: true`, do not send that body back.
- `add_relation` is idempotent. With `expected_revision`, a stale revision
  fails.
- An ID that resolves outside the vault root is refused.

### Connect a client

Client setup was checked against each client's documentation on 2026-09-26.
Replace `/absolute/path/to/kb` with your vault. If a desktop application
cannot find `wordcell`, use the absolute path that `which wordcell` prints.
Add `--read-only` to the arguments to offer only the read tools, or
`--repo /absolute/path/to/repository` to add `context`.

Claude Code ([MCP guide](https://code.claude.com/docs/en/mcp)):

```sh
claude mcp add --transport stdio --scope project wordcell -- wordcell mcp --root /absolute/path/to/kb
```

Everything after `--` is the server command. `--scope project` saves the
server in the project's `.mcp.json`, which everyone who uses the repository
shares. Omit `--scope` to keep the server private to you in this project, or
use `--scope user` for all your projects.

Claude Desktop ([local server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers)):
open the Claude menu, choose Settings, then Developer, then Edit Config. Add the server to
`claude_desktop_config.json`, then quit and restart Claude Desktop. The file is
in `~/Library/Application Support/Claude/` on macOS and `%APPDATA%\Claude\` on
Windows. On macOS, the server's standard error is in
`~/Library/Logs/Claude/mcp-server-wordcell.log`.

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

Cursor ([MCP guide](https://cursor.com/docs/context/mcp)): add the server to
`.cursor/mcp.json` in a project, or to `~/.cursor/mcp.json` for every project.

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

Codex ([MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)):

```sh
codex mcp add wordcell -- wordcell mcp --root /absolute/path/to/kb
```

You can also add the entry to `~/.codex/config.toml`, or to
`.codex/config.toml` in a trusted project:

```toml
[mcp_servers.wordcell]
command = "wordcell"
args = ["mcp", "--root", "/absolute/path/to/kb"]
```

## Agent skills

The repository ships one reusable `wordcell` Agent Skill under `skills/wordcell/`. Its
intent router loads focused references only when a task needs them: querying
repository context and agent memory, capturing URLs or PDFs, writing durable
plans, promoting concepts and typed relationships, refreshing and checking a
vault, or designing a setup through an interview and approved proposal. An
approved setup may scaffold a bounded companion skill for a distinct recurring
ritual. The package smoke test keeps future tagged packages byte-identical to
that source tree.

```sh
npx skills add hraness/wordcell#v0.22.5
# or
bunx skills add hraness/wordcell#v0.22.5
```

The skill invokes the installed `wordcell` command without depending on a repository
checkout. It routes setup and evolution before runtime preparation. For
execution workflows, runtime setup installs the pinned CLI only when the
command is missing, and it never initializes or mutates a vault as an
installation side effect. The repository's phase-orchestration skill remains
available to local repository agents but is marked internal, so public skill
discovery omits it.

See [Design](design.md), [Portfolio federation](portfolio.md), [Agent workflow](agent-workflow.md), [PDF capture](pdf.md), and [Contributing](../CONTRIBUTING.md) for the durable contracts and development gate. hraness/wordcell is available under the [MIT License](../LICENSE).
