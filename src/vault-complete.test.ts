import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./cli.js";
import { VaultAnalysisBudgetError } from "./graph.js";
import { refreshVault, refreshVaultComplete, scanVault, scanVaultComplete, VaultScanBudgetError } from "./vault.js";

const roots: string[] = [];
function vault(count: number): string {
  const root = mkdtempSync(join(tmpdir(), "wordcell-complete-analysis-"));
  roots.push(root);
  mkdirSync(join(root, "notes"));
  writeFileSync(join(root, "index.md"), "---\nkb_catalog: authored\n---\n# Vault\n");
  for (let i = 0; i < count; i += 1) {
    writeFileSync(join(root, "notes", `${i}.md`), `# Concept ${i}\n\n[[notes/${(i + 1) % count}]]\nConcept ${(i + 1) % count}.\n`);
  }
  return root;
}
const content = (root: string): readonly string[] => [
  readFileSync(join(root, "index.md"), "utf8"),
  ...readdirSync(join(root, "notes")).sort().map((name) => readFileSync(join(root, "notes", name), "utf8")),
];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("complete scan and refresh retain the same snapshot and authored file contents", async () => {
  const root = vault(4), before = content(root);
  expect(await scanVaultComplete(root)).toEqual(await scanVault(root));
  expect(await refreshVaultComplete(root)).toEqual(await refreshVault(root));
  expect(content(root)).toEqual(before);
  await expect(scanVaultComplete(root, { maxNotes: 2 })).rejects.toThrow(VaultScanBudgetError);
  await expect(scanVaultComplete(root, { maxTotalBytes: 1 })).rejects.toThrow(VaultScanBudgetError);
  await expect(scanVaultComplete(root, { mentionIndexLimits: { maxWork: 0 } })).rejects.toThrow(VaultAnalysisBudgetError);
  expect(content(root)).toEqual(before);
});

test("CLI check and refresh complete a 1070-note vault and leave every authored byte intact", async () => {
  const root = vault(1070), before = content(root);
  await expect(scanVault(root)).rejects.toThrow(VaultAnalysisBudgetError);
  const snapshot = await scanVaultComplete(root);
  expect(snapshot.analysis.noteCount).toBe(1070);
  expect(snapshot.analysis.contextualLinks).toHaveLength(1070);
  expect(snapshot.analysis.issues).toEqual([]);
  expect(snapshot.analysis.orphans).toEqual([]);
  for (const command of ["check", "refresh"]) {
    const output: string[] = [], errors: string[] = [];
    const exitCode = await main([command, "--root", root, "--json"], {
      stdout: (text) => { output.push(text); }, stderr: (text) => { errors.push(text); },
    });
    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(JSON.parse(output.join(""))).toMatchObject({ noteCount: 1070 });
  }
  expect(content(root)).toEqual(before);
});
