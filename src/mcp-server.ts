/**
 * Local Model Context Protocol server over stdio.
 *
 * This module owns framing, JSON-RPC parsing, and dispatch. It holds no vault
 * logic; tools arrive from `mcp-tools.ts` through the dispatcher options.
 */

import { readFile } from "node:fs/promises";
import { format } from "node:util";

/** Newest handshake-era revision; the hosted `/api/v1/mcp` route speaks the same one. */
export const LATEST_PROTOCOL_VERSION = "2025-11-25";

/**
 * Revisions this server answers with, newest first. 2025-03-26 is excluded because it
 * requires servers to accept JSON-RPC batches, and 2024-11-05 lacks tool annotations
 * and structured tool output.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18"] as const;

export type SupportedProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

/** Largest accepted frame, counted in bytes before the delimiting newline. */
export const MAX_FRAME_BYTES = 1_048_576;

export const SERVER_NAME = "hraness-wordcell";

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export type RequestId = string | number;

export type Frame =
  | { readonly kind: "request"; readonly id: RequestId; readonly method: string; readonly params: unknown }
  | { readonly kind: "notification"; readonly method: string; readonly params: unknown }
  | { readonly kind: "response" }
  | {
    readonly kind: "invalid";
    readonly id: RequestId | null;
    readonly code: typeof PARSE_ERROR | typeof INVALID_REQUEST;
    readonly message: string;
  };

/** One newline-delimited unit read from the input stream. */
export type LineEvent =
  | { readonly kind: "line"; readonly text: string }
  | { readonly kind: "oversized" }
  | { readonly kind: "unparseable" };

/**
 * Answers the requested revision when this server supports it, else the newest one it
 * supports (2025-11-25 lifecycle: MUST echo a supported request, otherwise SHOULD offer
 * the latest).
 */
export function negotiateProtocolVersion(requested: unknown): SupportedProtocolVersion {
  const match = SUPPORTED_PROTOCOL_VERSIONS.find((version) => version === requested);
  return match ?? LATEST_PROTOCOL_VERSION;
}

function isRequestId(value: unknown): value is RequestId {
  return typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(id: RequestId | null, message: string): Frame {
  return { kind: "invalid", id, code: INVALID_REQUEST, message };
}

/** Parses one frame's text as a single JSON-RPC 2.0 message. Batches are refused. */
export function parseFrame(text: string): Frame {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: "invalid", id: null, code: PARSE_ERROR, message: "Frame must be valid JSON." };
  }
  if (Array.isArray(value)) return invalid(null, "Batch requests are not supported.");
  if (!isRecord(value)) return invalid(null, "Expected a JSON-RPC object.");
  const hasMethod = Object.hasOwn(value, "method");
  if (!hasMethod && (Object.hasOwn(value, "result") || Object.hasOwn(value, "error"))) {
    return { kind: "response" };
  }
  const hasId = Object.hasOwn(value, "id");
  const id = hasId && isRequestId(value.id) ? value.id : null;
  if (value.jsonrpc !== "2.0") return invalid(id, "Expected jsonrpc \"2.0\".");
  if (hasId && id === null) return invalid(null, "Request id must be a string or a safe integer.");
  if (!hasMethod) return invalid(id, "Missing method.");
  if (typeof value.method !== "string") return invalid(id, "Method must be a string.");
  const params = value.params;
  if (params !== undefined && !isRecord(params)) return invalid(id, "Params must be an object.");
  if (id === null) return { kind: "notification", method: value.method, params };
  return { kind: "request", id, method: value.method, params };
}

/** Maps a line event to a frame. Oversized and non-UTF-8 lines have no recoverable id. */
export function frameFromLine(event: LineEvent, maxFrameBytes = MAX_FRAME_BYTES): Frame {
  if (event.kind === "line") return parseFrame(event.text);
  if (event.kind === "oversized") return invalid(null, `Frame exceeds ${maxFrameBytes} bytes.`);
  return { kind: "invalid", id: null, code: PARSE_ERROR, message: "Frame must be valid UTF-8." };
}

export type ReadFramesOptions = { readonly maxFrameBytes?: number };

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/**
 * Splits a byte stream on `\n`, drops one trailing `\r`, and skips blank lines. Each
 * event is awaited before the next, so frames are handled strictly in order. A line
 * longer than `maxFrameBytes` is discarded through its newline and reported once as
 * `oversized`; a line that is not valid UTF-8 is reported as `unparseable`. A final
 * line without a newline is still delivered when the stream ends.
 */
