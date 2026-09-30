import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import Benchmarks from "../app/benchmarks/page";
import { scifactDetails } from "../wordcell/benchmark-evidence";
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

  test("the benchmarks page reports SciFact ranking figures and links their study", () => {
    const html = renderToStaticMarkup(<Benchmarks />);
    expect(html).toContain(`${scifactDetails.exactFirstResults} of ${scifactDetails.queries} queries`);
    expect(html).toContain(`${scifactDetails.rerankedFirstResults} of ${scifactDetails.queries} queries`);
    expect(html).toContain('href="/docs/reranking#evidence-and-limits"');
  });

  test("the documented anchor exists in the evidence guide", async () => {
    const guide = await readFile(join(repository, "docs", "evidence.md"), "utf8");
    expect(guide).toContain("## Measure whether excerpts contain the answer");
    expect(guide).toContain("evaluations/wordcell-passages-20260927/local.json");
  });
});
