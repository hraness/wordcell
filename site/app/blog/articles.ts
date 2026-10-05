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

const WORDCELL_COMMIT = "72541e9cdec1aee29357cbb987f62723e11c85b0";
const OH_COMMIT = "1055576b87c772247b4a217ee288b338f0656f62";

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

const checked = "2026-10-04" as const;
const launchChecked = "2026-09-26" as const;

/** Every file and page the launch post cites, each opened again on launchChecked. Oh links match ohLinks in wordcell/oh-evidence.ts. */
const launchSources = [
  { title: "Local MCP server and Supermemory import reference", href: launchSource("docs/reference.md") },
  { title: "Migrate from Supermemory", href: launchSource("docs/migration-from-supermemory.md") },
  { title: "Sync a vault with Git", href: launchSource("docs/sync.md") },
  { title: "Session-memory workflow in the wordcell skill", href: launchSource("skills/wordcell/references/session-memory.md") },
  { title: "Unreleased changes", href: launchSource("CHANGELOG.md") },
  { title: "Published release record", href: launchSource("site/published-release.json") },
  { title: "MIT license", href: launchSource("LICENSE") },
  { title: "SciFact reranking study", href: launchSource("docs/evaluations/wordcell-scifact-20260919.json") },
  { title: "Query the derived graph", href: launchSource("docs/graph-authority.md") },
  { title: "Self-hosting overview", publisher: "Supermemory", href: "https://supermemory.ai/docs/self-hosting/overview" },
  { title: "User profiles", publisher: "Supermemory", href: "https://supermemory.ai/docs/concepts/user-profiles" },
  { title: "Graph memory", publisher: "Supermemory", href: "https://supermemory.ai/docs/concepts/graph-memory" },
] as const satisfies readonly Omit<ArticleSourceItem, "checkedOn">[];

// Product behavior for the introduction is checked against this source revision.
const introductionSource = (path: string) =>
  `https://github.com/hraness/wordcell/blob/9e3466aac48d2899bcbfecf10913253f14039450/${path}`;
const introductionSources = [
  { title: "Markdown memory for coding agents", href: introductionSource("docs/agent-memory.md"), checkedOn: "2026-10-01" },
  { title: "Wordcell command reference", href: introductionSource("docs/reference.md"), checkedOn: "2026-10-01" },
  { title: "Graph queries and source proofs", href: introductionSource("docs/graph-authority.md"), checkedOn: "2026-10-01" },
  { title: "Repository context implementation", href: introductionSource("src/repository-memory.ts"), checkedOn: "2026-10-01" },
  { title: "Decision context workflow", href: introductionSource("src/workflows/decision-context.ts"), checkedOn: "2026-10-01" },
  { title: "Wordcell Agent Skill", href: introductionSource("skills/wordcell/SKILL.md"), checkedOn: "2026-10-01" },
  { title: "MIT license", href: introductionSource("LICENSE"), checkedOn: "2026-10-01" },
  { title: "How xcb uses Wordcell", publisher: "xcb", href: "https://xcb.sh/blog/how-xcb-uses-wordcell", checkedOn: "2026-10-01" },
  { title: "how to build agentic systems for knowledge work", publisher: "Heinrich", href: "https://x.com/arscontexta/status/2105397004226494487", checkedOn: "2026-10-01" },
] as const satisfies readonly ArticleSourceItem[];

const boundaryChecked = "2026-10-05" as const;
const boundarySources = [
  { title: "Vault scan, catalog mode, and marker parsing", href: wordcellSource("src/vault.ts"), checkedOn: boundaryChecked },
  { title: "Managed and authored catalogs in the design guide", href: wordcellSource("docs/design.md"), checkedOn: boundaryChecked },
  { title: "Command reference: refresh, check, catalog, kb_catalog", href: wordcellSource("docs/reference.md"), checkedOn: boundaryChecked },
  { title: "Derived views are replaceable in the agent-memory guide", href: wordcellSource("docs/agent-memory.md"), checkedOn: boundaryChecked },
] as const satisfies readonly ArticleSourceItem[];

