import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

import { revisionFor } from "./authoring-model.js";
import { noteRevision } from "./authoring.js";
import type { CallToolResult, ToolCatalog } from "./mcp-server.js";
import {
  createToolCatalog,
  fitBody,
  fitResult,
  metadataFilters,
  MAX_TOOL_RESULT_BYTES,
  ResultTooLargeError,
  serverInstructions,
  ToolArgumentError,
  type ContextRequest,
  type ToolCatalogOptions,
} from "./mcp-tools.js";
import type { KnowledgeBaseDependencies } from "./sdk.js";
import { scanVault } from "./vault.js";

const ALPHA = [
  "---",
  "title: Alpha Switch",
  "tags: [capture]",
  "status: active",
  "---",
  "",
  "# Alpha Switch",
  "",
  "The exact identifier remains searchable before the local model runs.",
  "",
  "[[notes/beta]]",
  "",
].join("\n");

const BETA = [
  "---",
  "title: Beta Relay",
  "tags: [capture, relay]",
  "status: draft",
  "---",
  "",
  "Beta relays the alpha signal. [[notes/alpha]]",
  "",
].join("\n");

async function fixture(): Promise<{ readonly temporary: string; readonly root: string }> {
  const temporary = await mkdtemp(join(tmpdir(), "hraness-wordcell-mcp-tools-"));
  const root = join(temporary, "kb");
  await mkdir(join(root, "notes"), { recursive: true });
  await writeFile(join(root, "index.md"), "# Knowledge base\n", "utf8");
  await writeFile(join(root, "notes", "alpha.md"), ALPHA, "utf8");
  await writeFile(join(root, "notes", "beta.md"), BETA, "utf8");
  await writeFile(join(root, "notes", "plain.md"), "Plain note without frontmatter.\n", "utf8");
  return { temporary, root: await realpath(root) };
}

type Harness = {
  readonly temporary: string;
  readonly root: string;
  readonly catalog: ToolCatalog;
  readonly scans: () => number;
  call(name: string, arguments_?: Record<string, unknown>): Promise<CallToolResult>;
  ok(name: string, arguments_?: Record<string, unknown>): Promise<Record<string, unknown>>;
};

async function withCatalog(
  run: (harness: Harness) => Promise<void>,
  options: Partial<ToolCatalogOptions> & { readonly afterScan?: (count: number, root: string) => Promise<void> } = {},
): Promise<void> {
  const { temporary, root } = await fixture();
  let scans = 0;
  const dependencies: KnowledgeBaseDependencies = {
    openSemanticSearchSession: () => Promise.reject(new Error("model unavailable")),
    scanVault: async (scanRoot, scanOptions) => {
      const snapshot = await scanVault(scanRoot, scanOptions);
      scans += 1;
      await options.afterScan?.(scans, root);
      return snapshot;
    },
  };
  const catalog = createToolCatalog({ root, readOnly: false, dependencies, ...options });
  const call = (name: string, arguments_: Record<string, unknown> = {}) => catalog.call(name, arguments_);
  try {
    await run({
      temporary,
      root,
      catalog,
      scans: () => scans,
      call,
      async ok(name, arguments_ = {}) {
        const result = await call(name, arguments_);
        if (result.isError === true) throw new Error(`${name} failed: ${result.content[0]?.text}`);
        expect(JSON.parse(result.content[0]?.text ?? "null")).toEqual(result.structuredContent);
        return { ...result.structuredContent };
      },
    });
  } finally {
    await catalog.close();
    await rm(temporary, { recursive: true, force: true });
  }
}

function errorText(result: CallToolResult): string {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toBeUndefined();
  return result.content[0]?.text ?? "";
}

