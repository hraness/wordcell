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
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string")
      return null;
    const descriptor = descriptors[key];
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
function inspectRerankResult(value) {
  try {
    const result = dataRecord(value);
    if (result === null || typeof result["status"] !== "string") {
      return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
    }
    if (result["status"] === "failed" || result["status"] === "unavailable") {
      if (!hasOnlyKeys(result, ["status", "message"]) || !boundedDiagnostic(result["message"])) {
        return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
      }
      return { status: result["status"], message: result["message"] };
    }
    if (result["status"] !== "ready" || !hasOnlyKeys(result, ["status", "ordering", "probabilities", "confidence", "model", "usage"])) {
      return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
    }
    if (!Array.isArray(result["ordering"]) || result["ordering"].length > MAX_RERANK_CANDIDATES) {
      return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
    }
    const ordering = [];
    for (const id of result["ordering"]) {
      if (typeof id !== "string" || id === "") {
        return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
      }
      ordering.push(id);
    }
    const rawProbabilities = dataRecord(result["probabilities"]);
    if (rawProbabilities === null) {
      return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
    }
    const probabilities = Object.create(null);
    for (const [id, probability] of Object.entries(rawProbabilities)) {
      if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
        return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
      }
      probabilities[id] = probability;
    }
    const confidence = result["confidence"];
    if (confidence !== undefined && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
      return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
    }
    const model = result["model"];
    if (model !== undefined && (typeof model !== "string" || !/^[\x20-\x7e]+$/u.test(model) || Buffer.byteLength(model, "utf8") > MAX_RERANK_MODEL_BYTES)) {
      return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
    }
    const rawUsage = result["usage"];
    let usage;
    if (rawUsage !== undefined) {
      const usageRecord = dataRecord(rawUsage);
      if (usageRecord === null || !hasOnlyKeys(usageRecord, ["inputTokens", "outputTokens"]) || usageRecord["inputTokens"] !== undefined && !tokenCount(usageRecord["inputTokens"]) || usageRecord["outputTokens"] !== undefined && !tokenCount(usageRecord["outputTokens"])) {
        return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
      }
      usage = {
        ...usageRecord["inputTokens"] === undefined ? {} : { inputTokens: usageRecord["inputTokens"] },
        ...usageRecord["outputTokens"] === undefined ? {} : { outputTokens: usageRecord["outputTokens"] }
      };
    }
    return {
      status: "ready",
      ordering: Object.freeze(ordering),
      probabilities,
      ...confidence === undefined ? {} : { confidence },
      ...model === undefined ? {} : { model },
      ...usage === undefined ? {} : { usage }
    };
  } catch {
    return { status: "failed", message: MALFORMED_RERANK_RESULT_MESSAGE };
  }
}
function failedRerank(hits, message) {
  const result = { status: "failed", message };
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
    return failedRerank(hits, MALFORMED_RERANK_RESULT_MESSAGE);
  }
  const windowIds = new Set;
  for (const id of ordering) {
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
  const probabilityKeys = Object.keys(inspected.probabilities);
  for (const id of probabilityKeys) {
    if (!windowIds.has(id)) {
      return failedRerank(hits, `Rerank probabilities contained unknown candidate id ${JSON.stringify(id)}.`);
    }
  }
  for (const id of ordering) {
    if (inspected.probabilities[id] === undefined) {
      return failedRerank(hits, `Rerank probability for candidate id ${JSON.stringify(id)} was missing or invalid.`);
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
