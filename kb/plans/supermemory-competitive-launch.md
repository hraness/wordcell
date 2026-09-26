---
title: Supermemory-competitive launch
description: Ship the feature, documentation, and site surface that makes Wordcell a drop-in supermemory replacement for agent memory users — local MCP, supermemory import, migration and sync docs, session-memory and profile conventions, cited benchmark evidence, comparison pages, a launch post, and setup deep links.
type: plan
area: launch
status: in-progress
tags:
  - launch
  - competitive
  - mcp
  - migration
  - benchmarks
  - marketing
repository_scopes:
  - src
  - docs
  - skills/wordcell
  - site
  - README.md
  - CHANGELOG.md
---

# Supermemory-competitive launch

## Overview

Wordcell launches publicly as the free, local, open-source answer to
supermemory for agents that keep memory in files. The philosophy line is
*memory for your agents should be free, open-source, and superb*; it is a
stance, not a measured claim, and the launch never converts it into one. The
launch converts shipped capability and cited evidence into a credible switch:
a local MCP server for agent hosts, a `wordcell import supermemory` path for
existing users, honest migration and sync documentation, agent-followable
session-memory and profile workflows, a `/benchmarks` evidence page that
cites exact artifacts with their limits, comparison and migration landing
pages, a launch post on the existing blog, and one-click agent setup links.

The competitive frame is deliberately scoped. Wordcell is a drop-in
replacement for agents and people who keep memory alongside their work — the
segment supermemory reaches through plugins, MCP, and SMFS. It is not a
hosted multi-tenant memory API for SaaS backends; the migration guide says
who should stay on supermemory and why. That honesty is the credibility the
launch trades on.

## Owner decisions (2026-09-26)

The owner answered "ok let's do it" to a review summary that recommended
the first three items below. Workers do not reopen them.

- **Oh figures travel as the embedded kernel's standalone result** (former
  Open question 1, option A). `/benchmarks` includes the Oh section with the
  attribution sentence and the artifact's limits verbatim.
- **Stdin input ships as `note create --body-file -`**, not `--body -`.
- **A Wordcell-native matched benchmark run is out of scope.** It is a
  separate plan if the owner wants it later.

The remaining defaults follow repository conventions rather than owner
answers. Workers apply them and escalate only if one proves wrong.

- **The MCP server ships write tools**, with `--read-only` as the opt-out,
  because supermemory's MCP writes memories and a read-only socket is not a
  drop-in replacement.
- **Canonical long-form content lives in `docs/`.** The site renders every
  cataloged `docs/*.md` at `/docs/<slug>`; `/compare/supermemory` and
  `/migrate/supermemory` are short landing pages that link to those docs.
