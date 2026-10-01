# Markdown-memory retrieval pilot — August 2, 2026

Historical study record, retained verbatim from the agent-memory guide. [Read the guide](agent-memory.md).

The August 2, 2026 pilot froze one repository snapshot and 18 questions whose graded relevance judgments were written before the rankings were inspected. The evaluator scanned 156 Markdown records and projected 155 searchable notes into QMD after excluding the authored vault index and agent guides. Nine questions formed the development set, and nine were held out for the test. The test covered exact identity, conceptual recall, active plans, current decisions, code-path context, source evidence, historical rationale, stale-versus-current conflicts, and one no-answer case.

At a cutoff of 10 results, exact search recorded `Recall@10` of 0.833333, `MRR@10` of 0.892857, and `nDCG@10` of 0.790377. Hybrid search recorded 0.833333, 0.937500, and 0.833884, respectively. Recall measures how much of the judged relevant set appeared; mean reciprocal rank rewards an earlier first relevant result; normalized discounted cumulative gain also accounts for graded relevance and position.

Eight test questions had an answer. A 10,000-resample paired bootstrap, which repeatedly samples those same questions to estimate the stability of the difference, measured hybrid minus exact. The `Recall@10` difference was 0 with a 95% confidence interval of \[0, 0\]; the `MRR@10` difference was +0.044643 with \[0, 0.133929\]; and the `nDCG@10` difference was +0.043508 with \[-0.012752, 0.111832\]. Both retrievers returned a result for the one no-answer question instead of abstaining, so their no-answer accuracy was 0.

The same mixed-cache, single-run test recorded p95 latencies of 44.345 milliseconds for exact, 62.834 for hybrid, 821.370 for keyword, and 41,000.524 for semantic retrieval. The semantic figure includes the first in-process model load. The run used [QMD 2.5.3 at Hraness compatibility commit aa993dc](<https://github.com/hraness/qmd/commit/aa993dceb3ef8cfb71d470554ca437570f5a2b3c>) and a locally verified EmbeddingGemma 300M Q8 model on Bun 1.3.14 and Node 24.3.0 under arm64 Darwin 25.5.0, with an Apple M4 Max, 16 logical CPUs, and 128 GiB of memory. Each p95 summarizes only nine queries with mixed cold and warm state, so these are local diagnostics, not speed claims. The corpus is too small to establish that hybrid is generally superior to exact search or to compare Wordcell with industry retrieval systems.

Search finds candidates. Similarity does not establish that a passage is current, correct, or supported by its sources. The Markdown, cited captures, explicit relationships, and requested Git history supply the material a reader must inspect.

