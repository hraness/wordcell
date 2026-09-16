---
title: Static site publication
description: Publish a vault or a selected subsection as a self-contained hraness.wordcell.site.v1 static artifact with read-only pages and browser-local search.
type: plan
area: publication
status: completed
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

## Result

Shipped in [hraness/wordcell#57](https://github.com/hraness/wordcell/pull/57)
(`3ed3834`): the `publish` command, the `hraness.wordcell.site.*` contract
family, the restricted renderer, the index builder, the vendored reader, and
`docs/publish.md` plus `skills/wordcell/references/publish.md`. Full
`bun run check` passed on the merged tree (1,426 tests), and an end-to-end
publish of this vault produced six notes, 1,259 terms, resolved wikilinks, and
working browser-local search over a plain HTTP static server.

Two delivery findings worth recording: the `site` job regenerates
`site/app/readme.generated.ts` from `README.md`, so README edits must run
`bun run sync:readme` inside `site/`; and CodeQL's
`js/incomplete-multi-character-sanitization` rejects regex tag stripping even
at fixpoint — anchor derivation now decodes entities and removes tag spans
with a character scanner.

A follow-up added `wordcell serve` (`src/serve.ts`): a loopback-default static
preview server over the emitted directory — `GET`/`HEAD` only, realpath
confinement including symlink resolution, `index.html` directory mapping, and
the published `404.html` fallback. Production hosting stays with the object
store or CDN.

## Durable memory

The publication artifact is deliberately a self-contained file contract rather
than an Oh store object, so a second consumer can emit or consume it without
importing the engine. Promoting that shared seam is tracked as a future
sponge-side adoption spike; no maintained note is warranted until a second
concrete consumer exists.
