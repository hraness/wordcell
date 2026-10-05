/**
 * Authored index of the public documentation. Each entry renders
 * `docs/<slug>.md` from the repository root at `/docs/<slug>`.
 * Quadrants follow the Diataxis split: tutorials teach a first loop,
 * how-to guides finish a task, reference states exact interfaces, and
 * explanation carries the design and its evidence.
 */
export type DocQuadrant = "tutorial" | "how-to" | "reference" | "explanation";

export interface DocEntry {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  /** Share-card description when the summary would not fit two lines or repeats the title. */
  readonly card?: string;
  /** Share-card headline when the title would not fit two lines at the standard size. */
  readonly cardTitle?: string;
  readonly quadrant: DocQuadrant;
}

export const docQuadrants = [
  {
    id: "tutorial",
    label: "Tutorials",
    hint: "Learn the loop end to end on a small vault.",
  },
  {
    id: "how-to",
    label: "How-to guides",
    hint: "Finish one task, such as capturing a web page, publishing a site, or searching several vaults.",
  },
  {
    id: "reference",
    label: "Reference",
    hint: "Exact commands, formats, interfaces, and limits.",
  },
  {
    id: "explanation",
    label: "Explanation",
    hint: "Why the vault works this way and what was measured.",
  },
] as const satisfies readonly { id: DocQuadrant; label: string; hint: string }[];

export const docCatalog = [
  {
    slug: "getting-started",
    title: "Get started with Wordcell",
    summary: "Install the CLI, create a vault, save a decision, find it, connect it, and preview a published page.",
    card: "Install, create a vault, and save a decision.",
    quadrant: "tutorial",
  },
  {
    slug: "agent-workflow",
    title: "Use Wordcell with a coding agent",
    summary: "Set up, query, maintain, and revise repository memory with a coding agent.",
    card: "Set up and maintain repository memory.",
    quadrant: "how-to",
  },
  {
    slug: "migration-from-supermemory",
    title: "Migrate from Supermemory",
    summary: "Export your Supermemory documents and memory entries, import them as Markdown notes, and see what does not transfer.",
    card: "Import Supermemory data as Markdown notes.",
    quadrant: "how-to",
  },
  {
    slug: "capture",
    title: "Capture web content",
    summary: "Save a page, thread, or video as Markdown with local copies of its assets and a record of how it was captured.",
    card: "Save a page, thread, or video as Markdown with local copies of its assets.",
    quadrant: "how-to",
  },
  {
    slug: "pdf",
    title: "Capture PDF documents",
    summary: "Turn a local or remote PDF into a Markdown bundle with the original file, headings, and extracted evidence.",
    card: "Turn a local or remote PDF into a Markdown bundle with the original file.",
    quadrant: "how-to",
  },
  {
    slug: "publish",
    title: "Publish a static site",
    summary: "Select notes, inspect the dry-run report, build the site, and choose how to host it.",
    quadrant: "how-to",
  },
  {
    slug: "portfolio",
    title: "Search several vaults together",
    summary: "Search and link across only the vaults you explicitly select and authorize.",
    card: "Search and link across the vaults you select.",
    quadrant: "how-to",
  },
  {
    slug: "sync",
    title: "Sync a vault with Git",
    summary: "Keep one vault current on several machines with a private Git repository and a script that commits and pushes on a schedule.",
    card: "Keep one vault current on several machines through a private Git repository.",
    quadrant: "how-to",
  },
  {
    slug: "reranking",
    title: "Use hosted reranking",
    summary: "The source version can reorder up to 25 results with Cloudflare Clef. If the provider fails, you keep the original order.",
    card: "Rerank up to 25 results with Cloudflare Clef in the source version.",
    quadrant: "how-to",
  },
  {
    slug: "publishing",
    title: "Release and verify Wordcell",
    summary: "How maintainers cut a release, and how you can check a downloaded archive's signatures and provenance.",
    card: "Cut a release, or verify one you downloaded.",
    quadrant: "how-to",
  },
  {
    slug: "reference",
    title: "Installation and command reference",
    summary: "Exact interfaces, SDK imports, optional adapters, the vault format, and prerequisites.",
    card: "Exact interfaces, SDK imports, and adapters.",
    quadrant: "reference",
  },
  {
    slug: "agent-handoffs",
    title: "Agent setup links",
    summary: "Supported composer links, setup commands, and storage requirements for coding agents.",
    quadrant: "reference",
  },
  {
    slug: "platform-submission",
    title: "Hosted publication API",
    summary: "Endpoints, MCP tools, tokens, and limits for hosting a site built from selected notes on wordcell.io.",
    card: "Endpoints, MCP tools, tokens, and limits for hosting a site on wordcell.io.",
    quadrant: "reference",
  },
  {
    slug: "hosted-publication",
    title: "Hosted publication operations",
    summary: "Publish against an expected revision and recover the exact result after an interrupted request.",
    card: "Publish against an expected revision.",
    quadrant: "reference",
  },
  {
    slug: "design",
    title: "Why Wordcell keeps everything in Markdown",
    summary: "Why Wordcell keeps everything in Markdown files, and how its storage, search, graph, and capture fit together.",
    card: "Plain files you edit, diff, and review.",
    quadrant: "explanation",
  },
  {
    slug: "agent-memory",
    title: "Why agent memory belongs in Markdown beside the repository",
    cardTitle: "Why agent memory belongs in Markdown",
    summary: "Why durable agent memory belongs in inspectable Markdown beside the repository.",
    card: "Rules on the edit path, reasons in a vault.",
    quadrant: "explanation",
  },
  {
    slug: "comparisons",
    title: "Choose a Markdown knowledge or agent memory tool",
    cardTitle: "Choose a knowledge or memory tool",
    summary: "Markdown knowledge tools and agent memory services compared with Wordcell, using each project's own primary documentation.",
    card: "Compared from each project’s own docs.",
    quadrant: "explanation",
  },
  {
    slug: "evidence",
    title: "Reproduce Wordcell’s context experiments",
    summary: "Reproduce source-level experiments on excerpt selection and packed context, using the frozen inputs and recorded results.",
    card: "Frozen inputs and recorded results.",
    quadrant: "explanation",
  },
  {
    slug: "graph-authority",
    title: "Query the derived graph",
    summary: "Run named graph queries, read their proofs and limits, and rebuild the local graph cache.",
    quadrant: "explanation",
  },
  {
    slug: "markdown-memory-pilot",
    title: "Markdown-memory retrieval pilot",
    summary: "A historical comparison of exact and hybrid search on a frozen repository corpus, with measurements and uncertainty.",
    card: "Exact and hybrid search on a frozen Markdown corpus.",
    quadrant: "explanation",
  },
] as const satisfies readonly DocEntry[];

/** The README rendered at /docs/overview, listed apart from the docs/ catalog. */
export const docOverview = {
  slug: "overview",
  title: "Wordcell overview",
  summary: "What Wordcell does, how to install it, and how a coding agent uses a vault, on one page.",
  card: "What Wordcell does, how to install it, and how agents use a vault.",
  quadrant: null,
  sourcePath: "README.md",
} as const;

/** The title a documentation route shows, or null for an unknown slug. */
export function docTitle(slug: string): string | null {
  if (slug === docOverview.slug) return docOverview.title;
  return docCatalog.find((entry) => entry.slug === slug)?.title ?? null;
}

const seen = new Set<string>();
for (const entry of docCatalog) {
  if (seen.has(entry.slug)) throw new Error(`Duplicate documentation slug: ${entry.slug}`);
  seen.add(entry.slug);
}
