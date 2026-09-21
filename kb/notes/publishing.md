---
title: Publishing
type: concept
tags:
  - publishing
---

# Publishing

Wordcell treats publication as projection, not transport: vault Markdown stays
the only authority, and a published artifact is a derived, self-contained
`hraness.wordcell.site.v1` file set that can be regenerated from source at any
time. [[plans/static-site-publication|Static site publication]] established the
contract — prerendered pages, selection-scoped graph, browser-local search,
content-addressed attachments, and a bundled reader — deliberately hostable
from object storage, a CDN, or `file://` with no server.

[[plans/hosted-site-publication|Hosted site publication]] extends the same
projection to agents that cannot run the CLI: `PUT /api/v1/sites/{slug}` on
wordcell.io runs the projection server-side over a bounded posted vault,
stores the artifact by content digest in R2, and serves it at
`/p/<key8>/<slug>/`. Because the artifact format is shared, local and hosted
publication differ only in who runs the projection. The hosted path composes
`scanVault` → `validateMarkdownAttachments` → `projectVault` through an
injected `PublishIo` rather than calling `publishVault`, whose package-root
lookup is Bun-only — that seam is what makes the same pipeline runnable under
a Node serverless function.

The wider rename record, [[plans/wordcell-rename-and-oh-seam|Wordcell rename
and the Oh seam]], set the distribution posture this fits: the package
publishes as ordinary software through canonical GitHub Releases and npm
trusted publishing, and hosted surfaces remain product-level concerns layered
over the same contracts.
