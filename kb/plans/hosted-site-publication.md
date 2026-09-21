---
title: Hosted site publication
description: Accept a bounded vault over HTTPS, project it server-side into the hraness.wordcell.site.v1 contract, and serve it from wordcell.io — the soulscrape-style publishing surface that lets cloud agents publish without the local CLI.
type: plan
area: publication
status: proposed
tags:
  - publishing
  - hosted-api
  - connectors
repository_scopes:
  - site
  - skills/wordcell
  - src/publish.ts
  - src/publish-model.ts
---

# Hosted site publication

## Outcome

`PUT /api/v1/sites/{slug}` on wordcell.io accepts a bounded vault file map,
projects it with the same `publishVault` pipeline the CLI runs, stores the
emitted `hraness.wordcell.site.v1` artifact content-addressed in object
storage, and serves it at a public path. Agents on platforms that cannot run
a local CLI — Muse connectors, Grok-style bots, Instinct-class clients —
publish a browsable Wordcell site in one call. The [[plans/static-site-publication|static site contract]]
stays the only artifact format; hosting changes who can emit it, not what it
is.

## Context

`soulscrape` already proved this distribution shape: a free local Agent Skill
plus a narrow hosted write path (`PUT /api/v1/people` under Hraness Accounts
device-flow auth, digest-idempotent, bounded storage) is what turns a
local-first tool into something platform agents can actually use. The
`slopcamera` hosted API added the second half of the lesson: one canonical
registry behind REST + OpenAPI, bytes on a claim-ticket side channel, and a
per-endpoint function layout because the detected framework preset
degenerated catch-all routes.

Wordcell is the closest match to soulscrape of any product: the artifact is
already static and self-contained, the projection is pure and injectable
(`PublishIo` supplies `resolveAssetPath`/`readAsset` with no disk
requirement), and `site/` is a Next.js app that hosts route handlers
natively — no catch-all workaround needed.

## Decisions

- **Vault Markdown in, site artifact out.** The endpoint accepts
  `{ "files": { "index.md": "…", "assets/x.png": "<base64|upload-ref>" }, … }`,
  materializes an in-memory vault, and runs the real projection server-side.
  A pre-projected bundle upload is rejected as v1 scope: server-side
  projection is the checked-artifact property — the service validates and
  selects, so a caller cannot emit contract-invalid HTML.
- **Digest-addressed and idempotent.** The published artifact key is the
  sha256 of the canonical emitted file set. Republishing identical vault
  bytes returns the same site record without a rewrite; revision N replaces
  the served pointer only after the new artifact is durably stored.
- **Admission mirrors soulscrape.** Publishing is a write and writes go
  through Hraness Accounts sign-in plus the device flow. Tokens are stored
  as digests; the caller's bearer token never persists. Anonymous requests
  get `401` with the `/connect` instructions, not a quota.
- **Namespace**: `wordcell.io/p/<username>/<slug>/` — same public-by-contract
  posture as soulscrape person indexes; emitted pages may set `noindex` only
  when the caller asks for it, never to hide public content.
- **Object storage over the Convex path**: the emitted file set is immutable
  by digest, so R2 (or the `slopcamera-objects`-style bound-worker proxy, no
  S3 credentials) serves bytes; Convex keeps only the site record —
  `{owner, slug, digest, createdAt, byteCount}` — bounded per account.
- **Bounds are tighter than the local contract.** Hosted intake caps the
  vault at a small fixed budget (order: 512 files, 32 MiB total, per-file
  inline cap; larger attachments via a presigned upload reference) even
  though the artifact contract admits 10k notes. The intake bound is a
  service limit, not a contract change.
- **No billing at launch.** Quotas per account (site count, total bytes,
  publish rate) absorb cost; a Credits cost-plus operation is the documented
  next step if quotas stop covering real usage — the ledger shape is already
  proven by `slopcamera`.
- **Agent-platform surface**: REST + `GET /api/v1/openapi.json` first. A
  stateless MCP `tools/call` endpoint over `wordcell.publish_site` /
  `wordcell.list_sites` / `wordcell.unpublish` follows the same adapter
  pattern once the REST shape settles.

## Non-goals

- No hosted vault storage, sync, or editing — local-first stays; the service
  holds publications, not working state.
- No hosted search-as-a-service; search remains browser-local inside the
  artifact.
- No accounts on wordcell itself; Hraness Accounts owns identity.
- No paid tier at launch.
- No changes to the `hraness.wordcell.site.v1` contract; hosted intake bounds
  are service limits, not format limits.

## Work

1. `site/app/api/v1/sites/[slug]/route.ts` — `PUT` accepts the bounded file
   map, runs `publishVault` against an in-memory `PublishIo`, stores the
   artifact, and returns `{url, digest, revision}`; `DELETE` unpublishes;
   `GET` returns the record. `GET /api/v1/openapi.json` describes all three.
2. In-memory `PublishIo` adapter: `readAsset` resolves from the posted map or
   a fetched upload object; `resolveAssetPath` confines targets to the map's
   namespace. Projection runs exactly the shipped `src/publish.ts` code path
   — no fork.
3. Convex schema: `sites` (owner, slug, digest, bytes, created), digest-only
   token store, device-flow tables — mirroring soulscrape's `site/convex/`
   shape, minus person-index specifics.
4. Object storage: new R2 bucket `wordcell-sites` (or a shared
   `hraness-objects` worker with per-product namespaces); `s/<digest>/<path>`
   keys; public reads stream through `app/p/[username]/[slug]/[...path]` which
   resolves the site record and serves bytes with the emitted content types.
5. Device flow: `POST /api/v1/device/start|poll` + the `/connect` page,
   digesting tokens like soulscrape.
6. Skill update: `skills/wordcell/` gains a hosted-publish reference —
   assemble a vault, `PUT`, get the URL — for cloud agents that never install
   the CLI. Local `wordcell publish` is unchanged.
7. `costs.json` (or the site-side registry equivalent) gains the sites table,
   the bucket, the device-flow tables, and the per-route meters.
8. Evidence pack in `docs/` mirroring slopcamera's `platform-submission.md`.

## Verification

- Unit: intake bounds (file count, bytes, traversal, control bytes), digest
  idempotency, revision replacement ordering, unpublished-404, token digest
  storage, malformed-vault rejection paths. No network in tests.
- Property: emitted artifact parses under the published-site readers; paths
  in the served namespace resolve only inside the site's digest prefix.
- Live: publish the repository's own `kb/` (trimmed selection) to
  `wordcell.io/p/…`, fetch a page and the search index, verify a republish
  of identical bytes is idempotent, then unpublish.
- The site `check` gate plus `bun run check` stay green; committed `dist/`
  and `bun.lock` are untouched by this plan.

## Recovery

Unpublish is a record delete; the digest-addressed objects are garbage under
the bucket lifecycle or an explicit sweep of unreferenced digests. A bad
revision is reverted by repointing `slug` to the prior digest — emitted
objects are immutable, so rollback is a record write.
