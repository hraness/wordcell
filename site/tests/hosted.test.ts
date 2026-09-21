import { describe, expect, test } from "bun:test";

import { isTokenShape, newToken, tokenDigest } from "../lib/hosted/auth";
import {
  artifactDigest,
  parseFiles,
  parseSelection,
} from "../lib/hosted/parse";
import { contentTypeFor, isSlug, vaultPath } from "../lib/hosted/paths";
import {
  materializeVault,
  projectHostedVault,
} from "../lib/hosted/publish";
import { HOSTED_PACKAGE_VERSION } from "../lib/hosted/reader.generated";
import { POST as mcpPost } from "../app/api/v1/mcp/route";
import { access } from "node:fs/promises";

const enc = (value: string) => new TextEncoder().encode(value);

describe("vaultPath", () => {
  test("accepts ordinary vault-relative paths", () => {
    expect(vaultPath("index.md")).toBe("index.md");
    expect(vaultPath("notes/deep/a.md")).toBe("notes/deep/a.md");
    expect(vaultPath("assets/logo.png")).toBe("assets/logo.png");
  });
  test("rejects traversal, dot components, and control characters", () => {
    for (const bad of [
      "../etc/passwd",
      "a/../../b",
      "a//b",
      "/absolute/path",
      ".hidden/file",
      "a/./b",
      "a/../b",
      "ok/bad\0name",
      "tab\tname",
      "",
    ]) {
      expect(vaultPath(bad)).toBeUndefined();
    }
  });
});

describe("isSlug", () => {
  test("matches the worker's public-path pattern", () => {
    expect(isSlug("my-site")).toBe(true);
    expect(isSlug("a")).toBe(true);
    expect(isSlug("a".repeat(63))).toBe(true);
    expect(isSlug("-lead")).toBe(false);
    expect(isSlug("UPPER")).toBe(false);
    expect(isSlug("a".repeat(64))).toBe(false);
    expect(isSlug("has_underscore")).toBe(false);
  });
});

describe("tokens", () => {
  test("newToken mints the declared shape and digests deterministically", () => {
    const token = newToken();
    expect(isTokenShape(token)).toBe(true);
    expect(tokenDigest(token)).toMatch(/^[0-9a-f]{64}$/u);
    expect(tokenDigest(token)).toBe(tokenDigest(token));
    expect(isTokenShape("wc_pub_short")).toBe(false);
    expect(isTokenShape(token.slice(1))).toBe(false);
  });
});

describe("parseFiles", () => {
  test("accepts utf8, base64, and upload entries", () => {
    const parsed = parseFiles({
      "a.md": "# hi",
      "img.png": { base64: Buffer.from("png").toString("base64") },
      "big.bin": { upload: "123e4567-e89b-42d3-a456-426614174000" },
    });
    expect(parsed).not.toBe("invalid");
    if (parsed === "invalid") return;
    expect(parsed.entries.size).toBe(3);
    expect(parsed.entries.get("a.md")?.kind).toBe("inline");
    expect(parsed.entries.get("big.bin")?.kind).toBe("upload");
  });
  test("rejects unsafe paths and bad shapes", () => {
    expect(parseFiles({ "../x": "a" })).toBe("invalid");
    expect(parseFiles({ "a.md": 42 })).toBe("invalid");
    expect(parseFiles({})).toBe("invalid");
    expect(parseFiles("nope")).toBe("invalid");
    const tooMany = Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`n${i}.md`, "x"]),
    );
    expect(parseFiles(tooMany)).toBe("invalid");
  });
});

describe("parseSelection", () => {
  test("passes through bounded selection clauses", () => {
    const parsed = parseSelection({
      includes: ["a", "b"],
      tags: ["#x"],
      from: { note: "index", depth: 2, direction: "out" },
    });
    expect(parsed).not.toBe("invalid");
    if (parsed === "invalid" || parsed === undefined) return;
    expect(parsed.includes).toEqual(["a", "b"]);
    expect(parsed.from).toEqual({ note: "index", depth: 2, direction: "out" });
  });
  test("rejects malformed clauses", () => {
    expect(parseSelection("x")).toBe("invalid");
    expect(parseSelection({ includes: [1] })).toBe("invalid");
    expect(parseSelection({ from: { note: "i", depth: 0, direction: "out" } }))
      .toBe("invalid");
    expect(parseSelection({ from: { note: "i", depth: 2, direction: "sideways" } }))
      .toBe("invalid");
  });
});

describe("artifactDigest", () => {
  test("is order-independent and content-sensitive", () => {
    const a = new Map([["x.md", enc("1")], ["y.md", enc("2")]]);
    const b = new Map([["y.md", enc("2")], ["x.md", enc("1")]]);
    const c = new Map([["x.md", enc("1")], ["y.md", enc("3")]]);
    expect(artifactDigest(a)).toBe(artifactDigest(b));
    expect(artifactDigest(a)).not.toBe(artifactDigest(c));
  });
});

