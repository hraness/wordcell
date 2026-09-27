import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { blogArticles } from "../app/blog/articles.ts";
import { docCatalog } from "../app/docs/catalog.ts";
import { publishedRelease } from "../app/publication.ts";
import { scifactStudy } from "../wordcell/benchmark-evidence.ts";
import { grouped, longDate, prose, signed } from "../wordcell/format.ts";
import { formatBytes, handoffEvidence } from "../wordcell/handoff-evidence.ts";
import { isLaunchRoute } from "../wordcell/launch-routes.ts";
import {
  locomoArms,
  locomoFacts,
  locomoLimitQuotes,
  longMemEvalArms,
  longMemEvalComparison,
  longMemEvalFacts,
  ohAttribution,
  ohLinks,
  pilotArms,
  pilotInterval,
  pilotStudy,
} from "../wordcell/oh-evidence.ts";
import { renderMarkdownHtml, type RelativeTargetResolver } from "./readme-html.ts";
import pilotJson from "../../docs/evaluations/oh/memory-framework-pilot-v1.json";
import scifactJson from "../../docs/evaluations/wordcell-scifact-20260919.json";

const siteRoot = resolve(import.meta.dir, "..");
const contentRoot = resolve(siteRoot, "content/blog");

const RELEASE_VERSION = "{{release.version}}";

/** Blog Markdown links only to absolute URLs or site paths; a relative file path has no route. */
const rejectRelative: RelativeTargetResolver = (_name, target) => {
  throw new Error(`Blog posts must link with an absolute URL or a site path: ${JSON.stringify(target)}`);
};

/** Replace the release placeholder with the version the site has verified; never type a version by hand. */
export function bindReleaseVersion(source: string, version: string | null): string {
  if (!source.includes(RELEASE_VERSION)) return source;
  if (version === null) throw new Error("A blog post names the latest release, but no release is published yet.");
  return source.replaceAll(RELEASE_VERSION, version);
}

/** One entry of an evidence list by its ID; a missing entry is a build error, never a blank figure. */
function pick<Entry extends { readonly id: string }>(entries: readonly Entry[], id: string): Entry {
  const entry = entries.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new TypeError(`The evidence modules have no entry ${JSON.stringify(id)}.`);
  return entry;
}

/** A study value as the benchmarks page prints it: fixed digits and a percent sign. */
function percentText(value: number | string, digits: number): string {
  return `${typeof value === "number" ? value.toFixed(digits) : value}%`;
}

/** Abstracts the SciFact study searched; the launch post says the search ran in exact mode without the graph or Git history. */
function scifactCorpus(): string {
  const { corpusDocuments, retrieval } = scifactJson.provenance;
  if (retrieval.mode !== "exact" || retrieval.graph !== false || retrieval.history !== false) {
    throw new TypeError("The SciFact study no longer searched in exact mode without the graph or Git history; update the launch post.");
  }
  return grouped(corpusDocuments);
}

/** Questions each unfinished pilot arm left; the launch post names Oh and BM25 as the only arms short, by the same count. */
function pilotIncomplete(): string {
  const short = pilotArms.filter((arm) => arm.incomplete > 0);
  const counts = new Set(short.map((arm) => arm.incomplete));
  const [count] = counts;
  if (short.map((arm) => arm.id).join(",") !== "oh,bm25" || count === undefined || counts.size !== 1) {
    throw new TypeError("The pilot's unfinished arms are no longer Oh and BM25 short by the same count; update the launch post.");
  }
  return prose(count);
}

/** The confidence level of the pilot's primary interval, read from the artifact's own field name (`interval95`). */
function pilotIntervalLevel(): string {
  const levels = Object.keys(pilotJson.quality.comparisons.primary).flatMap((key) => /^interval(\d{2})$/u.exec(key)?.[1] ?? []);
  if (levels.length !== 1) throw new TypeError("The pilot's primary comparison must record exactly one interval level.");
  return `${levels[0]}%`;
}

/**
 * Every figure a post may show, read from the same evidence modules as /benchmarks and formatted the same way,
 * so a post and the page cannot disagree. A post writes `{{evidence.<key>}}`; it never types the figure.
 */
