import locomoJson from "../../docs/evaluations/oh/memory-evolution-locomo-sealed-1540-v1.json";
import longMemEvalJson from "../../docs/evaluations/oh/memory-longmemeval-s-500-v1.json";
import pilotJson from "../../docs/evaluations/oh/memory-framework-pilot-v1.json";
import sourcesJson from "../../docs/evaluations/oh/sources.json";
import type { BenchmarkStudy } from "./benchmark-comparison";
import { signed } from "./format";

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

// Pinned upstream pages: the LoCoMo and pilot pages at the commit that published
// the pilot result, and the 500-question study at the commit that published it.
const ohDocs = "https://github.com/hraness/oh/blob/9edd9f1bc18d0f4c15b040add10caad26e782275/benchmarks";
export const ohLongMemEvalCommit = "21c500cf38928ab610c15c438557fbed5227ca4b";
const ohLongMemEvalDocs = `https://github.com/hraness/oh/blob/${ohLongMemEvalCommit}/benchmarks`;

export const ohLinks = {
  longMemEvalResult: `${ohLongMemEvalDocs}/LONGMEMEVAL_S_500_RESULT_V1.md`,
  locomoResult: `${ohDocs}/EVOLUTION_RELEASE_RESULTS.md#matched-descriptive-comparison-on-locomo`,
  pilotResult: `${ohDocs}/FRAMEWORK_PILOT_RESULT_V1.md`,
  benchmarks: `${ohLongMemEvalDocs}/README.md`,
} as const;

