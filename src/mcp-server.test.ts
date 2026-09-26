import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  INTERNAL_ERROR, INVALID_PARAMS, INVALID_REQUEST, LATEST_PROTOCOL_VERSION, MAX_FRAME_BYTES, METHOD_NOT_FOUND,
  PARSE_ERROR, SERVER_NAME, SUPPORTED_PROTOCOL_VERSIONS, createDispatcher, encodeResponse, frameFromLine,
  negotiateProtocolVersion, parseFrame, parseStableVersion, readFrames, runMcpServer, serverVersion,
  type CallToolResult, type LineEvent, type ToolCatalog, type ToolDefinition,
} from "./mcp-server.js";
import { initVault } from "./init.js";

const encoder = new TextEncoder();

async function* stream(parts: readonly Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield part;
}

async function collect(parts: readonly Uint8Array[], maxFrameBytes?: number): Promise<LineEvent[]> {
  const events: LineEvent[] = [];
  await readFrames(stream(parts), async (event) => {
    events.push(event);
  }, maxFrameBytes === undefined ? {} : { maxFrameBytes });
  return events;
}

function splitAt(bytes: Uint8Array, cuts: readonly number[]): Uint8Array[] {
  const points = [...new Set(cuts.map((cut) => cut % (bytes.length + 1)))].sort((left, right) => left - right);
  const parts: Uint8Array[] = [];
  let start = 0;
  for (const point of points) {
    parts.push(bytes.slice(start, point));
    start = point;
  }
  parts.push(bytes.slice(start));
  return parts;
}

describe("negotiateProtocolVersion", () => {
  test("echoes a supported revision and otherwise offers the latest", () => {
    expect(negotiateProtocolVersion("2025-11-25")).toBe("2025-11-25");
    expect(negotiateProtocolVersion("2025-06-18")).toBe("2025-06-18");
    for (const requested of ["2024-11-05", "2025-03-26", "2026-07-28", undefined, null, 20251125, {}]) {
      expect(negotiateProtocolVersion(requested)).toBe(LATEST_PROTOCOL_VERSION);
    }
    expect(SUPPORTED_PROTOCOL_VERSIONS[0]).toBe(LATEST_PROTOCOL_VERSION);
  });

  test("always answers a member of the supported set", () => {
    fc.assert(fc.property(fc.jsonValue(), (requested) => {
      const answer = negotiateProtocolVersion(requested);
      expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(answer);
      if (SUPPORTED_PROTOCOL_VERSIONS.some((version) => version === requested)) expect<unknown>(answer).toBe(requested);
    }), { numRuns: 200 });
  });
});

