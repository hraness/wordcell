import { hostedConfig, HOSTED_LIMITS } from "../../../../lib/hosted/config";
import {
  apiError,
  apiOk,
  apiUnavailable,
  isRecord,
  readJsonBody,
} from "../../../../lib/hosted/errors";
import { clientIpKey, newToken, tokenDigest } from "../../../../lib/hosted/auth";
import { spend } from "../../../../lib/hosted/quota";
import { ObjectStore } from "../../../../lib/hosted/store";

export const dynamic = "force-dynamic";

const MAX_BODY = 1024;

/**
 * Mint a capability token. Self-serve and free; the mint is bounded by client
 * IP. The server stores only the token digest, so the token itself is shown
 * once — the caller is responsible for storing it.
 */
export async function POST(request: Request): Promise<Response> {
  const config = hostedConfig();
  if (config === null) return apiUnavailable();
  const store = new ObjectStore(config);

  const body = await readJsonBody(request, MAX_BODY);
  if (body === "too_large") {
    return apiError({
      code: "TOO_LARGE",
      message: `body must be at most ${MAX_BODY} bytes`,
      retryable: false,
    }, 413);
  }
  const label = isRecord(body) && typeof body.label === "string" &&
      body.label.length >= 1 && body.label.length <= 80
    ? body.label
    : undefined;
  if (isRecord(body) && "label" in body && label === undefined) {
    return apiError({
      code: "BAD_REQUEST",
      message: "label must be a string of 1-80 characters",
      retryable: false,
    }, 400);
  }

  const verdict = await spend(
    store, `ip/${clientIpKey(request)}`, "token_mints", HOSTED_LIMITS.tokenMintsPerDay,
  );
  if (!verdict.ok) {
    return apiError({
      code: "RATE_LIMITED",
      message: "too many tokens minted from this address today",
      retryable: true,
    }, 429);
  }

  const token = newToken();
  const digest = tokenDigest(token);
  const stored = await store.putJson(`tok/${digest}`, {
    v: 1,
    key8: digest.slice(0, 8),
    label: label ?? null,
    createdAt: new Date().toISOString(),
  });
  if (!stored) {
    return apiError({
      code: "TOKEN_STORE_FAILED",
      message: "could not record the token; try again",
      retryable: true,
    }, 502);
  }
  return apiOk({
    token,
    key8: digest.slice(0, 8),
    sites: `/api/v1/sites`,
    urlBase: `${config.siteOrigin}/p/${digest.slice(0, 8)}/`,
    note: "The token is shown once. Store it outside model-visible state.",
  });
}
