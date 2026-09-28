import { MarketingStatStrip, type MarketingStat } from "@hraness/design-kit/react/server";

import { scifactDetails } from "./benchmark-evidence";
import { handoffEvidence } from "./handoff-evidence";
import { passageDetails } from "./passage-evidence";

/** The first release that ships `--selected-passage`. */
export const SELECTED_PASSAGE_RELEASE = "0.24.0";

/* Every figure compares Wordcell with its own baseline on public data and is
 * read from a recorded report, never typed by hand. */
export const wordcellEvidenceStats: readonly MarketingStat[] = [
  {
    label: "Excerpts that held the answer",
    value: `${passageDetails.passageAnswers} of ${passageDetails.questions}`,
    detail: `Sealed questions with --selected-passage, up from ${passageDetails.snippetAnswers} of ${passageDetails.questions} with older snippets. Same 512-byte limit, no model.`,
  },
  {
    label: "Relevant source ranked first",
    value: `${scifactDetails.rerankedFirstResults} of ${scifactDetails.queries}`,
    detail: `SciFact queries with optional Jev reranking, ${scifactDetails.additionalFirstResults} more than exact search alone. nDCG at five rose from ${scifactDetails.baselineNdcg} to ${scifactDetails.rerankedNdcg}.`,
  },
  {
    label: "Smaller first handoff",
    value: `${Math.round(handoffEvidence.reductionPercent)}%`,
    detail: `Packed snippets versus the same notes in full, across ${handoffEvidence.queries} queries on a public vault.`,
  },
  {
    label: "Accounts or models required",
    value: "0",
    detail: "Exact search, selected passages, graph queries, and publishing run locally on your Markdown files.",
  },
];

export function WordcellEvidenceStrip({ className }: Readonly<{ className?: string }>) {
  return (
    <MarketingStatStrip
      ariaLabel="Wordcell measurements"
      {...(className === undefined ? {} : { className })}
      columns={4}
      source={<>Each measured figure compares Wordcell with its own baseline on public data; none ranks Wordcell against another tool. <a href="/benchmarks">Sources, raw results, and limits</a>.</>}
      stats={wordcellEvidenceStats}
    />
  );
}
