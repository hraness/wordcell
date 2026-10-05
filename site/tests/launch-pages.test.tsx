import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BenchmarkComparison, type BenchmarkStudy } from "../wordcell/benchmark-comparison";
import { scifactStudy } from "../wordcell/benchmark-evidence";
import {
  longMemEvalArms,
  longMemEvalComparison,
  longMemEvalFacts,
  longMemEvalLabPipeline,
  longMemEvalLimitQuotes,
  longMemEvalStudy,
  longMemEvalTypes,
  locomoArms,
  locomoCategories,
  locomoFacts,
  locomoLimitQuotes,
  locomoPaired,
  locomoStudy,
  ohAttribution,
  ohLinks,
  ohLongMemEvalPost,
  ohSources,
  pilotArms,
  pilotInterval,
  pilotLimitQuotes,
  pilotSecondaryInterval,
  pilotStudy,
  quoteFrom,
} from "../wordcell/oh-evidence";
import { publishedClaims, publishedClaimsCheckedOn } from "../wordcell/published-claims";
import { basicMemoryCheckedOn, basicMemoryPages } from "../wordcell/basic-memory-sources";
import { mem0CheckedOn, mem0Pages } from "../wordcell/mem0-sources";
import { obsidianCheckedOn, obsidianPages } from "../wordcell/obsidian-sources";
import { claudeMemCheckedOn, claudeMemPages, claudeMemVersion } from "../wordcell/claude-mem-sources";
import { claudeMemAdmission, comparisonAdmissions, isComparisonIndexable } from "../wordcell/comparison-admissions";
import { formatPlanCredits, formatPlanPrice, formatUsageRate, supermemoryPricing } from "../wordcell/supermemory-pricing";
import Home from "../app/page";
import Benchmarks, { metadata as benchmarksMetadata } from "../app/benchmarks/page";
import CompareBasicMemory, { metadata as compareBasicMemoryMetadata } from "../app/compare/basic-memory/page";
import CompareObsidian, { metadata as compareObsidianMetadata } from "../app/compare/obsidian/page";
import CompareMem0, { metadata as compareMem0Metadata } from "../app/compare/mem0/page";
import CompareSupermemory, { metadata as compareMetadata } from "../app/compare/supermemory/page";
import CompareClaudeMem, { metadata as compareClaudeMemMetadata } from "../app/compare/claude-mem/page";
import MigrateSupermemory, { metadata as migrateMetadata } from "../app/migrate/supermemory/page";
import {
  MIGRATION_GUIDE_PATH,
  migrationConcepts,
  migrationSteps,
  supermemoryFeaturesCheckedOn,
  supermemoryPages,
} from "../wordcell/migration-steps";
import { grouped, longDate, prose, signed } from "../wordcell/format";
import { handoffEvidence } from "../wordcell/handoff-evidence";
import { SetupLinks } from "../wordcell/setup-links";
import { siteDescription } from "../app/site-description";
import { launchRoutes, reviewPendingRoutes } from "../wordcell/launch-routes";
import { assertArticleAdmissions, isArticleIndexable } from "@hraness/design-kit";
import { publishedRelease } from "../app/publication";
import { publishedReadme } from "../scripts/published-readme";
import {
  AGENT_MEMORY_RELEASE,
  CONNECT_CLIENT_URL,
  MAX_SETUP_URL,
  SETUP_COMMANDS,
  SETUP_PROMPT,
  SETUP_VAULT_PATH,
  setupTargets,
} from "../wordcell/setup-prompt";

const repository = join(import.meta.dir, "..", "..");

/** docs/getting-started.md as /docs/getting-started renders it: install commands bound to the admitted release. */
async function publishedGettingStarted(): Promise<string> {
  const source = await readFile(join(repository, "docs", "getting-started.md"), "utf8");
  const manifest = JSON.parse(await readFile(join(repository, "package.json"), "utf8")) as { version: string };
  return publishedReadme(source, manifest.version, publishedRelease?.version ?? null);
}

