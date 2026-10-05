# Use hosted reranking

Wordcell can rerank up to 25 search results with Cloudflare Clef, using `clef`
by default or an explicitly selected `clef-flash`.
Use it when lexical matches retrieve useful candidates but put the strongest
answer too far down the list. Exact title, alias, and path identities remain
first. Reranking cannot recover notes that retrieval did not find.

Clef support is in the current source tree. The versioned release does not
include it. The Clef examples below require a source checkout: run
`bun ./src/cli.ts` in place of `wordcell`. Released installations support the
explicit legacy TypeSafe reranker described under [Legacy compatibility](#legacy-compatibility).

## Search a repository

Run a repository's approved `kb:search` script when it provides one. The script
pins Wordcell and declares its vault and hosted-processing choice. Otherwise:

```sh
wordcell search "why releases use immutable archives" --root kb \
  --mode exact --rerank clef --rerank-limit 25 --limit 5 --json
```

`--mode exact` selects local lexical candidate retrieval. Adding `--rerank`
then sends the query, each candidate's identifier, title, vault-relative path,
and at most 512 UTF-8 bytes of its snippet to Cloudflare. Use this command only
for vaults you have approved for that external processing. It does not send
entire notes, attachments, Git history, or graph neighborhoods. Provider charges
apply. Add `--rerank-model clef-flash` to select that model; Wordcell does not
switch models or providers on failure.
Omitting `--rerank` performs no hosted rerank calls or credential lookup.
`--selected-passage` does not change what Cloudflare receives: the reranker still
reads each candidate's snippet, and Wordcell chooses excerpts locally after
ranking.

An approved repository script is the reusable default for that vault: declare
the provider in `kb:search` once and run the script for subsequent searches.
Having a provider key alone does not enable external processing of another
vault. Without a script or explicit rerank request, Wordcell's default search
combines exact matching with local QMD retrieval; `--mode exact` selects the
model-free path. These are supported processing choices, not experimental modes.

`--rerank-limit` accepts 2 through 25 and requires an explicit `--rerank clef`
or legacy `--rerank typesafe` selection. It bounds
requests independently of `--limit`, which bounds displayed results. Each
candidate requires one request. Four requests run concurrently by default;
the complete window has an eight-second deadline and no retries. A failure
stops queued work and aborts requests in flight. A dispatched request may still
incur charges after a local abort.

Exact mode needs no embedding download. Indexed vaults can explicitly use
`--mode hybrid`, `keyword`, or `semantic`. The historical scientific-retrieval
study below evaluated exact-mode candidates with Jev, not those candidate pools
or either Clef model.

## Configure a local credential

Set `CLOUDFLARE_ACCOUNT_ID` to the target account's 32 lowercase hexadecimal
characters. Use a Cloudflare API token authorized for Workers AI in that
account. Having an account and token does not enable hosted processing.

The CLI resolves a token only for `--rerank clef`, in this order:

1. `CLOUDFLARE_API_TOKEN`, when present. An invalid explicit value does not fall back.
2. `CLOUDFLARE_AUTH_TOKEN`, when present, as an alias.

Credentials come only from the environment. Token files and TypeSafe credentials
are never read for Clef. Do not paste tokens into commands, package scripts,
notes, or source control. CI can inject `CLOUDFLARE_API_TOKEN` through its
existing secret mechanism; ordinary checks require no credential.

A missing or invalid credential returns the baseline results and an
`unavailable` rerank diagnostic. The CLI never silently reads a different key
when an explicit credential fails.

## Inspect the result

Read `diagnostics.lanes` and select `lane: "rerank"`. `ready` means the complete
window was accepted. `unavailable` or `degraded` means Wordcell retained the
baseline ordering, with `partial: true`. The command remains usable, so a
successful exit code alone does not prove reranking occurred.

The lane's structured `rerank` receipt records the validated model and known
input/output token totals. Its `accounting` records candidates, attempted
requests, settled requests, elapsed milliseconds, and `usageComplete`. False
`usageComplete` means some dispatched requests have unknown usage; known token
totals are not a complete charge estimate. Provider error bodies and secrets
are excluded from diagnostics.

Each accepted hit adds a `rerank` evidence entry containing its baseline rank,
final rank, and model-assigned relevance probability. The original score and
retrieval evidence remain available. The probability is a ranking signal; it
is not calibrated confidence that the note is correct. Explicit priority rules
run after reranking and retain final ordering authority. Read the underlying
notes and cited sources before acting on them.

## Use the SDK

SDK callers supply `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` through
the environment and explicitly install the engine. Both the SDK and CLI use
environment credentials only for Clef. The package import below requires a
package built from the current source tree; released packages do not yet
export `createClefReranker`. Select Flash with
`createClefReranker({ model: "clef-flash" })`.

```ts
import { createClefReranker, openKnowledgeBase } from "@hraness/wordcell";

const kb = await openKnowledgeBase(
  { root: "kb" },
  { rerankers: [createClefReranker()] },
);
try {
  const result = await kb.search({
    query: "why releases use immutable archives",
    mode: "exact",
    limit: 5,
    rerank: { engine: "clef", limit: 25 },
  });
  console.log(result);
} finally {
  await kb.close();
}
```

## Request and response limits

Wordcell sends a POST to
`https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/cloudflare/{model}`.
Both the endpoint and JSON body's model are `clef` or the selected `clef-flash`.
The response must be a successful Cloudflare `success`/`result` envelope with
no reported errors. Wordcell validates the result's model, exact question set,
answer type, finite probability from zero through one, and token usage. Direct
legacy Jev responses, missing or extra answers, and model mismatches fail closed.

Each candidate has one `noul` question named `relevant`, with nonempty
instructions and explicit true/false criteria. That ID meets Clef's
`[A-Za-z0-9_.-]{1,100}` rule. Wordcell does not expose generic Choice or Score
questions in its reranker; it rejects those answer types rather than accepting
unrequested options or legends. Generic Clef Choice questions require at least
two options.

The complete window is checked before dispatch. State is capped at 24 KiB,
request bodies at 32 KiB, and each response at 64 KiB. SDK timeout and
response-byte options can lower those limits. SDK concurrency accepts one
through eight simultaneous calls; its default is four.

### Images

Clef's shared API can accept up to four embedded PNG, JPEG, or WebP images,
with limits of 4 MiB each, 8 MiB total, 16 million pixels per image, and a
13 MiB request body. Remote image URLs are not supported. Other callers must
explicitly supply image data to use that API capability. Wordcell reranking sends text
only and rejects an `images` request field. It does not extract Markdown
attachments, screenshots, or PDF pages for hosted processing.

## Legacy compatibility

`--rerank typesafe`, `createTypeSafeReranker`, and the
`@hraness/wordcell/rerank-typesafe` export are deprecated explicit legacy paths.
They keep their original TypeSafe endpoint, `jev-1.13.0` model, and
`TYPESAFE_API_KEY` credential discovery (`TYPESAFE_API_KEY_FILE` or the
owner-only `wordcell/typesafe-api-key` file under the config directory).
Selecting `typesafe` never calls Cloudflare; selecting `clef` never uses those
credentials. There is no automatic provider migration or fallback. Switch only
after approving Cloudflare processing for the selected vault.

## Evidence and limits

The following is historical Jev evidence recorded on September 19, 2026, not
a Clef or Clef Flash measurement. Neither Clef model has a published Wordcell
retrieval-quality or latency evaluation here.

A frozen evaluation on all 300 public BEIR SciFact test queries searched 5,183
scientific abstracts through Wordcell's actual exact-mode SDK, then reranked
up to 25 candidates with the recorded prompt and `jev-1.13.0`. The first
40 queries were followed by an unchanged 260-query confirmation; no query was
excluded and no prompt or threshold was tuned after seeing results.

| Metric | Exact baseline | Reranked |
| --- | ---: | ---: |
| nDCG at 5 | 0.4024 | 0.5781 |
| Relevant result at rank 1 | 101/300 | 161/300 |
| Recall at 5 | 0.4628 | 0.6125 |
| Candidate recall at 25 | 0.6158 | 0.6158 |

nDCG improved for 87 queries, regressed for eight, and tied for 205. The paired
95% query-bootstrap interval for the mean gain was 0.1389 to 0.2151.
The confirmation set alone improved by 0.1672 (interval 0.1265 to 0.2089).
There were 110 queries with no judged relevant candidate; reranking could not
repair them. All eight regressions remain in the report.

The 5,886 requests used 3,307,096 reported input tokens and 129,492 output
tokens, with no provider failures. Added reranking latency in this local run
was median 1.782 seconds and p95 1.897 seconds at concurrency four. These are
warm local measurements, not an end-to-end service guarantee. The run host
was an Apple M4 Max with 128 GiB RAM, macOS 26.5.2, and Bun 1.3.14;
that environment was checked after the run rather than captured in a frozen
run receipt.

See the [frozen result report](evaluations/wordcell-scifact-20260919.json).
The public dataset can overlap model training data; it does not prove private
repository-KB quality, probability calibration, or hybrid-mode gains. Freeze
representative repository questions and expected source notes before comparing
baseline and reranked results in a new domain. Preserve misses, regressions,
latency, fallback, and token usage in that comparison.
