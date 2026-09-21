/**
 * wordcell-sites — a signed request proxy in front of the private
 * `wordcell-sites` R2 bucket, plus the public read path for published sites.
 *
 * Why this exists: the bucket is reachable only through R2 bucket bindings or
 * S3 API tokens. This worker holds the binding, so the API needs no
 * Cloudflare-issued credential — only the shared HMAC secret
 * `OBJECT_PROXY_SECRET`, which signs the operation, key, expiry, and declared
 * byte cap into every URL it mints. The worker verifies the signature,
 * enforces the declared caps, and performs the bucket op.
 *
 * Signed ops (`/o/{key}?exp=<unix>&sig=<hex>[&max=<bytes>]`):
 *  - PUT/GET/HEAD/DELETE on keys under s/, up/, m/, tok/, dev/, q/, sites/
 *  - GET /o-list?prefix=<p>&limit=<n> lists key names (bounded)
 * Canonical string: `${method}\n${key}\n${exp}\n${maxBytes}` where maxBytes is
 * empty for reads and deletes; LIST signs `LIST\n${prefix}\n${exp}\n`.
 *
 * Public reads (`/p/{key8}/{slug}/[{path}]`):
 *  - resolves `m/{key8}/{slug}` to the current artifact digest, then serves
 *    `s/{key8}/{digest}/{path}` with directory-index and 404.html fallback.
 *    Artifacts are owner-scoped so a delete or republish sweep can never
 *    remove another namespace's identical bytes.
 *  - no signature; published sites are public by contract.
 *
 * Policy beyond the signature (defense in depth):
 *  - expiry is 1..3600 seconds out
 *  - PUT requires a `max` param ≤ 64 MiB; content-length and the streamed body
 *    are both capped by it
 *  - metadata headers are bounded and only `x-meta-*` pass through
 */

interface Env {
  readonly BUCKET: R2Bucket
  readonly OBJECT_PROXY_SECRET: string
}

interface R2Object {
  readonly body: ReadableStream
  readonly size: number
  readonly customMetadata?: Record<string, string>
  writeHttpMetadata(headers: Headers): void
}

interface R2Objects {
  readonly objects: readonly { readonly key: string }[]
  readonly truncated: boolean
}

interface R2Bucket {
  get(key: string): Promise<R2Object | null>
  head(key: string): Promise<R2Object | null>
  put(
    key: string,
    value: ReadableStream | ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string }
      customMetadata?: Record<string, string>
    },
  ): Promise<unknown>
  delete(key: string | string[]): Promise<void>
  list(options?: { prefix?: string; limit?: number }): Promise<R2Objects>
}

const KEY_PREFIXES = ["s/", "up/", "m/", "tok/", "dev/", "q/", "sites/"] as const
const MAX_KEY_LENGTH = 512
const MAX_PUT_BYTES = 64 * 1024 * 1024
const MAX_EXPIRY_SECONDS = 3600
const MAX_META_HEADERS = 8
const MAX_META_VALUE = 256
const MAX_CONTENT_TYPE = 128
const MAX_LIST_LIMIT = 512
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/u
const KEY8_PATTERN = /^[a-z0-9]{8}$/u

