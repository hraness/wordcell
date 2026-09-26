import type { BarListChartDatum } from "@hraness/design-kit/react";
import type { ReactNode } from "react";

import { BenchmarkBars } from "./benchmark-bars";

export type BenchmarkStudy = Readonly<{
  id: string;
  title: string;
  dataset: string;
  metric: string;
  unit: "percent";
  sampleSize: number;
  /** What one sample is called in the caption, such as "queries" or "questions". */
  sampleNoun: "queries" | "questions";
  /** One sentence that bounds what the study shows. */
  scope: string;
  measuredAt: string;
  /** Label for measuredAt; defaults to "Recorded". */
  dateLabel?: string;
  /** Decimal places for bar values; defaults to 1. */
  valueDigits?: 1 | 2;
  model: string;
  reader: string;
  evaluator: string;
  contextBudget: string;
  exposure: string;
  comparability: "same-run" | "published-context";
  source: Readonly<{ label: string; href: string }>;
  rows: readonly BarListChartDatum[];
}>;

export function BenchmarkComparison({
  study,
  children,
}: Readonly<{ study: BenchmarkStudy; children?: ReactNode }>) {
  // Different protocols belong in a sourced table, never a common ranking.
  if (study.comparability !== "same-run") {
    throw new TypeError("A comparison chart requires a shared evaluation protocol.");
  }
  return (
    <section className="wordcell-benchmark" aria-labelledby={`${study.id}-title`}>
      <h3 id={`${study.id}-title`}>{study.title}</h3>
      <p className="wordcell-benchmark-caption">{study.dataset} · {study.sampleSize.toLocaleString("en-US")} {study.sampleNoun} · {study.metric}</p>
      <BenchmarkBars
        digits={study.valueDigits ?? 1}
        label={`${study.dataset}: ${study.metric}, out of ${study.sampleSize.toLocaleString("en-US")} ${study.sampleNoun}`}
        rows={study.rows}
      />
      <p className="wordcell-benchmark-scope">{study.scope}</p>
      <details className="wordcell-benchmark-method">
        <summary>Models, method, and limitations</summary>
        <dl>
          <div><dt>{study.dateLabel ?? "Recorded"}</dt><dd><time dateTime={study.measuredAt}>{study.measuredAt}</time></dd></div>
          <div><dt>Model</dt><dd>{study.model}</dd></div>
          <div><dt>Answer reader</dt><dd>{study.reader}</dd></div>
          <div><dt>Evaluation</dt><dd>{study.evaluator}</dd></div>
          <div><dt>Context</dt><dd>{study.contextBudget}</dd></div>
          <div><dt>Exposure</dt><dd>{study.exposure}</dd></div>
        </dl>
        {children}
      </details>
      <p className="record-link"><a href={study.source.href}>{study.source.label}</a></p>
    </section>
  );
}