describe("parseFrame", () => {
  test("reads requests, notifications, and responses", () => {
    expect(parseFrame('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}')).toEqual({
      kind: "request", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" },
    });
    expect(parseFrame('{"jsonrpc":"2.0","id":"a","method":"ping"}')).toEqual({
      kind: "request", id: "a", method: "ping", params: undefined,
    });
    expect(parseFrame('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toEqual({
      kind: "notification", method: "notifications/initialized", params: undefined,
    });
    expect(parseFrame('{"jsonrpc":"2.0","id":3,"result":{}}')).toEqual({ kind: "response" });
    expect(parseFrame('{"jsonrpc":"2.0","id":3,"error":{"code":-1,"message":"x"}}')).toEqual({ kind: "response" });
  });

  test("refuses batches, non-objects, and malformed JSON with a null id", () => {
    expect(parseFrame('[{"jsonrpc":"2.0","id":1,"method":"ping"}]')).toEqual({
      kind: "invalid", id: null, code: INVALID_REQUEST, message: "Batch requests are not supported.",
    });
    for (const text of ["5", '"ping"', "null", "true"]) {
      expect(parseFrame(text)).toEqual({ kind: "invalid", id: null, code: INVALID_REQUEST, message: "Expected a JSON-RPC object." });
    }
    for (const text of ["{", "", "{'a':1}", '{"jsonrpc":"2.0",}']) {
      expect(parseFrame(text)).toEqual({ kind: "invalid", id: null, code: PARSE_ERROR, message: "Frame must be valid JSON." });
    }
  });

  test("refuses bad ids, versions, methods, and params", () => {
    for (const id of ["null", "1.5", "{}", "[]", "true", String(2 ** 60)]) {
      expect(parseFrame(`{"jsonrpc":"2.0","id":${id},"method":"ping"}`)).toEqual({
        kind: "invalid", id: null, code: INVALID_REQUEST, message: "Request id must be a string or a safe integer.",
      });
    }
    expect(parseFrame('{"id":7,"method":"ping"}')).toEqual({
      kind: "invalid", id: 7, code: INVALID_REQUEST, message: 'Expected jsonrpc "2.0".',
    });
    expect(parseFrame('{"jsonrpc":"1.0","id":"x","method":"ping"}')).toMatchObject({ kind: "invalid", id: "x" });
    expect(parseFrame('{"jsonrpc":"2.0","id":7}')).toEqual({
      kind: "invalid", id: 7, code: INVALID_REQUEST, message: "Missing method.",
    });
    expect(parseFrame('{"jsonrpc":"2.0","id":7,"method":7}')).toEqual({
      kind: "invalid", id: 7, code: INVALID_REQUEST, message: "Method must be a string.",
    });
    for (const params of ["[]", "5", "null", '"x"']) {
      expect(parseFrame(`{"jsonrpc":"2.0","id":7,"method":"ping","params":${params}}`)).toEqual({
        kind: "invalid", id: 7, code: INVALID_REQUEST, message: "Params must be an object.",
      });
    }
  });

  test("round-trips any valid request or notification", () => {
    const id = fc.oneof(fc.string(), fc.maxSafeInteger());
    const params = fc.option(fc.dictionary(fc.string(), fc.jsonValue()), { nil: undefined });
    fc.assert(fc.property(fc.option(id, { nil: undefined }), fc.string(), params, (requestId, method, requestParams) => {
      const message = { jsonrpc: "2.0", ...(requestId === undefined ? {} : { id: requestId }), method, params: requestParams };
      const expectedParams = requestParams === undefined ? undefined : JSON.parse(JSON.stringify(requestParams));
      const frame = parseFrame(JSON.stringify(message));
      if (requestId === undefined) expect(frame).toEqual({ kind: "notification", method, params: expectedParams });
      else expect(frame).toEqual({ kind: "request", id: requestId, method, params: expectedParams });
    }), { numRuns: 200 });
  });

  test("never throws on arbitrary text", () => {
    fc.assert(fc.property(fc.oneof(fc.string(), fc.json()), (text) => {
      expect(["request", "notification", "response", "invalid"]).toContain(parseFrame(text).kind);
    }), { numRuns: 300 });
  });
});

describe("frameFromLine", () => {
  test("maps oversized and non-UTF-8 lines to null-id errors", () => {
    expect(frameFromLine({ kind: "oversized" })).toEqual({
      kind: "invalid", id: null, code: INVALID_REQUEST, message: `Frame exceeds ${MAX_FRAME_BYTES} bytes.`,
    });
    expect(frameFromLine({ kind: "unparseable" })).toEqual({
      kind: "invalid", id: null, code: PARSE_ERROR, message: "Frame must be valid UTF-8.",
    });
    expect(frameFromLine({ kind: "line", text: '{"jsonrpc":"2.0","method":"x"}' })).toMatchObject({ kind: "notification" });
  });
});

