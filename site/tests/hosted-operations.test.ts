import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fc from "fast-check";

import worker, { type Env } from "../../worker/src/worker";
import { DELETE, GET, PUT } from "../app/api/v1/sites/[slug]/route";
import { POST as upload } from "../app/api/v1/uploads/route";
import { POST as mintToken } from "../app/api/v1/tokens/route";
import { POST as mcp } from "../app/api/v1/mcp/route";
import { authenticate, tokenDigest } from "../lib/hosted/auth";
import { ObjectStore } from "../lib/hosted/store";
import { OPERATION_CONTRACT, parseOperation, parseSiteHead, type SiteHead, type SiteRecord } from "../lib/hosted/records";
import { readSite, requestDigest, resolveOperation } from "../lib/hosted/operations";

const encoder = new TextEncoder();
const authToken = `wc_pub_${"a".repeat(48)}`;
const owner = tokenDigest(authToken);
const token = { digest: owner, key8: owner.slice(0, 8) };
const config = { objectsUrl: "https://objects.test", objectsSecret: "test-only-secret", siteOrigin: "https://wordcell.test" };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const operation = (n: number, expectedRevision = 0) => ({ contract: OPERATION_CONTRACT, id: id(n), expectedRevision });
const record = (digest = "a".repeat(64), slug = "test", revision = 1): SiteRecord => ({
  v: 1, key8: token.key8, slug, digest, sourceDigest: `sha256:${"b".repeat(64)}`, revision,
  notes: 1, files: 1, bytes: 1, createdAt: "2026-09-23T00:00:00.000Z", updatedAt: "2026-09-23T00:00:00.000Z",
});

type Stored = { bytes: Uint8Array; etag: string; contentType: string };
class Bucket {
  readonly objects = new Map<string, Stored>();
  readonly writes: string[] = [];
  readonly deletes: string[] = [];
  beforePut: ((key: string) => Promise<void>) | undefined;
  afterPut: ((key: string) => void) | undefined;
  putLocal(key: string, value: unknown, contentType = "application/json"): void {
    const bytes = typeof value === "string" ? encoder.encode(value) : encoder.encode(JSON.stringify(value));
    this.objects.set(key, { bytes, etag: `"${createHash("md5").update(bytes).digest("hex")}"`, contentType });
  }
  private object(value: Stored) {
    return { body: new Response(new Uint8Array(value.bytes)).body!, size: value.bytes.byteLength, httpEtag: value.etag,
      writeHttpMetadata(headers: Headers) { headers.set("content-type", value.contentType); } };
  }
  async get(key: string): ReturnType<Env["BUCKET"]["get"]> { const value = this.objects.get(key); return value === undefined ? null : this.object(value); }
  async head(key: string) { return this.get(key); }
  async put(key: string, value: ReadableStream | ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; onlyIf?: Headers }) {
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    await this.beforePut?.(key);
    // No await between comparison and replacement: model R2's single-key CAS.
    const previous = this.objects.get(key);
    if (options?.onlyIf?.get("if-none-match") === "*" && previous !== undefined) return null;
    const expected = options?.onlyIf?.get("if-match");
    if (expected !== null && expected !== undefined && previous?.etag !== expected) return null;
    const stored = { bytes, etag: `"${createHash("md5").update(bytes).digest("hex")}"`, contentType: options?.httpMetadata?.contentType ?? "application/octet-stream" };
    this.objects.set(key, stored);
    this.writes.push(key);
    this.afterPut?.(key);
    return this.object(stored);
  }
  async delete(key: string | string[]) { for (const name of typeof key === "string" ? [key] : key) { this.deletes.push(name); this.objects.delete(name); } }
  async list(options?: { prefix?: string; limit?: number }) {
    const all = [...this.objects.keys()].filter((key) => key.startsWith(options?.prefix ?? "")).sort();
    return { objects: all.slice(0, options?.limit).map((key) => ({ key })), truncated: all.length > (options?.limit ?? Infinity) };
  }
}

