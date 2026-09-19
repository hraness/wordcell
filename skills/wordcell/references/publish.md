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
