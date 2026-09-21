/** Request-body parsing for hosted publication — pure, dependency-free. */

import { createHash } from "node:crypto";

import { HOSTED_LIMITS } from "./config";
import { isRecord } from "./errors";
import { vaultPath } from "./paths";

const MAX_STRING_LIST = 64;
const MAX_STRING_LENGTH = 256;
export const MAX_TITLE = 200;
export const MAX_DESCRIPTION = 1000;

export function boundedStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_STRING_LIST) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length > MAX_STRING_LENGTH) {
      return undefined;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Validate the `selection` member structurally; the projection itself
 * interprets the values (globs, filters, relation direction).
 */
export function parseSelection(
  value: unknown,
): Record<string, unknown> | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return "invalid";
  const out: Record<string, unknown> = {};
  for (const name of [
    "includes", "excludes", "includeGlobs", "excludeGlobs", "tags",
    "repositoryScopes",
  ] as const) {
    if (name in value) {
      const list = boundedStringList(value[name]);
      if (list === undefined) return "invalid";
      out[name] = list;
    }
  }
  if ("filters" in value) {
    if (!Array.isArray(value.filters) || value.filters.length > MAX_STRING_LIST) {
      return "invalid";
    }
    if (!value.filters.every(isRecord)) return "invalid";
    out.filters = value.filters;
  }
  if ("from" in value) {
    const from = value.from;
    if (!isRecord(from) || typeof from.note !== "string" ||
        from.note.length > MAX_STRING_LENGTH ||
        typeof from.depth !== "number" || !Number.isSafeInteger(from.depth) ||
        from.depth < 1 || from.depth > 8 ||
        (from.direction !== "out" && from.direction !== "in" &&
          from.direction !== "both")) {
      return "invalid";
    }
    out.from = {
      note: from.note,
      depth: from.depth,
      direction: from.direction,
    };
  }
  return out;
}

export type FileEntry =
  | { readonly kind: "inline"; readonly bytes: Uint8Array }
  | { readonly kind: "upload"; readonly id: string };

export function parseFiles(
  value: unknown,
): { entries: Map<string, FileEntry>; inlineBytes: number } | "invalid" {
  if (!isRecord(value)) return "invalid";
  const names = Object.keys(value);
  if (names.length === 0 || names.length > HOSTED_LIMITS.filesPerPublish) {
    return "invalid";
  }
  const entries = new Map<string, FileEntry>();
  let inlineBytes = 0;
  let uploads = 0;
  for (const rawName of names) {
    const path = vaultPath(rawName);
    if (path === undefined) return "invalid";
    const entry = value[rawName];
    if (typeof entry === "string") {
      const bytes = new TextEncoder().encode(entry);
      inlineBytes += bytes.byteLength;
      entries.set(path, { kind: "inline", bytes });
      continue;
    }
    if (isRecord(entry) && typeof entry.base64 === "string") {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(Buffer.from(entry.base64, "base64"));
      } catch {
        return "invalid";
      }
      inlineBytes += bytes.byteLength;
      entries.set(path, { kind: "inline", bytes });
      continue;
    }
    if (isRecord(entry) && typeof entry.upload === "string" &&
        /^[0-9a-f-]{36}$/u.test(entry.upload)) {
      uploads += 1;
      if (uploads > HOSTED_LIMITS.uploadsPerPublish) return "invalid";
      entries.set(path, { kind: "upload", id: entry.upload });
      continue;
    }
    return "invalid";
  }
  if (inlineBytes > HOSTED_LIMITS.inlineBytesPerPublish) return "invalid";
  return { entries, inlineBytes };
}

/** sha256 over sorted (path, bytes-digest) pairs — the content address. */
export function artifactDigest(files: ReadonlyMap<string, Uint8Array>): string {
  const hash = createHash("sha256");
  for (const [path, bytes] of [...files.entries()].toSorted(([a], [b]) =>
    a.localeCompare(b))) {
    hash.update(path);
    hash.update("\0");
    hash.update(createHash("sha256").update(bytes).digest("hex"));
    hash.update("\n");
  }
  return hash.digest("hex");
}