/** The CHANGELOG section that first lists `wordcell mcp`. */
async function firstMcpRelease(): Promise<string | undefined> {
  const changelog = await readFile(join(repository, "CHANGELOG.md"), "utf8");
  const mcpEntry = changelog.indexOf("`wordcell mcp");
  const headings = [...changelog.slice(0, mcpEntry).matchAll(/^## (\S+)$/gmu)];
  return headings.at(-1)?.[1];
}
const vendored = join(repository, "docs", "evaluations", "oh");

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a string.`);
  return value;
}

describe("vendored Oh artifacts", () => {
  test("each file matches the byte count, git blob, and SHA-256 recorded in sources.json", async () => {
    const manifest = record(JSON.parse(await readFile(join(vendored, "sources.json"), "utf8")), "sources.json");
    expect(manifest.schema).toBe("wordcell.vendored-sources.v1");
    const artifacts = manifest.artifacts;
    if (!Array.isArray(artifacts)) throw new TypeError("sources.json artifacts must be an array.");
    expect(artifacts.length).toBe(3);
    for (const [index, entry] of artifacts.entries()) {
      const artifact = record(entry, `artifacts[${index}]`);
      const file = text(artifact.file, "file");
      expect(artifact.repository).toBe("hraness/oh");
      expect(text(artifact.commit, "commit")).toMatch(/^[0-9a-f]{40}$/);
      expect(text(artifact.path, "path")).toBe(`benchmarks/results/${file}`);
      expect(artifact.fetchedOn).toBe("2026-09-26");
      const bytes = await readFile(join(vendored, file));
      expect(bytes.byteLength).toBe(artifact.bytes as number);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(text(artifact.sha256, "sha256"));
      const blob = createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
      expect(blob).toBe(text(artifact.gitBlobSha1, "gitBlobSha1"));
    }
  });
});

describe("benchmark study rendering", () => {
  test("a study names its own sample noun, scope, date label, and value precision", () => {
    const study: BenchmarkStudy = {
      ...scifactStudy,
      id: "sample",
      sampleSize: 1540,
      sampleNoun: "questions",
      scope: "A bounded sample scope sentence.",
      dateLabel: "Published",
      valueDigits: 2,
      rows: [{ id: "a", label: "Arm A", value: 75, detail: "45 of 60 questions" }],
    };
    const html = renderToStaticMarkup(<BenchmarkComparison study={study} />);
    expect(html).toContain("1,540 questions");
    expect(html).not.toContain("1540 queries");
    expect(html).toContain("A bounded sample scope sentence.");
    expect(html).toContain("<dt>Published</dt>");
    expect(html).toContain("75.00%");
    expect(html).not.toContain(scifactStudy.scope);
  });

  test("the SciFact study keeps its caption, scope, and one-decimal values", () => {
    const html = renderToStaticMarkup(<BenchmarkComparison study={scifactStudy} />);
    expect(html).toContain(`${scifactStudy.sampleSize} queries`);
    expect(html).toContain(scifactStudy.scope);
    expect(html).toContain("<dt>Recorded</dt>");
    expect(html).toMatch(/\d+\.\d%/);
    expect(html).not.toMatch(/\d+\.\d\d%/);
  });
});

const notSota = /\bSOTA\b|state[\s-]+of[\s-]+the[\s-]+art/i;

async function vendoredJson(file: string): Promise<Readonly<Record<string, unknown>>> {
  return record(JSON.parse(await readFile(join(vendored, file), "utf8")), file);
}

describe("Oh LoCoMo evidence", () => {
  test("arm figures are the vendored judge means, GPT-5 mini first and Oh before BM25", async () => {
    const raw = await vendoredJson("memory-evolution-locomo-sealed-1540-v1.json");
    const arms = raw.arms as ReadonlyArray<{ variantId: string; reader: string; metrics: ReadonlyArray<{ overall: { mean: number; cases: number } }> }>;
    const mean = (variant: string, reader: string) =>
      arms.find((arm) => arm.variantId === variant && arm.reader === reader)?.metrics[0]?.overall.mean ?? Number.NaN;
    const mini = "gpt5-mini-calibration-only-v1-reader";
    const nano = "gpt5-nano-calibration-only-v1-reader";
    const expected = [mean("semantic-24k", mini), mean("window-24k", mini), mean("semantic-24k", nano), mean("window-24k", nano)];
    expect(locomoArms.map((arm) => arm.percent)).toEqual(expected.map((value) => (100 * value).toFixed(1)));
    expect(locomoArms.map((arm) => arm.percent)).toEqual(["84.4", "81.6", "81.0", "78.1"]);
    expect(locomoArms.map((arm) => arm.correct)).toEqual([1300, 1257, 1248, 1203]);
    expect(locomoArms.every((arm) => arm.cases === 1540)).toBe(true);
    expect(locomoStudy.rows.map((row) => row.value)).toEqual(expected.map((value) => 100 * value));
    expect(locomoStudy.rows.map((row) => row.detail)).toEqual(locomoArms.map((arm) => `${arm.correct?.toLocaleString("en-US")} of 1,540 questions`));
    expect(locomoStudy.sampleSize).toBe(1540);
    expect(locomoStudy.comparability).toBe("same-run");
    expect(locomoStudy.source.href).toBe(ohLinks.locomoResult);
  });

  test("categories, paired outcomes, and exposure come from the file", () => {
    expect(locomoCategories.map((category) => [category.name, category.questions])).toEqual([
      ["Single-hop", 841],
      ["Multi-hop", 282],
      ["Temporal", 321],
      ["Open-domain", 96],
    ]);
    expect(locomoCategories.reduce((sum, category) => sum + category.questions, 0)).toBe(1540);
    expect(locomoCategories.every((category) => category.percents.length === locomoArms.length)).toBe(true);
    expect(locomoCategories[0]?.percents).toEqual(["91.3", "90.1", "87.6", "87.3"]);
    expect(locomoPaired).toEqual([
      { reader: "GPT-5 mini", better: 126, worse: 83, tied: 1331, cases: 1540 },
      { reader: "GPT-5 nano", better: 169, worse: 124, tied: 1247, cases: 1540 },
    ]);
    expect(locomoFacts.repeats).toBe(1);
    expect(locomoFacts.conversations).toBe(10);
    expect([locomoFacts.evaluatedBefore.questions, locomoFacts.development.questions]).toEqual([1226, 314]);
    expect(locomoFacts.unscoredCategories).toEqual(["adversarial"]);
    expect(locomoStudy.exposure).toContain("None are unseen.");
  });

  test("limit quotes are verbatim substrings of Oh's qualification, and a missing quote throws", async () => {
    const raw = await vendoredJson("memory-evolution-locomo-sealed-1540-v1.json");
    const qualification = raw.qualification as readonly string[];
    for (const quote of locomoLimitQuotes) {
      expect(qualification.some((statement) => statement.includes(quote))).toBe(true);
    }
    expect(locomoLimitQuotes).toContain("do not establish fresh confirmation, statistical superiority or benchmark saturation");
    expect(() => quoteFrom(qualification, "establishes statistical superiority")).toThrow(TypeError);
    expect(quoteFrom(["a b c"], "b")).toBe("b");
  });
});

describe("Oh LongMemEval-S 500 evidence", () => {
  test("matched arms, the frozen interval, and question types match the vendored result", async () => {
    const raw = await vendoredJson("memory-longmemeval-s-500-v1.json");
    const systems = raw.systems as readonly Readonly<Record<string, unknown>>[];
    const system = (id: string) => record(systems.find((entry) => entry.id === id), id);
    expect(longMemEvalArms.map((arm) => [arm.system, arm.percent, arm.correctAnswers, arm.answers, arm.majorityCorrect])).toEqual([
      ["Oh semantic retrieval", "88.87", 1333, 1500, 445],
      ["BM25 retrieval", "86.13", 1292, 1500, 431],
    ]);
    for (const arm of longMemEvalArms) {
      const entry = system(arm.id);
      expect(arm.percent).toBe((entry.percent as number).toFixed(2));
      expect(arm.correctAnswers).toBe(entry.correctAnswers as number);
    }
    expect(longMemEvalStudy.rows.map((row) => row.detail)).toEqual(["1,333 of 1,500 answers", "1,292 of 1,500 answers"]);
    expect(longMemEvalStudy.rows.map((row) => row.id)).not.toContain("oh-reading-pipeline");
    expect(longMemEvalStudy.comparability).toBe("same-run");
    expect(longMemEvalStudy.sampleSize).toBe(500);
    expect(longMemEvalStudy.measuredAt).toBe(raw.completed as string);
    expect(longMemEvalComparison.primary).toEqual({ difference: 2.8, lower: 0, upper: 5.6, level: "95%" });
    expect(longMemEvalComparison.mean).toEqual({ difference: 2.73, lower: 0.53, upper: 5.07, level: "95%" });
    const comparison = record((raw.comparisons as readonly unknown[]).find((entry) => record(entry, "comparison").left === "oh-semantic-96k"), "comparison");
    expect(record(comparison.correctInTwoOrThreeRuns, "primary").interval95).toEqual([longMemEvalComparison.primary.lower, longMemEvalComparison.primary.upper]);
    expect(record(comparison.meanOfThreeRuns, "mean").interval95).toEqual([longMemEvalComparison.mean.lower, longMemEvalComparison.mean.upper]);
    expect(longMemEvalComparison.tieNotRuledOut).toBe(true);
    expect([longMemEvalComparison.gained, longMemEvalComparison.lost]).toEqual([31, 17]);
    expect(longMemEvalTypes.map((type) => [type.id, type.questions, ...type.percents])).toEqual([
      ["knowledge-update", 78, "91.03", "92.74"],
      ["multi-session", 133, "84.21", "74.94"],
      ["single-session-assistant", 56, "95.24", "94.64"],
      ["single-session-preference", 30, "63.33", "65.56"],
      ["single-session-user", 70, "95.24", "97.62"],
      ["temporal-reasoning", 133, "91.98", "88.47"],
      ["abstention", 30, "91.11", "90.00"],
    ]);
    expect(longMemEvalFacts.matchedSupermemoryRun).toBe(false);
    expect(record(raw.supermemory, "supermemory").matchedFullRun).toBe(false);
  });

  test("research-only lab scores stay outside marketing charts", async () => {
    const raw = await vendoredJson("memory-longmemeval-s-500-v1.json");
    expect(longMemEvalLabPipeline).toMatchObject({ percent: "93.07", majorityCorrect: 474, inSample: true, inOhPackage: false });
    expect(record(raw.packageBoundary, "packageBoundary").labPublished).toBe(false);
    expect(record(raw.exposure, "exposure").inSample).toBe(true);
    const markup = renderToStaticMarkup(<Benchmarks />);
    const text = pageText(markup);
    expect(text).not.toContain("93.07");
    expect(markup).not.toContain("oh-reading-pipeline");
  });

  test("quoted limits are verbatim", async () => {
    const raw = await vendoredJson("memory-longmemeval-s-500-v1.json");
    const statements = [...(raw.limitations as readonly string[]), text(record(raw.exposure, "exposure").priorStudies, "priorStudies")];
    for (const quote of Object.values(longMemEvalLimitQuotes)) {
      expect(statements.some((statement) => statement.includes(quote))).toBe(true);
      expect(quote).not.toMatch(notSota);
    }
  });
});

describe("Oh LongMemEval pilot evidence", () => {
  test("arm rates and the interval match the vendored pilot result", async () => {
    const raw = await vendoredJson("memory-framework-pilot-v1.json");
    const quality = record(raw.quality, "quality");
    const primary = record(record(quality.comparisons, "comparisons").primary, "primary");
    const bounds = record(primary.interval95, "interval95");
    expect(pilotArms.map((arm) => [arm.name, arm.correct, arm.questions, arm.percent, arm.incomplete])).toEqual([
      ["Supermemory", 45, 60, "75.00", 0],
      ["Oh", 43, 60, "71.67", 3],
      ["BM25", 41, 60, "68.33", 3],
    ]);
    expect(pilotStudy.rows.map((row) => row.detail)).toEqual(["45 of 60 questions", "43 of 60 questions", "41 of 60 questions"]);
    expect(pilotStudy.valueDigits).toBe(2);
    expect(pilotStudy.measuredAt).toBe(raw.date as string);
    expect(pilotInterval).toMatchObject({ left: "Oh", right: "Supermemory", estimate: -3.33, lower: -13.33, upper: 6.67, crossesZero: true });
    expect(pilotInterval.lower).toBe(Math.round((bounds.lower as number) * 100) / 100);
    expect(pilotInterval.upper).toBe(Math.round((bounds.upper as number) * 100) / 100);
    expect(pilotSecondaryInterval).toMatchObject({ left: "Oh", right: "BM25", estimate: 3.33, lower: -1.67, upper: 8.33 });
    expect(pilotStudy.evaluator).toContain("Oh and BM25 each did not finish three of the 60 questions");
    const contextTokens = record(raw.contextTokens, "contextTokens");
    expect(pilotArms.map((arm) => [arm.medianContextTokens, arm.medianContextQuestions])).toEqual(
      pilotArms.map((arm) => {
        const context = record(contextTokens[arm.id], arm.id);
        return [context.p50 as number, context.count as number];
      }),
    );
    expect(pilotStudy.contextBudget).toBe(
      "Median context per question whose retrieval finished: 1,688 tokens for Supermemory (60 questions), 5,014 for Oh (57 questions), and 7,675 for BM25 (57 questions).",
    );
  });

  test("quoted pilot limits are verbatim and never include the state-of-the-art limitation", async () => {
    const raw = await vendoredJson("memory-framework-pilot-v1.json");
    const limitations = raw.limitations as readonly string[];
    for (const quote of pilotLimitQuotes) {
      expect(limitations.some((statement) => statement.includes(quote))).toBe(true);
      expect(quote).not.toMatch(notSota);
    }
  });
});

describe("Oh evidence provenance and rendering", () => {
  test("the attribution sentences match docs/evidence.md", async () => {
    const evidence = (await readFile(join(repository, "docs", "evidence.md"), "utf8")).replace(/\s+/g, " ");
    expect(ohAttribution).not.toContain("'");
    expect(evidence).toContain(ohAttribution.replaceAll("’", "'"));
  });

  test("source links are pinned to the vendored commits", () => {
    expect(ohSources.map((source) => source.href)).toEqual([
      "https://github.com/hraness/oh/blob/3add170ca8d931603e68dee07f3cbdcf9c08c706/benchmarks/results/memory-evolution-locomo-sealed-1540-v1.json",
      "https://github.com/hraness/oh/blob/9edd9f1bc18d0f4c15b040add10caad26e782275/benchmarks/results/memory-framework-pilot-v1.json",
      "https://github.com/hraness/oh/blob/21c500cf38928ab610c15c438557fbed5227ca4b/benchmarks/results/memory-longmemeval-s-500-v1.json",
    ]);
    const pinned = [
      "https://github.com/hraness/oh/blob/9edd9f1bc18d0f4c15b040add10caad26e782275/benchmarks/",
      "https://github.com/hraness/oh/blob/21c500cf38928ab610c15c438557fbed5227ca4b/benchmarks/",
    ];
    for (const href of Object.values(ohLinks)) {
      expect(pinned.some((prefix) => href.startsWith(prefix)), href).toBe(true);
    }
    expect(ohLinks.longMemEvalResult).toStartWith(pinned[1] ?? "");
    expect(ohLongMemEvalPost).toBe("https://oh.computer/blog/longmemeval-s-user-log");
  });

  test("both studies render as same-run charts with their derived figures and no SOTA claim", () => {
    const locomo = renderToStaticMarkup(<BenchmarkComparison study={locomoStudy} />);
    expect(locomo).toContain("1,540 questions");
    expect(locomo).toContain("<dt>Published</dt>");
    for (const arm of locomoArms) expect(locomo).toContain(`${arm.percent}%`);
    const pilot = renderToStaticMarkup(<BenchmarkComparison study={pilotStudy} />);
    expect(pilot).toContain("60 questions");
    for (const arm of pilotArms) expect(pilot).toContain(`${arm.percent}%`);
    expect(`${locomo}${pilot}`).not.toMatch(notSota);
  });
});

describe("published competitor claims", () => {
  test("each figure, metric, and primary source is pinned with its checked-on date", () => {
    expect(publishedClaimsCheckedOn).toBe("2026-09-26");
    expect(publishedClaims.map((claim) => [claim.system, claim.figure, claim.metric.split(",")[0], claim.model, claim.href])).toEqual([
      ["Mem0", "92.5", "Mem0 Score", "Not named", "https://mem0.ai/research"],
      ["Mem0", "94.4", "Mem0 Score", "Not named", "https://mem0.ai/research"],
      ["Zep", "94.7% (1,459 / 1,540 correct)", "Accuracy", "gpt-5.4 reader and gpt-5.4 judge", "https://www.getzep.com/research/"],
      ["Zep", "90.2% (451 / 500 correct)", "Accuracy", "gpt-5.4 reader and gpt-5.4 judge", "https://www.getzep.com/research/"],
      ["Supermemory", "97%", "Recall@20 with aggregation", "gpt-4o", "https://supermemory.ai/research/longmembench/"],
      ["Supermemory", "84.6%", "Recall@20 with aggregation", "gpt-5", "https://supermemory.ai/research/longmembench/"],
      ["Supermemory", "85.2%", "Recall@20 with aggregation", "gemini-3-pro", "https://supermemory.ai/research/longmembench/"],
    ]);
    expect(new Set(publishedClaims.map((claim) => claim.id)).size).toBe(publishedClaims.length);
    const figures = publishedClaims.map((claim) => claim.figure).join(" ");
    for (const withdrawn of ["81.6", "89.8", "66.88", "68.44", "71.2", "63.8"]) expect(figures).not.toContain(withdrawn);
    expect(JSON.stringify(publishedClaims)).not.toMatch(notSota);
  });
});

describe("Supermemory pricing", () => {
  test("plans, usage rates, source, and checked-on date are pinned", () => {
    expect(supermemoryPricing.checkedOn).toBe("2026-09-26");
    expect(supermemoryPricing.href).toBe("https://supermemory.ai/pricing");
    expect(supermemoryPricing.plans.map((plan) => [plan.name, formatPlanPrice(plan), formatPlanCredits(plan)])).toEqual([
      ["Free", "$0 a month", "$5 in credits"],
      ["Pro", "$19 a month", "$20 in credits"],
      ["Max", "$100 a month", "$130 in credits"],
      ["Scale", "$399 a month", "$600 in credits"],
      ["Enterprise", "Custom", "Custom"],
    ]);
    expect(supermemoryPricing.usage.map(formatUsageRate)).toEqual([
      "$5 per 1M SM tokens ($10 for rich content)",
      "$1 per 1M SM tokens ($2 for rich content)",
      "$5 per 1M queries",
      "$100 per 1M operations",
    ]);
    expect(supermemoryPricing.plans.find((plan) => plan.name === "Scale")?.note).toContain("HIPAA BAA");
  });
});

describe("agent setup prompt", () => {

  test("only supported composer links prefill; other computer agents copy and open", () => {
    const targets = setupTargets();
    expect(targets.filter((target) => target.kind === "link").map((target) => target.id)).toEqual(["dot", "grok-bot", "muse", "cursor", "codex-app", "devin"]);
    expect(MAX_SETUP_URL).toBe(10_000);
    for (const target of targets) {
      if (target.kind !== "link") continue;
      expect(target.href.length).toBeLessThanOrEqual(MAX_SETUP_URL);
      const url = new URL(target.href);
      if (target.mode === "prefill") {
        const parameter = target.id === "cursor" ? "text" : "prompt";
        expect([...url.searchParams.keys()]).toEqual([parameter]);
        expect(url.searchParams.get(parameter)).toBe(SETUP_PROMPT);
      } else {
        expect(url.protocol).toBe("https:");
        expect(url.search).toBe("");
      }
    }
    const custom = setupTargets("a & b + c #d");
    const cursor = custom.find((target) => target.id === "cursor");
    expect(cursor?.kind === "link" ? new URL(cursor.href).searchParams.get("text") : null).toBe("a & b + c #d");
    expect(setupTargets("🚀".repeat(MAX_SETUP_URL)).filter((target) => target.kind === "link").every((target) => target.mode === "copy-and-open")).toBe(true);
    expect(SETUP_COMMANDS.gemini).toContain("mcp -- --root");
    expect(JSON.parse(SETUP_COMMANDS.cursor).mcpServers.wordcell.args).toEqual(["mcp", "--root", SETUP_VAULT_PATH]);
    expect(JSON.parse(SETUP_COMMANDS.copilot).servers.wordcell).toEqual({ type: "stdio", command: "wordcell", args: ["mcp", "--root", SETUP_VAULT_PATH] });
  });

  test("the prompt installs the admitted release and matches the documented commands", async () => {
    const migration = await readFile(join(repository, "docs", "migration-from-supermemory.md"), "utf8");
    const reference = await readFile(join(repository, "docs", "reference.md"), "utf8");
    const setupGuide = await readFile(join(repository, "docs", "agent-handoffs.md"), "utf8");
    const readme = await readFile(join(repository, "README.md"), "utf8");
    const manifest = JSON.parse(await readFile(join(repository, "package.json"), "utf8")) as { version: string };
    if (publishedRelease === null) throw new Error("The site has no admitted release.");
    // The install block is Get started's, and the skill command is the README's, each bound to the admitted release.
    expect(await publishedGettingStarted()).toContain(`\`\`\`sh\n${SETUP_COMMANDS.install.join("\n")}\n\`\`\``);
    expect(publishedReadme(readme, manifest.version, publishedRelease.version)).toContain(SETUP_COMMANDS.skill);
    expect(SETUP_COMMANDS.install[0]).toContain(`/v${publishedRelease.version}/hraness-wordcell-${publishedRelease.version}.tgz`);
    expect(SETUP_COMMANDS.skill).toContain(`hraness/wordcell#v${publishedRelease.version} `);
    expect(migration).toContain("(getting-started.md#install-the-cli)");
    expect(migration.replace(/\s+/gu, " ")).toContain(`need Wordcell ${AGENT_MEMORY_RELEASE} or later`);
    expect(SETUP_PROMPT).toContain(`\`wordcell --version\` already shows ${AGENT_MEMORY_RELEASE} or later, the first release with \`wordcell mcp\``);
    expect(SETUP_PROMPT).not.toMatch(/from source|checkout|git clone|bun link/u);
    for (const command of SETUP_COMMANDS.install) expect(SETUP_PROMPT).toContain(`   ${command}\n`);
    expect(setupGuide).toContain(SETUP_COMMANDS.codex);
    expect(setupGuide).toContain(SETUP_COMMANDS.claudeCode.replace("--scope user", "--scope project"));
    expect(setupGuide).toContain("| `user` | `~/.claude.json` |");
    expect(setupGuide).toContain("~/.cursor/mcp.json");
    expect(reference).toContain("\n### Connect a client\n");
    expect(reference).toContain("(agent-handoffs.md)");
    expect(CONNECT_CLIENT_URL).toBe("https://wordcell.io/docs/agent-handoffs");
    for (const command of [SETUP_COMMANDS.init, SETUP_COMMANDS.claudeCode, SETUP_COMMANDS.codex, SETUP_COMMANDS.skill, CONNECT_CLIENT_URL]) {
      expect(SETUP_PROMPT).toContain(command);
    }
    expect(SETUP_COMMANDS.claudeCode).toContain(`--root ${SETUP_VAULT_PATH}`);
    expect(SETUP_PROMPT).toContain("session-memory reference");
    expect(await readFile(join(repository, "skills", "wordcell", "references", "session-memory.md"), "utf8")).toContain("## Keep a profile note");
    expect(SETUP_PROMPT).not.toContain("\u2014");
    expect(SETUP_PROMPT).not.toMatch(notSota);
  });

  test("the setup block shares the full prompt, provider actions, and file-aware command tabs", () => {
    const markup = renderToStaticMarkup(<SetupLinks />);
    const visibleMarkup = markup.replace(/<\/?span\b[^>]*>/gu, "");
    expect(markup).toContain('aria-label="Copy setup prompt"');
    expect(markup).toContain("Show full prompt");
    expect(markup).toContain('aria-live="polite"');
    expect(markup.match(/data-agent-target="/g)?.length).toBe(6);
    expect(markup.match(/role="tab"/g)?.length).toBe(5);
    for (const target of setupTargets()) {
      if (target.kind === "link") expect(markup).toContain(`href="${target.href.replaceAll("'", "&#x27;")}"`);
      else expect(pageText(visibleMarkup).replace(/\s+/gu, " ")).toContain(target.command.replace(/\s+/gu, " "));
    }
    expect(SETUP_PROMPT).toContain(SETUP_COMMANDS.skill);
    expect(markup).toContain("~/.cursor/mcp.json");
    expect(markup).toContain(".vscode/mcp.json");
    expect(markup).not.toContain("Copied the setup prompt");
  });

  test("the release the site names for wordcell mcp is the CHANGELOG section that first lists it", async () => {
    expect(await firstMcpRelease()).toBe(AGENT_MEMORY_RELEASE);
    const changelog = await readFile(join(repository, "CHANGELOG.md"), "utf8");
    const section = changelog.slice(changelog.indexOf(`\n## ${AGENT_MEMORY_RELEASE}\n`), changelog.indexOf("\n## ", changelog.indexOf(`\n## ${AGENT_MEMORY_RELEASE}\n`) + 1));
    for (const entry of ["`wordcell import supermemory", "--body-file -", "session-memory reference"]) expect(section, entry).toContain(entry);
    const markup = pageText(renderToStaticMarkup(<SetupLinks />));
    expect(markup).toContain(SETUP_VAULT_PATH);
    expect(markup).not.toMatch(/from source|checkout/u);
  });
});

