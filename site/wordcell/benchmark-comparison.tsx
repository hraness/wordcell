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
  measuredAt: string;
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
      <p className="wordcell-benchmark-caption">{study.dataset} · {study.sampleSize} queries · {study.metric}</p>
      <BenchmarkBars label={`${study.dataset}: ${study.metric}, out of ${study.sampleSize} queries`} rows={study.rows} />
      <p className="wordcell-benchmark-scope">Same corpus and candidate windows. Scientific abstracts; this study does not establish answer quality or results on your vault.</p>
      <details className="wordcell-benchmark-method">
        <summary>Models, method, and limitations</summary>
        <dl>
          <div><dt>Recorded</dt><dd><time dateTime={study.measuredAt}>{study.measuredAt}</time></dd></div>
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
