# Publish a static site

`wordcell publish` turns selected Markdown notes into a static website with
search, backlinks, and a graph. Build it locally, inspect the result, then copy
the files to your preferred host. Publishing does not upload your vault or
require an account, database, model, or API key.

The HTML pages work without JavaScript. Serve the directory over HTTP to use
the bundled browser-local search and graph; opening HTML files directly is
suitable for reading pages, but browser restrictions can block the reader.

## Preview and publish a slice

Choose notes by exact path, directory, glob, metadata, or a graph neighborhood.
This example combines a directory tree with one note from elsewhere in the
vault, then removes drafts:

```sh
wordcell publish --root kb --out site \
  --include-glob 'guides/**/*.md' --include notes/getting-started \
  --exclude drafts --dry-run --json
```

The dry run builds the same artifact in memory and leaves the output directory
untouched. Its JSON report includes counts, a source digest, and up to 20
selected note ids. The digest covers selected Markdown; it does not cover
attachment bytes. Review those ids, counts, and referenced assets before writing. Repeat the same
selectors without `--dry-run` to build the site:

```sh
wordcell publish --root kb --out site \
  --include-glob 'guides/**/*.md' --include notes/getting-started \
  --exclude drafts
wordcell serve --root site --port 8080
```

Open `http://127.0.0.1:8080` to inspect the pages. Nothing is publicly hosted
until you upload the generated directory. When rebuilding an existing site,
add `--force` to replace that output directory. Keep it separate from your
source vault: neither directory may contain the other. An empty selection
returns a zero-count dry-run report, but writing it fails so a mistyped selector
cannot replace an existing site. Wordcell writes the complete replacement
into a sibling staging directory first. A write failure leaves the previous
site in place. Promotion moves the previous site to a temporary backup, then
moves the staged site into place. These are two renames, so a running server can
briefly see no output directory. If promotion fails, Wordcell restores the
backup; if restoration also fails, the error names the retained backup path.
The backup is removed only after successful promotion.

For agent workflows, `--json` returns the report without note bodies, HTML,
search postings, or file contents. `--list-limit 0` returns counts and the source
digest only; a value from zero through 1,000 changes the maximum listed ids.
The ids also have a combined 16 KiB byte budget, and `selection.truncated`
reports when the list is incomplete. The bound changes only the report, never
which notes publish. Read the generated `catalog.json` when you need the full
published list. An SDK caller can reuse a scanned vault with `projectVault`.

## Choose what publishes

```sh
wordcell publish --root kb --out site/docs --include docs
wordcell publish --root kb --out site/public --tag public --exclude drafts
wordcell publish --root kb --out site/guides \
  --include-glob 'guides/**/*.md' --exclude-glob '**/draft-*'
wordcell publish --root kb --out site/topic \
  --from notes/topic-seed --depth 2 --direction both
wordcell publish --root kb --out site/concepts --where type=concept --has relations
```

- `--include <path>` selects a note id, `.md` path, or directory prefix. Repeat
  it to combine notes from anywhere in the vault.
- `--include-glob <pattern>` matches note ids or `.md` paths, case sensitively.
  `*` matches within one path segment, `?` matches one character, and a whole
  `**` segment matches zero or more directories. Quote patterns so your shell
  does not expand them. Bracket classes and brace expansion are unsupported.
  Glob matching has a shared work budget; if a large or complex selection
  exceeds it, use fewer patterns or exact path prefixes.
- `--where <path=value>`, `--has <path>`, `--tag <tag>`, and `--scope
  <repository-path>` form one metadata query. All filters in that query must
  match, as with `wordcell list`.
- `--from <note>` selects a link-and-relation neighborhood with `--depth`
  (1–10) and `--direction in|out|both`. Neighborhoods are bounded at 1,000 notes
  and 10,000 connections; exceeding either bound fails instead of silently
  publishing an incomplete neighborhood. Narrow the depth or use paths/globs.
- Include paths, include globs, the metadata query, and the graph neighborhood
  form a union. For example, `--include docs --tag public` selects every note
  under `docs` plus every public-tagged note elsewhere.
- `--exclude <path>` and `--exclude-glob <pattern>` remove notes after that
  union. `publish: false` frontmatter always removes a note, even when another
  selector matches it. With no positive selector, all remaining notes publish.

Review selected prose and attachments before hosting. Selection controls which
notes enter the site; it does not redact text inside them. A selected note can
still mention a private name, contain sensitive metadata in its search fields,
or reference an attachment you intended to keep private. Exclusion selectors
apply to notes, not attachment files. Only validated local attachments directly
referenced by selected notes are copied.

Links and typed relationships to excluded notes are omitted from structured
navigation. An authored link label can remain in the selected note's rendered
prose. Public manifests record selector counts without storing raw include,
exclude, filter, or seed values.

## Set the site identity

```sh
wordcell publish --root kb --out site --title "Team Handbook" \
  --description "Public engineering notes" --base-path /handbook/ \
  --base-url https://docs.example.com
```