- **Changelog entries go under `## Unreleased`**, the convention feature PRs
  already follow (for example #100). The version heading, version bump, tag,
  and release remain owner acts.

## Review findings folded into this plan

The first draft was reviewed against the repository, the `hraness/oh`
benchmark corpus, and supermemory's public docs on 2026-09-26, then
re-checked against `origin/main` at `ddd9f49` the same day, after 36 commits
had landed since the first review. These findings changed the plan and are
recorded so workers do not re-derive them.

1. **The LoCoMo result belongs to Oh, not Wordcell.** The strongest citable
   figure is Oh semantic retrieval at 84.4% (GPT-5 mini reader) and 81.0%
   (GPT-5 nano) on 1,540 sealed LoCoMo questions, against a BM25 window
   control at 81.6% and 78.1% with the same readers, judge, and 24 KB
   context budget. Source: `benchmarks/results/memory-evolution-locomo-sealed-1540-v1.json`
   in `hraness/oh`, added in commit `3add170ca8d931603e68dee07f3cbdcf9c08c706`
   (67,362 bytes, git blob `e335423e310a59a993ec3babadfa62292c80e0aa`),
   documented in `benchmarks/EVOLUTION_RELEASE_RESULTS.md` at
   `9edd9f1bc18d0f4c15b040add10caad26e782275`. Wordcell embeds Oh as a
   *graph authority* only; its retrieval is exact match plus optional QMD
   hybrid search. No Wordcell command ran in that study. `docs/evidence.md`
   on `main` already says so: Oh's conversation-memory scores "do not
   transfer to a Wordcell vault merely because it uses the same library."
   The figure may be published only as the Oh kernel's standalone result,
   with that sentence beside it.
2. **The artifact's own limits forbid "SOTA".** Its `qualification` says the
   results "do not establish fresh confirmation, statistical superiority or
   benchmark saturation" and are "not a pinned-snapshot reproduction of any
   leaderboard harness". All ten conversations were previously exposed; the
   run is one repeat, descriptive, with no confidence interval, and the JSON
   records no run date, hardware, or source commit. `hraness/oh`'s README
   states Oh "has not established superiority over Letta, Supermemory, or
   other memory frameworks". Its only matched comparison against
   Supermemory, the LongMemEval-S framework pilot
   (`benchmarks/results/memory-framework-pilot-v1.json`, 29,285 bytes, git
   blob `49ca4a9a97125e824b66d524f757aa931bc65483` at `9edd9f1`), reports
   Supermemory 75.00%, Oh 71.67%, BM25 68.33%, with an Oh-minus-Supermemory
   interval of −13.33 to +6.67 points that crosses zero.
3. **Wordcell's own evidence is narrow and already on the site.**
   `docs/evidence.md` measures the first context handoff (12,126 bytes
   instead of 60,584 for the same matching notes in full) and states "No
   competitive quality or latency result is claimed here."
   `docs/evaluations/wordcell-scifact-20260919.json` measures exact search
   against optional hosted Jev reranking on BEIR SciFact (relevant result at
   rank 1). The home page's `#evidence` section renders the SciFact study
   through `site/wordcell/benchmark-evidence.ts`, which derives every value
   from the JSON rather than from typed constants.
4. **The site already enforces the claims rule in code.**
   `site/wordcell/benchmark-comparison.tsx` exports the `BenchmarkStudy`
   type and a `BenchmarkComparison` chart that throws unless
   `comparability` is `"same-run"`. Cross-protocol figures belong in a
   sourced table, never a shared chart. Phase 5 reuses this type and
   component rather than inventing a parallel data model.
5. **Command registration lives in `src/cli-program.ts`.** `src/cli.ts` is
   a thin entry that prints a product-support invitation to stdout after
   successful commands (`isUsefulSupportResult`, then
   `showProductSupportInvitation`). Phase 1 must suppress it for `mcp` or it
   corrupts the protocol stream.
6. **Authoring primitives exist.** `note create` has `--body` and
   `--body-file` (bounded at 16 MiB through `readBoundedUtf8`); `relation
   add` and `relation remove` take `--expected-revision`; the SDK exports
   `updateNoteBody`, which replaces a note's prose at a required content
   revision while preserving frontmatter bytes and relations. Note types are
   free-form canonical kebab-case, so `session` and `profile` need no
   whitelist change.
7. **Site structure on `main` (checked at `ddd9f49`).** Routes: `/`,
   `/developers`, `/docs`, `/docs/[slug]`, `/blog`, `/blog/[slug]`,
   `/blog/feed.xml`, and the hosted API. Docs are catalog-driven:
   `site/scripts/sync-docs.ts` fails when a `docs/*.md` file is missing
   from `site/app/docs/catalog.ts` or a catalog entry has no file, renders
   each entry into the committed `site/app/docs/docs.generated.ts`, and
   fails on links to uncataloged pages or missing fragments. The blog is a
   registry: `site/app/blog/articles.ts` holds one record per post with
   sources pinned to a commit and a design-kit `ArticleAdmission` review
   record; bodies are `site/content/blog/<slug>.md`, rendered by
   `site/scripts/sync-blog.ts`, which binds only `{{release.version}}` and
   rejects unbound placeholders, a Markdown h1, and em dashes.
8. **Site discovery files are static and test-pinned.**
   `site/public/sitemap.xml` and `site/public/llms.txt` are hand-maintained.
   `site/tests/source.test.ts` asserts every catalog slug appears in the
   sitemap; `site/tests/blog.test.tsx` asserts indexable posts appear in the
   sitemap (with `lastmod` from the record), feed, and `llms.txt`, and
   currently pins the post count ("one indexable introduction and one
   quarantined integration post"). The site `test` script in
   `site/package.json` lists test files explicitly, so a new test file runs
   only after it is added there.
9. **The README reaches the site through the published release.**
   `sync-readme` and `sync-docs` pass README and docs through
   `publishedReadme`, which rewrites install coordinates to
   `site/published-release.json` (0.22.5). README edits regenerate
   `site/app/readme.generated.ts` and the `overview` entry of
   `docs.generated.ts`; CI fails if `readme.generated.ts`,
   `lib/hosted/reader.generated.ts`, or `site/bun.lock` differ after the site
   check, so regenerated modules are committed, never hand-edited.
10. **Canonical product messaging is owned elsewhere.** PR #129 carried the
    portfolio's canonical messaging into the hero, `site-description.ts`,
    the opengraph image, and the `llms.txt` blockquote. Launch work adds
    sections and links; it does not rewrite the hero heading, hero summary,
    `siteDescription`, or the `llms.txt` blockquote.
11. **CI and merge rules (checked 2026-09-26).** The `Required` job
    aggregates the root `bun run check` job and the site job; recent runs
    take about 3.5 minutes. Rulesets on `main`: pull request required with
    zero approvals, `Required` status check, non-strict (a branch need not
    be current with `main`), no deletion, no non-fast-forward, and
    `require_extra_approval_for_unattributed_changes: true`. Squash, rebase,
    and auto-merge are allowed; merge commits are not; head branches delete
    on merge.
12. **Supermemory export shape, checked 2026-09-26.** `POST
    https://api.supermemory.ai/v3/documents/list` (Bearer auth) returns
    `{ memories: [...], pagination: { currentPage, limit, totalItems,
    totalPages } }`. Items carry `id` (22 chars), `customId`, `connectionId`,
    `title`, `summary`, `content` (only with `includeContent: true`), `type`
    (`text`, `pdf`, `tweet`, `google_doc`, `google_slide`, `google_sheet`,
    `image`, `video`, `audio`, `notion_doc`, `webpage`, `onedrive`,
    `github_markdown`, `granola`), `status` (`queued` … `done`, `failed`),
    `containerTags` (documented as deprecated), `metadata` (flat only),
    `filepath`, `url`, `createdAt`, `updatedAt`. The memory-entry listing
    endpoint and the MCP setup page returned 404; Phases 2 and 3 verify
    those against the live docs and record the checked-on date.
13. **Supermemory pricing, checked 2026-09-26.** Free $0 with $5 monthly
    credits; Pro $19 with $20 credits and 3 seats; Max $100 with $130
    credits and the Gmail connector; Scale $399 with $600 credits, S3 and
    crawler connectors, SOC 2, HIPAA BAA, self-hosted option; Enterprise by
    contact. Usage is metered against credits (memory $5–$10 per 1M SM
    tokens, search $5 per 1M queries, operations $100 per 1M). Site copy
    re-checks these on the day it is written and uses exact figures with the
    checked-on date, never a rounded range.

## Constraints

Repository-wide facts every phase needs. Do not infer alternatives.

- Use Bun 1.3.14 for all repository commands. The site has its own
  `bun run check` under `site/`; run it for any `site/` or `docs/` change,
  and for README changes (they regenerate site modules).
- Deliver changes to `main` through a current-head pull request per phase.
  Keep the `Required` job green, resolve every review thread, never
  force-push. Tag creation, version bumps, and releases are owner-only acts
  and are out of scope for every phase.
- Convergence surfaces have one owner at a time: `src/cli-program.ts`,
  `src/cli.ts`, `package.json`, `bun.lock`, committed `dist/`,
  `skills/wordcell/`, `site/app/docs/catalog.ts`,
  `site/app/docs/docs.generated.ts`, `site/app/readme.generated.ts`,
  `site/public/sitemap.xml`, `site/public/llms.txt`, and `CHANGELOG.md`. The
  phase table serializes phases that share one. Rebuild committed `dist/`
  through `bun run build` before the final gate — `bun run check` must leave
  `dist/` and `bun.lock` unchanged.
- New public CLI commands appear in the `src/cli-program.ts` usage text,
  `docs/reference.md`, and the README command table, or
  `scripts/check-installed-command-docs.ts` fails; read that script before
  adding a command. Read the `files` list and `build` script in
  `package.json` before adding `src/` modules; modules imported from
  existing entrypoints are bundled by `--splitting`, new entrypoints are
  not.
- Test new commands with `bun src/cli.ts <command>` or the rebuilt
  `dist/cli.js`, never the globally installed `wordcell`, which predates this
  work.
- `skills/wordcell/` must stay byte-identical between the repository and the
  packed package. `wordcell` is the only public skill entrypoint.
- Prefer no new runtime dependencies. The hosted MCP adapter in
  `site/app/api/v1/mcp/route.ts` implements JSON-RPC by hand; the local
  server follows that pattern over stdio. If a worker judges a dependency
  unavoidable, it stops and escalates.
- Claims discipline: every benchmark figure, latency, and comparative claim
  cites a measured run, the artifact path, a pinned source commit, the
  corpus identity, the reader and judge, and the artifact's stated limits.
  Follow `STYLE.md` for public prose (site, README, docs, blog) and
  `WRITING.md` for internal prose (this plan, commits, PRs). Comparisons
  describe documented competitor behavior with a checked-on date and link
  primary sources; state when the competitor is the better choice.
  `CLONEMEM_TRANSFER_V1` is a null result and is never cited as a win. The
  words "SOTA" and "state of the art" do not appear as claims about
  Wordcell or Oh anywhere in shipped prose. No invented or placeholder
  figure ships; a section without a canonical artifact is omitted, not
  stubbed.
- `site/published-release.json` owns the current release version (0.22.5).
  Pages that describe unreleased commands carry an explicit "available from
  source until the next release" label until a release admits them.
- Keep Markdown authoritative. New import and write paths produce ordinary
  notes with stable frontmatter; they never write inferred, reciprocal, or
  similarity-derived relationships, and they fail closed on malformed input.
- Code phases add a short prose entry under `## Unreleased` at the top of
  `CHANGELOG.md` (create the heading if absent), in the existing style.
- Only Phase 7 edits this plan file. Other phases report their log entry in
  the PR body and their worker result; Phase 7 transcribes them.
- Editing `kb/` notes requires `bun src/cli.ts percolate <note> --root kb`,
  then `bun src/cli.ts refresh --root kb` and `bun src/cli.ts check --root kb`
  from the repository root.

## Implementation setup

This section is the orchestrator's runbook. A dynamic workflow (or the
`phase-orchestrator` skill in `.agents/skills/`) executes it; each item is a
precondition workers may assume.

### Workspace

0. Land this plan on `main` first through a small `kb:` PR, so every phase
   worktree branched from `origin/main` carries it.
1. The main checkout at `/Users/benguo/Documents/wordcell` is shared with
   other sessions and has local history that differs from `origin/main`.
   Never edit, reset, or switch it. Every phase runs in its own worktree
   under `/Users/benguo/Documents/wordcell-launch-20260926/`:

   ```sh
   git -C /Users/benguo/Documents/wordcell fetch origin
   git -C /Users/benguo/Documents/wordcell worktree add \
     /Users/benguo/Documents/wordcell-launch-20260926/<phase-slug> \
     -b launch/<phase-slug>-20260926 origin/main
   ```

2. Shell setup in every worker: `export PATH=$HOME/.bun/bin:/opt/homebrew/bin:$PATH`.
   `bun --version` must print `1.3.14`. Run `bun install --frozen-lockfile
   --ignore-scripts` at the root and, for any phase that touches `site/`,
   `docs/`, or `README.md`, `cd site && bun install --frozen-lockfile
   --ignore-scripts`. If `git` or `bun install` cannot resolve `github.com`
   while `api.github.com` works, run `/usr/bin/dscacheutil -flushcache` and
   retry. Copy no credentials; nothing in this plan needs one.
3. Before any edit, confirm a clean tree and a passing baseline: `bun run
   check`, plus `cd site && bun run check` for site-touching phases. If the
   baseline fails, stop and report rather than fix unrelated breakage.
4. Phase order: 1, then 2; after 2 merges, 3 and 4 in parallel; 5 after
   both merge; 6 after 5; 7 last. Phases 3 and 4 edit disjoint files (Phase
   4 touches only `skills/wordcell/`).

### Per-phase worker brief

Every implementation worker loads and follows
`.agents/skills/phase-implementer/SKILL.md` and receives this plan's path,
its phase section, the Constraints section, its worktree path and branch,
the prior phases' results, and these standing rules:

- Edit only inside the phase's Scope; treat Out-of-scope as a hard boundary.
  If a change outside scope is unavoidable, stop and report.
- Read `AGENTS.md`, `WRITING.md`, `STYLE.md` (public prose phases),
  `site/BRIEF.md`, `site/THEME.md`, and `site/AGENTS.md` (site phases; the
  last one requires reading the bundled Next.js guide before writing Next
  code), and the closest `AGENTS.md` under each edited directory.
- Model invalid states out, parse foreign values from `unknown`, pair
  deterministic regressions with property tests for parsing, ordering, path
  confinement, and round trips.
- Never write to `dist/` or a `*.generated.ts` file by hand, never add a
  figure without a source line.
- Leave changes uncommitted, as the implementer skill requires; the ship
  step commits after review.
- Return the skill's six headings (Outcome, Changed files, Behavior or
  findings, Validation, Downstream impact, Blockers and risks). Put the
  changelog entry text (code phases), deviations, and escalations under
  them.

