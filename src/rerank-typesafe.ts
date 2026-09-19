import {
  MAX_RERANK_CANDIDATES,
  MAX_RERANK_SNIPPET_BYTES,
  MAX_RERANK_STATE_BYTES,
  type SearchRerankRequest,
  type SearchRerankResult,
  type SearchReranker,
} from "./rerank.js";

export const DEFAULT_SYSTEMONE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_SYSTEMONE_MODEL = "jev-latest";
const DEFAULT_RERANK_TIMEOUT_MS = 8_000;
const DEFAULT_RERANK_MAX_RESPONSE_BYTES = 64 * 1_024;
const DEFAULT_RERANK_CONCURRENCY = 8;
const MAX_RERANK_TIMEOUT_MS = DEFAULT_RERANK_TIMEOUT_MS;
const MAX_RERANK_RESPONSE_BYTES = DEFAULT_RERANK_MAX_RESPONSE_BYTES;
const MAX_RERANK_CONCURRENCY = DEFAULT_RERANK_CONCURRENCY;

const RELEVANCE_QUESTION = "relevant";
const RELEVANCE_INSTRUCTIONS =
  "Could this note help answer the search query in a personal Markdown knowledge "
  + "vault of notes, plans, concepts, and captured sources?";
const RELEVANCE_CRITERIA = {
  true: "The note's title, path, or snippet directly addresses the query's subject or task.",
  false: "The note is unrelated to the query or only touches a neighboring topic.",
} as const;

export type SystemOneTransport = (request: {
  readonly url: string;
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly signal?: AbortSignal;
}) => Promise<{ readonly status: number; readonly body: Uint8Array }>;

export type TypeSafeRerankerOptions = {
  readonly transport?: SystemOneTransport;
  /** May lower, but never raise, the fixed request timeout bound. */
  readonly timeoutMs?: number;
  /** May lower, but never raise, the fixed response byte bound. */
  readonly maxResponseBytes?: number;
  /** May lower, but never raise, the fixed request concurrency bound. */
  readonly concurrency?: number;
  /** Test seam for environment lookups; production callers leave this unset. */
  readonly environment?: Readonly<Record<string, string | undefined>>;
};

type ParsedSystemOneAnswer = {
  readonly noul: number;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
};

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const body = response.body;
  if (body === null) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined || value.byteLength === 0) continue;
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

async function fetchSystemOneTransport(request: {
  readonly url: string;
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly signal?: AbortSignal;
}): Promise<{ readonly status: number; readonly body: Uint8Array }> {
  const signals = [AbortSignal.timeout(request.timeoutMs)];
  if (request.signal !== undefined) signals.push(request.signal);
  const body = new Uint8Array(request.body.byteLength);
  body.set(request.body);
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: body.buffer,
    redirect: "error",
    signal: AbortSignal.any(signals),
  });
  return {
    status: response.status,
    body: await readBoundedResponse(response, request.maxResponseBytes),
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 1_000_000_000
    ? value
    : null;
}

function acceptedResponseModel(value: unknown): value is string {
  return value === DEFAULT_SYSTEMONE_MODEL
    || (typeof value === "string" && /^jev-[0-9]+(?:\.[0-9]+){2}$/u.test(value));
}

