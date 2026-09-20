import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";

import { measureProductEvidence, reductionPercent } from "./product-evidence.ts";

describe("product evidence", () => {
  test("measures actual SDK UTF-8 payloads with a shared scan and no semantic session", async () => {
    const root = await mkdtemp(join(tmpdir(), "wordcell-product-evidence-"));
    const content = `# Alpha\n\n${"Alpha café 🧠 is a searchable note.\n".repeat(200)}`;
    try {
      await writeFile(join(root, "index.md"), "# Evidence vault\n");
      await writeFile(join(root, "alpha.md"), content);
      const report = await measureProductEvidence(root, ["Alpha", "no-match-xyz"]);
      expect(report.corpus.noteCount).toBe(2);
      expect(report.execution).toEqual({ vaultScans: 1, semanticSessionOpens: 0 });
      expect(report.corpus.manifest.find(({ path }) => path === "alpha.md")?.bytes)
        .toBe(Buffer.byteLength(content, "utf8"));
      const first = report.cases[0]!;
      expect(first.selected.map(({ path }) => path)).toEqual(["alpha.md"]);
      expect(first.selectedFullNoteBytes).toBe(Buffer.byteLength(content, "utf8"));
      expect(first.packedBytes).toBe(Buffer.byteLength(first.packedContent, "utf8"));
      expect(first.packedSha256).toBe(createHash("sha256").update(first.packedContent).digest("hex"));
      expect(first.truncated).toBe(false);
      expect(first.reductionVsSelectedFullNotesPercent).toBeGreaterThan(0);
      expect(report.cases[1]!.selectedFullNoteBytes).toBe(0);
      expect(report.cases[1]!.reductionVsSelectedFullNotesPercent).toBeNull();
      expect(report.aggregate.packedBytes).toBe(report.cases.reduce((sum, item) => sum + item.packedBytes, 0));
      expect(report).toEqual(await measureProductEvidence(root, ["Alpha", "no-match-xyz"]));
      await writeFile(join(root, "alpha.md"), `${content}\nChanged corpus.\n`);
      expect((await measureProductEvidence(root, ["Alpha"])).corpus.sha256).not.toBe(report.corpus.sha256);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("does not turn empty baselines or larger outputs into savings", () => {
    expect(reductionPercent(500, 0)).toBeNull();
    expect(reductionPercent(200, 100)).toBe(-100);
    expect(reductionPercent(0, 100)).toBe(100);
    for (const invalid of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => reductionPercent(invalid, 100)).toThrow();
      expect(() => reductionPercent(100, invalid)).toThrow();
    }
  });

  test("byte reductions preserve equal-size and monotonicity laws", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 10_000_000 }),
      fc.integer({ min: 0, max: 10_000_000 }),
      (baseline, output) => {
        expect(reductionPercent(baseline, baseline)).toBe(0);
        expect(reductionPercent(output + 1, baseline)!).toBeLessThanOrEqual(reductionPercent(output, baseline)!);
        expect(reductionPercent(output, baseline)!).toBeLessThanOrEqual(100);
      },
    ));
  });
});