### Review lane

After each implementation returns, an independent worker loads
`.agents/skills/phase-reviewer/SKILL.md` and reviews `git diff origin/main`
plus untracked files in the same worktree against the phase's Acceptance
criteria and the Constraints before reading the implementer's notes. It
patches bounded issues directly, leaves them uncommitted, reruns the phase
Validation, and reports design-level problems without half-fixing them. A
design-level finding goes back to an implementer in the same worktree and
then to a second review, at most twice, before escalation. After Phase 7
merges, one worker following `.agents/skills/phase-final-reviewer/SKILL.md`
reviews the whole delivered surface on `origin/main` against the Overview
and Constraints; its fixes ship as one more PR through the same procedure.

### Ship procedure

1. In the phase worktree, rerun the phase gates on the reviewed tree and
   stage only files inside the phase Scope. Commit with a plain summary line
   and a body ending in the session's commit attribution line.
2. `git fetch origin`. If `origin/main` advanced, `git rebase origin/main`
   (the branch is unpushed, so this rewrites no published history) and
   rerun the phase gates.
3. Confirm `git status --short` is empty and the gates left no `dist/`,
   `bun.lock`, or generated-module drift.
4. `git push -u origin <branch>`, then `gh pr create --base main` with title
   `launch: <phase name>` and a body listing scope, validation output,
   deviations, and the log entry. End the body with the session's PR
   attribution line.
