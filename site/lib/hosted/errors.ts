/** Error envelope shared by every hosted API route. */

export type ApiError = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
}>;

export function apiOk(body: Record<string, unknown>, status = 200): Response {
  return Response.json({ ok: true, ...body }, { status, headers: { "cache-control": "no-store" } });
}

export function apiError(error: ApiError, status: number): Response {
  const response = Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
  return response;
}

export function apiUnavailable(): Response {
  return apiError({
    code: "HOSTING_UNAVAILABLE",
    message: "hosted publication is not configured on this deployment",
    retryable: false,
  }, 503);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<unknown | "too_large" | "invalid"> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return "too_large";
  if (request.body === null) return "invalid";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return "invalid";
  }
}
