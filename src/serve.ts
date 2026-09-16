import { realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";

const MAX_PATH_BYTES = 8 * 1_024;

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
});

export type ServeSiteOptions = Readonly<{
  root: string;
  host?: string;
  port?: number;
}>;

export type ServeListener = Readonly<{
  hostname: string;
  port: number;
  stop: () => void;
}>;

export type ServeListen = (init: Readonly<{
  hostname: string;
  port: number;
  fetch: (request: Request) => Response | Promise<Response>;
}>) => ServeListener;

export type ServeIo = Readonly<{
  listen?: ServeListen;
}>;

export type ServedSite = Readonly<{
  root: string;
  host: string;
  port: number;
  url: string;
  close: () => void;
}>;

function contentType(path: string): string {
  const extension = path.slice(path.lastIndexOf("."));
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

async function regularFileUnder(rootReal: string, candidate: string): Promise<string | null> {
  let resolved: string;
  try {
    resolved = await realpath(candidate);
  } catch {
    return null;
  }
  if (resolved !== rootReal && !resolved.startsWith(`${rootReal}${sep}`)) return null;
  try {
    return (await stat(resolved)).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

async function resolveRequest(rootReal: string, pathname: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = decoded.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.some((segment) => segment === "..")) return null;
  const relative = segments.join("/");
  const candidates = [
    join(rootReal, relative),
    join(rootReal, relative, "index.html"),
  ];
  for (const candidate of candidates) {
    const file = await regularFileUnder(rootReal, candidate);
    if (file !== null) return file;
  }
  return null;
}

export async function createServeHandler(
  root: string,
): Promise<(request: Request) => Promise<Response>> {
  const rootReal = await realpath(root);
  return async (request) => {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    let pathname: string;
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (pathname.length > MAX_PATH_BYTES) {
      return new Response("URI too long", { status: 414 });
    }
    const head = method === "HEAD";
    const file = await resolveRequest(rootReal, pathname);
    if (file !== null) {
      const body = Bun.file(file);
      return new Response(head ? null : body, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Length": String(body.size),
          "Content-Type": contentType(file),
        },
      });
    }
    const notFound = await regularFileUnder(rootReal, join(rootReal, "404.html"));
    if (notFound !== null) {
      const body = Bun.file(notFound);
      return new Response(head ? null : body, {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Content-Length": String(body.size),
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }
    return new Response(head ? null : "Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  };
}

export async function serveSite(
  options: ServeSiteOptions,
  io: ServeIo = {},
): Promise<ServedSite> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8080;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Port must be an integer from 0 through 65535");
  }
  const rootReal = await realpath(options.root);
  if (!(await stat(rootReal)).isDirectory()) {
    throw new Error(`Site root is not a directory: ${options.root}`);
  }
  const listen = io.listen ?? ((init) => Bun.serve(init));
  const server = listen({
    hostname: host,
    port,
    fetch: await createServeHandler(rootReal),
  });
  const boundPort = server.port ?? port;
  return Object.freeze({
    root: rootReal,
    host,
    port: boundPort,
    url: `http://${host}:${String(boundPort)}/`,
    close: () => server.stop(),
  });
}