5. `gh pr checks <n> --watch --required`. When `Required` passes, `gh pr
   merge <n> --squash --delete-branch`. If `Required` fails because of the
   diff, fix in the same worktree and push new commits on top; never
   force-push. If merge is refused for a missing approval, stop and
   escalate; do not try to bypass it.
6. Record the PR number and merge SHA, then `git worktree remove` the phase
   worktree.

### Escalations

Stop and surface to the owner, do not decide: a needed runtime dependency;
a `Required` failure not caused by the phase's diff; a merge refused for
approval; a figure whose source artifact cannot be named; a competitor claim
that cannot be verified against a primary source on the day it is written;
any change to canonical product messaging.

## Phases

| ID | Phase | Depends on | Parallelizable with |
| --- | --- | --- | --- |
| 1 | Local MCP server | — | none (owns CLI, `package.json`, `dist/`) |
| 2 | Supermemory import + stdin note body | 1 | none (owns CLI, `package.json`, `dist/`) |
| 3 | Migration, sync, and comparison docs | 2 | 4 |
| 4 | Session-memory and profile skill workflow | 2 | 3 |
| 5 | Site: benchmarks, compare, migrate, home, deep links | 3, 4 | — |
| 6 | Launch post on the blog | 5 | — |
| 7 | README, changelog, docs sweep, plan close-out | 3, 4, 5, 6 | — |

## Phase 1: Local MCP server

- **Status:** Not started
- **Depends on:** none
- **Objective:** Any MCP-compatible agent host can query and write a local
  Wordcell vault over stdio with `wordcell mcp --root <vault>`, giving
  Claude Code, Claude Desktop, Cursor, Codex, and other MCP clients the
  drop-in socket supermemory's hosted MCP provides.
- **Scope:** `src/mcp-server.ts` (transport and dispatch) and
  `src/mcp-tools.ts` (tool catalog, input schemas, handlers), both new;
  `src/cli-program.ts` (usage text, argument parsing, dispatch) and
  `src/cli.ts` or `src/support.ts` (suppress the post-command support
  invitation for `mcp`); colocated `src/mcp-server.test.ts` and
  `src/mcp-tools.test.ts`; `docs/reference.md` (command surface row plus a
  "Local MCP server" section); the README command table row the
  installed-command-docs gate requires, with regenerated site modules;
  `package.json` only if its `files` list or `build` entrypoints require
  it; committed `dist/`; `CHANGELOG.md` `## Unreleased`.
- **Out of scope:** `skills/` changes (Phase 4), site pages, the hosted MCP
  at `site/app/api/v1/mcp/route.ts`, subprocess-backed tools (`clip`,
  `pdf`, `url-metadata`), HTTP transport, authentication, multi-vault
  serving.
- **Approach:**
  - Transport: newline-delimited JSON-RPC 2.0 on stdin/stdout per the MCP
    stdio transport. Read the hosted route first and match its
    `initialize` result shape and capability advertisement.
    `PROTOCOL_VERSION` there is `2025-11-25`; accept a client's requested
    version when it is one the server supports (verify the set against the
    MCP specification and record it), otherwise answer with `2025-11-25`.
    `serverInfo` is `{ name: "hraness-wordcell", version: <package
    version> }`. Include a short `instructions` string in the `initialize`
    result: the vault root, that notes are Markdown files, and to search
    before creating. No JSON-RPC batch support. Handle `initialize`,
    `notifications/initialized`, `ping`, `tools/list`, and `tools/call`;
    answer other requests with `-32601`; ignore unknown notifications;
    answer unparseable frames with `-32700` and a null id; answer
    `tools/call` for an unknown tool with `-32602`. Cap a single line at 1
    MiB and fail that frame closed without killing the server. Process
    requests strictly in order. Exit 0 when stdin closes; exit non-zero
    with one stderr line on an unrecoverable transport error. Only
    protocol frames touch stdout; all diagnostics go to stderr.
  - Startup validation: `--root` must exist and resolve to a directory the
    CLI accepts as a vault; otherwise print one stderr line and exit 2
    before reading stdin. `--repo <repository>` is optional.
  - Tool results: argument validation failures and domain failures
    (unknown note, invalid id, revision conflict) return a result with
    `isError: true` and a plain-text content item, so the model can
    correct itself; protocol failures return JSON-RPC errors. Every tool
    declares an `inputSchema` with `additionalProperties: false` and
    validates arguments from `unknown` before dispatch. Every tool sets
    `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`)
    truthfully. Successful results return one text item holding compact
    JSON and, where the result is structured, the same object as
    `structuredContent`.
  - Tools, snake_case to match the hosted adapter, each dispatching onto
    the existing SDK and session functions rather than re-reading files:
    - `search` (query; mode `exact`, `keyword`, `semantic`, or `hybrid`;
      limit; optional tag, `where`, and scope filters). Keep exact and QMD
      evidence separate as the CLI does. When QMD is unavailable, report
      that in the result rather than failing.
    - `context` (repository path). Listed only when `--repo` was given.
    - `list_notes` (metadata filters, bounded), `get_note` (by id; returns
      frontmatter, body, and the content revision; body capped with a
      `truncated` flag), `backlinks` and `links` (depth and limit caps
      equal to the CLI defaults).
    - Write tools, omitted from `tools/list` under `--read-only`:
      `create_note` (the `note create` authoring path; refuses existing
      ids and ids that resolve outside `--root`), `update_note_body`
      (`updateNoteBody` with a required `expected_revision` from
      `get_note`; conflicts return `isError`), and `add_relation` (the
      `relation add` path with optional `expected_revision`). Never
      construct paths by hand.
    - `check` (read-only vault health summary, bounded) is optional.
  - Freshness: open a fresh read-only session per `tools/call` so edits
    made in an editor or by Git are visible. Measure per-call latency on
    `kb/` and on a generated 4,000-note fixture and record both in the
    PR. Add caching only if a call exceeds 500 ms, and then invalidate on
    every write tool and on a vault-revision change.
  - Result bounds: cap every tool result at the byte bound `search` and
    `context` use today and set `truncated` when the cap applies.
  - Tests: dispatcher tests that feed frames to the handler without a
    subprocess (happy path per tool, malformed JSON, oversized line,
    unknown method, unknown tool, invalid arguments, write refusal outside
    root, overwrite refusal, revision conflict, read-only listing), and
    one subprocess test that spawns `bun src/cli.ts mcp --root <fixture>`
    and drives `initialize`, `tools/list`, `search`, `create_note`,
    `get_note`, and `update_note_body` over real pipes, asserting stdout
    carries only frames, including after exit. Add property tests for
    frame parsing round trips and id confinement.
  - Docs: the reference section documents the command, `--root`, `--repo`,
    `--read-only`, each tool with its fields and caps, the stdout and
    stderr contract, and client configuration for Claude Code, Claude
    Desktop, Cursor, and Codex. Verify each client's syntax against its
    current docs and record the checked-on date in the section.