function pageText(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ");
}

describe("format helpers", () => {
  test("spell small numbers, group large ones, and write dates and signed values", () => {
    expect([prose(4), prose(7), prose(10), prose(1540), grouped(12126)]).toEqual(["four", "seven", "10", "1,540", "12,126"]);
    expect(longDate("2026-09-26")).toBe("September 26, 2026");
    expect(() => longDate("26 September")).toThrow(TypeError);
    expect([signed(-3.3333), signed(6.6667), signed(0)]).toEqual(["\u22123.33", "+6.67", "0.00"]);
  });
});

describe("/benchmarks", () => {
  test("handoff figures come from docs/product-evidence.json", async () => {
    const evidence = JSON.parse(await readFile(join(repository, "docs", "product-evidence.json"), "utf8"));
    expect(handoffEvidence).toEqual({
      queries: evidence.aggregate.queries,
      noteCount: evidence.corpus.noteCount,
      packedBytes: evidence.aggregate.packedBytes,
      fullNoteBytes: evidence.aggregate.selectedFullNoteBytes,
      reductionPercent: evidence.aggregate.reductionVsSelectedFullNotesPercent,
      toolVersion: evidence.tool.version,
    });
    expect([handoffEvidence.packedBytes, handoffEvidence.fullNoteBytes, handoffEvidence.reductionPercent]).toEqual([12126, 60584, 79.98]);
  });

  test("renders meaningful studies with source links and compact methodology disclosures", () => {
    const markup = renderToStaticMarkup(<Benchmarks />);
    const text = pageText(markup);
    expect(markup.match(/<h1[ >]/g)?.length).toBe(1);
    expect(text).toContain(ohAttribution);
    for (const arm of locomoArms) expect(text).toContain(`${arm.percent}%`);
    for (const category of locomoCategories) {
      expect(text).toContain(`${category.name} ${grouped(category.questions)} ${category.percents.map((percent) => `${percent}%`).join(" ")}`);
    }
    for (const paired of locomoPaired) {
      for (const value of [paired.better, paired.worse, paired.tied]) expect(text).toContain(grouped(value));
    }
    for (const arm of longMemEvalArms) expect(text).toContain(`${arm.percent}%`);
    for (const type of longMemEvalTypes) {
      expect(text).toContain(`${type.name} ${grouped(type.questions)} ${type.percents.map((percent) => `${percent}%`).join(" ")}`);
    }
    expect(text).toContain("That is +2.8 percentage points, with a 95% interval from 0.0 to +5.6.");
    expect(text).toContain("does not rule out a tie");
    expect(text).toContain("it includes no matched run of Supermemory or any other memory framework");
    for (const quote of [longMemEvalLimitQuotes.exposure, longMemEvalLimitQuotes.aliases, longMemEvalLimitQuotes.audit]) expect(text).toContain(quote);
    expect(markup).toContain(`href="${ohLongMemEvalPost}"`);
    expect(text.indexOf("all 500 LongMemEval-S questions")).toBeLessThan(text.indexOf("Answers judged correct on LoCoMo"));
    expect(markup).not.toContain(`aria-labelledby="${pilotStudy.id}-title"`);
    expect(markup).toContain("LongMemEval-S study notes");
    expect(markup).toContain("LoCoMo study notes");
    for (const quote of locomoLimitQuotes) expect(text).toContain(`“${quote}`);
    for (const claim of publishedClaims) {
      expect(text).toContain(`${claim.system} ${claim.benchmark} ${claim.figure}`);
      expect(markup).toContain(`href="${claim.href}"`);
    }
    expect(text).toContain(`checked ${longDate(publishedClaimsCheckedOn)}`);
    expect(text).toContain("not a matched ranking");
    expect(text).toContain("Selected figures other memory systems publish on their own pages");

  });

  test("prose surfaces cite the LongMemEval-S figures derived from the vendored result, never the in-sample pipeline", async () => {
    const [semantic, bm25] = longMemEvalArms;
    const read = async (...path: string[]) => (await readFile(join(repository, ...path), "utf8")).replace(/\s+/g, " ");
    for (const path of [["README.md"], ["CHANGELOG.md"]]) {
      const prose = await read(...path);
      expect(prose, path.join("/")).toContain(`${semantic?.percent}% and BM25 ${bm25?.percent}%`);
      expect(prose, path.join("/")).toContain("on the measure Oh named before the run, its interval does not rule out a tie");
    }
    expect(await read("docs", "evidence.md")).toContain(`${longMemEvalFacts.questions}-question LongMemEval-S`);
    expect(await read("site", "public", "llms.txt")).toContain("https://wordcell.io/benchmarks");
    for (const path of [["README.md"], ["CHANGELOG.md"], ["docs", "evidence.md"], ["docs", "comparisons.md"], ["site", "public", "llms.txt"]]) {
      const prose = await read(...path);
      expect(prose, path.join("/")).not.toContain(longMemEvalLabPipeline.percent);
      // Oh's older, unmatched GPT-5 mini figure; the launch plan's claims check keeps it off every surface.
      expect(prose, path.join("/")).not.toContain("89.8");
    }
  });

  test("metadata has a canonical path and a description of 110 to 160 characters", () => {
    expect(benchmarksMetadata.alternates?.canonical).toBe("/benchmarks");
    expect(benchmarksMetadata.title).toBe("Wordcell and Oh benchmarks, with their limits");
    const description = String(benchmarksMetadata.description);
    expect(description.length).toBeGreaterThanOrEqual(110);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(benchmarksMetadata.openGraph?.description).toBe(description);
    expect(`${String(benchmarksMetadata.title)} ${description}`).not.toMatch(/\u2014|\bSOTA\b/);
  });
});