async function fixture(run: (bucket: Bucket, store: ObjectStore) => Promise<void>): Promise<void> {
  const bucket = new Bucket();
  bucket.putLocal(`tok/${owner}`, { v: 1, key8: token.key8, label: null, createdAt: "2026-09-23T00:00:00.000Z" });
  bucket.putLocal(`ns/${token.key8}`, { v: 1, digest: owner });
  const previousFetch = globalThis.fetch;
  const names = ["WORDCELL_OBJECTS_URL", "WORDCELL_OBJECTS_SECRET", "WORDCELL_SITE_ORIGIN"] as const;
  const values = names.map((name) => process.env[name]);
  process.env.WORDCELL_OBJECTS_URL = config.objectsUrl;
  process.env.WORDCELL_OBJECTS_SECRET = config.objectsSecret;
  process.env.WORDCELL_SITE_ORIGIN = config.siteOrigin;
  const env: Env = { BUCKET: bucket, OBJECT_PROXY_SECRET: config.objectsSecret };
  const localFetch: typeof fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
    if (new URL(request.url).origin !== config.objectsUrl) throw new Error("unexpected_network");
    return worker.fetch(request, env);
  }, { preconnect: previousFetch.preconnect });
  globalThis.fetch = localFetch;
  try { await run(bucket, new ObjectStore(config)); }
  finally {
    globalThis.fetch = previousFetch;
    names.forEach((name, index) => { const value = values[index]; if (value === undefined) delete process.env[name]; else process.env[name] = value; });
  }
}

