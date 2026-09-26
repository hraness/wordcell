import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main, type CliDependencies, type CliTerminal } from "./cli-program.js";
import type { SemanticIndexResult } from "./semantic.js";

const PERSON: CliTerminal = {
  env: { LANG: "en_US.UTF-8", TERM: "xterm-256color", NO_COLOR: "1" },
  stdoutIsTTY: true,
  stderrIsTTY: true,
  columns: 100,
};
const PIPE: CliTerminal = { env: { LANG: "en_US.UTF-8" }, stdoutIsTTY: false, stderrIsTTY: false, columns: undefined };
const AGENT: CliTerminal = { ...PERSON, env: { ...PERSON.env, CLAUDECODE: "1" } };

let workspace = "";
let vault = "";
let previousDirectory = "";

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "wordcell-first-run-"));
  previousDirectory = process.cwd();
  process.chdir(workspace);
  vault = join(workspace, "kb");
});

afterAll(async () => {
  process.chdir(previousDirectory);
  await rm(workspace, { recursive: true, force: true });
});

async function run(arguments_: readonly string[], terminal: CliTerminal, dependencies: CliDependencies = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await main(arguments_, {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  }, { terminal, ...dependencies });
  return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

describe("first run", () => {
  test("init tells a person what to run next", async () => {
    const result = await run(["init", "kb"], PERSON);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Initialized kb with \d+ files\.\n$/u);
    expect(result.stderr).toBe("Next: wordcell search \"your question\" --root kb\n");
  });

  test("init stays quiet on stderr for pipes, agents, and --json", async () => {
    for (const [directory, terminal, extra] of [["kb-pipe", PIPE, []], ["kb-agent", AGENT, []], ["kb-json", PERSON, ["--json"]]] as const) {
      const result = await run(["init", directory, ...extra], terminal);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
    }
  });

  test("search without an index matches exact words and says how to index", async () => {
    const result = await run(["search", "decision", "--root", vault], PERSON, {
      semanticIndexExists: () => Promise.resolve(false),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toStartWith("Exact results for");
    expect(result.stderr).toBe(
      `Searched without an index, so only exact words matched. For meaning-based search, run wordcell index --root ${vault} (downloads about 300 MB once).\n`,
    );
  });

  test("search without an index still falls back for scripts, without the note", async () => {
    const result = await run(["search", "decision", "--root", vault, "--json"], PIPE, {
      semanticIndexExists: () => Promise.resolve(false),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "exact" });
  });

  test("an explicit mode is never overridden", async () => {
    let asked = false;
    const result = await run(["search", "decision", "--root", vault, "--mode", "exact"], PERSON, {
      semanticIndexExists: () => { asked = true; return Promise.resolve(false); },
    });
    expect(result.exitCode).toBe(0);
    expect(asked).toBe(false);
    expect(result.stderr).toBe("");
  });

  test("index announces the one-time model download to a person", async () => {
    const indexed = { root: vault } as unknown as SemanticIndexResult;
    const fake = { indexSemanticVault: () => Promise.resolve(indexed) } as unknown as CliDependencies;
    const person = await run(["index", "--root", "kb"], PERSON, fake).catch((error: unknown) => ({ exitCode: -1, stdout: "", stderr: String(error) }));
    expect(person.stderr).toStartWith(
      "↻ Indexing kb. The first run downloads a search model of about 300 MB and can take a few minutes.\n",
    );
    const piped = await run(["index", "--root", "kb"], PIPE, fake).catch((error: unknown) => ({ exitCode: -1, stdout: "", stderr: String(error) }));
    expect(piped.stderr).not.toContain("Indexing");
  });
});
