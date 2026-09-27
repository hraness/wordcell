import { createHash } from "node:crypto";

import type { HostedToken } from "./auth";
import { isRecord } from "./errors";
import { exactKeys, OPERATION_CONTRACT, parseOperation, parseSiteHead, type SiteHead, type SiteOperation, type SiteRecord } from "./records";
import { HOSTED_LIMITS } from "./config";
import type { ObjectStore } from "./store";

const MAX_RECORD_BYTES = 16 * 1024;
type Store = Pick<ObjectStore, "get" | "putConditional">;
type Kind = "publish" | "delete";

export class OperationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) { super(message); }
}

export type Snapshot = Readonly<{ head: SiteHead | SiteRecord | null; etag: string | null; revision: number }>;
export type OperationIntent = Readonly<{ v: 1; ownerDigest: string; slug: string; operation: SiteOperation; kind: Kind; requestDigest: string }>;
export type OperationState =
  | { status: "committed"; head: SiteHead }
  | { status: "pending" | "conflict"; intent: OperationIntent; currentRevision: number }
  | { status: "unknown" };

/** JSON order is immaterial; depth and node bounds apply before recursion. */
export function requestDigest(value: unknown): string {
  let nodes = 0;
  function canonical(item: unknown, depth: number): string {
    nodes += 1;
    if (depth > 12 || nodes > 8192) throw new OperationError("BAD_REQUEST", "request structure exceeds its bounds", 400);
    if (item === null || typeof item === "boolean" || typeof item === "string" ||
        (typeof item === "number" && Number.isFinite(item))) return JSON.stringify(item);
    if (Array.isArray(item) && item.length <= 512) return `[${item.map((entry) => canonical(entry, depth + 1)).join(",")}]`;
    if (isRecord(item) && Object.keys(item).length <= 512) return `{${Object.keys(item).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(item[key], depth + 1)}`).join(",")}}`;
    throw new OperationError("BAD_REQUEST", "request must contain bounded JSON values", 400);
  }
  return createHash("sha256").update(canonical(value, 0)).digest("hex");
}

export function siteKey(token: HostedToken, slug: string): string { return `sites/${token.key8}/${slug}.json`; }
function operationKey(token: HostedToken, slug: string, id: string, part: string): string {
  return `ops/${token.digest}/${slug}/${id}/${part}.json`;
}

async function json(store: Store, key: string): Promise<{ value: unknown; etag: string | null } | null> {
  const found = await store.get(key, MAX_RECORD_BYTES);
  if (found === null) return null;
  try { return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(found.bytes)), etag: found.etag }; }
  catch { throw new OperationError("STORAGE_INVALID", "stored publication metadata is invalid", 502); }
}

export async function readSite(store: Store, token: HostedToken, slug: string): Promise<Snapshot> {
  const found = await json(store, siteKey(token, slug));
  if (found === null) return { head: null, etag: null, revision: 0 };
  const head = parseSiteHead(found.value, token.key8, slug);
  if (head === undefined || found.etag === null || !/^"[a-zA-Z0-9-]{1,128}"$/u.test(found.etag)) {
    throw new OperationError("STORAGE_INVALID", "stored site head or conditional-write identity is invalid", 502);
  }
  if (head.v === 2 && head.ownerDigest !== token.digest) {
    throw new OperationError("SITE_OWNER_CONFLICT", "site belongs to a different capability token", 403);
  }
  return { head, etag: found.etag, revision: head.revision };
}

function parseIntent(value: unknown, token: HostedToken, slug: string, id: string): OperationIntent {
  if (!isRecord(value) || !exactKeys(value, ["v", "ownerDigest", "slug", "operation", "kind", "requestDigest"])) throw new OperationError("STORAGE_INVALID", "stored operation intent is invalid", 502);
  const operation = parseOperation(value.operation);
  if (value.v !== 1 || value.ownerDigest !== token.digest || value.slug !== slug || operation === undefined || operation.id !== id ||
      (value.kind !== "publish" && value.kind !== "delete") || typeof value.requestDigest !== "string" || !/^[0-9a-f]{64}$/u.test(value.requestDigest)) {
    throw new OperationError("STORAGE_INVALID", "stored operation intent is invalid", 502);
  }
  return { v: 1, ownerDigest: token.digest, slug, operation, kind: value.kind, requestDigest: value.requestDigest };
}

/** Reservations survive interruption; no writer can admit a 51st distinct slug. */
export async function reserveSiteCapacity(store: Store & Pick<ObjectStore, "list">, token: HostedToken, slug: string): Promise<void> {
  const key = `cap/${token.digest}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const found = await json(store, key);
    let slugs: string[];
    if (found === null) {
      const legacy = await store.list(`sites/${token.key8}/`, HOSTED_LIMITS.sitesPerNamespace + 1);
      if (legacy.truncated || legacy.keys.length > HOSTED_LIMITS.sitesPerNamespace) throw new OperationError("SITE_LIMIT", "namespace exceeds its retained site capacity");
      slugs = legacy.keys.map((name) => {
        const candidate = name.slice(`sites/${token.key8}/`.length, -".json".length);
        if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(candidate) || name !== `sites/${token.key8}/${candidate}.json`) {
          throw new OperationError("STORAGE_INVALID", "namespace contains an invalid site key", 502);
        }
        return candidate;
      });
    } else {
      const value = found.value;
      if (!isRecord(value) || !exactKeys(value, ["v", "ownerDigest", "slugs"]) || value.v !== 1 || value.ownerDigest !== token.digest ||
          !Array.isArray(value.slugs) || value.slugs.length > HOSTED_LIMITS.sitesPerNamespace ||
          !value.slugs.every((name): name is string => typeof name === "string" && /^[a-z0-9][a-z0-9-]{0,62}$/u.test(name)) ||
          new Set(value.slugs).size !== value.slugs.length || found.etag === null) {
        throw new OperationError("STORAGE_INVALID", "stored namespace capacity is invalid", 502);
      }
      slugs = value.slugs;
    }
    if (slugs.includes(slug) && found !== null) return;
    const reserved = [...new Set([...slugs, slug])].sort();
    if (reserved.length > HOSTED_LIMITS.sitesPerNamespace) throw new OperationError("SITE_LIMIT", `a token may reserve at most ${HOSTED_LIMITS.sitesPerNamespace} distinct site slugs, including deletions and interrupted requests`);
    try {
      if (await store.putConditional(key, { v: 1, ownerDigest: token.digest, slugs: reserved }, found?.etag ?? null) === "written") return;
    } catch { /* Re-read an uncertain reservation. Never discard another slot. */ }
  }
  throw new OperationError("CAPACITY_UNCERTAIN", "namespace capacity could not be reserved; reconcile and retry the exact operation", 502);
}

