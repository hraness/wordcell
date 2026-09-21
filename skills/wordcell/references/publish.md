# Publish selected knowledge as a static site

Use `wordcell publish` to turn selected Markdown notes into read-only pages,
backlinks, a graph, and browser-local search. It builds files locally with no
model call. Publishing here means generating the artifact; uploading it to a
host is a separate action.

## Select and preview

Use the scope in the user's request. Ask only when the selection or destination
is materially ambiguous. Resolve `KB_ROOT` before running commands, and choose
an output directory outside the vault that does not contain it.

Start with a compact, read-only preview:

```sh
wordcell publish --root "$KB_ROOT" --out ./public-notes \
  --include notes/decision --include plans/implementation \
  --dry-run --list-limit 20 --json
```

The report contains counts, at most 20 selected note IDs, and a digest of the
selected Markdown. It does not print note bodies. Inspect `selection.truncated` before
treating the preview as a complete list. Raise `--list-limit` up to 1000 when
individual IDs matter, or use zero for counts and a digest alone. Open only
selected notes whose contents need review; do not load or summarize the whole
vault to choose a known slice.

Selectors are repeatable:

- `--include <id-or-directory>` selects exact notes or directory prefixes.
- `--include-glob 'notes/**'` and `--exclude-glob '**/draft-*'` select by pattern.
  Quote globs so the shell does not expand them. `*` matches within one segment,
  `?` matches one character, and `**` matches whole path segments.
- `--where type=concept`, `--has relations`, `--tag public`, and
  `--scope packages/parser` select by authored metadata.
- `--from notes/topic --depth 2 --direction both` selects a bounded neighborhood
  of explicit links and relationships. Oversized neighborhoods fail rather
  than silently publish an incomplete selection.

Positive path, glob, metadata, and graph selectors form a **union**. Metadata
predicates within their group must all match. `--include notes --tag public`
therefore includes all of `notes`, not only its public-tagged notes. Use a
metadata conjunction or explicit note IDs when an intersection is required.
Excludes and `publish: false` always win.

Publication is not prose redaction. Review selected text and referenced assets
for anything unsuitable for the intended audience. A selected note can mention
excluded material in its own text. Private flags exclude a note's page, search
record, and graph membership; they cannot remove information copied into another
note or attachment. `--noindex` is a crawler preference, not access control.

## Build the reviewed slice

Repeat the preview command without `--dry-run`. Keep the same selectors and
check the returned digest and counts; if the Markdown changed, review it again.
The digest covers selected Markdown, not attachment bytes. Review referenced
attachments separately before sharing.

```sh
wordcell publish --root "$KB_ROOT" --out ./public-notes \
  --include notes/decision --include plans/implementation \
  --title "Project decisions" --deterministic --json
```

Use `--force` only to replace a known generated output directory. Set
`--base-path /handbook/` if the host serves the files at a subpath, and add
`--base-url https://docs.example.com` when a sitemap is useful. Use
`--no-index-content` for field-only search. None of these flags changes the
source vault.

Read dropped-link, skipped-asset, and search-truncation counts. Run
`wordcell check --root "$KB_ROOT"` when missing links or attachments need
diagnosis. Do not report missing content as complete.

## Preview and host

```sh
wordcell serve --root ./public-notes --port 8080
```

Open the loopback URL. Check a note, its navigation, the Search overlay, and the
Graph page. HTML can be read without JavaScript; browser search and graph need
HTTP hosting rather than `file://`. The preview server is not a production
service.

Upload the generated directory to the user's selected static host only when
hosting is in the request. Confirm the exact destination and preserve unrelated
files. Verify the public URL and selected content after upload. A successful
local build alone is not a live deployment.

The full artifact contract and hosting options are in
[the publishing guide](https://github.com/hraness/wordcell/blob/main/docs/publish.md).

## Publish through wordcell.io when the CLI cannot run

Agents on platforms without a filesystem or Bun runtime can publish the same
`hraness.wordcell.site.v1` artifact through the hosted surface. It runs the
identical projection server-side; published sites are public.

```sh
# Self-serve capability token (IP-limited; shown once — store it).
TOKEN=$(curl -sf -X POST https://wordcell.io/api/v1/tokens \
  -H 'content-type: application/json' -d '{"label":"my-agent"}' | jq -r .token)

# Publish a vault as a files map: path -> utf8 string, {"base64":"..."}, or
# {"upload":"<id>"} from POST /api/v1/uploads for larger assets.
curl -sf -X PUT "https://wordcell.io/api/v1/sites/my-notes" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"files":{"index.md":"# Notes\n","a.md":"# A\n"},"title":"My notes"}'
# -> {"site":{"url":"https://wordcell.io/p/<key8>/my-notes/",...},"idempotent":false}
```

`GET /api/v1/sites` lists the token's sites and `DELETE /api/v1/sites/{slug}`
unpublishes. Identical bytes republish idempotently without a revision bump;
changed bytes sweep the superseded artifact. Deletes and republishes can take
up to 60 seconds to propagate at the edge. MCP clients can instead point at the
streamable-HTTP endpoint `POST https://wordcell.io/api/v1/mcp`, which exposes
`create_token`, `publish_site`, `list_sites`, and `delete_site` tools over the
same routes — `create_token` is unauthenticated so an MCP-only client can
onboard itself. `GET /api/v1/openapi.json` describes the REST surface.

The hosted surface carries the same selection semantics (`selection` mirrors
the CLI selectors) and the same redaction warning: `publish: false` excludes a
note, it does not erase text quoted elsewhere. Bounded inputs apply — at most
256 files and 4 MiB inline per publish, 32 MiB per uploaded asset, 50 live
sites per token.
