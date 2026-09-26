import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BenchmarkComparison, type BenchmarkStudy } from "../wordcell/benchmark-comparison";
import { scifactStudy } from "../wordcell/benchmark-evidence";
import {
  locomoArms,
  locomoCategories,
  locomoFacts,
  locomoLimitQuotes,
  locomoPaired,
  locomoStudy,
  ohAttribution,
  ohLinks,
  ohSources,
  pilotArms,
  pilotInterval,
  pilotLimitQuotes,
  pilotSecondaryInterval,
  pilotStudy,
  quoteFrom,
} from "../wordcell/oh-evidence";
import { publishedClaims, publishedClaimsCheckedOn } from "../wordcell/published-claims";
import { formatPlanCredits, formatPlanPrice, formatUsageRate, supermemoryPricing } from "../wordcell/supermemory-pricing";
import Benchmarks, { metadata as benchmarksMetadata } from "../app/benchmarks/page";
import CompareSupermemory, { metadata as compareMetadata } from "../app/compare/supermemory/page";
import MigrateSupermemory, { metadata as migrateMetadata } from "../app/migrate/supermemory/page";
import {
  MIGRATION_GUIDE_PATH,
  migrationConcepts,
  migrationSteps,
  supermemoryFeaturesCheckedOn,
  supermemoryPages,
} from "../wordcell/migration-steps";
import { grouped, longDate, prose, signed } from "../wordcell/format";
import { formatBytes, handoffEvidence } from "../wordcell/handoff-evidence";
import { SetupLinks } from "../wordcell/setup-links";
import { siteDescription } from "../app/site-description";
import { launchRoutes } from "../wordcell/launch-routes";
import { publishedRelease } from "../app/publication";
import {
  CONNECT_CLIENT_URL,
  MAX_SETUP_URL,
  SETUP_COMMANDS,
  SETUP_PROMPT,
  SETUP_VAULT_PATH,
  setupTargets,
} from "../wordcell/setup-prompt";

