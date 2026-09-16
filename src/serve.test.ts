import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createServeHandler, serveSite, type ServeListener } from "./serve.js";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function makeSite(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "hraness-wordcell-serve-"));
  await mkdir(join(root, "n", "alpha"), { recursive: true });
  await writeFile(join(root, "index.html"), "<h1>Landing</h1>", "utf8");
  await writeFile(join(root, "404.html"), "<h1>Lost</h1>", "utf8");
  await writeFile(join(root, "manifest.json"), '{"format":"hraness.wordcell.site.v1"}', "utf8");
  await writeFile(join(root, "n", "alpha", "index.html"), "<h1>Alpha</h1>", "utf8");
  await writeFile(join(root, "n", "alpha.json"), '{"id":"alpha"}', "utf8");
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

function request(path: string, method = "GET"): Request {
  return new Request(`http://127.0.0.1${path}`, { method });
}

describe("createServeHandler", () => {
  test("serves files with content types and resolves directories to index.html", async () => {
    const root = await makeSite();
    const handler = await createServeHandler(root);

    const landing = await handler(request("/"));
    expect(landing.status).toBe(200);
    expect(landing.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await landing.text()).toBe("<h1>Landing</h1>");

    const note = await handler(request("/n/alpha"));
    expect(note.status).toBe(200);
    expect(await note.text()).toBe("<h1>Alpha</h1>");

    const payload = await handler(request("/n/alpha.json"));
    expect(payload.status).toBe(200);
    expect(payload.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(payload.headers.get("Cache-Control")).toBe("no-store");
  });

  test("returns the published 404 page for missing paths", async () => {
    const root = await makeSite();
    const handler = await createServeHandler(root);
    const response = await handler(request("/missing"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe("<h1>Lost</h1>");
  });

  test("falls back to plain text when no 404 page exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "hraness-wordcell-serve-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const handler = await createServeHandler(root);
    const response = await handler(request("/missing"));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  test("rejects traversal, encoded traversal, backslashes, and null bytes", async () => {
    const root = await makeSite();
    const outside = join(root, "..", `${root.split("/").pop()}-outside.txt`);
    await writeFile(join(root, "..", "serve-outside-secret.txt"), "secret", "utf8");
    cleanups.push(() => rm(join(root, "..", "serve-outside-secret.txt"), { force: true }));
    void outside;
    const handler = await createServeHandler(root);
    for (const path of [
      "/../serve-outside-secret.txt",
      "/%2e%2e/serve-outside-secret.txt",
      "/%2E%2E%2Fserve-outside-secret.txt",
      "/n/alpha/%2e%2e/%2e%2e/serve-outside-secret.txt",
      "/%00.html",
    ]) {
      const response = await handler(request(path));
      expect(response.status, path).toBe(404);
      const body = await response.text();
      expect(body, path).not.toBe("secret");
    }
    // WHATWG URL parsing normalizes backslashes to slashes before the handler
    // sees them, so a backslash path resolves to the in-root file only.
    const backslash = await handler(request("/n\\alpha.json"));
    expect(backslash.status).toBe(200);
    expect(await backslash.text()).toBe('{"id":"alpha"}');
  });

  test("does not follow symlinks that escape the root", async () => {
    const root = await makeSite();
    const outside = await mkdtemp(join(tmpdir(), "hraness-wordcell-serve-outside-"));
    cleanups.push(() => rm(outside, { recursive: true, force: true }));
    await writeFile(join(outside, "secret.txt"), "secret", "utf8");
    await symlink(join(outside, "secret.txt"), join(root, "leak.txt"));
    const handler = await createServeHandler(root);
    const response = await handler(request("/leak.txt"));
    expect(response.status).toBe(404);
  });

  test("follows symlinks that stay inside the root", async () => {
    const root = await makeSite();
    await symlink(join(root, "manifest.json"), join(root, "alias.json"));
    const handler = await createServeHandler(root);
    const response = await handler(request("/alias.json"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"format":"hraness.wordcell.site.v1"}');
  });

  test("answers HEAD with headers and no body, and rejects other methods", async () => {
    const root = await makeSite();
    const handler = await createServeHandler(root);

    const head = await handler(request("/manifest.json", "HEAD"));
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(Number(head.headers.get("Content-Length"))).toBeGreaterThan(0);
    expect(await head.text()).toBe("");

    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await handler(request("/manifest.json", method));
      expect(response.status, method).toBe(405);
    }
  });
});

describe("serveSite", () => {
  test("rejects a missing root and an invalid port", async () => {
    await expect(serveSite({ root: join(tmpdir(), "hraness-wordcell-no-such-dir") }))
      .rejects.toThrow();
    await expect(serveSite({ root: tmpdir(), port: -1 })).rejects.toThrow(/Port/);
    await expect(serveSite({ root: tmpdir(), port: 65_536 })).rejects.toThrow(/Port/);
  });

  test("rejects a file root", async () => {
    const root = await makeSite();
    await expect(serveSite({ root: join(root, "manifest.json") })).rejects.toThrow(/not a directory/);
  });

  test("binds through the injected listener and reports the bound port", async () => {
    const root = await makeSite();
    let captured: { hostname?: string; port?: number } = {};
    const listener: ServeListener = {
      hostname: "127.0.0.1",
      port: 49_321,
      stop: () => {},
    };
    const site = await serveSite({ root, port: 0 }, {
      listen: (init) => {
        captured = init;
        void init.fetch;
        return listener;
      },
    });
    expect(captured.hostname).toBe("127.0.0.1");
    expect(captured.port).toBe(0);
    expect(site.port).toBe(49_321);
    expect(site.url).toBe("http://127.0.0.1:49321/");
    site.close();
  });

  test("serves a published site over a real socket", async () => {
    const root = await makeSite();
    const site = await serveSite({ root, port: 0 });
    cleanups.push(() => site.close());
    const response = await fetch(`${site.url}manifest.json`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"format":"hraness.wordcell.site.v1"}');
    const missing = await fetch(`${site.url}missing`);
    expect(missing.status).toBe(404);
  });
});
