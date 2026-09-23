/**
 * Signed client for the wordcell-sites worker. Every operation mints a
 * short-lived HMAC URL — the worker holds the R2 bucket binding, so no
 * Cloudflare credential lives in this deployment.
 *
 * Canonical string: `${method}\n${key}\n${exp}\n${max}` (max empty except PUT);
 * LIST signs `LIST\n${prefix}\n${exp}\n`.
 */

import { createHash, createHmac, randomUUID } from "node:crypto";

import { HOSTED_LIMITS, type HostedConfig } from "./config";

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

async function responseBytes(response: Response, maximum: number): Promise<Uint8Array> {
  if (response.body === null) throw new Error("store_missing_body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new Error("store_response_too_large"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return new Uint8Array(Buffer.concat(chunks));
}

function signedUrl(
  config: HostedConfig,
  method: string,
  key: string,
  max = "",
  condition?: { etag: string | null; digest: string },
): string {
  const exp = Math.floor(Date.now() / 1000) + HOSTED_LIMITS.signSeconds;
  const sig = hmacHex(
    config.objectsSecret,
    `${method}\n${key}\n${String(exp)}\n${max}` + (condition === undefined ? "" :
      `\n2\n${condition.etag === null ? "absent" : "match"}\n${condition.etag ?? ""}\n${condition.digest}`),
  );
  return `${config.objectsUrl}/o/${encodeURIComponent(key)}?exp=${String(exp)}&sig=${sig}` +
    (max === "" ? "" : `&max=${max}`) + (condition === undefined ? "" :
      `&v=2&condition=${condition.etag === null ? "absent" : "match"}&etag=${encodeURIComponent(condition.etag ?? "")}&sha256=${condition.digest}`);
}

export function presignedPut(
  config: HostedConfig,
  key: string,
  maxBytes: number,
  seconds: number,
): string {
  const exp = Math.floor(Date.now() / 1000) + seconds;
  const sig = hmacHex(
    config.objectsSecret,
    `PUT\n${key}\n${String(exp)}\n${String(maxBytes)}\n2\nabsent\n\n`,
  );
  return `${config.objectsUrl}/o/${encodeURIComponent(key)}?exp=${String(exp)}&sig=${sig}&max=${String(maxBytes)}&v=2&condition=absent&etag=&sha256=`;
}

export function presignedList(
  config: HostedConfig,
  prefix: string,
  limit: number,
): string {
  const exp = Math.floor(Date.now() / 1000) + HOSTED_LIMITS.signSeconds;
  const sig = hmacHex(config.objectsSecret, `LIST\n${prefix}\n${String(exp)}\n`);
  return `${config.objectsUrl}/o-list?prefix=${encodeURIComponent(prefix)}` +
    `&limit=${String(limit)}&exp=${String(exp)}&sig=${sig}`;
}

export class ObjectStore {
  private readonly deadline = Date.now() + 50_000;
  constructor(private readonly config: HostedConfig) {}
  private signal(): AbortSignal { return AbortSignal.timeout(Math.max(1, this.deadline - Date.now())); }

  /** Presigned PUT URL a client can write bytes to directly. */
  uploadUrl(key: string, maxBytes: number, seconds: number): string {
    return presignedPut(this.config, key, maxBytes, seconds);
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
    meta: Record<string, string> = {},
  ): Promise<boolean> {
    const url = signedUrl(
      this.config, "PUT", key, String(bytes.byteLength),
    );
    const headers: Record<string, string> = {
      "content-type": contentType,
      "content-length": String(bytes.byteLength),
    };
    for (const [name, value] of Object.entries(meta)) {
      headers[`x-meta-${name}`] = value;
    }
    const response = await fetch(url, {
      method: "PUT",
      signal: this.signal(), redirect: "error",
      headers,
      body: bytes.buffer.slice(
        bytes.byteOffset, bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    });
    return response.status === 200;
  }

  async get(
    key: string,
    maximum = 64 * 1024 * 1024,
  ): Promise<{ bytes: Uint8Array; contentType: string; etag: string | null } | null> {
    const response = await fetch(signedUrl(this.config, "GET", key), { cache: "no-store", redirect: "error", signal: this.signal() });
    if (response.status === 404) return null;
    if (response.status !== 200 || response.body === null) {
      throw new Error(`store_get_${response.status}`);
    }
    const contentType = response.headers.get("content-type")
      ?? "application/octet-stream";
    // The authenticated proxy preserves R2's strong identity separately from
    // the HTTP representation ETag, which compression intermediaries may rewrite.
    return { bytes: await responseBytes(response, maximum), contentType, etag: response.headers.get("x-object-etag") };
  }

  /** Atomic R2 conditional PUT. Transport failure is an uncertain outcome. */
  async putConditional(key: string, value: unknown, etag: string | null): Promise<"written" | "conflict"> {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const response = await fetch(signedUrl(this.config, "PUT", key, String(bytes.byteLength), { etag, digest }), {
      method: "PUT", redirect: "error", signal: this.signal(),
      headers: { "content-type": "application/json", "content-length": String(bytes.byteLength) },
      body: bytes,
    });
    if (response.status === 412) return "conflict";
    if (response.status !== 200) throw new Error(`store_conditional_${response.status}`);
    return "written";
  }

  async getJson<T>(key: string): Promise<T | null> {
    const found = await this.get(key);
    if (found === null) return null;
    try {
      return JSON.parse(new TextDecoder().decode(found.bytes)) as T;
    } catch {
      return null;
    }
  }

  async putJson(key: string, value: unknown): Promise<boolean> {
    return this.put(
      key,
      new TextEncoder().encode(JSON.stringify(value)),
      "application/json",
    );
  }

  async head(key: string): Promise<boolean> {
    const response = await fetch(signedUrl(this.config, "HEAD", key), { redirect: "error", signal: this.signal(), cache: "no-store" });
    return response.status === 200;
  }

  async del(key: string): Promise<void> {
    const response = await fetch(signedUrl(this.config, "DELETE", key), { method: "DELETE", redirect: "error", signal: this.signal() });
    if (response.status !== 200) throw new Error(`store_delete_${response.status}`);
  }

  async list(prefix: string, limit = HOSTED_LIMITS.filesPerPublish * 2): Promise<{
    keys: string[];
    truncated: boolean;
  }> {
    const response = await fetch(presignedList(this.config, prefix, limit), { redirect: "error", signal: this.signal(), cache: "no-store" });
    if (response.status !== 200) throw new Error(`store_list_${response.status}`);
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await responseBytes(response, 1024 * 1024)));
    if (
      typeof body !== "object" || body === null || !("keys" in body) ||
      !Array.isArray(body.keys) || body.keys.length > limit ||
      !body.keys.every((key) => typeof key === "string" && key.startsWith(prefix) && key.length <= 512) ||
      !("truncated" in body) || typeof body.truncated !== "boolean"
    ) {
      throw new Error("store_list_invalid");
    }
    const truncated = "truncated" in body && body.truncated === true;
    return {
      keys: body.keys.filter((k): k is string => typeof k === "string"),
      truncated,
    };
  }

  /** Delete every key under a prefix; bounded, best-effort. */
  async sweep(prefix: string): Promise<number> {
    const { keys } = await this.list(prefix, 512);
    let removed = 0;
    for (const key of keys) {
      await this.del(key);
      removed += 1;
    }
    return removed;
  }
}

export function newUploadKey(key8: string): { id: string; key: string } {
  const id = randomUUID();
  return { id, key: `up/${key8}/${id}` };
}