describe("contentTypeFor", () => {
  test("covers the emitted surface", () => {
    expect(contentTypeFor("index.html")).toContain("text/html");
    expect(contentTypeFor("catalog.json")).toContain("application/json");
    expect(contentTypeFor("reader/reader.css")).toContain("text/css");
    expect(contentTypeFor("assets/x.png")).toBe("image/png");
    expect(contentTypeFor("assets/x")).toBe("application/octet-stream");
  });
});

describe("projectHostedVault", () => {
  test("emits the v1 artifact from a materialized request vault", async () => {
    const { root, cleanup } = await materializeVault(
      new Map([
        ["index.md", enc("# Index\n\nFront door linking [[a]].\n")],
        ["a.md", enc("# A\n\nBody linking back to [[index]].\n")],
      ]),
    );
    try {
      const projected = await projectHostedVault(root, {
        title: "Test",
        basePath: "/p/abcd1234/test/",
        baseUrl: "https://wordcell.io",
      });
      const paths = [...projected.files.keys()];
      expect(paths).toContain("index.html");
      expect(paths).toContain("manifest.json");
      expect(paths).toContain("404.html");
      expect(paths).toContain("catalog.json");
      expect(paths).toContain("n/a/index.html");
      expect(paths).toContain("reader/reader.js");
      expect(paths).toContain("reader/reader.css");
      expect(paths).toContain("reader/theme.js");
      expect(projected.notes).toBe(2);
      expect(projected.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(HOSTED_PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
    } finally {
      await cleanup();
    }
    await expect(access(root)).rejects.toThrow();
  });

  test("rejects an empty selection", async () => {
    const { root, cleanup } = await materializeVault(
      new Map([["a.md", enc("# A\n\nbody\n")]]),
    );
    try {
      await expect(
        projectHostedVault(root, {
          basePath: "/p/abcd1234/test/",
          baseUrl: "https://wordcell.io",
          selection: { includes: ["does-not-exist"] },
        }),
      ).rejects.toMatchObject({ code: "empty_selection" });
    } finally {
      await cleanup();
    }
  });

  test("deterministic output digests identically across runs", async () => {
    const files = new Map([["index.md", enc("# I\n\nlinks [[b]].\n")], ["b.md", enc("# B\n")]])
    const first = await materializeVault(files);
    const second = await materializeVault(files);
    try {
      const a = await projectHostedVault(first.root, {
        basePath: "/p/k/s/", baseUrl: "https://wordcell.io",
      });
      const b = await projectHostedVault(second.root, {
        basePath: "/p/k/s/", baseUrl: "https://wordcell.io",
      });
      expect(artifactDigest(a.files)).toBe(artifactDigest(b.files));
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });
});

describe("mcp adapter", () => {
  const rpc = (payload: unknown) =>
    mcpPost(new Request("https://wordcell.io/api/v1/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }));

  test("initialize and tools/list describe the connector tools", async () => {
    const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(init.status).toBe(200);
    const initBody = await init.json() as { result: { protocolVersion: string } };
    expect(initBody.result.protocolVersion).toBe("2025-11-25");

    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const { tools } = (await list.json() as { result: { tools: Array<{ name: string }> } }).result;
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "create_token", "delete_site", "list_sites", "publish_site",
    ]);
  });

  test("notifications return 202 and malformed frames are JSON-RPC errors", async () => {
    const notification = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(notification.status).toBe(202);
    const badJson = await rpc("not json{");
    expect((await badJson.json() as { error: { code: number } }).error.code).toBe(-32700);
    const noMethod = await rpc({ jsonrpc: "2.0", id: 3 });
    expect((await noMethod.json() as { error: { code: number } }).error.code).toBe(-32600);
    const unknown = await rpc({ jsonrpc: "2.0", id: 4, method: "resources/list" });
    expect((await unknown.json() as { error: { code: number } }).error.code).toBe(-32601);
  });

  test("tools/call dispatches to the REST surface and reports isError on failure", async () => {
    // With no hosted config the underlying route fails closed; the MCP layer
    // still returns a well-formed tool result carrying the REST error body.
    const call = await rpc({
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "list_sites", arguments: {} },
    });
    expect(call.status).toBe(200);
    const body = await call.json() as {
      result: { isError?: boolean; structuredContent?: { error?: { code?: string } } };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent?.error?.code).toBeDefined();

    const unknownTool = await rpc({
      jsonrpc: "2.0", id: 6, method: "tools/call",
      params: { name: "drop_table", arguments: {} },
    });
    const unknownBody = await unknownTool.json() as {
      result: { isError?: boolean; structuredContent?: { error?: { code?: string } } };
    };
    expect(unknownBody.result.isError).toBe(true);
    expect(unknownBody.result.structuredContent?.error?.code).toBe("UNKNOWN_TOOL");
  });
});
