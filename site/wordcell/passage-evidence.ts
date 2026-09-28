import report from "../../docs/evaluations/wordcell-passages-20260927/local.json";
import rerank from "../../docs/evaluations/wordcell-passages-20260927/rerank-comparison.json";
import type { BenchmarkStudy } from "./benchmark-comparison";

/* The selected-passage study, read from its recorded report so a changed
 * file fails the build instead of shipping a stale figure. */

const confirmation = report.splits.find(({ split }) => split === "confirmation");
if (confirmation === undefined || confirmation.positives === 0) {
  throw new TypeError("The passage report needs a confirmation split.");
}
const rerankTotals = { baseline: 0, passage: 0, positives: 0 };
for (const summary of rerank.summaries) {
  rerankTotals.positives += summary.positiveCases;
  for (const arm of summary.arms) {
    if (arm.arm === "baseline" || arm.arm === "passage") rerankTotals[arm.arm] += arm.primaryHitsAt1;
  }
}

/** Values come from the recorded per-question results, not marketing constants. */
export const passageStudy = {
  id: "passages",
  title: "An excerpt that contains the answer",
  dataset: "Wordcell public KB, sealed questions",
  metric: "Excerpt holds the labeled answer",
  unit: "percent",
  sampleSize: confirmation.positives,
  sampleNoun: "questions",
  scope: "Same retrieved notes and the same 512-byte limit per excerpt. A small corpus of Wordcell’s own notes; containing the answer is not the same as answering correctly.",
  measuredAt: "2026-09-27",
  model: "None. Passages are chosen locally by distinct query words.",
  reader: "None. The study checks whether labeled answer phrases appear in each excerpt.",
  evaluator: "Answer passages labeled by an AI agent that did not write the selector; every anchor phrase must appear in one excerpt from the labeled note.",
  contextBudget: `Exact search, top ${report.configuration.limit} notes, at most ${report.configuration.maxTextBytes} UTF-8 bytes per excerpt.`,
  exposure: "Sealed before the selector was finished and run once without tuning. Development and no-answer control questions are reported separately.",
  comparability: "same-run",
  source: { label: "Study, raw results, and reproduction", href: "/docs/evidence#measure-whether-excerpts-contain-the-answer" },
  rows: [
    { id: "snippet", label: "Older search snippet", value: 100 * confirmation.snippetAnswers / confirmation.positives, detail: `${confirmation.snippetAnswers} of ${confirmation.positives} questions`, color: "var(--muted)" },
    { id: "passage", label: "Selected passage", value: 100 * confirmation.passageAnswers / confirmation.positives, detail: `${confirmation.passageAnswers} of ${confirmation.positives} questions · local, no model`, color: "var(--primary)" },
  ],
} as const satisfies BenchmarkStudy;

export const passageMissSentence = confirmation.candidateMisses === 0
  ? "Search retrieved the note with the answer for every question."
  : `For ${confirmation.candidateMisses === 1 ? "one question" : `${confirmation.candidateMisses} questions`}, search did not retrieve the note with the answer, so no excerpt could contain it.`;

export const passageDetails = {
  questions: confirmation.positives,
  snippetAnswers: confirmation.snippetAnswers,
  passageAnswers: confirmation.passageAnswers,
  gained: confirmation.gained,
  lost: confirmation.lost,
  candidateMisses: confirmation.candidateMisses,
  snippetBytes: confirmation.snippetBytes,
  passageBytes: confirmation.passageBytes,
  rerankRequests: rerank.accounting.successfulCalls,
  rerankPositives: rerankTotals.positives,
  rerankFirstWithSnippets: rerankTotals.baseline,
  rerankFirstWithPassages: rerankTotals.passage,
} as const;
