// @bun
// src/rerank.ts
var MAX_RERANK_CANDIDATES = 25;
var MAX_RERANK_SNIPPET_BYTES = 512;
var MAX_RERANK_STATE_BYTES = 24 * 1024;
function failedRerank(hits, message) {
  return { status: "failed", hits, placements: new Map, message };
}
function applyRerank(hits, result) {
  if (result.status !== "ready") {
    return {
      status: result.status,
      hits,
      placements: new Map,
      message: result.message
    };
  }
  const ordering = result.ordering;
  const windowIds = new Set;
  for (const id of ordering) {
    if (typeof id !== "string" || id === "") {
      return failedRerank(hits, "Rerank ordering contained an empty candidate id.");
    }
    if (windowIds.has(id)) {
      return failedRerank(hits, `Rerank ordering contained duplicate candidate id ${JSON.stringify(id)}.`);
    }
    windowIds.add(id);
  }
  const window = hits.slice(0, ordering.length);
  const windowById = new Map(window.map((hit) => [hit.id, hit]));
  for (const id of ordering) {
    if (!windowById.has(id)) {
      return failedRerank(hits, `Rerank ordering contained unknown candidate id ${JSON.stringify(id)}.`);
    }
  }
  for (const hit of window) {
    if (!windowIds.has(hit.id)) {
      return failedRerank(hits, `Rerank ordering omitted window candidate id ${JSON.stringify(hit.id)}.`);
    }
  }
  const probabilityKeys = Object.keys(result.probabilities);
  for (const id of probabilityKeys) {
    if (!windowIds.has(id)) {
      return failedRerank(hits, `Rerank probabilities contained unknown candidate id ${JSON.stringify(id)}.`);
    }
  }
  for (const id of ordering) {
    const probability = result.probabilities[id];
    if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      return failedRerank(hits, `Rerank probability for candidate id ${JSON.stringify(id)} was missing or invalid.`);
    }
  }
  const probabilityOf = (id) => result.probabilities[id];
  const sorted = window.toSorted((left, right) => probabilityOf(right.id) - probabilityOf(left.id) || left.rank - right.rank || left.id.localeCompare(right.id));
  const placements = new Map;
  const reordered = sorted.map((hit, index) => {
    placements.set(hit.id, {
      baselineRank: hit.rank,
      rerankRank: index + 1,
      ...result.probabilities[hit.id] === undefined ? {} : { probability: result.probabilities[hit.id] }
    });
    return hit.rank === index + 1 ? hit : { ...hit, rank: index + 1 };
  });
  return {
    status: "ready",
    hits: Object.freeze([...reordered, ...hits.slice(ordering.length)]),
    placements
  };
}

export { MAX_RERANK_CANDIDATES, MAX_RERANK_SNIPPET_BYTES, MAX_RERANK_STATE_BYTES, applyRerank };
