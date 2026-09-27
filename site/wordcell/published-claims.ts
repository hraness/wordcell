// A selection of the headline figures that other memory projects publish about
// themselves on their own pages today. Each row copies the figure and the metric
// label exactly as its primary source prints them. Mem0's and Zep's earlier
// arXiv figures are superseded by their research pages and are not shown.
// The rows use different datasets, protocols, answer models, and judges, so the
// site renders them only as a sourced table, never as a chart or a ranking.

export const publishedClaimsCheckedOn = "2026-09-26";

export type PublishedClaim = Readonly<{
  id: string;
  system: string;
  benchmark: string;
  /** The figure exactly as the source prints it. */
  figure: string;
  /** The source's own name for the metric. */
  metric: string;
  /** The model the source names for answering, or for every model call. */
  model: string;
  sourceLabel: string;
  href: string;
}>;

const mem0 = { label: "Mem0’s research page", href: "https://mem0.ai/research" } as const;
const zep = { label: "Zep’s research page", href: "https://www.getzep.com/research/" } as const;
const zepModel = "gpt-5.4 reader and gpt-5.4 judge";
const supermemory = { label: "Supermemory’s LongMemEval research page", href: "https://supermemory.ai/research/longmembench/" } as const;
const supermemoryMetric = "Recall@20 with aggregation, in a table titled “LLM-as-judge evaluation”";

export const publishedClaims: readonly PublishedClaim[] = [
  { id: "mem0-locomo", system: "Mem0", benchmark: "LoCoMo", figure: "92.5", metric: "Mem0 Score", model: "Not named", sourceLabel: mem0.label, href: mem0.href },
  { id: "mem0-longmemeval", system: "Mem0", benchmark: "LongMemEval", figure: "94.4", metric: "Mem0 Score", model: "Not named", sourceLabel: mem0.label, href: mem0.href },
  { id: "zep-locomo", system: "Zep", benchmark: "LoCoMo", figure: "94.7% (1,459 / 1,540 correct)", metric: "Accuracy", model: zepModel, sourceLabel: zep.label, href: zep.href },
  { id: "zep-longmemeval", system: "Zep", benchmark: "LongMemEval", figure: "90.2% (451 / 500 correct)", metric: "Accuracy", model: zepModel, sourceLabel: zep.label, href: zep.href },
  { id: "supermemory-gpt-4o", system: "Supermemory", benchmark: "LongMemEval-S, 500 questions", figure: "97%", metric: supermemoryMetric, model: "gpt-4o", sourceLabel: supermemory.label, href: supermemory.href },
  { id: "supermemory-gpt-5", system: "Supermemory", benchmark: "LongMemEval-S, 500 questions", figure: "84.6%", metric: supermemoryMetric, model: "gpt-5", sourceLabel: supermemory.label, href: supermemory.href },
  { id: "supermemory-gemini-3-pro", system: "Supermemory", benchmark: "LongMemEval-S, 500 questions", figure: "85.2%", metric: supermemoryMetric, model: "gemini-3-pro", sourceLabel: supermemory.label, href: supermemory.href },
];
