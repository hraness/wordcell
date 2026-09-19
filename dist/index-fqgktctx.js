// @bun
import {
  MAX_RERANK_STATE_BYTES
} from "./index-sbg6k9q1.js";

// src/rerank-typesafe.ts
var DEFAULT_SYSTEMONE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
var DEFAULT_SYSTEMONE_MODEL = "jev-latest";
var DEFAULT_RERANK_TIMEOUT_MS = 8000;
var DEFAULT_RERANK_MAX_RESPONSE_BYTES = 64 * 1024;
var DEFAULT_RERANK_CONCURRENCY = 8;
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
    signal: AbortSignal.any(signals)
  });
  return {
    status: response.status,
    body: await readBoundedResponse(response, request.maxResponseBytes)
  };
}
function sanitizeMessage(text, secret) {
  return secret === "" ? text : text.split(secret).join("[redacted]");
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
  return value === DEFAULT_SYSTEMONE_MODEL || typeof value === "string" && /^jev-[0-9]+(?:\.[0-9]+){2}(?:[-+][A-Za-z0-9.-]+)?$/u.test(value);
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
function createTypeSafeReranker(options = {}) {
  const transport = options.transport ?? fetchSystemOneTransport;
  const timeoutMs = options.timeoutMs ?? DEFAULT_RERANK_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_RERANK_MAX_RESPONSE_BYTES;
  const concurrency = options.concurrency ?? DEFAULT_RERANK_CONCURRENCY;
  const apiKey = options.apiKey ?? options.environment?.["TYPESAFE_API_KEY"] ?? process.env["TYPESAFE_API_KEY"];
  return {
    id: "typesafe",
    rerank: async (request) => {
      if (!validApiKey(apiKey)) {
        return {
          status: "unavailable",
          message: "TYPESAFE_API_KEY is missing or invalid; the TypeSafe rerank lane is unavailable."
        };
      }
      if (request.candidates.length === 0) {
        return { status: "ready", ordering: [], probabilities: {} };
      }
      const encoder = new TextEncoder;
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const scoreCandidate = async (candidate) => {
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
            ok: false,
            message: `TypeSafe rerank state exceeds the ${MAX_RERANK_STATE_BYTES}-byte limit.`
          };
        }
        const body = encoder.encode(JSON.stringify({
          model: DEFAULT_SYSTEMONE_MODEL,
          state,
          questions: {
            [RELEVANCE_QUESTION]: {
              type: "noul",
              instructions: RELEVANCE_INSTRUCTIONS,
              criteria: RELEVANCE_CRITERIA
            }
          }
        }));
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
        } catch (error) {
          const raw = error instanceof Error ? error.message : String(error);
          return {
            ok: false,
            message: `TypeSafe rerank request failed: ${sanitizeMessage(raw, apiKey)}`
          };
        }
        if (response.status !== 200) {
          return {
            ok: false,
            message: `TypeSafe rerank request returned HTTP ${response.status}.`
          };
        }
        let parsed;
        try {
          parsed = JSON.parse(decoder.decode(response.body));
        } catch {
          return { ok: false, message: "TypeSafe rerank response was not valid JSON." };
        }
        const answer = parseSystemOneResponse(parsed);
        if (answer === null) {
          return { ok: false, message: "TypeSafe rerank response was malformed." };
        }
        return {
          ok: true,
          noul: answer.noul,
          ...answer.model === undefined ? {} : { model: answer.model },
          ...answer.inputTokens === undefined ? {} : { inputTokens: answer.inputTokens },
          ...answer.outputTokens === undefined ? {} : { outputTokens: answer.outputTokens }
        };
      };
      const scored = await mapWithConcurrency(request.candidates, concurrency, scoreCandidate);
      const failure = scored.find((entry) => !entry.ok);
      if (failure !== undefined && !failure.ok) {
        return { status: "failed", message: failure.message };
      }
      const probabilities = {};
      let inputTokens = 0;
      let outputTokens = 0;
      let sawUsage = false;
      let responseModel;
      for (const [index, entry] of scored.entries()) {
        if (!entry.ok)
          continue;
        const candidate = request.candidates[index];
        if (candidate === undefined)
          continue;
        probabilities[candidate.id] = entry.noul;
        responseModel ??= entry.model;
        if (entry.inputTokens !== undefined || entry.outputTokens !== undefined) {
          sawUsage = true;
          inputTokens += entry.inputTokens ?? 0;
          outputTokens += entry.outputTokens ?? 0;
        }
      }
      const ordering = request.candidates.toSorted((left, right) => (probabilities[right.id] ?? -1) - (probabilities[left.id] ?? -1) || left.baselineRank - right.baselineRank || left.id.localeCompare(right.id)).map(({ id }) => id);
      return {
        status: "ready",
        ordering: Object.freeze(ordering),
        probabilities,
        model: responseModel ?? DEFAULT_SYSTEMONE_MODEL,
        ...sawUsage ? { usage: { inputTokens, outputTokens } } : {}
      };
    }
  };
}

export { DEFAULT_SYSTEMONE_ENDPOINT, DEFAULT_SYSTEMONE_MODEL, createTypeSafeReranker };