export async function readFrames(
  input: AsyncIterable<Uint8Array>,
  onFrame: (event: LineEvent) => Promise<void>,
  options: ReadFramesOptions = {},
): Promise<void> {
  const maxFrameBytes = options.maxFrameBytes ?? MAX_FRAME_BYTES;
  if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1) {
    throw new RangeError("maxFrameBytes must be a positive safe integer.");
  }
  let pieces: Uint8Array[] = [];
  let length = 0;
  let oversized = false;

  const append = (piece: Uint8Array) => {
    if (oversized || piece.length === 0) return;
    length += piece.length;
    if (length > maxFrameBytes) {
      oversized = true;
      pieces = [];
      return;
    }
    pieces.push(piece);
  };

  const finish = async () => {
    const wasOversized = oversized;
    const line = concat(pieces, length);
    pieces = [];
    length = 0;
    oversized = false;
    if (wasOversized) return onFrame({ kind: "oversized" });
    const end = line.length > 0 && line[line.length - 1] === CARRIAGE_RETURN ? line.length - 1 : line.length;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(line.subarray(0, end));
    } catch {
      return onFrame({ kind: "unparseable" });
    }
    if (text.trim() === "") return;
    return onFrame({ kind: "line", text });
  };

  for await (const chunk of input) {
    let start = 0;
    for (let index = chunk.indexOf(NEWLINE); index !== -1; index = chunk.indexOf(NEWLINE, start)) {
      append(chunk.subarray(start, index));
      await finish();
      start = index + 1;
    }
    // Copy the tail: some streams reuse their chunk buffers after yielding them.
    append(chunk.slice(start));
  }
  if (length > 0 || oversized) await finish();
}

function concat(pieces: readonly Uint8Array[], length: number): Uint8Array {
  if (pieces.length === 1) return pieces[0]!;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}

export type ToolAnnotations = {
  readonly title?: string;
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
};

export type ToolDefinition = {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema?: Readonly<Record<string, unknown>>;
  readonly annotations: ToolAnnotations;
};

export type CallToolResult = {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly structuredContent?: Readonly<Record<string, unknown>>;
  readonly isError?: boolean;
};

/** The tool surface a server exposes. Tools absent from `tools` are unknown to callers. */
export type ToolCatalog = {
  readonly tools: readonly ToolDefinition[];
  call(name: string, args: Readonly<Record<string, unknown>>): Promise<CallToolResult>;
  close(): Promise<void>;
};

export type DispatcherOptions = {
  readonly catalog: ToolCatalog;
  readonly instructions: string;
  readonly version: string;
};

type JsonRpcResponse =
  | { readonly jsonrpc: "2.0"; readonly id: RequestId; readonly result: unknown }
  | { readonly jsonrpc: "2.0"; readonly id: RequestId | null; readonly error: { readonly code: number; readonly message: string } };

export type Dispatcher = {
  /** Answers one frame. Notifications and client responses yield `null`. */
  handle(frame: Frame): Promise<JsonRpcResponse | null>;
};

function errorResponse(id: RequestId | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Stateless like the hosted route: every method works without a prior `initialize`.
 * `server/discover` and other unsupported methods get -32601, which dual-era clients
 * treat as a cue to fall back to the `initialize` handshake.
 */
export function createDispatcher(options: DispatcherOptions): Dispatcher {
  const { catalog, instructions, version } = options;
  const listed = new Set(catalog.tools.map((tool) => tool.name));

  const request = async (id: RequestId, method: string, params: Readonly<Record<string, unknown>> | undefined) => {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: SERVER_NAME, version },
            instructions,
          },
        } as const;
      case "ping":
        return { jsonrpc: "2.0", id, result: {} } as const;
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: catalog.tools } } as const;
      case "tools/call": {
        const name = params?.name;
        const args = params !== undefined && Object.hasOwn(params, "arguments") ? params.arguments : {};
        if (typeof name !== "string" || !isRecord(args)) {
          return errorResponse(id, INVALID_PARAMS, "Invalid tools/call params.");
        }
        if (!listed.has(name)) return errorResponse(id, INVALID_PARAMS, `Unknown tool: ${name}`);
        return { jsonrpc: "2.0", id, result: await catalog.call(name, args) } as const;
      }
      default:
        return errorResponse(id, METHOD_NOT_FOUND, `Method ${method} is not supported.`);
    }
  };

  return {
    async handle(frame) {
      if (frame.kind === "invalid") return errorResponse(frame.id, frame.code, frame.message);
      if (frame.kind !== "request") return null;
      try {
        return await request(frame.id, frame.method, frame.params as Readonly<Record<string, unknown>> | undefined);
      } catch (error: unknown) {
        return errorResponse(frame.id, INTERNAL_ERROR, `Internal error: ${errorMessage(error)}`);
      }
    },
  };
}

