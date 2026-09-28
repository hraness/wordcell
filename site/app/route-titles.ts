/**
 * Page titles and share-card headlines for routes outside the docs catalog.
 * Each page's metadata reads `title`; its share card in `social.ts` reads
 * `card` as the headline.
 */
export const routeTitles = {
  home: { title: "Wordcell: Markdown memory for coding agents", card: "Markdown memory for coding agents" },
  developers: { title: "Wordcell for developers and coding agents", card: "Keep the rules in AGENTS.md and the reasons in the vault" },
  benchmarks: { title: "Wordcell and Oh benchmarks, with their limits", card: "Benchmarks, with their sources and limits" },
  docs: { title: "Wordcell documentation", card: "Documentation" },
  compareBasicMemory: { title: "Wordcell vs Basic Memory: two Markdown knowledge graphs", card: "Wordcell vs Basic Memory" },
  compareMem0: { title: "Wordcell vs Mem0: agent notes or per-user app memory", card: "Wordcell vs Mem0" },
  compareSupermemory: { title: "Wordcell vs Supermemory: files or a hosted memory API", card: "Wordcell vs Supermemory" },
  migrateSupermemory: { title: "Migrate from Supermemory to Wordcell", card: "Migrate from Supermemory" },
} as const satisfies Record<string, { readonly title: string; readonly card: string }>;