const repository = join(import.meta.dir, "..", "..");
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
    expect(artifacts.length).toBe(2);
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
    ]);
    for (const href of Object.values(ohLinks)) {
      expect(href).toStartWith("https://github.com/hraness/oh/blob/9edd9f1bc18d0f4c15b040add10caad26e782275/benchmarks/");
    }
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
  const linkParameter = { chatgpt: ["chatgpt.com", "q"], grok: ["grok.com", "q"], cursor: ["cursor.com", "text"] } as const;

  test("every link carries the whole prompt and fits the URL cap", () => {
    const targets = setupTargets();
    expect(targets.map((target) => target.id)).toEqual(["chatgpt", "grok", "cursor", "claude-code", "codex"]);
    expect(MAX_SETUP_URL).toBeLessThan(10_000);
    for (const target of targets) {
      if (target.kind !== "link") continue;
      expect(target.href.length).toBeLessThanOrEqual(MAX_SETUP_URL);
      const url = new URL(target.href);
      const [host, parameter] = linkParameter[target.id];
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe(host);
      expect([...url.searchParams.keys()]).toEqual([parameter]);
      expect(url.searchParams.get(parameter)).toBe(SETUP_PROMPT);
      expect(target.href.endsWith(encodeURIComponent(SETUP_PROMPT))).toBe(true);
    }
    expect(JSON.stringify(targets)).not.toContain("claude.ai");
    const custom = setupTargets("a & b + c #d");
    const [first] = custom;
    expect(first?.kind === "link" ? new URL(first.href).searchParams.get("q") : null).toBe("a & b + c #d");
  });

  test("the prompt labels the from-source install and matches the documented commands", async () => {
    const migration = await readFile(join(repository, "docs", "migration-from-supermemory.md"), "utf8");
    const reference = await readFile(join(repository, "docs", "reference.md"), "utf8");
    expect(SETUP_PROMPT).toContain("`wordcell mcp` is available from source until the next release");
    expect(migration).toContain(SETUP_COMMANDS.install.join("\n"));
    for (const command of SETUP_COMMANDS.install) expect(SETUP_PROMPT).toContain(`   ${command}\n`);
    expect(reference).toContain(SETUP_COMMANDS.codex);
    expect(reference).toContain(SETUP_COMMANDS.claudeCode.replace("--scope user", "--scope project"));
    expect(reference).toContain("use `--scope user` for all your projects");
    expect(reference).toContain("~/.cursor/mcp.json");
    expect(reference).toContain("\n### Connect a client\n");
    expect(CONNECT_CLIENT_URL).toBe("https://wordcell.io/docs/reference#connect-a-client");
    for (const command of [SETUP_COMMANDS.init, SETUP_COMMANDS.claudeCode, SETUP_COMMANDS.codex, SETUP_COMMANDS.skill, CONNECT_CLIENT_URL]) {
      expect(SETUP_PROMPT).toContain(command);
    }
    expect(SETUP_COMMANDS.claudeCode).toContain(`--root ${SETUP_VAULT_PATH}`);
    expect(SETUP_PROMPT).toContain("session-memory reference");
    expect(await readFile(join(repository, "skills", "wordcell", "references", "session-memory.md"), "utf8")).toContain("## Keep a profile note");
    expect(SETUP_PROMPT).not.toContain("\u2014");
    expect(SETUP_PROMPT).not.toMatch(notSota);
  });

  test("the setup block renders the prompt, the copy button, three links, and two commands", () => {
    const markup = renderToStaticMarkup(<SetupLinks />);
    expect(markup).toContain(">Copy prompt</button>");
    expect(markup).toContain('aria-live="polite"');
    expect(markup.match(/<a /g)?.length).toBe(3);
    for (const target of setupTargets()) {
      if (target.kind === "link") expect(markup).toContain(`href="${target.href.replaceAll("'", "&#x27;")}"`);
      else expect(markup).toContain(`<code>${target.command}</code>`);
    }
    expect(markup).toContain(SETUP_COMMANDS.skill);
    expect(markup).not.toContain("Copied the setup prompt");
  });

  test("the register-it-yourself sentence names the source install while the published release lacks wordcell mcp", async () => {
    const changelog = await readFile(join(repository, "CHANGELOG.md"), "utf8");
    const mcpEntry = changelog.indexOf("`wordcell mcp");
    const publishedSection = publishedRelease === null ? -1 : changelog.indexOf(`\n## ${publishedRelease.version}\n`);
    expect(mcpEntry).toBeGreaterThan(-1);
    const releaseLacksMcp = publishedSection === -1 || mcpEntry < publishedSection;
    const markup = pageText(renderToStaticMarkup(<SetupLinks />));
    if (releaseLacksMcp) {
      expect(markup).toContain("With Wordcell installed from source, you can register the server yourself.");
      expect(markup).not.toContain("already installed");
    }
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

  test("renders every derived figure, the attribution, the limits, and the published-claims table", () => {
    const markup = renderToStaticMarkup(<Benchmarks />);
    const text = pageText(markup);
    expect(markup.match(/<h1[ >]/g)?.length).toBe(1);
    expect(text).toContain(ohAttribution);
    expect(text).toContain(`${formatBytes(handoffEvidence.packedBytes)} Packed snippets`);
    expect(text).toContain(formatBytes(handoffEvidence.fullNoteBytes));
    expect(text).toContain(`${handoffEvidence.reductionPercent}% fewer UTF-8 bytes`);
    for (const arm of locomoArms) expect(text).toContain(`${arm.percent}%`);
    for (const category of locomoCategories) {
      expect(text).toContain(`${category.name} ${grouped(category.questions)} ${category.percents.map((percent) => `${percent}%`).join(" ")}`);
    }
    for (const paired of locomoPaired) {
      for (const value of [paired.better, paired.worse, paired.tied]) expect(text).toContain(grouped(value));
    }
    for (const arm of pilotArms) expect(text).toContain(`${arm.percent}%`);
    for (const interval of [pilotInterval, pilotSecondaryInterval]) {
      expect(text).toContain(`${signed(interval.estimate)} percentage points, with a 95% interval from ${signed(interval.lower)} to ${signed(interval.upper)}`);
    }
    for (const quote of [...locomoLimitQuotes, ...pilotLimitQuotes]) expect(text).toContain(`“${quote}`);
    expect(text).toContain("Limits");
    for (const claim of publishedClaims) {
      expect(text).toContain(`${claim.system} ${claim.benchmark} ${claim.figure}`);
      expect(markup).toContain(`href="${claim.href}"`);
    }
    expect(text).toContain(`checked ${longDate(publishedClaimsCheckedOn)}`);
    expect(text).toContain("not a matched ranking");
    expect(text).toContain("Selected figures other memory systems publish on their own pages");
    for (const needle of ["no confidence interval", "had been evaluated before", "used during development", "questions are not", "one fixed profile", "indexed per session", "does not rank the three systems"]) {
      expect(text.split(needle).length - 1, needle).toBe(1);
    }
    expect(text).toContain("Oh ran one small pilot of Supermemory, Oh, and BM25 under one protocol; it is Oh’s result, not Wordcell’s.");
    expect(text).toContain("Each Wordcell and Oh result here links its raw data");
    expect(text).toContain("Each Wordcell and Oh figure on this page comes from a file");
    expect(text).toContain("The published figures in the table link their sources.");
    for (const href of Object.values(ohLinks)) expect(markup).toContain(`href="${href}"`);
    for (const source of ohSources) expect(markup).toContain(`href="${source.href}"`);
    expect(markup).toContain('href="/docs/evidence"');
    expect(markup).toContain('href="/docs/reranking#evidence-and-limits"');
    expect(text).not.toMatch(notSota);
    expect(text).not.toContain("89.8%");
    expect(text).not.toContain("\u2014");
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
      expect(markup).toContain(`<th scope="row">${topic}</th>`);
    }
    expect(markup).toContain('id="choose-supermemory">Choose Supermemory when</h3>');
    expect(markup).toContain('id="choose-wordcell">Choose Wordcell when</h3>');
    const differences = markup.slice(markup.indexOf('aria-label="Supermemory and Wordcell differences"'), markup.indexOf("</table>"));
    const supermemoryCells = [...differences.matchAll(/<td data-label="Supermemory">(.*?)<\/td>/gsu)].map((match) => match[1] ?? "");
    expect(supermemoryCells.length).toBe(7);
    for (const cell of supermemoryCells) expect(cell).toContain('<a href="https://supermemory.ai/');
    const cost = /<th scope="row">Cost<\/th><td data-label="Supermemory">(.*?)<\/td>/su.exec(markup)?.[1] ?? "";
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
    expect(text).toContain("You want memory as plain files, with no server to run, account, or usage bill.");
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
    expect(text).toContain("available from source until the next release");
    expect(text).toContain(`${pilotInterval.pairedQuestions}-question pilot`);
    expect(text).toContain("It is Oh’s result, not Wordcell’s");
    expect(text).toContain("Wordcell has published no head-to-head comparison with Supermemory");
    if (pilotInterval.crossesZero) expect(text).toContain("it does not separate Oh from Supermemory");
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

describe("/migrate/supermemory", () => {
  test("every step command is one the migration guide documents", async () => {
    const guide = await readFile(join(repository, "docs", "migration-from-supermemory.md"), "utf8");
    expect(migrationSteps.map((step) => step.id)).toEqual(["install", "export", "import", "verify"]);
    for (const step of migrationSteps) {
      expect(step.commands.length).toBeGreaterThan(0);
      for (const command of step.commands) expect(guide, command).toContain(command);
    }
    const guideAnchors = await docAnchors("migration-from-supermemory");
    for (const anchor of ["map-supermemory-concepts-to-wordcell", "connect-your-agent", "replace-connectors", "what-does-not-transfer"]) {
      expect(guideAnchors.has(anchor), anchor).toBe(true);
    }
    for (const concept of migrationConcepts) expect(guide).toContain(concept.supermemory);
    expect(guide.replace(/\s+/g, " ")).toContain("With the Python script, name `supermemory-export.json` in place of the two patterns.");
  });

  test("renders the guide link first, the concepts, the steps, the setup links, and the from-source label", async () => {
    const markup = renderToStaticMarkup(<MigrateSupermemory />);
    const text = pageText(markup);
    expect(markup.match(/<h1[ >]/g)?.length).toBe(1);
    const firstDocsLink = /href="(\/docs\/[^"]*)"/.exec(markup)?.[1];
    expect(firstDocsLink).toBe(MIGRATION_GUIDE_PATH);
    const rendered = (node: ReactNode) => pageText(renderToStaticMarkup(<>{node}</>)).trim();
    for (const concept of migrationConcepts) {
      expect(text).toContain(`${concept.supermemory} ${rendered(concept.wordcell)}`);
      if (concept.href !== undefined) expect(markup).toContain(`<a href="${concept.href}">${concept.supermemory}</a>`);
    }
    for (const literal of ["container_tag", "articles/", "notes/imported/memories/", "supersedes", "type: profile", "wordcell percolate", "wordcell mcp", "update_note_body"]) {
      expect(markup).toContain(`<code>${literal}</code>`);
    }
    migrationSteps.forEach((step, index) => {
      expect(text).toContain(`${index + 1} ${step.title} ${rendered(step.lead)} ${step.commands.join(" ")}`);
      expect(markup).toContain(`href="${step.href}"`);
    });
    const exportStep = markup.slice(markup.indexOf('id="export"'), markup.indexOf('id="import"'));
    expect(exportStep.indexOf("Leave the Wordcell checkout")).toBeGreaterThan(-1);
    expect(exportStep.indexOf("Leave the Wordcell checkout")).toBeLessThan(exportStep.indexOf("sh export-supermemory.sh"));
    expect(text).toContain("The script saves your documents, and the memory entries for each container tag, as JSON pages.");
    expect(text).toContain("With the Python script, name supermemory-export.json in place of the two patterns.");
    expect(text).toContain("Install, export, import, and verify");
    expect(text).not.toMatch(/\bcheck the result\b/u);
    expect(text.split("available from source until the next release").length - 1).toBe(2);
    expect(text).toContain(`Supermemory’s features were checked on ${longDate(supermemoryFeaturesCheckedOn)}.`);
    for (const href of Object.values(supermemoryPages)) expect(markup).toContain(`href="${href}"`);
    expect(markup).not.toMatch(/<p[^>]*>wordcell (mcp|import)/u);
    expect(text).toContain("available from source until the next release");
    expect(text).toContain(SETUP_PROMPT.replace(/\s+/g, " "));
    expect(text).toContain("Copy prompt");
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
    { name: "/benchmarks", markup: () => renderToStaticMarkup(<Benchmarks />), tables: 2 },
    { name: "/compare/supermemory", markup: () => renderToStaticMarkup(<CompareSupermemory />), tables: 3 },
    { name: "/migrate/supermemory", markup: () => renderToStaticMarkup(<MigrateSupermemory />), tables: 1 },
  ];

  for (const page of pages) {
    test(`${page.name} labels every data cell with its column header for narrow screens`, () => {
      const markup = page.markup();
      const tables = markup.split('class="wordcell-comparison wordcell-stack"').slice(1).map((part) => part.slice(0, part.indexOf("</table>")));
      expect(tables).toHaveLength(page.tables);
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
    expect(css).toMatch(/\.wordcell-setup__links li \{\s*display: grid;/u);
    expect(css).toMatch(/\.wordcell-comparison :is\(th, td\) a,\s*\.wordcell-limits a \{\s*text-decoration: underline;/u);
    const narrow = css.slice(css.indexOf("@media (max-width: 40rem)"));
    expect(narrow).toContain(".wordcell-comparison.wordcell-stack table {\n    min-width: 0;");
    expect(narrow).toContain(".wordcell-comparison.wordcell-stack tbody td[data-label]::before {\n    content: attr(data-label);");
  });
});