describe("readFrames", () => {
  test("splits on newlines, drops one carriage return, and skips whitespace-only lines", async () => {
    const events = await collect([encoder.encode('{"a":1}\r\n\n  \r\n{"b":2}\n\r\r\n{"c":3}')]);
    expect(events).toEqual([
      { kind: "line", text: '{"a":1}' },
      { kind: "line", text: '{"b":2}' },
      { kind: "line", text: '{"c":3}' },
    ]);
  });

  test("joins a multi-byte character split across chunks", async () => {
    const bytes = encoder.encode('{"t":"é😀"}\n');
    const events = await collect([...bytes].map((byte) => Uint8Array.of(byte)));
    expect(events).toEqual([{ kind: "line", text: '{"t":"é😀"}' }]);
  });

  test("reports invalid UTF-8 without losing later lines", async () => {
    const events = await collect([Uint8Array.of(0x7b, 0xff, 0x7d, 0x0a), encoder.encode('{"ok":true}\n')]);
    expect(events).toEqual([{ kind: "unparseable" }, { kind: "line", text: '{"ok":true}' }]);
  });

  test("discards a line over 1 MiB and keeps reading", async () => {
    const huge = new Uint8Array(MAX_FRAME_BYTES + 1).fill(0x20);
    const atLimit = encoder.encode(`"${"x".repeat(MAX_FRAME_BYTES - 2)}"`);
    expect(atLimit.length).toBe(MAX_FRAME_BYTES);
    const events = await collect([huge.subarray(0, 700_000), huge.subarray(700_000), encoder.encode("\n"), atLimit, encoder.encode('\n{"next":1}\n')]);
    expect(events.map((event) => event.kind)).toEqual(["oversized", "line", "line"]);
    expect(events[2]).toEqual({ kind: "line", text: '{"next":1}' });
  });

  test("delivers a final line without a newline, including an oversized one", async () => {
    expect(await collect([encoder.encode('{"a":1}\n{"b":2}')])).toEqual([
      { kind: "line", text: '{"a":1}' }, { kind: "line", text: '{"b":2}' },
    ]);
    expect(await collect([encoder.encode("123456789")], 8)).toEqual([{ kind: "oversized" }]);
    expect(await collect([encoder.encode("12345678")], 8)).toEqual([{ kind: "line", text: "12345678" }]);
    expect(await collect([])).toEqual([]);
  });

  test("awaits each frame before the next", async () => {
    const log: string[] = [];
    await readFrames(stream([encoder.encode("1\n2\n3\n")]), async (event) => {
      if (event.kind !== "line") throw new Error("unexpected event");
      log.push(`start ${event.text}`);
      await new Promise((resolve) => setTimeout(resolve, event.text === "1" ? 20 : 1));
      log.push(`end ${event.text}`);
    });
    expect(log).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  });

  test("rejects a nonsensical frame limit", async () => {
    await expect(collect([], 0)).rejects.toThrow(RangeError);
  });

  test("yields the same events for any chunking of the byte stream", async () => {
    const rawBytes = fc.array(fc.oneof(fc.constant(0x0a), fc.constant(0x0d), fc.integer({ min: 0, max: 255 })), { maxLength: 300 })
      .map((values) => Uint8Array.from(values));
    const textBytes = fc.array(
      fc.tuple(fc.string({ unit: "grapheme", maxLength: 40 }), fc.constantFrom("\n", "\r\n", "\n\n")),
      { maxLength: 12 },
    ).map((lines) => encoder.encode(lines.map(([text, end]) => text + end).join("")));
    await fc.assert(fc.asyncProperty(
      fc.oneof(rawBytes, textBytes),
      fc.array(fc.nat(), { maxLength: 20 }),
      fc.constantFrom(undefined, 4, 32),
      async (bytes, cuts, limit) => {
        const whole = await collect([bytes], limit);
        const pieces = await collect(splitAt(bytes, cuts), limit);
        expect(pieces).toEqual(whole);
        for (const event of whole) {
          if (event.kind !== "line") continue;
          expect(event.text.includes("\n")).toBe(false);
          expect(event.text.trim()).not.toBe("");
          if (limit !== undefined) expect(encoder.encode(event.text).length).toBeLessThanOrEqual(limit);
        }
      },
    ), { numRuns: 200 });
  });
});

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function tool(name: string): ToolDefinition {
  return { name, description: `The ${name} stub.`, inputSchema: { type: "object", additionalProperties: true }, annotations };
}

type StubCatalog = ToolCatalog & { readonly calls: [string, unknown][]; closed: number };

function stubCatalog(): StubCatalog {
  const catalog: StubCatalog = {
    tools: [tool("echo"), tool("slow"), tool("boom"), tool("bigint")],
    calls: [],
    closed: 0,
    async call(name, args): Promise<CallToolResult> {
      catalog.calls.push([name, args]);
      if (name === "boom") throw new Error("boom");
      if (name === "slow") await new Promise((resolve) => setTimeout(resolve, 30));
      if (name === "bigint") return { content: [], structuredContent: { value: 1n as unknown as number } };
      return { content: [{ type: "text", text: JSON.stringify(args) }], structuredContent: { ...args, tool: name } };
    },
    async close() {
      catalog.closed += 1;
    },
  };
  return catalog;
}

