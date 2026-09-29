/**
 * The Wordcell blog registry: one record per post with its page metadata,
 * the sources it shows, and its review record. The body Markdown lives in
 * `site/content/blog/<slug>.md` and is rendered by `scripts/sync-blog.ts`.
 *
 * A post is indexable only when its admission record says so. Quarantined
 * posts stay readable at their URL but carry `noindex` and are left out of
 * the blog index, the sitemap, the Atom feed, and `llms.txt`.
 */
import {
  isArticleIndexable,
  type ArticleAdmission,
  type ArticleIsoDate,
  type ArticleSourceItem,
} from "@hraness/design-kit";

import { ohLinks } from "../../wordcell/oh-evidence";

const WORDCELL_COMMIT = "7b6cb5e0d24a3f627e17f7d1bd699a52ab4c9d10";
const OH_COMMIT = "73da154e7d16d6d3883b85110eaad30381df7a54";
const REVIEWER = "Claude Opus 5.5 (claude-opus-5-5) editorial review";

// The commit that added /benchmarks, /compare/supermemory, and /migrate/supermemory (PR #137); the launch post pins its Wordcell sources there.
const LAUNCH_COMMIT = "d87d4ecdd0a0b1351bc2b0d0f3cdf8de30c047dc";

const wordcellSource = (path: string) => `https://github.com/hraness/wordcell/blob/${WORDCELL_COMMIT}/${path}`;
const ohSource = (path: string) => `https://github.com/hraness/oh/blob/${OH_COMMIT}/${path}`;
const launchSource = (path: string) => `https://github.com/hraness/wordcell/blob/${LAUNCH_COMMIT}/${path}`;

export const BLOG_PATH = "/blog";
export const BLOG_FEED_PATH = "/blog/feed.xml";
export const BLOG_TITLE = "Wordcell blog";
export const BLOG_DESCRIPTION =
  "How Wordcell keeps Markdown as the record, what its search and graph answers show, and how it works with other Hraness tools.";

export interface BlogArticle {
  readonly slug: string;
  readonly title: string;
  readonly dek: string;
  readonly eyebrow: string;
  readonly published: ArticleIsoDate;
  readonly updated?: ArticleIsoDate;
  readonly tags: readonly string[];
  readonly sources: readonly ArticleSourceItem[];
  readonly admission: ArticleAdmission;
}

const checked = "2026-09-24" as const;
const launchChecked = "2026-09-26" as const;
const edited = "2026-09-26" as const;

/** Every file and page the launch post cites, each opened again on launchChecked. Oh links match ohLinks in wordcell/oh-evidence.ts. */
const launchSources = [
  { title: "Local MCP server and Supermemory import reference", href: launchSource("docs/reference.md") },
  { title: "Migrate from Supermemory", href: launchSource("docs/migration-from-supermemory.md") },
  { title: "Sync a vault with Git", href: launchSource("docs/sync.md") },
  { title: "Session-memory workflow in the wordcell skill", href: launchSource("skills/wordcell/references/session-memory.md") },
  { title: "Unreleased changes", href: launchSource("CHANGELOG.md") },
  { title: "Published release record", href: launchSource("site/published-release.json") },
  { title: "MIT license", href: launchSource("LICENSE") },
  { title: "Evidence and its limits", href: launchSource("docs/evidence.md") },
  { title: "Handoff payload measurement", href: launchSource("docs/product-evidence.json") },
  { title: "SciFact reranking study", href: launchSource("docs/evaluations/wordcell-scifact-20260919.json") },
  { title: "Oh LoCoMo result file, copy in the Wordcell repository", href: launchSource("docs/evaluations/oh/memory-evolution-locomo-sealed-1540-v1.json") },
  { title: "Oh framework pilot result file, copy in the Wordcell repository", href: launchSource("docs/evaluations/oh/memory-framework-pilot-v1.json") },
  { title: "Query the derived graph", href: launchSource("docs/graph-authority.md") },
  { title: "LongMemEval-S result V1, all 500 questions", publisher: "Oh", href: ohLinks.longMemEvalResult },
  { title: "Matched descriptive comparison on LoCoMo", publisher: "Oh", href: ohLinks.locomoResult },
  { title: "Framework pilot result V1", publisher: "Oh", href: ohLinks.pilotResult },
  { title: "Self-hosting overview", publisher: "Supermemory", href: "https://supermemory.ai/docs/self-hosting/overview" },
  { title: "User profiles", publisher: "Supermemory", href: "https://supermemory.ai/docs/concepts/user-profiles" },
  { title: "Graph memory", publisher: "Supermemory", href: "https://supermemory.ai/docs/concepts/graph-memory" },
] as const satisfies readonly Omit<ArticleSourceItem, "checkedOn">[];