function parseSystemOneResponse(value: unknown): ParsedSystemOneAnswer | null {
  const root = recordValue(value);
  if (root === null || !hasExactKeys(root, ["model", "answers", "usage"])) return null;
  const answers = recordValue(root["answers"]);
  if (answers === null || !hasExactKeys(answers, [RELEVANCE_QUESTION])) return null;
  const answer = recordValue(answers[RELEVANCE_QUESTION]);
  if (
    answer === null
    || !hasExactKeys(answer, ["type", "noul"])
    || answer["type"] !== "noul"
  ) return null;
  const noul = finiteNumber(answer["noul"]);
  if (noul === null || noul < 0 || noul > 1) return null;
  const usage = recordValue(root["usage"]);
  if (usage === null || !hasExactKeys(usage, ["input_tokens", "output_tokens"])) return null;
  const inputTokens = tokenCount(usage["input_tokens"]);
  const outputTokens = tokenCount(usage["output_tokens"]);
  if (
    !acceptedResponseModel(root["model"])
    || inputTokens === null
    || outputTokens === null
  ) return null;
  return { noul, model: root["model"], inputTokens, outputTokens };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await operation(items[index] as T, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function validApiKey(value: string | undefined): value is string {
  return value !== undefined && /^[\x21-\x7e]{1,512}$/u.test(value);
}

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number | null {
  const resolved = value ?? fallback;
  return Number.isSafeInteger(resolved) && resolved >= 1 && resolved <= maximum
    ? resolved
    : null;
}

function validRerankRequest(value: unknown): value is SearchRerankRequest {
  const request = recordValue(value);
  if (
    request === null
    || typeof request["query"] !== "string"
    || request["query"].trim() === ""
    || Buffer.byteLength(request["query"], "utf8") > MAX_RERANK_STATE_BYTES
    || !Array.isArray(request["candidates"])
    || request["candidates"].length > MAX_RERANK_CANDIDATES
  ) return false;
  const ids = new Set<string>();
  for (const [index, value] of request["candidates"].entries()) {
    const candidate = recordValue(value);
    if (
      candidate === null
      || typeof candidate["id"] !== "string"
      || candidate["id"] === ""
      || ids.has(candidate["id"])
      || candidate["baselineRank"] !== index + 1
      || typeof candidate["score"] !== "number"
      || !Number.isFinite(candidate["score"])
      || typeof candidate["title"] !== "string"
      || typeof candidate["path"] !== "string"
      || typeof candidate["snippet"] !== "string"
      || Buffer.byteLength(candidate["id"], "utf8") > MAX_RERANK_STATE_BYTES
      || Buffer.byteLength(candidate["title"], "utf8") > MAX_RERANK_STATE_BYTES
      || Buffer.byteLength(candidate["path"], "utf8") > MAX_RERANK_STATE_BYTES
      || Buffer.byteLength(candidate["snippet"], "utf8") > MAX_RERANK_SNIPPET_BYTES
    ) return false;
    ids.add(candidate["id"]);
  }
  return true;
}

type ScoredCandidate =
  | {
      readonly ok: true;
      readonly noul: number;
      readonly model: string;
      readonly inputTokens: number;
      readonly outputTokens: number;
    }
  | { readonly ok: false; readonly message: string };

/**
 * Pointwise-noul reranker for the TypeSafe System One API. Each candidate is
 * scored by one independent noul question so the window keeps an inspectable
 * model-assigned relevance probability per note. The API key is read only from
 * the TYPESAFE_API_KEY environment variable. A missing key degrades to
 * `unavailable` without any network call; transport, HTTP, timeout, and
 * malformed-response failures degrade to `failed` without provider bodies.
 */
export function createTypeSafeReranker(
  options: TypeSafeRerankerOptions = {},
): SearchReranker {
  const transport = options.transport ?? fetchSystemOneTransport;
  const timeoutMs = boundedPositiveInteger(
    options.timeoutMs,
    DEFAULT_RERANK_TIMEOUT_MS,
    MAX_RERANK_TIMEOUT_MS,
  );
  const maxResponseBytes = boundedPositiveInteger(
    options.maxResponseBytes,
    DEFAULT_RERANK_MAX_RESPONSE_BYTES,
    MAX_RERANK_RESPONSE_BYTES,
  );
  const concurrency = boundedPositiveInteger(
    options.concurrency,
    DEFAULT_RERANK_CONCURRENCY,
    MAX_RERANK_CONCURRENCY,
  );
  const environment = options.environment ?? process.env;
  const apiKey = Object.hasOwn(environment, "TYPESAFE_API_KEY")
    ? environment["TYPESAFE_API_KEY"]
    : undefined;

  return {
    id: "typesafe",
    rerank: async (request: SearchRerankRequest): Promise<SearchRerankResult> => {
      if (timeoutMs === null || maxResponseBytes === null || concurrency === null) {
        return { status: "failed", message: "TypeSafe rerank configuration was invalid." };
      }
      if (!validApiKey(apiKey)) {
        return {
          status: "unavailable",
          message: "TYPESAFE_API_KEY is missing or invalid; the TypeSafe rerank lane is unavailable.",
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
        const encoder = new TextEncoder();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        // Prepare the whole window before any paid request. Individually bounded
        // fields can still exceed the serialized state limit when combined.
        const bodies: Uint8Array[] = [];
        for (const candidate of request.candidates) {
          const state = {
            query: request.query,
            candidate: {
              key: candidate.id,
              title: candidate.title,
              path: candidate.path,
              snippet: candidate.snippet,
            },
          };
          const stateBytes = encoder.encode(JSON.stringify(state)).byteLength;
          if (stateBytes > MAX_RERANK_STATE_BYTES) {
            return {
              status: "failed",
              message: `TypeSafe rerank state exceeds the ${MAX_RERANK_STATE_BYTES}-byte limit.`,
            };
          }
          bodies.push(encoder.encode(JSON.stringify({
            model: DEFAULT_SYSTEMONE_MODEL,
            state,
            questions: {
              [RELEVANCE_QUESTION]: {
                type: "noul",
                instructions: RELEVANCE_INSTRUCTIONS,
                criteria: RELEVANCE_CRITERIA,
              },
            },
          })));
        }
        let firstFailure: string | undefined;
        const failed = (message: string): ScoredCandidate => {
          firstFailure ??= message;
          return { ok: false, message: firstFailure };
        };
        const scoreCandidate = async (body: Uint8Array): Promise<ScoredCandidate> => {
          if (firstFailure !== undefined) return { ok: false, message: firstFailure };
          if (request.signal?.aborted === true) {
            return failed("TypeSafe rerank request was aborted.");
          }
          let response: { readonly status: number; readonly body: Uint8Array };
          try {
            response = await transport({
              url: DEFAULT_SYSTEMONE_ENDPOINT,
              body,
              headers: {
                "authorization": `Bearer ${apiKey}`,
                "content-type": "application/json",
              },
              timeoutMs,
              maxResponseBytes,
              ...(request.signal === undefined ? {} : { signal: request.signal }),
            });
          } catch {
            return failed("TypeSafe rerank request failed.");
          }
          if (
            !Number.isSafeInteger(response.status)
            || !(response.body instanceof Uint8Array)
            || response.body.byteLength > maxResponseBytes
          ) {
            return failed("TypeSafe rerank transport returned a malformed or oversized response.");
          }
          if (response.status !== 200) {
            return failed(`TypeSafe rerank request returned HTTP ${response.status}.`);
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(decoder.decode(response.body)) as unknown;
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
            outputTokens: answer.outputTokens,
          };
        };
        const scored = await mapWithConcurrency(
          bodies,
          concurrency,
          scoreCandidate,
        );
        const failure = scored.find((entry) => !entry.ok);
        if (failure !== undefined && !failure.ok) {
          return { status: "failed", message: failure.message };
        }
        const probabilities: Record<string, number> = Object.create(null) as Record<string, number>;
        let inputTokens = 0;
        let outputTokens = 0;
        let responseModel: string | undefined;
        for (const [index, entry] of scored.entries()) {
          if (!entry.ok) continue;
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
        const ordering = request.candidates
          .toSorted(
            (left, right) =>
              (probabilities[right.id] ?? -1) - (probabilities[left.id] ?? -1)
              || left.baselineRank - right.baselineRank
              || left.id.localeCompare(right.id),
          )
          .map(({ id }) => id);
        return {
          status: "ready",
          ordering: Object.freeze(ordering),
          probabilities,
          model: responseModel ?? DEFAULT_SYSTEMONE_MODEL,
          usage: { inputTokens, outputTokens },
        };
      } catch {
        return { status: "failed", message: "TypeSafe rerank request was malformed or failed." };
      }
    },
  };
}
