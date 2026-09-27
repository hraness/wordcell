import productEvidence from "../../docs/product-evidence.json";

/* The context-handoff measurement from docs/product-evidence.json, read as
 * unknown so a changed file fails the build instead of shipping a stale
 * figure. */

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`product-evidence.json ${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`product-evidence.json ${label} must be a whole number.`);
  }
  return value;
}

function percent(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new TypeError(`product-evidence.json ${label} must be a percentage.`);
  }
  return value;
}

const evidence = record(productEvidence as unknown, "root");
const aggregate = record(evidence.aggregate, "aggregate");
const corpus = record(evidence.corpus, "corpus");
const tool = record(evidence.tool, "tool");

if (typeof tool.version !== "string") throw new TypeError("product-evidence.json tool.version must be a string.");

const numbers = new Intl.NumberFormat("en-US");

export const handoffEvidence = {
  queries: count(aggregate.queries, "aggregate.queries"),
  noteCount: count(corpus.noteCount, "corpus.noteCount"),
  packedBytes: count(aggregate.packedBytes, "aggregate.packedBytes"),
  fullNoteBytes: count(aggregate.selectedFullNoteBytes, "aggregate.selectedFullNoteBytes"),
  reductionPercent: percent(aggregate.reductionVsSelectedFullNotesPercent, "aggregate.reductionVsSelectedFullNotesPercent"),
  toolVersion: tool.version,
} as const;

export function formatBytes(bytes: number): string {
  return `${numbers.format(bytes)} bytes`;
}
