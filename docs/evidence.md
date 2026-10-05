# Reproduce Wordcell’s context experiments

These source-level experiments compare how Wordcell selects excerpts and packs
context for an agent. They use small, frozen vaults to investigate implementation
changes. The inputs, protocol, and recorded results below let you reproduce
each experiment.

For a search-ranking study on 300 questions about scientific abstracts, see
[Wordcell’s SciFact results](reranking.md#evidence-and-limits).

## Compare packed snippets with full notes

Wordcell can pass selected snippets to an agent before the agent opens full
notes. This experiment compares the size of those handoffs with the same
matching notes in full, across four queries on a seven-note public vault.

### What was measured

Each query uses the real `openKnowledgeBase().search()` API in `exact` mode,
with up to five results and graph and Git context disabled. The results pass
through `packUntrustedSearchContext()` with a 12,000-byte ceiling. The measured
output includes its source paths, snippets, metadata, and explicit
untrusted-content envelope. No result was dropped by the packer's byte ceiling
in this run. The search result limit still applies, and snippets omit most of
each note's body.

The baseline is the sum of the complete, original UTF-8 Markdown files selected
by that same query, including their frontmatter. It adds no artificial padding
or tool wrappers. A note selected by two queries counts twice, once for each
separate handoff.

| Fixed query | Selected notes | Full selected notes, bytes | Packed handoff, bytes | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `selective publishing` | 2 | 19,303 | 2,322 | 87.97% |
| `repository memory` | 5 | 29,703 | 5,097 | 82.84% |
| `typed relationships` | 2 | 2,949 | 2,354 | 20.18% |
| `capture` | 2 | 8,629 | 2,353 | 72.73% |
| **All four handoffs** | **11 selections** | **60,584** | **12,126** | **79.98%** |

The aggregate is `100 × (1 − 12,126 / 60,584)`, rounded to two decimal places.
It weights by bytes; it is not the arithmetic mean of the percentages.
The small-note case saves 20.18%, which illustrates why one headline number
cannot predict the savings on another vault.

One read-only session scanned the seven-note vault once for all four queries.
The measurement opened zero semantic search sessions and used no model.
Wordcell still reads the corpus locally to build that snapshot. These numbers
describe what crosses the context boundary, not reduced disk I/O. Passing every
note for every query would total 130,456 bytes; the raw report also records that
separate, less selective baseline.

### Reproduce the result

The [raw report](product-evidence.json) contains every selected path, each source
file's byte count and SHA-256, the full packed output, output hashes, the exact
options, and aggregate calculations. The
[measurement script](../scripts/product-evidence.ts) runs against the source SDK;
its [tests](../scripts/product-evidence.test.ts) cover UTF-8 counting, repeatable
results, corpus changes, empty matches, and negative savings.

Recorded on September 19, 2026 using the source SDK at the snapshot below and
Bun 1.3.14. Its package manifest declared version 0.21.3; this is a source
measurement, not verification of the immutable 0.21.3 release artifact. The
public corpus is `kb/` at commit
[`454bfeca3f09680a0a9dc3a8f85d417684818ebc`](https://github.com/hraness/wordcell/tree/454bfeca3f09680a0a9dc3a8f85d417684818ebc/kb):
seven scanned Markdown notes, including the index, totaling 32,614 bytes.
`AGENTS.md` guides are excluded by the vault scanner. The corpus identity is
SHA-256 over the compact JSON array of `{path, bytes, sha256}` records sorted by
path, with no trailing newline:

```text
19854ac834111f66cd4b1bbc0cfc8610f5b92312403d11d72dfee8fef8a95c9b
```

From a source checkout with its dependencies installed, measure its current KB:

```sh
bun scripts/product-evidence.ts
```

To restore the frozen corpus into a temporary directory without changing your
working files, run these commands from the repository root:

```sh
evidence_dir="$(mktemp -d)"
git archive 454bfeca3f09680a0a9dc3a8f85d417684818ebc kb | tar -x -C "$evidence_dir"
bun scripts/product-evidence.ts "$evidence_dir/kb" > "$evidence_dir/result.json"
```

The script prints JSON and does not write the vault or a search index. Compare
`corpus`, `configuration`, `cases`, and `aggregate` with the recorded report.
The `tool` field reports the installed source version, so a later release may
have a different version field even when its measured output is identical.
Hardware is not specified because this report makes no timing measurement.

### Scope

This demonstrates the cost of the first context handoff. It leaves the original
notes available for follow-up reading. If an agent then reads every selected
note, its total context can exceed the full-note baseline. Model token counts,
prompt caching, tool wrappers, follow-up calls, and billing depend on the host;
no fixed byte-to-token conversion is assumed.

These four queries were chosen to exercise product topics. They are not an
independent or representative relevance test set. The small corpus consists of
Wordcell's own engineering notes and plans. A shorter payload does not establish
that it contains enough information to answer a question correctly.

QMD and other tools also return snippets and bounded results. This report
compares two Wordcell handoff strategies, not Wordcell against QMD, Basic
Memory, or a well-tuned `rg` workflow. See the [comparison guide](comparisons.md)
for differences in workflow and features.

## Measure whether excerpts contain the answer

`wordcell search --selected-passage` adds one excerpt to each result: the
paragraph, or window of at most 512 UTF-8 bytes, that contains the most distinct
query words. The older `snippet` field instead starts near the first query word
found anywhere in the note, which can be an unrelated line or frontmatter. This
study asks which of the two holds the answer to a question, when both come from
the same retrieved notes.

| Question set | Questions | Answer note retrieved | Older snippet held the answer | Selected passage held the answer |
| --- | ---: | ---: | ---: | ---: |
| Sealed confirmation | 8 | 7 | 1 | **6** |
| Development | 4 | 4 | 2 | 2 |

On the confirmation set, passages gained five answers and lost none. One miss
came from retrieval: the note with the answer was not among the top five
results, so no excerpt could contain it. The other miss chose a release summary
over the answer in a long plan. Across the same retrieved notes, passages used
17,701 bytes and snippets 20,480.

### Method

Each question runs the real `openKnowledgeBase().search()` API in `exact` mode
with up to five results, graph and Git context disabled, and
`selectedPassage: true`. One search returns both texts for each hit. The snippet
is clipped to 512 UTF-8 bytes, as the reranker receives it. A text holds the
answer when every labeled anchor phrase of one answer passage occurs in it,
compared case-sensitively after collapsing whitespace, and it comes from the
labeled note.

The questions and answer labels were written by an AI agent that did not write
the selector. The eight confirmation questions were sealed before the selector
was finished and were run once, without further tuning. Four development
questions were used while building it. Four more ask about details the corpus
does not contain; passages still returned related text for them, because the
selector finds matching words and does not judge whether an answer exists.

### Reranking with passages instead of snippets

Wordcell's optional reranker receives snippets. A historical September 27,
2026 comparison with TypeSafe's `jev-1.13.0` model scored the same 95 candidate
notes across 20 questions twice, changing only the candidate text. The 20 are the 16 above plus
four answerable questions from an earlier pilot. Both arms put the answer
note first for 14 of 16 answerable questions: passages fixed one ranking and
broke another. All 190 requests succeeded, with 51,679 input tokens for
snippets and 50,877 for passages. Because ranking did not improve, the reranker
input stays as it is.

### Reproduce the result

The [frozen questions](evaluations/wordcell-passages-20260927/cases.json),
[recorded result](evaluations/wordcell-passages-20260927/local.json), and
[reranking comparison](evaluations/wordcell-passages-20260927/rerank-comparison.json)
are in this repository. The [measurement script](../scripts/passage-evidence.ts)
runs against the source SDK, and its [tests](../scripts/passage-evidence.test.ts)
cover clipping, answer matching, and the recorded totals.

The corpus is `kb/` at commit
[`3a27fe51ae2644c53afb03e8687ac99985940061`](https://github.com/hraness/wordcell/tree/3a27fe51ae2644c53afb03e8687ac99985940061/kb):
12 notes totaling 132,819 bytes, with corpus identity
`433a1ac444650c0ebdb8e9143a6d442d866df90ebda7e935691f50b257cfc8a3` computed as
above. The result was recorded on September 27, 2026 from source commit
`3a4d0cf`, with Bun 1.3.14. It makes no model calls and no timing claims. From
the repository root:

```sh
evidence_dir="$(mktemp -d)"
git archive 3a27fe51ae2644c53afb03e8687ac99985940061 kb | tar -x -C "$evidence_dir"
bun scripts/passage-evidence.ts "$evidence_dir/kb" > "$evidence_dir/result.json"
```

Compare `corpus`, `splits`, and `cases` with the recorded report. The reranking
comparison needs a TypeSafe key and is recorded rather than rerun by the script.

### Limits

These are 12 answerable questions about one small corpus of Wordcell's own
notes, authored by one AI agent. The labels mark one answer passage per question,
not every place an answer appears, so an equivalent answer elsewhere counts as a
miss. Containing the answer is not the same as an agent answering correctly.
The study compares two Wordcell excerpt strategies, not Wordcell against another
tool.

## Retrieval quality needs separate evidence

The six-case synthetic rank-fusion fixture in `src/benchmark.ts` checks
deterministic behavior. It is not a retrieval-quality or performance benchmark
and must not be cited as one. Wordcell provides an
[evaluation-builder API](reference.md) for frozen corpora and relevance
judgments. A competitive quality claim needs a published corpus, independently
judged queries, pinned tool versions and settings, the raw rankings, and named
hardware for any timing claims. No competitive quality or latency result is
claimed here.

## Distinguish the graph engine from search quality

[Oh](https://oh.computer) backs Wordcell's named graph queries and source proofs.
Wordcell keeps Markdown and Git authoritative and builds a disposable projection
for those queries. Its exact search and optional QMD search follow separate
retrieval paths. The source version also includes optional hosted Cloudflare
Clef reranking; see [setup and release availability](reranking.md).

Oh's conversation-memory benchmarks evaluate its own memory-retrieval API,
reader models, and evaluation protocols. Those scores do not transfer to a
Wordcell vault merely because it uses the same library. The
[benchmarks page](https://wordcell.io/benchmarks) reports Oh's 500-question
LongMemEval-S study, its LoCoMo run, and its smaller pilot with Supermemory as
Oh's results, each with its limits. Wordcell's
[SciFact study](reranking.md#evidence-and-limits) compares exact search with
hosted Jev reranking on the same public queries and candidate windows in
September 2026. It does not measure Clef. It
measures source ranking, without generating answers; this page measures the
size of the first context handoff and whether its excerpts contain the answer. The [graph guide](graph-authority.md#how-wordcell-and-oh-fit-together)
explains the integration.