function boundHead(value: unknown, token: HostedToken, intent: OperationIntent): SiteHead {
  const head = parseSiteHead(value, token.key8, intent.slug);
  if (head === undefined || head.v !== 2 || head.ownerDigest !== token.digest || head.operation.id !== intent.operation.id ||
      head.operation.requestDigest !== intent.requestDigest || head.operation.kind !== intent.kind ||
      head.operation.expectedRevision !== intent.operation.expectedRevision) {
    throw new OperationError("STORAGE_INVALID", "stored operation result does not match its intent", 502);
  }
  return head;
}

/** Receipts are read AFTER the head: replacement archives its predecessor first. */
export async function resolveOperation(store: Store, token: HostedToken, slug: string, id: string): Promise<OperationState> {
  const stored = await json(store, operationKey(token, slug, id, "intent"));
  if (stored === null) return { status: "unknown" };
  const intent = parseIntent(stored.value, token, slug, id);
  const snapshot = await readSite(store, token, slug);
  if (snapshot.head?.v === 2 && snapshot.head.operation.id === id) {
    return { status: "committed", head: boundHead(snapshot.head, token, intent) };
  }
  const receipt = await json(store, operationKey(token, slug, id, "receipt"));
  if (receipt !== null) return { status: "committed", head: boundHead(receipt.value, token, intent) };
  return { status: snapshot.revision === intent.operation.expectedRevision ? "pending" : "conflict", intent, currentRevision: snapshot.revision };
}

export async function beginOperation(store: Store, token: HostedToken, slug: string, operation: SiteOperation, kind: Kind, body: unknown): Promise<OperationState> {
  const digest = requestDigest({ kind, body });
  const key = operationKey(token, slug, operation.id, "intent");
  const intent: OperationIntent = { v: 1, ownerDigest: token.digest, slug, operation, kind, requestDigest: digest };
  const existing = await json(store, key);
  if (existing === null) {
    try { await store.putConditional(key, intent, null); }
    catch { /* Reconcile an uncertain create before admitting the operation. */ }
  }
  const admitted = existing ?? await json(store, key);
  if (admitted === null) throw new OperationError("OPERATION_UNCERTAIN", "could not confirm operation intent; reconcile this operation ID before retrying", 502);
  const parsed = parseIntent(admitted.value, token, slug, operation.id);
  if (parsed.requestDigest !== digest || parsed.kind !== kind || parsed.operation.expectedRevision !== operation.expectedRevision) {
    throw new OperationError("OPERATION_ID_REUSED", "operation ID is already bound to a different request", 409);
  }
  return resolveOperation(store, token, slug, operation.id);
}