`--base-path` sets the URL prefix (default `/`). `--base-url` adds a
`sitemap.xml`; omit it when the site has no canonical origin. `--noindex`
emits a robots disallow and a noindex marker on every page. These are indexing
requests, not access controls. `--deterministic` omits the generation timestamp
so identical inputs and options produce byte-identical artifacts.

## The emitted artifact

```text
site/
  index.html              # front door: the vault index note, or a catalog page
  index.json              # the index note payload, when one published
  manifest.json           # hraness.wordcell.site.v1 manifest
  catalog.json            # every note: slug, title, type, tags
  graph.json              # selection-scoped link and relation edges
  graph/index.html        # interactive map of the published graph
  n/<slug>/index.html     # prerendered note pages with backlink panels
  n/<slug>.json           # hydrated note payloads for richer readers
  index/docs.json         # document table with normalized eager fields
  index/terms.json        # sorted term dictionary for prefix lookup
  index/c/<hh>.json       # content postings shards, only for large selections
  assets/<hash>.<ext>     # referenced attachments, content-addressed
  reader/reader.js|.css   # the bundled reader: search overlay and graph map
  reader/theme.js         # synchronous appearance bootstrap (see below)
  404.html, robots.txt, sitemap.xml
```

## Reading the site

Every page ships the same chrome: a header with the site title, a `Graph` link,
and a `Search` button; a sidebar tree of the published notes; and a footer.
The tree is derived from slug paths. Directories sort before notes at each
level, groups open along the path to the current page, and oversized branches
fold into bounded `+N more` links back to the catalog. Everything is
prerendered HTML: navigation works with JavaScript disabled.

Note pages add breadcrumbs above the article and an *On this page* table of
contents beside it, generated from the same heading anchors the Markdown
renderer emits. The backlink, relation, and referenced-by panels still sit in
the article aside.

The graph page maps `graph.json` onto a canvas: nodes sized by degree, links
as solid edges and typed relations as dashed ones. Drag to pan, scroll or
pinch to zoom, hover a node to light its neighborhood, and click a node to
open the note. `graph/#n=<slug>` deep-links to a focused node. The layout is a
seeded deterministic force layout, so every visitor sees the same map. Sites
over the contract's node limit publish the same page with the static note
index instead of the live canvas, and the prerendered index below the map
keeps the page useful without JavaScript at any size.

### Appearance

The reader supports the shared Hraness palette contract: the `wordcell`
neutral palette plus Catppuccin, Gruvbox, Rosé Pine, and Tokyo Night, each
in light and dark. A small classic script, `reader/theme.js`, loads
synchronously in every page head, ahead of the stylesheet, and applies
the stored preference to `data-palette` and `data-theme` on the document
element before first paint, so a saved palette never flashes the default.
The preference lives under `hraness-design-palette-v1` in the origin's
local storage, the same key design-kit applications use, so a reader
hosted beside one honors the visitor's existing choice; `system` mode
follows the operating system and `storage` events synchronize other tabs.
The deferred reader adds a single appearance menu as the rightmost header
action — radio groups for mode and palette — and the graph map repaints
on every applied change. Without JavaScript, or with no stored preference,
pages fall back to the neutral palette under `prefers-color-scheme`.

Every JSON file carries an explicit format identifier and parses under a
bounded `unknown`-value contract; parsers reject unexpected keys, oversize
fields, and wrong formats. `manifest.json` records the generator identity and
version, selector counts, the source digest, artifact paths, search
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

The overlay opens from the `Search` button or the `/` key. Alongside free
text, field filters narrow the candidate set:

- `tag:<tag>` requires every listed tag.
- `type:<type>` matches the catalog `type` value; notes without one count as
  `note`.
- `path:<prefix>` limits results to notes whose slug, id, or vault path sits
  under the prefix on a segment boundary (`path:docs` matches `docs/alpha`,
  never `docs2/x`).

Filters combine with free text. `tag:public path:docs migration` searches
"migration" inside public notes under `docs/` — and a filter-only query lists
everything that matches. Unknown or malformed `name:` tokens stay in the
free-text query. Matched terms render with `<mark>` highlighting built from
DOM text nodes, never injected HTML.

### Safety

Raw HTML never passes through the renderer: every text span and attribute is
entity-escaped, only the controlled Markdown grammar emits markup, and external
URLs are restricted to `http`, `https`, and `mailto`. Pages ship a strict
`default-src 'self'` Content-Security-Policy, so no remote image, script, or
frame can load. The output directory and vault must be separate: neither may contain the
other, including through symlinked parent directories. The output directory
itself cannot be a symlink, and every written path is confined to `--out`.
Generated JSON must pass the reader contracts before any output is replaced.
Every generated filename component must fit 255 UTF-8 bytes, and a generated
file cannot also serve as a directory. A conflicting or oversized filename
produces a rename instruction before an existing site is touched.
An oversized title or too many aliases or tags produces a named validation
error; shorten that field or narrow the selection and publish again.

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
`HEAD` only. Production hosting stays with the object store or CDN. Any other static file
server works for previews too:

```sh
python3 -m http.server --directory site 8080
```

## Host on wordcell.io

