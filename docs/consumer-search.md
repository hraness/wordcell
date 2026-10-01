# Set up repository KB search

Install Wordcell during repository setup, then search with its installed
executable. Choose the processing mode for each vault: local exact search works
without a model or provider credential; hosted reranking requires approval to
send that vault's query and candidate context to TypeSafe.

## Install the repository's pinned tool

If Wordcell is already a runtime or development dependency, use the repository's
frozen installation and its approved version. Do not add a second version for
search. Otherwise, choose an immutable release archive during setup:

```sh
wordcell_version=0.26.0
wordcell_archive="https://github.com/hraness/wordcell/releases/download/v${wordcell_version}/hraness-wordcell-${wordcell_version}.tgz"
```

Published releases include checksums and signed provenance; follow the
[release verification instructions](publishing.md#verify-a-published-release)
before adopting another version. When the repository permits a development
dependency, install the chosen archive:

```sh
bun add --dev --exact --ignore-scripts "$wordcell_archive"
```

Commit the manifest and regenerated lockfile together. Later checkouts run
`bun install --frozen-lockfile`.

Repositories that keep KB tooling out of their manifests can install the
standalone CLI during setup instead:

```sh
bun add --global --ignore-scripts "$wordcell_archive"
HRANESS_NO_UPDATE=1 wordcell --version
```

Confirm the reported version against the chosen pin. Set `HRANESS_NO_UPDATE=1`
on standalone search commands when the repository requires that exact version;
this prevents a supported global installation from checking for an update during
the query. Project and pinned installations keep their own version.

Search commands invoke `wordcell` directly. A first query after setup therefore
does not ask a package runner to download and install another dependency tree.

## Keep private searches local

For a private vault, unpublished notes, or a confidential query, use local exact
search with a selected source passage:

```sh
HRANESS_NO_UPDATE=1 wordcell search "why releases use immutable archives" \
  --root kb --mode exact --selected-passage --json
```

Exact mode uses no embedding download. The selected passage is chosen locally
and includes source-line references. Read the matched Markdown and its linked
sources before relying on the result.

For a repository-installed executable, these package scripts give the same local
path to ordinary and explicitly local searches:

```json
{
  "kb:search": "wordcell search --root kb --mode exact --selected-passage",
  "kb:search:local": "wordcell search --root kb --mode exact --selected-passage"
}
```

## Choose hosted search for an approved public vault

A repository may declare hosted reranking as its public-vault default, as
Wordcell's own `kb:search` does. Review that choice explicitly; a provider key
does not authorize sending another vault's content. Preserve a local command:

```json
{
  "kb:search": "wordcell search --root kb --mode exact --selected-passage --rerank typesafe --rerank-limit 25",
  "kb:search:local": "wordcell search --root kb --mode exact --selected-passage"
}
```

When the approved repository default is local, request hosted reranking for an
approved public query by adding `--rerank typesafe --rerank-limit 25` to its local
search command.

Hosted reranking sends the query and up to 25 candidates' identifiers, titles,
vault-relative paths, and at most 512 UTF-8 bytes of snippet text per candidate.
Each candidate requires one provider request and incurs provider charges.
Selected source passages are produced locally after ranking and do not expand
the snippets sent to TypeSafe.

Keep credentials outside repositories. The CLI reads `TYPESAFE_API_KEY`, the
absolute path in `TYPESAFE_API_KEY_FILE`, or Wordcell's private credential file.
Use the [credential setup](reranking.md#configure-a-local-credential) for file
permissions and validation.

## Check whether reranking completed

Inspect the `rerank` lane in `diagnostics.lanes`. `ready` means the complete
window was accepted. Missing credentials return `unavailable`; failed or
incomplete provider work returns `unavailable` or `degraded` and preserves useful
baseline results. A successful search exit alone does not establish that hosted
reranking ran.

The structured receipt records attempted and settled requests, elapsed time,
known input/output token usage, and `usageComplete`. When usage is incomplete,
the known totals are not a complete charge estimate. Ranking probabilities help
choose what to read; they do not establish that a note is true. See the
[reranking reference](reranking.md#inspect-the-result) for the result fields and
fallback behavior.
