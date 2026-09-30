/**
 * Replays the recorded session behind the site's mockups and launch film
 * against the pinned @hraness/wordcell CLI. Pins what the mockups claim the
 * CLI prints, not the prose around them.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import sitePackage from "../package.json";
import { NOTE_PATH, NOTE_RULE, noteFile, RECORDED_VERSION, SOURCE_FILE, steps, type RecordedStep } from "../wordcell/mockups/transcript";

const cli = resolve(import.meta.dir, "../node_modules/.bin/wordcell");
let repo = "";

/** Random per run: document IDs, revision hashes and graph snapshots. */
function shape(line: string): string {
  return line
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu, "<uuid>")
    .replace(/[0-9a-f]{64}/gu, "<hash>");
}

function run(step: RecordedStep): string[] {
  const [, ...args] = step.command;
  const result = Bun.spawnSync([cli, ...args], { cwd: repo, env: { ...process.env, NO_COLOR: "1" } });
  if (result.exitCode !== 0) throw new Error(`${step.id} exited ${String(result.exitCode)}: ${result.stderr.toString()}`);
  return result.stdout.toString().trimEnd().split("\n");
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "wordcell-mockups-"));
  mkdirSync(join(repo, "packages/parser/src"), { recursive: true });
  writeFileSync(join(repo, SOURCE_FILE), "export const parse = (text: string) => text;\n");
  writeFileSync(join(repo, "packages/parser/AGENTS.md"), "# Parser\n");
  Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
});

afterAll(() => {
  if (repo !== "") rmSync(repo, { recursive: true, force: true });
});

test("the site pins the CLI version the transcript was recorded with", () => {
  expect(sitePackage.dependencies["@hraness/wordcell"]).toContain(`/v${RECORDED_VERSION}/`);
  expect(run(steps.version)).toEqual([...steps.version.output]);
});

test("every replayed step prints what the mockups show", () => {
  for (const step of Object.values(steps)) {
    if (step.id === "version") continue;
    if (!step.replay) continue;
    expect({ id: step.id, output: run(step).map(shape) }).toEqual({ id: step.id, output: step.output.map(shape) });
    if (step.id === "create") {
      // The recorded session tied the note to packages/parser right after creating it.
      const path = join(repo, "kb", NOTE_PATH);
      const text = readFileSync(path, "utf8");
      writeFileSync(path, text.replace(/^---\n([\s\S]*?)\n---/u, "---\n$1\nrepository_scopes:\n  - packages/parser\n---"));
    }
  }
}, 30_000);

test("the note file in the mockups is the note on disk", () => {
  const onDisk = readFileSync(join(repo, "kb", NOTE_PATH), "utf8").trimEnd().split("\n").map(shape);
  expect(onDisk).toEqual(noteFile.map(shape));
});

test("the publish preview shows the reader produced from the recorded vault", () => {
  run({ id: "publish", command: ["wordcell", "publish", "--root", "kb", "--out", "site"], output: [], replay: true });
  const note = readFileSync(join(repo, "site/n/notes/parser-contract/index.html"), "utf8");
  expect(note).toContain(NOTE_RULE);
  expect(note).toContain("Parser contract");
  expect(note).toContain("Parser timeouts");
  expect(note).toContain("Linked from");
  expect(note).toContain('class="site-title"');
  expect(note).toContain(">kb</a>");
  expect(note).toContain('class="search-button"');
  expect(note).toContain('class="graph-link"');
  expect(note).toContain('class="site-nav"');
});