/** GitHub-style heading anchors for a doc under docs/. */
async function docAnchors(name: string): Promise<ReadonlySet<string>> {
  const source = await readFile(join(repository, "docs", `${name}.md`), "utf8");
  const anchors = new Set<string>();
  let fenced = false;
  for (const line of source.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const heading = fenced ? null : /^#{1,6} (.+)$/u.exec(line);
    if (heading?.[1] === undefined) continue;
    anchors.add(heading[1].toLowerCase().replace(/[^\p{L}\p{N} -]/gu, "").replace(/ /g, "-"));
  }
  return anchors;
}

/** Every /docs/<name>#<anchor> link in the markup names a real doc heading. */
async function expectDocLinksResolve(markup: string): Promise<number> {
  const links = [...markup.matchAll(/href="\/docs\/([a-z0-9-]+)(?:#([a-z0-9-]+))?"/g)];
  for (const [, name, anchor] of links) {
    if (name === undefined) throw new TypeError("A docs link needs a name.");
    const anchors = await docAnchors(name);
    if (anchor !== undefined) expect(anchors.has(anchor), `/docs/${name}#${anchor}`).toBe(true);
  }
  return links.length;
}

describe("/compare/supermemory", () => {
  test("renders the differences, both choices, and every pricing cell with its checked-on date", async () => {
    const markup = renderToStaticMarkup(<CompareSupermemory />);
    const text = pageText(markup);
    const checkedOn = longDate(supermemoryPricing.checkedOn);
    expect(markup.match(/<h1[ >]/g)?.length).toBe(1);
    for (const topic of ["Where memory lives", "How memories form", "Whose memory", "Cost", "Connectors", "Compliance", "Agent access"]) {
      expect(markup).toContain(`<dt>${topic}</dt>`);
    }
    expect(markup).toContain('id="choose-supermemory">Choose Supermemory when</h3>');
    expect(markup).toContain('id="choose-wordcell">Choose Wordcell when</h3>');
    const differences = /<details class="wordcell-comparison-sources">([\s\S]*?)<\/details>/u.exec(markup)?.[1] ?? "";
    const supermemoryCells = [...differences.matchAll(/<dd><strong>Supermemory:<\/strong> (.*?)<\/dd>/gsu)].map((match) => match[1] ?? "");
    expect(supermemoryCells.length).toBe(7);
    for (const cell of supermemoryCells) expect(cell).toContain('<a href="https://supermemory.ai/');
    const cost = /<dt>Cost<\/dt><dd><strong>Supermemory:<\/strong> (.*?)<\/dd>/su.exec(markup)?.[1] ?? "";
    expect(cost).toContain(`href="${supermemoryPricing.href}"`);
    expect(cost).toContain('href="https://supermemory.ai/docs/self-hosting/overview"');
    expect(cost).toContain(checkedOn);
    expect(pageText(cost)).toContain("Supermemory local is free and open source, without connectors or the Supermemory MCP.");
    expect(pageText(cost)).toContain("plans run from $0 a month to $399 a month");
    expect(pageText(cost)).toContain("Enterprise pricing is custom.");
    expect(text.split(checkedOn).length - 1).toBe(4);
    expect(text.split("every plan").length - 1).toBe(1);
    expect(text).toContain("Supermemory is a hosted memory engine for agents and the apps you build. Wordcell keeps your memory in Markdown files you own.");
    expect(markup).toContain('href="https://supermemory.ai/">MCP server or plugins</a>');
    expect(text).toContain("You want memory as plain files, with no hosted service, no account, and no usage bill.");
    expect(text).toContain("up to 512 bytes of its snippet");
    expect(text).not.toMatch(/\bbounded\b|\bwe\b/iu);
    for (const plan of supermemoryPricing.plans) {
      expect(text).toContain(`${plan.name} ${formatPlanPrice(plan)} ${formatPlanCredits(plan)} ${plan.note}`);
    }
    for (const rate of supermemoryPricing.usage) expect(text).toContain(`${rate.item} ${formatUsageRate(rate)}`);
    for (const term of supermemoryPricing.terms) expect(text).toContain(term);
    expect(text).toContain(`Monthly plans, checked ${checkedOn}`);
    expect(text).toContain(`Usage rates on every plan, checked ${checkedOn}`);
    expect(markup).toContain(`href="${supermemoryPricing.href}"`);
    expect(text).toContain("wordcell mcp serves a vault to local MCP clients.");
    expect(text).not.toMatch(/from source|until the next release/u);
    expect(text).not.toContain("88.87");
    expect(text).not.toContain(longMemEvalLabPipeline.percent);
    expect(markup).toContain('href="/migrate/supermemory"');
    expect(markup).toContain('href="/benchmarks#comparisons"');
    expect(await expectDocLinksResolve(markup)).toBeGreaterThanOrEqual(4);
    expect(text).not.toMatch(notSota);
    expect(text).not.toMatch(/\bfair\b|\bhonest\b|\u2014/i);
  });

  test("metadata has a canonical path and a description of 110 to 160 characters", () => {
    expect(compareMetadata.alternates?.canonical).toBe("/compare/supermemory");
    const description = String(compareMetadata.description);
    expect(description.length).toBeGreaterThanOrEqual(110);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(compareMetadata.openGraph?.description).toBe(description);
    expect(`${String(compareMetadata.title)} ${description}`).not.toMatch(/\u2014|\bSOTA\b/);
  });
});

