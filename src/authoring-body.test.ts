import { afterEach, describe, expect, test } from "bun:test";
import fc from "fast-check";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  NoteRevisionConflictError, noteRevision, updateNoteBody, type UpdateNoteBodyOptions,
} from "./authoring.js";
import {
  MAX_NOTE_BYTES, NoteAlreadyExistsError, frontmatter, renderUpdatedNoteBody, renderUpdatedNoteBodyAndFields,
  type FrontmatterFields,
} from "./authoring-model.js";
import { nativeAuthoringPlatform } from "./authoring-platform.js";
import { isMetadataNumber } from "./graph.js";
import { createNoteProgram, updateNoteBodyProgram } from "./authoring-program.js";
import { runAuthoring } from "./authoring-runtime.js";

const fixtures: string[] = [];
afterEach(async () => {
  for (const path of fixtures.splice(0)) await rm(path, { recursive: true, force: true });
});

async function fixture(content = "---\ndocument_id: stable-note\ntitle: Research\n---\n\nOld body.\n") {
  const base = await mkdtemp(join(tmpdir(), "wordcell-body-"));
  fixtures.push(base);
  const root = join(base, "vault");
  await mkdir(join(root, "notes"), { recursive: true });
  const path = join(root, "notes/research.md");
  await writeFile(path, content, { mode: 0o640 });
  const options: UpdateNoteBodyOptions = {
    expectedRevision: await noteRevision(root, "notes/research"),
    lock: { cacheHome: join(base, "locks"), waitTimeoutMs: 2_000 },
  };
  return { base, root, path, options };
}

