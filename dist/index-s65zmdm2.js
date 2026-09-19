// @bun
import {
  MAX_RERANK_CANDIDATES,
  MAX_RERANK_SNIPPET_BYTES,
  MAX_RERANK_STATE_BYTES
} from "./index-q2t3bq2c.js";

// src/rerank-typesafe.ts
var DEFAULT_SYSTEMONE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
var DEFAULT_SYSTEMONE_MODEL = "jev-latest";
var DEFAULT_RERANK_TIMEOUT_MS = 8000;
var DEFAULT_RERANK_MAX_RESPONSE_BYTES = 64 * 1024;
var DEFAULT_RERANK_CONCURRENCY = 8;
var MAX_RERANK_TIMEOUT_MS = DEFAULT_RERANK_TIMEOUT_MS;
var MAX_RERANK_RESPONSE_BYTES = DEFAULT_RERANK_MAX_RESPONSE_BYTES;
var MAX_RERANK_CONCURRENCY = DEFAULT_RERANK_CONCURRENCY;
var RELEVANCE_QUESTION = "relevant";
var RELEVANCE_INSTRUCTIONS = "Could this note help answer the search query in a personal Markdown knowledge " + "vault of notes, plans, concepts, and captured sources?";
var RELEVANCE_CRITERIA = {
  true: "The note's title, path, or snippet directly addresses the query's subject or task.",
  false: "The note is unrelated to the query or only touches a neighboring topic."
};
async function readBoundedResponse(response, maxBytes) {
  const body = response.body;
  if (body === null)
    return new Uint8Array;
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;; ) {
      const { done, value } = await reader.read();
      if (done)
        break;
      if (value === undefined || value.byteLength === 0)
        continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`response exceeds the ${maxBytes}-byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function fetchSystemOneTransport(request) {
  const signals = [AbortSignal.timeout(request.timeoutMs)];
  if (request.signal !== undefined)
    signals.push(request.signal);
  const body = new Uint8Array(request.body.byteLength);
  body.set(request.body);
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: body.buffer,
    redirect: "error",
    signal: AbortSignal.any(signals)
  });
  return {
    status: response.status,
    body: await readBoundedResponse(response, request.maxResponseBytes)
  };
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function recordValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function hasExactKeys(value, expected) {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
function tokenCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1e9 ? value : null;
}
function acceptedResponseModel(value) {
  return value === DEFAULT_SYSTEMONE_MODEL || typeof value === "string" && /^jev-[0-9]+(?:\.[0-9]+){2}$/u.test(value);
}
function parseSystemOneResponse(value) {
  const root = recordValue(value);
  if (root === null || !hasExactKeys(root, ["model", "answers", "usage"]))
    return null;
  const answers = recordValue(root["answers"]);
  if (answers === null || !hasExactKeys(answers, [RELEVANCE_QUESTION]))
    return null;
  const answer = recordValue(answers[RELEVANCE_QUESTION]);
  if (answer === null || !hasExactKeys(answer, ["type", "noul"]) || answer["type"] !== "noul")
    return null;
  const noul = finiteNumber(answer["noul"]);
  if (noul === null || noul < 0 || noul > 1)
    return null;
  const usage = recordValue(root["usage"]);
  if (usage === null || !hasExactKeys(usage, ["input_tokens", "output_tokens"]))
    return null;
  const inputTokens = tokenCount(usage["input_tokens"]);
  const outputTokens = tokenCount(usage["output_tokens"]);
  if (!acceptedResponseModel(root["model"]) || inputTokens === null || outputTokens === null)
    return null;
  return { noul, model: root["model"], inputTokens, outputTokens };
}
async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
function validApiKey(value) {
  return value !== undefined && /^[\x21-\x7e]{1,512}$/u.test(value);
}
function boundedPositiveInteger(value, fallback, maximum) {
  const resolved = value ?? fallback;
  return Number.isSafeInteger(resolved) && resolved >= 1 && resolved <= maximum ? resolved : null;
}
function validRerankRequest(value) {
  const request = recordValue(value);
  if (request === null || typeof request["query"] !== "string" || request["query"].trim() === "" || Buffer.byteLength(request["query"], "utf8") > MAX_RERANK_STATE_BYTES || !Array.isArray(request["candidates"]) || request["candidates"].length > MAX_RERANK_CANDIDATES)
    return false;
  const ids = new Set;
  for (const [index, value2] of request["candidates"].entries()) {
    const candidate = recordValue(value2);
    if (candidate === null || typeof candidate["id"] !== "string" || candidate["id"] === "" || ids.has(candidate["id"]) || candidate["baselineRank"] !== index + 1 || typeof candidate["score"] !== "number" || !Number.isFinite(candidate["score"]) || typeof candidate["title"] !== "string" || typeof candidate["path"] !== "string" || typeof candidate["snippet"] !== "string" || Buffer.byteLength(candidate["id"], "utf8") > MAX_RERANK_STATE_BYTES || Buffer.byteLength(candidate["title"], "utf8") > MAX_RERANK_STATE_BYTES || Buffer.byteLength(candidate["path"], "utf8") > MAX_RERANK_STATE_BYTES || Buffer.byteLength(candidate["snippet"], "utf8") > MAX_RERANK_SNIPPET_BYTES)
      return false;
    ids.add(candidate["id"]);
  }
  return true;
}
function createTypeSafeReranker(options = {}) {
  const transport = options.transport ?? fetchSystemOneTransport;
  const timeoutMs = boundedPositiveInteger(options.timeoutMs, DEFAULT_RERANK_TIMEOUT_MS, MAX_RERANK_TIMEOUT_MS);
  const maxResponseBytes = boundedPositiveInteger(options.maxResponseBytes, DEFAULT_RERANK_MAX_RESPONSE_BYTES, MAX_RERANK_RESPONSE_BYTES);
  const concurrency = boundedPositiveInteger(options.concurrency, DEFAULT_RERANK_CONCURRENCY, MAX_RERANK_CONCURRENCY);
  const environment = options.environment ?? process.env;
  const apiKey = Object.hasOwn(environment, "TYPESAFE_API_KEY") ? environment["TYPESAFE_API_KEY"] : undefined;
  return {
    id: "typesafe",
    rerank: async (request) => {
      if (timeoutMs === null || maxResponseBytes === null || concurrency === null) {
        return { status: "failed", message: "TypeSafe rerank configuration was invalid." };
      }
      if (!validApiKey(apiKey)) {
        return {
          status: "unavailable",
          message: "TYPESAFE_API_KEY is missing or invalid; the TypeSafe rerank lane is unavailable."
        };
      }
      try {
        if (!validRerankRequest(request)) {
          return { status: "failed", message: "TypeSafe rerank request was malformed or exceeded its limits." };
        }
        if (request.signal?.aborted === true) {
          return { status: "failed", message: "TypeSafe rerank request was aborted." };
        }
        if (request.candidates.length === 0) {
          return { status: "ready", ordering: [], probabilities: {} };
        }
        const encoder = new TextEncoder;
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const bodies = [];
        for (const candidate of request.candidates) {
          const state = {
            query: request.query,
            candidate: {
              key: candidate.id,
              title: candidate.title,
              path: candidate.path,
              snippet: candidate.snippet
            }
          };
          const stateBytes = encoder.encode(JSON.stringify(state)).byteLength;
          if (stateBytes > MAX_RERANK_STATE_BYTES) {
            return {
              status: "failed",
              message: `TypeSafe rerank state exceeds the ${MAX_RERANK_STATE_BYTES}-byte limit.`
            };
          }
          bodies.push(encoder.encode(JSON.stringify({
            model: DEFAULT_SYSTEMONE_MODEL,
            state,
            questions: {
              [RELEVANCE_QUESTION]: {
                type: "noul",
                instructions: RELEVANCE_INSTRUCTIONS,
                criteria: RELEVANCE_CRITERIA
              }
            }
          })));
        }
        let firstFailure;
        const failed = (message) => {
          firstFailure ??= message;
          return { ok: false, message: firstFailure };
        };
        const scoreCandidate = async (body) => {
          if (firstFailure !== undefined)
            return { ok: false, message: firstFailure };
          if (request.signal?.aborted === true) {
            return failed("TypeSafe rerank request was aborted.");
          }
          let response;
          try {
            response = await transport({
              url: DEFAULT_SYSTEMONE_ENDPOINT,
              body,
              headers: {
                authorization: `Bearer ${apiKey}`,
                "content-type": "application/json"
              },
              timeoutMs,
              maxResponseBytes,
              ...request.signal === undefined ? {} : { signal: request.signal }
            });
          } catch {
            return failed("TypeSafe rerank request failed.");
          }
          if (!Number.isSafeInteger(response.status) || !(response.body instanceof Uint8Array) || response.body.byteLength > maxResponseBytes) {
            return failed("TypeSafe rerank transport returned a malformed or oversized response.");
          }
          if (response.status !== 200) {
            return failed(`TypeSafe rerank request returned HTTP ${response.status}.`);
          }
          let parsed;
          try {
            parsed = JSON.parse(decoder.decode(response.body));
          } catch {
            return failed("TypeSafe rerank response was not valid UTF-8 JSON.");
          }
          const answer = parseSystemOneResponse(parsed);
          if (answer === null) {
            return failed("TypeSafe rerank response was malformed.");
          }
          return {
            ok: true,
            noul: answer.noul,
            model: answer.model,
            inputTokens: answer.inputTokens,
            outputTokens: answer.outputTokens
          };
        };
        const scored = await mapWithConcurrency(bodies, concurrency, scoreCandidate);
        const failure = scored.find((entry) => !entry.ok);
        if (failure !== undefined && !failure.ok) {
          return { status: "failed", message: failure.message };
        }
        const probabilities = Object.create(null);
        let inputTokens = 0;
        let outputTokens = 0;
        let responseModel;
        for (const [index, entry] of scored.entries()) {
          if (!entry.ok)
            continue;
          const candidate = request.candidates[index];
          if (candidate === undefined) {
            return { status: "failed", message: "TypeSafe rerank result was incomplete." };
          }
          if (responseModel !== undefined && responseModel !== entry.model) {
            return { status: "failed", message: "TypeSafe rerank responses used inconsistent models." };
          }
          probabilities[candidate.id] = entry.noul;
          responseModel ??= entry.model;
          inputTokens += entry.inputTokens;
          outputTokens += entry.outputTokens;
        }
        const ordering = request.candidates.toSorted((left, right) => (probabilities[right.id] ?? -1) - (probabilities[left.id] ?? -1) || left.baselineRank - right.baselineRank || left.id.localeCompare(right.id)).map(({ id }) => id);
        return {
          status: "ready",
          ordering: Object.freeze(ordering),
          probabilities,
          model: responseModel ?? DEFAULT_SYSTEMONE_MODEL,
          usage: { inputTokens, outputTokens }
        };
      } catch {
        return { status: "failed", message: "TypeSafe rerank request was malformed or failed." };
      }
    }
  };
}

export { DEFAULT_SYSTEMONE_ENDPOINT, DEFAULT_SYSTEMONE_MODEL, createTypeSafeReranker };