describe("/compare/basic-memory", () => {
  test("renders the differences, both choices, and the moving-notes limits with cited sources", async () => {
    const markup = renderToStaticMarkup(<CompareBasicMemory />);
    const text = pageText(markup);
    const checkedOn = longDate(basicMemoryCheckedOn);
    expect(markup.match(/<h1[ >]/g)?.length).toBe(1);
    for (const topic of ["Where notes live", "How notes form", "Note structure", "Search", "Agent access", "Repository context", "Cost"]) {
      expect(markup).toContain(`<dt>${topic}</dt>`);
    }
    expect(markup).toContain('id="choose-basic-memory">Choose Basic Memory when</h3>');
    expect(markup).toContain('id="choose-wordcell">Choose Wordcell when</h3>');
    const differences = /<details class="wordcell-comparison-sources">([\s\S]*?)<\/details>/u.exec(markup)?.[1] ?? "";
    const basicMemoryCells = [...differences.matchAll(/<dd><strong>Basic Memory:<\/strong> (.*?)<\/dd>/gsu)].map((match) => match[1] ?? "");
    expect(basicMemoryCells.length).toBe(7);
    for (const cell of basicMemoryCells) expect(cell).toContain('<a href="https://');
    for (const href of Object.values(basicMemoryPages)) expect(markup).toContain(`href="${href}"`);
    expect(text).toContain(`Basic Memory’s features and license were checked on ${checkedOn}.`);
    for (const literal of ["write_note", "edit_note", "search_notes", "read_note", "build_context", "[category]", "relation [[Note]]", "[[note-id]]", "relations:", "wordcell check", "wordcell mcp", "repository_scopes", "wordcell context"]) {
      expect(markup).toContain(`<code>${literal}</code>`);
    }
    expect(text).toContain("wordcell mcp serves a vault to local MCP clients.");
    expect(text).not.toMatch(/from source|until the next release/u);
    expect(text).toContain("AGPL-3.0");
    expect(text).toContain("requires a subscription");
    expect(markup).toContain('href="/docs/comparisons#consider-basic-memory-for-an-mcp-centered-knowledge-graph"');
    expect(await expectDocLinksResolve(markup)).toBeGreaterThanOrEqual(6);
    expect(text).not.toMatch(notSota);
    expect(text).not.toMatch(/\bfair\b|\bhonest\b|—/i);
  });

  test("metadata has a canonical path and a description of 110 to 160 characters", () => {
    expect(compareBasicMemoryMetadata.alternates?.canonical).toBe("/compare/basic-memory");
    const description = String(compareBasicMemoryMetadata.description);
    expect(description.length).toBeGreaterThanOrEqual(110);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(compareBasicMemoryMetadata.openGraph?.description).toBe(description);
    expect(`${String(compareBasicMemoryMetadata.title)} ${description}`).not.toMatch(/—|\bSOTA\b/);
  });
});

