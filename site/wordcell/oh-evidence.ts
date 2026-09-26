import locomoJson from "../../docs/evaluations/oh/memory-evolution-locomo-sealed-1540-v1.json";
import pilotJson from "../../docs/evaluations/oh/memory-framework-pilot-v1.json";
import sourcesJson from "../../docs/evaluations/oh/sources.json";
import type { BenchmarkStudy } from "./benchmark-comparison";

// The vendored files are Oh's published bytes. They are read as `unknown`
// through small readers that throw, so a changed shape fails the build instead
// of rendering a wrong figure.

type JsonRecord = Readonly<Record<string, unknown>>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function list(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string.`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}

function count(value: unknown, label: string): number {
  const number = finite(value, label);
  if (!Number.isSafeInteger(number) || number < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return number;
}

function one<T>(items: readonly T[], match: (item: T) => boolean, label: string): T {
  const found = items.filter(match);
  if (found.length !== 1) throw new TypeError(`Expected exactly one ${label}; found ${found.length}.`);
  return found[0] as T;
}

const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;

/** STYLE.md spells out zero through nine in prose. */
function spelled(value: number): string {
  return words[value] ?? value.toLocaleString("en-US");
}

function sentenceList(items: readonly string[]): string {
  if (items.length < 3) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

const capitalized = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const percent = (fraction: number, digits: 1 | 2) => (100 * fraction).toFixed(digits);
const hundredths = (value: number) => Math.round(value * 100) / 100;

/**
 * Returns `needle` when one of Oh's own qualification strings contains it
 * verbatim, and throws otherwise, so a quoted limit can never drift from the
 * published file.
 */
export function quoteFrom(statements: readonly string[], needle: string): string {
  if (!statements.some((statement) => statement.includes(needle))) {
    throw new TypeError(`Oh's published limits no longer contain "${needle}".`);
  }
  return needle;
}

// Pinned upstream pages, at the commit that also published the pilot result.
const ohDocs = "https://github.com/hraness/oh/blob/9edd9f1bc18d0f4c15b040add10caad26e782275/benchmarks";

export const ohLinks = {
  locomoResult: `${ohDocs}/EVOLUTION_RELEASE_RESULTS.md#matched-descriptive-comparison-on-locomo`,
  pilotResult: `${ohDocs}/FRAMEWORK_PILOT_RESULT_V1.md`,
  benchmarks: `${ohDocs}/README.md`,
} as const;

/** docs/evidence.md carries the same two sentences with straight apostrophes; a test pins them together. */
export const ohAttribution =
  "Oh’s conversation-memory benchmarks evaluate its own memory-retrieval API, reader models, and evaluation protocols. Those scores do not transfer to a Wordcell vault merely because it uses the same library.";

// Vendored file provenance.

export type OhSource = Readonly<{ file: string; commit: string; path: string; bytes: number; sha256: string; href: string }>;

export const ohSources: readonly OhSource[] = list(record(sourcesJson as unknown, "sources.json").artifacts, "sources.json artifacts").map(
  (entry, index) => {
    const artifact = record(entry, `sources.json artifacts[${index}]`);
    if (artifact.repository !== "hraness/oh") throw new TypeError("Vendored Oh artifacts must come from hraness/oh.");
    const commit = text(artifact.commit, "commit");
    const path = text(artifact.path, "path");
    return {
      file: text(artifact.file, "file"),
      commit,
      path,
      bytes: count(artifact.bytes, "bytes"),
      sha256: text(artifact.sha256, "sha256"),
      href: `https://github.com/hraness/oh/blob/${commit}/${path}`,
    };
  },
);

// LoCoMo: Oh semantic retrieval against a BM25 window, measured by Oh.

const locomo = record(locomoJson as unknown, "LoCoMo result");
if (locomo.protocol !== "oh.memory.evolution-study-summary.v9") throw new TypeError("Unexpected LoCoMo result protocol.");
if (locomo.status !== "complete") throw new TypeError("The LoCoMo result is not complete.");

