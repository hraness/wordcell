"use client";

import { BarListChart, type BarListChartDatum } from "@hraness/design-kit/react";

export function BenchmarkBars({
  label,
  rows,
}: Readonly<{ label: string; rows: readonly BarListChartDatum[] }>) {
  return (
    <BarListChart
      aria-label={label}
      data={rows}
      domain={[0, 100]}
      formatValue={(value) => `${value.toFixed(1)}%`}
    />
  );
}
