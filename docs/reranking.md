# Use hosted reranking

Wordcell can rerank a bounded search window with TypeSafe's `jev-1.13.0` model.
Use it when lexical matches retrieve useful candidates but put the strongest
answer too far down the list. Exact title, alias, and path identities remain
first. Reranking cannot recover notes that retrieval did not find.

## Search a repository

Run a repository's approved `kb:search` script when it provides one. The script
pins Wordcell and declares its vault and hosted-processing choice. Otherwise:

```sh
wordcell search "why releases use immutable archives" --root kb \
  --mode exact --rerank typesafe --rerank-limit 25 --limit 5 --json
```

`--mode exact` selects local lexical candidate retrieval. Adding `--rerank`
then sends the query, each candidate's identifier, title, vault-relative path,
and at most 512 UTF-8 bytes of its snippet to TypeSafe. Use this command only for
vaults approved for that external processing. It does not send entire notes,
Git history, or graph neighborhoods. Provider input-token charges apply.
Omitting `--rerank` performs no hosted rerank calls or credential lookup.

`--rerank-limit` accepts 2 through 25 and requires `--rerank typesafe`. It bounds
requests independently of `--limit`, which bounds displayed results. Each
candidate requires one request. Four requests run concurrently by default;
the complete window has an eight-second deadline and no retries. A failure
stops queued work and aborts requests in flight. A dispatched request may still
incur charges after a local abort.

Exact mode needs no embedding download. Existing indexed vaults can explicitly
use `--mode hybrid`, `keyword`, or `semantic`; those candidate pools have not
been qualified by the scientific-retrieval study below.

## Configure a local credential

The CLI resolves a credential only for `--rerank typesafe`, in this order:

1. `TYPESAFE_API_KEY`, when present. An invalid explicit value does not fall back.
2. The absolute path in `TYPESAFE_API_KEY_FILE`, when set.
3. `$XDG_CONFIG_HOME/wordcell/typesafe-api-key`, or
   `~/.config/wordcell/typesafe-api-key` when `XDG_CONFIG_HOME` is unset.

The file contains one API key with an optional final newline. On Unix it must
belong to the current user and grant no group or other permissions, normally
mode `0600`. Symlinks, hard links, nonregular files, oversized files, and
multiline values are rejected. Keep the directory private, normally `0700`.
Store the file outside repositories. Do not paste credentials into commands,
package scripts, notes, or source control. CI can inject `TYPESAFE_API_KEY`
through its existing secret mechanism; ordinary checks require no key.

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

SDK callers supply credentials through `TYPESAFE_API_KEY` and explicitly install
the engine. Global credential-file discovery belongs to the CLI.

```ts
import { createTypeSafeReranker, openKnowledgeBase } from "@hraness/wordcell";

const kb = await openKnowledgeBase(
  { root: "kb" },
  { rerankers: [createTypeSafeReranker()] },
);
try {
  const result = await kb.search({
    query: "why releases use immutable archives",
    mode: "exact",
    limit: 5,
    rerank: { engine: "typesafe", limit: 25 },
  });
  console.log(result);
} finally {
  await kb.close();
}
```

## Evidence and limits

A frozen evaluation on all 300 public BEIR SciFact test queries searched 5,183
scientific abstracts through Wordcell's actual exact-mode SDK, then reranked
up to 25 candidates with the production prompt and `jev-1.13.0`. The first
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
warm local measurements, not an end-to-end service guarantee.

See the [frozen result report](evaluations/wordcell-scifact-20260919.json).
The public dataset can overlap model training data; it does not prove private
repository-KB quality, probability calibration, or hybrid-mode gains. Freeze
representative repository questions and expected source notes before comparing
baseline and reranked results in a new domain. Preserve misses, regressions,
latency, fallback, and token usage in that comparison.
