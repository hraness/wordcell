import report from "../../docs/evaluations/wordcell-scifact-20260919.json";
import type { BenchmarkStudy } from "./benchmark-comparison";

const questions = report.queries.length;
const count = (arm: "baseline" | "reranked") => report.queries.filter((query) => query[arm].top1 === 1).length;
const exact = count("baseline");
const reranked = count("reranked");

/** Values come from the recorded per-query judgments, not marketing constants. */
export const scifactStudy = {
  id: "scifact",
  title: "A relevant source in the first result",
  dataset: "BEIR SciFact",
  metric: "Relevant result at rank 1",
  unit: "percent",
  sampleSize: questions,
  sampleNoun: "queries",
  scope: "Same corpus and candidate windows. Scientific abstracts; this study does not establish answer quality or results on your vault.",
  measuredAt: report.generatedAt.slice(0, 10),
  model: `${report.provenance.wireModel} reranker; the exact baseline uses no model.`,
  reader: "None. The study measures source ranking, without generating answers.",
  evaluator: "The public BEIR SciFact relevance judgments over 5,183 abstracts.",
  contextBudget: `The same ${report.provenance.window}-candidate windows, with snippets bounded to ${report.provenance.snippetBytes} UTF-8 bytes each.`,
  exposure: "40 initial queries followed by an unchanged 260-query confirmation. Public data may overlap model training; no private-vault claim.",
  comparability: "same-run",
  source: { label: "Study, raw results, and setup", href: "/docs/reranking#evidence-and-limits" },
  rows: [
    { id: "exact", label: "Wordcell exact search", value: 100 * exact / questions, detail: `${exact} of ${questions} queries`, color: "var(--muted)" },
    { id: "reranked", label: "Exact search + Jev reranking", value: 100 * reranked / questions, detail: `${reranked} of ${questions} queries · optional paid provider`, color: "var(--primary)" },
  ],
} as const satisfies BenchmarkStudy;

export const scifactDetails = {
  additionalFirstResults: reranked - exact,
  baselineNdcg: report.combined300.metrics.ndcg5.baseline.toFixed(4),
  rerankedNdcg: report.combined300.metrics.ndcg5.reranked.toFixed(4),
  improved: report.combined300.improved,
  regressed: report.combined300.regressed,
  missing: report.combined300.zeroRelevantWindows,
};
