# Platform submission — wordcell.io hosted publication

Evidence pack for submitting the Wordcell hosted surface to agent platforms
(Muse connectors, Grok-style bots, Instinct-class clients) or any HTTP tool
consumer. Every claim below was exercised against production on 2026-09-21.

## Endpoints

| Fact | Value |
| --- | --- |
| Base URL | `https://wordcell.io` |
| OpenAPI 3.1 | `GET /api/v1/openapi.json` (5 paths) |
| Health | `GET /api/v1/health` → `{"ok":true,"storage":true,"artifact":"hraness.wordcell.site.v1"}` |
| Auth | `POST /api/v1/tokens` → `wc_pub_…` bearer; digest-only storage |
| Publish | `PUT /api/v1/sites/{slug}` → `{url, digest, revision}` |
| Public reads | `https://wordcell.io/p/<key8>/<slug>/` — CDN, no auth |

## Verified surface (live, 2026-09-21)

- `POST /api/v1/tokens` minted a `wc_pub_` token self-serve; the server stores
  only the SHA-256 digest and the first 8 hex chars own the slug namespace.
- `PUT /api/v1/sites/{slug}` on a two-note Markdown vault returned revision 1
  with 16 emitted files / 91,729 bytes and a `sha256:` source digest.
- `GET /p/<key8>/<slug>/` served prerendered `hraness.wordcell.site.v1` HTML
  through the CDN rewrite; `catalog.json` returned
  `hraness.wordcell.site-catalog.v1`; a missing note returned the artifact's
  own `404.html`.
- Identical republish returned `idempotent: true` — same digest, same
  revision, no rewrite.
- Changed vault produced revision 2 under a new digest; the prior digest's
  objects were swept.
- `GET /api/v1/sites` listed the caller's sites; `DELETE` unpublished —
  the public URL returns 404 (worker immediately, edge after ≤60s cache TTL).
- Unauthenticated `PUT` returns 401.

## Submission-form facts

- **Auth model**: capability token, `Authorization: Bearer wc_pub_…`. Minting
  is free and self-serve; a platform connector can mint per-installation.
  There is no signup wall and no OAuth handshake.
- **Input contract**: JSON `files` map — UTF-8 strings, `{"base64": …}`, or
  `{"upload": "<id>"}` from `POST /api/v1/uploads` (presigned PUT, ≤32 MiB,
  expires in 1 day). ≤256 files / 4 MiB inline per request.
- **Output contract**: `hraness.wordcell.site.v1` — the identical artifact
  `wordcell publish` emits locally. Server-side projection is the checked
  property: callers cannot produce contract-invalid sites.
- **Rate limits**: 8 token mints and 120 publishes per client address per
  day; 60 publishes and 50 live sites per token. 429s carry `retryable` and
  `retryAfter`.
- **Privacy posture**: the posted vault is materialized to a per-request
  tempdir and deleted when the request ends; only the emitted artifact
  persists. Quota counters expire in 2 days; uploads in 1 day. Token digests,
  site records, and slug pointers persist until `DELETE`. Published sites
  are public by contract — the API refuses to be a private store.
- **Cost posture**: free at launch; quotas bound provider spend. Reads are
  served from R2 through a CDN rewrite — zero compute per read.

## Per-platform readiness

- **Muse / Instinct-class / Grok-style**: the REST + OpenAPI surface is live
  and verified; an MCP adapter (`wordcell.publish_site`,
  `wordcell.list_sites`, `wordcell.unpublish`) is the planned follow-up —
  REST is sufficient for platforms that consume OpenAPI or raw HTTP.
- **Direct HTTP**: ready now.

## Not yet evidenced

- The `{"upload": id}` path is unit-tested and the presigned-PUT machinery is
  live-verified on the worker, but an end-to-end publish *consuming* an
  uploaded binary through `wordcell.io` has not been run.
- Vaults near the intake bounds (256 files / 4 MiB) are enforced by tests but
  not exercised at the limit live.