- **Acceptance criteria:**
  - `bun src/cli.ts mcp --root kb` answers `initialize`, `tools/list`, and
    `tools/call` for each tool over newline-delimited stdio JSON-RPC;
    covered by the dispatcher and subprocess tests.
  - Write tools create and update real Markdown inside the vault root,
    refuse paths outside it, overwrites, and stale revisions, and are
    absent under `--read-only`. Malformed requests return errors, not
    crashes. Nothing but frames reaches stdout.
  - `docs/reference.md` documents the command, each tool, and the four
    client configurations with a checked-on date; the installed-command-docs
    gate passes.
  - No new runtime dependencies; `bun run check` green with rebuilt `dist/`
    and no `bun.lock` drift; `cd site && bun run check` green if the README
    changed.
- **Validation:** `bun test src/mcp-server.test.ts src/mcp-tools.test.ts`,
  `bun test src/cli.test.ts`, `bun run check`, `cd site && bun run check`
  when the README changed, then a scripted smoke that pipes an
  `initialize`, `tools/list`, `search`, and `create_note` session into
  `bun src/cli.ts mcp --root <temporary copy of kb>` and records the
  transcript in the PR.

## Phase 2: Supermemory import + stdin note body

- **Status:** Not started
- **Depends on:** Phase 1
- **Objective:** A supermemory API export becomes inspectable Markdown notes
  in one command, and agents can pipe a transcript straight into
  `wordcell note create` without a temporary file.
- **Scope:** `src/import-supermemory.ts` (new), fixtures under
  `src/fixtures/supermemory/`, colocated `src/import-supermemory.test.ts`;
  the `note create` parser and runtime in `src/cli-program.ts` for
  `--body-file -`; `docs/reference.md`; the README command table row with
  regenerated site modules; `package.json` only if required; committed
  `dist/`; `CHANGELOG.md` `## Unreleased`.
- **Out of scope:** Live API pulls from supermemory (Phase 3's migration
  doc gives a paging recipe that produces the export file); mem0 or Zep
  importers; site pages; connector content the export does not carry
  inline.
