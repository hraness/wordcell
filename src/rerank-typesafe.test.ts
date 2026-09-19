import { describe, expect, test } from "bun:test";

import type { SearchRerankCandidate } from "./rerank.js";
import {
  createTypeSafeReranker,
  type SystemOneTransport,
} from "./rerank-typesafe.ts";

type CapturedRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly body: Record<string, unknown>;
};

function candidate(id: string, baselineRank: number): SearchRerankCandidate {
  return {
    id,
    baselineRank,
    score: 1 - baselineRank / 100,
    title: `title-${id}`,
    path: `notes/${id}.md`,
    snippet: `snippet-${id}`,
  };
}

function fakeTransport(
  handler: (request: CapturedRequest, candidateKey: string) => unknown,
  captured: CapturedRequest[] = [],
): SystemOneTransport {
  return async (request) => {
    const body = JSON.parse(new TextDecoder().decode(request.body)) as Record<string, unknown>;
    const entry: CapturedRequest = {
      url: request.url,
      headers: request.headers,
      timeoutMs: request.timeoutMs,
      maxResponseBytes: request.maxResponseBytes,
      body,
    };
    captured.push(entry);
    const state = body["state"] as Record<string, unknown> | undefined;
    const candidate = state?.["candidate"] as Record<string, unknown> | undefined;
    const candidateKey = candidate?.["key"] as string;
    const response = handler(entry, candidateKey);
    return {
      status: 200,
      body: new TextEncoder().encode(JSON.stringify(response)),
    };
  };
}

function systemOneResponse(noul: number, extra: Record<string, unknown> = {}): unknown {
  return {
    model: "jev-latest",
    answers: { relevant: { type: "noul", noul } },
    usage: { input_tokens: 120, output_tokens: 8 },
    ...extra,
  };
}

const savedKey = process.env["TYPESAFE_API_KEY"];
function withoutProcessKey(run: () => Promise<void>): Promise<void> {
  delete process.env["TYPESAFE_API_KEY"];
  return run().finally(() => {
    if (savedKey === undefined) delete process.env["TYPESAFE_API_KEY"];
    else process.env["TYPESAFE_API_KEY"] = savedKey;
  });
}

