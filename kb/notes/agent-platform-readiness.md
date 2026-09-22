---
title: Agent platform readiness
type: synthesis
tags:
  - agents
  - connectors
  - credits
  - readiness
repository_scopes:
  - peopleblade
  - wordcell
  - soulscrape
  - slopcamera-api
  - credits
  - ghostget
  - soundfish
---

# Agent platform readiness

As of 2026-09-22 the Hraness products expose agent surfaces on their real domains, share one billing protocol (Hraness Credits, `hraness-credits-protocol-v1`), and store only SHA-256 digests of bearer material. The portfolio rule that emerged: **local-first authority, hosted surfaces only where the data class allows them** — public-by-contract artifacts (wordcell sites, soulscrape person indexes) get self-serve capability tokens, private-by-contract data (peopleblade contacts) gets owner-approved device authorization, and provider-backed compute gets Credits holds regardless of surface.

## Per-product state

### Wordcell — hosted publication, fully verified

- Surface: `PUT /api/v1/sites/{slug}` plus tokens/uploads/sites/OpenAPI and a stateless MCP adapter (`POST /api/v1/mcp`) that delegates to the same route handlers. Tools: `create_token`, `publish_site`, `list_sites`, `delete_site`.
- Onboarding: self-serve `wc_pub_` capability tokens; server stores only the digest; first 8 digest hex chars own the slug namespace.
- Storage: one R2 bucket behind the `wordcell-sites` worker; digest-addressed immutable artifacts; no database.
- Live evidence (wordcell.io): token mint → publish → public read → idempotent republish → revision bump with old artifact swept → delete → 404. Upload-consuming publish verified byte-identical through worker-direct and CDN paths via MCP. Request bounds exercised live: 256-file/~3.9MiB publish accepted, 257 files and a >4MiB single file both reject `BAD_FILES`. `docs/platform-submission.md` carries the pack.
- Known bound: `/p/` responses are edge-cached `max-age=60` — deletes and republishes propagate within 60s (documented, deliberate cheap-read mechanism).

### PeopleBlade — owner-authorized connector surface

- Surface: `/api/v1` contacts list, CSV export, enrich preview/start/jobs/runs, health, OpenAPI 3.1 (9 paths). Local CLI + Agent Skill remain the primary agent path.
- Onboarding: same ergonomics as the CLI — `POST /api/cli/device/start` issues a code, the owner approves the named device at `/activate`, the connector polls `/api/cli/device/status`, then presents `Authorization: Bearer`. Revocation is enforced on every bearer lookup.
- Billing: connector enrichment rides the existing `enrich_contact` Credits path — account-scoped preview, holds, settlement/release, `credits_required` 402 with top-up link. No parallel billing.
- Boundary preserved: the connector reads only the owner's synced cloud projection. Notes, message bodies, archives, raw source records, and local paths never sync and never appear in responses. This is not a general public contact API.
- Live evidence: health/OpenAPI/anonymous-401/device-code issuance verified on peopleblade.com. 178 cloud-database tests + route-level lifecycle tests + full release gate green. `docs/platform-submission.md` carries the pack.
- Closed 2026-09-22: the owner completed Suite sign-in and approved a connector device at `/activate`, and its bearer read the synced projection live. A paid Credits claim (`cr_dev_` subject) drove funded enrichment: preview → confirm → hold → real exa `search_people` spend → **release on no-yield** across 16 runs; wallet verified unchanged. Suite-auth itself needed a production fix first — the v0.5.2 relying party hard-pinned catalog `cclrte-suite-v3` and rejected the authority's `hraness-suite-v4` claims as `OIDC_TOKEN_INVALID` on every callback; PR #183 upgraded the pin to v0.9.14 (parses revisions v1–v4).
- Remaining live gap: a *settle*-emitting run — a contact whose public evidence binds and promotes fields. Release and settle share `settleTrackedEnrichmentHold`; the settle branch is test-covered, awaiting a promotable result in production traffic.

