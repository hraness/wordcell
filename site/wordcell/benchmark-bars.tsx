"use client";

import { BarListChart, type BarListChartDatum } from "@hraness/design-kit/react";

export function BenchmarkBars({
  digits = 1,
  label,
  rows,
}: Readonly<{ digits?: 1 | 2; label: string; rows: readonly BarListChartDatum[] }>) {
  return (
    <BarListChart
      aria-label={label}
      data={rows}
      domain={[0, 100]}
      formatValue={(value) => `${value.toFixed(digits)}%`}
    />
  );
}