describe("read tools", () => {
  test("lists read tools in catalog order with closed-world read-only annotations", async () => {
    await withCatalog(async ({ catalog }) => {
      expect(catalog.tools.map(({ name }) => name)).toEqual(["search", "list_notes", "get_note", "backlinks", "links"]);
      for (const tool of catalog.tools) {
        expect(tool.inputSchema["type"]).toBe("object");
        expect(tool.inputSchema["additionalProperties"]).toBe(false);
        expect(tool.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
      }
    }, { readOnly: true });
  });

  test("search keeps exact evidence and reports an unavailable QMD lane", async () => {
    await withCatalog(async ({ ok }) => {
      const result = await ok("search", { query: "exact identifier" });
      expect(result["partial"]).toBe(true);
      expect(result["truncated"]).toBe(false);
      const results = result["results"] as readonly { id: string; evidence: readonly { kind: string }[] }[];
      expect(results[0]?.id).toBe("notes/alpha");
      expect(results[0]?.evidence.some(({ kind }) => kind === "exact")).toBe(true);
      const diagnostics = result["diagnostics"] as { lanes: readonly Record<string, unknown>[] };
      expect(diagnostics.lanes).toContainEqual(expect.objectContaining({
        lane: "qmd",
        status: "unavailable",
        message: "model unavailable",
      }));
    });
  });

  test("search in exact mode honors tags and metadata filters", async () => {
    await withCatalog(async ({ ok }) => {
      const tagged = await ok("search", { query: "alpha", mode: "exact", tags: ["relay"] });
      expect((tagged["results"] as readonly { id: string }[]).map(({ id }) => id)).toEqual(["notes/beta"]);
      const filtered = await ok("search", {
        query: "alpha",
        mode: "exact",
        where: [{ path: "status", value: "active" }],
      });
      expect((filtered["results"] as readonly { id: string }[]).map(({ id }) => id)).toEqual(["notes/alpha"]);
    });
  });

  test("list_notes filters, sorts, and reports the total before the limit", async () => {
    await withCatalog(async ({ ok }) => {
      const all = await ok("list_notes");
      // The vault index is the front door, not a listed note.
      expect((all["notes"] as readonly { id: string }[]).map(({ id }) => id)).toEqual([
        "notes/alpha",
        "notes/beta",
        "notes/plain",
      ]);
      expect(all["total"]).toBe(3);
      expect(all["truncated"]).toBe(false);
      const first = await ok("list_notes", { has: ["status"], sort: "metadata.status", order: "desc", limit: 1 });
      expect((first["notes"] as readonly { id: string }[]).map(({ id }) => id)).toEqual(["notes/beta"]);
      expect(first["total"]).toBe(2);
      expect(first["truncated"]).toBe(true);
      const row = (first["notes"] as readonly Record<string, unknown>[])[0];
      expect(row).not.toHaveProperty("backlinks");
      expect(row).toHaveProperty("metadata");
      const tagged = await ok("list_notes", { tags: ["capture"], where: [{ path: "status", value: "active" }] });
      expect(tagged["total"]).toBe(1);
    });
  });

  test("get_note splits frontmatter and body and returns the file revision", async () => {
    await withCatalog(async ({ ok, root }) => {
      const note = await ok("get_note", { id: "notes/alpha" });
      expect(note).toMatchObject({
        id: "notes/alpha",
        path: "notes/alpha.md",
        title: "Alpha Switch",
        frontmatter: { title: "Alpha Switch", tags: ["capture"], status: "active" },
        truncated: false,
      });
      expect(note["body"]).toBe(ALPHA.slice(ALPHA.indexOf("# Alpha")));
      expect(note["revision"]).toBe(await noteRevision(root, "notes/alpha"));
      expect(note["revision"]).toBe(revisionFor(await readFile(join(root, "notes", "alpha.md"))));
      const plain = await ok("get_note", { id: "notes/plain" });
      expect(plain["frontmatter"]).toEqual({});
      expect(plain["body"]).toBe("Plain note without frontmatter.\n");
    });
  });

  test("get_note accepts a note saved with a byte order mark", async () => {
    await withCatalog(async ({ ok, root }) => {
      await writeFile(join(root, "notes", "bom.md"), `﻿${BETA}`, "utf8");
      const note = await ok("get_note", { id: "notes/bom" });
      expect(note["revision"]).toBe(await noteRevision(root, "notes/bom"));
      expect(note["frontmatter"]).toMatchObject({ title: "Beta Relay" });
    });
  });

  test("get_note retries once when the note changes during the read", async () => {
    const changed = BETA.replace("Beta relays", "Beta now relays");
    await withCatalog(async ({ ok, root, scans }) => {
      const note = await ok("get_note", { id: "notes/beta" });
      expect(scans()).toBe(2);
      expect(note["body"]).toBe("Beta now relays the alpha signal. [[notes/alpha]]\n");
      expect(note["revision"]).toBe(await noteRevision(root, "notes/beta"));
    }, {
      afterScan: async (count, root) => {
        if (count === 1) await writeFile(join(root, "notes", "beta.md"), changed, "utf8");
      },
    });
  });

  test("get_note reports missing notes and invalid IDs as tool errors", async () => {
    await withCatalog(async ({ call }) => {
      expect(errorText(await call("get_note", { id: "notes/missing" }))).toContain("notes/missing");
      for (const id of ["../escape", "/abs/path", "notes/a/../b", "notes/alpha.md"]) {
        expect(errorText(await call("get_note", { id }))).toContain("IDs are vault-relative paths without .md");
      }
    });
  });

  test("backlinks and links return bounded neighborhoods", async () => {
    await withCatalog(async ({ ok }) => {
      const backlinks = await ok("backlinks", { id: "notes/alpha" });
      expect(backlinks["direction"]).toBe("in");
      expect((backlinks["nodes"] as readonly { id: string }[]).map(({ id }) => id)).toContain("notes/beta");
      const links = await ok("links", { id: "notes/alpha", direction: "out", depth: 2, limit: 5 });
      expect(links).toMatchObject({ direction: "out", depth: 2, limit: 5 });
      expect((links["nodes"] as readonly { id: string }[]).map(({ id }) => id)).toContain("notes/beta");
      const both = await ok("links", { id: "notes/alpha" });
      expect(both["direction"]).toBe("both");
    });
  });

  test("argument errors name the field", async () => {
    await withCatalog(async ({ call }) => {
      expect(errorText(await call("search", { query: "x", extra: true }))).toContain("\"extra\"");
      expect(errorText(await call("search", {}))).toContain("\"query\"");
      expect(errorText(await call("search", { query: 7 }))).toContain("\"query\"");
      expect(errorText(await call("search", { query: "x", limit: 101 }))).toContain("\"limit\"");
      expect(errorText(await call("search", { query: "x", limit: 1.5 }))).toContain("\"limit\"");
      expect(errorText(await call("search", { query: "x", mode: "fuzzy" }))).toContain("\"mode\"");
      expect(errorText(await call("list_notes", { sort: "size" }))).toContain("\"sort\"");
      expect(errorText(await call("list_notes", { where: [{ path: "a" }] }))).toContain("where[0]");
      expect(errorText(await call("list_notes", { scope: Array.from({ length: 17 }, () => "s") }))).toContain("\"scope\"");
      expect(errorText(await call("links", { id: "notes/alpha", depth: 11 }))).toContain("\"depth\"");
      expect(errorText(await call("links", { id: "notes/alpha", direction: "sideways" }))).toContain("\"direction\"");
    });
  });

  test("the session cache rescans only after a Markdown file changes", async () => {
    await withCatalog(async ({ ok, root, scans }) => {
      await ok("list_notes");
      await ok("get_note", { id: "notes/alpha" });
      await ok("search", { query: "alpha", mode: "exact" });
      expect(scans()).toBe(1);
      await writeFile(join(root, "notes", "gamma.md"), "# Gamma\n\nNew note.\n", "utf8");
      const listed = await ok("list_notes");
      expect(scans()).toBe(2);
      expect(listed["total"]).toBe(4);
      await writeFile(join(root, "notes", "gamma.md"), "# Gamma\n\nEdited note.\n", "utf8");
      const note = await ok("get_note", { id: "notes/gamma" });
      expect(note["body"]).toBe("# Gamma\n\nEdited note.\n");
      expect(scans()).toBe(3);
    });
  });
});

describe("serverInstructions", () => {
  test("names the root and the write mode", () => {
    const writable = serverInstructions({ root: "/vault", readOnly: false });
    expect(writable).toContain("/vault");
    expect(writable).toContain("expected_revision");
    expect(serverInstructions({ root: "/vault", readOnly: true })).toContain("read-only");
  });
});

describe("fitResult", () => {
  test("returns a value that fits unchanged", () => {
    const value = { items: [1, 2, 3], truncated: false };
    expect(fitResult(value, [{ kind: "list", field: "items" }])).toBe(value);
  });

  test("clears a field after lists are exhausted", () => {
    const value = { items: ["x".repeat(50)], graph: { big: "y".repeat(200) }, truncated: false };
    const fitted = fitResult(value, [{ kind: "list", field: "items" }, { kind: "clear", field: "graph", empty: null }], 150);
    expect(fitted).toMatchObject({ graph: null, truncated: true });
  });

  test("throws when nothing trimmable is left", () => {
    expect(() => fitResult({ text: "z".repeat(500), items: [] }, [{ kind: "list", field: "items" }], 100))
      .toThrow(ResultTooLargeError);
  });

  test("skips an item too large to fit and keeps filling from later items", () => {
    const value = { items: ["small-1", "x".repeat(500), "small-2", "small-3"], truncated: false };
    const fitted = fitResult(value, [{ kind: "list", field: "items" }], 200);
    expect(fitted).toEqual({ items: ["small-1", "small-2", "small-3"], truncated: true, omitted: 1 });
  });

  test("property: output fits, keeps items in order, and marks truncation exactly when items drop", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 40 }), { maxLength: 60 }),
        fc.array(fc.string({ maxLength: 40 }), { maxLength: 60 }),
        fc.integer({ min: 64, max: 4_000 }),
        (first, second, maxBytes) => {
          const value = { first, second, truncated: false };
          let fitted: Readonly<Record<string, unknown>>;
          try {
            fitted = fitResult(value, [{ kind: "list", field: "first" }, { kind: "list", field: "second" }], maxBytes);
          } catch (error) {
            expect(error).toBeInstanceOf(ResultTooLargeError);
            return;
          }
          expect(Buffer.byteLength(JSON.stringify(fitted), "utf8")).toBeLessThanOrEqual(maxBytes);
          const keptFirst = fitted["first"] as readonly string[];
          const keptSecond = fitted["second"] as readonly string[];
          const inOrder = (kept: readonly string[], list: readonly string[]) => {
            let cursor = 0;
            for (const item of kept) {
              while (cursor < list.length && list[cursor] !== item) cursor += 1;
              if (cursor === list.length) return false;
              cursor += 1;
            }
            return true;
          };
          expect(inOrder(keptFirst, first)).toBe(true);
          expect(inOrder(keptSecond, second)).toBe(true);
          const dropped = first.length - keptFirst.length + second.length - keptSecond.length;
          expect(fitted["truncated"]).toBe(dropped > 0);
          expect(fitted["omitted"]).toBe(dropped > 0 ? dropped : undefined);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("the default cap is 64 KiB", () => {
    const items = Array.from({ length: 2_000 }, (_, index) => `item-${index}-${"w".repeat(40)}`);
    const fitted = fitResult({ items, truncated: false }, [{ kind: "list", field: "items" }]);
    expect(Buffer.byteLength(JSON.stringify(fitted), "utf8")).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
    expect(fitted["truncated"]).toBe(true);
  });
});

