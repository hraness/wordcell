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
import type { SiteRecord } from "../../../../../lib/hosted/records";
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

export async function PUT(request: Request, { params }: Params): Promise<Response> {
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
  if (!isRecord(body) || !("files" in body)) {
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

  // Quota: pay for the projection work before computing.
  const ipKey = clientIpKey(request);
  for (const [scope, limit] of [
    [`key8/${token.key8}`, HOSTED_LIMITS.publishesPerDay],
    [`ip/${ipKey}`, HOSTED_LIMITS.publishesPerIpPerDay],
  ] as const) {
    const verdict = await spend(store, scope, "publishes", limit);
    if (!verdict.ok) {
      return apiError({
        code: "RATE_LIMITED",
        message: "daily publish quota reached",
        retryable: true,
      }, 429);
    }
  }

  const recordKey = `sites/${token.key8}/${slug}.json`;
  const pointerKey = `m/${token.key8}/${slug}`;
  const existing = await store.getJson<SiteRecord>(recordKey);
  if (existing === null || existing.v !== 1) {
    const { keys } = await store.list(`sites/${token.key8}/`, 256);
    if (keys.length >= HOSTED_LIMITS.sitesPerNamespace) {
      return apiError({
        code: "SITE_LIMIT",
        message: `a token may keep at most ${HOSTED_LIMITS.sitesPerNamespace} live sites`,
        retryable: false,
      }, 409);
    }
  }

  const vault = new Map<string, Uint8Array>();
  const consumedUploads: string[] = [];
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
        consumedUploads.push(key);
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

      // Same artifact bytes → same object prefix → no upload, no pointer move.
      if (existing !== null && existing.digest === digest) {
        return apiOk({
          site: {
            slug, key8: token.key8,
            url: `${config.siteOrigin}/p/${token.key8}/${slug}/`,
            digest, revision: existing.revision,
            notes: projected.notes, files: projected.files.size,
            bytes: projected.bytes,
            createdAt: existing.createdAt, updatedAt: existing.updatedAt,
          },
          idempotent: true,
        });
      }

      if (!(await store.head(`s/${token.key8}/${digest}/manifest.json`))) {
        await uploadArtifact(store, token.key8, digest, projected.files);
      }

      const now = new Date().toISOString();
      const record: SiteRecord = {
        v: 1,
        slug,
        key8: token.key8,
        digest,
        sourceDigest: projected.sourceDigest,
        revision: (existing?.revision ?? 0) + 1,
        ...(typeof body.title === "string" ? { title: body.title } : {}),
        notes: projected.notes,
        files: projected.files.size,
        bytes: projected.bytes,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      // Record first, pointer last: the site is never half-visible.
      if (!(await store.putJson(recordKey, record)) ||
          !(await store.putJson(pointerKey, { digest }))) {
        throw new HostedPublishError("store_failed", "could not persist site record", 502);
      }
      // Best-effort cleanup: consumed uploads and the superseded artifact.
      for (const key of consumedUploads) void store.del(key);
      if (existing !== null) {
        void store.sweep(`s/${token.key8}/${existing.digest}/`);
      }
      const revision = record.revision;
      return apiOk({
        site: {
          slug, key8: token.key8,
          url: `${config.siteOrigin}/p/${token.key8}/${slug}/`,
          digest,
          sourceDigest: projected.sourceDigest,
          revision,
          notes: projected.notes,
          files: projected.files.size,
          bytes: projected.bytes,
          skippedAssets: projected.skippedAssets,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
        idempotent: false,
      }, existing === null ? 201 : 200);
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

export async function GET(request: Request, { params }: Params): Promise<Response> {
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
  const record = await store.getJson<SiteRecord>(
    `sites/${token.key8}/${slug}.json`,
  );
  if (record === null || record.v !== 1) {
    return apiError({ code: "NOT_FOUND", message: "no such site", retryable: false }, 404);
  }
  return apiOk({
    site: {
      slug: record.slug,
      key8: token.key8,
      url: `${config.siteOrigin}/p/${token.key8}/${record.slug}/`,
      digest: record.digest,
      sourceDigest: record.sourceDigest,
      revision: record.revision,
      notes: record.notes,
      files: record.files,
      bytes: record.bytes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: Params,
): Promise<Response> {
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
  const record = await store.getJson<SiteRecord>(
    `sites/${token.key8}/${slug}.json`,
  );
  if (record === null || record.v !== 1) {
    return apiError({ code: "NOT_FOUND", message: "no such site", retryable: false }, 404);
  }
  await store.del(`m/${token.key8}/${record.slug}`);
  await store.del(`sites/${token.key8}/${record.slug}.json`);
  await store.sweep(`s/${token.key8}/${record.digest}/`);
  return apiOk({ deleted: record.slug });
}