export const blogArticles = [
  {
    slug: "introducing-wordcell",
    title: "Introducing Wordcell",
    dek: "Wordcell keeps your notes as Markdown files and builds search and a link graph over them, so an agent can find a decision and trace it back to the file that says it.",
    eyebrow: "Release",
    published: "2026-09-24",
    updated: "2026-09-29",
    tags: ["wordcell", "markdown", "knowledge-base", "coding-agents", "obsidian"],
    sources: [
      { title: "Wordcell README", href: wordcellSource("README.md"), checkedOn: checked },
      { title: "Query the derived graph", href: wordcellSource("docs/graph-authority.md"), checkedOn: checked },
      { title: "Oh adoption preparer", href: wordcellSource("src/oh-adoption.ts"), checkedOn: checked },
      { title: "Oh adoption stops at a review candidate", href: wordcellSource("docs/design.md"), checkedOn: checked },
      { title: "Capture web content", href: wordcellSource("docs/capture.md"), checkedOn: checked },
      { title: "Release procedure and rename from KB", href: wordcellSource("docs/publishing.md"), checkedOn: checked },
      { title: "Changelog, 0.20.0 rename", href: wordcellSource("CHANGELOG.md"), checkedOn: checked },
      { title: "Published release record", href: wordcellSource("site/published-release.json"), checkedOn: checked },
      { title: "Wordcell repository guidelines", href: wordcellSource("AGENTS.md"), checkedOn: checked },
    ],
    admission: {
      href: "/blog/introducing-wordcell",
      lifecycle: "indexable",
      readerJob: "Decide whether Wordcell fits a Markdown or Obsidian vault used with coding agents, and get from one saved rule to a cited search and graph answer.",
      nonObviousAnswer: "The Markdown files stay the only record: exact search names the note and line, graph rows carry a proof tied to the file's content digest, context groups current notes apart from superseded ones, clipped pages and PDFs land in the same folder as source material, and Oh records enter only as a review candidate a person turns into a note.",
      originalContribution: "Walks one saved rule through exact search, a backlinks graph query, and code-path context with the real commands, and states the limits (4,000-note graph bound, truncation, local model download, opt-in hosted reranking) from source.",
      hostFit: "The product introduction for Wordcell on its own host.",
      nearestUrls: [
        { url: "https://wordcell.io/", distinction: "The home page lists features; the post explains why Markdown stays the record and walks one rule end to end." },
        { url: "https://wordcell.io/docs/getting-started", distinction: "The tutorial teaches every step; the post decides fit and shows the result in a few commands." },
      ],
      sources: [
        { title: "Wordcell README", url: wordcellSource("README.md"), checkedOn: checked },
        { title: "Query the derived graph", url: wordcellSource("docs/graph-authority.md"), checkedOn: checked },
        { title: "Oh adoption preparer", url: wordcellSource("src/oh-adoption.ts"), checkedOn: checked },
        { title: "Oh adoption stops at a review candidate", url: wordcellSource("docs/design.md"), checkedOn: checked },
        { title: "Capture web content", url: wordcellSource("docs/capture.md"), checkedOn: checked },
        { title: "Release procedure and rename from KB", url: wordcellSource("docs/publishing.md"), checkedOn: checked },
        { title: "Changelog, 0.20.0 rename", url: wordcellSource("CHANGELOG.md"), checkedOn: checked },
        { title: "Published release record", url: wordcellSource("site/published-release.json"), checkedOn: checked },
        { title: "Wordcell repository guidelines", url: wordcellSource("AGENTS.md"), checkedOn: checked },
      ],
      observations: [
        "The published release record (site/published-release.json, 0.22.4) trails package.json (0.22.5) on main at 7b6cb5e, so a version typed from package.json or the README install line would claim a release the site has not recorded.",
        "The Oh adoption preparer in src/oh-adoption.ts always returns status \"prepared\" and renders Markdown that calls itself a review candidate; nothing in that path opens a vault or writes a note, so outside memory can only enter Wordcell through a person authoring Markdown.",
        "2026-09-26 editorial pass: reordered the post to lead with the claim and moved the release status and KB rename history next to what they qualify; no fact, command, link, or version changed. By then site/published-release.json recorded 0.22.5, so the gap in the first observation had closed, and npm still lists @hraness/kb only through 0.19.2.",
        "2026-09-27 fact review (AI, Claude Opus 5.5): the 2026-09-26 pass had said every result that hits a limit is marked as truncated. docs/graph-authority.md says only row or proof truncation is marked (exit code 4) and work exhaustion fails, so the Limits paragraph now says both.",
        "2026-09-29 launch beats (AI, Claude Opus 5.5, builder): the post now opens with ten short beats, each with one code-built illustration, that the X, Bluesky, Threads and LinkedIn posts are cut from (site/wordcell/launch/beats.ts). Numbers in the beats come from site/wordcell/launch/facts.ts: the status from site/published-release.json, the 4,000-note graph bound from src/graph-authority-model.ts, and Bun 1.3.14 from package.json engines; site/tests/launch-post.test.tsx reads those source files. Every command and output line in the illustrations is replayed against the pinned CLI by site/tests/mockups.test.ts. The long-form walkthrough follows unchanged under The details.",
        "2026-09-29 independent review (AI, Claude Opus 5.5, reviewer, did not write the beats): checked each beat against the transcript replay and the facts sources, and the vision beat now carries the owner's naming brief, citing roon's essay A Song of Shapes and Words by title and link with no quotation and no implied endorsement. Scores unchanged at 10 of 12: original evidence stays 1 because the beats add no new measurement, and maintenance value stays 1 because the status beat and social kit must be regenerated on each release.",
      ],
      scores: {
        readerUtility: 2,
        originalEvidence: 1,
        factualConfidence: 2,
        hostFit: 2,
        voiceIntegrity: 2,
        maintenanceValue: 1,
      },
      owner: "Hraness",
      drafting: "ai-from-source",
      review: { reviewer: REVIEWER, reviewerType: "ai", reviewedOn: "2026-09-29" },
      humanReview: null,
      reassessOn: "2026-11-05",
      harmIfWrong: "A reader could install Wordcell expecting a guarantee it does not make, such as answers written for them, unlimited graph size, or capture that works behind a login wall.",
      refreshTriggers: [
        "Wordcell release record bump (site/published-release.json), including publication of 0.22.5",
        "Change to graph query programs, the 4,000-note limit, truncation marking, or proof contents (docs/graph-authority.md)",
        "Change to wordcell clip signed-in capture options, profile copying, or the Archive.today fallback (docs/capture.md, src/clip)",
        "Change to the Oh adoption preparer or its review-candidate output (src/oh-adoption.ts)",
        "Change to the runtime:kb:oh-computer or runtime:xcb:kb relation detail, or a product rename",
        "Publication of how-wordcell-uses-oh or xcb's how-xcb-uses-wordcell",
        "Change to install prerequisites (Bun version, Git) or the package name",
      ],
    },
  },
  {
    slug: "how-wordcell-uses-oh",
    title: "How Wordcell uses Oh for graph answers with proofs",
    dek: "Wordcell stores your links as Oh records, so every graph answer carries a proof back to the Markdown files that support it.",
    eyebrow: "Integration",
    published: "2026-09-24",
    updated: edited,
    tags: ["wordcell", "oh", "markdown", "knowledge-graph", "proofs"],
    sources: [
      { title: "Query the derived graph", href: wordcellSource("docs/graph-authority.md"), checkedOn: checked },
      { title: "Oh adoption preparer", href: wordcellSource("src/oh-adoption.ts"), checkedOn: checked },
      { title: "Rust and TypeScript canonical encoder parity test", href: wordcellSource("src/oh/canonical-rust.test.ts"), checkedOn: checked },
      { title: "Graph snapshot records in canonical JSON", href: wordcellSource("src/oh/snapshot.ts"), checkedOn: checked },
      { title: "Named graph programs compiled to Oh rules", href: wordcellSource("src/oh/programs.ts"), checkedOn: checked },
      { title: "Rust query engine with TypeScript fallback", href: wordcellSource("src/oh/projection-rust.ts"), checkedOn: checked },
      { title: "Pinned Oh release", href: wordcellSource("package.json"), checkedOn: checked },
      { title: "Published release record", href: wordcellSource("site/published-release.json"), checkedOn: checked },
      { title: "Oh and Wordcell", publisher: "Oh", href: ohSource("docs/wordcell.md"), checkedOn: checked },
      { title: "Canonical JSON and digests V1", publisher: "Oh", href: ohSource("spec/v1/canonical-json.md"), checkedOn: checked },
      { title: "Oh canonical Rust parity test", publisher: "Oh", href: ohSource("src/canonical-rust-parity.test.ts"), checkedOn: checked },
      { title: "Oh holds its Rust encoder to the TypeScript reference byte for byte", publisher: "Oh", href: "https://oh.computer/blog/oh-rust-typescript-parity", checkedOn: edited },
    ],
    admission: {
      href: "/blog/how-wordcell-uses-oh",
      lifecycle: "indexable",
      readerJob: "I ask questions over my Markdown notes and want each answer to show which files support it, so I can check it myself.",
      nonObviousAnswer: "Wordcell builds a disposable Oh graph in canonical JSON from the Markdown, so each answer row carries file fingerprints and the rules applied, and any edit to a cited note makes the old proof fail verification.",
      originalContribution: "Traces a backlinks query from note fingerprint to Oh record to answer row, and reports from source which Wordcell paths use Oh's Rust encoder and query engine.",
      hostFit: "The registered runtime:kb:oh-computer:answers-graph-queries-with relation carries the detail sentence this post explains, on Wordcell's own host.",
      nearestUrls: [
        { url: "https://wordcell.io/docs/graph-authority", distinction: "The reference lists every flag and limit; the post explains what a proof means to a reader checking an answer." },
        { url: "https://wordcell.io/blog/introducing-wordcell", distinction: "The introduction covers the whole product; this post covers only the graph and its proofs." },
      ],
      sources: [
        { title: "Query the derived graph", url: wordcellSource("docs/graph-authority.md"), checkedOn: checked },
        { title: "Oh adoption preparer", url: wordcellSource("src/oh-adoption.ts"), checkedOn: checked },
        { title: "Rust and TypeScript canonical encoder parity test", url: wordcellSource("src/oh/canonical-rust.test.ts"), checkedOn: checked },
        { title: "Graph snapshot records in canonical JSON", url: wordcellSource("src/oh/snapshot.ts"), checkedOn: checked },
        { title: "Named graph programs compiled to Oh rules", url: wordcellSource("src/oh/programs.ts"), checkedOn: checked },
        { title: "Rust query engine with TypeScript fallback", url: wordcellSource("src/oh/projection-rust.ts"), checkedOn: checked },
        { title: "Pinned Oh release", url: wordcellSource("package.json"), checkedOn: checked },
        { title: "Published release record", url: wordcellSource("site/published-release.json"), checkedOn: checked },
        { title: "Oh and Wordcell", url: ohSource("docs/wordcell.md"), checkedOn: checked },
        { title: "Canonical JSON and digests V1", url: ohSource("spec/v1/canonical-json.md"), checkedOn: checked },
        { title: "Oh canonical Rust parity test", url: ohSource("src/canonical-rust-parity.test.ts"), checkedOn: checked },
        { title: "Oh holds its Rust encoder to the TypeScript reference byte for byte", url: "https://oh.computer/blog/oh-rust-typescript-parity", checkedOn: edited },
      ],
      observations: [
        "In Wordcell the Rust canonical encoder is called only by the Oh adoption preparer (src/oh-adoption.ts); graph snapshots and fact keys are fingerprinted with Oh's TypeScript canonicalJson and canonicalSha256 (src/oh/snapshot.ts), and the graph path's Rust preference applies to query evaluation (src/oh/projection-rust.ts).",
        "A note's own fingerprint is a SHA-256 of the note's text (src/graph-facts.ts), not canonical JSON, so editing whitespace or front matter formatting in a note changes its proof even when no link changed.",
        "2026-09-26 editorial pass: the post named Oh's parity post by a working title that no longer matches the live page; it now links https://oh.computer/blog/oh-rust-typescript-parity under its published title. Sections were retitled and the limits gathered next to what they limit; no fact, command, or limit changed.",
      ],
      scores: {
        readerUtility: 2,
        originalEvidence: 2,
        factualConfidence: 2,
        hostFit: 2,
        voiceIntegrity: 2,
        maintenanceValue: 1,
      },
      owner: "Hraness",
      drafting: "ai-from-source",
      review: { reviewer: REVIEWER, reviewerType: "ai", reviewedOn: edited },
      humanReview: null,
      reassessOn: "2026-11-05",
      harmIfWrong: "A reader could treat a graph proof as proof that a note is correct, or believe Wordcell keeps agent memory in Oh.",
      refreshTriggers: [
        "runtime:kb:oh-computer:answers-graph-queries-with is registered, changes its detail sentence, or is removed",
        "Wordcell changes its pinned Oh release in package.json",
        "Change to the named graph programs, graph limits (depth, notes, facts, MiB), truncation exit code, or graphVerifyResult behavior",
        "Change to which Wordcell paths use Oh's Rust canonical encoder or Rust query engine",
        "Change to createOhAdoptionPreparerV1 output or behavior in src/oh-adoption.ts",
        "Wordcell or Oh rename, or the oh.computer parity post or built-on-Oh hub goes live",
      ],
    },
  },
  {
    slug: "free-local-agent-memory",
    title: "Free local agent memory in Markdown files you own",
    dek: "Wordcell serves a Markdown vault to local MCP clients and imports Supermemory exports, so agent memory stays in files you can read and commit.",
    eyebrow: "Launch",
    published: launchChecked,
    tags: ["wordcell", "agent-memory", "mcp", "supermemory", "markdown"],
    sources: launchSources.map((source) => ({ ...source, checkedOn: launchChecked })),
    admission: {
      href: "/blog/free-local-agent-memory",
      // The drafting run did not review its own post: a separate AI review read it on 2026-09-26, and its findings were fixed before the post was indexed.
      lifecycle: "indexable",
      readerJob: "I keep agent memory in Supermemory or a similar service and want to know what Wordcell offers instead, what its numbers show, and what I would give up by switching.",
      nonObviousAnswer: "The strongest figures are Oh's own results for its API, and the one run that includes Supermemory did not separate the two; the case for Wordcell is memory the agent writes as files you can read, diff, and revert, not a benchmark lead.",
      originalContribution: "Puts the launch commands next to figures bound at build time from the same study files as /benchmarks, and says which results do not transfer to a Wordcell vault.",
      hostFit: "The launch post for the local MCP server, the Supermemory importer, and the session-memory workflow, on the Wordcell blog.",
      nearestUrls: [
        { url: "https://wordcell.io/benchmarks", distinction: "The benchmarks page lists every study with its setup and limits; the post says what those results mean for someone choosing an agent memory tool." },
        { url: "https://wordcell.io/compare/supermemory", distinction: "The comparison sets the two products side by side feature by feature; the post argues for memory the agent writes as files and says when Supermemory fits better." },
        { url: "https://wordcell.io/migrate/supermemory", distinction: "The migration page lists the steps; the post explains what the launch adds and links there as the next action." },
      ],
      sources: launchSources.map(({ title, href }) => ({ title, url: href, checkedOn: launchChecked })),
      observations: [
        "Supermemory's self-hosted edition is also free and open source, so price alone does not separate it from Wordcell; the post argues from who writes the memory and where it lives.",
        "When the post was first reviewed, neither the launch commands nor the skill's session-memory workflow was in the published 0.22.5 release, so the post sent readers to the source install and the main-branch skill.",
        "2026-09-26 editorial pass: retitled to name the query it answers, led with what the launch adds, stated each study's limits beside that study, and cut a closing paragraph that stated a goal rather than a fact; no figure, link, quotation, or status changed.",
        "2026-09-26 release update: Wordcell 0.23.0 carries the launch commands and the session-memory reference, so the opening sentence, the dek, and the status paragraph drop the source-build wording and point to the release install and the release-pinned skill; no figure or quotation changed.",
      ],
      // The review's accuracy, sourcing, and style reports raised no problem that sets any score to zero, and the
      // separate verification review on 2026-09-26 scored the fixed post independently and gave these same six scores.
      scores: {
        readerUtility: 2,
        originalEvidence: 1,
        factualConfidence: 2,
        hostFit: 2,
        voiceIntegrity: 2,
        maintenanceValue: 1,
      },
      owner: "Hraness",
      drafting: "ai-from-source",
      review: { reviewer: REVIEWER, reviewerType: "ai", reviewedOn: "2026-09-26" },
      humanReview: null,
      reassessOn: "2026-11-07",
      harmIfWrong: "A reader could cite Oh's LoCoMo or LongMemEval-S figures as Wordcell's results, read Oh's lead over BM25 as settled when its interval reaches zero, or switch from Supermemory expecting hosted extraction and connectors.",
      refreshTriggers: [
        "A release that changes wordcell mcp, wordcell import supermemory, or the skill's session-memory reference",
        "A change to a vendored evidence file under docs/ or to the evidence modules under site/wordcell/",
        "A matched run of a Wordcell vault against Supermemory",
        "A change to a cited Supermemory documentation page",
        "A change to /benchmarks, /compare/supermemory, or /migrate/supermemory",
        "Wordcell, Oh, or Supermemory rename",
      ],
    },
  },
] as const satisfies readonly BlogArticle[];

export type BlogSlug = (typeof blogArticles)[number]["slug"];

export const blogAdmissions: readonly ArticleAdmission[] = blogArticles.map((article) => article.admission);

/** Posts that may appear in the index, sitemap, feed, and llms.txt, newest first. */
export const indexableArticles: readonly BlogArticle[] = blogArticles
  .filter((article) => isArticleIndexable(article.admission))
  .toSorted((left, right) => right.published.localeCompare(left.published));

export function findArticle(slug: string): BlogArticle | null {
  return blogArticles.find((article) => article.slug === slug) ?? null;
}

export function articlePath(article: Pick<BlogArticle, "slug">): `/blog/${string}` {
  return `/blog/${article.slug}`;
}
