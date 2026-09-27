import { hostedConfig, HOSTED_LIMITS } from "../../../../../lib/hosted/config";
import {
  apiError,
  apiOk,
  apiUnavailable,
  isRecord,
  readJsonBody,
} from "../../../../../lib/hosted/errors";
import { authenticate, clientIpKey } from "../../../../../lib/hosted/auth";
import { spend } from "../../../../../lib/hosted/quota";
import {
  artifactDigest,
  MAX_DESCRIPTION,
  MAX_TITLE,
  parseFiles,
  parseSelection,
} from "../../../../../lib/hosted/parse";
import { contentTypeFor, isSlug, vaultPath } from "../../../../../lib/hosted/paths";
import {
  HostedPublishError,
  materializeVault,
  projectHostedVault,
} from "../../../../../lib/hosted/publish";
import { exactKeys, liveSite, OPERATION_CONTRACT, OPERATION_ID, parseOperation, type SiteOperation, type SiteRecord } from "../../../../../lib/hosted/records";
import { beginOperation, commitOperation, OperationError, operationResponse, preparedOperation, prepareOperation, readSite, reserveSiteCapacity, resolveOperation } from "../../../../../lib/hosted/operations";
import { ObjectStore } from "../../../../../lib/hosted/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = HOSTED_LIMITS.inlineBytesPerPublish + 512 * 1024;
const UPLOAD_CONCURRENCY = 8;
const MAX_EMITTED_FILES = 3_500;
const MAX_EMITTED_BYTES = 256 * 1024 * 1024;

type Params = { params: Promise<{ slug: string }> };

async function uploadArtifact(
  store: ObjectStore,
  key8: string,
  digest: string,
  files: ReadonlyMap<string, Uint8Array>,
): Promise<void> {
  const entries = [...files.entries()];
  for (let index = 0; index < entries.length; index += UPLOAD_CONCURRENCY) {
    const batch = entries.slice(index, index + UPLOAD_CONCURRENCY);
    const results = await Promise.all(batch.map(([path, bytes]) =>
      store.put(`s/${key8}/${digest}/${path}`, bytes, contentTypeFor(path))
    ));
    if (results.some((ok) => !ok)) {
      throw new HostedPublishError("artifact_upload_failed", "artifact storage failed", 502);
    }
  }
}