/** Oh's own write-up of the 500-question study, for readers rather than reviewers. */
export const ohLongMemEvalPost = "https://oh.computer/blog/longmemeval-s-user-log";

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
  /** Questions whose retrieval finished, which the context median covers. */
  medianContextQuestions: number;
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
  const context = record(contextTokens[id], `contextTokens.${id}`);
  const medianContextQuestions = count(context.count, `${id} context count`);
  if (medianContextQuestions !== completed) throw new TypeError(`${id} context median must cover the questions whose retrieval finished.`);
  return {
    id,
    name: pilotArmNames[id],
    correct,
    questions,
    percent: percent(correct / questions, 2),
    incomplete: questions - completed,
    medianContextTokens: count(context.p50, `${id} median context`),
    medianContextQuestions,
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
  title: "Answers judged correct in a smaller, earlier LongMemEval pilot",
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
  contextBudget: `Median context per question whose retrieval finished: ${sentenceList(
    (["supermemory", "oh", "bm25"] as const).map((id, index) => {
      const arm = byArm(id);
      return `${arm.medianContextTokens.toLocaleString("en-US")}${index === 0 ? " tokens" : ""} for ${arm.name} (${arm.medianContextQuestions} questions)`;
    }),
  )}.`,
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

// LongMemEval-S, all 500 questions: Oh semantic retrieval against BM25 under
// one protocol card, measured by Oh. The lab pipeline in the same file is
// in-sample and outside the Oh package; it is described, never charted.

const longMemEval = record(longMemEvalJson as unknown, "LongMemEval-S 500 result");
if (longMemEval.protocol !== "oh.longmemeval-s-500-public-result.v1") throw new TypeError("Unexpected LongMemEval-S 500 result protocol.");
const longMemEvalCompleted = text(longMemEval.completed, "completed");
if (!/^\d{4}-\d{2}-\d{2}$/.test(longMemEvalCompleted)) throw new TypeError("The LongMemEval-S 500 completion date must be an ISO date.");

const longMemEvalDataset = record(longMemEval.dataset, "dataset");
if (text(longMemEvalDataset.name, "dataset.name") !== "LongMemEval-S") throw new TypeError("Unexpected LongMemEval-S dataset name.");
const longMemEvalQuestions = count(longMemEvalDataset.questions, "dataset.questions");
const longMemEvalTypeCounts = record(longMemEvalDataset.questionTypes, "dataset.questionTypes");
if (Object.values(longMemEvalTypeCounts).reduce<number>((sum, value) => sum + count(value, "question type count"), 0) !== longMemEvalQuestions) {
  throw new TypeError("LongMemEval-S question types must cover every question.");
}

const longMemEvalExposure = record(longMemEval.exposure, "exposure");
if (longMemEvalExposure.inSample !== true) throw new TypeError("The LongMemEval-S 500 exposure record changed; update the page's exposure line.");
const priorStudies = text(longMemEvalExposure.priorStudies, "exposure.priorStudies");

const longMemEvalReader = record(longMemEval.reader, "reader");
const longMemEvalJudge = record(longMemEval.judge, "judge");
if (text(longMemEvalReader.model, "reader.model") !== "openai/gpt-5-mini") throw new TypeError("Unexpected LongMemEval-S reader.");
if (text(longMemEvalJudge.model, "judge.model") !== "openai/gpt-4o") throw new TypeError("Unexpected LongMemEval-S judge.");
if (longMemEvalReader.snapshotPinned !== false || longMemEvalJudge.snapshotPinned !== false) {
  throw new TypeError("The LongMemEval-S reader or judge is now pinned; update the page's model lines.");
}
const paperJudge = text(longMemEvalJudge.paperJudge, "judge.paperJudge");

const longMemEvalRuns = record(longMemEval.runs, "runs");
const runsPerQuestion = count(longMemEvalRuns.repeatsPerQuestion, "runs.repeatsPerQuestion");
if (runsPerQuestion !== 3) throw new TypeError("The two-of-three measure assumes three runs per question.");
const longMemEvalScoring = record(longMemEval.scoring, "scoring");
const frozenPrimary = text(longMemEvalScoring.freezePrimary, "scoring.freezePrimary");
if (frozenPrimary !== "questions answered correctly in at least two of three runs") {
  throw new TypeError("The pre-registered LongMemEval-S measure changed; update the page.");
}

function bounded(value: number, limit: number, label: string): number {
  if (value > limit) throw new TypeError(`${label} counts more correct results than it has.`);
  return value;
}

type TypeResult = Readonly<{ questionType: string; questions: number; correctAnswers: number; answers: number; percent: number }>;
type LongMemEvalSystem = Readonly<{
  id: string;
  label: string;
  protocol: string;
  runs: string;
  answers: number;
  correctAnswers: number;
  percent: number;
  majorityCorrect: number;
  budget: number;
  byType: readonly TypeResult[];
  abstention: TypeResult;
}>;

function typeResult(value: unknown, label: string, questionType: string): TypeResult {
  const entry = record(value, label);
  const questions = count(entry.questions, `${label}.questions`);
  const answers = count(entry.answers, `${label}.answers`);
  const correctAnswers = bounded(count(entry.correctAnswers, `${label}.correctAnswers`), answers, label);
  if (answers !== questions * runsPerQuestion) throw new TypeError(`${label} must answer every question ${runsPerQuestion} times.`);
  const stated = finite(entry.percent, `${label}.percent`);
  if (Math.abs(stated - hundredths((100 * correctAnswers) / answers)) > 1e-9) throw new TypeError(`${label}.percent must equal its fraction.`);
  return { questionType, questions, answers, correctAnswers, percent: stated };
}

const longMemEvalSystems: readonly LongMemEvalSystem[] = list(longMemEval.systems, "systems").map((entry, index) => {
  const label = `systems[${index}]`;
  const system = record(entry, label);
  const answers = count(system.answers, `${label}.answers`);
  if (answers !== longMemEvalQuestions * runsPerQuestion) throw new TypeError(`${label} must answer every question ${runsPerQuestion} times.`);
  const correctAnswers = bounded(count(system.correctAnswers, `${label}.correctAnswers`), answers, label);
  const perRun = list(system.correctPerRun, `${label}.correctPerRun`).map((value, run) => count(value, `${label}.correctPerRun[${run}]`));
  if (perRun.length !== runsPerQuestion || perRun.reduce((sum, value) => sum + value, 0) !== correctAnswers) {
    throw new TypeError(`${label} runs must add up to its correct answers.`);
  }
  const percentValue = finite(system.percent, `${label}.percent`);
  if (Math.abs(percentValue - hundredths((100 * correctAnswers) / answers)) > 1e-9) throw new TypeError(`${label}.percent must equal its fraction.`);
  const memory = record(system.memoryBytes, `${label}.memoryBytes`);
  const byType = list(system.byType, `${label}.byType`).map((value, position) => {
    const typeRecord = record(value, `${label}.byType[${position}]`);
    const questionType = text(typeRecord.questionType, `${label}.byType[${position}].questionType`);
    const result = typeResult(typeRecord, `${label}.byType[${position}]`, questionType);
    if (result.questions !== count(longMemEvalTypeCounts[questionType], `dataset.questionTypes.${questionType}`)) {
      throw new TypeError(`${label} ${questionType} must cover every question of that type.`);
    }
    return result;
  });
  if (new Set(byType.map((result) => result.questionType)).size !== Object.keys(longMemEvalTypeCounts).length || byType.length !== Object.keys(longMemEvalTypeCounts).length) {
    throw new TypeError(`${label} must report each question type exactly once.`);
  }
  const abstention = typeResult(system.abstention, `${label}.abstention`, "abstention");
  if (abstention.questions !== count(longMemEvalDataset.abstentionQuestions, "dataset.abstentionQuestions")) {
    throw new TypeError(`${label} abstention must cover every abstention question.`);
  }
  return {
    id: text(system.id, `${label}.id`),
    label: text(system.label, `${label}.label`),
    protocol: text(system.protocol, `${label}.protocol`),
    runs: text(system.runs, `${label}.runs`),
    answers,
    correctAnswers,
    percent: percentValue,
    majorityCorrect: bounded(count(system.questionsCorrectInTwoOrThreeRuns, `${label}.questionsCorrectInTwoOrThreeRuns`), longMemEvalQuestions, label),
    budget: count(memory.budget ?? memory.firstPassBudget, `${label}.memoryBytes budget`),
    byType,
    abstention,
  };
});

const semanticSystem = one(longMemEvalSystems, (system) => system.id === "oh-semantic-96k", "Oh semantic retrieval system");
const bm25System = one(longMemEvalSystems, (system) => system.id === "bm25-96k", "BM25 retrieval system");
const pipelineSystem = one(longMemEvalSystems, (system) => system.id === "oh-reading-pipeline", "lab pipeline system");
if (semanticSystem.protocol !== bm25System.protocol || semanticSystem.budget !== bm25System.budget) {
  throw new TypeError("The matched LongMemEval-S baselines must share one protocol card and budget.");
}
const matchedBudget = semanticSystem.budget;
const matchedTopTurns = /\btop (\d+) turns\b/u.exec(semanticSystem.protocol)?.[1];
if (matchedTopTurns === undefined) throw new TypeError("The matched protocol card must name how many turns it packs.");

type Interval = Readonly<{ difference: number; lower: number; upper: number; level: string }>;
function pairedInterval(value: unknown, label: string): Interval {
  const entry = record(value, label);
  // The confidence level comes from the artifact's own field name, such as `interval95`.
  const keys = Object.keys(entry).filter((key) => /^interval\d{2}$/u.test(key));
  const [key] = keys;
  if (keys.length !== 1 || key === undefined) throw new TypeError(`${label} must record exactly one interval.`);
  const bounds = list(entry[key], `${label}.${key}`).map((bound, index) => finite(bound, `${label}.${key}[${index}]`));
  const [lower, upper] = bounds;
  if (bounds.length !== 2 || lower === undefined || upper === undefined || lower > upper) throw new TypeError(`${label} must have a two-sided interval.`);
  const difference = finite(entry.differencePoints, `${label}.differencePoints`);
  if (difference < lower || difference > upper) throw new TypeError(`${label} must lie inside its interval.`);
  return { difference, lower, upper, level: `${key.slice("interval".length)}%` };
}

const semanticOverBm25 = one(
  list(longMemEval.comparisons, "comparisons").map((entry, index) => record(entry, `comparisons[${index}]`)),
  (entry) => entry.left === semanticSystem.id && entry.right === bm25System.id,
  "Oh semantic over BM25 comparison",
);
if (count(semanticOverBm25.pairedQuestions, "pairedQuestions") !== longMemEvalQuestions) throw new TypeError("The comparison must pair every question.");
const majorityComparison = record(semanticOverBm25.correctInTwoOrThreeRuns, "correctInTwoOrThreeRuns");
const primaryInterval = pairedInterval(majorityComparison, "correctInTwoOrThreeRuns");

/** Oh semantic retrieval minus BM25, in percentage points, on both of Oh's measures, with Oh's 95% bootstrap intervals. */
export const longMemEvalComparison = {
  left: semanticSystem.label,
  right: bm25System.label,
  pairedQuestions: longMemEvalQuestions,
  method: text(longMemEval.comparisonMethod, "comparisonMethod"),
  /** The measure Oh named before the run: questions correct in at least two of three runs. */
  primary: primaryInterval,
  gained: count(majorityComparison.questionsGained, "questionsGained"),
  lost: count(majorityComparison.questionsLost, "questionsLost"),
  mean: pairedInterval(semanticOverBm25.meanOfThreeRuns, "meanOfThreeRuns"),
  /** True when the pre-registered interval reaches zero, so a tie is not ruled out. */
  tieNotRuledOut: primaryInterval.lower <= 0 && primaryInterval.upper >= 0,
} as const;

export type LongMemEvalArm = Readonly<{ id: string; system: string; percent: string; correctAnswers: number; answers: number; majorityCorrect: number }>;

const matchedSystems = [
  { system: semanticSystem, color: "var(--primary)" },
  { system: bm25System, color: "var(--muted)" },
] as const;

/** The two matched arms, Oh semantic retrieval first. */
export const longMemEvalArms: readonly LongMemEvalArm[] = matchedSystems.map(({ system }) => ({
  id: system.id,
  system: system.label,
  percent: system.percent.toFixed(2),
  correctAnswers: system.correctAnswers,
  answers: system.answers,
  majorityCorrect: system.majorityCorrect,
}));

const typeNames: Readonly<Record<string, string>> = {
  "knowledge-update": "Knowledge update",
  "multi-session": "Multi-session",
  "single-session-assistant": "Single-session assistant",
  "single-session-preference": "Single-session preference",
  "single-session-user": "Single-session user",
  "temporal-reasoning": "Temporal reasoning",
  abstention: "Abstention, across types",
};

export type LongMemEvalType = Readonly<{ id: string; name: string; questions: number; percents: readonly string[] }>;

/** Accuracy by question type, mean of three runs; `percents` follows `longMemEvalArms` order. */
export const longMemEvalTypes: readonly LongMemEvalType[] = [...Object.keys(longMemEvalTypeCounts), "abstention"].map((id) => {
  const cells = matchedSystems.map(({ system }) =>
    id === "abstention" ? system.abstention : one(system.byType, (result) => result.questionType === id, `${system.id} ${id} result`),
  );
  const questions = cells[0]?.questions ?? 0;
  if (cells.some((cell) => cell.questions !== questions)) throw new TypeError(`${id} must have one question count across arms.`);
  const name = typeNames[id];
  if (name === undefined) throw new TypeError(`Unknown LongMemEval-S question type ${id}.`);
  return { id, name, questions, percents: cells.map((cell) => cell.percent.toFixed(2)) };
});

const longMemEvalLimitations = list(longMemEval.limitations, "limitations").map((entry, index) => text(entry, `limitations[${index}]`));

/** Verbatim sentences from Oh's own limits for the 500-question study. */
export const longMemEvalLimitQuotes = {
  aliases: quoteFrom(longMemEvalLimitations, "The reader and judge are gateway aliases; the models behind them can change."),
  audit: quoteFrom(longMemEvalLimitations, "AI agents ran the study and wrote the report; no person or outside group has audited it."),
  inSample: quoteFrom(longMemEvalLimitations, "In-sample: the added instructions and question rules were written after studying all 500 questions, and two rules match single question types on this benchmark."),
  budget: quoteFrom(longMemEvalLimitations, "The pipeline reads up to 180,000 bytes and makes extra calls; the matched baselines read at most 96,000 bytes once."),
  exposure: quoteFrom([priorStudies], "earlier Oh studies scored all 500 questions and read some of them one by one"),
} as const;

const packageBoundary = record(longMemEval.packageBoundary, "packageBoundary");
const labOnly = list(packageBoundary.labOnly, "packageBoundary.labOnly").map((entry, index) => text(entry, `labOnly[${index}]`));
if (labOnly.length === 0 || packageBoundary.labPublished !== false) throw new TypeError("The lab pipeline's package boundary changed; update the page.");
const supermemoryRecord = record(longMemEval.supermemory, "supermemory");
if (typeof supermemoryRecord.matchedFullRun !== "boolean") throw new TypeError("supermemory.matchedFullRun must be a boolean.");
if (supermemoryRecord.matchedFullRun) throw new TypeError("Oh now reports a matched full Supermemory run; update the page.");
const matchedSupermemoryRun: boolean = supermemoryRecord.matchedFullRun;

/**
 * The lab pipeline's result, for a clearly framed sentence only. It is
 * in-sample and not part of the Oh package, so it never becomes a chart row or
 * a headline figure.
 */
export const longMemEvalLabPipeline = {
  label: pipelineSystem.label,
  percent: pipelineSystem.percent.toFixed(2),
  majorityCorrect: pipelineSystem.majorityCorrect,
  questions: longMemEvalQuestions,
  firstPassBudget: pipelineSystem.budget,
  labOnly,
  labOnlyText: sentenceList(labOnly),
  inSample: true,
  inOhPackage: false,
} as const;

export const longMemEvalFacts = {
  completed: longMemEvalCompleted,
  questions: longMemEvalQuestions,
  runsPerQuestion,
  matchedBudget,
  semanticRuns: semanticSystem.runs,
  paperJudge,
  matchedSupermemoryRun,
  sourceCommit: ohLongMemEvalCommit,
} as const;

export const longMemEvalStudy = {
  id: "oh-longmemeval-500",
  title: `Answers judged correct on all ${longMemEvalQuestions} LongMemEval-S questions`,
  dataset: "LongMemEval-S",
  metric: `Answers judged correct, mean of ${spelled(runsPerQuestion)} runs`,
  unit: "percent",
  sampleSize: longMemEvalQuestions,
  sampleNoun: "questions",
  scope: `Oh measured on its own, not through a Wordcell vault. On the measure Oh named before the run, Oh semantic retrieval minus BM25 is ${signed(primaryInterval.difference, 1)} points with a ${primaryInterval.level} interval from ${signed(primaryInterval.lower, 1)} to ${signed(primaryInterval.upper, 1)}${longMemEvalComparison.tieNotRuledOut ? ", which does not rule out a tie" : ""}.`,
  measuredAt: longMemEvalCompleted,
  dateLabel: "Completed",
  valueDigits: 2,
  model: `Oh semantic retrieval and BM25 keyword retrieval, each packing its top ${matchedTopTurns} turns into ${matchedBudget.toLocaleString("en-US")} bytes per question.`,
  reader: `GPT-5 mini, answering every question ${spelled(runsPerQuestion)} times through an unpinned Vercel AI Gateway alias.`,
  evaluator: `A GPT-4o judge with LongMemEval’s own grading prompts, through an unpinned gateway alias; the paper’s judge is the pinned ${paperJudge}. Each system answered ${(longMemEvalQuestions * runsPerQuestion).toLocaleString("en-US")} times in all, and every call completed.`,
  contextBudget: `The same ${matchedBudget.toLocaleString("en-US")}-byte cap and one reader call per answer for both systems.`,
  exposure: `${capitalized(priorStudies)}, so none is unseen. The Oh semantic row combines two runs: ${semanticSystem.runs}.`,
  comparability: "same-run",
  source: { label: "Oh’s published LongMemEval-S result", href: ohLinks.longMemEvalResult },
  rows: matchedSystems.map(({ system, color }) => ({
    id: system.id,
    label: system.label,
    value: (100 * system.correctAnswers) / system.answers,
    detail: `${system.correctAnswers.toLocaleString("en-US")} of ${system.answers.toLocaleString("en-US")} answers`,
    color,
  })),
} as const satisfies BenchmarkStudy;