export const evidenceFigures = {
  "handoff.queries": prose(handoffEvidence.queries),
  "handoff.notes": prose(handoffEvidence.noteCount),
  "handoff.packed": formatBytes(handoffEvidence.packedBytes),
  "handoff.full": formatBytes(handoffEvidence.fullNoteBytes),
  "handoff.reduction": `${handoffEvidence.reductionPercent}%`,
  "handoff.version": handoffEvidence.toolVersion,
  "scifact.queries": grouped(scifactStudy.sampleSize),
  "scifact.measured": longDate(scifactStudy.measuredAt),
  "scifact.exact": percentText(pick(scifactStudy.rows, "exact").value, 1),
  "scifact.reranked": percentText(pick(scifactStudy.rows, "reranked").value, 1),
  "scifact.corpus": scifactCorpus(),
  "oh-locomo.questions": grouped(locomoFacts.selectedQuestions),
  "oh-locomo.published": longDate(locomoFacts.publishedOn),
  "oh-locomo.semantic-mini": percentText(pick(locomoArms, "semantic-mini").percent, 1),
  "oh-locomo.window-mini": percentText(pick(locomoArms, "window-mini").percent, 1),
  "oh-locomo.semantic-nano": percentText(pick(locomoArms, "semantic-nano").percent, 1),
  "oh-locomo.window-nano": percentText(pick(locomoArms, "window-nano").percent, 1),
  "oh-locomo.conversations": grouped(locomoFacts.conversations),
  "oh-locomo.exposed": grouped(locomoFacts.evaluatedBefore.questions),
  "oh-locomo.development": grouped(locomoFacts.development.questions),
  "oh-locomo.attribution": ohAttribution,
  "oh-locomo.limit": locomoLimitQuotes[0],
  "oh-locomo.url": ohLinks.locomoResult,
  "oh-longmemeval.questions": grouped(longMemEvalFacts.questions),
  "oh-longmemeval.completed": longDate(longMemEvalFacts.completed),
  "oh-longmemeval.semantic": percentText(pick(longMemEvalArms, "oh-semantic-96k").percent, 2),
  "oh-longmemeval.bm25": percentText(pick(longMemEvalArms, "bm25-96k").percent, 2),
  "oh-longmemeval.estimate": signed(longMemEvalComparison.primary.difference, 1),
  "oh-longmemeval.lower": signed(longMemEvalComparison.primary.lower, 1),
  "oh-longmemeval.upper": signed(longMemEvalComparison.primary.upper, 1),
  "oh-longmemeval.level": longMemEvalComparison.primary.level,
  "oh-longmemeval.url": ohLinks.longMemEvalResult,
  "oh-pilot.questions": grouped(pilotStudy.sampleSize),
  "oh-pilot.date": longDate(pilotStudy.measuredAt),
  "oh-pilot.supermemory": percentText(pick(pilotArms, "supermemory").percent, 2),
  "oh-pilot.oh": percentText(pick(pilotArms, "oh").percent, 2),
  "oh-pilot.bm25": percentText(pick(pilotArms, "bm25").percent, 2),
  "oh-pilot.incomplete": pilotIncomplete(),
  "oh-pilot.estimate": signed(pilotInterval.estimate),
  "oh-pilot.lower": signed(pilotInterval.lower),
  "oh-pilot.upper": signed(pilotInterval.upper),
  "oh-pilot.level": pilotIntervalLevel(),
  "oh-pilot.url": ohLinks.pilotResult,
} as const satisfies Readonly<Record<string, string>>;

export type EvidenceKey = keyof typeof evidenceFigures;

const EVIDENCE_PLACEHOLDER = /\{\{evidence\.([^{}]*)\}\}/gu;

/** Replace each `{{evidence.<key>}}` with its bound figure; an unknown key is an error. Returns the distinct figures inserted. */
export function bindEvidence(
  source: string,
  figures: Readonly<Record<string, string>> = evidenceFigures,
): { text: string; figures: readonly string[] } {
  const inserted = new Set<string>();
  const text = source.replaceAll(EVIDENCE_PLACEHOLDER, (placeholder, key: string) => {
    if (!Object.hasOwn(figures, key)) throw new Error(`Unknown evidence figure ${placeholder}.`);
    const figure = figures[key]!;
    inserted.add(figure);
    return figure;
  });
  return { text, figures: [...inserted] };
}

/**
 * Percentages and decimal figures in the visible text of rendered HTML. Dates, counts, model names such as GPT-5,
 * and dotted version numbers such as 0.19.6 or 0.19.x are not figures.
 */
export function figureTokens(html: string): readonly string[] {
  return Array.from(
    visibleText(html).matchAll(/(?<![\d.,])[−+-]?\d[\d,]*(?:\.\d+)?\s?%|(?<![\d.,])[−+-]?\d+\.\d+(?!\d|\.\w)/gu),
    ([token]) => token.replaceAll(/\s/gu, ""),
  );
}