function request(method: string, body?: unknown, slug = "test", query = "") {
  return new Request(`${config.siteOrigin}/api/v1/sites/${slug}${query}`, {
    method, headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const params = (slug = "test") => ({ params: Promise.resolve({ slug }) });
const publish = (n: number, revision = 0, content = "# Published\n", slug = "test") =>
  PUT(request("PUT", { operation: operation(n, revision), files: { "index.md": content } }, slug), params(slug));
const publicRead = (bucket: Bucket, slug = "test") => worker.fetch(new Request(`${config.objectsUrl}/p/${token.key8}/${slug}/`), {
  BUCKET: bucket, OBJECT_PROXY_SECRET: config.objectsSecret,
});

describe("hosted conditional publication", () => {
  test("minted tokens reserve one namespace and MCP uses the same conditional protocol", () => fixture(async (bucket) => {
    const minted = await mintToken(new Request(`${config.siteOrigin}/api/v1/tokens`, {
      method: "POST", body: JSON.stringify({ label: "fixture" }),
    }));
    const mintedBody = await minted.json();
    expect(Object.keys(mintedBody).sort()).toEqual(["key8", "note", "ok", "sites", "token", "urlBase"]);
    const mintedDigest = tokenDigest(mintedBody.token);
    expect(JSON.parse(new TextDecoder().decode(bucket.objects.get(`ns/${mintedBody.key8}`)!.bytes))).toEqual({ v: 1, digest: mintedDigest });
    const call = (name: string, args: unknown) => mcp(new Request(`${config.siteOrigin}/api/v1/mcp`, {
      method: "POST", headers: { authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }));
    const published = await call("publish_site", { slug: "test", files: { "index.md": "# MCP\n" }, operation: operation(1) });
    expect((await published.json()).result.structuredContent).toMatchObject({ operation: { id: id(1), revision: 1, status: "committed" } });
    const lookup = await call("get_site", { slug: "test", operation: id(1) });
    expect((await lookup.json()).result.structuredContent).toMatchObject({ idempotent: true, operation: { id: id(1), revision: 1 } });
    const removed = await call("delete_site", { slug: "test", operation: operation(2, 1) });
    expect((await removed.json()).result.structuredContent).toMatchObject({ deleted: "test", operation: { kind: "delete", revision: 2 } });
  }));

  test("competing new slugs cannot exceed the namespace capacity", () => fixture(async (bucket) => {
    for (let index = 0; index < 49; index += 1) {
      bucket.putLocal(`sites/${token.key8}/legacy-${index}.json`, record("a".repeat(64), `legacy-${index}`));
    }
    let waiting = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    bucket.beforePut = async (key) => {
      if (!key.startsWith("cap/")) return;
      waiting += 1;
      if (waiting === 2) release();
      await barrier;
    };
    const results = await Promise.all([publish(1, 0, "# A\n", "new-a"), publish(2, 0, "# B\n", "new-b")]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    expect([...bucket.objects.keys()].filter((key) => key.startsWith("sites/"))).toHaveLength(50);
    const failed = await results.find((response) => response.status === 409)!.json();
    expect(failed.error.code).toBe("SITE_LIMIT");
    const capacity = JSON.parse(new TextDecoder().decode(bucket.objects.get(`cap/${owner}`)!.bytes));
    expect(capacity.slugs).toHaveLength(50);
    expect(capacity.ownerDigest).toBe(owner);
    expect((await DELETE(request("DELETE", { operation: operation(3) }, "new-c"), params("new-c"))).status).toBe(409);
  }));

  test("concurrent publishers from one revision have exactly one winner", () => fixture(async (bucket) => {
    let waiting = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    bucket.beforePut = async (key) => {
      if (!key.startsWith("sites/")) return;
      waiting += 1;
      if (waiting === 2) release();
      await barrier;
    };
    const results = await Promise.all([publish(1, 0, "# First\n"), publish(2, 0, "# Second\n")]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(bucket.writes.filter((key) => key.startsWith("sites/"))).toHaveLength(1);
    const success = await results.find((result) => result.status === 201)!.json();
    expect(success.operation).toMatchObject({ contract: OPERATION_CONTRACT, expectedRevision: 0, revision: 1, status: "committed" });
    expect(success.site.skippedAssets).toBe(0);
    expect((await publicRead(bucket)).status).toBe(200);
  }));

  test("exact retries reconcile after a lost commit response and later publication", () => fixture(async (bucket, store) => {
    let lost = false;
    bucket.afterPut = (key) => { if (key.startsWith("sites/") && !lost) { lost = true; throw new Error("response_lost"); } };
    const first = await publish(1);
    expect(first.status).toBe(200);
    expect((await first.json()).operation.revision).toBe(1);
    bucket.afterPut = undefined;
    expect((await publish(2, 1, "# Later\n")).status).toBe(200);
    const writesBefore = bucket.writes.length;
    const retry = await publish(1);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ idempotent: true, operation: { id: id(1), revision: 1 }, site: { revision: 1 } });
    expect(bucket.writes).toHaveLength(writesBefore);
    expect((await readSite(store, token, "test")).revision).toBe(2);
    const resolution = await GET(request("GET", undefined, "test", `?operation=${id(1)}`), params());
    expect(await resolution.json()).toMatchObject({ operation: { id: id(1), status: "committed", revision: 1 } });
  }));

  test("transport ETag rewriting preserves exact retries and conditional object identity", async () => {
    for (const transformation of ["weak", "missing"] as const) await fixture(async (bucket, store) => {
      expect((await publish(1)).status).toBe(201);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await originalFetch(input, init);
        const etag = response.headers.get("etag");
        if (etag === null) return response;
        const headers = new Headers(response.headers);
        // Model an edge rewriting the representation validator after Worker execution.
        if (transformation === "weak") headers.set("etag", `W/${etag}`);
        else headers.delete("etag");
        return new Response(response.body, { status: response.status, headers });
      }, { preconnect: originalFetch.preconnect });
      const writes = bucket.writes.length;
      const retry = await publish(1);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({ idempotent: true, operation: { id: id(1), revision: 1 } });
      expect(bucket.writes).toHaveLength(writes);
      const key = `sites/${token.key8}/test.json`;
      const before = await readSite(store, token, "test");
      expect(before.etag).toBe(bucket.objects.get(key)!.etag);
      expect((await publish(2, 1, "# Updated\n")).status).toBe(200);
      expect(await store.putConditional(key, before.head, before.etag)).toBe("conflict");
      expect((await readSite(store, token, "test")).revision).toBe(2);
      const lookup = await GET(request("GET", undefined, "test", `?operation=${id(1)}`), params());
      expect(await lookup.json()).toMatchObject({ idempotent: true, operation: { id: id(1), revision: 1 } });
      const deleted = await DELETE(request("DELETE", { operation: operation(3, 2) }), params());
      expect(await deleted.json()).toMatchObject({ deleted: "test", revision: 3, operation: { kind: "delete", revision: 3 } });
      expect((await publicRead(bucket)).status).toBe(404);
      const tombstone = await readSite(store, token, "test");
      expect(tombstone.revision).toBe(3);
      expect(tombstone.etag).toBe(bucket.objects.get(key)!.etag);
    });
  });

  test("missing or malformed object identity cannot fall back to the transport ETag", async () => {
    for (const identity of [null, 'W/"weak"', '"one", "two"', "unquoted"]) await fixture(async (bucket, store) => {
      expect((await publish(1)).status).toBe(201);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await originalFetch(input, init);
        const headers = new Headers(response.headers);
        if (identity === null) headers.delete("x-object-etag");
        else headers.set("x-object-etag", identity);
        return new Response(response.body, { status: response.status, headers });
      }, { preconnect: originalFetch.preconnect });
      const writes = bucket.writes.length;
      const previousHead = bucket.objects.get(`sites/${token.key8}/test.json`)!.bytes;
      await expect(readSite(store, token, "test")).rejects.toMatchObject({ code: "STORAGE_INVALID" });
      expect((await publish(2, 1, "# Must not replace\n")).status).toBe(502);
      // An immutable attempt intent may be recorded; no head, capacity or artifact changes.
      expect(bucket.writes.slice(writes).filter((key) => !key.startsWith("ops/"))).toEqual([]);
      expect(bucket.objects.get(`sites/${token.key8}/test.json`)!.bytes).toEqual(previousHead);
    });
  });

  test("prepared crash recovery uses frozen output without a second projection or upload", () => fixture(async (bucket) => {
    bucket.beforePut = async (key) => { if (key.startsWith("sites/")) throw new Error("before_commit"); };
    expect((await publish(1)).status).toBe(502);
    const pending = await GET(request("GET", undefined, "test", `?operation=${id(1)}`), params());
    expect(await pending.json()).toMatchObject({ operation: { status: "pending" }, currentRevision: 0 });
    const artifactWrites = bucket.writes.filter((key) => key.startsWith("s/")).length;
    bucket.beforePut = undefined;
    expect((await publish(1)).status).toBe(200);
    expect(bucket.writes.filter((key) => key.startsWith("s/"))).toHaveLength(artifactWrites);
    expect(bucket.writes.filter((key) => key.startsWith("sites/"))).toHaveLength(1);
  }));

  test("cannot replace a head until its receipt is durable", () => fixture(async (bucket, store) => {
    expect((await publish(1)).status).toBe(201);
    bucket.beforePut = async (key) => { if (key.endsWith("/receipt.json")) throw new Error("archive_unavailable"); };
    expect((await publish(2, 1, "# Replacement\n")).status).toBe(502);
    expect((await readSite(store, token, "test")).revision).toBe(1);
    bucket.beforePut = undefined;
    expect((await publish(2, 1, "# Replacement\n")).status).toBe(200);
    expect((await resolveOperation(store, token, "test", id(1))).status).toBe("committed");
  }));

  test("same operation ID cannot acquire different bytes, kind, or precondition", () => fixture(async (bucket) => {
    expect((await publish(1)).status).toBe(201);
    const writes = bucket.writes.length;
    for (const response of [await publish(1, 0, "# Changed\n"), await publish(1, 1),
      await DELETE(request("DELETE", { operation: operation(1, 1) }), params())]) {
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("OPERATION_ID_REUSED");
    }
    expect(bucket.writes).toHaveLength(writes);
  }));

  test("two executions of the same ID commit once and share one prepared result", () => fixture(async (bucket) => {
    const responses = await Promise.all([publish(1), publish(1)]);
    expect(responses.every((response) => response.ok)).toBe(true);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies[0].site).toEqual(bodies[1].site);
    expect(bucket.writes.filter((key) => key.startsWith("sites/"))).toHaveLength(1);
  }));

  test("legacy record/pointer divergence resolves through one head and tombstones block fallback", () => fixture(async (bucket) => {
    bucket.putLocal(`sites/${token.key8}/test.json`, record());
    bucket.putLocal(`m/${token.key8}/test`, { digest: "b".repeat(64) });
    bucket.putLocal(`s/${token.key8}/${"a".repeat(64)}/index.html`, "authoritative", "text/html");
    bucket.putLocal(`s/${token.key8}/${"b".repeat(64)}/index.html`, "old pointer", "text/html");
    expect(await (await publicRead(bucket)).text()).toBe("authoritative");
    const before = bucket.writes.length;
    expect((await GET(request("GET"), params())).status).toBe(200);
    expect(bucket.writes).toHaveLength(before);
    const deleted = await DELETE(request("DELETE", { operation: operation(1, 1) }), params());
    expect(await deleted.json()).toMatchObject({ deleted: "test", revision: 2, operation: { kind: "delete", revision: 2 } });
    expect((await publicRead(bucket)).status).toBe(404);
    const missing = await GET(request("GET"), params());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ deleted: true, revision: 2 });
    expect((await publish(2, 0)).status).toBe(409);
    expect((await publish(3, 2)).status).toBe(200);
  }));

  test("deleting one slug preserves another slug's shared artifacts", () => fixture(async (bucket) => {
    bucket.putLocal(`sites/${token.key8}/test.json`, record());
    bucket.putLocal(`sites/${token.key8}/other.json`, record("a".repeat(64), "other"));
    bucket.putLocal(`s/${token.key8}/${"a".repeat(64)}/index.html`, "shared", "text/html");
    expect((await DELETE(request("DELETE", { operation: operation(1, 1) }), params())).status).toBe(200);
    expect(await (await publicRead(bucket, "other")).text()).toBe("shared");
    expect(bucket.deletes).toEqual([]);
  }));

  test("an interrupted artifact batch is repaired even when manifest already exists", () => fixture(async (bucket) => {
    let failed = false;
    bucket.beforePut = async (key) => {
      if (key.startsWith("s/") && key.endsWith("/reader/theme.js") && !failed) { failed = true; throw new Error("partial_artifact"); }
    };
    expect((await publish(1)).status).toBe(502);
    expect([...bucket.objects.keys()].some((key) => key.startsWith("s/") && key.endsWith("/manifest.json"))).toBe(true);
    expect(bucket.writes.filter((key) => key.startsWith("sites/"))).toHaveLength(0);
    bucket.beforePut = undefined;
    expect((await publish(1)).status).toBe(201);
    expect([...bucket.objects.keys()].some((key) => key.startsWith("s/") && key.endsWith("/reader/theme.js"))).toBe(true);
  }));

  test("requires explicit preconditions and reports unknown operation without writes", () => fixture(async (bucket) => {
    expect((await PUT(request("PUT", { files: { "index.md": "# Hello\n" } }), params())).status).toBe(428);
    expect((await DELETE(request("DELETE"), params())).status).toBe(428);
    const result = await GET(request("GET", undefined, "test", `?operation=${id(5)}`), params());
    expect(await result.json()).toMatchObject({ operation: { id: id(5), status: "unknown" } });
    expect(bucket.writes).toEqual([]);
  }));

  test("operation receipts and heads are scoped to the full authorizing principal", () => fixture(async (bucket, store) => {
    expect((await publish(1)).status).toBe(201);
    const other = { key8: token.key8, digest: token.key8 + "f".repeat(56) };
    expect(await resolveOperation(store, other, "test", id(1))).toEqual({ status: "unknown" });
    await expect(readSite(store, other, "test")).rejects.toMatchObject({ code: "SITE_OWNER_CONFLICT" });
    bucket.objects.delete(`ns/${token.key8}`);
    expect(await authenticate(store, request("GET"))).toEqual(token);
    bucket.putLocal(`tok/${other.digest}`, { v: 1, key8: other.key8, label: null, createdAt: "2026-09-23T00:00:00.000Z" });
    expect(await authenticate(store, request("GET"))).toBeUndefined();
  }));

  test("presigned uploads are write-once, and protected objects reject legacy writes/deletes", () => fixture(async (bucket, store) => {
    const minted = await upload(new Request(`${config.siteOrigin}/api/v1/uploads`, {
      method: "POST", headers: { authorization: `Bearer ${authToken}` }, body: JSON.stringify({ bytes: 3 }),
    }));
    const body = await minted.json();
    expect((await fetch(body.url, { method: "PUT", body: "one" })).status).toBe(200);
    expect((await fetch(body.url, { method: "PUT", body: "two" })).status).toBe(412);
    expect(new TextDecoder().decode((await store.get(`up/${token.key8}/${body.id}`))!.bytes)).toBe("one");
    expect(await store.putJson(`sites/${token.key8}/test.json`, record())).toBe(false);
    bucket.putLocal(`s/${token.key8}/shared/index.html`, "keep");
    await expect(store.del(`s/${token.key8}/shared/index.html`)).rejects.toThrow("409");
    expect(bucket.objects.has(`s/${token.key8}/shared/index.html`)).toBe(true);
  }));

  test("signed conditions and exact payload bytes cannot be changed", () => fixture(async (_bucket, store) => {
    const original = globalThis.fetch;
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      url.searchParams.set("condition", "match");
      url.searchParams.set("etag", '"abc"');
      return original(url, init);
    }, { preconnect: original.preconnect });
    await expect(store.putConditional(`sites/${token.key8}/test.json`, {}, null)).rejects.toThrow("403");
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) =>
      original(input, { ...init, body: "[]" }), { preconnect: original.preconnect });
    await expect(store.putConditional(`sites/${token.key8}/test.json`, {}, null)).rejects.toThrow("400");
    globalThis.fetch = original;
  }));

  test("foreign metadata rejects unknown fields without repair writes", () => fixture(async (bucket) => {
    expect((await publish(1)).status).toBe(201);
    const key = `sites/${token.key8}/test.json`;
    const head = JSON.parse(new TextDecoder().decode(bucket.objects.get(key)!.bytes));
    bucket.putLocal(key, { ...head, unknown: true });
    const writes = bucket.writes.length;
    expect((await GET(request("GET"), params())).status).toBe(502);
    expect((await publicRead(bucket)).status).toBe(502);
    bucket.putLocal(key, head);
    const intentKey = `ops/${owner}/test/${id(1)}/intent.json`;
    const intent = JSON.parse(new TextDecoder().decode(bucket.objects.get(intentKey)!.bytes));
    bucket.putLocal(intentKey, { ...intent, unknown: true });
    expect((await GET(request("GET", undefined, "test", `?operation=${id(1)}`), params())).status).toBe(502);
    expect(bucket.writes).toHaveLength(writes);
  }));

  test("store list and public metadata streaming enforce byte bounds", () => fixture(async (bucket, store) => {
    const originalFetch = globalThis.fetch;
    let listCancelled = false;
    globalThis.fetch = Object.assign(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); },
      cancel() { listCancelled = true; },
    })), { preconnect: originalFetch.preconnect });
    await expect(store.list("sites/test/")).rejects.toThrow("too_large");
    expect(listCancelled).toBe(true);
    globalThis.fetch = originalFetch;
    const originalGet = bucket.get.bind(bucket);
    let headCancelled = false;
    bucket.get = async (key) => key.startsWith("sites/") ? {
      size: 1, httpEtag: '"abc"', writeHttpMetadata() {},
      body: new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(16 * 1024 + 1)); }, cancel() { headCancelled = true; } }),
    } : originalGet(key);
    expect((await publicRead(bucket)).status).toBe(502);
    expect(headCancelled).toBe(true);
  }));
});

