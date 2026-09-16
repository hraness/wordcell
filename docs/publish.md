# Publish a static site

`wordcell publish` projects a vault — or a selected subsection of one — into a
self-contained static site under the `hraness.wordcell.site.v1` contract. The
output is plain files that work from object storage, a CDN, or `file://`:
prerendered HTML pages read without JavaScript, and a bundled zero-dependency
reader adds browser-local search and navigation on top. No server, database, or
runtime is required to host the result.

## Publish a vault

```sh
wordcell publish --root kb --out site/
```

The command scans the vault, resolves the selection, validates local
attachments against the filesystem, renders a restricted Markdown subset to
HTML, builds the exact-lane search index, and writes the artifact. Re-run it
with `--force` to replace a non-empty output directory.

```sh
wordcell publish --root kb --out site/ --title "Team Handbook" \
  --description "Public engineering notes" --base-path /handbook/ \
  --base-url https://docs.example.com
```

`--base-path` sets the URL prefix the site is served under (default `/`).
`--base-url` adds a `sitemap.xml`; omit it for object-storage or file hosting
without a canonical origin. `--noindex` emits a robots disallow and a noindex
marker on every page. `--deterministic` omits the generation timestamp so two
runs over identical input produce byte-identical output. `--dry-run` returns
the report and projected file set without writing. `--json` prints the report
as JSON.

## Select a subsection

Positive selectors form a union; excludes and `publish: false` frontmatter then
carve notes back out:

```sh
wordcell publish --root kb --out site/docs --include docs
wordcell publish --root kb --out site/public --tag public --exclude drafts
wordcell publish --root kb --out site/topic \
  --from notes/topic-seed --depth 2 --direction both
wordcell publish --root kb --out site/concepts --where type=concept --has relations
```

- `--include <path>` selects a note id or directory prefix; repeat to add more.
- `--exclude <path>` removes matching notes after selection.
- `--where <path=value>`, `--has <path>`, `--tag <tag>`, and `--scope
  <repository-path>` reuse the `wordcell list` metadata filters.
- `--from <note>` selects a bounded link-and-relation neighborhood around a
  seed note with `--depth` (1–10) and `--direction in|out|both`.
- `publish: false` frontmatter always excludes a note, even when a positive
  selector matches it.

Selection never reads note bodies to redact prose: a published note may still
mention an excluded note by name. The boundary is graph and metadata
membership. Links and typed relationships whose target stayed outside the
selection render as plain unresolved text — the excluded note's title and path
never enter the artifact — and the report counts them as dropped. Attachments
publish only when a selected note references a validated file inside the vault.

## The emitted artifact

```text
site/
  index.html              # front door: the vault index note, or a catalog page
  index.json              # the index note payload, when one published
  manifest.json           # hraness.wordcell.site.v1 manifest
  catalog.json            # every note: slug, title, type, tags
  graph.json              # selection-scoped link and relation edges
  n/<slug>/index.html     # prerendered note pages with backlink panels
  n/<slug>.json           # hydrated note payloads for richer readers
  index/docs.json         # document table with normalized eager fields
  index/terms.json        # sorted term dictionary for prefix lookup
  index/c/<hh>.json       # content postings shards, only for large selections
  assets/<hash>.<ext>     # referenced attachments, content-addressed
  reader/reader.js|.css   # the bundled search overlay
  404.html, robots.txt, sitemap.xml
```

Every JSON file carries an explicit format identifier and parses under a
bounded `unknown`-value contract; parsers reject unexpected keys, oversize
fields, and wrong formats. `manifest.json` records the generator identity and
version, the selection descriptor, the source digest, artifact paths, search
mode, counts, and any truncated aspects. In `--deterministic` mode the manifest
carries no timestamp and the whole directory is reproducible.

### Browser-local search

The document table eagerly stores normalized title, alias, path, tag, and
metadata fields so in-page matching reproduces the exact lane's substring
semantics. Note content is indexed inline while the selection fits the
contract's aggregate budget; larger selections store sharded postings that the
reader fetches lazily by FNV-1a term hash. `--no-index-content` disables content
indexing entirely, leaving field-only search. Query, prefix-expansion, result,
and hydration bounds are fixed by the contract so a hostile or oversized
artifact cannot exhaust the browser.

### Safety

Raw HTML never passes through the renderer: every text span and attribute is
entity-escaped, only the controlled Markdown grammar emits markup, and external
URLs are restricted to `http`, `https`, and `mailto`. Pages ship a strict
`default-src 'self'` Content-Security-Policy, so no remote image, script, or
frame can load. The output directory must not be the vault root or inside it,
and every written path is confined to `--out`.

## Host the result

The site is static files. Sync the output directory to any object store or
static host — no adapter is required or bundled:

```sh
aws s3 sync site/ s3://bucket/handbook/ --delete
rclone sync site/ remote:handbook
```

Serve under a subpath by passing `--base-path` at publish time. For a local
preview, `wordcell serve` binds a static file server to the output directory:

```sh
wordcell serve --root site --port 8080
```

The server defaults to the loopback interface (`--host` overrides), maps
directories to `index.html`, returns the published `404.html` for missing
paths, confines requests and symlinks to the root, and answers `GET` and
`HEAD` only. It is a preview tool — production hosting stays with the object
store or CDN — and any other static file server works too:

```sh
python3 -m http.server --directory site 8080
```

## Programmatic use

`publishVault` drives the filesystem pipeline; `projectVault` projects an
already-scanned snapshot through an injectable `PublishIo` seam, so tests and
alternative hosts can resolve and read assets without disk access:

```ts
import { publishVault, projectVault } from "@hraness/wordcell/publish";
import {
  parseSiteManifestV1,
  WORDCELL_SITE_LIMITS_V1,
} from "@hraness/wordcell/publish-model";
```

`WORDCELL_SITE_LIMITS_V1` fixes every bound the artifact guarantees: note,
asset, term, shard, preview, inline-text, payload-text, and hydration caps.