export async function preparedOperation(store: Store, token: HostedToken, intent: OperationIntent): Promise<SiteHead | null> {
  const prepared = await json(store, operationKey(token, intent.slug, intent.operation.id, "prepared"));
  return prepared === null ? null : boundHead(prepared.value, token, intent);
}

export async function prepareOperation(store: Store, token: HostedToken, intent: OperationIntent, site: SiteRecord | null): Promise<SiteHead> {
  const candidate: SiteHead = { v: 2, key8: token.key8, ownerDigest: token.digest, slug: intent.slug,
    revision: intent.operation.expectedRevision + 1, site,
    operation: { ...intent.operation, kind: intent.kind, requestDigest: intent.requestDigest,
      revision: intent.operation.expectedRevision + 1, status: "committed" } };
  boundHead(candidate, token, intent);
  try { await store.putConditional(operationKey(token, intent.slug, intent.operation.id, "prepared"), candidate, null); }
  catch { /* A prepared result is never replaced; confirm the winning bytes. */ }
  const prepared = await preparedOperation(store, token, intent);
  if (prepared === null) throw new OperationError("OPERATION_UNCERTAIN", "could not confirm prepared operation; reconcile this operation ID", 502);
  return prepared;
}

async function archiveReceipt(store: Store, token: HostedToken, head: SiteHead): Promise<void> {
  const key = operationKey(token, head.slug, head.operation.id, "receipt");
  try { await store.putConditional(key, head, null); }
  catch { /* No later head is admitted unless this exact receipt is durable. */ }
  const stored = await json(store, key);
  if (stored === null || requestDigest(stored.value) !== requestDigest(head)) {
    throw new OperationError("OPERATION_UNCERTAIN", "could not preserve the previous publication receipt", 502);
  }
}

export async function commitOperation(store: Store, token: HostedToken, intent: OperationIntent, prepared: SiteHead): Promise<{ head: SiteHead; idempotent: boolean }> {
  boundHead(prepared, token, intent);
  const state = await resolveOperation(store, token, intent.slug, intent.operation.id);
  if (state.status === "committed") return { head: state.head, idempotent: true };
  const current = await readSite(store, token, intent.slug);
  if (current.revision !== intent.operation.expectedRevision) {
    // A concurrent execution of this same ID may have committed since resolve.
    const resolved = await resolveOperation(store, token, intent.slug, intent.operation.id);
    if (resolved.status === "committed") return { head: resolved.head, idempotent: true };
    throw new OperationError("REVISION_CONFLICT", `expected revision ${intent.operation.expectedRevision}; current revision is ${current.revision}`);
  }
  if (current.head?.v === 2) await archiveReceipt(store, token, current.head);
  let conflict = false;
  try {
    const result = await store.putConditional(siteKey(token, intent.slug), prepared, current.etag);
    if (result === "written") return { head: prepared, idempotent: false };
    conflict = true;
  } catch { /* The write may have committed; read its authoritative receipt. */ }
  const resolved = await resolveOperation(store, token, intent.slug, intent.operation.id);
  if (resolved.status === "committed") return { head: resolved.head, idempotent: true };
  if (conflict || resolved.status === "conflict") throw new OperationError("REVISION_CONFLICT", "another operation changed this site; read the current revision before preparing a new operation");
  throw new OperationError("OPERATION_UNCERTAIN", "publication outcome is unknown; reconcile this operation ID before retrying", 502);
}

export function operationResponse(head: SiteHead, siteOrigin: string, idempotent: boolean): Record<string, unknown> {
  return { contract: OPERATION_CONTRACT, operation: head.operation, idempotent,
    ...(head.site === null ? { deleted: head.slug, revision: head.revision } : {
      site: { ...Object.fromEntries(Object.entries(head.site).filter(([key]) => key !== "v")), url: `${siteOrigin}/p/${head.key8}/${head.slug}/` },
    }) };
}