function request(id: number | string, method: string, params?: Record<string, unknown>) {
  return parseFrame(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }));
}

describe("createDispatcher", () => {
  const dispatcher = (catalog = stubCatalog()) => createDispatcher({ catalog, instructions: "Use search first.", version: "1.2.3" });

  test("initialize negotiates the revision and advertises tools only", async () => {
    const handler = dispatcher();
    for (const [requested, answered] of [
      ["2025-11-25", "2025-11-25"], ["2025-06-18", "2025-06-18"], ["2024-11-05", "2025-11-25"], [undefined, "2025-11-25"],
    ] as const) {
      const params = requested === undefined ? {} : { protocolVersion: requested, capabilities: {}, clientInfo: { name: "t", version: "0" } };
      expect(await handler.handle(request(1, "initialize", params))).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: answered,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: "1.2.3" },
          instructions: "Use search first.",
        },
      });
    }
    expect(await handler.handle(request(2, "initialize"))).toMatchObject({ result: { protocolVersion: LATEST_PROTOCOL_VERSION } });
  });

  test("answers ping and lists every tool in one page", async () => {
    const catalog = stubCatalog();
    const handler = dispatcher(catalog);
    expect(await handler.handle(request("p", "ping"))).toEqual({ jsonrpc: "2.0", id: "p", result: {} });
    expect(await handler.handle(request(3, "tools/list", { cursor: "ignored" }))).toEqual({
      jsonrpc: "2.0", id: 3, result: { tools: catalog.tools },
    });
  });

  test("refuses unsupported methods, including the modern-era discovery probe", async () => {
    const handler = dispatcher();
    for (const method of ["server/discover", "resources/list", "tools.list", "initialized"]) {
      expect(await handler.handle(request(4, method))).toEqual({
        jsonrpc: "2.0", id: 4, error: { code: METHOD_NOT_FOUND, message: `Method ${method} is not supported.` },
      });
    }
  });

  test("ignores notifications and client responses", async () => {
    const handler = dispatcher();
    for (const text of [
      '{"jsonrpc":"2.0","method":"notifications/initialized"}',
      '{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1}}',
      '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"echo"}}',
      '{"jsonrpc":"2.0","id":9,"result":{}}',
    ]) {
      expect(await handler.handle(parseFrame(text))).toBeNull();
    }
  });

  test("answers invalid frames with their JSON-RPC error", async () => {
    expect(await dispatcher().handle(parseFrame("{"))).toEqual({
      jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Frame must be valid JSON." },
    });
    expect(await dispatcher().handle(parseFrame('{"jsonrpc":"2.0","id":5}'))).toEqual({
      jsonrpc: "2.0", id: 5, error: { code: INVALID_REQUEST, message: "Missing method." },
    });
  });

  test("calls listed tools and refuses unknown names and malformed params", async () => {
    const catalog = stubCatalog();
    const handler = dispatcher(catalog);
    expect(await handler.handle(request(6, "tools/call", { name: "echo", arguments: { q: "x" } }))).toEqual({
      jsonrpc: "2.0", id: 6, result: { content: [{ type: "text", text: '{"q":"x"}' }], structuredContent: { q: "x", tool: "echo" } },
    });
    await handler.handle(request(7, "tools/call", { name: "echo" }));
    expect(catalog.calls).toEqual([["echo", { q: "x" }], ["echo", {}]]);
    for (const name of ["missing", "hidden", "ECHO", ""]) {
      expect(await handler.handle(request(8, "tools/call", { name }))).toEqual({
        jsonrpc: "2.0", id: 8, error: { code: INVALID_PARAMS, message: `Unknown tool: ${name}` },
      });
    }
    for (const params of [undefined, {}, { name: 5 }, { name: "echo", arguments: [] }, { name: "echo", arguments: "q" }, { name: "echo", arguments: null }]) {
      expect(await handler.handle(request(9, "tools/call", params))).toEqual({
        jsonrpc: "2.0", id: 9, error: { code: INVALID_PARAMS, message: "Invalid tools/call params." },
      });
    }
    expect(catalog.calls).toHaveLength(2);
  });

  test("turns a handler exception into -32603 and keeps serving", async () => {
    const handler = dispatcher();
    expect(await handler.handle(request(10, "tools/call", { name: "boom" }))).toEqual({
      jsonrpc: "2.0", id: 10, error: { code: INTERNAL_ERROR, message: "Internal error: boom" },
    });
    expect(await handler.handle(request(11, "ping"))).toEqual({ jsonrpc: "2.0", id: 11, result: {} });
  });
});