export const blogArticles = [
  {
    slug: "managed-or-authored",
    title: "The marked region: managed and authored vaults",
    dek: "A managed vault gives the tool one marked block in index.md; an authored vault gives it none. Everything outside the markers stays yours, and malformed markers fail closed.",
    eyebrow: "Explainer",
    published: "2026-10-05",
    tags: ["wordcell", "markdown", "knowledge-base", "agent-memory", "obsidian"],
    sources: boundarySources,
    admission: {
      href: "/blog/managed-or-authored",
      lifecycle: "indexable",
      readerJob: "Decide how much of your vault a maintenance tool may write, and see the mechanism that keeps generated catalogs, derived views, and advisory candidates out of authored prose.",
      nonObviousAnswer: "The whole contract is one marked block in index.md: refresh rebuilds it atomically, everything outside the markers is the author's, malformed or duplicated markers fail closed instead of guessing a region, and kb_catalog: authored removes even that block while wordcell catalog still renders a disposable inventory.",
      originalContribution: "Explains the managed/authored split, the fail-closed marker rule, advisory-only percolation, and the --no-catalog lane gate from the design guide, reference, and src/vault.ts, framed as a write-permission question rather than a feature list.",
      hostFit: "The product's own explanation of its authored-vs-managed write boundary, on the product's own host; complements the intro's product tour and the Oh post's graph proofs.",
      nearestUrls: [
        { url: "https://wordcell.io/blog/introducing-wordcell", distinction: "The introduction covers the product's purpose; this post covers the write boundary that keeps the vault yours." },
        { url: "https://wordcell.io/blog/free-local-agent-memory", distinction: "The memory post covers MCP access and import; this post covers which bytes tools may change." },
        { url: "https://wordcell.io/docs/reference", distinction: "The reference lists the flags; this post explains the policy they enforce." },
      ],
      sources: boundarySources.map(({ title, href, checkedOn }) => ({ title, url: href, checkedOn })),
      observations: [
        "The marked-block region, atomic refresh, authored-catalog frontmatter, fail-closed markers, and --no-catalog lane gate are documented in docs/design.md and docs/reference.md and implemented in src/vault.ts's CatalogMode handling.",
        "Percolation candidates (title, alias, inbox, relationships) are advisory until an author or agent promotes them; the post says nothing becomes an authored edge silently.",
        "The replaceable-views claim comes from docs/agent-memory.md: the catalog, QMD database, backlink view, graph traversal, and bounded Git index are derived and replaceable.",
      ],
      scores: {
        readerUtility: 2,
        originalEvidence: 1,
        factualConfidence: 2,
        hostFit: 2,
        voiceIntegrity: 2,
        maintenanceValue: 2,
      },
      owner: "Hraness",
      drafting: "ai-from-source",
      review: { reviewer: "Devin (SWE-2 Max model) independent AI editorial review", reviewerType: "ai", reviewedOn: "2026-10-05" },
      humanReview: { reviewer: "Ben Guo", reviewerType: "human-editor", reviewedOn: "2026-10-05" },
      reassessOn: "2026-11-05",
      harmIfWrong: "A reader could grant a tool wider write scope than the marked region provides, or believe an authored vault blocks refresh-based features it does not.",
      refreshTriggers: [
        "Change to CatalogMode, kb_catalog parsing, or marker handling in src/vault.ts",
        "Change to refresh, check --no-catalog, or catalog command behavior in docs/reference.md",
        "Change to percolation candidate handling or advisory rules in docs/design.md",
        "Wordcell rename",
      ],
    },
  },
  {
    slug: "introducing-wordcell",
    title: "Introducing Wordcell",
    dek: "Wordcell connects decisions to evidence, plans, and code in Markdown, giving your coding agent the context to carry work into the next session.",
    eyebrow: "Release",
    published: "2026-09-24",
    updated: "2026-10-01",
    tags: ["wordcell", "markdown", "knowledge-base", "coding-agents", "obsidian"],
    sources: introductionSources,
    admission: {
      href: "/blog/introducing-wordcell",
      lifecycle: "indexable",
      readerJob: "Understand how Wordcell helps a coding agent carry decisions, evidence, and working methods across sessions, and decide how it fits an existing repository.",
      nonObviousAnswer: "The useful memory is a connected record of evidence, current reasoning, and work: authored relationships give direction to those connections, code-path context brings them to an edit, and Git preserves why the decision changed.",
      originalContribution: "Follows one parser retry decision from its evidence and implementation plan through a changed upstream assumption and the next coding session; explains directed predicates, supersession, source proofs, semantic search, and Git using the implemented Wordcell workflow.",
      hostFit: "The product introduction for Wordcell on its own host.",
      nearestUrls: [
        { url: "https://wordcell.io/", distinction: "The home page introduces the benefits; the essay develops one decision through its evidence, implementation, revision, and reusable method." },
        { url: "https://wordcell.io/docs/getting-started", distinction: "The tutorial teaches setup; the essay explains why the knowledge is organized this way and how an agent uses it." },
      ],
      sources: introductionSources.map(({ title, href, checkedOn }) => ({ title, url: href, checkedOn })),
      observations: [
        "Path-based context routes authored repository scopes and separates current records from historical work.",
        "Oh source proofs explain recorded graph connections; source interpretation and the correctness of a decision remain subjects for review.",
        "The reference essay describes a broader workspace framework; this introduction confines Wordcell to its implemented headless Markdown, CLI, MCP, and SDK workflow.",
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
      review: { reviewer: "Codex independent AI editorial review", reviewerType: "ai", reviewedOn: "2026-10-01" },
      humanReview: { reviewer: "Ben Guo", reviewerType: "human-editor", reviewedOn: "2026-10-04" },
      reassessOn: "2026-11-12",
      harmIfWrong: "A reader could expect automatic chat capture, semantic truth verification, or a custom type-system and application runtime that Wordcell does not provide.",
      refreshTriggers: [
        "Changes to repository scopes, context grouping, or inherited guide discovery",
        "Changes to graph predicates, source proofs, or superseded-record handling",
        "Changes to exact, local semantic, or optional hosted search",
        "Changes to Git history, MCP authoring, SDK workflows, or the public Agent Skill",
        "Changes to install prerequisites, the MIT license, or selective publishing",
      ],
    },
  },
  {
    slug: "how-wordcell-uses-oh",
    title: "How Wordcell uses Oh for graph answers with proofs",
    dek: "Wordcell stores your links as Oh records, so every graph answer carries a proof back to the Markdown files that support it.",
    eyebrow: "Integration",
    published: "2026-09-24",
    updated: "2026-10-04",
    tags: ["wordcell", "oh", "markdown", "knowledge-graph", "proofs"],
    sources: [
      { title: "Canonical encoder wrapper", href: wordcellSource("src/oh/canonical-rust.ts"), checkedOn: checked },
      { title: "Encoder comparison checks", href: wordcellSource("src/oh/canonical-rust.test.ts"), checkedOn: checked },
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
      { title: "Keeping record fingerprints consistent across languages", publisher: "Oh", href: "https://oh.computer/blog/oh-rust-typescript-parity", checkedOn: checked },
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
        { url: "https://oh.computer/blog/built-on-oh", distinction: "Oh's hub gives each product that uses Oh one entry; this post explains Wordcell's use in full." },
      ],
      sources: [
        { title: "Canonical encoder wrapper", url: wordcellSource("src/oh/canonical-rust.ts"), checkedOn: checked },
        { title: "Encoder comparison checks", url: wordcellSource("src/oh/canonical-rust.test.ts"), checkedOn: checked },
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
        { title: "Keeping record fingerprints consistent across languages", url: "https://oh.computer/blog/oh-rust-typescript-parity", checkedOn: checked },
      ],
      observations: [
        "Verifying the WebAssembly artifact and comparing encoded values address separate questions: which code loaded and how it behaved on an input.",
        "A wrapper that falls back on disagreement protects the caller, but a generated test that skips that fallback has not checked parity on the skipped input.",
      ],
      scores: {
        readerUtility: 2,
        originalEvidence: 1,
        factualConfidence: 2,
        hostFit: 2,
        voiceIntegrity: 2,
        maintenanceValue: 2,
      },
      owner: "Hraness",
      drafting: "ai-from-source",
      review: { reviewer: "Ben Guo", reviewerType: "human-editor", reviewedOn: "2026-10-04" },
      humanReview: { reviewer: "Ben Guo", reviewerType: "human-editor", reviewedOn: "2026-10-04" },
      reassessOn: "2026-11-15",
      harmIfWrong: "A reader could treat a graph proof as proof that a note is correct, or believe Wordcell keeps agent memory in Oh.",
      refreshTriggers: [
        "runtime:kb:oh-computer:answers-graph-queries-with is registered, changes its detail sentence, or is removed",
        "Wordcell changes its pinned Oh release in package.json",
        "Change to the named graph programs, graph limits (depth, notes, facts, MiB), truncation exit code, or graphVerifyResult behavior",
        "Change to which Wordcell paths use Oh's Rust canonical encoder or Rust query engine",
        "Change to createOhAdoptionPreparerV1 output or behavior in src/oh-adoption.ts",
        "Wordcell or Oh rename, or a change to the oh.computer parity post or the Built on Oh hub",
      ],
    },
  },
  {
    slug: "free-local-agent-memory",
    title: "Free local agent memory in Markdown files you own",
    dek: "Wordcell serves a Markdown vault to local MCP clients and imports Supermemory exports, so agent memory stays in files you can read and commit.",
    eyebrow: "Launch",
    published: launchChecked,
    updated: "2026-10-01",
    tags: ["wordcell", "agent-memory", "mcp", "supermemory", "markdown"],
    sources: launchSources.map((source) => ({ ...source, checkedOn: launchChecked })),
    admission: {
      href: "/blog/free-local-agent-memory",
      lifecycle: "indexable",
      readerJob: "I keep agent memory in Supermemory or a similar service and want to know what Wordcell offers instead, how to evaluate retrieval, and what I would give up by switching.",
      nonObviousAnswer: "The agent records decisions and sources as Markdown you can read, diff, and revert. Retrieval can be evaluated against known answers in the intended vault, while migration preserves exported Supermemory records as notes.",
      originalContribution: "Connects local MCP access, revision-checked notes, and Supermemory import with a practical method for evaluating retrieval on a vault.",
      hostFit: "The launch post for the local MCP server, the Supermemory importer, and the session-memory workflow, on the Wordcell blog.",
      nearestUrls: [
        { url: "https://wordcell.io/benchmarks", distinction: "The benchmarks page lists every study with its setup and limits; the post says what those results mean for someone choosing an agent memory tool." },
        { url: "https://wordcell.io/compare/supermemory", distinction: "The comparison sets the two products side by side feature by feature; the post argues for memory the agent writes as files and says when Supermemory fits better." },
        { url: "https://wordcell.io/migrate/supermemory", distinction: "The migration page lists the steps; the post explains what the launch adds and links there as the next action." },
      ],
      sources: launchSources.map(({ title, href }) => ({ title, url: href, checkedOn: launchChecked })),
      observations: [
        "Retrieval rankings on scientific abstracts do not measure answers from a personal vault; representative questions and known source notes make that evaluation concrete.",
        "Revision checks protect an edit based on a particular note version, while explicit supersession preserves the relationship between an older claim and its replacement.",
      ],
      scores: {
        readerUtility: 2,
        originalEvidence: 1,
        factualConfidence: 2,
        hostFit: 2,
        voiceIntegrity: 2,
        maintenanceValue: 2,
      },
      owner: "Hraness",
      drafting: "ai-from-source",
      review: { reviewer: "Codex independent AI editorial review", reviewerType: "ai", reviewedOn: "2026-10-01" },
      humanReview: { reviewer: "Ben Guo", reviewerType: "human-editor", reviewedOn: "2026-10-04" },
      reassessOn: "2026-11-12",
      harmIfWrong: "A reader could treat scientific-abstract ranking as a guarantee for their own notes or switch from Supermemory expecting hosted extraction and connectors.",
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