const locomoDesign = record(locomo.design, "design");
const candidate = record(locomoDesign.candidate, "design.candidate");
const control = record(locomoDesign.control, "design.control");
const candidateBudget = record(candidate.budget, "design.candidate.budget");
const controlBudget = record(control.budget, "design.control.budget");
const topK = count(candidateBudget.topK, "candidate topK");
const contextBytes = count(candidateBudget.contextBytes, "candidate contextBytes");
if (count(controlBudget.topK, "control topK") !== topK || count(controlBudget.contextBytes, "control contextBytes") !== contextBytes) {
  throw new TypeError("The LoCoMo arms must share one retrieval budget.");
}
const repeats = count(locomoDesign.repeats, "design.repeats");
if (text(locomoDesign.judge, "design.judge") !== "gpt4o-mini-locomo-j-judge-v1") throw new TypeError("Unexpected LoCoMo judge.");

const readerNames: Readonly<Record<string, Readonly<{ key: "mini" | "nano"; name: string }>>> = {
  "gpt5-mini-calibration-only-v1-reader": { key: "mini", name: "GPT-5 mini" },
  "gpt5-nano-calibration-only-v1-reader": { key: "nano", name: "GPT-5 nano" },
};
function reader(id: unknown) {
  const known = readerNames[text(id, "reader")];
  if (!known) throw new TypeError(`Unknown LoCoMo reader ${String(id)}.`);
  return known;
}
if (list(locomoDesign.readers, "design.readers").length !== 2) throw new TypeError("Expected two LoCoMo readers.");

const categoryNames = record(locomoDesign.categoryNames, "design.categoryNames");
const locomoScope = record(locomo.scope, "scope");
const selectedQuestions = count(locomoScope.selectedQuestions, "scope.selectedQuestions");
const strata = list(locomoScope.strata, "scope.strata").map((entry, index) => {
  const stratum = record(entry, `scope.strata[${index}]`);
  return {
    exposure: text(stratum.exposure, "exposure"),
    questions: count(stratum.questions, "questions"),
    conversations: count(stratum.groups, "groups"),
  };
});
if (strata.reduce((sum, stratum) => sum + stratum.questions, 0) !== selectedQuestions) {
  throw new TypeError("LoCoMo strata must cover every selected question.");
}
const evaluatedBefore = one(strata, (stratum) => stratum.exposure === "evaluated", "evaluated stratum");
const development = one(strata, (stratum) => stratum.exposure === "development", "development stratum");
const conversations = evaluatedBefore.conversations + development.conversations;

type Metric = Readonly<{ cases: number; mean: number }>;
function judgeMetric(metrics: unknown, label: string): JsonRecord {
  const metric = record(list(metrics, `${label}.metrics`)[0], `${label}.metrics[0]`);
  if (metric.metric !== "judge-mean") throw new TypeError(`${label} must report judge-mean.`);
  return metric;
}
function cell(value: unknown, label: string): Metric {
  const entry = record(value, label);
  const cases = count(entry.cases, `${label}.cases`);
  if (count(entry.scored, `${label}.scored`) !== cases) throw new TypeError(`${label} must score every case.`);
  const mean = finite(entry.mean, `${label}.mean`);
  if (mean < 0 || mean > 1) throw new TypeError(`${label}.mean must be a proportion.`);
  return { cases, mean };
}

const systems = {
  [text(candidate.id, "candidate id")]: { key: "semantic", name: "Oh semantic retrieval", color: "var(--primary)" },
  [text(control.id, "control id")]: { key: "window", name: "BM25 window", color: "var(--muted)" },
} as const;

