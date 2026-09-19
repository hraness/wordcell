export const MAX_RERANK_CANDIDATES = 25;
export const MAX_RERANK_SNIPPET_BYTES = 512;
export const MAX_RERANK_STATE_BYTES = 24 * 1_024;

export type SearchRerankCandidate = {
  readonly id: string;
  /** One-based position in the fused baseline order. */
  readonly baselineRank: number;
  /** Baseline fused score. Engines must not treat it as a probability. */
  readonly score: number;
  readonly title: string;
  readonly path: string;
  readonly snippet: string;
};

export type SearchRerankRequest = {
  readonly query: string;
  /** Candidates in baseline order with unique ids. */
  readonly candidates: readonly SearchRerankCandidate[];
  readonly signal?: AbortSignal;
};

export type SearchRerankDetails = {
  /** Observed model identity, not an unverified requested alias. */
  readonly model?: string;
  /** Known provider-reported totals; missing or incomplete usage is never zero-cost evidence. */
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
  readonly accounting?: {
    readonly candidates: number;
    /** Number of transport invocations, including calls with unknown outcomes. */
    readonly attempted: number;
    /** Transport invocations settled before this immutable result snapshot. */
    readonly completed: number;
    readonly elapsedMs: number;
    readonly usageComplete: boolean;
  };
};

export type SearchRerankResult = SearchRerankDetails & (
  | {
      readonly status: "ready";
      /** A permutation of the window ids the engine ranked. */
      readonly ordering: readonly string[];
      /** Engine-assigned relevance probability per candidate id. */
      readonly probabilities: Readonly<Record<string, number>>;
      readonly confidence?: number;
    }
  | { readonly status: "unavailable" | "failed"; readonly message: string });

export type SearchReranker = {
  readonly id: string;
  readonly rerank: (request: SearchRerankRequest) => Promise<SearchRerankResult>;
};

export type KnowledgeBaseSearchRerankOptions = {
  readonly engine: "typesafe";
  /** Window size submitted to the engine, from 2 through MAX_RERANK_CANDIDATES. */
  readonly limit?: number;
  /** Cancels only the hosted rerank phase, not local retrieval or indexing. */
  readonly signal?: AbortSignal;
};

export type RerankHitPlacement = {
  readonly baselineRank: number;
  readonly rerankRank: number;
  readonly probability?: number;
};

export type AppliedRerank<T extends { readonly id: string; readonly rank: number }> = {
  readonly status: "ready" | "unavailable" | "failed";
  /** Reordered window followed by non-window hits in baseline order. */
  readonly hits: readonly T[];
  /** Window hit placements keyed by id; empty when the result was not applied. */
  readonly placements: ReadonlyMap<string, RerankHitPlacement>;
  /** Strictly inspected engine result, or a generic failed result when malformed. */
  readonly result: SearchRerankResult;
  readonly message?: string;
};

const MALFORMED_RERANK_RESULT_MESSAGE = "Rerank engine returned a malformed result.";
const MAX_RERANK_DIAGNOSTIC_BYTES = 512;
const MAX_RERANK_MODEL_BYTES = 128;
const MAX_RERANK_TOKEN_COUNT = 1_000_000_000;

function dataRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_RERANK_CANDIDATES) return null;
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !("value" in descriptor)
      || !descriptor.enumerable
    ) return null;
    output[key] = descriptor.value;
  }
  return output;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function boundedDiagnostic(value: unknown): value is string {
  return typeof value === "string"
    && value !== ""
    && Buffer.byteLength(value, "utf8") <= MAX_RERANK_DIAGNOSTIC_BYTES
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function tokenCount(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= MAX_RERANK_TOKEN_COUNT;
}

function inspectRerankDetails(result: Record<string, unknown>): SearchRerankDetails | null {
  const model = result["model"];
  if (
    model !== undefined
    && (
      typeof model !== "string"
      || !/^[\x20-\x7e]+$/u.test(model)
      || Buffer.byteLength(model, "utf8") > MAX_RERANK_MODEL_BYTES
    )
  ) {
    return null;
  }
  const rawUsage = result["usage"];
  let usage: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  } | undefined;
  if (rawUsage !== undefined) {
    const usageRecord = dataRecord(rawUsage);
    if (
      usageRecord === null
      || !hasOnlyKeys(usageRecord, ["inputTokens", "outputTokens"])
      || (usageRecord["inputTokens"] !== undefined && !tokenCount(usageRecord["inputTokens"]))
      || (usageRecord["outputTokens"] !== undefined && !tokenCount(usageRecord["outputTokens"]))
    ) {
      return null;
    }
    usage = {
      ...(usageRecord["inputTokens"] === undefined
        ? {}
        : { inputTokens: usageRecord["inputTokens"] as number }),
      ...(usageRecord["outputTokens"] === undefined
        ? {}
        : { outputTokens: usageRecord["outputTokens"] as number }),
    };
  }
  const rawAccounting = result["accounting"];
  let accounting: SearchRerankDetails["accounting"];
  if (rawAccounting !== undefined) {
    const record = dataRecord(rawAccounting);
    if (record === null || !hasOnlyKeys(record, ["candidates", "attempted", "completed", "elapsedMs", "usageComplete"])) return null;
    const { candidates, attempted, completed, elapsedMs, usageComplete } = record;
    if (
      !Number.isSafeInteger(candidates) || (candidates as number) < 0 || (candidates as number) > MAX_RERANK_CANDIDATES
      || !Number.isSafeInteger(attempted) || (attempted as number) < 0 || (attempted as number) > (candidates as number)
      || !Number.isSafeInteger(completed) || (completed as number) < 0 || (completed as number) > (attempted as number)
      || typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 86_400_000
      || typeof usageComplete !== "boolean"
      || (usageComplete && (completed !== attempted || ((attempted as number) > 0 && (usage?.inputTokens === undefined || usage.outputTokens === undefined))))
    ) return null;
    accounting = Object.freeze({ candidates: candidates as number, attempted: attempted as number,
      completed: completed as number, elapsedMs, usageComplete });
  }
  return {
    ...(model === undefined ? {} : { model }),
    ...(usage === undefined ? {} : { usage: Object.freeze(usage) }),
    ...(accounting === undefined ? {} : { accounting }),
  };
}

function inspectRerankResult(value: unknown): SearchRerankResult {
  let details: SearchRerankDetails = {};
  const malformed = (): SearchRerankResult => ({
    status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE, ...details,
  });
  try {
    const result = dataRecord(value);
    if (result === null || typeof result["status"] !== "string") {
      return malformed();
    }
    const inspectedDetails = inspectRerankDetails(result);
    if (inspectedDetails === null) return malformed();
    details = inspectedDetails;
    if (result["status"] === "failed" || result["status"] === "unavailable") {
      if (
        !hasOnlyKeys(result, ["status", "message", "model", "usage", "accounting"])
        || !boundedDiagnostic(result["message"])
      ) {
        return malformed();
      }
      return { status: result["status"], message: result["message"], ...details };
    }
    if (result["status"] !== "ready" || !hasOnlyKeys(
      result,
      ["status", "ordering", "probabilities", "confidence", "model", "usage", "accounting"],
    )) {
      return malformed();
    }
    if (!Array.isArray(result["ordering"]) || result["ordering"].length > MAX_RERANK_CANDIDATES) {
      return malformed();
    }
    const ordering: string[] = [];
    const rawOrdering = result["ordering"] as readonly unknown[];
    for (let index = 0; index < rawOrdering.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(rawOrdering, String(index));
      const id = descriptor !== undefined && "value" in descriptor ? descriptor.value as unknown : undefined;
      if (typeof id !== "string" || id === "" || Buffer.byteLength(id, "utf8") > MAX_RERANK_STATE_BYTES) {
        return malformed();
      }
      ordering.push(id);
    }
    const rawProbabilities = dataRecord(result["probabilities"]);
    if (rawProbabilities === null) {
      return malformed();
    }
    const probabilities: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const [id, probability] of Object.entries(rawProbabilities)) {
      if (
        typeof probability !== "number"
        || !Number.isFinite(probability)
        || probability < 0
        || probability > 1
      ) {
        return malformed();
      }
      probabilities[id] = probability;
    }
    const confidence = result["confidence"];
    if (
      confidence !== undefined
      && (
        typeof confidence !== "number"
        || !Number.isFinite(confidence)
        || confidence < 0
        || confidence > 1
      )
    ) {
      return malformed();
    }
    return {
      status: "ready",
      ordering: Object.freeze(ordering),
      probabilities,
      ...(confidence === undefined ? {} : { confidence }),
      ...details,
    };
  } catch {
    return malformed();
  }
}