describe("fitBody", () => {
  test("property: output fits and the body is a code-point prefix", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 400 }), fc.integer({ min: 80, max: 2_000 }), (body, maxBytes) => {
        const value = { id: "notes/a", body, truncated: false };
        const fitted = fitBody(value, maxBytes);
        expect(Buffer.byteLength(JSON.stringify(fitted), "utf8")).toBeLessThanOrEqual(maxBytes);
        expect(body.startsWith(fitted.body)).toBe(true);
        expect(Buffer.from(fitted.body, "utf8").toString("utf8")).toBe(fitted.body);
        expect(fitted.truncated).toBe(fitted.body.length < body.length);
      }),
      { numRuns: 100 },
    );
  });
});

describe("metadataFilters", () => {
  test("property: any input either fails as an argument error or yields scalar filters", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (where, hasPaths) => {
        let filters;
        try {
          filters = metadataFilters({ where, has: hasPaths });
        } catch (error) {
          expect(error).toBeInstanceOf(ToolArgumentError);
          return;
        }
        for (const filter of filters) {
          expect(["equals", "exists"]).toContain(filter.kind);
          expect(typeof filter.path).toBe("string");
          if (filter.kind === "equals") {
            expect(["string", "number", "boolean"].includes(typeof filter.value) || filter.value === null).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

const WRITE_TOOLS = ["create_note", "update_note_body", "add_relation"];

describe("write tools and listings", () => {
  test("listings follow --read-only and --repo", async () => {
    await withCatalog(async ({ catalog, call }) => {
      expect(catalog.tools.map(({ name }) => name)).toEqual([
        "search", "list_notes", "get_note", "backlinks", "links", ...WRITE_TOOLS,
      ]);
      expect(errorText(await call("context", { path: "." }))).toContain("Unknown tool: context");
    });
    await withCatalog(async ({ catalog, call }) => {
      expect(catalog.tools.map(({ name }) => name)).toEqual(["search", "context", "list_notes", "get_note", "backlinks", "links"]);
      expect(errorText(await call("create_note", { id: "notes/x", title: "X" }))).toContain("Unknown tool: create_note");
    }, { readOnly: true, repository: "/repository", context: async () => ({}) });
  });

  test("write tools carry closed-world write annotations", async () => {
    await withCatalog(async ({ catalog }) => {
      const annotations = new Map(catalog.tools.map(({ name, annotations: value }) => [name, value]));
      expect(annotations.get("create_note")).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
      expect(annotations.get("update_note_body")).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false });
      expect(annotations.get("add_relation")).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    });
  });

  test("create_note writes a new note, never overwrites, and refreshes reads", async () => {
    await withCatalog(async ({ ok, call, root, scans }) => {
      await ok("list_notes");
      const created = await ok("create_note", { id: "notes/decision", title: "Decision", tags: ["plan"], body: "We chose local stdio." });
      expect(created).toMatchObject({ changed: true, path: "notes/decision.md" });
      const note = await ok("get_note", { id: "notes/decision" });
      expect(note).toMatchObject({ title: "Decision", frontmatter: { title: "Decision", type: "note", tags: ["plan"] } });
      expect(note["body"]).toBe("We chose local stdio.\n");
      expect(note["revision"]).toBe(created["revision"]);
      expect(scans()).toBe(2);
      const before = await readFile(join(root, "notes", "decision.md"));
      const again = errorText(await call("create_note", { id: "notes/decision", title: "Decision", body: "Replaced." }));
      expect(again).toContain("already exists at notes/decision.md");
      expect(await readFile(join(root, "notes", "decision.md"))).toEqual(before);
      const compatible = errorText(await call("create_note", { id: "notes/decision", title: "Decision", tags: ["plan"], body: "We chose local stdio." }));
      expect(compatible).toContain("already exists at notes/decision.md");
      expect(await readFile(join(root, "notes", "decision.md"))).toEqual(before);
      expect(errorText(await call("create_note", { id: "missing/child", title: "Child" })))
        .toContain("create_note does not create directories");
    });
  });

  test("create_note refuses IDs outside the vault", async () => {
    await withCatalog(async ({ call, temporary }) => {
      for (const id of ["../x", "/abs", "notes/../x", "notes/./x", "x.md", ""]) {
        errorText(await call("create_note", { id, title: "Escape" }));
      }
      expect(await readdir(temporary)).toEqual(["kb"]);
    });
  });

  test("update_note_body round-trips, detects conflicts, and validates revisions", async () => {
    await withCatalog(async ({ ok, call, root }) => {
      const note = await ok("get_note", { id: "notes/alpha" });
      const same = await ok("update_note_body", { id: "notes/alpha", body: note["body"], expected_revision: note["revision"] });
      expect(same).toMatchObject({ changed: false, revision: note["revision"] });
      const changed = await ok("update_note_body", { id: "notes/alpha", body: "New body.\n", expected_revision: note["revision"] });
      expect(changed["changed"]).toBe(true);
      expect(changed["revision"]).toBe(await noteRevision(root, "notes/alpha"));
      const reread = await ok("get_note", { id: "notes/alpha" });
      expect(reread).toMatchObject({ body: "New body.\n", frontmatter: { title: "Alpha Switch" }, revision: changed["revision"] });
      const beforeStale = await readFile(join(root, "notes", "alpha.md"));
      const stale = errorText(await call("update_note_body", { id: "notes/alpha", body: "Lost.", expected_revision: note["revision"] }));
      expect(stale).toContain(`revision conflict: expected ${String(note["revision"])}, current ${String(changed["revision"])}`);
      expect(await readFile(join(root, "notes", "alpha.md"))).toEqual(beforeStale);
      expect(errorText(await call("update_note_body", { id: "notes/alpha", body: "x", expected_revision: "sha256:abc" })))
        .toContain("\"expected_revision\"");
      expect(errorText(await call("update_note_body", { id: "notes/alpha", body: "x" }))).toContain("\"expected_revision\"");
    });
  });

  test("add_relation is idempotent", async () => {
    await withCatalog(async ({ ok }) => {
      const first = await ok("add_relation", { source: "notes/alpha", predicate: "supports", target: "notes/beta" });
      expect(first["changed"]).toBe(true);
      const second = await ok("add_relation", { source: "notes/alpha", predicate: "supports", target: "notes/beta" });
      expect(second).toMatchObject({ changed: false, revision: first["revision"] });
      const links = await ok("links", { id: "notes/alpha", direction: "out" });
      expect((links["relations"] as readonly unknown[]).length).toBeGreaterThan(0);
    });
  });

  test("add_relation refuses a stale revision and leaves the source unchanged", async () => {
    await withCatalog(async ({ ok, call, root }) => {
      const note = await ok("get_note", { id: "notes/alpha" });
      await ok("update_note_body", { id: "notes/alpha", body: "Changed.\n", expected_revision: note["revision"] });
      const before = await readFile(join(root, "notes", "alpha.md"));
      const stale = errorText(await call("add_relation", {
        source: "notes/alpha",
        predicate: "supports",
        target: "notes/beta",
        expected_revision: note["revision"],
      }));
      expect(stale).toContain(`revision conflict: expected ${String(note["revision"])}`);
      expect(await readFile(join(root, "notes", "alpha.md"))).toEqual(before);
    });
  });

  test("write tools and get_note name a missing note", async () => {
    await withCatalog(async ({ call, root }) => {
      const alpha = await readFile(join(root, "notes", "alpha.md"));
      expect(errorText(await call("update_note_body", { id: "notes/ghost", body: "x", expected_revision: revisionFor(new Uint8Array()) })))
        .toBe("note notes/ghost was not found");
      expect(errorText(await call("update_note_body", { id: "absent/ghost", body: "x", expected_revision: revisionFor(new Uint8Array()) })))
        .toBe("note absent/ghost was not found");
      expect(errorText(await call("add_relation", { source: "notes/ghost", predicate: "supports", target: "notes/beta" })))
        .toBe("note notes/ghost was not found");
      expect(errorText(await call("add_relation", { source: "notes/alpha", predicate: "supports", target: "notes/missing-note" })))
        .toBe("note notes/missing-note was not found");
      expect(await readFile(join(root, "notes", "alpha.md"))).toEqual(alpha);
      expect((await readdir(join(root, "notes"))).sort()).toEqual(["alpha.md", "beta.md", "plain.md"]);
      // A basename the session resolves is named as a suggestion, not read.
      expect(errorText(await call("get_note", { id: "alpha" }))).toBe("note alpha was not found; did you mean notes/alpha?");
    });
  });

  test("a failed session close after a write still reports the write", async () => {
    type SemanticOpener = NonNullable<KnowledgeBaseDependencies["openSemanticSearchSession"]>;
    let closes = 0;
    const warnings: string[] = [];
    const openSemanticSearchSession: SemanticOpener = async (options) => ({
      root: options.root,
      database: "fake",
      model: "fake",
      update: {},
      search: async () => { throw new Error("qmd search failed"); },
      close: async () => {
        closes += 1;
        throw new Error("qmd store close failed");
      },
    }) as unknown as Awaited<ReturnType<SemanticOpener>>;
    await withCatalog(async ({ ok, root }) => {
      await ok("search", { query: "Alpha", mode: "hybrid" });
      const created = await ok("create_note", { id: "notes/gamma", title: "Gamma" });
      expect(created["changed"]).toBe(true);
      expect(closes).toBe(1);
      expect(warnings).toEqual(["warning: closing the cached vault session failed: qmd store close failed"]);
      const note = await ok("get_note", { id: "notes/gamma" });
      await ok("search", { query: "Alpha", mode: "hybrid" });
      const updated = await ok("update_note_body", { id: "notes/gamma", body: "Body.\n", expected_revision: note["revision"] });
      expect(updated["revision"]).toBe(await noteRevision(root, "notes/gamma"));
      expect(closes).toBe(2);
    }, { dependencies: { openSemanticSearchSession }, warn: (message) => { warnings.push(message); } });
  });

  test("get_note shortens a large body within the cap and refuses frontmatter that does not fit", async () => {
    await withCatalog(async ({ ok, call, root }) => {
      await writeFile(join(root, "notes", "huge.md"), `---\ntitle: Huge\n---\n\n${"line of text\n".repeat(20_000)}`, "utf8");
      const huge = await call("get_note", { id: "notes/huge" });
      expect(huge.isError).toBeUndefined();
      // The documented bound: the structured value fits 64 KiB and the text block repeats it.
      const structured = JSON.stringify(huge.structuredContent);
      expect(Buffer.byteLength(structured, "utf8")).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
      expect(huge.content[0]?.text).toBe(structured);
      const view = await ok("get_note", { id: "notes/huge" });
      expect(view["truncated"]).toBe(true);
      expect(view["frontmatter"]).toEqual({ title: "Huge" });
      expect((view["body"] as string).startsWith("line of text\n")).toBe(true);
      await writeFile(join(root, "notes", "wide.md"), `---\ntitle: Wide\nblob: ${"x".repeat(70_000)}\n---\n\nBody.\n`, "utf8");
      expect(errorText(await call("get_note", { id: "notes/wide" }))).toContain("frontmatter did not fit");
    });
  });

  test("one oversized note does not hide the others from list_notes or search", async () => {
    await withCatalog(async ({ ok, call, root }) => {
      await writeFile(
        join(root, "notes", "a-big.md"),
        `---\ntitle: Big\nblob: ${"x".repeat(70_000)}\n---\n\nThe exact identifier also appears here.\n`,
        "utf8",
      );
      const listed = await ok("list_notes");
      expect((listed["notes"] as readonly { id: string }[]).map(({ id }) => id)).toEqual([
        "notes/alpha",
        "notes/beta",
        "notes/plain",
      ]);
      expect(listed).toMatchObject({ total: 4, truncated: true, omitted: 1 });
      const found = await ok("search", { query: "exact identifier", mode: "exact" });
      const ids = (found["results"] as readonly { id: string }[]).map(({ id }) => id);
      expect(ids).toContain("notes/alpha");
      expect(ids).not.toContain("notes/a-big");
      expect(found).toMatchObject({ truncated: true, omitted: 1 });
      for (const result of [await call("list_notes"), await call("search", { query: "exact identifier", mode: "exact" })]) {
        expect(Buffer.byteLength(JSON.stringify(result.structuredContent), "utf8")).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
      }
    });
  });

  test("context runs the injected builder on the cached scan and fits its payload", async () => {
    const requests: ContextRequest[] = [];
    await withCatalog(async ({ ok, call }) => {
      const result = await ok("context", { path: "src/index.ts" });
      expect(requests).toEqual([{ repositoryRoot: "/repository", target: "src/index.ts", targetKind: "auto" }]);
      expect(result["truncated"]).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
      expect(errorText(await call("context", { path: "src", kind: "folder" }))).toContain("\"kind\"");
    }, {
      repository: "/repository",
      context: async (snapshot, request) => {
        requests.push(request);
        expect(snapshot.notes.length).toBeGreaterThan(0);
        return {
          contexts: Array.from({ length: 2_000 }, (_, index) => ({ id: `notes/${index}`, summary: "s".repeat(64) })),
          guides: [],
          issues: [],
          records: { groups: {} },
        };
      },
    });
  });

  test("property: create_note either refuses an ID or writes inside the vault", async () => {
    const segment = fc.oneof(
      fc.constantFrom("..", ".", "", "notes", "a", "b.md", "~", "\\", "\u0000", "C:"),
      fc.string({ maxLength: 6 }),
    );
    const idArbitrary = fc.oneof(
      fc.array(segment, { minLength: 1, maxLength: 4 }).map((parts) => parts.join("/")),
      fc.string({ maxLength: 12 }),
    );
    await withCatalog(async ({ call, root, temporary }) => {
      await fc.assert(
        fc.asyncProperty(idArbitrary, async (id) => {
          const result = await call("create_note", { id, title: "Property" });
          if (result.isError === true) return;
          const path = String(result.structuredContent?.["path"]);
          const real = await realpath(join(root, path));
          expect(real.startsWith(`${root}${sep}`)).toBe(true);
          expect(dirname(real).startsWith(root)).toBe(true);
        }),
        { numRuns: 100 },
      );
      expect(await readdir(temporary)).toEqual(["kb"]);
    });
  });
});
