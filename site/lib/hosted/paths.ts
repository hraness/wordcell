/** Path/slug validation and content types for hosted publication. */

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/u;

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}

const MAX_PATH_BYTES = 512;
const MAX_COMPONENT_BYTES = 255;

/**
 * A vault-relative file path: POSIX separators, no traversal, no dotfiles as
 * components, no control characters. Returns the normalized path or undefined.
 */
export function vaultPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.startsWith("/") || value.includes("\\")) return undefined;
  const path = value;
  if (path === "" || path.length > MAX_PATH_BYTES) return undefined;
  if (path.includes("\0") || /[\x00-\x1f]/u.test(path)) return undefined;
  const components = path.split("/");
  if (components.some((c) => c === "" || c === "." || c === "..")) {
    return undefined;
  }
  if (components.some((c) => c.length > MAX_COMPONENT_BYTES || c.startsWith("."))) {
    return undefined;
  }
  return path;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
};

export function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  return CONTENT_TYPES[path.slice(dot).toLowerCase()] ?? "application/octet-stream";
}