describe("encodeResponse", () => {
  test("writes one line and falls back to -32603 for unserializable results", () => {
    expect(encodeResponse({ jsonrpc: "2.0", id: 1, result: { text: "a\nb " } })).toBe('{"jsonrpc":"2.0","id":1,"result":{"text":"a\\nb "}}\n');
    const fallback = JSON.parse(encodeResponse({ jsonrpc: "2.0", id: "x", result: { value: 1n } }));
    expect(fallback).toMatchObject({ jsonrpc: "2.0", id: "x", error: { code: INTERNAL_ERROR } });
    expect(fallback.error.message).toStartWith("Internal error: ");
  });

  test("never embeds a raw newline", () => {
    fc.assert(fc.property(fc.jsonValue(), fc.oneof(fc.string(), fc.maxSafeInteger()), (result, id) => {
      const line = encodeResponse({ jsonrpc: "2.0", id, result });
      expect(line.endsWith("\n")).toBe(true);
      expect(line.slice(0, -1).includes("\n")).toBe(false);
      expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0", id });
    }), { numRuns: 200 });
  });
});

describe("serverVersion", () => {
  test("reads the package version", async () => {
    const manifest = await Bun.file(join(import.meta.dir, "..", "package.json")).json();
    expect(await serverVersion()).toBe(manifest.version);
  });

  test("accepts only stable canonical versions", () => {
    expect(parseStableVersion("0.22.5")).toBe("0.22.5");
    expect(parseStableVersion(`${Number.MAX_SAFE_INTEGER}.0.0`)).toBe(`${Number.MAX_SAFE_INTEGER}.0.0`);
    for (const value of ["01.2.3", "1.2", "1.2.3-beta.1", " 1.2.3", "1.2.3\n", "9007199254740992.0.0", 1, null, undefined]) {
      expect(() => parseStableVersion(value)).toThrow("package.json version must be a stable x.y.z version.");
    }
    fc.assert(fc.property(fc.tuple(fc.maxSafeNat(), fc.maxSafeNat(), fc.maxSafeNat()), (parts) => {
      expect(parseStableVersion(parts.join("."))).toBe(parts.join("."));
    }), { numRuns: 100 });
  });
});

describe("runMcpServer", () => {
  const lines = (...frames: unknown[]) => stream(frames.map((frame) => encoder.encode(`${typeof frame === "string" ? frame : JSON.stringify(frame)}\n`)));

  test("answers frames strictly in order and closes the catalog", async () => {
    const catalog = stubCatalog();
    const written: string[] = [];
    const stderr: string[] = [];
    const code = await runMcpServer({
      catalog,
      instructions: "i",
      version: "1.0.0",
      input: lines(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "slow" } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "ping" },
        "not json",
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "bigint" } },
      ),
      writeFrame: async (line) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        written.push(line);
      },
      stderr: (text) => stderr.push(text),
    });
    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(catalog.closed).toBe(1);
    expect(written.every((line) => line.endsWith("\n") && !line.slice(0, -1).includes("\n"))).toBe(true);
    expect(written.map((line) => JSON.parse(line).id)).toEqual([1, 2, null, 3]);
    expect(JSON.parse(written[3]!).error.code).toBe(INTERNAL_ERROR);
  });

  test("reports an oversized frame with the configured limit", async () => {
    const written: string[] = [];
    await runMcpServer({
      catalog: stubCatalog(), instructions: "i", version: "1.0.0", maxFrameBytes: 16,
      input: lines({ jsonrpc: "2.0", id: 1, method: "ping" }, '{"a":1}'),
      writeFrame: async (line) => {
        written.push(line);
      },
      stderr: () => undefined,
    });
    expect(written.map((line) => JSON.parse(line))).toEqual([
      { jsonrpc: "2.0", id: null, error: { code: INVALID_REQUEST, message: "Frame exceeds 16 bytes." } },
      { jsonrpc: "2.0", id: null, error: { code: INVALID_REQUEST, message: "Expected jsonrpc \"2.0\"." } },
    ]);
  });

  test("returns 1 with one stderr line when a write or read fails", async () => {
    const catalog = stubCatalog();
    const stderr: string[] = [];
    const code = await runMcpServer({
      catalog, instructions: "i", version: "1.0.0",
      input: lines({ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "ping" }),
      writeFrame: async () => {
        throw new Error("write EPIPE\nbroken");
      },
      stderr: (text) => stderr.push(text),
    });
    expect(code).toBe(1);
    expect(stderr).toEqual(["error: MCP transport failed: write EPIPE broken\n"]);
    expect(catalog.closed).toBe(1);

    async function* failing(): AsyncGenerator<Uint8Array> {
      yield encoder.encode('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
      throw new Error("read failed");
    }
    const readErrors: string[] = [];
    const written: string[] = [];
    expect(await runMcpServer({
      catalog: stubCatalog(), instructions: "i", version: "1.0.0", input: failing(),
      writeFrame: async (line) => {
        written.push(line);
      },
      stderr: (text) => readErrors.push(text),
    })).toBe(1);
    expect(written).toHaveLength(1);
    expect(readErrors).toEqual(["error: MCP transport failed: read failed\n"]);
  });
});

