// @bun
// src/rerank.ts
var MAX_RERANK_CANDIDATES = 25;
var MAX_RERANK_SNIPPET_BYTES = 512;
var MAX_RERANK_STATE_BYTES = 24 * 1024;
var MALFORMED_RERANK_RESULT_MESSAGE = "Rerank engine returned a malformed result.";
var MAX_RERANK_DIAGNOSTIC_BYTES = 512;
var MAX_RERANK_MODEL_BYTES = 128;
var MAX_RERANK_TOKEN_COUNT = 1e9;
function dataRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_RERANK_CANDIDATES)
    return null;
  const output = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string")
      return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable)
      return null;
    output[key] = descriptor.value;
  }
  return output;
}
function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function boundedDiagnostic(value) {
  return typeof value === "string" && value !== "" && Buffer.byteLength(value, "utf8") <= MAX_RERANK_DIAGNOSTIC_BYTES && !/[\u0000-\u001f\u007f]/u.test(value);
}
function tokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_RERANK_TOKEN_COUNT;
}
function inspectRerankDetails(result) {
  const model = result["model"];
  if (model !== undefined && (typeof model !== "string" || !/^[\x20-\x7e]+$/u.test(model) || Buffer.byteLength(model, "utf8") > MAX_RERANK_MODEL_BYTES)) {
    return null;
  }
  const rawUsage = result["usage"];
  let usage;
  if (rawUsage !== undefined) {
    const usageRecord = dataRecord(rawUsage);
    if (usageRecord === null || !hasOnlyKeys(usageRecord, ["inputTokens", "outputTokens"]) || usageRecord["inputTokens"] !== undefined && !tokenCount(usageRecord["inputTokens"]) || usageRecord["outputTokens"] !== undefined && !tokenCount(usageRecord["outputTokens"])) {
      return null;
    }
    usage = {
      ...usageRecord["inputTokens"] === undefined ? {} : { inputTokens: usageRecord["inputTokens"] },
      ...usageRecord["outputTokens"] === undefined ? {} : { outputTokens: usageRecord["outputTokens"] }
    };
  }
  const rawAccounting = result["accounting"];
  let accounting;
  if (rawAccounting !== undefined) {
    const record = dataRecord(rawAccounting);
    if (record === null || !hasOnlyKeys(record, ["candidates", "attempted", "completed", "elapsedMs", "usageComplete"]))
      return null;
    const { candidates, attempted, completed, elapsedMs, usageComplete } = record;
    if (!Number.isSafeInteger(candidates) || candidates < 0 || candidates > MAX_RERANK_CANDIDATES || !Number.isSafeInteger(attempted) || attempted < 0 || attempted > candidates || !Number.isSafeInteger(completed) || completed < 0 || completed > attempted || typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 86400000 || typeof usageComplete !== "boolean" || usageComplete && (completed !== attempted || attempted > 0 && (usage?.inputTokens === undefined || usage.outputTokens === undefined)))
      return null;
    accounting = Object.freeze({
      candidates,
      attempted,
      completed,
      elapsedMs,
      usageComplete
    });
  }
  return {
    ...model === undefined ? {} : { model },
    ...usage === undefined ? {} : { usage: Object.freeze(usage) },
    ...accounting === undefined ? {} : { accounting }
  };
}
function inspectRerankResult(value) {
  let details = {};
  const malformed = () => ({
    status: "failed",
    message: MALFORMED_RERANK_RESULT_MESSAGE,
    ...details
  });
  try {
    const result = dataRecord(value);
    if (result === null || typeof result["status"] !== "string") {
      return malformed();
    }
    const inspectedDetails = inspectRerankDetails(result);
    if (inspectedDetails === null)
      return malformed();
    details = inspectedDetails;
    if (result["status"] === "failed" || result["status"] === "unavailable") {
      if (!hasOnlyKeys(result, ["status", "message", "model", "usage", "accounting"]) || !boundedDiagnostic(result["message"])) {
        return malformed();
      }
      return { status: result["status"], message: result["message"], ...details };
    }
    if (result["status"] !== "ready" || !hasOnlyKeys(result, ["status", "ordering", "probabilities", "confidence", "model", "usage", "accounting"])) {
      return malformed();
    }
    if (!Array.isArray(result["ordering"]) || result["ordering"].length > MAX_RERANK_CANDIDATES) {
      return malformed();
    }
    const ordering = [];
    const rawOrdering = result["ordering"];
    for (let index = 0;index < rawOrdering.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(rawOrdering, String(index));
      const id = descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
      if (typeof id !== "string" || id === "" || Buffer.byteLength(id, "utf8") > MAX_RERANK_STATE_BYTES) {
        return malformed();
      }
      ordering.push(id);
    }
    const rawProbabilities = dataRecord(result["probabilities"]);
    if (rawProbabilities === null) {
      return malformed();
    }
    const probabilities = Object.create(null);
    for (const [id, probability] of Object.entries(rawProbabilities)) {
      if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
        return malformed();
      }
      probabilities[id] = probability;
    }
    const confidence = result["confidence"];
    if (confidence !== undefined && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
      return malformed();
    }
    return {
      status: "ready",
      ordering: Object.freeze(ordering),
      probabilities,
      ...confidence === undefined ? {} : { confidence },
      ...details
    };
  } catch {
    return malformed();
  }
}
function failedRerank(hits, message, details) {
  const result = {
    status: "failed",
    message,
    ...details.model === undefined ? {} : { model: details.model },
    ...details.usage === undefined ? {} : { usage: details.usage },
    ...details.accounting === undefined ? {} : { accounting: details.accounting }
  };
  return { status: "failed", hits, placements: new Map, result, message };
}
function applyRerank(hits, result, expectedWindowIds) {
  const inspected = inspectRerankResult(result);
  if (inspected.status !== "ready") {
    return {
      status: inspected.status,
      hits,
      placements: new Map,
      result: inspected,
      message: inspected.message
    };
  }
  const ordering = inspected.ordering;
  if (expectedWindowIds !== undefined && (ordering.length !== expectedWindowIds.length || expectedWindowIds.some((id) => !ordering.includes(id)))) {
    return failedRerank(hits, MALFORMED_RERANK_RESULT_MESSAGE, inspected);
  }
  const windowIds = new Set;
  for (const id of ordering) {
    if (windowIds.has(id)) {
      return failedRerank(hits, "Rerank ordering contained a duplicate candidate id.", inspected);
    }
    windowIds.add(id);
  }
  const window = hits.slice(0, ordering.length);
  const windowById = new Map(window.map((hit) => [hit.id, hit]));
  for (const id of ordering) {
    if (!windowById.has(id)) {
      return failedRerank(hits, "Rerank ordering contained an unknown candidate id.", inspected);
    }
  }
  for (const hit of window) {
    if (!windowIds.has(hit.id)) {
      return failedRerank(hits, "Rerank ordering omitted a window candidate id.", inspected);
    }
  }
  const probabilityKeys = Object.keys(inspected.probabilities);
  for (const id of probabilityKeys) {
    if (!windowIds.has(id)) {
      return failedRerank(hits, "Rerank probabilities contained an unknown candidate id.", inspected);
    }
  }
  for (const id of ordering) {
    if (inspected.probabilities[id] === undefined) {
      return failedRerank(hits, "Rerank probability for a candidate id was missing or invalid.", inspected);
    }
  }
  const probabilityOf = (id) => inspected.probabilities[id];
  const sorted = window.toSorted((left, right) => Number(right.identity === true) - Number(left.identity === true) || probabilityOf(right.id) - probabilityOf(left.id) || left.rank - right.rank || left.id.localeCompare(right.id));
  const placements = new Map;
  const reordered = sorted.map((hit, index) => {
    placements.set(hit.id, {
      baselineRank: hit.rank,
      rerankRank: index + 1,
      probability: probabilityOf(hit.id)
    });
    return hit.rank === index + 1 ? hit : { ...hit, rank: index + 1 };
  });
  return {
    status: "ready",
    hits: Object.freeze([...reordered, ...hits.slice(ordering.length)]),
    placements,
    result: inspected
  };
}

export { MAX_RERANK_CANDIDATES, MAX_RERANK_SNIPPET_BYTES, MAX_RERANK_STATE_BYTES, applyRerank };
