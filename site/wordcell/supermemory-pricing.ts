// Supermemory's published monthly plans and usage rates, copied from its pricing
// page on the checked-on date. Recheck the page before changing any value.

export type SupermemoryPlan = Readonly<{
  name: string;
  /** Monthly price in US dollars; null when the plan is priced by sales. */
  monthlyUsd: number | null;
  /** Monthly usage credits in US dollars; null when none are published. */
  creditsUsd: number | null;
  note: string;
}>;

export type SupermemoryUsageRate = Readonly<{
  item: string;
  /** Price in US dollars for plain text, or the only price. */
  usd: number;
  /** Price in US dollars for rich content, when the page lists one. */
  richUsd: number | null;
  per: string;
}>;

export const supermemoryPricing = {
  checkedOn: "2026-09-26",
  href: "https://supermemory.ai/pricing",
  plans: [
    { name: "Free", monthlyUsd: 0, creditsUsd: 5, note: "Credits renew every month." },
    { name: "Pro", monthlyUsd: 19, creditsUsd: 20, note: "Three team seats and unlimited end users." },
    { name: "Max", monthlyUsd: 100, creditsUsd: 130, note: "Adds the Gmail connector." },
    { name: "Scale", monthlyUsd: 399, creditsUsd: 600, note: "Unlimited team seats, S3 and web crawler connectors, SOC 2, HIPAA BAA, and a self-hosted option." },
    { name: "Enterprise", monthlyUsd: null, creditsUsd: null, note: "Committed spend, with air-gapped self-hosting or a dedicated managed instance." },
  ],
  usage: [
    { item: "Memory", usd: 5, richUsd: 10, per: "1M SM tokens" },
    { item: "SuperRAG", usd: 1, richUsd: 2, per: "1M SM tokens" },
    { item: "Search and traversal", usd: 5, richUsd: null, per: "1M queries" },
    { item: "Operations (reranking, aggregation, and query rewriting)", usd: 100, richUsd: null, per: "1M operations" },
  ],
  /** How the page defines its billing unit and credits. */
  terms: [
    "SM tokens count unique ingested content.",
    "Subscription credits reset monthly; top-up credits never expire.",
  ],
} as const satisfies Readonly<{
  checkedOn: string;
  href: string;
  plans: readonly SupermemoryPlan[];
  usage: readonly SupermemoryUsageRate[];
  terms: readonly string[];
}>;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "$19 a month", or "Custom" for a plan priced by sales. */
export function formatPlanPrice(plan: SupermemoryPlan): string {
  return plan.monthlyUsd === null ? "Custom" : `${usd.format(plan.monthlyUsd)} a month`;
}

/** "$20 in credits", or "Custom" when no credit amount is published. */
export function formatPlanCredits(plan: SupermemoryPlan): string {
  return plan.creditsUsd === null ? "Custom" : `${usd.format(plan.creditsUsd)} in credits`;
}

/** "$5 per 1M SM tokens ($10 for rich content)". */
export function formatUsageRate(rate: SupermemoryUsageRate): string {
  const base = `${usd.format(rate.usd)} per ${rate.per}`;
  return rate.richUsd === null ? base : `${base} (${usd.format(rate.richUsd)} for rich content)`;
}