### Soulscrape — publishing surface, evidence backfilled

- Surface: `PUT /api/v1/people` publish (Accounts OIDC + device flow), `/connect` device handshake, public profile/index reads.
- Billing: publishing is free; no Credits meter on this surface.
- Live evidence: `/connect` 200, anonymous publish 401, profile and index reads verified on soulscrape.com. `docs/platform-submission.md` backfilled in PR #78.
- Paid generation (image render) is a separate slopcamera-shaped metered path, not this surface.

### Slopcamera — metered generation, one live gap

- Surface: `/v1` REST + MCP (17 tools) + OpenAPI on slopcamera-api.
- Onboarding: `cr_dev_`/`cr_prod_` Credits subject tokens; 401 responses carry the signup/claim instructions; 402 carries `topup.url`.
- Billing: ceiling-priced hold before any provider call, settle on success, release on failure — unit-tested; service never sees margin.
- Live evidence: **fully verified** — health, tools/list, MCP round-trip, render, upload, artifact bytes, a settled paid generation (`slopcamera.image.generate` via `vercel-ai-gateway`, wallet 1200→1170 credits, 1.3MB PNG served byte-identical under its pinned sha256), release-on-failure (provider-credential failure released the hold; balance untouched), and a presigned-PUT→`files.<name>.upload` tool call.
- Production fix shipped this pass (PR #190 `9b050c5`): deployed functions never saw `VERCEL_OIDC_TOKEN` — Vercel delivers the project OIDC token as the `x-vercel-oidc-token` request header, not in `process.env`; the adapter now forwards it into the per-call tool environment.

### Ghostget — local-first capability layer, platform guide added

- Model: bring-your-own-agent CLI/SDK. No hosted API, MCP server, or OAuth surface by design; `llms.txt` says so plainly. A platform integrates by giving its agent `ghostget` on an operator-controlled machine.
- Discovery: `ghostget contracts catalog|check|invoke --json` emits `ghostget.contract-catalog.v1` / `contract-check.v1` documents with JSON Schemas, closed vocabularies, and retry dispositions — a platform can enumerate and plan-check without provider contact.
- Onboarding: release-pinned tarball install + release-matched Agent Skill; `adapter sync-bundled`, `capabilities`, `doctor --json` gate each workflow.
- Gap closed 2026-09-22: `docs/agent-platforms.md` (PR #317) states the integrator-facing contract — install sequence, trust boundary, custody rules — previously scattered across `llms.txt`, `docs/contracts.md`, and the skill.
- No Credits meter: operations are local-first reads and owner-authorized mutations; no provider-backed spend exists to bill.

### Soundfish — private-alpha transcription billed through Credits

- Surface: `/api/v1` uploads + jobs + capabilities on sound.fish, backed by the Klangio provider on Convex. The publishing API (`/api/audio/v1`, `sfk_` tokens) is a separate, unbilled surface.
- Onboarding: `cr_dev_` subject token is the self-serve credential; each wallet owns the tenant derived from its token digest, so wallets cannot see each other's uploads or jobs. The internal deployment token keeps an unbilled path.
- Billing: one `transcription_job` unit held before job creation (hold key derived from the request's idempotency digest), settled on `succeeded`, released on every other terminal outcome; `action_required` keeps the hold until the provider resolves; a 404 at the service records `lapsed` instead of retrying forever. Tombstones with open holds are never forgotten. Public view is bounded to `billing.status` (`held|uncertain|settled|released`); 402 carries `creditsRequired` with a bound `topup.url`; 503 `billing_unavailable` when unconfigured.
- Evidence: `convex/billing.test.ts` — 11 tests covering wallet rejection, tenant isolation, replay safety, settle/release/lapsed, tombstone retention. Full gate green (177 Convex tests, 54 cost surfaces, typecheck/lint/build).
- Ops: live `soundfish` product config r1 (`transcription_job` unit-priced), live Stripe catalog synced (`prod_VIwAbFnXlnT3JI` + 4 prices), fresh backend key installed as `SOUNDFISH_CREDITS_PRODUCT_KEY` on `prod:steady-jellyfish-814`; the orphaned Sept-17 key was revoked.
- Landed as PR #133; live end-to-end (`cr_dev_` → upload → job → settle) awaits a funded test wallet post-deploy.

## Cross-cutting observations

Three auth patterns coexist deliberately: Accounts OIDC device flow (soulscrape, peopleblade), Credits subject tokens (slopcamera), capability tokens (wordcell). The next product should choose by data class rather than habit — capability tokens for public-by-contract artifacts, owner-approved device flow for private projections, Credits subjects when billing is the surface.

The reusable connector recipe proven by peopleblade + wordcell: keep one validation/auth/quota path per operation and let every adapter (REST, MCP) dispatch through the real route handlers; account-scope reads where the connector device differs from the syncing device; digest-verify submitted inputs or rebuild them server-side; bound every request byte, list size, and string length.

## Evidence index

| Product | Implementation | Evidence pack | Deploy |
|---|---|---|---|
| wordcell | PR #92 `d30a575`, closeout #93 `51d52fe`, MCP #94 `416af5e`, evidence #95 `f14d05d` | `docs/platform-submission.md` | wordcell.io live |
| peopleblade | PR #179 `bf177f0`, evidence #180 `861a91a`, /activate chrome #181, anchor #182, suite-accounts v0.9.14 #183, live evidence #184 | `docs/platform-submission.md` | peopleblade.com live |
| soulscrape | evidence PR #78 `f824597` | `docs/platform-submission.md` | soulscrape.com live |
| slopcamera | OIDC fix #190 `9b050c5`, evidence #191 | `docs/platform-submission.md` | api.slopcamera.com live |
| credits | checkout latency fixes #6 `efbc02e`, #7 (pre-created sessions), runbook note #8 | — | credits.hraness.com live (Stripe live mode) |
| ghostget | platform guide PR #317 | `docs/agent-platforms.md` + `docs/contracts.md` | ghostget.com live (local-first; no hosted surface) |
| soundfish | Credits billing PR #133 | capabilities doc + OpenAPI + `/docs/audio` jobs section | sound.fish live |

Credits checkout latency is closed: PR #7 stores the Checkout URL on the claim and warms session creation at mint plus on pay-page render, so the click path is one query with no provider calls (live-verified: warmed pack ~0.5-1s vs ~3s full-create). The peopleblade owner-approved connector session and funded-enrichment release path are now live-verified; the only remaining gap there is a settle-emitting run, which depends on a contact whose public evidence binds.

The Credits deployment runs Stripe in **live mode** — cutover completed 2026-09-22. The CLI's stored `rk_live` initially lacked `checkout_session_write`/`webhook_write`; the owner granted them on the existing key and the raw value was recovered by base64-decoding the CLI's `go-keyring-base64:` keychain payload (runbook now documents this; `docs/setup.md`, PR #8). Live state: `STRIPE_RUNTIME_MODE=live`, `CREDITS_SCOPE=credits:production-live`, `STRIPE_MANAGED_PAYMENTS=on`, webhook `we_1UIJKnIoq9rggsbonNQ8RiRa` (dahlia, five events, enabled). Live catalog synced for all three products — peopleblade `prod_VIvIPVD1AZ94uU`, slopcamera `prod_VIvIgNVIGeFNZT`, soundfish `prod_VIwAbFnXlnT3JI`, four prices each, revision 1. Verified end-to-end: claim mint → pay page 307 → `cs_live_a14g908w…` (`livemode`, managed payments on, correct metadata). The one unverified link is webhook→wallet grant, which fires on the first real payment; the path is identical to test mode's verified receipt→lease→fulfill chain.