/** Serializes a response as one frame line; an unserializable result becomes -32603 for its id. */
export function encodeResponse(response: JsonRpcResponse): string {
  try {
    const text = JSON.stringify(response);
    if (typeof text === "string") return `${text}\n`;
    throw new TypeError("response is not serializable");
  } catch (error: unknown) {
    return `${JSON.stringify(errorResponse(response.id, INTERNAL_ERROR, `Internal error: ${errorMessage(error)}`))}\n`;
  }
}

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Parses a stable package version: three canonical decimal components, each a safe integer. */
export function parseStableVersion(value: unknown): string {
  const match = typeof value === "string" ? STABLE_VERSION.exec(value) : null;
  if (match === null || match.slice(1).some((part) => !Number.isSafeInteger(Number(part)))) {
    throw new TypeError("package.json version must be a stable x.y.z version.");
  }
  return match[0];
}

/**
 * Reads this package's version for `serverInfo`. The relative URL reaches the package
 * root from both `src/` and the flat `dist/` chunks.
 */
export async function serverVersion(packageJson: URL = new URL("../package.json", import.meta.url)): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(packageJson, "utf8"));
  return parseStableVersion(isRecord(manifest) ? manifest.version : undefined);
}

export type StdoutGuard = {
  /** Writes one complete frame line to the real stdout and resolves once it is flushed. */
  writeFrame(line: string): Promise<void>;
  restore(): void;
};

/**
 * Holds stdout for protocol frames for the server's lifetime. Stray `process.stdout.write`
 * and `console.log/info/debug` calls from dependencies go to stderr instead, the same
 * boundary `runExecutable` applies to `--json` output.
 */
export function guardStdout(): StdoutGuard {
  const stdout = process.stdout;
  const ownWrite = Object.getOwnPropertyDescriptor(stdout, "write");
  const rawStdoutWrite = stdout.write.bind(stdout);
  const rawStderrWrite = process.stderr.write.bind(process.stderr);
  const originalConsole = { log: console.log, info: console.info, debug: console.debug };
  let streamError: Error | undefined;
  const onError = (error: Error) => {
    streamError ??= error;
  };
  const restore = () => {
    if (ownWrite === undefined) Reflect.deleteProperty(stdout, "write");
    else Object.defineProperty(stdout, "write", ownWrite);
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    stdout.off("error", onError);
  };
  const redirectedWrite = ((...arguments_: readonly unknown[]): boolean => {
    Reflect.apply(rawStderrWrite, process.stderr, arguments_);
    return true;
  }) as typeof process.stdout.write;
  const redirectedConsole = (...arguments_: readonly unknown[]): void => {
    rawStderrWrite(`${format(...arguments_)}\n`);
  };
  try {
    stdout.on("error", onError);
    Object.defineProperty(stdout, "write", { configurable: true, writable: true, value: redirectedWrite });
    console.log = redirectedConsole;
    console.info = redirectedConsole;
    console.debug = redirectedConsole;
  } catch (error: unknown) {
    restore();
    throw error;
  }
  return {
    writeFrame: (line) => new Promise<void>((resolve, reject) => {
      if (streamError !== undefined) return reject(streamError);
      rawStdoutWrite(line, (error?: Error | null) => {
        const failure = error ?? streamError;
        if (failure) reject(failure);
        else resolve();
      });
    }),
    restore,
  };
}

export type RunMcpServerOptions = DispatcherOptions & {
  readonly input: AsyncIterable<Uint8Array>;
  /** Receives each complete frame line, including its trailing newline. */
  readonly writeFrame: (line: string) => Promise<void>;
  readonly stderr: (text: string) => void;
  readonly maxFrameBytes?: number;
};

/**
 * Serves frames from `input` in order until it ends. Returns 0 after the last response
 * is flushed, or 1 with one stderr line when reading or writing fails. The catalog is
 * closed either way.
 */
export async function runMcpServer(options: RunMcpServerOptions): Promise<0 | 1> {
  const dispatcher = createDispatcher(options);
  const maxFrameBytes = options.maxFrameBytes ?? MAX_FRAME_BYTES;
  let code: 0 | 1 = 0;
  try {
    await readFrames(options.input, async (event) => {
      const response = await dispatcher.handle(frameFromLine(event, maxFrameBytes));
      if (response !== null) await options.writeFrame(encodeResponse(response));
    }, { maxFrameBytes });
  } catch (error: unknown) {
    options.stderr(`error: MCP transport failed: ${errorMessage(error).replaceAll("\n", " ")}\n`);
    code = 1;
  }
  try {
    await options.catalog.close();
  } catch (error: unknown) {
    options.stderr(`error: MCP session close failed: ${errorMessage(error).replaceAll("\n", " ")}\n`);
    code = 1;
  }
  return code;
}
