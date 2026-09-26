/**
 * Tests for the supermemory importer. Fixtures under src/fixtures/supermemory/
 * follow the list-documents and memory-entry schemas documented at
 * https://supermemory.ai/docs (checked 2026-09-26). No API key was available,
 * so they are built from the documented schema and the docs' example item,
 * not recorded from the live service. Tests never call the network.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { frontmatter, renderCreatedNote, revisionFor } from "./authoring-model.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listNoteRelations } from "./authoring.js";
import { discoverSavedUrlRecords } from "./clip/url-metadata.js";
import { main } from "./cli.js";
import {
  applyImportPlan,
  type ExistingNote,
  flatMetadata,
  importSupermemory,
  importDigest,
  ImportFileError,
  type ImportDocument,
  type ImportItem,
  type ImportPlan,
  type ImportMemory,
  MAX_IMPORT_ITEMS,
  MAX_JSON_DEPTH,
  MAX_METADATA_KEYS,
  MAX_TITLE_CHARS,
  parseExportText,
  parseStrictTimestamp,
  type PlannedCreate,
  type PlannedItem,
  planImport,
  provenanceLine,
  localImportedText,
  occupancyKey,
  type RawItem,
  readExportFile,
  slugFor,
  titleFor,
  type Validated,
  validateDocument,
  validateMemoryEntry,
  validateRawItem,
} from "./import-supermemory.js";
import { scanVault } from "./vault.js";

const FIXTURES = join(import.meta.dir, "fixtures", "supermemory");

async function fixtureItems(name: string): Promise<readonly RawItem[]> {
  const text = await readExportFile(join(FIXTURES, name), name);
  return parseExportText(text, name);
}

function accepted<T>(result: Validated<T> | undefined): T {
  if (result === undefined || !result.ok) {
    throw new Error(`expected an accepted item, got ${JSON.stringify(result)}`);
  }
  return result.item;
}

function rejectedReasons<T>(result: Validated<T> | undefined): readonly string[] {
  if (result === undefined || result.ok) {
    throw new Error(`expected a rejected item, got ${JSON.stringify(result)}`);
  }
  return result.rejection.reasons;
}

function documentRow(overrides: Record<string, unknown> = {}): RawItem {
  return {
    file: "inline.json",
    pointer: "/memories/0",
    kind: "document",
    value: {
      id: "Inl1aaaaaaaaaaaaaaaaaa",
      title: "Inline",
      summary: "Inline summary.",
      type: "text",
      status: "done",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
      ...overrides,
    },
  };
}

function memoryRow(overrides: Record<string, unknown> = {}): RawItem {
  return {
    file: "memories.json",
    pointer: "/memoryEntries/0",
    kind: "memory",
    value: {
      id: "mem_latest",
      memory: "Prefers dark roast coffee.\nSecond line.",
      version: 3,
      isLatest: true,
      isForgotten: false,
      isStatic: false,
      isInference: null,
      createdAt: "2025-09-01T10:00:00Z",
      updatedAt: "2025-09-03T10:00:00Z",
      spaceId: "space_1",
      orgId: "org_1",
      sourceCount: 2,
      parentMemoryId: "mem_v2",
      rootMemoryId: "mem_v1",
      forgetAfter: null,
      forgetReason: null,
      metadata: { confidence: 0.9 },
      memoryRelations: null,
      temporalContext: null,
      history: [
        {
          id: "mem_v2",
          memory: "Prefers medium roast coffee.",
          version: 2,
          createdAt: "2025-09-01T10:00:00Z",
          updatedAt: "2025-09-02T10:00:00Z",
          parentMemoryId: "mem_v1",
          rootMemoryId: "mem_v1",
          isLatest: false,
          isForgotten: false,
        },
        {
          id: "mem_v1",
          memory: "Prefers light roast coffee.",
          version: 1,
          createdAt: "2025-09-01T10:00:00Z",
          updatedAt: "2025-09-01T10:00:00Z",
          parentMemoryId: null,
          rootMemoryId: null,
          isLatest: false,
          isForgotten: false,
        },
      ],
      documentIds: ["acxV5LHMEsG2hMSNb4umbn", "bad id!"],
      ...overrides,
    },
  };
}

function expectFileError(run: () => unknown, file: string, pointer: string, reason: RegExp): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ImportFileError);
  const error = caught as ImportFileError;
  expect(error.file).toBe(file);
  expect(error.pointer).toBe(pointer);
  expect(error.message).toMatch(reason);
}

describe("supermemory export parsing", () => {
  test("a list-documents page yields document rows with pointers", async () => {
    const items = await fixtureItems("single-page.json");
    expect(items.map((item) => [item.pointer, item.kind])).toEqual([
      ["/memories/0", "document"],
      ["/memories/1", "document"],
      ["/memories/2", "document"],
    ]);
    expect(items.every((item) => item.file === "single-page.json")).toBe(true);
  });

  test("an array of pages keeps page indexes in pointers", async () => {
    const items = await fixtureItems("multi-page.json");
    expect(items.map((item) => item.pointer)).toEqual(["/0/memories/0", "/1/memories/0"]);
  });

  test("bare items and a documents wrapper are accepted", async () => {
    expect((await fixtureItems("bare-items.json")).map((item) => [item.pointer, item.kind])).toEqual([
      ["/0", "document"],
      ["/1", "document"],
    ]);
    expect((await fixtureItems("documents-wrapper.json")).map((item) => item.pointer)).toEqual([
      "/documents/0",
    ]);
  });

  test("memory-entry pages and bare memory entries are memory rows", () => {
    const page = parseExportText(JSON.stringify({ memoryEntries: [{ memory: "x", version: 1 }], pagination: {} }), "m.json");
    expect(page.map((item) => [item.pointer, item.kind])).toEqual([["/memoryEntries/0", "memory"]]);
    const bare = parseExportText(JSON.stringify([{ memory: "x", version: 1 }, { id: "d" }]), "b.json");
    expect(bare.map((item) => item.kind)).toEqual(["memory", "document"]);
    const empty = parseExportText("[]", "e.json");
    expect(empty).toEqual([]);
  });

  test("a leading byte order mark is ignored", () => {
    expect(parseExportText(`\uFEFF{"documents":[]}`, "bom.json")).toEqual([]);
  });

  test("file-level problems name the file and a JSON Pointer", () => {
    expectFileError(() => parseExportText("{not json", "bad.json"), "bad.json", "", /^bad\.json: not valid JSON/u);
    expectFileError(
      () => parseExportText(JSON.stringify({ items: [] }), "shape.json"),
      "shape.json",
      "",
      /unknown export shape/u,
    );
    expectFileError(() => parseExportText("42", "scalar.json"), "scalar.json", "", /unknown export shape/u);
    expectFileError(
      () => parseExportText(JSON.stringify({ memories: [], documents: 5 }), "page.json"),
      "page.json",
      "/documents",
      /^page\.json#\/documents: documents must be an array/u,
    );
    expectFileError(
      () => parseExportText(JSON.stringify([{ memories: [], pagination: [] }]), "pages.json"),
      "pages.json",
      "/0/pagination",
      /pagination must be an object/u,
    );
  });

  test("nesting deeper than the bound is refused before parsing", () => {
    const deep = `${"[".repeat(MAX_JSON_DEPTH + 1)}${"]".repeat(MAX_JSON_DEPTH + 1)}`;
    expectFileError(() => parseExportText(deep, "deep.json"), "deep.json", "", /nesting exceeds 32 levels/u);
    const limit = `${"[".repeat(MAX_JSON_DEPTH)}${"]".repeat(MAX_JSON_DEPTH)}`;
    expect(parseExportText(limit, "limit.json")).toHaveLength(1);
    const quoted = JSON.stringify({ documents: [{ title: "[".repeat(100) + "\\\"{{{{" }] });
    expect(parseExportText(quoted, "quoted.json")).toHaveLength(1);
  });

  test("more rows than the item bound is a file error at the first extra row", () => {
    const text = `[${Array.from({ length: MAX_IMPORT_ITEMS + 1 }, () => "{}").join(",")}]`;
    expectFileError(
      () => parseExportText(text, "many.json"),
      "many.json",
      `/${MAX_IMPORT_ITEMS}`,
      /more than 10000 items/u,
    );
  });

  test("the bounded reader refuses oversized, non-UTF-8, and missing files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wordcell-import-read-"));
    try {
      const big = join(directory, "big.json");
      await writeFile(big, "[" + " ".repeat(64) + "]");
      await expect(readExportFile(big, "big.json", 16)).rejects.toThrow(
        "big.json: export file exceeds the 16-byte limit",
      );
      expect(await readExportFile(big, "big.json", 66)).toBe("[" + " ".repeat(64) + "]");
      const binary = join(directory, "binary.json");
      await writeFile(binary, new Uint8Array([0x5b, 0xff, 0x5d]));
      await expect(readExportFile(binary, "binary.json")).rejects.toThrow("binary.json: export file is not valid UTF-8");
      await expect(readExportFile(join(directory, "missing.json"), "missing.json")).rejects.toBeInstanceOf(
        ImportFileError,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("supermemory document validation", () => {
  test("the single-page fixture keeps ids, custom ids, timestamps, and container tags", async () => {
    const [first, second, third] = (await fixtureItems("single-page.json")).map(validateDocument).map(accepted);
    expect(first).toEqual({
      kind: "document",
      file: "single-page.json",
      pointer: "/memories/0",
      externalId: "acxV5LHMEsG2hMSNb4umbn",
      title: "API Rate Limiting Policy",
      slug: "api-rate-limiting-policy",
      supermemoryType: "text",
      status: "done",
      containerTags: ["user_42"],
      created: "2025-04-15T09:30:00.000Z",
      updated: "2025-04-15T09:31:00.000Z",
      metadata: { reviewed: true, revision: 3, team: "platform" },
      text: "# API Rate Limiting Policy\n\nEach API key may send 100 requests per minute.\nBursts above the limit return HTTP 429 with a Retry-After header.",
      diagnostics: [],
    } satisfies ImportDocument);
    expect(Object.keys(first?.metadata ?? {})).toEqual(["reviewed", "revision", "team"]);
    expect(second).toMatchObject({
      externalId: "Q7pLm2Xc9RtB4vNw8KsJ1a",
      customId: "handbook-onboarding",
      slug: "handbook-onboarding",
      connectionId: "conn_gdrive_8f2k",
      filepath: "/Handbook/Onboarding.gdoc",
      url: "https://docs.google.com/document/d/1AbCdEf/edit",
      supermemoryType: "google_doc",
      containerTags: ["user_42", "project:handbook"],
      created: "2025-05-02T12:05:10.250Z",
      updated: "2025-06-11T08:00:00.000Z",
      text: "How new engineers get access, pick a first issue, and ship in week one.",
    });
    expect(third).toMatchObject({ title: "Zr8TqW3nHc6YpD1fGk5LmV", slug: "zr8tqw3nhc6ypd1fgk5lmv", status: "queued" });
    expect(third?.metadata).toBeUndefined();
  });

  test("malformed rows are rejected individually and name the field", async () => {
    const results = (await fixtureItems("malformed-row.json")).map(validateDocument);
    expect(accepted(results[0]).externalId).toBe("Mr1fffffffffffffffffff");
    expect(rejectedReasons(results[1])).toEqual(["id: missing"]);
    expect(rejectedReasons(results[2])).toEqual([
      "createdAt: expected an RFC 3339 timestamp with an offset",
      "updatedAt: expected an RFC 3339 timestamp with an offset",
    ]);
    const third = results[2];
    expect(third?.ok === false ? third.rejection : undefined).toMatchObject({
      file: "malformed-row.json",
      pointer: "/memories/2",
      externalId: "Mr3hhhhhhhhhhhhhhhhhhh",
    });
    expect(rejectedReasons(results[3])).toEqual(["title: expected a string or null"]);
    expect(rejectedReasons(results[4])).toEqual(["empty body: no non-blank content or summary"]);
    expect(rejectedReasons(results[5])).toEqual(["expected an object"]);
  });

  test("nested metadata keeps flat values and reports each dropped key", async () => {
    const [item] = (await fixtureItems("nested-metadata.json")).map(validateDocument).map(accepted);
    expect(item?.metadata).toEqual({ "channel.id": "C024BE91L", pinned: false, priority: 2, source: "slack" });
    expect(item?.diagnostics).toEqual([
      "metadata.author is a nested value; dropped",
      'metadata key "bad key" is not a safe key; dropped',
      "metadata.labels is a nested value; dropped",
    ]);
  });

  test("duplicate titles and custom ids produce the same base slug", async () => {
    const slugs = (await fixtureItems("duplicate-slug.json")).map(validateDocument).map(accepted).map((item) => item.slug);
    expect(slugs).toEqual(["meeting-notes", "meeting-notes", "meeting-notes"]);
  });

  test("strings that cannot reach a note are rejected by field", () => {
    expect(rejectedReasons(validateDocument(documentRow({ customId: "a\u0007b" })))).toEqual([
      "customId: contains control characters",
    ]);
    expect(rejectedReasons(validateDocument(documentRow({ summary: "bad \ud800 text" })))).toEqual([
      "summary: is not well-formed Unicode",
    ]);
    expect(rejectedReasons(validateDocument(documentRow({ summary: "nul \u0000 text" })))).toEqual([
      "summary: contains a NUL character",
    ]);
    expect(rejectedReasons(validateDocument(documentRow({ customId: "x".repeat(256) })))).toEqual([
      "customId: is longer than 255 characters",
    ]);
    expect(rejectedReasons(validateDocument(documentRow({ id: "has space" })))).toEqual([
      'id: expected an ID of 1 to 128 letters, digits, "_" or "-"',
    ]);
    expect(rejectedReasons(validateDocument(documentRow({ type: "Not Kebab" })))).toEqual([
      "type: expected a lower-case identifier",
    ]);
    expect(rejectedReasons(validateDocument(documentRow({ summary: { text: "x" } })))).toEqual([
      "summary: expected a string or null",
    ]);
  });

  test("undocumented enum values and bad container tags are kept or dropped with diagnostics", () => {
    const item = accepted(
      validateDocument(documentRow({ type: "slack_message", status: "archived", containerTags: ["ok_tag", "bad tag", 7, "ok_tag"] })),
    );
    expect(item.supermemoryType).toBe("slack_message");
    expect(item.status).toBe("archived");
    expect(item.containerTags).toEqual(["ok_tag"]);
    expect(item.diagnostics).toEqual([
      'type "slack_message" is not a documented value',
      'status "archived" is not a documented value',
      "containerTags/1: not a valid container tag; dropped",
      "containerTags/2: not a valid container tag; dropped",
    ]);
  });

  test("blank content falls back to the summary and line endings become LF", () => {
    expect(accepted(validateDocument(documentRow({ content: " \n", summary: "a\r\nb\rc  \n\n" }))).text).toBe("a\nb\nc");
    expect(accepted(validateDocument(documentRow({ content: "body" }))).text).toBe("body");
  });

  test("titles collapse to one bounded line and fall back to the custom id then the id", () => {
    expect(accepted(validateDocument(documentRow({ title: "  a\n\tb  " }))).title).toBe("a b");
    expect(accepted(validateDocument(documentRow({ title: " ", customId: "cid-1" }))).title).toBe("cid-1");
    const long = accepted(validateDocument(documentRow({ title: "é".repeat(500) }))).title;
    expect(Array.from(long)).toHaveLength(MAX_TITLE_CHARS);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("supermemory memory-entry validation", () => {
  test("the latest entry and each history version become separate items", () => {
    const results = validateMemoryEntry(memoryRow());
    const [latest, previous, first] = results.map(accepted);
    expect(latest).toEqual({
      kind: "memory",
      file: "memories.json",
      pointer: "/memoryEntries/0",
      externalId: "mem_latest",
      title: "Prefers dark roast coffee.",
      slug: "prefers-dark-roast-coffee",
      version: 3,
      isLatest: true,
      forgotten: false,
      parentId: "mem_v2",
      rootId: "mem_v1",
      isStatic: false,
      isInference: false,
      sourceDocumentIds: ["acxV5LHMEsG2hMSNb4umbn"],
      created: "2025-09-01T10:00:00.000Z",
      updated: "2025-09-03T10:00:00.000Z",
      metadata: { confidence: 0.9 },
      hasMemoryRelations: false,
      text: "Prefers dark roast coffee.\nSecond line.",
      diagnostics: ["documentIds/1: not a valid ID; dropped"],
    } satisfies ImportMemory);
    expect(previous).toMatchObject({ pointer: "/memoryEntries/0/history/0", externalId: "mem_v2", parentId: "mem_v1", isLatest: false });
    expect(first).toMatchObject({ pointer: "/memoryEntries/0/history/1", externalId: "mem_v1", version: 1 });
    expect(first?.parentId).toBeUndefined();
  });

  test("a bad history version is rejected alone", () => {
    const row = memoryRow();
    const value = row.value as Record<string, unknown>;
    const history = value.history as Record<string, unknown>[];
    const results = validateMemoryEntry({ ...row, value: { ...value, history: [history[0], { ...history[1], version: "one" }] } });
    expect(results.map((result) => result.ok)).toEqual([true, true, false]);
    const bad = results[2];
    expect(bad?.ok === false ? bad.rejection : undefined).toEqual({
      file: "memories.json",
      pointer: "/memoryEntries/0/history/1",
      externalId: "mem_v1",
      reasons: ["version: expected a finite number"],
    });
  });

  test("forgotten flags, relations, and bad forgetAfter values are carried as data", () => {
    const [latest] = validateMemoryEntry(
      memoryRow({ isForgotten: true, memoryRelations: { mem_x: "extends" }, forgetAfter: "tomorrow", history: [] }),
    ).map(accepted);
    expect(latest).toMatchObject({ forgotten: true, hasMemoryRelations: true });
    expect(latest?.forgetAfter).toBeUndefined();
    expect(latest?.diagnostics).toContain("forgetAfter: not a valid timestamp; dropped");
    const [kept] = validateMemoryEntry(memoryRow({ forgetAfter: "2026-01-01T00:00:00+01:00", history: null })).map(accepted);
    expect(kept?.forgetAfter).toBe("2025-12-31T23:00:00.000Z");
  });

  test("validateRawItem dispatches on the row kind", () => {
    expect(validateRawItem(memoryRow())).toHaveLength(3);
    expect(validateRawItem(documentRow())).toHaveLength(1);
    expect(rejectedReasons(validateRawItem(memoryRow({ memory: "  " }))[0])).toEqual([
      "empty body: no non-blank memory",
    ]);
  });
});

describe("strict timestamps", () => {
  test.each([
    ["2025-04-15T09:30:00.000Z", "2025-04-15T09:30:00.000Z"],
    ["2025-04-15T09:30:00Z", "2025-04-15T09:30:00.000Z"],
    ["2025-04-15T11:30:00.123456789+02:00", "2025-04-15T09:30:00.123Z"],
    ["2025-04-15T00:30:00-05:30", "2025-04-15T06:00:00.000Z"],
    ["2024-02-29T00:00:00Z", "2024-02-29T00:00:00.000Z"],
  ])("%s is accepted", (input, expected) => {
    expect(parseStrictTimestamp(input)).toBe(expected);
  });

  test.each([
    "2025-02-29T00:00:00Z",
    "2025-04-31T00:00:00Z",
    "2025-13-01T00:00:00Z",
    "2025-01-01T24:00:00Z",
    "2025-01-01T00:60:00Z",
    "2025-01-01T00:00:60Z",
    "2025-01-01T00:00:00",
    "2025-01-01 00:00:00Z",
    "2025-01-01T00:00:00+24:00",
    "2025-01-01T00:00:00.Z",
    "2025-01-01",
    "",
  ])("%s is refused", (input) => {
    expect(parseStrictTimestamp(input)).toBeUndefined();
  });

  test("non-strings are refused", () => {
    expect(parseStrictTimestamp(1_700_000_000_000)).toBeUndefined();
    expect(parseStrictTimestamp(null)).toBeUndefined();
  });

  test("property: toISOString text round-trips unchanged", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("0000-01-01T00:00:00.000Z"), max: new Date("9999-12-31T23:59:59.999Z"), noInvalidDate: true }),
        (date) => parseStrictTimestamp(date.toISOString()) === date.toISOString(),
      ),
    );
  });

  test("property: any offset spelling of an instant parses to that instant", () => {
    const pad = (value: number): string => String(value).padStart(2, "0");
    fc.assert(
      fc.property(
        fc.date({ min: new Date("0001-01-02T00:00:00.000Z"), max: new Date("9998-12-30T00:00:00.000Z"), noInvalidDate: true }),
        fc.integer({ min: -(23 * 60 + 59), max: 23 * 60 + 59 }),
        (date, offset) => {
          const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 23);
          const magnitude = Math.abs(offset);
          const zone = `${offset < 0 ? "-" : "+"}${pad(Math.floor(magnitude / 60))}:${pad(magnitude % 60)}`;
          return parseStrictTimestamp(`${local}${zone}`) === date.toISOString();
        },
      ),
    );
  });
});

describe("metadata, titles, and slugs", () => {
  const primitive = fc.oneof(
    fc.string({ maxLength: 40 }),
    fc.double(),
    fc.boolean(),
    fc.constant(null),
    fc.array(fc.integer(), { maxLength: 2 }),
    fc.dictionary(fc.string({ maxLength: 4 }), fc.integer(), { maxKeys: 2 }),
  );

  test("property: flat metadata is sorted, flat, bounded, and deterministic", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ maxLength: 70 }), primitive, { maxKeys: 90 }), (input) => {
        const first = flatMetadata(input);
        const second = flatMetadata(structuredClone(input));
        expect(second).toEqual(first);
        const entries = Object.entries(first.value ?? {});
        expect(entries.length).toBeLessThanOrEqual(MAX_METADATA_KEYS);
        // JavaScript enumerates integer-like keys first, so only the rest keep sorted order.
        const keys = entries.map(([key]) => key).filter((key) => !/^(?:0|[1-9]\d*)$/u.test(key));
        expect(keys).toEqual([...keys].sort());
        for (const [key, value] of entries) {
          expect(key).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/u);
          expect(["string", "number", "boolean"]).toContain(typeof value);
          if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
          if (typeof value === "string") expect(value).not.toMatch(/[\u0000-\u001f\u007f]/u);
        }
      }),
    );
  });

  test("property: safe flat metadata is preserved exactly", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.stringMatching(/^[A-Za-z0-9_.:-]{1,20}$/u).filter((key) => key !== "__proto__"),
          fc.oneof(fc.stringMatching(/^[ -~]{0,30}$/u), fc.integer(), fc.boolean()),
          { maxKeys: MAX_METADATA_KEYS },
        ),
        (input) => {
          const { value, diagnostics } = flatMetadata(input);
          expect(diagnostics).toEqual([]);
          expect(value ?? {}).toEqual(input);
        },
      ),
    );
  });

  test("regression: a __proto__ metadata key is dropped, not turned into a prototype", () => {
    const result = flatMetadata(JSON.parse('{"__proto__": 0, "team": "platform"}'));
    expect(result.value).toEqual({ team: "platform" });
    expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
    expect(result.diagnostics).toEqual(['metadata key "__proto__" is not a safe key; dropped']);
  });

  test("non-object metadata is dropped with one diagnostic", () => {
    expect(flatMetadata(["a"])).toEqual({ diagnostics: ["metadata: expected an object; dropped"] });
    expect(flatMetadata(null)).toEqual({ diagnostics: [] });
  });

  test("property: titles are one trimmed bounded line and slugs are deterministic clip slugs", () => {
    fc.assert(
      fc.property(fc.array(fc.option(fc.string({ unit: "grapheme", maxLength: 300 }), { nil: undefined }), { maxLength: 3 }), (candidates) => {
        const title = titleFor(candidates);
        expect(title).not.toBe("");
        expect(title).toBe(title.trim());
        expect(title).not.toMatch(/[\s\p{Cc}]{2}|[\n\r\u2028\u2029]/u);
        expect(Array.from(title).length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
        const slug = slugFor(candidates);
        expect(slugFor([...candidates])).toBe(slug);
        expect(slug).toMatch(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Planning

const NOW = new Date("2026-09-26T12:00:00Z");

function doc(overrides: Record<string, unknown> = {}): Validated<ImportItem> {
  return validateDocument(documentRow(overrides));
}

function planFor(
  items: readonly Validated<ImportItem>[],
  options: { existing?: readonly ExistingNote[]; occupied?: readonly string[]; prefix?: string; now?: Date } = {},
): ImportPlan {
  return planImport({
    items,
    existing: options.existing ?? [],
    occupied: new Set((options.occupied ?? []).map(occupancyKey)),
    ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
    now: options.now ?? NOW,
  });
}

function created(item: PlannedItem | undefined): PlannedCreate {
  if (item?.outcome !== "created" || item.write?.kind !== "create") {
    throw new Error(`expected a created item, got ${JSON.stringify(item)}`);
  }
  return item.write;
}

/** Render a planned create the way createNote writes it and read it back like scanVault. */
function existingFrom(write: PlannedCreate, edit: (content: string) => string = (content) => content): ExistingNote {
  const content = edit(renderCreatedNote(write.input, "doc-fixture", write.fields));
  const path = `${write.input.id}.md`;
  const data = frontmatter(content, path).document.toJS() as Record<string, unknown>;
  return { id: write.input.id, path, content, metadata: data };
}

