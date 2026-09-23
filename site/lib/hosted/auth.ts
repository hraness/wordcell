/**
 * Capability-token auth. `POST /api/v1/tokens` mints a `wc_pub_` token; the
 * server stores only its SHA-256 digest. The first 8 hex chars of the digest
 * are the token's site namespace (`/p/<key8>/<slug>/`), so one token can never
 * overwrite another token's slug.
 */

import { createHash, randomBytes } from "node:crypto";

import type { ObjectStore } from "./store";
import { isRecord } from "./errors";
import { exactKeys } from "./records";

export type HostedToken = Readonly<{
  /** First 8 hex chars of the token digest — the slug namespace. */
  key8: string;
  /** Full hex digest of the presented token. */
  digest: string;
}>;

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newToken(): string {
  return `wc_pub_${randomBytes(24).toString("hex")}`;
}

export function isTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^wc_pub_[0-9a-f]{48}$/u.test(value);
}

/** Bearer → token record. Returns undefined when absent or unknown. */
export async function authenticate(
  store: ObjectStore,
  request: Request,
): Promise<HostedToken | undefined> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!isTokenShape(token)) return undefined;
  const digest = tokenDigest(token);
  const key8 = digest.slice(0, 8);
  const record = await store.getJson<unknown>(`tok/${digest}`);
  if (!isRecord(record) || !exactKeys(record, ["v", "key8", "label", "createdAt"]) || record.v !== 1 || record.key8 !== key8 ||
      (record.label !== null && (typeof record.label !== "string" || record.label.length > 80)) ||
      typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) return undefined;
  const reservation = await store.get(`ns/${key8}`, 1024);
  if (reservation !== null) {
    let owner: unknown;
    try { owner = JSON.parse(new TextDecoder().decode(reservation.bytes)); } catch { return undefined; }
    if (!isRecord(owner) || !exactKeys(owner, ["v", "digest"]) || owner.v !== 1 || owner.digest !== digest) return undefined;
  } else {
    // Legacy tokens predate reservations. Admit only a provably unique owner;
    // reads never create a claim that could choose between colliding tokens.
    const { keys, truncated } = await store.list(`tok/${key8}`, 2);
    if (truncated || keys.length !== 1 || keys[0] !== `tok/${digest}`) return undefined;
  }
  return { key8, digest };
}

/** Client IP for quota keys — hashed so raw addresses never persist. */
export function clientIpKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const first = forwarded.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(first).digest("hex").slice(0, 16);
}