describe("/compare/mem0", () => {
  test("renders the differences, both choices, and the moving-memories limits with cited sources", async () => {
    const markup = renderToStaticMarkup(<CompareMem0 />);
    const text = pageText(markup);
    const checkedOn = longDate(mem0CheckedOn);
    expect(markup.match(/<h1[ >]/g)?.length).toBe(1);
    for (const topic of ["Where memory lives", "How memories form", "Whose memory", "Platform and open source", "Change over time", "Cost", "Agent access"]) {
      expect(markup).toContain(`<dt>${topic}</dt>`);
    }
    expect(markup).toContain('id="choose-mem0">Choose Mem0 when</h3>');
    expect(markup).toContain('id="choose-wordcell">Choose Wordcell when</h3>');
    const differences = /<details class="wordcell-comparison-sources">([\s\S]*?)<\/details>/u.exec(markup)?.[1] ?? "";
    const mem0Cells = [...differences.matchAll(/<dd><strong>Mem0:<\/strong> (.*?)<\/dd>/gsu)].map((match) => match[1] ?? "");
    expect(mem0Cells.length).toBe(7);
    for (const cell of mem0Cells) expect(cell).toContain('<a href="https://docs.mem0.ai/');
    for (const href of Object.values(mem0Pages)) expect(markup).toContain(`href="${href}"`);
    expect(text).toContain(`Mem0’s features and license were checked on ${checkedOn}.`);
    for (const literal of ["add", "user_id", "agent_id", "run_id", "app_id", "get_all", "mcp.mem0.ai", "supersedes", "wordcell mcp", "wordcell import mem0", "/migrate"]) {
      expect(markup).toContain(`<code>${literal}</code>`);
    }
    expect(text).toContain("Platform-only");
    expect(text).toContain("Apache-2.0");
    expect(text).toContain("wordcell mcp serves a vault to local MCP clients over standard input and output.");
    expect(text).not.toMatch(/from source|until the next release/u);
    expect(markup).toContain('href="https://mem0.ai/research"');
    expect(markup).toContain('href="/benchmarks#comparisons"');
    expect(markup).toContain('href="/docs/comparisons#consider-mem0-for-extracted-memories-in-your-application"');
    expect(await expectDocLinksResolve(markup)).toBeGreaterThanOrEqual(4);
    expect(text).not.toMatch(notSota);
    expect(text).not.toMatch(/\bfair\b|\bhonest\b|—/i);
  });

  test("metadata has a canonical path and a description of 110 to 160 characters", () => {
    expect(compareMem0Metadata.alternates?.canonical).toBe("/compare/mem0");
    const description = String(compareMem0Metadata.description);
    expect(description.length).toBeGreaterThanOrEqual(110);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(compareMem0Metadata.openGraph?.description).toBe(description);
    expect(`${String(compareMem0Metadata.title)} ${description}`).not.toMatch(/—|\bSOTA\b/);
  });
});

