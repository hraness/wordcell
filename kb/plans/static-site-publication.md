---
title: Static site publication
description: Publish a vault or a selected subsection as a self-contained hraness.wordcell.site.v1 static artifact with read-only pages and browser-local search.
type: plan
area: publication
status: in-progress
tags:
  - publishing
  - static-site
repository_scopes:
  - docs
  - skills/wordcell
  - src
---

# Static site publication

## Outcome

`wordcell publish --root <vault> --out <directory>` emits a self-contained
static site under the `hraness.wordcell.site.v1` contract: prerendered
read-only note pages, a selection-scoped link and relation graph, a
browser-local exact-match search index, content-addressed attachments, and a
bundled zero-dependency reader. The artifact hosts from object storage, a CDN,
or `file://` with no server, matching the product goal of cheap hosted
knowledge bases with browser-local compute.

## Context

The product seam keeps Wordcell as the product-neutral Markdown engine and
vault/publication foundation. The publication artifact is therefore a
self-contained file contract — not an Oh store object and not a Sponge-shaped
payload — so another consumer can later emit or consume the same format.
[[notes/repository-seams|Repository seams]] records which interfaces may cross
repository boundaries.

## Decisions

- The manifest and every artifact use the `hraness.wordcell.site.*` format
  identifiers; the committed `kb/` vault directory and `kb:` markers remain
  unchanged data contracts.
- Positive selectors (`--include`, `--where`, `--has`, `--tag`, `--scope`,
  `--from`) form a union; excludes and `publish: false` carve notes back out.
  Selection is graph and metadata membership, never prose redaction.
- Links and relations to excluded notes render as unresolved text so an
  excluded note's title and path never enter the artifact.
- The renderer emits HTML only from a controlled Markdown grammar: raw HTML is
  escaped, URL schemes are allow-listed, and every page ships a strict
  `default-src 'self'` Content-Security-Policy.
- Search mirrors the exact lane: normalized substring field matching, identity
  and phrase precedence, bounded coverage admission, deterministic ranking.
  Content indexes inline below the aggregate budget and shards postings by
  FNV-1a term hash above it.
- `--deterministic` omits the generation timestamp for byte-identical output;
  all JSON serializes canonically through `@hraness/oh`.
- The reader bundle ships inside the artifact and stays free of Node, DOM, and
  framework dependencies; the package remains headless.

## Verification

Colocated named tests cover contract parsing, selection, slugging, rendering,
indexing, and the filesystem pipeline; `src/publish.property.test.ts` covers
slug uniqueness and determinism, path confinement, parser round trips, and
doc-table selection fidelity. `bun run check` gates the change.