const armsRaw = list(locomo.arms, "arms").map((entry, index) => {
  const label = `arms[${index}]`;
  const arm = record(entry, label);
  const system = systems[text(arm.variantId, `${label}.variantId`)];
  if (!system) throw new TypeError(`Unknown LoCoMo variant ${String(arm.variantId)}.`);
  const metric = judgeMetric(arm.metrics, label);
  const overall = cell(metric.overall, `${label}.overall`);
  if (overall.cases !== selectedQuestions) throw new TypeError(`${label} must cover every selected question.`);
  const byCategory = list(metric.byCategory, `${label}.byCategory`).map((category, position) => {
    const categoryRecord = record(category, `${label}.byCategory[${position}]`);
    return { id: text(categoryRecord.id, "category id"), ...cell(categoryRecord, `${label}.byCategory[${position}]`) };
  });
  return { system, reader: reader(arm.reader), overall, byCategory };
});

/** Chart and table order: GPT-5 mini first, then GPT-5 nano; Oh before BM25 within each reader. */
const armOrder = [
  ["semantic", "mini"],
  ["window", "mini"],
  ["semantic", "nano"],
  ["window", "nano"],
] as const;

export type LocomoArm = Readonly<{
  id: string;
  system: string;
  reader: string;
  percent: string;
  correct: number | null;
  cases: number;
}>;

const orderedArms = armOrder.map(([system, readerKey]) =>
  one(armsRaw, (arm) => arm.system.key === system && arm.reader.key === readerKey, `${system} ${readerKey} arm`),
);

/** A count of correct answers is shown only when the mean is an exact fraction of the questions. */
function correctAnswers({ cases, mean }: Metric): number | null {
  const correct = Math.round(mean * cases);
  return Math.abs(correct - mean * cases) < 1e-6 ? correct : null;
}

export const locomoArms: readonly LocomoArm[] = orderedArms.map((arm) => ({
  id: `${arm.system.key}-${arm.reader.key}`,
  system: arm.system.name,
  reader: arm.reader.name,
  percent: percent(arm.overall.mean, 1),
  correct: correctAnswers(arm.overall),
  cases: arm.overall.cases,
}));

const locomoRows = orderedArms.map((arm) => {
  const correct = correctAnswers(arm.overall);
  return {
    id: `${arm.system.key}-${arm.reader.key}`,
    label: `${arm.system.name}, ${arm.reader.name}`,
    value: 100 * arm.overall.mean,
    ...(correct === null ? {} : { detail: `${correct.toLocaleString("en-US")} of ${arm.overall.cases.toLocaleString("en-US")} questions` }),
    color: arm.system.color,
  };
});

const categoryOrder = ["locomo:4", "locomo:1", "locomo:2", "locomo:3"] as const;
const scoredCategories = new Set(orderedArms[0]?.byCategory.map((category) => category.id));
for (const arm of orderedArms) {
  const ids = arm.byCategory.map((category) => category.id).sort().join(",");
  if (ids !== [...categoryOrder].sort().join(",")) throw new TypeError("Every LoCoMo arm must report the same four categories.");
}

export type LocomoCategory = Readonly<{ id: string; name: string; questions: number; percents: readonly string[] }>;

/** Per-category results; `percents` follows `locomoArms` order. */
export const locomoCategories: readonly LocomoCategory[] = categoryOrder.map((id) => {
  const cells = orderedArms.map((arm) => one(arm.byCategory, (category) => category.id === id, `${id} result`));
  const questions = cells[0]?.cases ?? 0;
  if (cells.some((entry) => entry.cases !== questions)) throw new TypeError(`${id} must have one question count across arms.`);
  const name = text(categoryNames[id], `categoryNames.${id}`);
  return {
    id,
    name: capitalized(name),
    questions,
    percents: cells.map((entry) => percent(entry.mean, 1)),
  };
});

const unscoredCategories = Object.keys(categoryNames)
  .filter((id) => !scoredCategories.has(id))
  .map((id) => text(categoryNames[id], `categoryNames.${id}`));

export type LocomoPaired = Readonly<{ reader: string; better: number; worse: number; tied: number; cases: number }>;