describe("guardStdout", () => {
  test("sends stray stdout and console output to stderr while frames reach stdout", async () => {
    const script = [
      `import { guardStdout } from ${JSON.stringify(join(import.meta.dir, "mcp-server.ts"))};`,
      "const guard = guardStdout();",
      'console.log("console noise");',
      'console.info("info noise");',
      'process.stdout.write("write noise\\n");',
      "await guard.writeFrame('{\"frame\":1}\\n');",
      "guard.restore();",
      'process.stdout.write("after restore\\n");',
    ].join("\n");
    const child = Bun.spawn([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect({ code, stdout }).toEqual({ code: 0, stdout: '{"frame":1}\nafter restore\n' });
    expect(stderr).toContain("console noise\n");
    expect(stderr).toContain("info noise\n");
    expect(stderr).toContain("write noise\n");
  });
});

const DISCOVERY_SCHEMA = "hraness-support-discovery-v1";

/** The environment in which `src/support.test.ts` shows the discovery JSON after useful commands. */
function discoveryEligibleEnvironment(stateDirectory: string): Record<string, string | undefined> {
  return {
    ...process.env,
    XDG_STATE_HOME: stateDirectory,
    HRANESS_SUPPORT: "",
    HRANESS_SUPPORT_EMAIL: "off",
    HRANESS_SUPPORT_AUDIENCE: "agent",
    CI: "",
    CONTINUOUS_INTEGRATION: "",
    GITHUB_ACTIONS: "",
    TF_BUILD: "",
    BUILD_NUMBER: "",
    TEAMCITY_VERSION: "",
    JENKINS_URL: "",
  };
}

type WireResponse = {
  readonly jsonrpc: string;
  readonly id: RequestIdValue;
  readonly result?: { readonly structuredContent?: Record<string, unknown>; readonly isError?: boolean; readonly [key: string]: unknown };
  readonly error?: { readonly code: number; readonly message: string };
};
type RequestIdValue = string | number | null;

function spawnCli(arguments_: readonly string[], env: Record<string, string | undefined>) {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), ...arguments_], {
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = new Response(child.stderr).text();
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const lines: string[] = [];
  const readLine = async (): Promise<string> => {
    for (;;) {
      const newline = buffered.indexOf("\n");
      if (newline >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        lines.push(line);
        return line;
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`stdout ended early; stderr: ${await stderr}`);
      buffered += decoder.decode(chunk.value, { stream: true });
    }
  };
  let nextId = 0;
  return {
    notify(method: string, params?: unknown): void {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) })}\n`);
      child.stdin.flush();
    },
    async request(method: string, params?: unknown): Promise<WireResponse> {
      nextId += 1;
      const id = nextId;
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) })}\n`);
      child.stdin.flush();
      const response = JSON.parse(await readLine()) as WireResponse;
      expect(response).toMatchObject({ jsonrpc: "2.0", id });
      return response;
    },
    async finish(): Promise<{ code: number; lines: readonly string[]; rest: string; stderr: string }> {
      child.stdin.end();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffered += decoder.decode(chunk.value, { stream: true });
      }
      buffered += decoder.decode();
      return { code: await child.exited, lines, rest: buffered, stderr: await stderr };
    },
  };
}