/** A post may show only the figures the binder or the release version produced; a typed percentage fails the build. */
export function assertBoundFigures(slug: string, html: string, produced: Iterable<string>): void {
  const allowed = new Set(Array.from(produced, (value) => figureTokens(value)).flat());
  const typed = figureTokens(html).filter((token) => !allowed.has(token));
  if (typed.length > 0) throw new Error(`${slug} shows figures the evidence binder did not produce: ${[...new Set(typed)].join(", ")}`);
}

/** Every on-site link from a post must reach a rendered page. */
export function assertSiteLinks(slug: string, html: string, posts: ReadonlySet<string>, docs: ReadonlySet<string>): void {
  for (const [, path] of html.matchAll(/\shref="(\/[^"#?]*)[^"]*"/gu)) {
    if (path === undefined || path === "/" || path === "/docs" || path === "/developers" || path === "/blog" || isLaunchRoute(path)) continue;
    const blog = /^\/blog\/([a-z0-9-]+)$/u.exec(path);
    if (blog !== null && posts.has(blog[1]!)) continue;
    const doc = /^\/docs\/([a-z0-9-]+)$/u.exec(path);
    if (doc !== null && (docs.has(doc[1]!) || doc[1] === "overview")) continue;
    throw new Error(`${slug} links to a page the site does not render: ${path}`);
  }
}

/** The visible text of an HTML fragment: every tag dropped, entities decoded with `&amp;` last so nothing is decoded twice. */
function visibleText(innerHtml: string): string {
  let text = "";
  let inTag = false;
  for (const character of innerHtml) {
    if (character === "<") inTag = true;
    else if (character === ">") inTag = false;
    else if (!inTag) text += character;
  }
  return text.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&").trim();
}

/** Contents entries for each h2, shown only when a post has four or more sections. */
export function contentsFor(html: string): readonly { href: `#${string}`; label: string }[] {
  const items = Array.from(html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/gu), ([, id, body]) => ({
    href: `#${id!}` as const,
    label: visibleText(body!),
  }));
  return items.length >= 4 ? items.slice(0, 8) : [];
}

if (import.meta.main) {
  const files = (await readdir(contentRoot)).filter((name) => name.endsWith(".md")).map((name) => basename(name, ".md"));
  const slugs: ReadonlySet<string> = new Set(blogArticles.map((article) => article.slug));
  for (const file of files) {
    if (!slugs.has(file)) throw new Error(`content/blog/${file}.md is missing from app/blog/articles.ts`);
  }
  const docs: ReadonlySet<string> = new Set(docCatalog.map((entry) => entry.slug));
  const html: string[] = [];
  const contents: string[] = [];
  for (const article of blogArticles) {
    if (!files.includes(article.slug)) throw new Error(`articles.ts lists ${article.slug} but content/blog/${article.slug}.md does not exist`);
    const source = await Bun.file(resolve(contentRoot, `${article.slug}.md`)).text();
    const version = publishedRelease?.version ?? null;
    const released = bindReleaseVersion(source, version);
    let evidence: ReturnType<typeof bindEvidence>;
    try {
      evidence = bindEvidence(released);
    } catch (error) {
      throw new Error(`${article.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const bound = evidence.text;
    if (bound.includes("{{")) throw new Error(`${article.slug} has an unbound template placeholder.`);
    if (/^#\s/mu.test(bound)) throw new Error(`${article.slug} must not repeat its title as a Markdown h1.`);
    if (bound.includes("—")) throw new Error(`${article.slug} contains an em dash.`);
    const rendered = renderMarkdownHtml(bound, rejectRelative);
    assertSiteLinks(article.slug, rendered, slugs, docs);
    assertBoundFigures(article.slug, rendered, version === null ? evidence.figures : [...evidence.figures, version]);
    html.push(`  ${JSON.stringify(article.slug)}: ${JSON.stringify(rendered)},\n`);
    contents.push(`  ${JSON.stringify(article.slug)}: ${JSON.stringify(contentsFor(rendered))},\n`);
  }
  await Bun.write(
    resolve(siteRoot, "app/blog/blog.generated.ts"),
    "// Generated from content/blog/*.md by scripts/sync-blog.ts. Do not edit.\n"
      + "export const blogHtml: Readonly<Record<string, string>> = {\n"
      + html.join("")
      + "};\n\n"
      + "export const blogContents: Readonly<Record<string, readonly { href: `#${string}`; label: string }[]>> = {\n"
      + contents.join("")
      + "};\n",
  );
}
