import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import Benchmarks from "../app/benchmarks/page";
import CompareBasicMemory from "../app/compare/basic-memory/page";
import CompareMem0 from "../app/compare/mem0/page";
import CompareSupermemory from "../app/compare/supermemory/page";
import Home from "../app/page";
import { scifactDetails } from "../wordcell/benchmark-evidence";
import { WordcellEvidenceStrip, wordcellEvidenceStats } from "../wordcell/evidence-strip";
import { handoffEvidence } from "../wordcell/handoff-evidence";
import { passageDetails, passageStudy } from "../wordcell/passage-evidence";

const repository = join(import.meta.dir, "..", "..");
const evaluation = join(repository, "docs", "evaluations", "wordcell-passages-20260927");

describe("selected-passage evidence", () => {
  test("figures come from the recorded report", async () => {
    const report = JSON.parse(await readFile(join(evaluation, "local.json"), "utf8")) as {
      splits: { split: string; positives: number; snippetAnswers: number; passageAnswers: number; gained: number; lost: number }[];
    };
    const confirmation = report.splits.find(({ split }) => split === "confirmation");
    expect(confirmation).toBeDefined();
    expect(passageDetails).toMatchObject({
      questions: confirmation?.positives,
      snippetAnswers: confirmation?.snippetAnswers,
      passageAnswers: confirmation?.passageAnswers,
      gained: confirmation?.gained,
      lost: confirmation?.lost,
    });
    expect(passageStudy.rows.map(({ value }) => value)).toEqual([
      100 * passageDetails.snippetAnswers / passageDetails.questions,
      100 * passageDetails.passageAnswers / passageDetails.questions,
    ]);
    expect(passageDetails.rerankFirstWithSnippets).toBe(passageDetails.rerankFirstWithPassages);
  });

  test("the strip states each figure against its own baseline and links the sources", () => {
    const html = renderToStaticMarkup(<WordcellEvidenceStrip />);
    expect(wordcellEvidenceStats.map(({ value }) => value)).toEqual([
      `${passageDetails.passageAnswers} of ${passageDetails.questions}`,
      `${scifactDetails.rerankedFirstResults} of ${scifactDetails.queries}`,
      `${Math.round(handoffEvidence.reductionPercent)}%`,
      "0",
    ]);
    expect(html).toContain("none ranks Wordcell against another tool");
    expect(html).toContain('href="/benchmarks"');
  });

  test("home, benchmarks, and every comparison page show the strip; charts link the study", () => {
    for (const page of [<Home key="home" />, <Benchmarks key="benchmarks" />, <CompareSupermemory key="supermemory" />, <CompareMem0 key="mem0" />, <CompareBasicMemory key="basic-memory" />]) {
      const html = renderToStaticMarkup(page);
      expect(html).toContain('aria-label="Wordcell measurements"');
      expect(html).toContain(`${passageDetails.passageAnswers} of ${passageDetails.questions}`);
    }
    for (const page of [<Home key="home" />, <Benchmarks key="benchmarks" />]) {
      expect(renderToStaticMarkup(page)).toContain('href="/docs/evidence#measure-whether-excerpts-contain-the-answer"');
    }
  });

  test("the documented anchor exists in the evidence guide", async () => {
    const guide = await readFile(join(repository, "docs", "evidence.md"), "utf8");
    expect(guide).toContain("## Measure whether excerpts contain the answer");
    expect(guide).toContain(`**selected passages held the\nlabeled answer for six; the older snippets held it for one**`);
  });
});