- **Approach:**
  - `wordcell import supermemory <export.json>... --root <vault>
    [--prefix <directory>] [--dry-run] [--json]` accepts one or more files.
    Each file's top level may be a page object `{ memories: [...],
    pagination: {...} }` as returned by `POST /v3/documents/list`, an array
    of such pages, a bare array of items, or a `{ documents: [...] }`
    wrapper. Parse from `unknown`; reject non-JSON and unknown shapes with
    the file name and JSON path in the diagnostic. Bound input size per
    file and item count per run. Per-item validation failures are reported
    and skipped; the run fails only when every item fails.
  - Item mapping: note id `<prefix>/<slug>`, where the slug derives from
    `customId` when present, else `title`, else `id`, deduplicated
    deterministically. Before choosing default prefixes and types, read
    what `wordcell clip` writes for captured pages and what `wordcell check`
    requires under `articles/`; imported URL-backed or non-`text` items
    follow the clip conventions, plain `text` memories go under
    `notes/imported/`. An imported fixture vault created with `wordcell
    init` must pass `wordcell check`. Frontmatter: `title`, `type`,
    `source: supermemory`, `external_id` (the 22-character `id`),
    `custom_id` when present, `container_tag` (and `container_tags` when
    more than one), `url` when present, `created` and `updated` (ISO
    timestamps parsed strictly; unparseable values reject the item),
    `import_digest` (sha256 of the imported body), and a bounded flat
    `metadata` passthrough (flat scalars only; nested values dropped with
    a diagnostic). Body: `content` when present, else `summary`, then one
    provenance line naming the export file and import date. Items whose
    `status` is not `done` import with a `status` field and a diagnostic.
    Cap body bytes at the note-create bound.
  - Memory entries: verify supermemory's memory-entry schema against the
    live docs and record the checked-on date. If it exposes versioning or
    parent fields, express supersession with an authored `supersedes`
    relation from the newer note to the older one, never by flattening and
    never with a reciprocal edge. If the endpoint cannot be verified, ship
    documents-only and say so in the reference.
  - Idempotency: match on `external_id`. Unchanged remote content reports
    `skipped`. Changed remote content with the local body digest still
    equal to `import_digest` reports `updated` and rewrites through
    `updateNoteBody` at the current revision. A local body digest that no
    longer equals `import_digest` reports `conflict`, lists both paths,
    and never overwrites. `--json` reports `created`, `updated`, `skipped`,
    `conflicts`, and `rejected` counts with per-item reasons; `--dry-run`
    computes the same report without writing.
  - Writes go through the same atomic, root-confined authoring path as
    `note create`; the importer never assembles paths or frontmatter by
    string concatenation.
  - Stdin: `--body-file -` reads the body from stdin under the same 16 MiB
    bound; `--body` stays literal. Reject empty or whitespace-only input
    and a TTY stdin with a clear message.
  - Tests: fixtures for a single page, a multi-page array, a bare item
    array, a malformed row, nested metadata, a non-`done` status, and a
    duplicate slug; second-run idempotency; the three outcome branches;
    dry-run leaves the tree byte-identical; property tests for slug
    derivation determinism and timestamp round trips; `note create
    --body-file -` with piped, empty, and oversized input.
- **Acceptance criteria:**
  - A checked-in fixture shaped like the verified list response imports
    into notes preserving ids, custom ids, timestamps, and container tags;
    `wordcell search`, `list`, and `check` succeed on the result.
  - Re-running the import reports zero changes; a locally edited note is
    reported as a conflict, not overwritten; `--dry-run` writes nothing.
  - `printf 'transcript' | bun src/cli.ts note create notes/x --title T --body-file - --root <vault>`
    produces a valid note; malformed export rows fail closed with named
    diagnostics.
  - `docs/reference.md` covers both additions with the checked-on date for
    the export shape; installed-command-docs and both checks pass.
- **Validation:** `bun test src/import-supermemory.test.ts src/cli.test.ts`,
  the authoring tests that cover `note create`, `bun run check`, and `cd
  site && bun run check` when the README changed.

## Phase 3: Migration, sync, and comparison docs

- **Status:** Not started
- **Depends on:** Phase 2 (documents the shipped import flags)
- **Objective:** A supermemory user can reach a working Wordcell vault in
  one sitting using only public docs, and knows exactly what does and does
  not transfer.
- **Scope:** `docs/migration-from-supermemory.md` and `docs/sync.md` (new);
  `docs/comparisons.md` (supermemory, mem0, and Zep rows and sections);
  catalog entries for both new docs in `site/app/docs/catalog.ts`; their
  `site/public/sitemap.xml` and `site/public/llms.txt` entries; regenerated
  `site/app/docs/docs.generated.ts`; README documentation table rows for
  the two new docs with regenerated site modules.
- **Out of scope:** Site pages other than the catalog and discovery files
  (Phase 5), import code, skill changes, `docs/agent-memory.md` (Phase 7).
- **Approach:**
  - `migration-from-supermemory.md`: (a) honest scoping in one paragraph —
    Wordcell replaces supermemory for agents that keep memory in files
    (plugin, MCP, and SMFS users); teams embedding a hosted multi-tenant
    memory API should stay on supermemory, with reasons (container-tag
    tenancy, scoped keys, analytics, managed connectors, compliance
    attestations). (b) Concept map table: container tag → vault or
    `container_tag` frontmatter; document → imported source note; memory
    entry → imported note; profile → maintained profile note (Phase 4
    convention); automatic extraction → agent-authored notes plus
    `percolate` review; forget → delete with Git history, or a
    `supersedes` relation; connectors → `clip`, `gh`, and scheduled-job
    recipes; hosted MCP → `wordcell mcp`; REST API → CLI and SDK. (c)
    Export recipe: `curl` and Python snippets that page `POST
    /v3/documents/list` with `includeContent: true` into one JSON file,
    verified against the live docs with a checked-on date. (d) `wordcell
    import supermemory` walkthrough with the report fields and the conflict
    path. (e) Verify step: `check`, sample searches, Git commit. (f)
    Connector replacement recipes: Drive or Dropbox → Markdown folder plus
    Git; Gmail → export or agent-driven clip; GitHub → `gh api` or clone
    into the vault; web crawler → `clip` plus a scheduled job; Notion →
    Markdown export. Name at least two capabilities with no equivalent.
    Label commands that are unreleased as available from source until the
    next release.
  - `docs/sync.md` answers the cloud question with Git: vault in the
    repository versus vault as its own repository, a private GitHub
    repository as the sync backend, `git pull` before work and a cron or
    launchd commit-and-push snippet, merge behavior for Markdown, and when
    `portfolio search` beats syncing at all.
  - `comparisons.md`: supermemory, mem0, and Zep rows in "At a glance" and
    short sections, each checked against primary docs. Choose supermemory
    for embedded multi-tenant memory APIs, managed connectors, and
    compliance needs; Wordcell for local ownership, no metering, Git
    provenance, and inspectability. The doc has one dating sentence
    ("checked against the linked primary documentation on September 19,
    2026"); change it only after re-checking every existing row that day,
    otherwise add a second dated sentence scoped to the new rows.
  - Catalog entries put the migration and sync guides in the `how-to`
    quadrant. Their summaries follow the existing catalog voice.
- **Acceptance criteria:**
  - Every command and flag named in the docs exists and matches
    `docs/reference.md`; every supermemory API claim cites its public docs
    with a checked-on date.
  - The guide names at least two capabilities with no Wordcell equivalent
    and one paragraph says who should stay.
  - Both docs render at `/docs/<slug>`, appear in the sitemap and
    `llms.txt`, and pass the sync-docs link and fragment checks.
- **Validation:** `bun run check`, `cd site && bun run check`, `bun
  src/cli.ts check --root kb`, and a `STYLE.md` review pass on all new
  prose.

## Phase 4: Session-memory and profile skill workflow

- **Status:** Not started
- **Depends on:** Phase 2 (`--body-file -` exists for transcript capture)
- **Objective:** An agent following the public skill can save durable memory
  from a conversation at session end, or on request, and keep a living
  profile note. This replaces the jobs supermemory's conversation ingestion
  and profiles do, without automatic extraction.
- **Scope:** `skills/wordcell/references/session-memory.md` (new);
  `skills/wordcell/SKILL.md` (one router row); `skills/wordcell/references/query.md`
  (read-the-profile-first step); `skills/wordcell/agents/openai.yaml` only
  if the public description changes; `skills/wordcell/templates/` only if a
  session-note template earns its place.
- **Out of scope:** `docs/` (Phase 7 adds the docs section), automatic fact
  extraction, background processing, any code that writes notes on its
  own, `src/` changes.
- **Approach:** The workflow is a recipe the agent executes. On request or
  at session close, the agent (1) summarizes the exchange into a `type:
  session` note — dated title, `repository_scopes` for the code touched,
  outcome, open threads — using `note create` (`--body-file -` for piped
  text); (2) links the session to affected notes and plans with authored
  relations; (3) runs `percolate` and reviews candidates before adding any
  `supersedes` or `contradicts`; (4) updates the profile note and runs
  `refresh`, then `check`. Profile convention: a maintained `type: profile`
  note (`notes/profile.md` for the vault owner, `notes/profile-<entity>.md`
  per additional entity) holding durable facts — role, preferences,
  environment, standing decisions — in two labeled sections, "Stable" and
  "Recent", mirroring supermemory's static and dynamic profile split. The
  reference gives both paths for editing it: the agent's own file edit
  followed by `check`, or the MCP `update_note_body` tool with the revision
  from `get_note`. The query reference tells agents to read the profile
  first on memory-recall requests. Everything stays authored and
  inspectable; nothing writes reciprocal or inferred edges.
- **Acceptance criteria:**
  - SKILL.md's router gains a row routing "save or remember this
    conversation" and profile requests to the new reference; the reference
    follows the existing focused-reference style and uses only commands
    and tools present on the same tree.
  - A dry run on a sample transcript in a temporary vault produces a
    session note and a profile update using documented commands only; the
    transcript goes in the PR.
  - `bun run check` (including the packed-skill byte-identity and
    installed-command-docs gates) and `bun src/cli.ts check --root kb` pass.
- **Validation:** `bun run check`, `bun src/cli.ts check --root kb`, and a
  read-through of the reference against `docs/reference.md`.

## Phase 5: Site — benchmarks, compare, migrate, home, deep links

- **Status:** Not started
- **Depends on:** Phase 3 (migration and comparison content), Phase 4 (the
  setup prompt references the session-memory workflow)
- **Objective:** wordcell.io presents cited evidence with its limits, a fair
  supermemory comparison, a migration landing, launch links on the home
  page, and one-click agent setup, without a claim the evidence does not
  support.
- **Scope:** `site/app/benchmarks/` (page and `opengraph-image.tsx`),
  `site/app/compare/supermemory/` and `site/app/migrate/supermemory/`
  (page and `opengraph-image.tsx` each); evidence modules under
  `site/wordcell/` beside `benchmark-evidence.ts`; vendored Oh artifacts
  under `docs/evaluations/oh/`; a shared setup-links component and one
  `SETUP_PROMPT` constant under `site/wordcell/`; additive sections and
  links in `site/app/page.tsx`; header or footer navigation if the pages
  need it; `site/public/sitemap.xml`, `site/public/llms.txt`; tests in
  `site/tests/` with new files added to the `test` script in
  `site/package.json`; styles in `site/wordcell/wordcell.css`.
- **Out of scope:** The hero heading and summary, `site-description.ts`,
  the opengraph home image text, and the `llms.txt` blockquote (canonical
  messaging); README text (Phase 7); `published-release.json`; the blog
  (Phase 6); worker and hosted API code; any new benchmark run.
- **Approach:**
  - Vendor the two Oh artifacts byte-for-byte, fetched with `gh api
    repos/hraness/oh/contents/<path>?ref=<commit>`:
    `memory-evolution-locomo-sealed-1540-v1.json` at `3add170…` and
    `memory-framework-pilot-v1.json` at `9edd9f1…`, into
    `docs/evaluations/oh/`, plus a `sources.json` manifest recording repo,
    commit, path, byte size, git blob SHA, sha256, and fetch date. A site
    test recomputes sha256 and size and fails on drift. No sibling-path or
    submodule link to `hraness/oh`.
  - Evidence modules derive every rendered number from the vendored JSON
    or the existing Wordcell artifacts, following
    `benchmark-evidence.ts`. Typed as `BenchmarkStudy`, with `system`
    attribution kept explicit in titles and source lines.
  - `/benchmarks` has three sections in this order:
    1. *What Wordcell itself measures*: the context-handoff size from
       `docs/evidence.md` and the SciFact reranking study (reuse
       `scifactStudy`), each with its stated limit.
    2. *The Oh kernel Wordcell embeds, measured standalone*: the sealed
       LoCoMo result as a same-run chart (Oh semantic against the BM25
       window control, per reader), introduced by the attribution sentence
       from `docs/evidence.md`, followed by the artifact's limits
       verbatim (descriptive, previously exposed conversations, one
       repeat, no interval, not a leaderboard reproduction, no recorded
       run date or hardware). Show per-category rows only if the vendored
       JSON contains them; otherwise link the upstream document.
    3. *Matched and published comparisons*: the LongMemEval-S framework
       pilot as a same-run chart (Supermemory 75.00%, Oh 71.67%, BM25
       68.33%, with the interval crossing zero stated beside it), then the
       published cross-protocol claims as a sourced table, never a chart,
       with the sentence that they are not a matched ranking.
    A closing "How to reproduce" paragraph links the `hraness/oh`
    benchmark documents at the pinned commits.
  - `/compare/supermemory`: a fair table — hosted memory API versus local
    files; credit metering versus free; inferred memories versus authored
    and reviewed; managed connectors versus `clip` plus Git recipes; SOC 2
    and HIPAA BAA versus local-only by default; and a "choose supermemory
    when" row for multi-tenant SaaS embedding. Pricing cells carry exact
    tiers re-checked on the day with the date. Links to
    `/docs/comparisons` and `/migrate/supermemory`.
  - `/migrate/supermemory`: the concept map and the export, import, and
    verify path in summary, linking `/docs/migration-from-supermemory` as
    the canonical guide.
  - Home: keep the canonical hero. Add one launch section near `#install`
    covering agent memory over MCP, import from supermemory, and the setup
    links; link `/benchmarks` from the `#evidence` section and
    `/compare/supermemory` from the `#compare` section. Label unreleased
    commands as available from source until the next release. Update
    `home.test.tsx` expectations deliberately.
  - Deep links: one `SETUP_PROMPT` (install Wordcell from the current
    release, run `wordcell init`, register `wordcell mcp`, follow the
    session-memory workflow; while `mcp` is unreleased the prompt installs
    from source or says the step needs the next release) shared by a copy
    button and every link. Targets, each verified on the day with a
    checked-on date: Claude Code (`claude mcp add` command, no URL scheme);
    Claude.ai (`https://claude.ai/new?q=`); ChatGPT
    (`https://chatgpt.com/?q=`); Cursor (its documented MCP install
    deeplink with a base64 JSON config); Codex (`codex mcp add` command);
    Grok (`https://grok.com/?q=`). Drop any target that does not open with
    the prompt prefilled. Web-only assistants get one sentence: local
    memory needs a CLI-capable agent. Encode prompts with
    `encodeURIComponent` and keep them under the shortest verified URL
    limit among the targets.
  - Every new route gets `metadata` with a canonical URL, an
    `opengraph-image.tsx` following the docs and developers pattern, a
    sitemap entry, an `llms.txt` entry, and a built-route assertion in
    `site/tests/runtime.test.ts`.
