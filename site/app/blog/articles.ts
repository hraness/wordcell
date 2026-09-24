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

const WORDCELL_COMMIT = "7b6cb5e0d24a3f627e17f7d1bd699a52ab4c9d10";
const OH_COMMIT = "73da154e7d16d6d3883b85110eaad30381df7a54";
const REVIEWER = "Claude Opus 5.5 (claude-opus-5-5) editorial review";

const wordcellSource = (path: string) => `https://github.com/hraness/wordcell/blob/${WORDCELL_COMMIT}/${path}`;
const ohSource = (path: string) => `https://github.com/hraness/oh/blob/${OH_COMMIT}/${path}`;

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

export const blogArticles = [
  {
    slug: "introducing-wordcell",
    title: "Introducing Wordcell",
    dek: "Wordcell keeps your notes as Markdown files and builds search and a link graph over them, so an agent can find a decision and trace it back to the file that says it.",
    eyebrow: "Release",
    published: "2026-09-24",
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
      review: { reviewer: REVIEWER, reviewerType: "ai", reviewedOn: "2026-09-24" },
      humanReview: null,
      reassessOn: "2026-11-05",
      harmIfWrong: "A reader could install Wordcell expecting a guarantee it does not make, such as answers written for them, unlimited graph size, or capture that works behind a login wall.",
      refreshTriggers: [
        "Wordcell release record bump (site/published-release.json), including publication of 0.22.5",
        "Change to graph query programs, the 4,000-note limit, truncation marking, or proof contents (docs/graph-authority.md)",
        "Change to wordcell clip signed-in capture options, profile copying, or the Archive.today fallback (docs/capture.md, src/clip)",
        "Change to the Oh adoption preparer or its review-candidate output (src/oh-adoption.ts)",
        "Change to the runtime:kb:oh or runtime:xcb:kb relation detail, or a product rename",
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
    ],
    admission: {
      href: "/blog/how-wordcell-uses-oh",
      lifecycle: "quarantined",
      readerJob: "I ask questions over my Markdown notes and want each answer to show which files support it, so I can check it myself.",
      nonObviousAnswer: "Wordcell builds a disposable Oh graph in canonical JSON from the Markdown, so each answer row carries file fingerprints and the rules applied, and any edit to a cited note makes the old proof fail verification.",
      originalContribution: "Traces a backlinks query from note fingerprint to Oh record to answer row, and reports from source which Wordcell paths use Oh's Rust encoder and query engine.",
      hostFit: "A \"How Wordcell uses Oh\" post needs a registered relation with a detail sentence; runtime:kb:oh:answers-graph-queries-with is not yet in the portfolio registry, so the post stays quarantined until it is.",
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
      ],
      observations: [
        "In Wordcell the Rust canonical encoder is called only by the Oh adoption preparer (src/oh-adoption.ts); graph snapshots and fact keys are fingerprinted with Oh's TypeScript canonicalJson and canonicalSha256 (src/oh/snapshot.ts), and the graph path's Rust preference applies to query evaluation (src/oh/projection-rust.ts).",
        "A note's own fingerprint is a SHA-256 of the note's text (src/graph-facts.ts), not canonical JSON, so editing whitespace or front matter formatting in a note changes its proof even when no link changed.",
      ],
      scores: {
        readerUtility: 2,
        originalEvidence: 2,
        factualConfidence: 2,
        hostFit: 0,
        voiceIntegrity: 2,
        maintenanceValue: 1,
      },
      owner: "Hraness",
      drafting: "ai-from-source",
      review: { reviewer: REVIEWER, reviewerType: "ai", reviewedOn: "2026-09-24" },
      humanReview: null,
      reassessOn: "2026-11-05",
      harmIfWrong: "A reader could treat a graph proof as proof that a note is correct, or believe Wordcell keeps agent memory in Oh.",
      refreshTriggers: [
        "runtime:kb:oh:answers-graph-queries-with is registered, changes its detail sentence, or is removed",
        "Wordcell changes its pinned Oh release in package.json",
        "Change to the named graph programs, graph limits (depth, notes, facts, MiB), truncation exit code, or graphVerifyResult behavior",
        "Change to which Wordcell paths use Oh's Rust canonical encoder or Rust query engine",
        "Change to createOhAdoptionPreparerV1 output or behavior in src/oh-adoption.ts",
        "Wordcell or Oh rename, or the oh.computer parity post or built-on-Oh hub goes live",
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
