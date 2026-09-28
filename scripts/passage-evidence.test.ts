import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import fc from "fast-check";

import { clipUtf8, containsEvidence, measurePassageEvidence, type PassageEvidenceCase } from "./passage-evidence.ts";

describe("passage evidence", () => {
  test("clips on code-point boundaries within the byte limit", () => {
    expect(clipUtf8("héllo", 2)).toBe("h");
    expect(clipUtf8("héllo", 3)).toBe("hé");
    expect(clipUtf8("🧠🧠", 5)).toBe("🧠");
    expect(() => clipUtf8("x", -1)).toThrow("nonnegative");
    fc.assert(fc.property(fc.string({ unit: "grapheme" }), fc.integer({ min: 0, max: 64 }), (value, limit) => {
      const clipped = clipUtf8(value, limit);
      expect(value.startsWith(clipped)).toBe(true);
      expect(Buffer.byteLength(clipped, "utf8")).toBeLessThanOrEqual(limit);
    }));
  });

  test("requires every anchor in one text, ignoring whitespace but not case", () => {
    const gold = { path: "a.md", quote: "The writer keeps the lock\nuntil flush.", anchors: ["keeps the lock", "until flush"] };
    expect(containsEvidence("…the writer keeps the lock until   flush.", gold)).toBe(true);
    expect(containsEvidence("keeps the lock", gold)).toBe(false);
    expect(containsEvidence("KEEPS THE LOCK until flush", gold)).toBe(false);
    expect(containsEvidence("The writer keeps the lock until flush.", { ...gold, anchors: [] })).toBe(true);
  });

  test("measures snippets and passages over the same retrieved notes", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hraness-wordcell-passage-evidence-"));
    try {
      const root = join(temporary, "kb");
      await mkdir(join(root, "notes"), { recursive: true });
      await writeFile(join(root, "index.md"), "# Knowledge base\n", "utf8");
      await writeFile(join(root, "notes", "sync.md"), [
        "---", "title: Sync", "---", "# Sync", "",
        `Every release must include a checklist. ${"Reviewers confirm each item. ".repeat(30)}`, "",
        "A failed directory sync keeps the writer lock until the flush completes.", "",
      ].join("\n"), "utf8");
      const cases: PassageEvidenceCase[] = [{
        id: "p1",
        split: "confirmation",
        caseType: "positive",
        query: "Why must a failed directory sync keep the writer lock?",
        relevantPaths: ["notes/sync.md"],
        goldEvidence: [{
          path: "notes/sync.md",
          quote: "A failed directory sync keeps the writer lock until the flush completes.",
          anchors: ["keeps the writer lock", "until the flush completes"],
        }],
      }];
      const result = await measurePassageEvidence(root, cases);
      expect(result.semanticSessionOpens).toBe(0);
      expect(result.corpus.notes).toBe(2);
      expect(result.splits).toEqual([expect.objectContaining({
        split: "confirmation", positives: 1, candidateMisses: 0, snippetAnswers: 0, passageAnswers: 1, gained: 1, lost: 0,
      })]);
      expect(result.cases[0]?.candidates[0]).toMatchObject({ path: "notes/sync.md", passageStatus: "selected" });

      await expect(measurePassageEvidence(root, [{ ...cases[0]!, goldEvidence: [{ ...cases[0]!.goldEvidence[0]!, quote: "absent" }] }]))
        .rejects.toThrow("not in notes/sync.md");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("the recorded report is internally consistent with its cases", async () => {
    const directory = resolve(import.meta.dir, "../docs/evaluations/wordcell-passages-20260927");
    const report = JSON.parse(await readFile(join(directory, "local.json"), "utf8")) as Awaited<ReturnType<typeof measurePassageEvidence>>;
    const cases = JSON.parse(await readFile(join(directory, "cases.json"), "utf8")) as { cases: PassageEvidenceCase[] };
    expect(report.cases.map(({ id }) => id)).toEqual(cases.cases.map(({ id }) => id));
    expect(report.semanticSessionOpens).toBe(0);
    for (const split of report.splits) {
      const positives = report.cases.filter((entry) => entry.split === split.split && entry.caseType === "positive");
      expect(split.snippetAnswers).toBe(positives.filter((entry) => entry.snippetContainsAnswer).length);
      expect(split.passageAnswers).toBe(positives.filter((entry) => entry.passageContainsAnswer).length);
    }
    expect(report.splits.find(({ split }) => split === "confirmation")).toMatchObject({
      positives: 8, candidateMisses: 1, snippetAnswers: 1, passageAnswers: 6, gained: 5, lost: 0,
    });
  });
});
