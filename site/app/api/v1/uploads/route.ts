import { hostedConfig, HOSTED_LIMITS } from "../../../../lib/hosted/config";
import {
  apiError,
  apiOk,
  apiUnavailable,
  isRecord,
  readJsonBody,
} from "../../../../lib/hosted/errors";
import { authenticate } from "../../../../lib/hosted/auth";
import { spend } from "../../../../lib/hosted/quota";
import { newUploadKey, ObjectStore } from "../../../../lib/hosted/store";

export const dynamic = "force-dynamic";

const MAX_BODY = 2048;

/**
 * Mint a presigned PUT for one vault asset. The publish request then references
 * `{"upload": "<id>"}` for binary files too large for the inline map.
 */
export async function POST(request: Request): Promise<Response> {
  const config = hostedConfig();
  if (config === null) return apiUnavailable();
  const store = new ObjectStore(config);
  const token = await authenticate(store, request);
  if (token === undefined) {
    return apiError({
      code: "UNAUTHORIZED",
      message: "a Bearer wc_pub_ token is required; mint one with POST /api/v1/tokens",
      retryable: false,
    }, 401);
  }

  const body = await readJsonBody(request, MAX_BODY);
  if (body === "too_large" || !isRecord(body)) {
    return apiError({
      code: "BAD_REQUEST",
      message: "body must be a JSON object with a bytes integer",
      retryable: false,
    }, 400);
  }
  const bytes = body.bytes;
  if (
    typeof bytes !== "number" || !Number.isSafeInteger(bytes) ||
    bytes < 1 || bytes > HOSTED_LIMITS.uploadBytes
  ) {
    return apiError({
      code: "BAD_REQUEST",
      message: `bytes must be an integer from 1 through ${HOSTED_LIMITS.uploadBytes}`,
      retryable: false,
    }, 400);
  }

  const verdict = await spend(
    store, `key8/${token.key8}`, "uploads", HOSTED_LIMITS.uploadsPerDay,
  );
  if (!verdict.ok) {
    return apiError({
      code: "RATE_LIMITED",
      message: "daily upload quota reached for this token",
      retryable: true,
    }, 429);
  }

  const { id, key } = newUploadKey(token.key8);
  return apiOk({
    id,
    url: store.uploadUrl(key, bytes, HOSTED_LIMITS.uploadUrlSeconds),
    method: "PUT",
    expiresInSeconds: HOSTED_LIMITS.uploadUrlSeconds,
    maxBytes: bytes,
    note: "PUT the raw bytes with content-length equal to bytes, then reference this id as {\"upload\": id} in a publish files map. Unreferenced uploads expire after one day.",
  });
}