describe("/compare/obsidian", () => {
  test("cites current Obsidian capabilities and links the workflow for using the same notes", async () => {
    const markup = renderToStaticMarkup(<CompareObsidian />);
    const text = pageText(markup);
    for (const href of Object.values(obsidianPages)) expect(markup).toContain(`href="${href}"`);
    expect(text).toContain(longDate(obsidianCheckedOn));
    expect(text).toContain("Obsidian CLI");
    expect(text).toContain("running desktop app");
    expect(text).toContain("same Markdown vault");
    expect(text).toContain("wordcell context");
    expect(text).toContain("wordcell history");
    expect(await expectDocLinksResolve(markup)).toBeGreaterThanOrEqual(6);
    expect(text).not.toMatch(notSota);
  });

  test("metadata names the comparison and its canonical route", () => {
    expect(compareObsidianMetadata.alternates?.canonical).toBe("/compare/obsidian");
    const description = String(compareObsidianMetadata.description);
    expect(description.length).toBeGreaterThanOrEqual(110);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(compareObsidianMetadata.openGraph?.description).toBe(description);
  });
});

describe("/compare/claude-mem", () => {
  test("cites the pinned Claude-Mem release and its documentation for every cell", async () => {
    const markup = renderToStaticMarkup(<CompareClaudeMem />);
    const text = pageText(markup);
    expect(markup.match(/<h1[ >]/g)?.length).toBe(1);
    for (const topic of ["How memory forms", "Session start", "Storage", "Fresh clone or another machine", "Model use", "Agents", "Review and edit", "License"]) {
      expect(markup).toContain(`<dt>${topic}</dt>`);
    }
    const differences = /<details class="wordcell-comparison-sources">([\s\S]*?)<\/details>/u.exec(markup)?.[1] ?? "";
    const claudeMemCells = [...differences.matchAll(/<dd><strong>Claude-Mem:<\/strong> (.*?)<\/dd>/gsu)].map((match) => match[1] ?? "");
    expect(claudeMemCells.length).toBe(8);
    for (const cell of claudeMemCells) expect(cell).toMatch(/<a href="https:\/\/(?:docs\.claude-mem\.ai|github\.com\/thedotmack\/claude-mem\/blob\/v)/u);
    for (const href of Object.values(claudeMemPages)) expect(markup).toContain(`href="${href}"`);
    expect(claudeMemPages.hooks).toContain(`/blob/v${claudeMemVersion}/`);
    expect(text).toContain(`Claude-Mem ${claudeMemVersion}, its documentation, and its source were checked on ${longDate(claudeMemCheckedOn)}.`);
    expect(text).toContain("it was not run for this page");
    expect(markup).toContain('id="choose-claude-mem">Choose Claude-Mem when</h3>');
    expect(markup).toContain('id="choose-wordcell">Choose Wordcell when</h3>');
    // The table includes rows where Claude-Mem is ahead, such as capturing memory on its own.
    const table = /<figure\b[^>]*class="hraness-marketing-comparison\b[\s\S]*?<\/figure>/u.exec(markup)?.[0] ?? "";
    const firstRow = table.slice(table.indexOf("<tbody>")).split("<tr>")[1] ?? "";
    expect(firstRow.match(/data-comparison-status="(\w+)"/gu)).toEqual(['data-comparison-status="no"', 'data-comparison-status="yes"']);
    for (const literal of ["~/.claude-mem/claude-mem.db", "CLAUDE_MEM_PROJECT_NAME_SOURCE=git-remote", "CLAUDE_MEM_SESSION_START_INCLUDE_ALL_SOURCES", "CLAUDE_MEM_SKIP_TOOLS", "wordcell mcp", "--root"]) {
      expect(markup).toContain(`<code>${literal}</code>`);
    }
    expect(markup).toContain('href="/docs/agent-handoffs"');
    expect(await expectDocLinksResolve(markup)).toBeGreaterThanOrEqual(3);
    expect(text).not.toMatch(notSota);
    expect(text).not.toMatch(/\bfair\b|\bhonest\b|\bwe\b|\u2014/iu);
  });

  test("metadata has a canonical path, a description of 110 to 160 characters, and noindex until review", () => {
    expect(compareClaudeMemMetadata.alternates?.canonical).toBe("/compare/claude-mem");
    const description = String(compareClaudeMemMetadata.description);
    expect(description.length).toBeGreaterThanOrEqual(110);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(compareClaudeMemMetadata.openGraph?.description).toBe(description);
    expect(`${String(compareClaudeMemMetadata.title)} ${description}`).not.toMatch(/\u2014|\bSOTA\b/u);
    const robots = compareClaudeMemMetadata.robots;
    if (isComparisonIndexable("/compare/claude-mem")) expect(robots).toBeUndefined();
    else expect(robots).toMatchObject({ index: false });
  });

  test("the review record follows the article rubric and decides where the page is listed", async () => {
    expect(() => assertArticleAdmissions(comparisonAdmissions)).not.toThrow();
    expect(claudeMemAdmission.sources.every((source) => source.checkedOn === claudeMemCheckedOn)).toBe(true);
    const sitemap = await readFile(join(repository, "site", "public", "sitemap.xml"), "utf8");
    const llms = await readFile(join(repository, "site", "public", "llms.txt"), "utf8");
    const home = renderToStaticMarkup(<Home />);
    for (const admission of comparisonAdmissions) {
      const url = `https://wordcell.io${admission.href}`;
      if (isArticleIndexable(admission)) {
        expect((launchRoutes as readonly string[]).includes(admission.href), admission.href).toBe(true);
        expect((reviewPendingRoutes as readonly string[]).includes(admission.href), admission.href).toBe(false);
      } else {
        expect((reviewPendingRoutes as readonly string[]).includes(admission.href), admission.href).toBe(true);
        expect((launchRoutes as readonly string[]).includes(admission.href), admission.href).toBe(false);
        expect(sitemap).not.toContain(`<loc>${url}</loc>`);
        expect(llms).not.toContain(url);
        expect(home).not.toContain(`href="${admission.href}"`);
      }
    }
  });
});

describe("/migrate/supermemory", () => {
  test("every step command is one the migration guide or Get started documents", async () => {
    const guide = await readFile(join(repository, "docs", "migration-from-supermemory.md"), "utf8");
    const gettingStarted = await publishedGettingStarted();
    expect(migrationSteps.map((step) => step.id)).toEqual(["install", "export", "import", "verify"]);
    for (const step of migrationSteps) {
      expect(step.commands.length).toBeGreaterThan(0);
      // The guide sends readers to Get started for the install, which the site renders with the admitted release.
      const source = step.id === "install" ? gettingStarted : guide;
      for (const command of step.commands) expect(source, command).toContain(command);
    }
    const [install] = migrationSteps;
    expect(install.href).toBe("/docs/getting-started#install-the-cli");
    expect(guide).toContain("(getting-started.md#install-the-cli)");
    const guideAnchors = await docAnchors("migration-from-supermemory");
    for (const anchor of ["map-supermemory-concepts-to-wordcell", "connect-your-agent", "replace-connectors", "what-does-not-transfer"]) {
      expect(guideAnchors.has(anchor), anchor).toBe(true);
    }
    for (const concept of migrationConcepts) expect(guide).toContain(concept.supermemory);
    expect(guide.replace(/\s+/g, " ")).toContain("With the Python script, name `supermemory-export.json` in place of the two patterns.");
  });

  test("renders the guide link first, the concepts, the steps, the setup links, and the release the commands need", async () => {
    const markup = renderToStaticMarkup(<MigrateSupermemory />);
    const text = pageText(markup);
    const commandText = text.replace(/\s*([<>])\s*/gu, "$1");
    expect(markup.match(/<h1[ >]/g)?.length).toBe(1);
    const firstDocsLink = /href="(\/docs\/[^"]*)"/.exec(markup)?.[1];
    expect(firstDocsLink).toBe(MIGRATION_GUIDE_PATH);
    // The header action leads to this page's own install step, not the release install on the home page.
    expect(markup).toMatch(/hraness-marketing-action[^>]*href="#install">Install Wordcell<\/a>/u);
    expect(markup).toContain('id="install"');
    const rendered = (node: ReactNode) => pageText(renderToStaticMarkup(<>{node}</>)).trim();
    for (const concept of migrationConcepts) {
      expect(text).toContain(`${concept.supermemory} ${rendered(concept.wordcell)}`);
      if (concept.href !== undefined) expect(markup).toContain(`<a href="${concept.href}">${concept.supermemory}</a>`);
    }
    for (const literal of ["container_tag", "articles/", "notes/imported/memories/", "supersedes", "type: profile", "wordcell percolate", "wordcell mcp", "update_note_body"]) {
      expect(markup).toContain(`<code>${literal}</code>`);
    }
    migrationSteps.forEach((step, index) => {
      expect(text).toContain(`${index + 1} ${step.title}`);
      expect(text).toContain(rendered(step.lead));
      for (const command of step.commands) {
        expect(commandText).toContain(command.replace(/\s*([<>])\s*/gu, "$1"));
      }
      expect(markup).toContain(`href="${step.href}"`);
    });
    const exportStep = markup.slice(markup.indexOf('id="export"'), markup.indexOf('id="import"'));
    expect(exportStep.replace(/<\/?span\b[^>]*>/gu, "")).toContain("sh export-supermemory.sh");
    expect(markup).not.toMatch(/checkout|git clone|bun link/u);
    expect(text).toContain("Work in a directory outside any vault, so that the export files are never committed.");
    expect(text).toContain("The script saves your documents, and the memory entries for each container tag, as JSON pages.");
    expect(text).toContain("With the Python script, name supermemory-export.json in place of the two patterns.");
    expect(text).toContain("Install, export, import, and verify");
    expect(text).not.toMatch(/\bcheck the result\b/u);
    expect(text).toContain(`Import from Supermemory and the local MCP server need Wordcell ${AGENT_MEMORY_RELEASE} or later.`);
    expect(text).toContain(`The importer needs Wordcell ${AGENT_MEMORY_RELEASE} or later.`);
    expect(text).toContain(`Supermemory’s features were checked on ${longDate(supermemoryFeaturesCheckedOn)}.`);
    for (const href of Object.values(supermemoryPages)) expect(markup).toContain(`href="${href}"`);
    expect(markup).not.toMatch(/<p[^>]*>wordcell (mcp|import)/u);
    expect(text).not.toMatch(/from source|until the next release/u);
    expect(text).toContain(SETUP_PROMPT.replace(/\s+/g, " "));
    expect(markup).toContain('aria-label="Copy setup prompt"');
    expect(markup).toContain('href="/compare/supermemory"');
    expect(markup).toContain("skills/wordcell/references/session-memory.md#keep-a-profile-note");
    expect(await expectDocLinksResolve(markup)).toBeGreaterThanOrEqual(6);
    expect(text).not.toMatch(notSota);
    expect(text).not.toContain("\u2014");
  });

  test("metadata has a canonical path and a description of 110 to 160 characters", () => {
    expect(migrateMetadata.alternates?.canonical).toBe("/migrate/supermemory");
    const description = String(migrateMetadata.description);
    expect(description.length).toBeGreaterThanOrEqual(110);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(migrateMetadata.openGraph?.description).toBe(description);
    expect(`${String(migrateMetadata.title)} ${description}`).not.toMatch(/\u2014|\bSOTA\b/);
  });
});