describe("wordcell mcp subprocess", () => {
  test("serves a full session with only JSON-RPC frames on stdout and no support discovery", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hraness-wordcell-mcp-"));
    try {
      const vault = join(temporary, "vault");
      await initVault(vault);
      const env = discoveryEligibleEnvironment(join(temporary, "state"));
      const server = spawnCli(["mcp", "--root", vault], env);

      const initialized = await server.request("initialize", {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "subprocess-test", version: "0" },
      });
      expect(initialized.result).toMatchObject({
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: { name: SERVER_NAME, version: await serverVersion() },
      });
      server.notify("notifications/initialized");
      const listed = await server.request("tools/list");
      expect((listed.result?.tools as readonly { name: string }[]).map((tool) => tool.name)).toContain("create_note");

      const call = (name: string, arguments_: Record<string, unknown>) => server.request("tools/call", { name, arguments: arguments_ });
      const searched = await call("search", { query: "wordcell", mode: "exact" });
      expect(searched.result?.isError).toBeUndefined();
      const created = await call("create_note", { id: "mcp-smoke", title: "MCP smoke", body: "First body." });
      expect(created.result?.isError).toBeUndefined();
      const read = await call("get_note", { id: "mcp-smoke" });
      expect(read.result?.structuredContent).toMatchObject({ id: "mcp-smoke", body: "First body.\n" });
      const updated = await call("update_note_body", {
        id: "mcp-smoke",
        body: "Second body.",
        expected_revision: read.result?.structuredContent?.revision,
      });
      expect(updated.result?.structuredContent).toMatchObject({ changed: true });
      const reread = await call("get_note", { id: "mcp-smoke" });
      expect(reread.result?.structuredContent).toMatchObject({ body: "Second body.\n" });

      const finished = await server.finish();
      expect(finished.code).toBe(0);
      expect(finished.rest).toBe("");
      expect(finished.lines).toHaveLength(7);
      for (const line of finished.lines) {
        expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0" });
      }
      expect(finished.lines.join("\n")).not.toContain(DISCOVERY_SCHEMA);
      expect(finished.stderr).not.toContain(DISCOVERY_SCHEMA);

      // Control: the same environment does show discovery after a useful command.
      const control = spawnCli(["list", "--root", vault, "--json"], env);
      const controlled = await control.finish();
      expect(controlled.code).toBe(0);
      expect(controlled.stderr).toContain(DISCOVERY_SCHEMA);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 60_000);

  test("a missing root exits 2 with one stderr line and an empty stdout, without waiting for input", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hraness-wordcell-mcp-"));
    try {
      const child = Bun.spawn(
        [process.execPath, join(import.meta.dir, "cli.ts"), "mcp", "--root", join(temporary, "absent")],
        { env: discoveryEligibleEnvironment(join(temporary, "state")), stdin: "pipe", stdout: "pipe", stderr: "pipe" },
      );
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect({ code, stdout }).toEqual({ code: 2, stdout: "" });
      expect(stderr).toStartWith("error: ");
      expect(stderr.endsWith("\n")).toBe(true);
      expect(stderr.split("\n")).toHaveLength(2);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 30_000);

  test("--json is a parse error on stderr, never a JSON object on stdout", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hraness-wordcell-mcp-"));
    try {
      for (const arguments_ of [["mcp", "--root", temporary, "--json"], ["mcp", "--root", "--json"], ["mcp", "--root", ""]]) {
        const child = Bun.spawn(
          [process.execPath, join(import.meta.dir, "cli.ts"), ...arguments_],
          { env: discoveryEligibleEnvironment(join(temporary, "state")), stdin: "pipe", stdout: "pipe", stderr: "pipe" },
        );
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect({ arguments_, code, stdout }).toEqual({ arguments_, code: 2, stdout: "" });
        expect(stderr).toStartWith("error: ");
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 30_000);
});
