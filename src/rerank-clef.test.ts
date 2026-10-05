import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { clefEndpoint, createClefReranker, type ClefTransport, type ClefModel } from "./rerank-clef.js";
import type { SearchRerankCandidate } from "./rerank.js";
import { openKnowledgeBase } from "./sdk.js";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const accountId = "a".repeat(32);
const environment = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-token" };
const candidate = (id = "notes/a", baselineRank = 1): SearchRerankCandidate => ({
  id, baselineRank, score: 0.3, title: `Title ${id}`, path: `${id}.md`, snippet: "retry policy",
});
const request = { query: "retry policy", candidates: [candidate()] };
function result(noul = 0.5, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { model: "clef", answers: { relevant: { type: "noul", noul } },
    usage: { input_tokens: 100, output_tokens: 2 }, ...extra };
}
function envelope(value: unknown = result()): Record<string, unknown> {
  return { success: true, result: value, errors: [], messages: [] };
}
function encoded(value: unknown = envelope(), status = 200): { status: number; body: Uint8Array } {
  return { status, body: new TextEncoder().encode(JSON.stringify(value)) };
}
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve: (value) => resolve(value) };
}

describe("Cloudflare Clef reranking", () => {
  test("authored setup documents distinguish source support and environment-only Cloudflare credentials", async () => {
    for (const path of ["README.md", "docs/reranking.md", "skills/wordcell/references/query.md"]) {
      const text = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
      expect(text).toMatch(/Clef[\s\S]{0,300}source (?:tree|checkout|version)/u);
      expect(text).toMatch(/(?:release|installation)[\s\S]{0,200}(?:does not|do not|not part|not include)/u);
    }
    for (const path of ["docs/agent-workflow.md", "docs/design.md", "docs/comparisons.md", "docs/evidence.md", "docs/graph-authority.md", "site/app/developers/page.tsx", "site/app/docs/catalog.ts", "site/content/blog/introducing-wordcell.md"]) {
      const text = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
      expect(text).toMatch(/source (?:tree|checkout|version)/u);
    }
    const security = await readFile(new URL("../SECURITY.md", import.meta.url), "utf8");
    const clefSetup = security.slice(security.indexOf("`--rerank clef`"), security.indexOf("The deprecated"));
    expect(clefSetup).toMatch(/environment only/u);
    expect(clefSetup).not.toMatch(/credential file/u);
    const reranking = await readFile(new URL("../docs/reranking.md", import.meta.url), "utf8");
    const sdkSetup = reranking.slice(reranking.indexOf("## Use the SDK"), reranking.indexOf("## Request and response limits"));
    expect(sdkSetup).not.toMatch(/Global credential-file discovery belongs to the CLI/u);
  });

  test("posts bounded text to the selected fixed account/model endpoint with required instructions", async () => {
    for (const model of ["clef", "clef-flash"] as const) {
      const calls: Parameters<ClefTransport>[0][] = [];
      const reranker = createClefReranker({ environment, model, transport: async (input) => {
        calls.push(input);
        return encoded(envelope(result(calls.length === 1 ? 0.1 : 0.9, { model })));
      } });
      expect(reranker.id).toBe("clef");
      const answer = await reranker.rerank({ query: request.query, candidates: [candidate("notes/a", 1), candidate("notes/b", 2)] });
      expect(answer).toMatchObject({ status: "ready", model, ordering: ["notes/b", "notes/a"],
        probabilities: { "notes/a": 0.1, "notes/b": 0.9 }, usage: { inputTokens: 200, outputTokens: 4 },
        accounting: { attempted: 2, completed: 2, usageComplete: true } });
      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/cloudflare/${model}`);
        expect(call.headers).toEqual({ authorization: "Bearer test-token", "content-type": "application/json" });
        expect(call.body.byteLength).toBeLessThanOrEqual(32 * 1024);
        expect(call.timeoutMs).toBeGreaterThan(0);
        expect(call.timeoutMs).toBeLessThanOrEqual(8000);
        expect(call.maxResponseBytes).toBe(64 * 1024);
        const body = JSON.parse(new TextDecoder().decode(call.body));
        expect(body.model).toBe(model);
        expect(Object.keys(body.questions)).toEqual(["relevant"]);
        expect(Object.keys(body.questions)[0]).toMatch(/^[A-Za-z0-9_.-]{1,100}$/u);
        expect(body.questions.relevant.type).toBe("noul");
        expect(body.questions.relevant.instructions.trim()).not.toBe("");
        expect(Object.keys(body.questions.relevant.criteria)).toEqual(["true", "false"]);
        expect(body.images).toBeUndefined();
      }
    }
  });

  test("account, token and model validation fail closed without repurposing TypeSafe credentials", async () => {
    let calls = 0;
    const transport: ClefTransport = async () => { calls++; return encoded(); };
    for (const env of [{}, { TYPESAFE_API_KEY: "legacy" }, { CLOUDFLARE_ACCOUNT_ID: accountId, TYPESAFE_API_KEY: "legacy" },
      { ...environment, CLOUDFLARE_ACCOUNT_ID: "../other" }, { ...environment, CLOUDFLARE_ACCOUNT_ID: "A".repeat(32) },
      { ...environment, CLOUDFLARE_API_TOKEN: "" }, { ...environment, CLOUDFLARE_API_TOKEN: "bad\nheader" },
      { ...environment, CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_AUTH_TOKEN: "valid-alias" }]) {
      expect(await createClefReranker({ environment: env, transport }).rerank(request)).toMatchObject({ status: "unavailable" });
    }
    expect(await createClefReranker({ environment, model: "jev" as ClefModel, transport }).rerank(request)).toMatchObject({ status: "unavailable" });
    expect(calls).toBe(0);
    expect(() => clefEndpoint("../other")).toThrow("Invalid Cloudflare Clef account or model");
    expect(() => clefEndpoint(accountId, "jev" as ClefModel)).toThrow();
    expect(await createClefReranker({ environment: { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_AUTH_TOKEN: "alias" },
      transport: async ({ headers }) => { expect(headers.authorization).toBe("Bearer alias"); return encoded(); } }).rerank(request))
      .toMatchObject({ status: "ready" });
  });

  test("rejects non-string credentials and invalid explicit model values without coercion or fallback", async () => {
    let calls = 0;
    const transport: ClefTransport = async () => { calls++; return encoded(); };
    for (const value of [null, 123, true, ["test-token"], { toString: () => "test-token" }]) {
      for (const field of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_AUTH_TOKEN"] as const) {
        const invalidEnvironment = { CLOUDFLARE_ACCOUNT_ID: accountId, [field]: value } as unknown as Readonly<Record<string, string | undefined>>;
        expect(await createClefReranker({ environment: invalidEnvironment, transport }).rerank(request)).toMatchObject({ status: "unavailable" });
      }
    }
    for (const value of [[accountId], { toString: () => accountId }]) {
      expect(() => clefEndpoint(value as unknown as string)).toThrow();
      const invalidEnvironment = { ...environment, CLOUDFLARE_ACCOUNT_ID: value } as unknown as Readonly<Record<string, string | undefined>>;
      expect(await createClefReranker({ environment: invalidEnvironment, transport }).rerank(request)).toMatchObject({ status: "unavailable" });
    }
    expect(await createClefReranker({ environment, model: null as unknown as ClefModel, transport }).rerank(request)).toMatchObject({ status: "unavailable" });
    expect(calls).toBe(0);
  });

  test("accepts only successful REST envelopes and exact noul question/model answers", async () => {
    for (const value of [result(), { ...envelope(), success: false }, { ...envelope(), success: "true" },
      { ...envelope(), errors: [{ message: "private-body" }] }, { ...envelope(), errors: "private-body" },
      envelope(null), envelope(result(2)), envelope(result(-1)), envelope(result(0.5, { model: "clef-flash" })),
      envelope(result(0.5, { model: "jev-1.13.0" })), envelope(result(0.5, { answers: {} })),
      envelope(result(0.5, { answers: { relevant: { type: "noul", noul: 0.5 }, unexpected: { type: "noul", noul: 0.1 } } })),
      envelope(result(0.5, { answers: { relevant: { type: "noul", noul: 0.5, legend: [] } } })),
      envelope(result(0.5, { answers: { relevant: { type: "choice", choice: "a", probabilities: { a: 1, b: 0 } } } })),
      envelope(result(0.5, { answers: { relevant: { type: "score", score: 0.5, legend: {} } } })),
      envelope(result(0.5, { usage: { input_tokens: -1, output_tokens: 2 } })),
      envelope(result(0.5, { usage: { input_tokens: 1.5, output_tokens: 2 } })),
      envelope(result(0.5, { extra: true }))]) {
      const answer = await createClefReranker({ environment, transport: async () => encoded(value) }).rerank(request);
      expect(answer.status).toBe("failed");
      expect(JSON.stringify(answer)).not.toContain("private-body");
    }
    await fc.assert(fc.asyncProperty(fc.double({ min: 0, max: 1, noNaN: true }), async (probability) => {
      expect(await createClefReranker({ environment, transport: async () => encoded(envelope(result(probability))) }).rerank(request))
        .toMatchObject({ status: "ready", probabilities: { "notes/a": probability } });
    }), { numRuns: 30 });
  });

  test("preflights the whole text window and rejects images rather than silently ignoring them", async () => {
    let calls = 0;
    const reranker = createClefReranker({ environment, transport: async () => { calls++; return encoded(); } });
    for (const input of [
      { ...request, images: ["https://example.com/image.png"] },
      { ...request, images: ["data:image/png;base64,aGVsbG8="] },
      { ...request, images: [] },
      { ...request, query: "x".repeat(24 * 1024 + 1) },
      { ...request, candidates: [candidate(), { ...candidate("notes/b", 2), title: "\\".repeat(13 * 1024) }] },
      { ...request, candidates: [{ ...candidate(), snippet: "x".repeat(513) }] },
      { ...request, candidates: [candidate(), candidate("notes/a", 2)] },
      { ...request, candidates: Array.from({ length: 26 }, (_, i) => candidate(`notes/${i}`, i + 1)) },
    ]) expect((await reranker.rerank(input)).status).toBe("failed");
    for (const options of [{ timeoutMs: 8001 }, { concurrency: 9 }, { maxResponseBytes: 65537 }]) {
      expect((await createClefReranker({ ...options, environment, transport: async () => { calls++; return encoded(); } }).rerank(request)).status).toBe("failed");
    }
    expect(await reranker.rerank(new Proxy(request, { has() { throw new Error("private-body"); } })))
      .toEqual({ status: "failed", message: "Cloudflare Clef rerank request was malformed or failed." });
    expect(calls).toBe(0);
  });

  test("HTTP and transport failures never retry or expose bodies and credentials", async () => {
    for (const status of [401, 429, 500]) {
      let calls = 0;
      const answer = await createClefReranker({ environment, concurrency: 1, transport: async () => {
        calls++; return encoded({ success: false, errors: [{ message: "test-token private-query" }] }, status);
      } }).rerank({ ...request, candidates: [candidate(), candidate("notes/b", 2)] });
      expect(answer).toMatchObject({ status: "failed", message: `Cloudflare Clef rerank request returned HTTP ${status}.`,
        accounting: { attempted: 1, completed: 1, usageComplete: false } });
      expect(calls).toBe(1);
      expect(JSON.stringify(answer)).not.toContain("test-token");
      expect(JSON.stringify(answer)).not.toContain("private-query");
    }
    const answer = await createClefReranker({ environment, transport: async () => { throw new Error("test-token private-query"); } }).rerank(request);
    expect(answer).toMatchObject({ status: "failed", message: "Cloudflare Clef rerank request failed." });
  });

  test("preserves known usage independently of answer integrity, without trusting failed envelopes", async () => {
    const badAnswer = await createClefReranker({ environment, transport: async () => encoded(envelope(result(2))) }).rerank(request);
    expect(badAnswer).toMatchObject({ status: "failed", model: "clef", usage: { inputTokens: 100, outputTokens: 2 },
      accounting: { usageComplete: true } });
    const badEnvelope = await createClefReranker({ environment, transport: async () => encoded({ ...envelope(), success: false }) }).rerank(request);
    expect(badEnvelope).toMatchObject({ status: "failed", usage: { inputTokens: 0, outputTokens: 0 }, accounting: { usageComplete: false } });
    let calls = 0;
    const overflow = await createClefReranker({ environment, concurrency: 1, transport: async () => encoded(envelope(result(0.5,
      { usage: { input_tokens: ++calls === 1 ? 100 : 1_000_000_000, output_tokens: 2 } }))) })
      .rerank({ ...request, candidates: [candidate(), candidate("notes/b", 2)] });
    expect(overflow).toMatchObject({ status: "failed", usage: { inputTokens: 100, outputTokens: 2 }, accounting: { usageComplete: false } });
  });

  test("a whole-window deadline cancels unresolved calls and never dispatches queued candidates", async () => {
    const late = deferred<Awaited<ReturnType<ClefTransport>>>();
    const calls: Parameters<ClefTransport>[0][] = [];
    const reranker = createClefReranker({ environment, timeoutMs: 80, concurrency: 1, transport: async (input) => {
      calls.push(input);
      if (calls.length === 1) { await Bun.sleep(20); return encoded(); }
      return await late.promise;
    } });
    const answer = await reranker.rerank({ ...request, candidates: [candidate(), candidate("notes/b", 2), candidate("notes/c", 3)] });
    expect(answer).toMatchObject({ status: "failed", message: "Cloudflare Clef rerank window exceeded its deadline.",
      usage: { inputTokens: 100, outputTokens: 2 }, accounting: { attempted: 2, completed: 1, usageComplete: false } });
    expect(calls.every(({ signal }) => signal?.aborted)).toBe(true);
    expect(calls[1]!.timeoutMs).toBeLessThan(calls[0]!.timeoutMs);
    const snapshot = JSON.stringify(answer);
    late.resolve(encoded());
    await Bun.sleep(5);
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(answer)).toBe(snapshot);
  });

  test("caller cancellation is prompt even if the mocked transport ignores abort", async () => {
    const caller = new AbortController();
    const dispatched = deferred<void>();
    const late = deferred<Awaited<ReturnType<ClefTransport>>>();
    let calls = 0;
    const reranker = createClefReranker({ environment, concurrency: 1, transport: async () => {
      calls++; dispatched.resolve(); return await late.promise;
    } });
    const pending = reranker.rerank({ ...request, candidates: [candidate(), candidate("notes/b", 2)], signal: caller.signal });
    await dispatched.promise;
    caller.abort();
    expect(await pending).toMatchObject({ status: "failed", accounting: { attempted: 1, completed: 0, usageComplete: false } });
    late.resolve(encoded());
    await Bun.sleep(5);
    expect(calls).toBe(1);
    expect(await reranker.rerank({ ...request, signal: caller.signal })).toMatchObject({ status: "failed" });
    expect(calls).toBe(1);
  });

  test("default fetch uses POST and rejects redirects, stalled and oversized response bodies", async () => {
    const original = globalThis.fetch;
    try {
      for (const kind of ["success", "stalled", "oversized"] as const) {
        let canceled = false;
        globalThis.fetch = Object.assign(async (url: unknown, init?: RequestInit) => {
          expect(url).toBe(clefEndpoint(accountId));
          expect(init?.method).toBe("POST");
          expect(init?.redirect).toBe("error");
          if (kind === "success") return new Response(JSON.stringify(envelope()));
          return new Response(new ReadableStream({
            start(controller) { if (kind === "oversized") controller.enqueue(new Uint8Array(65537)); },
            cancel() { canceled = true; },
          }));
        }, { preconnect: original.preconnect });
        const answer = await createClefReranker({ environment, timeoutMs: 25 }).rerank(request);
        expect(answer.status).toBe(kind === "success" ? "ready" : "failed");
        if (kind !== "success") expect(canceled).toBe(true);
      }
    } finally { globalThis.fetch = original; }
  });

  test("SDK selection is opt-in even with an installed Clef engine, and legacy engine stays explicit", async () => {
    const root = await mkdtemp(join(tmpdir(), "wordcell-clef-sdk-"));
    try {
      await mkdir(join(root, "notes"));
      await writeFile(join(root, "index.md"), "# Vault\n");
      await writeFile(join(root, "notes", "a.md"), "# A\nretry policy\n");
      await writeFile(join(root, "notes", "b.md"), "# B\nretry policy\n");
      let calls = 0;
      const kb = await openKnowledgeBase({ root }, { rerankers: [
        createClefReranker({ environment, transport: async () => { calls++; return encoded(); } }),
        { id: "typesafe", rerank: async () => ({ status: "unavailable", message: "legacy not configured" }) },
      ] });
      try {
        const baseline = await kb.search({ query: "retry policy", mode: "exact", graph: false, history: false });
        expect(calls).toBe(0);
        expect(baseline.diagnostics.lanes.some(({ lane }) => lane === "rerank")).toBe(false);
        const reranked = await kb.search({ query: "retry policy", mode: "exact", graph: false, history: false, rerank: { engine: "clef", limit: 2 } });
        expect(calls).toBe(2);
        expect(reranked.diagnostics.lanes.find(({ lane }) => lane === "rerank")).toMatchObject({ engine: "clef", status: "ready", rerank: { model: "clef" } });
        const legacy = await kb.search({ query: "retry policy", mode: "exact", graph: false, history: false, rerank: { engine: "typesafe", limit: 2 } });
        expect(legacy.results).toEqual(baseline.results);
        expect(calls).toBe(2);
      } finally { await kb.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
