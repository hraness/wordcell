import type { SearchReranker } from "./rerank.js";
import { createHostedReranker, type SystemOneTransport, type TypeSafeRerankerOptions } from "./rerank-typesafe.js";

export const CLEF_MODELS = ["clef", "clef-flash"] as const;
export type ClefModel = (typeof CLEF_MODELS)[number];
export const DEFAULT_CLEF_MODEL: ClefModel = "clef";
export type ClefTransport = SystemOneTransport;
export type ClefRerankerOptions = TypeSafeRerankerOptions & { readonly model?: ClefModel };

export function clefEndpoint(accountId: string, model: ClefModel = DEFAULT_CLEF_MODEL): string {
  if (typeof accountId !== "string" || !/^[a-f0-9]{32}$/u.test(accountId) || !CLEF_MODELS.includes(model)) {
    throw new Error("Invalid Cloudflare Clef account or model.");
  }
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/cloudflare/${model}`;
}

function unwrapClefResponse(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  if (envelope["success"] !== true || !Object.hasOwn(envelope, "result")
    || (envelope["errors"] !== undefined && (!Array.isArray(envelope["errors"]) || envelope["errors"].length !== 0))) return null;
  return envelope["result"];
}

export function createClefReranker(options: ClefRerankerOptions = {}): SearchReranker {
  const environment = options.environment ?? process.env;
  const accountId = Object.hasOwn(environment, "CLOUDFLARE_ACCOUNT_ID") ? environment["CLOUDFLARE_ACCOUNT_ID"] : undefined;
  const apiKey = Object.hasOwn(environment, "CLOUDFLARE_API_TOKEN")
    ? environment["CLOUDFLARE_API_TOKEN"]
    : Object.hasOwn(environment, "CLOUDFLARE_AUTH_TOKEN") ? environment["CLOUDFLARE_AUTH_TOKEN"] : undefined;
  const model = options.model === undefined ? DEFAULT_CLEF_MODEL : options.model;
  let endpoint: string | undefined;
  try { if (accountId !== undefined) endpoint = clefEndpoint(accountId, model); } catch { endpoint = undefined; }
  const reranker = createHostedReranker(options, {
    id: "clef", label: "Cloudflare Clef", model, endpoint, apiKey,
    unavailableMessage: "Cloudflare Clef credentials or model are missing or invalid; set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
    unwrap: unwrapClefResponse,
  });
  return {
    id: reranker.id,
    rerank: async (request) => {
      try {
        if (typeof request === "object" && request !== null && "images" in request) {
          return { status: "failed", message: "Wordcell reranking accepts text only; image evidence is not supported." };
        }
        return await reranker.rerank(request);
      } catch {
        return { status: "failed", message: "Cloudflare Clef rerank request was malformed or failed." };
      }
    },
  };
}