describe("hosted operation parsing properties", () => {
  test("request fingerprints ignore object insertion order", () => {
    fc.assert(fc.property(fc.dictionary(fc.string({ maxLength: 10 }), fc.oneof(fc.string({ maxLength: 10 }), fc.integer(), fc.boolean()), { maxKeys: 20 }), (value) => {
      expect(requestDigest(value)).toBe(requestDigest(Object.fromEntries(Object.entries(value).reverse())));
    }), { numRuns: 100 });
  });
  test("operation and head round trips preserve revision and authority", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.uuid(), (revision, uuid) => {
      const op = { contract: OPERATION_CONTRACT, id: uuid, expectedRevision: revision };
      expect(parseOperation(JSON.parse(JSON.stringify(op)))).toEqual(op);
      const head: SiteHead = { v: 2, ownerDigest: owner, key8: token.key8, slug: "test", revision: revision + 1,
        site: record("a".repeat(64), "test", revision + 1),
        operation: { ...op, status: "committed", kind: "publish", revision: revision + 1, requestDigest: "c".repeat(64) } };
      expect(parseSiteHead(JSON.parse(JSON.stringify(head)), token.key8, "test")).toEqual(head);
      expect(parseSiteHead({ ...head, revision: revision + 2 }, token.key8, "test")).toBeUndefined();
      expect(parseSiteHead(head, token.key8, "different")).toBeUndefined();
      expect(parseSiteHead({ ...head, extra: true }, token.key8, "test")).toBeUndefined();
      expect(parseSiteHead({ ...head, operation: { ...head.operation, extra: true } }, token.key8, "test")).toBeUndefined();
      expect(parseSiteHead({ ...head, site: { ...head.site, extra: true } }, token.key8, "test")).toBeUndefined();
    }), { numRuns: 100 });
  });
  test("rejects unbounded or noncanonical operation inputs", () => {
    for (const input of [null, [], { ...operation(1), expectedRevision: -1 }, { ...operation(1), expectedRevision: Number.MAX_SAFE_INTEGER },
      { ...operation(1), expectedRevision: 1.5 }, { ...operation(1), id: "bad" }, { ...operation(1), ignored: true }]) {
      expect(parseOperation(input)).toBeUndefined();
    }
    let deep: unknown = 0;
    for (let depth = 0; depth < 20; depth += 1) deep = { deep };
    expect(() => requestDigest(deep)).toThrow("bounds");
  });
});
