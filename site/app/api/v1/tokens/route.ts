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

  let token: string | undefined;
  let digest = "";
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = newToken();
      const candidateDigest = tokenDigest(candidate);
      const key8 = candidateDigest.slice(0, 8);
      const legacy = await store.list(`tok/${key8}`, 2);
      if (legacy.truncated || legacy.keys.length !== 0) continue;
      if (await store.putConditional(`ns/${key8}`, { v: 1, digest: candidateDigest }, null) === "conflict") continue;
      const stored = await store.putConditional(`tok/${candidateDigest}`, {
        v: 1, key8, label: label ?? null, createdAt: new Date().toISOString(),
      }, null);
      if (stored !== "written") throw new Error("token_conflict");
      token = candidate;
      digest = candidateDigest;
      break;
    }
  } catch { /* No token is disclosed unless its namespace and record are durable. */ }
  if (token === undefined) {
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
