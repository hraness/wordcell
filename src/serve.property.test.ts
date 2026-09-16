import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createServeHandler } from "./serve.js";

const CANARY = "outside-canary-7c2f";

const hostileSegment = fc.constantFrom(
  "index.html",
  "a",
  "b.txt",
  "sub",
  "c.txt",
  "..",
  ".",
  "...",
  "%2e",
  "%2e%2e",
  "..%2f",
  "%2f..",
  "%2f",
  "a%2fb.txt",
  "a%20b",
  "%00",
  "nonexistent",
  "ünïcode",
  "sub/c.txt",
);

describe("serve confinement properties", () => {
  test("no request path resolves content outside the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "hraness-wordcell-serve-prop-"));
    const outside = await mkdtemp(join(tmpdir(), "hraness-wordcell-serve-out-"));
    try {
      await mkdir(join(root, "a", "sub"), { recursive: true });
      const contents = new Map([
        ["index.html", "landing-body"],
        ["a/b.txt", "b-body"],
        ["a/sub/c.txt", "c-body"],
      ]);
      for (const [name, body] of contents) {
        await writeFile(join(root, name), body, "utf8");
      }
      await writeFile(join(outside, "canary.txt"), CANARY, "utf8");
      await writeFile(join(root, "404.html"), "<h1>Lost</h1>", "utf8");
      const handler = await createServeHandler(root);
      const bodies = new Set([...contents.values(), "<h1>Lost</h1>"]);

      await fc.assert(fc.asyncProperty(
        fc.array(hostileSegment, { maxLength: 6 }),
        async (segments) => {
          const url = `http://127.0.0.1/${segments.join("/")}`;
          const response = await handler(
            new Request(url, { method: "GET" }),
          );
          const body = await response.text();
          // The outside canary is never served.
          expect(body).not.toBe(CANARY);
          // A 200 body is always one of the known in-root files.
          if (response.status === 200) {
            expect(bodies.has(body)).toBe(true);
          }
          // The WHATWG parser normalizes dot segments before the handler sees
          // the path; any `..` that still survives must be refused.
          let decoded = new URL(url).pathname;
          try {
            decoded = decodeURIComponent(decoded);
          } catch { /* malformed escapes may still 404 */ }
          if (decoded.split("/").includes("..")) {
            expect(response.status).toBe(404);
          }
          // Statuses stay within the documented vocabulary.
          expect([200, 400, 404, 405, 414]).toContain(response.status);
        },
      ), { numRuns: 200 });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