describe("supermemory import planning", () => {
  test("placement follows type, url, and --prefix", () => {
    const items = [
      doc({ id: "Pl1", title: "Plain text" }),
      doc({ id: "Pl2", title: "Web page", type: "webpage", url: "https://example.com/a" }),
      doc({ id: "Pl3", title: "A PDF", type: "pdf" }),
      doc({ id: "Pl4", title: "Bucket object", url: "s3://bucket/key" }),
      ...validateMemoryEntry(memoryRow({ history: [] })),
    ];
    const plan = planFor(items);
    expect(plan.items.map((item) => [item.note, item.write?.kind === "create" ? item.write.input.type : undefined])).toEqual([
      ["notes/imported/plain-text", "note"],
      ["articles/web-page/web-page", "article"],
      ["articles/a-pdf/a-pdf", "article"],
      ["notes/imported/bucket-object", "note"],
      ["notes/imported/memories/prefers-dark-roast-coffee", "memory"],
    ]);
    expect(created(plan.items[1]).fields).toMatchObject({ source: "https://example.com/a", clipped: "2025-01-01" });
    expect(created(plan.items[3]).fields).toMatchObject({ url: "s3://bucket/key" });
    expect(created(plan.items[3]).fields).not.toHaveProperty("source");
    const prefixed = planFor(items, { prefix: "inbox/supermemory/" });
    expect(prefixed.items.map((item) => item.note)).toEqual([
      "inbox/supermemory/plain-text",
      "inbox/supermemory/web-page",
      "inbox/supermemory/a-pdf",
      "inbox/supermemory/bucket-object",
      "inbox/supermemory/prefers-dark-roast-coffee",
    ]);
    expect(created(prefixed.items[1]).fields).not.toHaveProperty("clipped");
    for (const prefix of ["", "/abs", "../up", "a/./b", ".hidden", "x.md"]) {
      expect(() => planFor(items, { prefix })).toThrow("--prefix must be a vault-relative directory");
    }
  });

  test("fields are written in a fixed order with the fixture's values", async () => {
    const results = (await fixtureItems("single-page.json")).map(validateDocument);
    const plan = planFor(results);
    const second = created(plan.items[1]);
    expect(second.input).toEqual({
      id: "articles/handbook-onboarding/handbook-onboarding",
      title: "Onboarding handbook",
      type: "article",
      body: "How new engineers get access, pick a first issue, and ship in week one.\n\nImported from supermemory export `single-page.json` on 2026-09-26.\n",
    });
    expect(Object.keys(second.fields)).toEqual([
      "imported_from", "external_id", "custom_id", "supermemory_type", "container_tag", "container_tags",
      "source", "connection_id", "filepath", "clipped", "created", "updated", "import_digest",
    ]);
    expect(second.fields).toMatchObject({
      imported_from: "supermemory",
      external_id: "Q7pLm2Xc9RtB4vNw8KsJ1a",
      custom_id: "handbook-onboarding",
      supermemory_type: "google_doc",
      container_tag: "user_42",
      container_tags: ["user_42", "project:handbook"],
      source: "https://docs.google.com/document/d/1AbCdEf/edit",
      connection_id: "conn_gdrive_8f2k",
      filepath: "/Handbook/Onboarding.gdoc",
      clipped: "2025-05-02",
      created: "2025-05-02T12:05:10.250Z",
      updated: "2025-06-11T08:00:00.000Z",
    });
    expect(String(second.fields.import_digest)).toMatch(/^sha256:[0-9a-f]{64}$/u);
    const first = created(plan.items[0]);
    expect(first.input.id).toBe("notes/imported/api-rate-limiting-policy");
    expect(first.fields.metadata).toEqual({ reviewed: true, revision: 3, team: "platform" });
    const queued = plan.items[2];
    expect(created(queued).fields.status).toBe("queued");
    expect(queued?.diagnostics).toEqual(['status is "queued"; the imported text may be incomplete']);
    const memory = created(planFor(validateMemoryEntry(memoryRow({ isStatic: true, history: [] }))).items[0]);
    expect(Object.keys(memory.fields)).toEqual([
      "imported_from", "external_id", "version", "parent_id", "root_id", "is_static", "source_document_ids",
      "created", "updated", "metadata", "import_digest",
    ]);
  });

  test("duplicate slugs get numeric suffixes and avoid occupied IDs case-insensitively", async () => {
    const results = (await fixtureItems("duplicate-slug.json")).map(validateDocument);
    expect(planFor(results).items.map((item) => item.note)).toEqual([
      "notes/imported/meeting-notes",
      "notes/imported/meeting-notes-2",
      "notes/imported/meeting-notes-3",
    ]);
    expect(planFor(results, { occupied: ["notes/imported/Meeting-Notes", "notes/imported/meeting-notes-3"] }).items.map((item) => item.note)).toEqual([
      "notes/imported/meeting-notes-2",
      "notes/imported/meeting-notes-4",
      "notes/imported/meeting-notes-5",
    ]);
    const article = [doc({ id: "Ar1", title: "Saved", type: "webpage", url: "https://example.com" })];
    expect(planFor(article, { occupied: ["articles/saved"] }).items[0]?.note).toBe("articles/saved-2/saved-2");
  });

  test("a repeated external ID keeps the latest update, then the first row", () => {
    const later = planFor([
      doc({ id: "Dup", summary: "old", updatedAt: "2025-01-02T00:00:00Z" }),
      doc({ id: "Dup", summary: "new", updatedAt: "2025-01-03T00:00:00Z" }),
    ]);
    expect(later.items.map((item) => [item.outcome, item.reason])).toEqual([
      ["skipped", "duplicate in export"],
      ["created", undefined],
    ]);
    const tie = planFor([doc({ id: "Dup", summary: "first" }), doc({ id: "Dup", summary: "second" })]);
    expect(tie.items.map((item) => item.outcome)).toEqual(["created", "skipped"]);
  });

  test("rejected rows and forgotten memories are reported, not planned", () => {
    const plan = planFor([
      doc({ createdAt: "yesterday", summary: 5 }),
      ...validateMemoryEntry(memoryRow({ isForgotten: true, history: [] })),
    ]);
    expect(plan.items).toEqual([
      {
        outcome: "rejected",
        file: "inline.json",
        pointer: "/memories/0",
        externalId: "Inl1aaaaaaaaaaaaaaaaaa",
        reason: "createdAt: expected an RFC 3339 timestamp with an offset; summary: expected a string or null",
        diagnostics: [],
      },
      {
        outcome: "skipped",
        file: "memories.json",
        pointer: "/memoryEntries/0",
        externalId: "mem_latest",
        reason: "forgotten",
        diagnostics: ["documentIds/1: not a valid ID; dropped"],
      },
    ]);
  });

  test("existing notes are skipped, updated, or reported as conflicts", () => {
    const original = doc({ id: "Ex1", title: "Policy", summary: "Version one.", status: "queued" });
    const write = created(planFor([original]).items[0]);
    const existing = existingFrom(write);

    const rerun = planFor([original], { existing: [existing], now: new Date("2027-01-01T00:00:00Z") });
    expect(rerun.items[0]).toMatchObject({ outcome: "skipped", reason: "unchanged", note: "notes/imported/policy" });

    const changed = planFor([doc({ id: "Ex1", title: "Policy v2", summary: "Version two.", status: "done" })], { existing: [existing] });
    const update = changed.items[0];
    expect(update?.outcome).toBe("updated");
    if (update?.write?.kind !== "update") throw new Error("expected an update");
    expect(update.write.expectedRevision).toBe(revisionFor(new TextEncoder().encode(existing.content)));
    expect(update.write.body).toBe("Version two.\n\nImported from supermemory export `inline.json` on 2026-09-26.\n");
    expect(update.write.fields).toMatchObject({ title: "Policy v2", status: null, custom_id: null, external_id: "Ex1" });
    expect(update.write.fields.import_digest).not.toBe(write.fields.import_digest);

    const metadataOnly = planFor([doc({ id: "Ex1", title: "Policy", summary: "Version one.", status: "queued", metadata: { team: "x" } })], {
      existing: [existing],
    });
    expect(metadataOnly.items[0]?.outcome).toBe("updated");

    const bodyEdit = existingFrom(write, (content) => content.replace("Version one.", "Version one, edited."));
    expect(planFor([original], { existing: [bodyEdit] }).items[0]).toMatchObject({
      outcome: "conflict",
      reason: "the note was edited after the last import",
    });
    const titleEdit = existingFrom(write, (content) => content.replace("title: Policy", "title: My policy"));
    expect(planFor([original], { existing: [titleEdit] }).items[0]?.outcome).toBe("conflict");
    const tagOnly = existingFrom(write, (content) => content.replace("title: Policy\n", "title: Policy\ntags:\n  - mine\n"));
    expect(planFor([original], { existing: [tagOnly] }).items[0]?.outcome).toBe("skipped");
    const noDigest = existingFrom(write, (content) => content.replace(/import_digest: .*\n/u, ""));
    expect(planFor([original], { existing: [noDigest] }).items[0]).toMatchObject({ outcome: "conflict", reason: "missing import_digest" });

    const moved = { ...existing, id: "notes/archive/policy", path: "notes/archive/policy.md" };
    expect(planFor([original], { existing: [moved] }).items[0]).toMatchObject({ outcome: "skipped", note: "notes/archive/policy" });
    expect(planFor([original], { existing: [existing, moved] }).items[0]).toMatchObject({
      outcome: "conflict",
      reason: "more than one note imports this ID: notes/archive/policy.md, notes/imported/policy.md",
    });
  });

  test("the provenance line and local text helpers are inverse", () => {
    expect(provenanceLine("/tmp/exports/page`1`.json", NOW)).toBe("Imported from supermemory export `page_1_.json` on 2026-09-26.");
    expect(localImportedText("\n\nBody\n\nImported from supermemory export `a.json` on 2026-09-26.\n")).toBe("Body");
    expect(localImportedText("\nBody\n\nImported from supermemory export `a.json` on 2026-09-26. Extra\n")).toBe(
      "Body\n\nImported from supermemory export `a.json` on 2026-09-26. Extra",
    );
    expect(importDigest("T", { b: 1, a: [2], import_digest: "x" }, "t")).toBe(importDigest("T", { a: [2], b: 1 }, "t"));
  });

  const slugAlphabet = fc.constantFrom("Alpha", "alpha", "ALPHA!", "Beta", "beta", "Gamma notes", "", "é");

  test("property: allocation is order-independent, unique, and avoids occupied IDs", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(fc.stringMatching(/^[A-Za-z0-9]{1,8}$/u), slugAlphabet, fc.boolean()), {
          selector: ([id]) => id,
          maxLength: 12,
        }),
        fc.array(fc.constantFrom("notes/imported/alpha", "notes/imported/beta-2", "articles/gamma-notes"), { maxLength: 3 }),
        fc.integer({ min: 0, max: 1_000 }),
        (rows, occupied, seed) => {
          const items = rows.map(([id, title, web]) =>
            doc({ id, title, ...(web ? { type: "webpage", url: "https://example.com/x" } : {}) }),
          );
          const shuffled = [...items].sort((left, right) => {
            const key = (value: Validated<ImportItem>): number =>
              value.ok ? (value.item.externalId.charCodeAt(0) * 31 + seed) % 97 : 0;
            return key(left) - key(right);
          });
          const byId = (plan: ImportPlan): Map<string | undefined, string | undefined> =>
            new Map(plan.items.map((item) => [item.externalId, item.note]));
          const first = byId(planFor(items, { occupied }));
          const second = byId(planFor(shuffled, { occupied }));
          expect(second).toEqual(first);
          const notes = [...first.values()].map((note) => occupancyKey(note ?? ""));
          expect(new Set(notes).size).toBe(notes.length);
          for (const note of notes) expect(occupied.map(occupancyKey)).not.toContain(note);
        },
      ),
    );
  });

  test("property: a rendered note reads back with its own import_digest and is skipped on rerun", () => {
    const text = fc.string({ unit: "grapheme", maxLength: 200 });
    const flat = fc.dictionary(
      fc.stringMatching(/^[A-Za-z0-9_.:-]{1,12}$/u),
      fc.oneof(fc.string({ unit: "grapheme-ascii", maxLength: 20 }), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.integer(), fc.boolean()),
      { maxKeys: 6 },
    );
    fc.assert(
      fc.property(
        text,
        fc.string({ unit: "grapheme", maxLength: 80 }),
        flat,
        fc.array(fc.stringMatching(/^[a-z0-9_:-]{1,10}$/u), { maxLength: 3 }),
        fc.option(fc.stringMatching(/^[ -~]{1,40}$/u), { nil: null }),
        (content, title, metadata, containerTags, customId) => {
          const result = doc({ id: "Prop1", title, content, metadata, containerTags, customId });
          if (!result.ok) return;
          const write = created(planFor([result]).items[0]);
          const existing = existingFrom(write);
          const rerun = planFor([result], { existing: [existing], now: new Date("2030-01-01T00:00:00Z") });
          expect(rerun.items[0]).toMatchObject({ outcome: "skipped", reason: "unchanged" });
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("importSupermemory writes", () => {
  const WRITE_NOW = new Date("2026-09-26T12:00:00.000Z");
  const SINGLE_PAGE = join(FIXTURES, "single-page.json");

  function quiet() {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
      output: { stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value) },
      stdout: () => stdout.join(""),
      stderr: () => stderr.join(""),
    };
  }

  async function withImportVault(run: (vault: string, temporary: string) => Promise<void>): Promise<void> {
    const temporary = await mkdtemp(join(tmpdir(), "wordcell-import-"));
    const vault = join(temporary, "vault");
    try {
      expect(await main(["init", vault], quiet().output)).toBe(0);
      await run(vault, temporary);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  /** Every path under a directory with its kind and bytes, for byte-identity checks. */
  async function tree(directory: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    async function walk(relative: string): Promise<void> {
      const absolute = join(directory, relative);
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) {
        result[relative] = `link:${await readlink(absolute)}`;
      } else if (metadata.isDirectory()) {
        result[relative] = "dir";
        for (const name of (await readdir(absolute)).sort()) await walk(relative === "" ? name : `${relative}/${name}`);
      } else {
        result[relative] = `file:${await readFile(absolute, "utf8")}`;
      }
    }
    await walk("");
    return result;
  }

  async function fields(vault: string, note: string): Promise<Record<string, unknown>> {
    const content = await readFile(join(vault, `${note}.md`), "utf8");
    return frontmatter(content, `${note}.md`).document.toJS() as Record<string, unknown>;
  }

  const importFiles = (vault: string, files: readonly string[], extra: { dryRun?: boolean; prefix?: string } = {}) =>
    importSupermemory({ root: vault, files, now: WRITE_NOW, ...extra });

  test("imports a list-documents page into a vault that refresh and check accept", async () => {
    await withImportVault(async (vault) => {
      const report = await importFiles(vault, [SINGLE_PAGE]);
      expect(report.ok).toBe(true);
      expect(report.counts).toEqual({ created: 3, updated: 0, skipped: 0, conflicts: 0, rejected: 0 });
      const notes = report.items.map((item) => item.note).sort();
      expect(notes).toEqual([
        "articles/handbook-onboarding/handbook-onboarding",
        "notes/imported/api-rate-limiting-policy",
        "notes/imported/zr8tqw3nhc6ypd1fgk5lmv",
      ]);
      expect(report.items.every((item) => item.path === `${item.note}.md`)).toBe(true);

      const article = await fields(vault, "articles/handbook-onboarding/handbook-onboarding");
      expect(article).toMatchObject({
        type: "article",
        title: "Onboarding handbook",
        imported_from: "supermemory",
        external_id: "Q7pLm2Xc9RtB4vNw8KsJ1a",
        custom_id: "handbook-onboarding",
        supermemory_type: "google_doc",
        container_tag: "user_42",
        container_tags: ["user_42", "project:handbook"],
        source: "https://docs.google.com/document/d/1AbCdEf/edit",
        connection_id: "conn_gdrive_8f2k",
        filepath: "/Handbook/Onboarding.gdoc",
        clipped: "2025-05-02",
        created: "2025-05-02T12:05:10.250Z",
        updated: "2025-06-11T08:00:00.000Z",
      });
      expect(String(article.import_digest)).toMatch(/^sha256:[0-9a-f]{64}$/u);
      const policy = await readFile(join(vault, "notes/imported/api-rate-limiting-policy.md"), "utf8");
      expect(policy).toContain("Bursts above the limit return HTTP 429 with a Retry-After header.\n\n"
        + "Imported from supermemory export `single-page.json` on 2026-09-26.\n");
      expect(await fields(vault, "notes/imported/api-rate-limiting-policy")).toMatchObject({
        type: "note",
        created: "2025-04-15T09:30:00.000Z",
        metadata: { reviewed: true, revision: 3, team: "platform" },
      });
      expect(await fields(vault, "notes/imported/zr8tqw3nhc6ypd1fgk5lmv")).toMatchObject({ status: "queued" });

      expect(await main(["refresh", "--root", vault], quiet().output)).toBe(0);
      const check = quiet();
      expect(await main(["check", "--root", vault], check.output)).toBe(0);
      const search = quiet();
      expect(await main(["search", "Retry-After", "--root", vault, "--mode", "exact", "--json"], search.output)).toBe(0);
      expect(search.stdout()).toContain("notes/imported/api-rate-limiting-policy");
      const list = quiet();
      expect(await main(["list", "--root", vault, "--where", "external_id=Q7pLm2Xc9RtB4vNw8KsJ1a", "--json"], list.output))
        .toBe(0);
      expect(list.stdout()).toContain("articles/handbook-onboarding/handbook-onboarding");
      expect(list.stdout()).not.toContain("api-rate-limiting-policy");
    });
  });

  test("a second run reports every item skipped and leaves the tree unchanged", async () => {
    await withImportVault(async (vault) => {
      await importFiles(vault, [SINGLE_PAGE]);
      const before = await tree(vault);
      const report = await importSupermemory({ root: vault, files: [SINGLE_PAGE], now: new Date("2026-10-01T00:00:00Z") });
      expect(report.counts).toEqual({ created: 0, updated: 0, skipped: 3, conflicts: 0, rejected: 0 });
      expect(report.items.every((item) => item.reason === "unchanged")).toBe(true);
      expect(await tree(vault)).toEqual(before);
    });
  });

  test("a changed remote item is updated and a locally edited note is a conflict", async () => {
    await withImportVault(async (vault, temporary) => {
      await importFiles(vault, [SINGLE_PAGE]);
      const page = JSON.parse(await readFile(SINGLE_PAGE, "utf8")) as { memories: Record<string, unknown>[] };
      const [policy, handbook] = page.memories;
      if (policy === undefined || handbook === undefined) throw new Error("fixture changed");
      policy.content = "# API Rate Limiting Policy\n\nEach API key may send 200 requests per minute.\n";
      policy.updatedAt = "2025-08-01T00:00:00Z";
      handbook.summary = "A rewritten onboarding summary.";
      const changed = join(temporary, "changed.json");
      await writeFile(changed, JSON.stringify(page));

      const edited = join(vault, "articles/handbook-onboarding/handbook-onboarding.md");
      const editedBytes = `${await readFile(edited, "utf8")}\nA local paragraph.\n`;
      await writeFile(edited, editedBytes);

      const report = await importFiles(vault, [changed]);
      expect(report.counts).toEqual({ created: 0, updated: 1, skipped: 1, conflicts: 1, rejected: 0 });
      const byNote = new Map(report.items.map((item) => [item.note, item]));
      expect(byNote.get("notes/imported/api-rate-limiting-policy")?.outcome).toBe("updated");
      expect(byNote.get("articles/handbook-onboarding/handbook-onboarding")).toMatchObject({
        outcome: "conflict",
        reason: "the note was edited after the last import",
      });
      expect(await readFile(edited, "utf8")).toBe(editedBytes);
      const updated = await readFile(join(vault, "notes/imported/api-rate-limiting-policy.md"), "utf8");
      expect(updated).toContain("200 requests per minute.\n\nImported from supermemory export `changed.json` on 2026-09-26.\n");
      expect(await fields(vault, "notes/imported/api-rate-limiting-policy")).toMatchObject({
        updated: "2025-08-01T00:00:00.000Z",
        external_id: "acxV5LHMEsG2hMSNb4umbn",
      });

      const rerun = await importFiles(vault, [changed]);
      expect(rerun.counts).toMatchObject({ updated: 0, skipped: 2, conflicts: 1 });
      expect(await main(["refresh", "--root", vault], quiet().output)).toBe(0);
      expect(await main(["check", "--root", vault], quiet().output)).toBe(0);
    });
  });

  test("--dry-run reports the same outcomes and leaves the tree byte-identical", async () => {
    await withImportVault(async (vault) => {
      const before = await tree(vault);
      const dry = await importFiles(vault, [SINGLE_PAGE], { dryRun: true });
      expect(dry.dryRun).toBe(true);
      expect(dry.counts).toEqual({ created: 3, updated: 0, skipped: 0, conflicts: 0, rejected: 0 });
      expect(await tree(vault)).toEqual(before);
      const real = await importFiles(vault, [SINGLE_PAGE]);
      expect(real.items.map((item) => [item.outcome, item.note]))
        .toEqual(dry.items.map((item) => [item.outcome, item.note]));
    });
  });

  test("--prefix places every item flat under the prefix", async () => {
    await withImportVault(async (vault) => {
      const report = await importFiles(vault, [SINGLE_PAGE], { prefix: "notes/supermemory/" });
      expect(report.items.map((item) => item.note).sort()).toEqual([
        "notes/supermemory/api-rate-limiting-policy",
        "notes/supermemory/handbook-onboarding",
        "notes/supermemory/zr8tqw3nhc6ypd1fgk5lmv",
      ]);
      expect(await fields(vault, "notes/supermemory/handbook-onboarding")).not.toHaveProperty("clipped");
    });
  });

  test("new notes avoid IDs taken on disk, case-insensitively", async () => {
    await withImportVault(async (vault) => {
      await mkdir(join(vault, "notes/imported"), { recursive: true });
      await writeFile(join(vault, "notes/imported/API-Rate-Limiting-Policy.md"), "# Someone else's note\n");
      await mkdir(join(vault, "articles/handbook-onboarding"), { recursive: true });
      const report = await importFiles(vault, [SINGLE_PAGE]);
      expect(report.items.map((item) => item.note).sort()).toEqual([
        "articles/handbook-onboarding-2/handbook-onboarding-2",
        "notes/imported/api-rate-limiting-policy-2",
        "notes/imported/zr8tqw3nhc6ypd1fgk5lmv",
      ]);
      expect(await readFile(join(vault, "notes/imported/API-Rate-Limiting-Policy.md"), "utf8"))
        .toBe("# Someone else's note\n");
    });
  });

  test("a symbolic link or a file where a parent directory belongs is refused", async () => {
    await withImportVault(async (vault, temporary) => {
      const outside = join(temporary, "outside");
      await mkdir(outside);
      await mkdir(join(vault, "notes"), { recursive: true });
      await symlink(outside, join(vault, "notes/imported"));
      const linked = await importFiles(vault, [SINGLE_PAGE]);
      expect(linked.counts).toMatchObject({ created: 1, rejected: 2 });
      for (const item of linked.items.filter((entry) => entry.outcome === "rejected")) {
        expect(item.reason).toBe("the note path must not traverse a symbolic link");
      }
      expect(await readdir(outside)).toEqual([]);

      await rm(join(vault, "notes/imported"));
      await writeFile(join(vault, "notes/imported"), "not a directory\n");
      const blocked = await importFiles(vault, [SINGLE_PAGE]);
      expect(blocked.counts).toMatchObject({ skipped: 1, rejected: 2 });
      for (const item of blocked.items.filter((entry) => entry.outcome === "rejected")) {
        expect(item.reason).toBe("every note parent must be a directory");
      }
      expect(await readFile(join(vault, "notes/imported"), "utf8")).toBe("not a directory\n");
    });
  });

  test("a run whose every row is rejected reports failure", async () => {
    await withImportVault(async (vault, temporary) => {
      const bad = join(temporary, "bad.json");
      await writeFile(bad, JSON.stringify({ memories: [{ id: "not valid!", createdAt: "yesterday" }] }));
      const before = await tree(vault);
      const report = await importFiles(vault, [bad]);
      expect(report.ok).toBe(false);
      expect(report.counts).toEqual({ created: 0, updated: 0, skipped: 0, conflicts: 0, rejected: 1 });
      expect(report.items[0]).toMatchObject({ outcome: "rejected", file: bad, pointer: "/memories/0" });
      expect(await tree(vault)).toEqual(before);
    });
  });

  test("a file-level error in any export writes nothing", async () => {
    await withImportVault(async (vault, temporary) => {
      const broken = join(temporary, "broken.json");
      await writeFile(broken, "{\"memories\": [");
      const before = await tree(vault);
      await expect(importFiles(vault, [SINGLE_PAGE, broken])).rejects.toBeInstanceOf(ImportFileError);
      await expect(importFiles(vault, [])).rejects.toThrow("import supermemory requires at least one export file");
      await expect(importFiles(vault, [SINGLE_PAGE], { prefix: "../outside" })).rejects.toThrow("--prefix must be");
      expect(await tree(vault)).toEqual(before);
    });
  });
  const exportOf = async (temporary: string, name: string, rows: readonly Record<string, unknown>[]) => {
    const path = join(temporary, name);
    await writeFile(path, JSON.stringify({ memories: rows, pagination: { currentPage: 1, totalItems: rows.length, totalPages: 1 } }));
    return path;
  };
  const row = (overrides: Record<string, unknown>) => documentRow(overrides).value as Record<string, unknown>;
  const memoryExport = async (temporary: string, name: string, rows: readonly Record<string, unknown>[]) => {
    const path = join(temporary, name);
    await writeFile(path, JSON.stringify({ memoryEntries: rows, pagination: { currentPage: 1, totalItems: rows.length, totalPages: 1 } }));
    return path;
  };
  const memoryValue = (id: string, text: string, parent: string | null) => memoryRow({
    id, memory: text, parentMemoryId: parent, rootMemoryId: null, history: [], documentIds: [], metadata: null,
  }).value as Record<string, unknown>;

  /** The plan importSupermemory would make, for tests that change the vault before applying it. */
  async function planOnDisk(vault: string, files: readonly string[]): Promise<ImportPlan> {
    const raw: RawItem[] = [];
    for (const file of files) raw.push(...parseExportText(await readFile(file, "utf8"), file));
    const snapshot = await scanVault(vault, { mentionScope: false });
    return planImport({
      items: raw.flatMap((item) => validateRawItem(item)),
      existing: snapshot.notes.map((note) => ({ id: note.id, path: note.path, content: note.content, metadata: note.metadata })),
      occupied: new Set(snapshot.notes.map((note) => occupancyKey(note.id))),
      now: WRITE_NOW,
    });
  }

  test("regression: an unsafe integer in metadata never reaches a note, so the vault stays readable", async () => {
    await withImportVault(async (vault, temporary) => {
      const file = await exportOf(temporary, "tweet.json", [
        row({ id: "Tweet1", title: "Tweet", content: "A tweet.", metadata: { tweet_id: 1790000000000000000, big: 1e21, kept: 7 } }),
      ]);
      const report = await importFiles(vault, [file]);
      expect(report.counts.created).toBe(1);
      expect(report.items[0]?.diagnostics).toEqual([
        "metadata.big is an integer outside the safe range; dropped",
        "metadata.tweet_id is an integer outside the safe range; dropped",
      ]);
      expect((await fields(vault, "notes/imported/tweet")).metadata).toEqual({ kept: 7 });
      expect(await main(["refresh", "--root", vault], quiet().output)).toBe(0);
      expect(await main(["check", "--root", vault], quiet().output)).toBe(0);
      expect((await importFiles(vault, [file])).counts.skipped).toBe(1);
    });
  });

  test("regression: private and credential-bearing URLs never become an article source", async () => {
    await withImportVault(async (vault, temporary) => {
      const file = await exportOf(temporary, "urls.json", [
        row({ id: "Url1", title: "Intranet page", type: "webpage", url: "http://localhost:8080/wiki/page" }),
        row({ id: "Url2", title: "Signed file", type: "pdf", url: "https://bucket.s3.amazonaws.com/f.pdf?X-Amz-Credential=AKIAEXAMPLE&X-Amz-Signature=0123456789abcdef" }),
        row({ id: "Url3", title: "Public page", type: "webpage", url: "https://example.com/public" }),
      ]);
      const report = await importFiles(vault, [file]);
      expect(report.counts.created).toBe(3);
      const signed = await readFile(join(vault, "articles/signed-file/signed-file.md"), "utf8");
      expect(signed).not.toContain("X-Amz");
      const saved = discoverSavedUrlRecords(vault);
      expect(saved.map((record) => [record.articleId, record.subjectUrl])).toEqual([["public-page", "https://example.com/public"]]);
      expect(await main(["refresh", "--root", vault], quiet().output)).toBe(0);
      expect(await main(["check", "--root", vault], quiet().output)).toBe(0);
    });
  });

  test("an import past the vault's note or byte cap fails before writing, in a dry run too", async () => {
    await withImportVault(async (vault, temporary) => {
      const file = await exportOf(temporary, "two.json", [
        row({ id: "Cap1", title: "One", content: "One." }),
        row({ id: "Cap2", title: "Two", content: "Two." }),
      ]);
      const notes = (await scanVault(vault, { mentionScope: false })).notes.length;
      const before = await tree(vault);
      for (const dryRun of [false, true]) {
        await expect(importSupermemory({ root: vault, files: [file], now: WRITE_NOW, dryRun, limits: { notes: notes + 1 } }))
          .rejects.toThrow(`the import would leave ${notes + 2} notes, more than the vault's ${notes + 1}-note limit; nothing was written`);
        await expect(importSupermemory({ root: vault, files: [file], now: WRITE_NOW, dryRun, limits: { bytes: 1024 } }))
          .rejects.toThrow("-byte limit; nothing was written");
      }
      expect(await tree(vault)).toEqual(before);
      const fits = await importSupermemory({ root: vault, files: [file], now: WRITE_NOW, limits: { notes: notes + 2 } });
      expect(fits.counts.created).toBe(2);
    });
  });

  test("a supersedes relation the user removed stays removed on rerun; a late parent still gets linked", async () => {
    await withImportVault(async (vault, temporary) => {
      const latestOnly = await memoryExport(temporary, "latest.json", [memoryValue("memNew", "Likes tea.", "memOld")]);
      const first = await importFiles(vault, [latestOnly]);
      expect(first.relations).toEqual([]);
      expect(first.items[0]?.diagnostics).toContain("parent memory memOld was not imported; supersedes relation omitted");

      const both = await memoryExport(temporary, "both.json", [
        memoryValue("memNew", "Likes tea.", "memOld"), memoryValue("memOld", "Likes coffee.", null),
      ]);
      const second = await importFiles(vault, [both]);
      expect(second.counts).toMatchObject({ created: 1, skipped: 1 });
      expect(second.relations).toEqual([{
        source: "notes/imported/memories/likes-tea", predicate: "supersedes",
        target: "notes/imported/memories/likes-coffee", outcome: "added",
      }]);

      expect(await main([
        "relation", "remove", "notes/imported/memories/likes-tea", "supersedes", "notes/imported/memories/likes-coffee",
        "--root", vault,
      ], quiet().output)).toBe(0);
      const third = await importFiles(vault, [both]);
      expect(third.counts).toMatchObject({ created: 0, skipped: 2 });
      expect(third.relations).toEqual([]);
      expect(await listNoteRelations(vault, "notes/imported/memories/likes-tea")).toEqual([]);
    });
  });

  test("regression: a note saved with a byte order mark is updated, not a permanent conflict", async () => {
    await withImportVault(async (vault, temporary) => {
      const original = await exportOf(temporary, "bom-1.json", [row({ id: "Bom1", title: "Alpha", content: "First text." })]);
      await importFiles(vault, [original]);
      const path = join(vault, "notes/imported/alpha.md");
      await writeFile(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(path)]));
      expect((await importFiles(vault, [original])).counts.skipped).toBe(1);
      const changed = await exportOf(temporary, "bom-2.json", [
        row({ id: "Bom1", title: "Alpha", content: "Second text.", updatedAt: "2025-02-01T00:00:00Z" }),
      ]);
      const report = await importFiles(vault, [changed]);
      expect(report.items[0]).toMatchObject({ outcome: "updated", note: "notes/imported/alpha" });
      expect(await readFile(path, "utf8")).toContain("Second text.");
      expect((await importFiles(vault, [changed])).counts.skipped).toBe(1);
    });
  });

  test("an update race is a conflict and keeps the other writer's bytes", async () => {
    await withImportVault(async (vault, temporary) => {
      await importFiles(vault, [await exportOf(temporary, "race-1.json", [row({ id: "Race1", title: "Racy", content: "Old." })])]);
      const changed = await exportOf(temporary, "race-2.json", [
        row({ id: "Race1", title: "Racy", content: "New.", updatedAt: "2025-03-01T00:00:00Z" }),
      ]);
      const plan = await planOnDisk(vault, [changed]);
      expect(plan.items[0]?.outcome).toBe("updated");
      const path = join(vault, "notes/imported/racy.md");
      const concurrent = `${await readFile(path, "utf8")}\nWritten meanwhile.\n`;
      await writeFile(path, concurrent);
      const applied = await applyImportPlan(vault, plan);
      expect(applied.items[0]).toMatchObject({ outcome: "conflict", reason: "the note changed during import" });
      expect(await readFile(path, "utf8")).toBe(concurrent);
    });
  });

  test("a create race is a conflict, keeps the bytes, and omits the relation from that note", async () => {
    await withImportVault(async (vault, temporary) => {
      const file = await memoryExport(temporary, "race.json", [
        memoryValue("memNew", "Likes tea.", "memOld"), memoryValue("memOld", "Likes coffee.", null),
      ]);
      const plan = await planOnDisk(vault, [file]);
      expect(plan.relations).toHaveLength(1);
      await mkdir(join(vault, "notes/imported/memories"), { recursive: true });
      const path = join(vault, "notes/imported/memories/likes-tea.md");
      const other = "---\ntitle: Someone else\ntype: note\n---\n\nNot an import.\n";
      await writeFile(path, other);
      const applied = await applyImportPlan(vault, plan);
      const tea = applied.items.find((item) => item.note === "notes/imported/memories/likes-tea");
      expect(tea?.outcome).toBe("conflict");
      expect(tea?.reason).toBeString();
      expect(await readFile(path, "utf8")).toBe(other);
      expect(applied.relations).toEqual([{
        source: "notes/imported/memories/likes-tea", predicate: "supersedes", target: "notes/imported/memories/likes-coffee",
        outcome: "omitted", reason: "notes/imported/memories/likes-tea was not written",
      }]);
    });
  });

  test("a relation whose target write is rejected at apply time is omitted", async () => {
    await withImportVault(async (vault, temporary) => {
      const file = await memoryExport(temporary, "reject.json", [
        memoryValue("memNew", "Likes tea.", "memOld"), memoryValue("memOld", "Likes coffee.", null),
      ]);
      const plan = await planOnDisk(vault, [file]);
      const broken: ImportPlan = {
        ...plan,
        items: plan.items.map((item) => item.write?.kind === "create" && item.note === "notes/imported/memories/likes-coffee"
          ? { ...item, write: { ...item.write, input: { ...item.write.input, title: "bad\ntitle" } } }
          : item),
      };
      const applied = await applyImportPlan(vault, broken);
      expect(applied.items.map((item) => item.outcome).sort()).toEqual(["created", "rejected"]);
      expect(applied.relations).toEqual([{
        source: "notes/imported/memories/likes-tea", predicate: "supersedes", target: "notes/imported/memories/likes-coffee",
        outcome: "omitted", reason: "notes/imported/memories/likes-coffee was not written",
      }]);
      expect(await listNoteRelations(vault, "notes/imported/memories/likes-tea")).toEqual([]);
    });
  });

  test("a directory passed as an export file is a named file error", async () => {
    await withImportVault(async (vault, temporary) => {
      const error = await importFiles(vault, [temporary]).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ImportFileError);
      expect((error as Error).message).toStartWith(`${temporary}: cannot read export file (`);
    });
  });

});

describe("memory entries", () => {
  const MEMORY_NOW = new Date("2026-09-26T12:00:00.000Z");
  const MEMORY_FIXTURE = join(FIXTURES, "memory-entries.json");

  async function withMemoryVault(run: (vault: string) => Promise<void>): Promise<void> {
    const temporary = await mkdtemp(join(tmpdir(), "wordcell-import-memory-"));
    const vault = join(temporary, "vault");
    const sink = { stdout: () => undefined, stderr: () => undefined };
    try {
      expect(await main(["init", vault], sink)).toBe(0);
      await run(vault);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  function noteFor(report: { readonly items: readonly { externalId?: string; note?: string }[] }, externalId: string) {
    const note = report.items.find((item) => item.externalId === externalId)?.note;
    if (note === undefined) throw new Error(`no note for ${externalId}`);
    return note;
  }

  test("the latest version and its history plan as notes with one supersedes edge per parent", async () => {
    const items = (await fixtureItems("memory-entries.json")).flatMap((raw) => validateRawItem(raw));
    const plan = planImport({ items, existing: [], occupied: new Set(), now: MEMORY_NOW });
    const outcomes = Object.fromEntries(plan.items.map((item) => [item.externalId, [item.outcome, item.pointer]]));
    expect(outcomes).toEqual({
      mem_editor_theme_v3: ["created", "/memoryEntries/0"],
      mem_editor_theme_v2: ["created", "/memoryEntries/0/history/0"],
      mem_editor_theme_v1: ["created", "/memoryEntries/0/history/1"],
      mem_timezone_v2: ["created", "/memoryEntries/1"],
      mem_old_address: ["skipped", "/memoryEntries/2"],
    });
    expect(plan.items.find((item) => item.externalId === "mem_old_address")?.reason).toBe("forgotten");
    const note = (externalId: string): string => {
      const found = plan.items.find((item) => item.externalId === externalId)?.note;
      if (found === undefined) throw new Error(`no note for ${externalId}`);
      return found;
    };
    expect(plan.items.every((item) => item.note === undefined || item.note.startsWith("notes/imported/memories/")))
      .toBe(true);
    expect(plan.relations).toEqual([
      { source: note("mem_editor_theme_v2"), predicate: "supersedes" as const, target: note("mem_editor_theme_v1") },
      { source: note("mem_editor_theme_v3"), predicate: "supersedes" as const, target: note("mem_editor_theme_v2") },
    ].sort((left, right) => left.source.localeCompare(right.source)));
    expect(plan.items.find((item) => item.externalId === "mem_timezone_v2")?.diagnostics)
      .toContain("parent memory mem_timezone_v1 was not imported; supersedes relation omitted");
    expect(plan.diagnostics).toEqual(["memoryRelations are the service's inferred links and were not imported"]);
  });

  test("imported memory notes carry their fields, link newest to parent only, and rerun unchanged", async () => {
    await withMemoryVault(async (vault) => {
      const report = await importSupermemory({ root: vault, files: [MEMORY_FIXTURE], now: MEMORY_NOW });
      expect(report.counts).toEqual({ created: 4, updated: 0, skipped: 1, conflicts: 0, rejected: 0 });
      expect(report.relations.map((relation) => relation.outcome)).toEqual(["added", "added"]);
      const v3 = noteFor(report, "mem_editor_theme_v3");
      const v2 = noteFor(report, "mem_editor_theme_v2");
      const v1 = noteFor(report, "mem_editor_theme_v1");
      const timezone = noteFor(report, "mem_timezone_v2");
      expect(v3).toBe("notes/imported/memories/prefers-dark-mode-in-every-editor-and-terminal");

      const read = async (note: string) =>
        frontmatter(await readFile(join(vault, `${note}.md`), "utf8"), `${note}.md`).document.toJS() as Record<string, unknown>;
      expect(await read(v3)).toMatchObject({
        type: "memory",
        title: "Prefers dark mode in every editor and terminal.",
        imported_from: "supermemory",
        external_id: "mem_editor_theme_v3",
        version: 3,
        parent_id: "mem_editor_theme_v2",
        root_id: "mem_editor_theme_v1",
        is_static: true,
        source_document_ids: ["acxV5LHMEsG2hMSNb4umbn"],
        created: "2025-03-01T10:00:00.000Z",
        updated: "2025-09-12T16:45:00.000Z",
        metadata: { channel: "chat", confidence: 0.92 },
        relations: { supersedes: [v2] },
      });
      const timezoneFields = await read(timezone);
      expect(timezoneFields).toMatchObject({
        is_inference: true,
        forget_after: "2026-12-31T00:00:00.000Z",
        parent_id: "mem_timezone_v1",
        updated: "2025-08-02T05:30:00.000Z",
      });
      expect(timezoneFields).not.toHaveProperty("relations");
      expect(timezoneFields).not.toHaveProperty("is_static");

      expect(await listNoteRelations(vault, v3)).toEqual([{ predicate: "supersedes", target: v2 }]);
      expect(await listNoteRelations(vault, v2)).toEqual([{ predicate: "supersedes", target: v1 }]);
      expect(await listNoteRelations(vault, v1)).toEqual([]);

      const snapshot = async () => Promise.all([v3, v2, v1, timezone].map((note) => readFile(join(vault, `${note}.md`), "utf8")));
      const before = await snapshot();
      const rerun = await importSupermemory({ root: vault, files: [MEMORY_FIXTURE], now: new Date("2026-10-02T00:00:00Z") });
      expect(rerun.counts).toEqual({ created: 0, updated: 0, skipped: 5, conflicts: 0, rejected: 0 });
      expect(rerun.relations).toEqual([]);
      expect(await snapshot()).toEqual(before);

      const sink = { stdout: () => undefined, stderr: () => undefined };
      expect(await main(["refresh", "--root", vault], sink)).toBe(0);
      expect(await main(["check", "--root", vault], sink)).toBe(0);
    });
  });
});

describe("review regressions: planning", () => {
  const memory = (id: string, text: string, parent: string | null) =>
    validateMemoryEntry(memoryRow({
      id, memory: text, parentMemoryId: parent, rootMemoryId: null, history: [], documentIds: [],
    }));

  test("a prefix equal to or under articles/ is refused", () => {
    const items = [doc({ id: "Pa1", title: "One" })];
    for (const prefix of ["articles", "articles/", "articles/sm", "Articles/sm", "ARTICLES"]) {
      expect(() => planFor(items, { prefix })).toThrow("--prefix must be outside articles/");
    }
    expect(planFor(items, { prefix: "notes/articles" }).items[0]?.note).toBe("notes/articles/one");
  });

  test("regression: many web documents with one slug allocate distinct article directories at once", () => {
    const items = Array.from({ length: 50 }, (_, index) =>
      doc({ id: `Web${String(index).padStart(3, "0")}`, title: "Same page", type: "webpage", url: `https://example.com/${index}` }));
    const plan = planFor(items, { occupied: ["articles/same-page"] });
    const notes = plan.items.map((item) => item.note);
    expect(new Set(notes).size).toBe(50);
    expect(notes).toContain("articles/same-page-2/same-page-2");
    expect(notes).not.toContain("articles/same-page/same-page");
    const prefixed = planFor(items, { prefix: "notes/sm" });
    expect(new Set(prefixed.items.map((item) => item.note)).size).toBe(50);
  });

  test("an item whose every candidate ID is taken is rejected instead of looping", () => {
    const occupied = ["notes/imported/full", ...Array.from({ length: 25_000 }, (_, index) => `notes/imported/full-${index + 2}`)];
    const plan = planFor([doc({ id: "Full1", title: "Full" })], { occupied });
    expect(plan.items[0]).toMatchObject({ outcome: "rejected", reason: 'no free note ID for slug "full" after 25000 attempts' });
    expect(plan.growth).toEqual({ notes: 0, bytes: 0 });
  });

  test("allocation near the item cap stays linear for one shared title", () => {
    const items = Array.from({ length: MAX_IMPORT_ITEMS }, (_, index) =>
      doc({ id: `Meet${String(index).padStart(5, "0")}`, title: "Meeting notes" }));
    const started = performance.now();
    const plan = planFor(items);
    const elapsed = performance.now() - started;
    expect(new Set(plan.items.map((item) => item.note)).size).toBe(MAX_IMPORT_ITEMS);
    expect(plan.items.map((item) => item.note)).toContain(`notes/imported/meeting-notes-${MAX_IMPORT_ITEMS}`);
    expect(plan.growth.notes).toBe(MAX_IMPORT_ITEMS);
    expect(elapsed).toBeLessThan(30_000);
  });

  test("unsafe integers in metadata are dropped with a diagnostic, and an unsafe memory version is rejected", () => {
    const result = doc({ id: "Big1", title: "Tweet", metadata: { tweet_id: 1790000000000000000, huge: 1e21, top: 2 ** 53 - 1, ratio: 1.5 } });
    const item = accepted(result);
    expect(item.metadata).toEqual({ ratio: 1.5, top: 2 ** 53 - 1 });
    expect(item.diagnostics).toEqual([
      "metadata.huge is an integer outside the safe range; dropped",
      "metadata.tweet_id is an integer outside the safe range; dropped",
    ]);
    const [latest] = validateMemoryEntry(memoryRow({ version: 2 ** 53 + 2, history: [] }));
    expect(rejectedReasons(latest)).toContain("version: integer outside the safe range");
    expect(created(planFor([result]).items[0]).fields.metadata).toEqual({ ratio: 1.5, top: 2 ** 53 - 1 });
  });

  test("document URLs become source only when url-metadata accepts them", () => {
    const plan = planFor([
      doc({ id: "Url1", title: "Intranet page", type: "webpage", url: "http://localhost:8080/wiki/page" }),
      doc({ id: "Url2", title: "Signed file", type: "pdf", url: "https://bucket.s3.amazonaws.com/file.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLE%2F20260926%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=0123456789abcdef" }),
      doc({ id: "Url3", title: "With password", type: "webpage", url: "https://user:secret@example.com/a" }),
      doc({ id: "Url4", title: "Public page", type: "webpage", url: "https://example.com/public" }),
      doc({ id: "Url5", title: "Token fragment", url: "https://example.com/cb#access_token=abcdef0123456789" }),
      doc({ id: "Url6", title: "Bucket token", url: "s3://bucket/key?X-Amz-Signature=0123456789abcdef&X-Amz-Credential=AKIAEXAMPLE" }),
    ]);
    const [intranet, signed, password, publicPage, fragment, bucket] = plan.items;
    expect(intranet?.note).toBe("articles/intranet-page/intranet-page");
    expect(created(intranet).fields).toMatchObject({ url: "http://localhost:8080/wiki/page" });
    expect(created(intranet).fields).not.toHaveProperty("source");
    expect(intranet?.diagnostics).toEqual(["url is kept as url, not source: source must not target a private network."]);
    for (const item of [signed, password, fragment, bucket]) {
      expect(created(item).fields).not.toHaveProperty("source");
      expect(created(item).fields).not.toHaveProperty("url");
      expect(item?.diagnostics).toEqual(["url carries credential-shaped data; dropped"]);
    }
    expect(signed?.note).toBe("articles/signed-file/signed-file");
    expect(fragment?.note).toBe("notes/imported/token-fragment");
    expect(created(publicPage).fields).toMatchObject({ source: "https://example.com/public" });
    expect(publicPage?.diagnostics).toEqual([]);
  });

  test("supersedes edges that would close a cycle are omitted with a diagnostic", () => {
    const two = planFor([...memory("memA", "Alpha.", "memB"), ...memory("memB", "Beta.", "memA")]);
    expect(two.relations).toEqual([
      { source: "notes/imported/memories/alpha", predicate: "supersedes", target: "notes/imported/memories/beta" },
    ]);
    expect(two.items[1]?.diagnostics).toContain(
      "supersedes relation to notes/imported/memories/alpha omitted because it would close a cycle",
    );
    const three = planFor([
      ...memory("memA", "Alpha.", "memC"), ...memory("memB", "Beta.", "memA"), ...memory("memC", "Gamma.", "memB"),
    ]);
    expect(three.relations.map((relation) => `${relation.source}>${relation.target}`)).toEqual([
      "notes/imported/memories/alpha>notes/imported/memories/gamma",
      "notes/imported/memories/beta>notes/imported/memories/alpha",
    ]);
    expect(three.items[2]?.diagnostics).toContain(
      "supersedes relation to notes/imported/memories/beta omitted because it would close a cycle",
    );
  });

  test("an existing supersedes edge counts toward a cycle", () => {
    const first = planFor([...memory("memB", "Beta.", null)]);
    const existing = existingFrom(created(first.items[0]), (content) =>
      content.replace("---\n\n", "relations:\n  supersedes:\n    - notes/imported/memories/alpha\n---\n\n"));
    expect(existing.supersedes ?? []).toEqual([]);
    const plan = planFor([...memory("memA", "Alpha.", "memB")], { existing: [existing] });
    expect(plan.relations).toEqual([]);
    expect(plan.items[0]?.diagnostics).toContain(
      "supersedes relation to notes/imported/memories/beta omitted because it would close a cycle",
    );
  });

  test("the rendered note is measured during planning, so a dry run rejects what the write would", () => {
    const text = "a".repeat(16 * 1024 * 1024 - 100);
    const plan = planFor([doc({ id: "Huge1", title: "Huge", content: text }), doc({ id: "Small1", title: "Small" })]);
    expect(plan.items.map((item) => item.outcome)).toEqual(["rejected", "created"]);
    expect(plan.items[0]?.reason).toBe("the rendered note is larger than the 16 MiB note limit");
    expect(plan.growth.notes).toBe(1);
  });

  test("a matched note with unreadable frontmatter is a conflict", () => {
    const write = created(planFor([doc({ id: "Brk1", title: "Broken" })]).items[0]);
    const note = existingFrom(write);
    const broken: ExistingNote = { ...note, content: note.content.replace("---\n", "---\n: [unclosed\n") };
    const plan = planFor([doc({ id: "Brk1", title: "Broken", summary: "Changed." })], { existing: [broken] });
    expect(plan.items[0]).toMatchObject({ outcome: "conflict", note: "notes/imported/broken" });
    expect(plan.items[0]?.reason).toStartWith("cannot read frontmatter (");
    expect(plan.items[0]?.write).toBeUndefined();
  });
});