async function publish(request: Request, { params }: Params): Promise<Response> {
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
  const { slug } = await params;
  if (!isSlug(slug)) {
    return apiError({
      code: "BAD_SLUG",
      message: "slug must match [a-z0-9][a-z0-9-]{0,62}",
      retryable: false,
    }, 400);
  }

  const body = await readJsonBody(request, MAX_BODY);
  if (body === "too_large") {
    return apiError({
      code: "TOO_LARGE",
      message: `request body must be at most ${MAX_BODY} bytes`,
      retryable: false,
    }, 413);
  }
  if (!isRecord(body) || !("files" in body) || !exactKeys(body, ["operation", "files", "title", "description", "index", "noindex", "indexContent", "selection"])) {
    return apiError({
      code: "BAD_REQUEST",
      message: "body must be a JSON object with a files map",
      retryable: false,
    }, 400);
  }
  const files = parseFiles(body.files);
  if (files === "invalid") {
    return apiError({
      code: "BAD_FILES",
      message: "files must be a map of vault paths to utf8 strings, {base64}, or {upload} references",
      retryable: false,
    }, 400);
  }
  for (const name of ["title", "description", "index"] as const) {
    if (name in body && typeof body[name] !== "string") {
      return apiError({
        code: "BAD_REQUEST", message: `${name} must be a string`, retryable: false,
      }, 400);
    }
  }
  if (typeof body.title === "string" && body.title.length > MAX_TITLE ||
      typeof body.description === "string" &&
        body.description.length > MAX_DESCRIPTION ||
      typeof body.index === "string" &&
        (body.index.length > 512 || vaultPath(body.index) === undefined ||
          !body.index.toLowerCase().endsWith(".md"))) {
    return apiError({
      code: "BAD_REQUEST",
      message: "title/description/index exceed their bounds",
      retryable: false,
    }, 400);
  }
  for (const name of ["noindex", "indexContent"] as const) {
    if (name in body && typeof body[name] !== "boolean") {
      return apiError({
        code: "BAD_REQUEST", message: `${name} must be a boolean`, retryable: false,
      }, 400);
    }
  }
  const selection = parseSelection(body.selection);
  if (selection === "invalid") {
    return apiError({
      code: "BAD_SELECTION",
      message: "selection must use bounded string arrays, records, and a bounded from clause",
      retryable: false,
    }, 400);
  }

  const operation = parseOperation(body.operation);
  if (operation === undefined) return operationRequired();
  const state = await beginOperation(store, token, slug, operation, "publish", body);
  if (state.status === "committed") return apiOk(operationResponse(state.head, config.siteOrigin, true));
  if (state.status === "unknown") throw new OperationError("OPERATION_UNCERTAIN", "operation intent is unavailable", 502);
  if (state.status === "conflict") throw new OperationError("REVISION_CONFLICT", `expected revision ${operation.expectedRevision}; current revision is ${state.currentRevision}`);
  await reserveSiteCapacity(store, token, slug);
  const prepared = await preparedOperation(store, token, state.intent);
  if (prepared !== null) {
    const result = await commitOperation(store, token, state.intent, prepared);
    return apiOk(operationResponse(result.head, config.siteOrigin, result.idempotent));
  }
  const snapshot = await readSite(store, token, slug);
  const existing = liveSite(snapshot.head);
  // Exact replays and prepared recovery do not spend another projection quota.
  for (const [scope, limit] of [
    [`key8/${token.key8}`, HOSTED_LIMITS.publishesPerDay],
    [`ip/${clientIpKey(request)}`, HOSTED_LIMITS.publishesPerIpPerDay],
  ] as const) {
    const verdict = await spend(store, scope, "publishes", limit);
    if (!verdict.ok) return apiError({ code: "RATE_LIMITED", message: "daily publish quota reached", retryable: true }, 429);
  }

  const vault = new Map<string, Uint8Array>();
  try {
    for (const [path, entry] of files.entries) {
      if (entry.kind === "inline") {
        vault.set(path, entry.bytes);
      } else {
        const key = `up/${token.key8}/${entry.id}`;
        const object = await store.get(key);
        if (object === null) {
          return apiError({
            code: "UPLOAD_MISSING",
            message: `upload ${entry.id} is unknown or expired`,
            retryable: false,
          }, 400);
        }
        vault.set(path, object.bytes);
      }
    }

    const { root, cleanup } = await materializeVault(vault);
    try {
      const projected = await projectHostedVault(root, {
        title: typeof body.title === "string" ? body.title : slug,
        description: typeof body.description === "string"
          ? body.description
          : undefined,
        index: typeof body.index === "string" ? body.index : undefined,
        noindex: body.noindex === true,
        indexContent: body.indexContent !== false,
        selection,
        basePath: `/p/${token.key8}/${slug}/`,
        baseUrl: config.siteOrigin,
      });
      if (projected.files.size > MAX_EMITTED_FILES ||
          projected.bytes > MAX_EMITTED_BYTES) {
        return apiError({
          code: "SITE_TOO_LARGE",
          message: `projected site exceeds hosted bounds (${MAX_EMITTED_FILES} files / ${MAX_EMITTED_BYTES} bytes)`,
          retryable: false,
        }, 422);
      }

      const digest = artifactDigest(projected.files);
      const byteVerdict = await spend(
        store, `key8/${token.key8}`, "emitted_bytes",
        HOSTED_LIMITS.emittedBytesPerDay, projected.bytes,
      );
      if (!byteVerdict.ok) {
        return apiError({
          code: "RATE_LIMITED",
          message: "daily emitted-bytes quota reached for this token",
          retryable: true,
        }, 429);
      }

      // Re-upload the complete deterministic artifact. A manifest alone is not
      // a completion marker after an interrupted batch. Shared bytes stay retained.
      await uploadArtifact(store, token.key8, digest, projected.files);

      const now = new Date().toISOString();
      const record: SiteRecord = {
        v: 1,
        slug,
        key8: token.key8,
        digest,
        sourceDigest: projected.sourceDigest,
        revision: operation.expectedRevision + 1,
        ...(typeof body.title === "string" ? { title: body.title } : {}),
        notes: projected.notes,
        files: projected.files.size,
        bytes: projected.bytes,
        skippedAssets: projected.skippedAssets,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const prepared = await prepareOperation(store, token, state.intent, record);
      const result = await commitOperation(store, token, state.intent, prepared);
      return apiOk(operationResponse(result.head, config.siteOrigin, result.idempotent),
        snapshot.head === null && !result.idempotent ? 201 : 200);
    } finally {
      await cleanup();
    }
  } catch (error) {
    if (error instanceof HostedPublishError) {
      return apiError({
        code: error.code.toUpperCase(),
        message: error.message,
        retryable: error.status >= 500,
      }, error.status);
    }
    throw error;
  }
}

function operationRequired(): Response {
  return apiError({ code: "OPERATION_REQUIRED", message: `operation must contain contract ${OPERATION_CONTRACT}, a lowercase UUID id, and expectedRevision (0 for a new slug)`, retryable: false }, 428);
}

function failure(error: unknown): Response {
  if (error instanceof OperationError) return apiError({ code: error.code, message: error.message, retryable: false }, error.status);
  return apiError({ code: "OPERATION_UNCERTAIN", message: "storage could not confirm the result; reconcile the operation ID before retrying", retryable: false }, 502);
}

export async function PUT(request: Request, context: Params): Promise<Response> {
  try { return await publish(request, context); } catch (error) { return failure(error); }
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const config = hostedConfig();
    if (config === null) return apiUnavailable();
    const store = new ObjectStore(config);
    const token = await authenticate(store, request);
    if (token === undefined) return apiError({ code: "UNAUTHORIZED", message: "a valid Bearer wc_pub_ token is required", retryable: false }, 401);
    const { slug } = await params;
    if (!isSlug(slug)) return apiError({ code: "BAD_SLUG", message: "invalid site slug", retryable: false }, 400);
    const id = new URL(request.url).searchParams.get("operation");
    if (id !== null) {
      if (!OPERATION_ID.test(id)) return apiError({ code: "BAD_OPERATION", message: "operation must be a lowercase UUID", retryable: false }, 400);
      const state = await resolveOperation(store, token, slug, id);
      if (state.status === "committed") return apiOk(operationResponse(state.head, config.siteOrigin, true));
      return apiOk({ contract: OPERATION_CONTRACT, operation: state.status === "unknown" ? { id, status: "unknown" } :
        { ...state.intent.operation, kind: state.intent.kind, requestDigest: state.intent.requestDigest, status: state.status },
        ...(state.status === "unknown" ? {} : { currentRevision: state.currentRevision }) });
    }
    const snapshot = await readSite(store, token, slug);
    const record = liveSite(snapshot.head);
    if (record === null) return Response.json({ ok: false, contract: OPERATION_CONTRACT, revision: snapshot.revision,
      deleted: snapshot.head !== null, error: { code: "NOT_FOUND", message: "no live site at this slug", retryable: false } }, { status: 404, headers: { "cache-control": "no-store" } });
    const site = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "v"));
    return apiOk({ contract: OPERATION_CONTRACT, site: { ...site, url: `${config.siteOrigin}/p/${token.key8}/${slug}/` } });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  try {
    const config = hostedConfig();
    if (config === null) return apiUnavailable();
    const store = new ObjectStore(config);
    const token = await authenticate(store, request);
    if (token === undefined) return apiError({ code: "UNAUTHORIZED", message: "a valid Bearer wc_pub_ token is required", retryable: false }, 401);
    const { slug } = await params;
    if (!isSlug(slug)) return apiError({ code: "BAD_SLUG", message: "invalid site slug", retryable: false }, 400);
    const body = await readJsonBody(request, 2048);
    const operation: SiteOperation | undefined = isRecord(body) && exactKeys(body, ["operation"]) ? parseOperation(body.operation) : undefined;
    if (operation === undefined) return operationRequired();
    const state = await beginOperation(store, token, slug, operation, "delete", body);
    if (state.status === "committed") return apiOk(operationResponse(state.head, config.siteOrigin, true));
    if (state.status === "unknown") throw new OperationError("OPERATION_UNCERTAIN", "operation intent is unavailable", 502);
    if (state.status === "conflict") throw new OperationError("REVISION_CONFLICT", `expected revision ${operation.expectedRevision}; current revision is ${state.currentRevision}`);
    await reserveSiteCapacity(store, token, slug);
    const prepared = await prepareOperation(store, token, state.intent, null);
    const result = await commitOperation(store, token, state.intent, prepared);
    return apiOk(operationResponse(result.head, config.siteOrigin, result.idempotent));
  } catch (error) { return failure(error); }
}