`wordcell.io` also publishes a vault for you: the API runs the same projection
server-side and serves the emitted artifact at `https://wordcell.io/p/<key8>/<slug>/`.
This path exists for agents and machines that cannot hold files or deploy a
static host; the CLI remains the primary publication path, and the artifact
contract is identical either way.

```sh
curl -s -X POST https://wordcell.io/api/v1/tokens -d '{"label":"my agent"}'
# → { "ok": true, "token": "wc_pub_…", "key8": "…", "urlBase": "…/p/<key8>/" }

curl -s -X PUT https://wordcell.io/api/v1/sites/handbook \
  -H "Authorization: Bearer wc_pub_…" -H "content-type: application/json" -d '{
    "operation": {
      "contract": "hraness.wordcell.hosted-operation.v1",
      "id": "32d708ac-782d-4ca0-8c34-3e89ad0ed02a",
      "expectedRevision": 0
    },
    "title": "Team Handbook",
    "files": {
      "index.md": "# Handbook\n\nStart with [[onboarding]].\n",
      "onboarding.md": "# Onboarding\n\nWelcome.\n",
      "assets/logo.png": {"upload": "<id from POST /api/v1/uploads>"}
    }
  }'
# → { "ok": true, "site": { "url": "https://wordcell.io/p/<key8>/handbook/", … } }
```

- **Tokens are capability tokens.** `POST /api/v1/tokens` is self-serve and
  free, bounded per client address. The server stores only the token's SHA-256
  digest; the digest's first 8 hex chars form the site namespace, so a token
  can only create or replace its own sites. There is no account and no device
  flow at this stage.
- **Files** map vault-relative paths to a UTF-8 string, `{"base64": "…"}`, or
  `{"upload": "<id>"}`. Uploads come from `POST /api/v1/uploads`, which mints a
  short-lived, write-once presigned PUT (≤32 MiB); uploads expire after a day.
  Inline bytes are capped at 4 MiB per request, 256 files per request.
- **Options** (`title`, `description`, `index`, `noindex`, `indexContent`,
  `selection`) mirror the CLI flags; `selection` accepts the same
  includes/excludes/globs/tags/repositoryScopes/filters/from shape. `index`
  selects the vault's index note path when it is not `index.md`.
- **Conditional writes and recovery.** Read the current revision with `GET`
  before a write. PUT and DELETE require a unique operation ID and the revision
  they expect to replace. Exact retries return the original receipt. Resolve
  uncertain outcomes with `GET ?operation=<id>`. One conditional site-head
  write changes the record and public visibility after all artifact bytes are
  durable. DELETE retains a tombstone and receipts; shared artifact bytes stay
  stored. See the [hosted operation contract](hosted-publication.md) for request
  shapes, conflict handling, and recovery. Public reads can remain cached for
  up to 60 seconds.
- **Bounds.** Hosted publication accepts ≤256 files per request, applies the
  contract's per-note and per-asset byte caps, and rejects projected output
  over 3,500 files or 256 MiB. Tokens get 60 publishes per day and 50 distinct
  reserved slugs, including deletions and interrupted operations; addresses get 8 token mints and
  120 publishes per day.
  Public reads carry no quota beyond ordinary CDN caching.
- **Data.** The request vault is materialized to a temporary directory for the
  projection and deleted when the request ends; only the emitted artifact
  persists. Quota counters expire within two days; token digests, site records,
  namespace reservations, operation receipts, and tombstones persist. Published sites are
  public by contract — never publish private content.

`GET /api/v1/openapi.json` returns the OpenAPI 3.1 description;
`GET /api/v1/health` reports service and storage health. MCP clients can use
the streamable-HTTP endpoint `POST /api/v1/mcp` instead of REST: it exposes
`create_token`, `get_site`, `publish_site`, `list_sites`, and `delete_site` tools that
dispatch to the identical route logic — send the `wc_pub_` Bearer token as on
REST, and `create_token` stays unauthenticated so an MCP-only client can
onboard itself. The storage layer is
a private Cloudflare R2 bucket behind the `wordcell-sites` worker — object
reads and writes are HMAC-signed, and the public `/p/` path resolves the site
head to immutable artifact bytes with directory-index and `404.html`
semantics identical to `wordcell serve`.

## Programmatic use

`publishVault` drives the filesystem pipeline; `projectVault` projects an
already-scanned snapshot through an injectable `PublishIo` seam, so tests and
alternative hosts can resolve and read assets without disk access:

```ts
import { publishVault } from "@hraness/wordcell/publish";

const preview = await publishVault({
  root: "kb",
  out: "site",
  selection: { includeGlobs: ["guides/**/*.md"], includes: ["notes/getting-started"] },
  dryRun: true,
  listLimit: 10,
});
console.log(preview.report); // counts, selected ids, and digest; no note bodies
```

`parseSiteManifestV1` and `WORDCELL_SITE_LIMITS_V1` are available from
`@hraness/wordcell/publish-model`. The constants fix every artifact bound: note,
asset, term, shard, preview, inline-text, payload-text, and hydration caps.
