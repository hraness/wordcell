// @bun
import {
  createHostedReranker
} from "./index-1nemkjr9.js";

// src/rerank-clef.ts
var CLEF_MODELS = ["clef", "clef-flash"];
var DEFAULT_CLEF_MODEL = "clef";
function clefEndpoint(accountId, model = DEFAULT_CLEF_MODEL) {
  if (!/^[a-f0-9]{32}$/u.test(accountId) || !CLEF_MODELS.includes(model)) {
    throw new Error("Invalid Cloudflare Clef account or model.");
  }
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/cloudflare/${model}`;
}
function unwrapClefResponse(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const envelope = value;
  if (envelope["success"] !== true || !Object.hasOwn(envelope, "result") || envelope["errors"] !== undefined && (!Array.isArray(envelope["errors"]) || envelope["errors"].length !== 0))
    return null;
  return envelope["result"];
}
function createClefReranker(options = {}) {
  const environment = options.environment ?? process.env;
  const accountId = Object.hasOwn(environment, "CLOUDFLARE_ACCOUNT_ID") ? environment["CLOUDFLARE_ACCOUNT_ID"] : undefined;
  const apiKey = Object.hasOwn(environment, "CLOUDFLARE_API_TOKEN") ? environment["CLOUDFLARE_API_TOKEN"] : Object.hasOwn(environment, "CLOUDFLARE_AUTH_TOKEN") ? environment["CLOUDFLARE_AUTH_TOKEN"] : undefined;
  const model = options.model ?? DEFAULT_CLEF_MODEL;
  let endpoint;
  try {
    if (accountId !== undefined)
      endpoint = clefEndpoint(accountId, model);
  } catch {
    endpoint = undefined;
  }
  const reranker = createHostedReranker(options, {
    id: "clef",
    label: "Cloudflare Clef",
    model,
    endpoint,
    apiKey,
    unavailableMessage: "Cloudflare Clef credentials or model are missing or invalid; set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
    unwrap: unwrapClefResponse
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
    }
  };
}

export { CLEF_MODELS, DEFAULT_CLEF_MODEL, clefEndpoint, createClefReranker };