/** Question-by-question outcomes of Oh semantic retrieval against the BM25 window. */
export const locomoPaired: readonly LocomoPaired[] = (["mini", "nano"] as const).map((readerKey) => {
  const comparison = one(
    list(locomo.comparisons, "comparisons").map((entry, index) => record(entry, `comparisons[${index}]`)),
    (entry) => reader(entry.reader).key === readerKey,
    `${readerKey} comparison`,
  );
  if (systems[text(comparison.candidateVariantId, "candidateVariantId")]?.key !== "semantic") {
    throw new TypeError("The LoCoMo comparison must put Oh semantic retrieval first.");
  }
  const paired = record(judgeMetric(comparison.metrics, "comparison").paired, "paired");
  const better = count(paired.wins, "wins");
  const worse = count(paired.losses, "losses");
  const tied = count(paired.ties, "ties");
  const cases = count(paired.cases, "paired cases");
  if (better + worse + tied !== cases) throw new TypeError("Paired outcomes must cover every question.");
  if ("interval95" in paired || "interval" in paired) throw new TypeError("The LoCoMo limits say no interval is published; update them.");
  return { reader: readerNames[text(comparison.reader, "reader")]?.name ?? "", better, worse, tied, cases };
});

const qualification = list(locomo.qualification, "qualification").map((entry, index) => text(entry, `qualification[${index}]`));

/** Verbatim phrases from Oh's own qualification of the LoCoMo result. */
export const locomoLimitQuotes = [
  quoteFrom(qualification, "do not establish fresh confirmation, statistical superiority or benchmark saturation"),
  quoteFrom(qualification, "Not a pinned-snapshot reproduction of any leaderboard harness"),
  quoteFrom(qualification, "neither means unseen"),
] as const;

/** Plain facts the LoCoMo file supports, for the page's Limits list. */
export const locomoFacts = {
  repeats,
  conversations,
  selectedQuestions,
  evaluatedBefore,
  development,
  unscoredCategories,
  publishedOn: "2026-09-10",
  sourceCommit: "3add170ca8d931603e68dee07f3cbdcf9c08c706",
  hasRunDate: ["date", "measuredAt", "generatedAt", "runDate"].some((key) => key in locomo),
  hasHardware: ["hardware", "machine", "host"].some((key) => key in locomo),
} as const;
if (locomoFacts.hasRunDate || locomoFacts.hasHardware) {
  throw new TypeError("The LoCoMo file now records a run date or hardware; update the page's limits.");
}

export const locomoStudy = {
  id: "oh-locomo",
  title: "Answers judged correct on LoCoMo",
  dataset: "LoCoMo",
  metric: "Answers judged correct",
  unit: "percent",
  sampleSize: selectedQuestions,
  sampleNoun: "questions",
  scope: `Oh measured on its own, not through a Wordcell vault: ${spelled(repeats)} run over questions Oh had seen before, with no confidence interval.`,
  measuredAt: locomoFacts.publishedOn,
  dateLabel: "Published",
  model: `Oh semantic retrieval and a BM25 window, each with a ${contextBytes.toLocaleString("en-US")}-byte context budget.`,
  reader: `GPT-5 mini and GPT-5 nano, each answering every question ${repeats === 1 ? "once" : `${spelled(repeats)} times`}.`,
  evaluator: `LoCoMo J: a GPT-4o mini judge marks each answer correct or wrong. ${capitalized(sentenceList(locomoCategories.map((category) => category.name.toLowerCase())))} questions are scored; ${unscoredCategories.join(", ")} questions are not.`,
  contextBudget: `Up to ${topK} retrieved items packed into ${contextBytes.toLocaleString("en-US")} bytes per question, the same for both systems.`,
  exposure: `${evaluatedBefore.questions.toLocaleString("en-US")} questions from ${spelled(evaluatedBefore.conversations)} conversations had been evaluated before, and ${development.questions.toLocaleString("en-US")} from ${spelled(development.conversations)} conversations were used during development. None are unseen.`,
  comparability: "same-run",
  source: { label: "Oh’s published LoCoMo result", href: ohLinks.locomoResult },
  rows: locomoRows,
} as const satisfies BenchmarkStudy;

