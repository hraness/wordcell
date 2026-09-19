// @bun
import {
  MAX_RERANK_CANDIDATES,
  MAX_RERANK_SNIPPET_BYTES,
  MAX_RERANK_STATE_BYTES
} from "./index-j70m75wd.js";

// src/rerank-typesafe.ts
var DEFAULT_SYSTEMONE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
var DEFAULT_SYSTEMONE_MODEL = "jev-1.13.0";
var DEFAULT_RERANK_TIMEOUT_MS = 8000;
var DEFAULT_RERANK_MAX_RESPONSE_BYTES = 64 * 1024;
var DEFAULT_RERANK_CONCURRENCY = 4;
var MAX_RERANK_TIMEOUT_MS = DEFAULT_RERANK_TIMEOUT_MS;
var MAX_RERANK_RESPONSE_BYTES = DEFAULT_RERANK_MAX_RESPONSE_BYTES;
var MAX_RERANK_CONCURRENCY = 8;
var RELEVANCE_QUESTION = "relevant";
var RELEVANCE_INSTRUCTIONS = "Could this note help answer the search query in a personal Markdown knowledge " + "vault of notes, plans, concepts, and captured sources?";
var RELEVANCE_CRITERIA = {
  true: "The note's title, path, or snippet directly addresses the query's subject or task.",
  false: "The note is unrelated to the query or only touches a neighboring topic."
};
async function readBoundedResponse(response, maxBytes, signal) {
  const body = response.body;
  if (body === null)
    return new Uint8Array;
  const reader = body.getReader();
  const abort = () => {
    reader.cancel().catch(() => {
      return;
    });
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks = [];
  let total = 0;
  try {
    for (;; ) {
      if (signal.aborted)
        throw new Error("request aborted");
      const { done, value } = await reader.read();
      if (signal.aborted)
        throw new Error("request aborted");
      if (done)
        break;
      if (value === undefined || value.byteLength === 0)
        continue;
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {
          return;
        });
        throw new Error(`response exceeds the ${maxBytes}-byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    if (signal.aborted)
      abort();
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
  const signal = AbortSignal.any(signals);
  const body = new Uint8Array(request.body.byteLength);
  body.set(request.body);
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: body.buffer,
    redirect: "error",
    signal
  });
  if (signal.aborted) {
    response.body?.cancel().catch(() => {
      return;
    });
    throw new Error("request aborted");
  }
  return {
    status: response.status,
    body: await readBoundedResponse(response, request.maxResponseBytes, signal)
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
  return value === DEFAULT_SYSTEMONE_MODEL;
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
  if (request === null || typeof request["query"] !== "string" || request["query"].trim() === "" || Buffer.byteLength(request["query"], "utf8") > MAX_RERANK_STATE_BYTES || request["signal"] !== undefined && !(request["signal"] instanceof AbortSignal) || !Array.isArray(request["candidates"]) || request["candidates"].length > MAX_RERANK_CANDIDATES)
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
      const started = performance.now();
      const controller = new AbortController;
      let attempted = 0;
      let completed = 0;
      let usageReceipts = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let candidateCount = 0;
      let observedModel;
      let closed = false;
      let firstFailure;
      let timer;
      let callerAbort;
      let callerSignal;
      let resolveStopped;
      const stopped = new Promise((resolve) => {
        resolveStopped = resolve;
      });
      const stop = (message) => {
        firstFailure ??= message;
        controller.abort();
        resolveStopped?.();
      };
      const details = () => attempted === 0 ? {} : {
        ...observedModel === undefined ? {} : { model: observedModel },
        usage: Object.freeze({ inputTokens, outputTokens }),
        accounting: Object.freeze({
          candidates: candidateCount,
          attempted,
          completed,
          elapsedMs: performance.now() - started,
          usageComplete: usageReceipts === attempted && completed === attempted
        })
      };
      const failed = (message) => ({
        status: "failed",
        message,
        ...details()
      });
      try {
        if (timeoutMs === null || maxResponseBytes === null || concurrency === null) {
          return failed("TypeSafe rerank configuration was invalid.");
        }
        if (!validRerankRequest(request)) {
          return failed("TypeSafe rerank request was malformed or exceeded its limits.");
        }
        candidateCount = request.candidates.length;
        callerSignal = request.signal;
        if (callerSignal?.aborted === true) {
          return failed("TypeSafe rerank request was aborted.");
        }
        if (!validApiKey(apiKey)) {
          return { status: "unavailable", message: "TYPESAFE_API_KEY is missing or invalid; the TypeSafe rerank lane is unavailable." };
        }
        if (candidateCount === 0)
          return { status: "ready", ordering: [], probabilities: {} };
        const encoder = new TextEncoder;
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const bodies = [];
        for (const candidate of request.candidates) {
          const state = { query: request.query, candidate: {
            key: candidate.id,
            title: candidate.title,
            path: candidate.path,
            snippet: candidate.snippet
          } };
          if (encoder.encode(JSON.stringify(state)).byteLength > MAX_RERANK_STATE_BYTES) {
            return failed(`TypeSafe rerank state exceeds the ${MAX_RERANK_STATE_BYTES}-byte limit.`);
          }
          bodies.push(encoder.encode(JSON.stringify({
            model: DEFAULT_SYSTEMONE_MODEL,
            state,
            questions: { [RELEVANCE_QUESTION]: {
              type: "noul",
              instructions: RELEVANCE_INSTRUCTIONS,
              criteria: RELEVANCE_CRITERIA
            } }
          })));
        }
        const deadline = started + timeoutMs;
        const timeoutMessage = "TypeSafe rerank window exceeded its deadline.";
        callerAbort = () => stop("TypeSafe rerank request was aborted.");
        callerSignal?.addEventListener("abort", callerAbort, { once: true });
        if (callerSignal?.aborted)
          callerAbort();
        timer = setTimeout(() => stop(timeoutMessage), Math.max(0, deadline - performance.now()));
        const scored = await Promise.race([
          mapWithConcurrency(bodies, concurrency, async (body) => {
            if (closed || firstFailure !== undefined)
              return { ok: false, message: firstFailure ?? timeoutMessage };
            if (performance.now() >= deadline) {
              stop(timeoutMessage);
              return { ok: false, message: timeoutMessage };
            }
            attempted += 1;
            let response;
            try {
              response = await transport({
                url: DEFAULT_SYSTEMONE_ENDPOINT,
                body,
                headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
                timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
                maxResponseBytes,
                signal: controller.signal
              });
            } catch {
              if (!closed) {
                completed += 1;
                stop("TypeSafe rerank request failed.");
              }
              return { ok: false, message: firstFailure ?? "TypeSafe rerank request failed." };
            }
            if (closed)
              return { ok: false, message: firstFailure ?? timeoutMessage };
            completed += 1;
            if (performance.now() >= deadline)
              stop(timeoutMessage);
            try {
              if (!Number.isSafeInteger(response.status) || !(response.body instanceof Uint8Array) || response.body.byteLength > maxResponseBytes) {
                stop("TypeSafe rerank transport returned a malformed or oversized response.");
                return { ok: false, message: firstFailure };
              }
              let parsed;
              try {
                parsed = JSON.parse(decoder.decode(response.body));
              } catch {
                stop(response.status === 200 ? "TypeSafe rerank response was not valid UTF-8 JSON." : `TypeSafe rerank request returned HTTP ${response.status}.`);
                return { ok: false, message: firstFailure };
              }
              const root = recordValue(parsed);
              const usage = recordValue(root?.["usage"]);
              const input = tokenCount(usage?.["input_tokens"]);
              const output = tokenCount(usage?.["output_tokens"]);
              if (usage !== null && hasExactKeys(usage, ["input_tokens", "output_tokens"]) && input !== null && output !== null) {
                if (inputTokens + input > 1e9 || outputTokens + output > 1e9) {
                  stop("TypeSafe rerank aggregate usage exceeded its limits.");
                  return { ok: false, message: firstFailure };
                }
                inputTokens += input;
                outputTokens += output;
                usageReceipts += 1;
              }
              if (acceptedResponseModel(root?.["model"]))
                observedModel = DEFAULT_SYSTEMONE_MODEL;
              if (response.status !== 200) {
                stop(`TypeSafe rerank request returned HTTP ${response.status}.`);
                return { ok: false, message: firstFailure };
              }
              const answer = parseSystemOneResponse(parsed);
              if (answer === null) {
                stop("TypeSafe rerank response was malformed.");
                return { ok: false, message: firstFailure };
              }
              return { ok: true, ...answer };
            } catch {
              stop("TypeSafe rerank transport returned a malformed response.");
              return { ok: false, message: firstFailure };
            }
          }),
          stopped.then(() => {
            return;
          })
        ]);
        closed = true;
        if (firstFailure !== undefined)
          return failed(firstFailure);
        if (scored === undefined || scored.some((entry) => !entry.ok)) {
          return failed("TypeSafe rerank result was incomplete.");
        }
        const probabilities = Object.create(null);
        for (const [index, entry] of scored.entries()) {
          const candidate = request.candidates[index];
          if (candidate === undefined || !entry.ok)
            return failed("TypeSafe rerank result was incomplete.");
          probabilities[candidate.id] = entry.noul;
        }
        const ordering = request.candidates.toSorted((left, right) => (probabilities[right.id] ?? -1) - (probabilities[left.id] ?? -1) || left.baselineRank - right.baselineRank || left.id.localeCompare(right.id)).map(({ id }) => id);
        return { status: "ready", ordering: Object.freeze(ordering), probabilities, ...details() };
      } catch {
        return failed("TypeSafe rerank request was malformed or failed.");
      } finally {
        closed = true;
        if (timer !== undefined)
          clearTimeout(timer);
        if (callerAbort !== undefined)
          callerSignal?.removeEventListener("abort", callerAbort);
        controller.abort();
      }
    }
  };
}

export { DEFAULT_SYSTEMONE_ENDPOINT, DEFAULT_SYSTEMONE_MODEL, createTypeSafeReranker };