describe("createTypeSafeReranker", () => {
  test("sends one bounded noul request per candidate with auth and model", async () => {
    const captured: CapturedRequest[] = [];
    const reranker = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: "key-abc" },
      transport: fakeTransport((_request, key) =>
        systemOneResponse(key === "b" ? 0.9 : 0.1), captured),
    });
    const result = await reranker.rerank({
      query: "capture policy",
      candidates: [candidate("a", 1), candidate("b", 2)],
    });
    expect(result.status).toBe("ready");
    expect(captured).toHaveLength(2);
    for (const request of captured) {
      expect(request.url).toBe("https://api.typesafe.ai/v1/systemone");
      expect(request.headers["authorization"]).toBe("Bearer key-abc");
      expect(request.headers["content-type"]).toBe("application/json");
      expect(request.timeoutMs).toBe(8_000);
      expect(request.maxResponseBytes).toBe(64 * 1_024);
      expect(request.body["model"]).toBe("jev-latest");
      const questions = request.body["questions"] as Record<string, unknown>;
      const relevant = questions["relevant"] as Record<string, unknown>;
      expect(relevant["type"]).toBe("noul");
      expect(typeof relevant["instructions"]).toBe("string");
      const criteria = relevant["criteria"] as Record<string, unknown>;
      expect(typeof criteria["true"]).toBe("string");
      expect(typeof criteria["false"]).toBe("string");
    }
    const states = captured.map((request) => request.body["state"]) as Record<string, unknown>[];
    expect(states.map((state) => state["query"])).toEqual(["capture policy", "capture policy"]);
    const keys = states.map((state) =>
      (state["candidate"] as Record<string, unknown>)["key"]);
    expect(keys.toSorted()).toEqual(["a", "b"]);
    if (result.status === "ready") {
      expect(result.probabilities).toEqual({ a: 0.1, b: 0.9 });
      expect(result.ordering).toEqual(["b", "a"]);
      expect(result.model).toBe("jev-latest");
      expect(result.usage).toEqual({ inputTokens: 240, outputTokens: 16 });
    }
  });

  test("returns unavailable without a transport call when the key is missing", async () => {
    await withoutProcessKey(async () => {
      let calls = 0;
      const reranker = createTypeSafeReranker({
        environment: {},
        transport: async () => {
          calls += 1;
          return { status: 200, body: new Uint8Array() };
        },
      });
      const result = await reranker.rerank({
        query: "q",
        candidates: [candidate("a", 1)],
      });
      expect(result).toMatchObject({ status: "unavailable" });
      expect(calls).toBe(0);
    });
  });

  test("returns unavailable without transport for an invalid key", async () => {
    let calls = 0;
    const reranker = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: "key\nheader: injected" },
      transport: async () => {
        calls += 1;
        return { status: 200, body: new Uint8Array() };
      },
    });
    const result = await reranker.rerank({
      query: "q",
      candidates: [candidate("a", 1)],
    });
    expect(result.status).toBe("unavailable");
    expect(calls).toBe(0);
  });

  test("reads the API key only from the selected environment", async () => {
    await withoutProcessKey(async () => {
      process.env["TYPESAFE_API_KEY"] = "env-process";
      const auths: (string | undefined)[] = [];
      const transport: SystemOneTransport = async (request) => {
        auths.push(request.headers["authorization"]);
        return {
          status: 200,
          body: new TextEncoder().encode(JSON.stringify(systemOneResponse(0.5))),
        };
      };
      const envScoped = createTypeSafeReranker({
        environment: { TYPESAFE_API_KEY: "env-map" },
        transport,
      });
      await envScoped.rerank({ query: "q", candidates: [candidate("a", 1)] });
      const processScoped = createTypeSafeReranker({ transport });
      await processScoped.rerank({ query: "q", candidates: [candidate("a", 1)] });
      const isolatedMissing = createTypeSafeReranker({ environment: {}, transport });
      expect(await isolatedMissing.rerank({
        query: "q",
        candidates: [candidate("a", 1)],
      })).toMatchObject({ status: "unavailable" });
      expect(auths).toEqual(["Bearer env-map", "Bearer env-process"]);
    });
  });

  test("fails with the HTTP status on 401, 429, and 5xx responses", async () => {
    for (const status of [401, 429, 500]) {
      const reranker = createTypeSafeReranker({
        environment: { TYPESAFE_API_KEY: "key" },
        transport: async () => ({
          status,
          body: new TextEncoder().encode("{}"),
        }),
      });
      const result = await reranker.rerank({
        query: "q",
        candidates: [candidate("a", 1)],
      });
      expect(result.status).toBe("failed");
      if (result.status !== "ready") {
        expect(result.message).toContain(`HTTP ${status}`);
      }
    }
  });

  test("fails when the transport throws or times out", async () => {
    const reranker = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: "key" },
      timeoutMs: 25,
      transport: async () => {
        throw new Error("socket hangup");
      },
    });
    const result = await reranker.rerank({
      query: "q",
      candidates: [candidate("a", 1)],
    });
    expect(result.status).toBe("failed");
    if (result.status !== "ready") {
      expect(result.message).toContain("request failed");
    }
  });

  test("fails on malformed and out-of-range responses", async () => {
    const malformedBodies = [
      "not json",
      JSON.stringify({ answers: {} }),
      JSON.stringify({ answers: { relevant: { type: "noul", noul: 1.5 } } }),
      JSON.stringify({ answers: { relevant: { type: "choice", choice: "a" } } }),
      JSON.stringify({
        model: "jev-1.13.0",
        answers: { relevant: { type: "noul", noul: 0.5, extra: true } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      JSON.stringify(systemOneResponse(0.5, { extra: true })),
      JSON.stringify({
        model: "jev-1.13.0-beta",
        answers: { relevant: { type: "noul", noul: 0.5 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    ];
    for (const bodyText of malformedBodies) {
      const reranker = createTypeSafeReranker({
        environment: { TYPESAFE_API_KEY: "key" },
        transport: async () => ({
          status: 200,
          body: new TextEncoder().encode(bodyText),
        }),
      });
      const result = await reranker.rerank({
        query: "q",
        candidates: [candidate("a", 1)],
      });
      expect(result.status).toBe("failed");
    }
  });

  test("never leaks the API key into failure messages", async () => {
    const secret = "sk-live-secret-123";
    const reranker = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: secret },
      transport: async () => {
        throw new Error(`upstream rejected ${secret} at gateway`);
      },
    });
    const result = await reranker.rerank({
      query: "q",
      candidates: [candidate("a", 1)],
    });
    expect(result.status).toBe("failed");
    if (result.status !== "ready") {
      expect(result.message).not.toContain(secret);
      expect(result.message).toBe("TypeSafe rerank request failed.");
    }
  });

  test("bounds concurrency across candidates", async () => {
    let inFlight = 0;
    let peak = 0;
    const transport: SystemOneTransport = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return {
        status: 200,
        body: new TextEncoder().encode(JSON.stringify(systemOneResponse(0.5))),
      };
    };
    const reranker = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: "key" },
      concurrency: 3,
      transport,
    });
    const candidates = Array.from({ length: 12 }, (_, index) =>
      candidate(`c${index}`, index + 1));
    const result = await reranker.rerank({ query: "q", candidates });
    expect(result.status).toBe("ready");
    expect(peak).toBe(3);
    if (result.status === "ready") {
      expect(result.ordering).toHaveLength(12);
    }
  });

  test("rejects oversized windows, snippets, and invalid bounds before transport", async () => {
    let calls = 0;
    const transport: SystemOneTransport = async () => {
      calls += 1;
      return {
        status: 200,
        body: new TextEncoder().encode(JSON.stringify(systemOneResponse(0.5))),
      };
    };
    const bounded = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: "key" },
      transport,
    });
    expect(await bounded.rerank({
      query: "q",
      candidates: Array.from({ length: 26 }, (_, index) => candidate(`c${index}`, index + 1)),
    })).toMatchObject({ status: "failed" });
    expect(await bounded.rerank({
      query: "q",
      candidates: [{ ...candidate("a", 1), snippet: "x".repeat(513) }],
    })).toMatchObject({ status: "failed" });

    for (const options of [
      { timeoutMs: 8_001 },
      { maxResponseBytes: (64 * 1_024) + 1 },
      { concurrency: 9 },
      { concurrency: 0 },
    ]) {
      const invalid = createTypeSafeReranker({
        ...options,
        environment: { TYPESAFE_API_KEY: "key" },
        transport,
      });
      expect(await invalid.rerank({ query: "q", candidates: [candidate("a", 1)] }))
        .toEqual({ status: "failed", message: "TypeSafe rerank configuration was invalid." });
    }
    expect(calls).toBe(0);
  });

  test("preflights every serialized state before sending any candidate", async () => {
    for (const title of ["x".repeat(24 * 1_024), "\\".repeat(13 * 1_024)]) {
      let calls = 0;
      const reranker = createTypeSafeReranker({
        environment: { TYPESAFE_API_KEY: "key" },
        transport: fakeTransport(() => {
          calls += 1;
          return systemOneResponse(0.5);
        }),
      });
      const candidates = Array.from({ length: 12 }, (_, index) =>
        candidate(`c${index}`, index + 1));
      candidates[11] = { ...candidate("c11", 12), title };
      expect(await reranker.rerank({ query: "q", candidates })).toEqual({
        status: "failed",
        message: "TypeSafe rerank state exceeds the 24576-byte limit.",
      });
      expect(calls).toBe(0);
    }
  });

  test("rejects oversized custom-transport responses before parsing", async () => {
    const reranker = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: "key" },
      maxResponseBytes: 32,
      transport: async () => ({ status: 200, body: new Uint8Array(33) }),
    });
    expect(await reranker.rerank({ query: "q", candidates: [candidate("a", 1)] }))
      .toEqual({
        status: "failed",
        message: "TypeSafe rerank transport returned a malformed or oversized response.",
      });
  });

  test("does not start queued paid calls after a candidate failure", async () => {
    let calls = 0;
    const reranker = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: "key" },
      concurrency: 1,
      transport: async () => {
        calls += 1;
        return { status: 429, body: new TextEncoder().encode("provider body secret") };
      },
    });
    const result = await reranker.rerank({
      query: "q",
      candidates: [candidate("a", 1), candidate("b", 2), candidate("c", 3)],
    });
    expect(result).toEqual({
      status: "failed",
      message: "TypeSafe rerank request returned HTTP 429.",
    });
    expect(calls).toBe(1);
    expect(JSON.stringify(result)).not.toContain("provider body secret");
  });

  test("honors an already-aborted caller signal without transport", async () => {
    let calls = 0;
    const controller = new AbortController();
    controller.abort();
    const reranker = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: "key" },
      transport: async () => {
        calls += 1;
        return { status: 200, body: new Uint8Array() };
      },
    });
    expect(await reranker.rerank({
      query: "q",
      candidates: [candidate("a", 1)],
      signal: controller.signal,
    })).toEqual({ status: "failed", message: "TypeSafe rerank request was aborted." });
    expect(calls).toBe(0);
  });

  test("sums usage and reports the response model", async () => {
    const reranker = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: "key" },
      transport: fakeTransport(() => ({
        model: "jev-1.13.0",
        answers: { relevant: { type: "noul", noul: 0.4 } },
        usage: { input_tokens: 50, output_tokens: 3 },
      })),
    });
    const result = await reranker.rerank({
      query: "q",
      candidates: [candidate("a", 1), candidate("b", 2), candidate("c", 3)],
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.model).toBe("jev-1.13.0");
      expect(result.usage).toEqual({ inputTokens: 150, outputTokens: 9 });
    }
  });

  test("returns ready with no transport calls for an empty window", async () => {
    let calls = 0;
    const reranker = createTypeSafeReranker({
      environment: { TYPESAFE_API_KEY: "key" },
      transport: async () => {
        calls += 1;
        return { status: 200, body: new Uint8Array() };
      },
    });
    const result = await reranker.rerank({ query: "q", candidates: [] });
    expect(result.status).toBe("ready");
    expect(calls).toBe(0);
  });
});
