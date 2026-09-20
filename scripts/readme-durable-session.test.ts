import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main, parseArguments } from "../src/cli.js";
import { createNote } from "../src/authoring.js";

const manifestUrl = new URL("../package.json", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const skillUrl = new URL("../skills/wordcell/SKILL.md", import.meta.url);
const queryReferenceUrl = new URL(
  "../skills/wordcell/references/query.md",
  import.meta.url,
);

async function publicSurface(): Promise<Readonly<{
  manifest: Readonly<{ version: string }>;
  readme: string;
  skill: string;
  queryReference: string;
}>> {
  const [manifestSource, readme, skill, queryReference] = await Promise.all([
    readFile(manifestUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
    readFile(skillUrl, "utf8"),
    readFile(queryReferenceUrl, "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource) as { readonly version?: unknown };
  if (typeof manifest.version !== "string") {
    throw new TypeError("package.json must declare a string version");
  }
  return Object.freeze({
    manifest: Object.freeze({ version: manifest.version }),
    readme,
    skill,
    queryReference,
  });
}

function compact(value: string): string {
  return value.replace(/\s+/gu, " ");
}

describe("durable-session documentation", () => {
  test("leads with the working narrative and keeps reference depth behind it", async () => {
    const { readme } = await publicSurface();
    const headings = [
      "## Why Wordcell",
      "## Install",
      "## Keep one decision available to the next session",
      "## Recover the stopped session",
      "## What you can do",
      "## Publish a selected part of your vault",
      "## Evidence and comparisons",
      "## How the files fit together",
      "## Build with the TypeScript SDK",
      "## Privacy and boundaries",
      "## Documentation",
      "## Release notes",
    ] as const;
    const offsets = headings.map((heading) => readme.indexOf(heading));
    expect(offsets.every((offset) => offset >= 0)).toBe(true);
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));

    const landingStart = readme.indexOf("<!-- hraness:wordcell-landing:start -->");
    const landingEnd = readme.indexOf("<!-- hraness:wordcell-landing:end -->");
    expect(landingStart).toBeGreaterThanOrEqual(0);
    expect(landingEnd).toBeGreaterThan(landingStart);
    const landing = compact(readme.slice(landingStart, landingEnd));
    for (const evidence of [
      "kb/notes/parser-contract.md",
      "wordcell backlinks notes/parser-contract --root kb",
      "wordcell search \"parser retries\" --root kb --mode exact",
      "wordcell context packages/parser/src/index.ts --root kb --repo .",
      "wordcell history notes/parser-contract --root kb --repo .",
      "They do not reconstruct private chat or prove that the note is still correct.",
    ] as const) expect(landing).toContain(evidence);
  });

  test("the first-value journey finds the saved decision without model setup", async () => {
    const root = await mkdtemp(join(tmpdir(), "wordcell-readme-"));
    const vault = join(root, "kb");
    let stdout = "";
    let stderr = "";
    const output = {
      stdout: (text: string): void => { stdout += text; },
      stderr: (text: string): void => { stderr += text; },
    };
    try {
      expect(await main(["init", vault], output)).toBe(0);
      const createExit = await main([
        "note", "create", "notes/parser-contract", "--title", "Parser contract",
        "--type", "concept", "--tag", "architecture", "--body",
        "Parser retries stop after three attempts.", "--root", vault,
      ], output, { createNote: (noteRoot, input, options) => createNote(noteRoot, input, { ...options, lock: { cacheHome: join(root, ".cache") } }) });
      expect(stderr).toBe("");
      expect(createExit).toBe(0);
      stdout = "";
      expect(await main(["search", "parser retries", "--root", vault, "--mode", "exact"], output)).toBe(0);
      expect(stdout).toContain("notes/parser-contract");
      expect(stdout).toContain("Parser retries stop after three attempts.");
      expect(stderr).toBe("");
      expect(await readFile(join(vault, "notes/parser-contract.md"), "utf8")).toContain("document_id:");
      // Existing Markdown needs no init, generated identity, or semantic index.
      const existingRoot = join(root, "existing");
      await mkdir(existingRoot);
      const existing = join(existingRoot, "existing.md");
      await writeFile(existing, "# Existing decision\n\nAlways validate the parser input.\n");
      stdout = "";
      const existingExit = await main(["search", "validate the parser input", "--root", existingRoot, "--mode", "exact"], output);
      expect(stderr).toBe("");
      expect(existingExit).toBe(0);
      expect(stdout).toContain("existing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps the package, README, and public skill on one immutable release", async () => {
    const { manifest, readme, skill } = await publicSurface();
    const packagePin = `https://github.com/hraness/wordcell/releases/download/v${manifest.version}/hraness-wordcell-${manifest.version}.tgz`;
    const skillPin = `hraness/wordcell#v${manifest.version}`;
    expect(readme).toContain(`bun add --global --ignore-scripts ${packagePin}`);
    expect(readme).toContain(`bun add --exact --ignore-scripts ${packagePin}`);
    expect(readme).toContain(skillPin);
    expect(skill).toContain(`bun add --global --ignore-scripts ${packagePin}`);
    expect(`${readme}\n${skill}`).not.toContain("@hraness/wordcell@latest");
  });

  test("keeps every opening workflow command accepted by the CLI parser", () => {
    const commands = [
      ["init", "kb"],
      [
        "note", "create", "notes/parser-contract",
        "--title", "Parser contract",
        "--type", "concept",
        "--tag", "architecture",
        "--body", "Parser retries stop after three attempts.",
        "--root", "kb",
      ],
      [
        "note", "create", "plans/parser-v2",
        "--title", "Parser v2",
        "--type", "plan",
        "--body", "The plan implements [[notes/parser-contract|the parser contract]].",
        "--root", "kb",
      ],
      ["context", "packages/parser/src/index.ts", "--root", "kb", "--repo", "."],
      [
        "search", "parser retries", "--root", "kb", "--mode", "exact",
        "--history", "--repo", ".",
      ],
      ["backlinks", "notes/parser-contract", "--root", "kb"],
      ["history", "notes/parser-contract", "--root", "kb", "--repo", "."],
    ] as const;
    const expectedKinds = [
      "init",
      "note-create",
      "note-create",
      "context",
      "search",
      "backlinks",
      "history",
    ] as const;

    for (const [index, command] of commands.entries()) {
      const result = parseArguments(command);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.kind).toBe(expectedKinds[index]);
    }
  });

  test("routes recovered-session work to matching agent-readable guidance", async () => {
    const { skill, queryReference } = await publicSurface();
    expect(skill).toContain("Recover work from an earlier session");
    expect(skill).toContain("[Query the knowledge base](references/query.md)");
    expect(queryReference).toContain("## Recover a stopped session");
    for (const command of [
      "wordcell context packages/parser/src/index.ts",
      "wordcell search \"why parser retries stop\"",
      "wordcell backlinks notes/parser-contract",
      "wordcell history notes/parser-contract",
    ] as const) expect(queryReference).toContain(command);
    expect(compact(queryReference)).toContain(
      "This workflow recovers only context that was persisted in files or Git",
    );
  });
});