// LongMemEval pilot: Supermemory, Oh, and BM25 in one run, measured by Oh.

const pilot = record(pilotJson as unknown, "pilot result");
if (pilot.protocol !== "oh.framework-pilot-public-result.v1") throw new TypeError("Unexpected pilot result protocol.");
const pilotDate = text(pilot.date, "pilot date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(pilotDate)) throw new TypeError("Pilot date must be an ISO date.");
const pilotDatasetMatch = /^(.+?) \((\d+) previously exposed questions, (\d+) per type\)$/.exec(text(pilot.dataset, "pilot dataset"));
if (!pilotDatasetMatch) throw new TypeError("The pilot dataset label changed; update its exposure line.");
const [, pilotDataset = "", pilotExposedText = "", perTypeText = ""] = pilotDatasetMatch;
const pilotQuality = record(pilot.quality, "quality");
const dispositions = record(pilot.retrievalDispositions, "retrievalDispositions");
const contextTokens = record(pilot.contextTokens, "contextTokens");

const pilotArmNames = { supermemory: "Supermemory", oh: "Oh", bm25: "BM25" } as const;
type PilotArmId = keyof typeof pilotArmNames;
const pilotArmOrder = ["supermemory", "oh", "bm25"] as const satisfies readonly PilotArmId[];
const pilotArmColors: Readonly<Record<PilotArmId, string>> = {
  supermemory: "var(--foreground)",
  oh: "var(--primary)",
  bm25: "var(--muted)",
};

export type PilotArm = Readonly<{
  id: PilotArmId;
  name: string;
  correct: number;
  questions: number;
  percent: string;
  incomplete: number;
  medianContextTokens: number;
}>;

const pilotQualityArms = list(pilotQuality.arms, "quality.arms").map((entry, index) => record(entry, `quality.arms[${index}]`));

export const pilotArms: readonly PilotArm[] = pilotArmOrder.map((id) => {
  const arm = one(pilotQualityArms, (entry) => entry.arm === id, `${id} pilot arm`);
  const rate = record(arm.conservativeSuccessRate, `${id} conservativeSuccessRate`);
  const correct = count(rate.numerator, `${id} numerator`);
  const questions = count(rate.denominator, `${id} denominator`);
  if (Math.abs(finite(rate.value, `${id} value`) - correct / questions) > 1e-9) throw new TypeError(`${id} rate must equal its fraction.`);
  const disposition = record(dispositions[id], `retrievalDispositions.${id}`);
  const completed = count(disposition.completed, `${id} completed`);
  return {
    id,
    name: pilotArmNames[id],
    correct,
    questions,
    percent: percent(correct / questions, 2),
    incomplete: questions - completed,
    medianContextTokens: count(record(contextTokens[id], `contextTokens.${id}`).p50, `${id} median context`),
  };
});

const pilotQuestions = pilotArms[0]?.questions ?? 0;
if (pilotArms.some((arm) => arm.questions !== pilotQuestions)) throw new TypeError("Pilot arms must share one denominator.");
if (Number(pilotExposedText) !== pilotQuestions) throw new TypeError("The pilot dataset label must name every scored question.");

const pilotComparisons = record(pilotQuality.comparisons, "quality.comparisons");
function interval(value: unknown, label: string, left: PilotArmId, right: PilotArmId) {
  const comparison = record(value, label);
  if (comparison.left !== left || comparison.right !== right) throw new TypeError(`${label} must compare ${left} with ${right}.`);
  if (comparison.unit !== "percentage-points") throw new TypeError(`${label} must be in percentage points.`);
  if (comparison.metric !== "conservativeSuccessRate") throw new TypeError(`${label} must use the conservative success rate.`);
  const bounds = record(comparison.interval95, `${label}.interval95`);
  const estimate = hundredths(finite(comparison.estimate, `${label}.estimate`));
  const lower = hundredths(finite(bounds.lower, `${label}.lower`));
  const upper = hundredths(finite(bounds.upper, `${label}.upper`));
  return {
    left: pilotArmNames[left],
    right: pilotArmNames[right],
    estimate,
    lower,
    upper,
    crossesZero: lower < 0 && upper > 0,
    pairedQuestions: count(comparison.pairedCases, `${label}.pairedCases`),
  } as const;
}

/** Oh minus Supermemory, in percentage points, with Oh's own 95% bootstrap interval. */
export const pilotInterval = interval(pilotComparisons.primary, "primary comparison", "oh", "supermemory");
/** Oh minus BM25, reported by Oh as descriptive only. */
export const pilotSecondaryInterval = interval(pilotComparisons.secondary, "secondary comparison", "oh", "bm25");

const limitations = list(pilot.limitations, "limitations").map((entry, index) => text(entry, `limitations[${index}]`));

/** Verbatim phrases from the pilot's own limitations. The "no claim" limitation is paraphrased on the page, never quoted. */
export const pilotLimitQuotes = [
  quoteFrom(limitations, "bootstrap intervals describe resampling within this sample, not an unseen population"),
  quoteFrom(limitations, "retrieval granularity differs by arm"),
  quoteFrom(limitations, "this is not a claim about its defaults or best configuration"),
] as const;

const byArm = (id: PilotArmId) => one(pilotArms, (arm) => arm.id === id, `${id} arm`);
const incompleteArms = pilotArms.filter((arm) => arm.incomplete > 0);
const incompleteCounts = [...new Set(incompleteArms.map((arm) => arm.incomplete))];
const incompleteSentence =
  incompleteArms.length === 0
    ? ""
    : incompleteCounts.length === 1
      ? ` ${sentenceList(incompleteArms.map((arm) => arm.name))} ${incompleteArms.length > 1 ? "each " : ""}did not finish ${spelled(incompleteCounts[0] ?? 0)} of the ${pilotQuestions} questions; those count as misses.`
      : ` ${incompleteArms.map((arm) => `${arm.name} did not finish ${spelled(arm.incomplete)}`).join(", ")} of the ${pilotQuestions} questions; those count as misses.`;

export const pilotStudy = {
  id: "oh-pilot",
  title: "Answers judged correct in a small LongMemEval pilot",
  dataset: pilotDataset,
  metric: "Answers judged correct",
  unit: "percent",
  sampleSize: pilotQuestions,
  sampleNoun: "questions",
  scope: `A development pilot on questions Oh had seen before, with Supermemory indexed per session and Oh and BM25 per turn; it does not rank the three systems.`,
  measuredAt: pilotDate,
  valueDigits: 2,
  model: "Supermemory search with one fixed profile, Oh retrieval, and BM25 over the same conversation histories.",
  reader: "GPT-4o through an unpinned Vercel AI Gateway alias.",
  evaluator: `A GPT-4o judge through an unpinned gateway alias.${incompleteSentence}`,
  contextBudget: `Median context per question: ${byArm("supermemory").medianContextTokens.toLocaleString("en-US")} tokens for Supermemory, ${byArm("oh").medianContextTokens.toLocaleString("en-US")} for Oh, and ${byArm("bm25").medianContextTokens.toLocaleString("en-US")} for BM25.`,
  exposure: `${pilotQuestions} ${pilotDataset} questions, ${perTypeText} per question type, all previously exposed. A development pilot, not an unseen test set.`,
  comparability: "same-run",
  source: { label: "Oh’s published pilot result", href: ohLinks.pilotResult },
  rows: pilotArms.map((arm) => ({
    id: arm.id,
    label: arm.name,
    value: (100 * arm.correct) / arm.questions,
    detail: `${arm.correct} of ${arm.questions} questions`,
    color: pilotArmColors[arm.id],
  })),
} as const satisfies BenchmarkStudy;
