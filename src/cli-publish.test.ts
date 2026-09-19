import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseArguments } from "./cli.js";

describe("publish command", () => {
  test("accepts repeated slice selectors and a bounded result preview", () => {
    const parsed = parseArguments([
      "publish", "--root", "kb", "--out", "public",
      "--include", "notes/decision", "--include-glob", "plans/**",
      "--include-glob", "articles/*.md", "--exclude-glob", "**/draft-*",
      "--list-limit", "0", "--dry-run", "--json",
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.value.kind !== "publish") throw new Error("expected publish");
    expect(parsed.value.selection).toMatchObject({
      includes: ["notes/decision"],
      includeGlobs: ["plans/**", "articles/*.md"],
      excludeGlobs: ["**/draft-*"],
    });
    expect(parsed.value.listLimit).toBe(0);
    expect(parsed.value.dryRun).toBe(true);
  });

  test.each(["-1", "1001", "1.5", "Infinity", "NaN", "01", "1e2", "0x10"])(
    "rejects invalid preview limit %s before reading a vault", (limit) => {
      const parsed = parseArguments(["publish", "--out", "site", "--list-limit", limit]);
      expect(parsed.ok).toBe(false);
    },
  );

  test("previews and publishes the same slice without exposing private notes", async () => {
    const parent = await mkdtemp(join(tmpdir(), "wordcell-cli-publish-"));
    const root = join(parent, "kb");
    const out = join(parent, "site");
    await mkdir(join(root, "notes"), { recursive: true });
    await writeFile(join(root, "index.md"), "# Notes\n");
    await writeFile(join(root, "notes", "one.md"), "# One\n\nSaved public decision.\n");
    await writeFile(join(root, "notes", "two.md"), "# Two\n\nAnother public decision.\n");
    await writeFile(join(root, "notes", "secret.md"), "---\npublish: false\n---\n# Secret\n\nPRIVATE_SENTINEL\n");
    const execute = async (extra: readonly string[]) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const code = await main([
        "publish", "--root", root, "--out", out,
        "--include-glob", "notes/**", "--list-limit", "1", "--deterministic", "--json", ...extra,
      ], { stdout: (s) => stdout.push(s), stderr: (s) => stderr.push(s) });
      expect(stderr.join("")).toBe("");
      expect(code).toBe(0);
      const source = stdout.join("");
      expect(source).not.toContain("PRIVATE_SENTINEL");
      expect(source).not.toContain("notes/secret");
      return JSON.parse(source);
    };
    try {
      const preview = await execute(["--dry-run"]);
      expect((await readdir(parent)).sort()).toEqual(["kb"]);
      expect(preview.selection).toMatchObject({ ids: ["notes/one"], total: 2, truncated: true });
      expect(preview.selection.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
      const published = await execute([]);
      expect(published.selection).toEqual(preview.selection);
      expect(await readFile(join(out, "n", "notes", "one", "index.html"), "utf8"))
        .toContain("Saved public decision.");
      expect(await readFile(join(root, "notes", "secret.md"), "utf8"))
        .toContain("PRIVATE_SENTINEL");
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
