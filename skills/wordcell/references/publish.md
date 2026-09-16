# Publish a knowledge base as a static site

`wordcell publish` projects a vault or a selected subsection into a
self-contained `hraness.wordcell.site.v1` static artifact: prerendered
read-only pages, a selection-scoped graph, a browser-local exact-match search
index, content-addressed attachments, and a bundled zero-dependency reader. The
result hosts from plain object storage, a CDN, or `file://` with no server.

## 1. Confirm scope before publishing

Publication is a projection of current Markdown, not a vault mutation. Before
running it, agree on the selection and the host path:

- Ask what the site should contain when the request does not say: the whole
  vault, a directory prefix, a tag or metadata subset, or a bounded
  neighborhood around one seed note.
- Surface the no-leak boundary explicitly. A published note may still mention
  an excluded note in prose; only its graph edges, metadata, and attachment
  files are withheld. Links to excluded notes render as unresolved text, so the
  excluded note's title and path never enter the artifact.
- Check for `publish: false` frontmatter on anything the selection would emit;
  the flag wins over every positive selector.
- Ask for the deploy base path (`--base-path`) when the site will live under a
  subpath, and the origin (`--base-url`) only when a sitemap is wanted.

## 2. Publish

```sh
wordcell publish --root "$KB_ROOT" --out <directory>
```

The output directory must sit outside the vault and is replaced only with
`--force`. Useful options:

- `--title`, `--description` — site identity for the chrome and manifest.
- `--include`, `--exclude` — note ids or directory prefixes, repeatable.
- `--where <path=value>`, `--has <path>`, `--tag <tag>`, `--scope <path>` — the
  `wordcell list` metadata filters.
- `--from <note> --depth <1-10> --direction in|out|both` — a bounded link and
  relation neighborhood.
- `--noindex` — robots disallow plus a noindex marker on every page.
- `--no-index-content` — field-only search; no content index.
- `--deterministic` — byte-identical output by omitting the timestamp.
- `--dry-run` — report the plan and projected file set without writing.
- `--json` — the machine-readable report.

Read the report before handing off: dropped link counts reveal selection
edges, and `skipped` attachment counts flag missing or unsafe files that the
vault's `wordcell check` gate can diagnose.

## 3. Verify and host

Open `index.html` or serve the directory with any static file server and
exercise `/` search overlay in a browser. Sync the directory to the target —
`aws s3 sync`, `rclone`, Pages, or any bucket — and publish again rather than
editing emitted files in place.