- **Acceptance criteria:**
  - Every number on `/benchmarks`, `/compare/supermemory`, and the home
    additions derives from a vendored artifact, an existing Wordcell
    artifact, or a dated pricing constant with its source URL; a test
    asserts the vendored digests and that rendered figures equal the
    derived values.
  - "SOTA" and "state of the art" appear nowhere on the site as claims; a
    test enforces it over the new pages.
  - `/compare/supermemory` contains an explicit "choose supermemory when"
    row; pricing cells carry the checked-on date.
  - Setup links open with the prompt prefilled for every target kept.
  - The canonical hero, `siteDescription`, and `llms.txt` blockquote are
    unchanged; theme and style tests pass in both palettes.
- **Validation:** `cd site && bun run check` (includes build and runtime
  route tests), `bun run check` (vendored files under `docs/`), and a
  rendered pass of each new page at desktop and phone widths in both
  themes, recorded in the PR.

## Phase 6: Launch post on the blog

- **Status:** Not started
- **Depends on:** Phase 5 (evidence modules and pages exist)
- **Objective:** The existing Wordcell blog gains a launch post that tells
  what shipped, the evidence with its limits, why authored local memory is
  the better default for agents that work in files, and the
  free-and-open stance, feeding the announcement.
- **Scope:** `site/content/blog/<slug>.md` (new); its record in
  `site/app/blog/articles.ts` with a complete `ArticleAdmission`; a typed
  figure binder in `site/scripts/sync-blog.ts` and its test; regenerated
  `site/app/blog/blog.generated.ts`; `site/public/sitemap.xml` (with
  `lastmod`) and `site/public/llms.txt`; `site/tests/blog.test.tsx`
  expectations for the new post count.