describe("discovery files", () => {
  const launchPaths = launchRoutes;
  const site = join(repository, "site");

  test("the sitemap lists each launch page once", async () => {
    const sitemap = (await readFile(join(site, "public", "sitemap.xml"), "utf8")).replace(/\s+/g, "");
    for (const path of launchPaths) {
      const entry = `<url><loc>https://wordcell.io${path}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`;
      expect(sitemap.split(entry).length - 1, path).toBe(1);
    }
  });

  test("llms.txt lists each launch page under Pages and keeps its summary and the site description", async () => {
    const llms = await readFile(join(site, "public", "llms.txt"), "utf8");
    const pages = llms.slice(llms.indexOf("\n## Pages\n"), llms.indexOf("\n## Blog\n"));
    expect(pages.length).toBeGreaterThan(0);
    for (const path of launchPaths) expect(pages).toContain(`](https://wordcell.io${path}):`);
    expect(llms.split("\n").slice(0, 5).join("\n")).toBe(
      "# Wordcell\n\n> Wordcell keeps decisions, plans, and sources as Markdown beside your code,\n> so coding agents can find them from the file they are about to change.\n",
    );
    expect(siteDescription).toBe(
      "Wordcell keeps decisions, plans, and sources as Markdown beside your code, so coding agents can find them from the file they are about to change.",
    );
  });
});

describe("stacked tables", () => {
  const pages = [
    { name: "/benchmarks", markup: () => renderToStaticMarkup(<Benchmarks />), tables: 3 },
    { name: "/compare/basic-memory", markup: () => renderToStaticMarkup(<CompareBasicMemory />), tables: 0, compact: true },
    { name: "/compare/obsidian", markup: () => renderToStaticMarkup(<CompareObsidian />), tables: 0, compact: true },
    { name: "/compare/mem0", markup: () => renderToStaticMarkup(<CompareMem0 />), tables: 0, compact: true },
    { name: "/compare/supermemory", markup: () => renderToStaticMarkup(<CompareSupermemory />), tables: 2, compact: true },
    { name: "/compare/claude-mem", markup: () => renderToStaticMarkup(<CompareClaudeMem />), tables: 0, compact: true },
    { name: "/migrate/supermemory", markup: () => renderToStaticMarkup(<MigrateSupermemory />), tables: 1 },
  ];

  for (const page of pages) {
    test(`${page.name} keeps compact and stacked table data labelled on narrow screens`, () => {
      const markup = page.markup();
      const tables = markup.split('class="wordcell-comparison wordcell-stack"').slice(1).map((part) => part.slice(0, part.indexOf("</table>")));
      expect(tables).toHaveLength(page.tables);
      if ("compact" in page) {
        const compact = /<figure\b[^>]*class="hraness-marketing-comparison\b[\s\S]*?<\/figure>/u.exec(markup)?.[0] ?? "";
        expect(compact).toContain('role="region"');
        expect(compact).toContain('tabindex="0"');
        expect(compact).toContain("<caption");
        expect(compact.match(/scope="col"/gu)).toHaveLength(2);
        const rows = compact.slice(compact.indexOf("<tbody>")).split("<tr>").slice(1);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row).toContain('scope="row"');
          expect(row.match(/<td\b/gu)).toHaveLength(2);
        }
      }

      expect(markup.split('class="wordcell-comparison"').length).toBe(1);
      for (const table of tables) {
        const headers = [...table.matchAll(/<th scope="col">(.*?)<\/th>/g)].map((match) => pageText(match[1] ?? "").trim());
        const rows = table.slice(table.indexOf("<tbody>")).split("<tr").slice(1);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          const labels = [...row.matchAll(/<td data-label="([^"]*)"/g)].map((match) => pageText(match[1] ?? ""));
          expect(labels).toEqual(headers.slice(1));
          expect(row.split("<td").length - 1).toBe(labels.length);
        }
      }
    });
  }
});

describe("launch styles", () => {
  test("code keeps every character visible, links in launch tables and lists stay underlined, and stacked tables collapse on narrow screens", async () => {
    const css = await readFile(join(import.meta.dir, "../wordcell/wordcell.css"), "utf8");
    expect(css).toMatch(/code,\s*kbd,\s*samp,\s*pre\s*\{\s*font-variant-ligatures:\s*none;/);
    expect(css).toMatch(/\.wordcell-comparison :is\(th, td\) a,\s*\.wordcell-limits a \{\s*text-decoration-line: underline;/u);
    const narrow = css.slice(css.indexOf("@media (max-width: 40rem)"));
    expect(narrow).toContain(".wordcell-comparison.wordcell-stack table {\n    min-width: 0;");
    expect(narrow).toContain(".wordcell-comparison.wordcell-stack tbody td[data-label]::before {\n    content: attr(data-label);");
  });
});
