# Security

Report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/hraness/wordcell/security/advisories/new). Do not include sensitive details, credentials, private capture content, or raw HAR files in a public issue.

Security fixes target the latest version tag. Maintainers will coordinate disclosure and publish a new immutable release when a fix is ready.

## Local data and optional network use

Notes are ordinary local Markdown. Exact search, graph inspection, metadata
queries, and static publication need no account, model, or network request.
Optional QMD semantic search downloads its model on first use and then runs
locally. Capturing a URL contacts the selected source and its allowed resources.

`--rerank typesafe` explicitly enables hosted Jev reranking. It sends the query
and bounded candidate titles, vault-relative paths, and snippets to TypeSafe.
Leave that flag unset to keep search local. A coding agent that reads returned
notes also follows its own provider settings; local storage does not make a
hosted agent local.

## Static publication

Treat the generated site as public when you upload it to a public host.
`publish: false` excludes a note's page, search record, and graph membership,
but publication does not redact mentions copied into selected prose or
referenced attachments. `--noindex` does not provide access control.

Preview the selection with `--dry-run --json`, review the selected content,
and use a dedicated output directory. `--force` replaces that directory.
Wordcell refuses output paths that overlap the source vault, including
resolved symlink aliases. Avoid concurrent filesystem changes during a build.
The reader escapes authored HTML and restricts active content; this is not
a content-classification or secret-scanning service.

## Capture security model

hraness/wordcell treats every URL, redirect, response, browser page, cookie record, process output, and filesystem path as untrusted input.

- Controlled HTTP, structured-data, asset, owned-browser, and media lanes deny private, reserved, and locally assigned network addresses by default. DNS is validated and the accepted address is pinned for the request.
- Owned browser and media subprocesses use a filtering loopback proxy with bounded time, bytes, output, and cleanup.
- Cookie stores are read only when the user selects one. Matching cookies stay in memory, except for a short-lived host-pinned mode-`0600` yt-dlp jar.
- Markdown, manifests, terminal output, URLs, and optional source evidence pass through credential and active-content sanitizers before persistence.
- Capture bundles stage in an owned directory and install atomically. Replacement requires `--force` and a compatible clip manifest.

Attached live or CDP browser sessions keep their existing network stack. `wordcell clip current` reads the active tab without navigation or interaction and leaves the browser open. A URL-based attached capture can navigate and scroll within the configured bounds, taking bounded observations as content is rendered.

Screenshots are not structurally sanitized. They can contain private text, account names, notifications, or other personal data as pixels. Treat every screenshot and authenticated capture as sensitive until reviewed.

## Responsible use

Use capture only for public content or content you are entitled and permitted to automate. Do not use hraness/wordcell to bypass login, paywall, CAPTCHA, rate-limit, DRM, audience, or platform-policy controls, or to access another person's private data.

When reporting a vulnerability, include the affected version, operating system, command shape with secrets replaced, observed result, and a minimal synthetic reproduction when possible.
