/**
 * Signed client for the wordcell-sites worker. Every operation mints a
 * short-lived HMAC URL — the worker holds the R2 bucket binding, so no
 * Cloudflare credential lives in this deployment.
 *
 * Canonical string: `${method}\n${key}\n${exp}\n${max}` (max empty except PUT);
 * LIST signs `LIST\n${prefix}\n${exp}\n`.
 */

import { createHmac, randomUUID } from "node:crypto";

import { HOSTED_LIMITS, type HostedConfig } from "./config";

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function signedUrl(
  config: HostedConfig,
  method: string,
  key: string,
  max = "",
): string {
  const exp = Math.floor(Date.now() / 1000) + HOSTED_LIMITS.signSeconds;
  const sig = hmacHex(
    config.objectsSecret,
    `${method}\n${key}\n${String(exp)}\n${max}`,
  );
  return `${config.objectsUrl}/o/${encodeURIComponent(key)}?exp=${String(exp)}&sig=${sig}` +
    (max === "" ? "" : `&max=${max}`);
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
    `PUT\n${key}\n${String(exp)}\n${String(maxBytes)}`,
  );
  return `${config.objectsUrl}/o/${encodeURIComponent(key)}?exp=${String(exp)}&sig=${sig}&max=${String(maxBytes)}`;
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
  constructor(private readonly config: HostedConfig) {}

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
      headers,
      body: bytes.buffer.slice(
        bytes.byteOffset, bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    });
    return response.status === 200;
  }

  async get(
    key: string,
  ): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const response = await fetch(signedUrl(this.config, "GET", key));
    if (response.status === 404) return null;
    if (response.status !== 200 || response.body === null) {
      throw new Error(`store_get_${response.status}`);
    }
    const contentType = response.headers.get("content-type")
      ?? "application/octet-stream";
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType,
    };
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
    const response = await fetch(signedUrl(this.config, "HEAD", key));
    return response.status === 200;
  }

  async del(key: string): Promise<void> {
    await fetch(signedUrl(this.config, "DELETE", key), { method: "DELETE" });
  }

  async list(prefix: string, limit = HOSTED_LIMITS.filesPerPublish * 2): Promise<{
    keys: string[];
    truncated: boolean;
  }> {
    const response = await fetch(presignedList(this.config, prefix, limit));
    if (response.status !== 200) return { keys: [], truncated: false };
    const body: unknown = await response.json();
    if (
      typeof body !== "object" || body === null || !("keys" in body) ||
      !Array.isArray(body.keys)
    ) {
      return { keys: [], truncated: false };
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
