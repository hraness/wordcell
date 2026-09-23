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
    hint: "Finish a specific task: capture, publish, rerank, federate.",
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
    quadrant: "tutorial",
  },
  {
    slug: "agent-workflow",
    title: "Working in a hraness/wordcell vault",
    summary: "Set up, query, maintain, and revise repository memory with a coding agent.",
    quadrant: "how-to",
  },
  {
    slug: "capture",
    title: "Capture web content",
    summary: "Save a page, thread, or video as Markdown with localized assets and a provenance receipt.",
    quadrant: "how-to",
  },
  {
    slug: "pdf",
    title: "Capture PDF documents",
    summary: "Turn a local or remote PDF into a Markdown bundle with the original file, headings, and extracted evidence.",
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
    title: "Portfolio federation",
    summary: "Search and link across only the vaults you explicitly select and authorize.",
    quadrant: "how-to",
  },
  {
    slug: "reranking",
    title: "Use hosted reranking",
    summary: "Send a bounded result window to TypeSafe's Jev model; a provider failure keeps the baseline order.",
    quadrant: "how-to",
  },
  {
    slug: "publishing",
    title: "Publish Wordcell",
    summary: "The canonical release procedure and how to verify an installed archive's signatures and provenance.",
    quadrant: "how-to",
  },
  {
    slug: "reference",
    title: "Installation and command reference",
    summary: "Exact interfaces, SDK imports, optional adapters, the vault format, and prerequisites.",
    quadrant: "reference",
  },
  {
    slug: "platform-submission",
    title: "Hosted publication API",
    summary: "The live wordcell.io publication surface: endpoints, MCP tools, and the verified evidence record.",
    quadrant: "reference",
  },
  {
    slug: "hosted-publication",
    title: "Hosted publication operations",
    summary: "Publish against an expected revision and recover the exact result after an interrupted request.",
    quadrant: "reference",
  },
  {
    slug: "design",
    title: "Design",
    summary: "The file contracts, design choices, and the boundary each one protects.",
    quadrant: "explanation",
  },
  {
    slug: "agent-memory",
    title: "Markdown memory for coding agents",
    summary: "Why durable agent memory belongs in inspectable Markdown beside the repository.",
    quadrant: "explanation",
  },
  {
    slug: "comparisons",
    title: "Choose a Markdown knowledge workflow",
    summary: "Markdown, QMD, Basic Memory, Obsidian, and Wordcell compared from primary sources.",
    quadrant: "explanation",
  },
  {
    slug: "evidence",
    title: "Measure a smaller context handoff",
    summary: "The reproducible payload study with its inputs, byte counts, and stated limits.",
    quadrant: "explanation",
  },
  {
    slug: "graph-authority",
    title: "Query the derived graph",
    summary: "Named queries, proofs, revisions, resource limits, and projection cache recovery.",
    quadrant: "explanation",
  },
] as const satisfies readonly DocEntry[];

const seen = new Set<string>();
for (const entry of docCatalog) {
  if (seen.has(entry.slug)) throw new Error(`Duplicate documentation slug: ${entry.slug}`);
  seen.add(entry.slug);
}
