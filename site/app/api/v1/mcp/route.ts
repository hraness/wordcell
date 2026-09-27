import { apiError } from "../../../../lib/hosted/errors";
import { isRecord } from "../../../../lib/hosted/errors";
import { OPERATION_CONTRACT } from "../../../../lib/hosted/records";
import { POST as mintToken } from "../tokens/route";
import { GET as listSites } from "../sites/route";
import {
  DELETE as deleteSite,
  GET as getSite,
  PUT as publishSite,
} from "../sites/[slug]/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROTOCOL_VERSION = "2025-11-25";
const ORIGIN = "https://wordcell.io";

/**
 * Stateless streamable-HTTP MCP adapter over the REST surface. Each POST is
 * one JSON-RPC message; the handler synthesizes an internal request to the
 * matching REST route so auth, bounds, and quotas stay in exactly one place.
 * `authorization` and the client-IP headers are forwarded so capability auth
 * and IP-keyed mint/publish quotas behave identically to direct REST calls.
 */

type Tool = Readonly<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}>;

const operationSchema = {
  type: "object", additionalProperties: false, required: ["contract", "id", "expectedRevision"],
  properties: {
    contract: { const: OPERATION_CONTRACT },
    id: { type: "string", format: "uuid" },
    expectedRevision: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 },
  },
};

const TOOLS: readonly Tool[] = [
  {
    name: "create_token",
    description:
      "Mint a wc_pub_ capability token (self-serve, IP-limited). The token is "
      + "returned once and owns a site namespace; send it as Bearer on later calls.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", maxLength: 80 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "publish_site",
    description:
      "Publish a bounded Markdown vault as a public site. files maps vault "
      + "paths (e.g. \"notes/a.md\") to utf8 text, {base64} payloads, or "
      + "{upload} ids from POST /api/v1/uploads. Supply a unique operation ID and "
      + "the current revision from get_site (0 for a new slug). Exact retries are idempotent. Requires Bearer wc_pub_ authorization.",
    inputSchema: {
      type: "object",
      required: ["slug", "files", "operation"],
      properties: {
        operation: operationSchema,
        slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,62}$" },
        files: {
          type: "object",
          additionalProperties: {
            anyOf: [
              { type: "string" },
              { type: "object", required: ["base64"], properties: { base64: { type: "string" } }, additionalProperties: false },
              { type: "object", required: ["upload"], properties: { upload: { type: "string" } }, additionalProperties: false },
            ],
          },
        },
        title: { type: "string" },
        description: { type: "string" },
        index: { type: "string" },
        noindex: { type: "boolean" },
        indexContent: { type: "boolean" },
        selection: { type: "object" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_sites",
    description:
      "List the token's live sites: slug, public url, digest, revision, notes, "
      + "bytes, updatedAt. Requires Bearer wc_pub_ authorization.",
    inputSchema: { type: "object", additionalProperties: false },
  },
  {
    name: "get_site",
    description: "Read the current site revision, or reconcile an operation ID after an uncertain write. Requires Bearer wc_pub_ authorization.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["slug"],
      properties: { slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,62}$" }, operation: { type: "string", format: "uuid" } },
    },
  },
  {
    name: "delete_site",
    description:
      "Unpublish a site conditionally and retain a deletion receipt. Shared artifact bytes remain stored. "
      + "Public reads may keep a cached copy for up to 60 seconds. Requires "
      + "Bearer wc_pub_ authorization.",
    inputSchema: {
      type: "object",
      required: ["slug", "operation"],
      properties: {
        operation: operationSchema,
        slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,62}$" },
      },
      additionalProperties: false,
    },
  },
];

function rpcResult(id: unknown, result: unknown): Response {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { headers: { "cache-control": "no-store" } },
  );
}

function rpcError(id: unknown, code: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { headers: { "cache-control": "no-store" } },
  );
}

function isJsonRpcId(value: unknown): value is string | number {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isSafeInteger(value))
  );
}

/** Headers the REST layer reads for auth and quota keys. */
function forwardedHeaders(request: Request, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  for (const name of ["authorization", "x-forwarded-for", "x-real-ip"] as const) {
    const value = request.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  return headers;
}

async function callTool(request: Request, name: string, args: Record<string, unknown>): Promise<Response> {
  switch (name) {
    case "get_site": {
      const { slug, operation } = args;
      if (typeof slug !== "string" || (operation !== undefined && typeof operation !== "string")) {
        return apiError({ code: "BAD_REQUEST", message: "slug and optional operation ID must be strings", retryable: false }, 400);
      }
      const suffix = operation === undefined ? "" : `?operation=${encodeURIComponent(operation)}`;
      return getSite(new Request(`${ORIGIN}/api/v1/sites/${encodeURIComponent(slug)}${suffix}`, {
        headers: forwardedHeaders(request),
      }), { params: Promise.resolve({ slug }) });
    }
    case "create_token":
      return mintToken(new Request(`${ORIGIN}/api/v1/tokens`, {
        method: "POST",
        headers: forwardedHeaders(request, { "content-type": "application/json" }),
        body: JSON.stringify(args),
      }));
    case "list_sites":
      return listSites(new Request(`${ORIGIN}/api/v1/sites`, {
        headers: forwardedHeaders(request),
      }));
    case "publish_site": {
      const { slug, ...body } = args;
      if (typeof slug !== "string") {
        return apiError({ code: "BAD_REQUEST", message: "slug is required", retryable: false }, 400);
      }
      return publishSite(new Request(`${ORIGIN}/api/v1/sites/${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: forwardedHeaders(request, { "content-type": "application/json" }),
        body: JSON.stringify(body),
      }), { params: Promise.resolve({ slug }) });
    }
    case "delete_site": {
      const { slug, ...body } = args;
      if (typeof slug !== "string") {
        return apiError({ code: "BAD_REQUEST", message: "slug is required", retryable: false }, 400);
      }
      return deleteSite(new Request(`${ORIGIN}/api/v1/sites/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: forwardedHeaders(request, { "content-type": "application/json" }),
        body: JSON.stringify(body),
      }), { params: Promise.resolve({ slug }) });
    }
    default:
      return apiError({ code: "UNKNOWN_TOOL", message: `tool ${name} is not available`, retryable: false }, 400);
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Body must be valid JSON.");
  }
  if (!isRecord(body)) {
    return rpcError(null, -32600, "Expected a JSON-RPC object.");
  }
  const id = "id" in body && isJsonRpcId(body.id) ? body.id : undefined;
  const method = body.method;
  if (typeof method !== "string") {
    return rpcError(id ?? null, -32600, "Missing method.");
  }
  if (id === undefined) return new Response(null, { status: 202 });

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "hraness-wordcell-hosted", version: "1" },
      });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
    case "tools.list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call":
    case "tools.call": {
      const params = isRecord(body.params) ? body.params : {};
      const name = typeof params.name === "string" ? params.name : "";
      const args = isRecord(params.arguments) ? { ...params.arguments } : {};
      const response = await callTool(request, name, args);
      const text = await response.text();
      let structured: unknown = null;
      try {
        structured = JSON.parse(text);
      } catch { /* non-JSON bodies surface as plain text content */ }
      return rpcResult(id, {
        content: [{ type: "text", text }],
        ...(structured === null ? {} : { structuredContent: structured }),
        ...(response.status >= 400 ? { isError: true } : {}),
      });
    }
    default:
      return rpcError(id, -32601, `Method ${method} is not supported.`);
  }
}
