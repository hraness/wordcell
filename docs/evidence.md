# Measure a smaller context handoff

Wordcell can pass selected snippets to an agent before the agent opens full notes.
In the four-query example below, those handoffs contained **79.98% fewer UTF-8
bytes than the same matching notes in full**: 12,126 bytes instead of 60,584.
This is a small, reproducible payload-size demonstration on Wordcell's public
seven-note knowledge base. It does not measure tokens, answer quality, speed,
or an advantage over another search tool.

## What was measured

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

## Reproduce the result

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

## Use the measurement correctly

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

## Retrieval quality needs separate evidence

The six-case synthetic rank-fusion fixture in `src/benchmark.ts` checks
deterministic behavior. It is not a retrieval-quality or performance benchmark
and must not be cited as one. Wordcell provides an
[evaluation-builder API](reference.md) for frozen corpora and relevance
judgments. A competitive quality claim needs a published corpus, independently
judged queries, pinned tool versions and settings, the raw rankings, and named
hardware for any timing claims. No competitive quality or latency result is
claimed here.