- **Out of scope:** Other posts, new blog machinery beyond the figure
  binder, any new figure.
- **Approach:**
  - Extend `sync-blog.ts` with a typed binder for evidence placeholders
    (`{{evidence.<study>.<row>}}` or similar) sourced from the Phase 5
    evidence modules. Unknown keys throw; the existing unbound-placeholder
    check stays. Every figure in the post is a placeholder, so post and
    pages cannot disagree.
  - Structure: what shipped (local MCP, import, session memory, migration
    path) → the evidence (Wordcell's own measurements, then the Oh
    kernel's result with the attribution sentence and limits, then the
    matched pilot where Supermemory led within noise) → the approach
    (agent-authored Markdown, Oh-derived graph proofs, hybrid retrieval;
    why inspectable authored records help update correctness and audit)
    → honest limits (no matched Wordcell result yet, where a hosted
    inference pipeline still wins, corpus scale) → the philosophy close as
    a stance → migration link. Working title: "Agent memory should be
    free, local, and yours"; no title may assert a ranking.
  - Sources in the record pin a commit that contains every linked file
    (the Phase 5 merge SHA). Fill the admission record truthfully, with
    AI review and `humanReview: null`; set `lifecycle` according to the
    design-kit admission rules. If those rules require human review for
    this post, keep it quarantined and escalate rather than weaken the
    record.
- **Acceptance criteria:**
  - Every figure in the post resolves through the binder; a test asserts
    the rendered post contains no percentage the binder did not produce.
  - The post renders in both themes at desktop and phone widths; its
    metadata, canonical URL, sitemap `lastmod`, feed entry, and `llms.txt`
    entry follow its lifecycle; the blog tests pass.
  - `STYLE.md` pass: no unverifiable superlatives, no em dashes, competitor
    references cite dated public claims.
- **Validation:** `cd site && bun run check` and a rendered pass recorded
  in the PR.

## Phase 7: README, changelog, docs sweep, plan close-out

- **Status:** Not started
- **Depends on:** Phases 3, 4, 5, 6
- **Objective:** The README, changelog, and docs reflect the shipped launch
  surface so `main` is ready for the owner's release decision, and this
  plan records what happened.
- **Scope:** `README.md` with regenerated site modules, `CHANGELOG.md`,
  `docs/agent-memory.md` (a "Session memory and profiles" section linking
  the Phase 4 reference and the MCP tools), `docs/reference.md`
  consistency sweep, `portfolio-inventory.json` only if package identity
  or dependencies changed, and this plan.
- **Out of scope:** Version bump, tag, release, npm publication,
  `published-release.json`, canonical messaging.
- **Approach:** The README gains the launch capabilities with their limits
  and links (`/benchmarks`, the migration and sync docs), keeps the command
  rows Phases 1–2 added, and follows the Hraness README guidelines and the
  `hraness:wordcell-landing` markers. Consolidate the `## Unreleased`
  changelog entries into one coherent section in the existing prose style.
  Transcribe every phase result into the Implementation log, set phase
  statuses, and move `status:` to `completed` with `## Result` and `##
  Durable memory` sections per `kb/plans/AGENTS.md`.
- **Acceptance criteria:**
  - `bun run check` and `cd site && bun run check` green; committed `dist/`
    and generated modules consistent.
  - Every README command example runs as written against `bun src/cli.ts`.
  - No figure or claim in the diff lacks a citation path; no "SOTA" claim.
  - The plan's log is complete and its close-out sections are present;
    `bun src/cli.ts check --root kb` passes.
- **Validation:** full repository gate, site gate, README command
  spot-runs, and the kb commands in Constraints.

## Open questions

None block execution. New questions follow the Escalations list; workers
do not guess them.

## Recovery

- A phase that fails validation does not merge; its worker result records
  the failing gate and output. Because Phases 1–2 serialize on the CLI and
  `dist/`, a reverted Phase 1 invalidates Phase 2's merge order — rerun
  Phase 2's gate after any Phase 1 fix.
- Docs and site phases revert cleanly by PR; none migrates data, and only
  Phases 1–2 touch `dist/`.
- If a benchmark figure is challenged after launch, the correction path is
  the vendored artifact or evidence module, and every page and the post
  inherit it. If the challenge is attribution (an Oh figure read as a
  Wordcell figure), the fix is the attribution sentence in the evidence
  module.
- A dead setup link is removed from the shared component in one commit; the
  copy-prompt button works without any host.
- If the workflow stops partway, the orchestrator records merged phases
  and the stop reason in this plan through a small `kb:` PR.

## Implementation log

- 2026-09-26 — Plan review. Rewrote the draft after checking the
  repository, `hraness/oh`, and supermemory's public docs. Pinned the
  LoCoMo artifact and commit; recorded that it measures Oh, not Wordcell,
  and that no SOTA claim may ship.
- 2026-09-26 — Rebased the plan on `origin/main` at `ddd9f49` before
  execution. The first review had read a checkout 36 commits behind.
  Corrections: the blog, docs catalog, and benchmark chart component
  already exist; Phase 6 now adds one post through the admission registry;
  docs need catalog and sitemap entries; the Oh artifacts are vendored with
  digests; the canonical hero is left alone; changelog entries use `##
  Unreleased`; Phase 3 no longer edits `docs/agent-memory.md`, so Phases 3
  and 4 edit disjoint files; the MCP server gains `update_note_body` on
  top of the SDK's revision-checked `updateNoteBody`. Recorded the three
  options the owner approved and separated them from convention defaults.
