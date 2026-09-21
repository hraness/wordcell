---
title: Hosted site publication
description: Accept a bounded vault over HTTPS, project it server-side into the hraness.wordcell.site.v1 contract, and serve it from wordcell.io — the soulscrape-style publishing surface that lets cloud agents publish without the local CLI.
type: plan
area: publication
status: in-progress
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
- **Admission is capability tokens, not Accounts.** Wordcell is not a
  registered `@hraness/suite-accounts` consumer — OIDC sign-in would need a
  cross-repo registry change and issuer-side client registration that cannot
  be live-verified here. Instead `POST /api/v1/tokens` mints a `wc_pub_`
  bearer self-serve (IP-bounded); the server stores only its SHA-256 digest,
  and the digest's first 8 hex chars own the site namespace. Published sites
  are public artifacts, so token-keyed ownership plus IP quotas is the honest
  bound; suite-accounts OIDC remains the documented upgrade path when the
  consumer registration lands.
- **Namespace**: `wordcell.io/p/<key8>/<slug>/` — same public-by-contract
  posture as soulscrape person indexes; emitted pages may set `noindex` only
  when the caller asks for it, never to hide public content.
- **R2 holds everything — no Convex.** The emitted file set is immutable by
  digest, and the control plane (token digests, site records, slug pointers,
  daily quota counters) is a handful of small JSON objects in the same
  bucket behind the `wordcell-sites` worker — the `slopcamera-objects`
  pattern: HMAC-signed ops on the bound worker, zero S3 credentials, zero
  database spend. `s/<key8>/<digest>/` keys are owner-scoped so a delete or
  republish sweep can never remove another namespace's identical bytes.
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
   map, runs the projection server-side, stores the artifact, and returns
   `{url, digest, revision}`; `DELETE` unpublishes; `GET` returns the record.
   `GET /api/v1/sites` lists the caller's sites; `GET /api/v1/openapi.json`
   and `GET /api/v1/health` describe the surface.
2. Projection via `projectVault`, not `publishVault` — the packaged
   `publishVault` defaults to `findKbPackageRoot()` on `import.meta.dir`
   (Bun-only). The hosted route materializes the request vault to a
   temporary directory, runs `scanVault` + `validateMarkdownAttachments` +
   `projectVault` with an injected `PublishIo` (reader files synced from the
   pinned release into `lib/hosted/reader.generated.ts`), and collects
   emitted files from memory. Exactly the shipped pipeline — no fork.
3. `worker/` — the `wordcell-sites` Cloudflare Worker bound to the
   `wordcell-sites` R2 bucket: HMAC-signed PUT/GET/HEAD/DELETE/LIST for the
   API, plus the unsigned `/p/<key8>/<slug>/` read path that resolves the
   `m/` pointer and serves `s/<key8>/<digest>/` bytes with directory-index
   and `404.html` semantics identical to `wordcell serve`. Lifecycle rules
   expire `up/` uploads and `q/` quota counters; `s/`, `m/`, `sites/`,
   `tok/` persist.
4. Public reads reach the worker through a `site/vercel.json` rewrite of
   `/p/:path*` — zero Next.js compute on the read path, ordinary CDN
   caching in front.
5. `POST /api/v1/tokens` mints capability tokens; `POST /api/v1/uploads`
   mints presigned PUTs (≤32 MiB) for binary assets referenced as
   `{"upload": id}` in the files map.
6. Skill update: `skills/wordcell/` gains a hosted-publish reference —
   assemble a vault, `PUT`, get the URL — for cloud agents that never install
   the CLI. Local `wordcell publish` is unchanged. (Follow-up change.)
7. `docs/publish.md` documents the hosted surface — bounds, retention,
   auth posture, and the storage layout.
8. Evidence pack in `docs/` mirroring slopcamera's `platform-submission.md`
   once the live endpoint is verified.

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
