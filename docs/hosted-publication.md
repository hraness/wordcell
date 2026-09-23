# Hosted publication operations

Hosted writes use `hraness.wordcell.hosted-operation.v1`. A publication or
deletion names the revision it expects to replace. Concurrent writers cannot
both replace that revision. Keep the operation ID and exact request until its
outcome is known.

The static output still follows `hraness.wordcell.site.v1`. This operation
contract covers the hosted API, its receipts, and recovery after an interrupted
request.

## Read before writing

Call `GET /api/v1/sites/<slug>` with the namespace's Bearer token. A live site
returns `site.revision`. A `404` response includes `revision: 0` for a slug that
has never been created, or the retained revision of a deleted site. Authentication
and storage failures do not establish that a slug is absent.

PUT keeps the existing files and projection options and requires this member:

```json
{
  "operation": {
    "contract": "hraness.wordcell.hosted-operation.v1",
    "id": "32d708ac-782d-4ca0-8c34-3e89ad0ed02a",
    "expectedRevision": 0
  },
  "files": { "index.md": "# Handbook\n" }
}
```

DELETE accepts a JSON body containing `operation` with the same shape. Use a
new lowercase UUID for each new operation. `expectedRevision` is a safe integer
from zero through `Number.MAX_SAFE_INTEGER - 1`.

Every committed operation advances the revision by one, including a new
operation whose projected bytes match the current site. Repeating the same
operation ID and request returns its original receipt without advancing the
revision. JSON object key order does not change request identity; changing a
value, expected revision, method, or projection option does.

## Interpret the result

A successful PUT returns:

```json
{
  "ok": true,
  "contract": "hraness.wordcell.hosted-operation.v1",
  "operation": {
    "contract": "hraness.wordcell.hosted-operation.v1",
    "id": "32d708ac-782d-4ca0-8c34-3e89ad0ed02a",
    "expectedRevision": 0,
    "kind": "publish",
    "requestDigest": "<64 lowercase hexadecimal characters>",
    "revision": 1,
    "status": "committed"
  },
  "idempotent": false,
  "site": {
    "slug": "handbook",
    "key8": "abcd1234",
    "url": "https://wordcell.io/p/abcd1234/handbook/",
    "digest": "<artifact digest>",
    "sourceDigest": "sha256:<source digest>",
    "revision": 1,
    "notes": 1,
    "files": 12,
    "bytes": 4096,
    "skippedAssets": 0,
    "createdAt": "2026-09-23T00:00:00.000Z",
    "updatedAt": "2026-09-23T00:00:00.000Z"
  }
}
```

`site.title` may also be present. DELETE returns `deleted: "<slug>"` and
`revision` in place of `site`; its operation kind is `delete`.

| Result | Meaning |
| --- | --- |
| `201` | A new site was committed and acknowledged directly. |
| `200` | A write was committed, an exact receipt was recovered, or a read completed. |
| `409 REVISION_CONFLICT` | The expected revision is stale. Inspect the current site before preparing a new operation. |
| `409 OPERATION_ID_REUSED` | This ID already names a different request. Preserve the original operation when reconciling it. |
| `428 OPERATION_REQUIRED` | The versioned operation member is missing or malformed. No publication write was admitted. |
| `502 OPERATION_UNCERTAIN` | Storage did not establish the outcome. Resolve the same operation ID. |

Other validation, authentication, projection, and quota errors retain the
normal `{ok:false,error:{code,message,retryable}}` envelope. A timeout or lost
connection is also an uncertain outcome, even if no JSON response arrived.

## Reconcile an interrupted request

Call `GET /api/v1/sites/<slug>?operation=<id>` with the same Bearer token. This
lookup never changes state.

| `operation.status` | Meaning and next action |
| --- | --- |
| `committed` | The response contains the original receipt and site or deletion result. Its revision may have been superseded. Read the current site separately before another write. |
| `pending` | The intent exists and its expected revision is still current. Retry only the exact request and ID. A concurrent execution may still be running. |
| `conflict` | The intent did not commit before another revision replaced its expected state. Inspect the current site and prepare a new operation if needed. |
| `unknown` | No intent is visible for this ID. This is a point-in-time observation; an earlier request could still be arriving. Retrying the exact request and ID remains safe. |

Pending and conflict responses include the intent's `contract`, `id`, `kind`,
`requestDigest`, `expectedRevision`, and the top-level `currentRevision`.
Unknown responses contain the contract and `{id,status:"unknown"}`. Storage
or authorization failures are errors, never an unknown-operation result.

The server freezes a prepared result after all artifact objects are durable.
An exact retry uses that result without projecting or uploading again. Assets
uploaded through a presigned URL are write-once; a second PUT to the same
upload returns `412`. Upload expiry can prevent an unprepared request from
being resumed, but cannot change a previously prepared or committed result.

## Storage and compatibility

The API and public Worker read one authoritative site head. Its conditional
replacement changes the public artifact, revision, and operation receipt
together. Before replacing a head, the next writer preserves its receipt in
an immutable object. A committed operation is therefore recoverable from the
current head or its retained receipt, including after later publications.

This protocol uses R2's documented conditional PUT and strong read-after-write
consistency. It does not require a transaction across objects. The signed proxy
binds the target, expiry, byte cap, condition, and payload digest. [R2 Workers
API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/).

Signed object reads carry R2's exact strong identity in `x-object-etag`.
Conditional writes use this header, never the ordinary HTTP `ETag`, which an
intermediary may [weaken or remove when compressing a response](https://developers.cloudflare.com/cache/reference/etag-headers/). Missing or
malformed object identities fail closed; the API does not strip `W/` or infer an
identity from response bytes. Deploy this Worker header before its API consumer.

Existing v1 site records remain readable and migrate on their first conditional
write. The Worker uses an old slug pointer only when no site record exists. A
v2 tombstone prevents pointer fallback after deletion. Public responses may
remain cached for up to 60 seconds.

New tokens atomically reserve their short namespace. Operation journals and
v2 site ownership bind the full token digest. Legacy tokens are admitted only
when storage establishes one token for their namespace; ambiguous historical
collisions fail closed.

Deletion retains the site tombstone and operation receipts. Publication and
deletion never sweep shared artifact prefixes. This preserves bytes still
referenced by another slug or a concurrent request. Artifact reclamation
requires a separate reference-aware retention policy. The current bound is
50 reserved slugs per namespace, including deleted slugs and interrupted
operations. A conditional namespace reservation enforces this bound across
concurrent writers to different slugs. A deleted slug can
be reused by naming its tombstone revision. Daily quotas remain best-effort
abuse limits.

Deploy the Worker before the API. The Worker rejects unconditional writes to
site heads and immutable journals, and rejects artifact-prefix deletion.
Old API writers consequently fail closed during the transition. Do not roll
back to a Worker that permits unconditional head writes after v2 heads exist.
Retain heads, namespace ownership and capacity reservations, operation journals, and referenced
artifact prefixes in bucket lifecycle rules.

MCP exposes the same contract through `get_site`, `publish_site`, and
`delete_site`. `get_site` accepts an optional operation ID for reconciliation.
`GET /api/v1/openapi.json` describes the REST request shapes.