function failedRerank<T extends { readonly id: string; readonly rank: number }>(
  hits: readonly T[],
  message: string,
  details: SearchRerankDetails,
): AppliedRerank<T> {
  const result = { status: "failed" as const, message,
    ...(details.model === undefined ? {} : { model: details.model }),
    ...(details.usage === undefined ? {} : { usage: details.usage }),
    ...(details.accounting === undefined ? {} : { accounting: details.accounting }),
  };
  return { status: "failed", hits, placements: new Map(), result, message };
}

/**
 * Apply one rerank result to hits in baseline order. The window is the leading
 * `result.ordering.length` hits; exact identities stay first, then members are
 * sorted by probability descending, baseline rank, and id. Later hits keep
 * their baseline order and rank. A malformed result keeps the baseline order and reports
 * `failed` so callers can surface a degraded diagnostic. When expected window
 * ids are supplied, a partial candidate result is malformed rather than applied.
 */
export function applyRerank<T extends {
  readonly id: string;
  readonly rank: number;
  readonly identity?: boolean;
}>(
  hits: readonly T[],
  result: unknown,
  expectedWindowIds?: readonly string[],
): AppliedRerank<T> {
  const inspected = inspectRerankResult(result);
  if (inspected.status !== "ready") {
    return {
      status: inspected.status,
      hits,
      placements: new Map(),
      result: inspected,
      message: inspected.message,
    };
  }
  const ordering = inspected.ordering;
  if (
    expectedWindowIds !== undefined
    && (
      ordering.length !== expectedWindowIds.length
      || expectedWindowIds.some((id) => !ordering.includes(id))
    )
  ) {
    return failedRerank(hits, MALFORMED_RERANK_RESULT_MESSAGE, inspected);
  }
  const windowIds = new Set<string>();
  for (const id of ordering) {
    if (windowIds.has(id)) {
      return failedRerank(
        hits,
        "Rerank ordering contained a duplicate candidate id.",
        inspected,
      );
    }
    windowIds.add(id);
  }
  const window = hits.slice(0, ordering.length);
  const windowById = new Map(window.map((hit) => [hit.id, hit]));
  for (const id of ordering) {
    if (!windowById.has(id)) {
      return failedRerank(
        hits,
        "Rerank ordering contained an unknown candidate id.",
        inspected,
      );
    }
  }
  for (const hit of window) {
    if (!windowIds.has(hit.id)) {
      return failedRerank(
        hits,
        "Rerank ordering omitted a window candidate id.",
        inspected,
      );
    }
  }
  const probabilityKeys = Object.keys(inspected.probabilities);
  for (const id of probabilityKeys) {
    if (!windowIds.has(id)) {
      return failedRerank(
        hits,
        "Rerank probabilities contained an unknown candidate id.",
        inspected,
      );
    }
  }
  for (const id of ordering) {
    if (inspected.probabilities[id] === undefined) {
      return failedRerank(
        hits,
        "Rerank probability for a candidate id was missing or invalid.",
        inspected,
      );
    }
  }
  const probabilityOf = (id: string): number => inspected.probabilities[id] as number;
  const sorted = window.toSorted(
    (left, right) =>
      Number(right.identity === true) - Number(left.identity === true)
      || probabilityOf(right.id) - probabilityOf(left.id)
      || left.rank - right.rank
      || left.id.localeCompare(right.id),
  );
  const placements = new Map<string, RerankHitPlacement>();
  const reordered = sorted.map((hit, index) => {
    placements.set(hit.id, {
      baselineRank: hit.rank,
      rerankRank: index + 1,
      probability: probabilityOf(hit.id),
    });
    return hit.rank === index + 1 ? hit : { ...hit, rank: index + 1 };
  });
  return {
    status: "ready",
    hits: Object.freeze([...reordered, ...hits.slice(ordering.length)]),
    placements,
    result: inspected,
  };
}
