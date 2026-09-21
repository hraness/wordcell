/**
 * Daily quota counters stored as small JSON objects under `q/` — the bucket
 * lifecycle rule expires them after two days, so counters cost nothing
 * long-term. Read-modify-write is best-effort (R2 has no atomic increment);
 * quotas are generous bounds against abuse, not billing meters.
 */

import type { ObjectStore } from "./store";

function today(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/gu, "");
}

async function counter(
  store: ObjectStore,
  scope: string,
  name: string,
): Promise<{ key: string; n: number }> {
  const key = `q/${scope}/${today()}/${name}`;
  const record = await store.getJson<{ n?: number }>(key);
  return { key, n: typeof record?.n === "number" ? record.n : 0 };
}

function fixDate(): string {
  return today();
}

export type QuotaVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly retryAfterSeconds: number };

/** Check-and-increment a daily counter in one step. */
export async function spend(
  store: ObjectStore,
  scope: string,
  name: string,
  limit: number,
  amount = 1,
): Promise<QuotaVerdict> {
  const { key, n } = await counter(store, scope, name);
  if (n + amount > limit) return { ok: false, retryAfterSeconds: 3600 };
  await store.putJson(key, { n: n + amount, d: fixDate() });
  return { ok: true };
}

export async function check(
  store: ObjectStore,
  scope: string,
  name: string,
  limit: number,
  amount = 1,
): Promise<QuotaVerdict> {
  const { n } = await counter(store, scope, name);
  return n + amount > limit
    ? { ok: false, retryAfterSeconds: 3600 }
    : { ok: true };
}