describe("conditional note body updates", () => {
  test.each(["\n", "\r\n"])("preserves exact frontmatter and stable identity with %j delimiters", async (newline) => {
    const header = [
      "  ---", "# retain this comment", "document_id: stable-note", "title: 'Research' # and this one",
      "custom: { keep: [7, true, null] }", "relations:", "  evidenced-by: [notes/evidence]", "---  ",
    ].join(newline);
    const { root, path, options } = await fixture(`${header}${newline}${newline}Old body.${newline}`);
    const updated = await updateNoteBody(root, "notes/research", "# New body\n\nEvidence remains uncertain.", options);
    expect(updated).toMatchObject({
      changed: true, path: "notes/research.md", documentId: "stable-note",
      relations: [{ predicate: "evidenced-by", target: "notes/evidence" }],
    });
    expect(await readFile(path, "utf8")).toBe(`${header}${newline}${newline}# New body\n\nEvidence remains uncertain.\n`);
    expect(updated.revision).toBe(await noteRevision(root, "notes/research"));
    expect(updated.revision).not.toBe(options.expectedRevision);
    expect((await stat(path)).mode & 0o777).toBe(0o640);
    expect(await readdir(join(root, "notes"))).toEqual(["research.md"]);
  });

  test("an unchanged body leaves bytes, inode and revision intact", async () => {
    const { root, path, options } = await fixture();
    const before = await stat(path, { bigint: true });
    const updated = await updateNoteBody(root, "notes/research", "Old body.", {
      ...options, dependencies: { beforeInstall: async () => { throw new Error("unchanged notes must not install"); } },
    });
    expect(updated).toMatchObject({ changed: false, revision: options.expectedRevision, documentId: "stable-note" });
    expect((await stat(path, { bigint: true })).ino).toBe(before.ino);
  });

  test("updates legacy prose without adding metadata or a stable identity", async () => {
    const { root, path, options } = await fixture("# Plain note\n\nOld body.\n");
    const updated = await updateNoteBody(root, "notes/research", "# Plain note\n\nNew body.", options);
    expect(updated).toMatchObject({ changed: true, relations: [] });
    expect(updated.documentId).toBeUndefined();
    expect(await readFile(path, "utf8")).toBe("# Plain note\n\nNew body.\n");
  });

  test("requires an explicit revision before reading or changing a note", async () => {
    const { root, path, options } = await fixture();
    const original = await readFile(path, "utf8");
    // @ts-expect-error A body update cannot omit the expected revision.
    await expect(updateNoteBody(root, "notes/research", "New body.", { lock: options.lock })).rejects.toThrow("expectedRevision is required");
    await expect(updateNoteBody(root, "notes/research", "New body.", {
      ...options, expectedRevision: "sha256:invalid",
    })).rejects.toThrow("expectedRevision is not a Wordcell note revision");
    expect(await readFile(path, "utf8")).toBe(original);
  });

  test("a stale revision conflicts even when the requested body matches current bytes", async () => {
    const { root, path, options } = await fixture();
    const current = await updateNoteBody(root, "notes/research", "New body.", options);
    await expect(updateNoteBody(root, "notes/research", "New body.", options)).rejects.toBeInstanceOf(NoteRevisionConflictError);
    expect(await noteRevision(root, "notes/research")).toBe(current.revision);
    expect(await readFile(path, "utf8")).toEndWith("New body.\n");
  });

  test("rejects malformed body values and invalid authored metadata without writes", async () => {
    for (const content of [
      "---\ntitle: [unfinished\n---\n\nOld body.\n",
      "---\ndocument_id: [invalid]\n---\n\nOld body.\n",
      "---\nrelations: [invalid]\n---\n\nOld body.\n",
    ]) {
      const { root, path, options } = await fixture(content);
      await expect(updateNoteBody(root, "notes/research", "New body.", options)).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe(content);
    }
    const { root, path, options } = await fixture();
    const original = await readFile(path, "utf8");
    for (const body of [null, 42, {}, "unpaired \ud800 surrogate"]) {
      await expect(updateNoteBody(root, "notes/research", body as string, options)).rejects.toBeInstanceOf(TypeError);
      expect(await readFile(path, "utf8")).toBe(original);
    }
  });

  test("does not introduce frontmatter through a plain note's new body", async () => {
    const { root, path, options } = await fixture("Plain note.\n");
    await expect(updateNoteBody(root, "notes/research", "---\npublish: true\n---\n\nText.", options)).rejects.toThrow("cannot introduce frontmatter");
    expect(await readFile(path, "utf8")).toBe("Plain note.\n");
  });

  test("bounds both input and the rendered note including preserved frontmatter", async () => {
    const { root, path, options } = await fixture();
    const original = await readFile(path, "utf8");
    await expect(updateNoteBody(root, "notes/research", "x".repeat(MAX_NOTE_BYTES + 1), options)).rejects.toThrow("body is too large");
    await expect(updateNoteBody(root, "notes/research", "x".repeat(MAX_NOTE_BYTES - 1), options)).rejects.toThrow("rendered note is too large");
    expect(await readFile(path, "utf8")).toBe(original);
    expect(await readdir(join(root, "notes"))).toEqual(["research.md"]);
  });

  test("updates existing confined notes only", async () => {
    const { base, root, path, options } = await fixture();
    await expect(updateNoteBody(root, "notes/missing", "New body.", options)).rejects.toThrow();
    await expect(updateNoteBody(root, "../escape", "New body.", options)).rejects.toThrow("not an exact canonical note ID");
    const outside = join(base, "outside.md");
    await writeFile(outside, "Outside.\n");
    await symlink(outside, join(root, "notes/linked.md"));
    await expect(updateNoteBody(root, "notes/linked", "New body.", options)).rejects.toThrow();
    expect(await readFile(outside, "utf8")).toBe("Outside.\n");
    expect(await readFile(path, "utf8")).toEndWith("Old body.\n");
  });

  test("preserves a human edit racing the optimistic installation check", async () => {
    const { root, path, options } = await fixture();
    const authored = "Human's replacement.\n";
    await expect(updateNoteBody(root, "notes/research", "Generated body.", {
      ...options, dependencies: { beforeInstall: async () => { await writeFile(path, authored); } },
    })).rejects.toBeInstanceOf(NoteRevisionConflictError);
    expect(await readFile(path, "utf8")).toBe(authored);
    expect(await readdir(join(root, "notes"))).toEqual(["research.md"]);
  });

  test("preserves displaced bytes when a writer recreates the quarantined path", async () => {
    const { root, path, options } = await fixture();
    const original = await readFile(path, "utf8");
    let conflict: unknown;
    try {
      await updateNoteBody(root, "notes/research", "Generated body.", {
        ...options, dependencies: { afterSourceQuarantined: async () => { await writeFile(path, "Human's replacement.\n"); } },
      });
    } catch (error: unknown) { conflict = error; }
    expect(conflict).toBeInstanceOf(NoteRevisionConflictError);
    if (!(conflict instanceof NoteRevisionConflictError) || conflict.recoveryPath === null) throw new Error("expected retained recovery bytes");
    expect(await readFile(path, "utf8")).toBe("Human's replacement.\n");
    expect(await readFile(join(root, conflict.recoveryPath), "utf8")).toBe(original);
  });

  test("recovers a safe interrupted quarantine before checking the requested revision", async () => {
    const { root, path, options } = await fixture();
    const recovery = join(root, "notes/.research.md.999.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.recovery");
    await mkdir(recovery);
    await rename(path, join(recovery, "research.md"));
    const updated = await updateNoteBody(root, "notes/research", "Recovered body.", options);
    expect(updated.changed).toBeTrue();
    expect(await readFile(path, "utf8")).toEndWith("Recovered body.\n");
    expect(await readdir(join(root, "notes"))).toEqual(["research.md"]);
  });

  test("allows exactly one same-revision writer to commit", async () => {
    const { root, path, options } = await fixture();
    const results = await Promise.allSettled([
      updateNoteBody(root, "notes/research", "First writer.", options),
      updateNoteBody(root, "notes/research", "Second writer.", options),
    ]);
    const successful = results.filter((result) => result.status === "fulfilled");
    const failed = results.filter((result) => result.status === "rejected");
    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.reason).toBeInstanceOf(NoteRevisionConflictError);
    const winner = successful[0];
    if (winner === undefined) throw new Error("expected one committed update");
    expect(await noteRevision(root, "notes/research")).toBe(winner.value.revision);
    expect(await readFile(path, "utf8")).toMatch(/(?:First|Second) writer\.\n$/u);
  });
});

