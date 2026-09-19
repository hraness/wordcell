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

export type SearchRerankResult =
  | {
      readonly status: "ready";
      /** A permutation of the window ids the engine ranked. */
      readonly ordering: readonly string[];
      /** Engine-assigned relevance probability per candidate id. */
      readonly probabilities: Readonly<Record<string, number>>;
      readonly confidence?: number;
      readonly model?: string;
      readonly usage?: {
        readonly inputTokens?: number;
        readonly outputTokens?: number;
      };
    }
  | { readonly status: "unavailable" | "failed"; readonly message: string };

export type SearchReranker = {
  readonly id: string;
  readonly rerank: (request: SearchRerankRequest) => Promise<SearchRerankResult>;
};

export type KnowledgeBaseSearchRerankOptions = {
  readonly engine: "typesafe";
  /** Window size submitted to the engine, from 2 through MAX_RERANK_CANDIDATES. */
  readonly limit?: number;
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
  readonly message?: string;
};

function failedRerank<T extends { readonly id: string; readonly rank: number }>(
  hits: readonly T[],
  message: string,
): AppliedRerank<T> {
  return { status: "failed", hits, placements: new Map(), message };
}

/**
 * Apply one rerank result to hits in baseline order. The window is the leading
 * `result.ordering.length` hits; its members are sorted by probability
 * descending, then baseline rank, then id. Later hits keep their baseline
 * order and rank. A malformed ordering keeps the baseline order and reports
 * `failed` so callers can surface a degraded diagnostic.
 */
export function applyRerank<T extends { readonly id: string; readonly rank: number }>(
  hits: readonly T[],
  result: SearchRerankResult,
): AppliedRerank<T> {
  if (result.status !== "ready") {
    return {
      status: result.status,
      hits,
      placements: new Map(),
      message: result.message,
    };
  }
  const ordering = result.ordering;
  const windowIds = new Set<string>();
  for (const id of ordering) {
    if (typeof id !== "string" || id === "") {
      return failedRerank(hits, "Rerank ordering contained an empty candidate id.");
    }
    if (windowIds.has(id)) {
      return failedRerank(
        hits,
        `Rerank ordering contained duplicate candidate id ${JSON.stringify(id)}.`,
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
        `Rerank ordering contained unknown candidate id ${JSON.stringify(id)}.`,
      );
    }
  }
  for (const hit of window) {
    if (!windowIds.has(hit.id)) {
      return failedRerank(
        hits,
        `Rerank ordering omitted window candidate id ${JSON.stringify(hit.id)}.`,
      );
    }
  }
  const probabilityKeys = Object.keys(result.probabilities);
  for (const id of probabilityKeys) {
    if (!windowIds.has(id)) {
      return failedRerank(
        hits,
        `Rerank probabilities contained unknown candidate id ${JSON.stringify(id)}.`,
      );
    }
  }
  for (const id of ordering) {
    const probability = result.probabilities[id];
    if (
      typeof probability !== "number"
      || !Number.isFinite(probability)
      || probability < 0
      || probability > 1
    ) {
      return failedRerank(
        hits,
        `Rerank probability for candidate id ${JSON.stringify(id)} was missing or invalid.`,
      );
    }
  }
  const probabilityOf = (id: string): number => result.probabilities[id] as number;
  const sorted = window.toSorted(
    (left, right) =>
      probabilityOf(right.id) - probabilityOf(left.id)
      || left.rank - right.rank
      || left.id.localeCompare(right.id),
  );
  const placements = new Map<string, RerankHitPlacement>();
  const reordered = sorted.map((hit, index) => {
    placements.set(hit.id, {
      baselineRank: hit.rank,
      rerankRank: index + 1,
      ...(result.probabilities[hit.id] === undefined
        ? {}
        : { probability: result.probabilities[hit.id] }),
    });
    return hit.rank === index + 1 ? hit : { ...hit, rank: index + 1 };
  });
  return {
    status: "ready",
    hits: Object.freeze([...reordered, ...hits.slice(ordering.length)]),
    placements,
  };
}