function text(value: string, status: number): Response {
  return new Response(JSON.stringify({ error: value }), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function decodeKey(raw: string): string | undefined {
  try {
    const key = decodeURIComponent(raw)
    if (
      key.length > MAX_KEY_LENGTH ||
      !KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
      key.includes("..") ||
      key.includes("\0")
    ) {
      return undefined
    }
    return key
  } catch {
    return undefined
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  )
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

function metaHeaders(request: Request): Record<string, string> {
  const metadata: Record<string, string> = {}
  let count = 0
  for (const [name, value] of request.headers) {
    if (!name.startsWith("x-meta-") || value.length > MAX_META_VALUE) continue
    if (count >= MAX_META_HEADERS) break
    metadata[name.slice("x-meta-".length)] = value
    count += 1
  }
  return metadata
}

function validExpiry(exp: number): boolean {
  const now = Math.floor(Date.now() / 1000)
  return (
    Number.isInteger(exp) && exp > now && exp - now <= MAX_EXPIRY_SECONDS
  )
}

async function signed(request: Request, env: Env, url: URL): Promise<Response> {
  const method = request.method
  const exp = Number(url.searchParams.get("exp") ?? "")
  if (!validExpiry(exp)) return text("expired", 403)

  if (method === "GET" && url.pathname === "/o-list") {
    const prefix = url.searchParams.get("prefix") ?? ""
    const limitParam = Number(url.searchParams.get("limit") ?? "")
    if (
      !KEY_PREFIXES.some((candidate) => prefix.startsWith(candidate)) ||
      prefix.includes("..") ||
      prefix.length > MAX_KEY_LENGTH ||
      !Number.isInteger(limitParam) ||
      limitParam < 1 ||
      limitParam > MAX_LIST_LIMIT
    ) {
      return text("invalid_list", 400)
    }
    const expected = await hmacHex(
      env.OBJECT_PROXY_SECRET,
      `LIST\n${prefix}\n${String(exp)}\n`,
    )
    if (!constantTimeEqual(url.searchParams.get("sig") ?? "", expected)) {
      return text("forbidden", 403)
    }
    const listed = await env.BUCKET.list({ prefix, limit: limitParam })
    return Response.json({
      keys: listed.objects.map((object) => object.key),
      truncated: listed.truncated,
    })
  }

  const match = /^\/o\/(.+)$/u.exec(url.pathname)
  const rawKey = match?.[1]
  const key = rawKey === undefined ? undefined : decodeKey(rawKey)
  if (key === undefined) return text("invalid_key", 400)

  if (
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "PUT" &&
    method !== "DELETE"
  ) {
    return text("method_not_allowed", 405)
  }

  const maxParam = url.searchParams.get("max") ?? ""
  if (method === "PUT") {
    const max = Number(maxParam)
    if (!Number.isInteger(max) || max < 1 || max > MAX_PUT_BYTES) {
      return text("invalid_max", 400)
    }
  }

  const expected = await hmacHex(
    env.OBJECT_PROXY_SECRET,
    `${method}\n${key}\n${String(exp)}\n${method === "PUT" ? maxParam : ""}`,
  )
  if (!constantTimeEqual(url.searchParams.get("sig") ?? "", expected)) {
    return text("forbidden", 403)
  }

  if (method === "PUT") {
    const declared = Number(request.headers.get("content-length") ?? "0")
    const max = Number(maxParam)
    if (declared > max || request.body === null) {
      return text("too_large", 413)
    }
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let streamed = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      streamed += value.byteLength
      if (streamed > max) {
        await reader.cancel()
        return text("too_large", 413)
      }
      chunks.push(value)
    }
    const body = new Uint8Array(streamed)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    const contentType = request.headers.get("content-type") ?? undefined
    try {
      await env.BUCKET.put(key, body.buffer as ArrayBuffer, {
        ...(contentType !== undefined && contentType.length <= MAX_CONTENT_TYPE
          ? { httpMetadata: { contentType } }
          : {}),
        customMetadata: metaHeaders(request),
      })
    } catch {
      return text("put_failed", 502)
    }
    return new Response(null, { status: 200 })
  }

  if (method === "DELETE") {
    await env.BUCKET.delete(key)
    return new Response(null, { status: 200 })
  }

  const object =
    method === "GET" ? await env.BUCKET.get(key) : await env.BUCKET.head(key)
  if (object === null) return text("not_found", 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("content-length", String(object.size))
  for (const [name, value] of Object.entries(object.customMetadata ?? {})) {
    headers.set(`x-meta-${name}`, value)
  }
  return new Response(method === "GET" ? object.body : null, {
    headers,
    status: 200,
  })
}

function servePath(rest: string): readonly string[] {
  if (rest === "" || rest.endsWith("/")) return [`${rest}index.html`]
  const last = rest.slice(rest.lastIndexOf("/") + 1)
  if (!last.includes(".")) {
    return [`${rest}/index.html`, rest]
  }
  return [rest]
}

async function serve(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return text("method_not_allowed", 405)
  }
  const match = /^\/p\/([a-z0-9]{8})\/([a-z0-9][a-z0-9-]{0,62})(\/.*)?$/u.exec(
    url.pathname,
  )
  if (match === null) return text("not_found", 404)
  const key8 = match[1] ?? ""
  const slug = match[2] ?? ""
  if (!KEY8_PATTERN.test(key8) || !SLUG_PATTERN.test(slug)) {
    return text("not_found", 404)
  }
  const pointer = await env.BUCKET.get(`m/${key8}/${slug}`)
  if (pointer === null) return text("not_found", 404)
  let digest = ""
  try {
    const parsed: unknown = JSON.parse(await new Response(pointer.body).text())
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "digest" in parsed &&
      typeof parsed.digest === "string" &&
      /^[0-9a-f]{64}$/u.test(parsed.digest)
    ) {
      digest = parsed.digest
    }
  } catch {
    return text("not_found", 404)
  }
  if (digest === "") return text("not_found", 404)

  const rest = (match[3] ?? "/").slice(1)
  if (rest.includes("..") || rest.includes("\0")) return text("not_found", 404)
  for (const candidate of servePath(rest)) {
    const object = await env.BUCKET.get(`s/${key8}/${digest}/${candidate}`)
    if (object === null) continue
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set("content-length", String(object.size))
    headers.set("cache-control", "public, max-age=60")
    return new Response(request.method === "GET" ? object.body : null, {
      headers,
      status: 200,
    })
  }
  const fallback = await env.BUCKET.get(`s/${key8}/${digest}/404.html`)
  if (fallback === null) return text("not_found", 404)
  const headers = new Headers()
  fallback.writeHttpMetadata(headers)
  headers.set("content-type", "text/html; charset=utf-8")
  return new Response(request.method === "GET" ? fallback.body : null, {
    headers,
    status: 404,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/p" || url.pathname.startsWith("/p/")) {
      return serve(request, env, url)
    }
    return signed(request, env, url)
  },
}