describe("body update preservation properties", () => {
  test("arbitrary Unicode bodies never rewrite frontmatter or its newline style", () => {
    const body = fc.array(fc.constantFrom("a", "🧽", "é", "\n", "\r\n", "---", "[", "]", " "), { maxLength: 60 }).map((parts) => parts.join(""));
    fc.assert(fc.property(fc.string({ maxLength: 50 }), body, fc.constantFrom("\n", "\r\n"), (label, nextBody, newline) => {
      const header = ["---", "document_id: stable-note", `label: ${JSON.stringify(label)}`, "# keep", "---"].join(newline);
      const snapshot = { content: `${header}${newline}${newline}Old body.${newline}`, relativePath: "notes/research.md" };
      const next = renderUpdatedNoteBody(snapshot, frontmatter(snapshot.content, snapshot.relativePath), nextBody);
      expect(next).toBe(`${header}${newline}${newline}${nextBody.endsWith("\n") ? nextBody : `${nextBody}\n`}`);
      expect(frontmatter(next, snapshot.relativePath).document.toJS()).toEqual(frontmatter(snapshot.content, snapshot.relativePath).document.toJS());
    }), { numRuns: 100 });
  });
});

describe("internal frontmatter fields", () => {
  const fields: FrontmatterFields = {
    imported_from: "supermemory",
    external_id: "acxV5LHMEsG2hMSNb4umbn",
    created: "2025-04-15T09:30:00.000Z",
    version: 3,
    is_static: true,
    source_document_ids: ["doc_a", "doc_b"],
    metadata: { priority: 2, "team:name": "platform", flagged: false, label: "true" },
  };

  async function vault() {
    const { base, root } = await fixture();
    const lock = { cacheHome: join(base, "locks"), waitTimeoutMs: 2_000 };
    return { root, lock };
  }

  test("create renders fields after title and tags and round-trips them", async () => {
    const { root, lock } = await vault();
    const input = { id: "notes/imported", title: "Imported", type: "note", tags: ["memory"], body: "Imported text.\n" };
    const created = await runAuthoring(createNoteProgram(nativeAuthoringPlatform, root, input, { lock }, fields));
    expect(created.changed).toBe(true);
    const content = await readFile(join(root, "notes/imported.md"), "utf8");
    const keys = Object.keys(frontmatter(content, "notes/imported.md").document.toJS() as object);
    expect(keys).toEqual([
      "document_id", "type", "title", "tags", "imported_from", "external_id", "created", "version", "is_static",
      "source_document_ids", "metadata",
    ]);
    const values = frontmatter(content, "notes/imported.md").document.toJS() as Record<string, unknown>;
    for (const [key, value] of Object.entries(fields)) expect(values[key]).toEqual(value);
    expect(content.endsWith("---\n\nImported text.\n")).toBe(true);

    const again = await runAuthoring(createNoteProgram(nativeAuthoringPlatform, root, input, { lock }, fields));
    expect(again).toMatchObject({ changed: false, revision: created.revision });
    expect(await readFile(join(root, "notes/imported.md"), "utf8")).toBe(content);

    const differing = runAuthoring(createNoteProgram(nativeAuthoringPlatform, root, input, { lock }, { ...fields, version: 4 }));
    await expect(differing).rejects.toBeInstanceOf(NoteAlreadyExistsError);
    await expect(differing).rejects.toThrow("version differs");
    const missing = runAuthoring(createNoteProgram(nativeAuthoringPlatform, root, input, { lock }, { ...fields, extra_key: "x" }));
    await expect(missing).rejects.toThrow("extra_key differs");
    expect(await readFile(join(root, "notes/imported.md"), "utf8")).toBe(content);
  });

  test.each([
    [{ document_id: "x" }, "reserved"],
    [{ type: "note" }, "reserved"],
    [{ title: "Other" }, "reserved"],
    [{ tags: ["a"] }, "reserved"],
    [{ relations: "x" }, "reserved"],
    [{ Upper: "x" }, "not a valid frontmatter field name"],
    [{ "bad-key": "x" }, "not a valid frontmatter field name"],
    [{ multi: "one\ntwo" }, "single line"],
    [{ nul: "a\u0000b" }, "single line"],
    [{ lone: "\ud800" }, "well-formed"],
    [{ infinite: Number.POSITIVE_INFINITY }, "finite number"],
    [{ list: ["ok", 3] }, "must be a string"],
    [{ nested: { deeper: { no: 1 } } }, "must be a string"],
    [{ nested: { "bad key": 1 } }, "invalid key"],
    [{ nested: JSON.parse('{"__proto__": 1}') as Record<string, number> }, "invalid key"],
  ] as const)("create rejects malformed fields %j", async (bad, message) => {
    const { root, lock } = await vault();
    const input = { id: "notes/bad", title: "Bad", type: "note" };
    await expect(runAuthoring(createNoteProgram(
      nativeAuthoringPlatform, root, input, { lock }, bad as unknown as FrontmatterFields,
    ))).rejects.toThrow(message);
    expect(await readdir(join(root, "notes"))).toEqual(["research.md"]);
  });

  test("update sets fields, deletes nulls, and replaces the body in one revision", async () => {
    const header = [
      "---", "document_id: stable-note", "type: note", "title: Research", "custom: keep # comment",
      "imported_from: supermemory", "status: queued", "import_digest: sha256:old",
      "relations:", "  supersedes: [notes/older]", "---",
    ].join("\n");
    const { root, path, options } = await fixture(`${header}\n\nOld body.\n`);
    const updated = await runAuthoring(updateNoteBodyProgram(
      nativeAuthoringPlatform, root, "notes/research", "New body.", options,
      { title: "Renamed", status: null, import_digest: "sha256:new", updated: "2025-05-01T00:00:00.000Z" },
    ));
    expect(updated).toMatchObject({
      changed: true, documentId: "stable-note", relations: [{ predicate: "supersedes", target: "notes/older" }],
    });
    const content = await readFile(path, "utf8");
    expect(updated.revision).toBe(await noteRevision(root, "notes/research"));
    expect(content.endsWith("---\n\nNew body.\n")).toBe(true);
    expect(frontmatter(content, "notes/research.md").document.toJS()).toEqual({
      document_id: "stable-note", type: "note", title: "Renamed", custom: "keep", imported_from: "supermemory",
      import_digest: "sha256:new", relations: { supersedes: ["notes/older"] }, updated: "2025-05-01T00:00:00.000Z",
    });
    expect(content).toContain("custom: keep # comment");

    const same = await runAuthoring(updateNoteBodyProgram(
      nativeAuthoringPlatform, root, "notes/research", "New body.", { ...options, expectedRevision: updated.revision },
      { title: "Renamed", status: null, import_digest: "sha256:new" },
    ));
    expect(same).toMatchObject({ changed: false, revision: updated.revision });
    expect(await readFile(path, "utf8")).toBe(content);
  });

  test("update rejects reserved fields and stale revisions without writing", async () => {
    const { root, path, options } = await fixture();
    const before = await readFile(path, "utf8");
    for (const bad of [{ document_id: "x" }, { relations: null }, { type: "note" }, { title: "" }]) {
      await expect(runAuthoring(updateNoteBodyProgram(
        nativeAuthoringPlatform, root, "notes/research", "New.", options, bad,
      ))).rejects.toThrow();
    }
    await expect(runAuthoring(updateNoteBodyProgram(
      nativeAuthoringPlatform, root, "notes/research", "New.", { ...options, expectedRevision: `sha256:${"0".repeat(64)}` },
      { import_digest: "sha256:new" },
    ))).rejects.toBeInstanceOf(NoteRevisionConflictError);
    expect(await readFile(path, "utf8")).toBe(before);
  });

  test("fields need a frontmatter map", () => {
    const snapshot = { content: "Legacy prose.\n", relativePath: "notes/legacy.md" };
    expect(() => renderUpdatedNoteBodyAndFields(
      snapshot, frontmatter(snapshot.content, snapshot.relativePath), "New.", { import_digest: "sha256:new" },
    )).toThrow("frontmatter map");
  });

  test("an update without fields is byte-identical to the body-only renderer", () => {
    const body = fc.array(fc.constantFrom("a", "é", "\n", "\r\n", "---", " "), { maxLength: 40 }).map((parts) => parts.join(""));
    fc.assert(fc.property(body, fc.constantFrom("\n", "\r\n"), fc.constantFrom(undefined, {}), (nextBody, newline, empty) => {
      const header = ["---", "document_id: stable-note", "label: 'x' # keep", "---"].join(newline);
      const snapshot = { content: `${header}${newline}${newline}Old.${newline}`, relativePath: "notes/research.md" };
      expect(renderUpdatedNoteBodyAndFields(snapshot, frontmatter(snapshot.content, snapshot.relativePath), nextBody, empty))
        .toBe(renderUpdatedNoteBody(snapshot, frontmatter(snapshot.content, snapshot.relativePath), nextBody));
    }), { numRuns: 100 });
  });

  test("integers outside the safe range are refused, because the vault reader rejects them", () => {
    const snapshot = { content: "---\ndocument_id: stable-note\n---\n\nOld.\n", relativePath: "notes/research.md" };
    for (const value of [1e21, 2 ** 53 + 2, -(2 ** 53) - 2, 1.5e300]) {
      expect(() => renderUpdatedNoteBodyAndFields(snapshot, frontmatter(snapshot.content, snapshot.relativePath), "New.", {
        big: value,
      })).toThrow("safe integer when integral");
      expect(() => renderUpdatedNoteBodyAndFields(snapshot, frontmatter(snapshot.content, snapshot.relativePath), "New.", {
        map: { big: value },
      })).toThrow("safe integer when integral");
    }
    for (const value of [2 ** 53 - 1, -(2 ** 53 - 1), 1.5, 1e-7]) {
      const next = renderUpdatedNoteBodyAndFields(snapshot, frontmatter(snapshot.content, snapshot.relativePath), "New.", {
        kept: value,
      });
      expect((frontmatter(next, snapshot.relativePath).document.toJS() as Record<string, unknown>).kept).toBe(value);
    }
  });

  test("rendered fields round-trip for arbitrary single-line values", () => {
    const line = fc.string({ maxLength: 40 }).filter((value) => !/[\u0000-\u001f\u007f]/u.test(value)
      && Buffer.from(value, "utf8").toString("utf8") === value);
    fc.assert(fc.property(line, fc.array(line, { maxLength: 4 }), fc.double({ noNaN: true, noDefaultInfinity: true }).map((value) => Object.is(value, -0) ? 0 : value).filter(isMetadataNumber), (text, list, number) => {
      const snapshot = { content: "---\ndocument_id: stable-note\n---\n\nOld.\n", relativePath: "notes/research.md" };
      const next = renderUpdatedNoteBodyAndFields(snapshot, frontmatter(snapshot.content, snapshot.relativePath), "New.", {
        text, list, number, map: { key: text },
      });
      const values = frontmatter(next, snapshot.relativePath).document.toJS() as Record<string, unknown>;
      expect(values).toEqual({ document_id: "stable-note", text, list, number, map: { key: text } });
    }), { numRuns: 200 });
  });
});
