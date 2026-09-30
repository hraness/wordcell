import { defineSocialImageSite, type SocialImagePage } from "@hraness/web-discovery/social-image/card";

import { type DocEntry, docCatalog, docOverview } from "./docs/catalog";
import { routeTitles } from "./route-titles";
import { socialMarkDataUrl } from "./social-icon";

/**
 * Wordcell's one share-card declaration. Every opengraph-image route renders
 * the shared @hraness/web-discovery template from this site and passes only
 * its page copy; the card design lives in that package.
 */
export const wordcellSocialSite = defineSocialImageSite({
  description: "Markdown knowledge base that gives agents the decisions behind code.",
  keepTogether: ["Basic Memory"],
  domain: "wordcell.io",
  icon: { kind: "mark", src: socialMarkDataUrl },
  name: "Wordcell",
  theme: {
    accent: "#076678",
    background: "#FBF1C7",
    foreground: "#3C3836",
    muted: "#665C54",
  },
});

/**
 * Page copy for each route with its own card. The home card uses the site
 * alone. Each description is a short form of that page's meta description
 * that fits two lines, so no page card repeats the site tagline;
 * tests/social-image.test.ts checks every card fits as written.
 */
export const socialPages = {
  developers: {
    description: "Save decisions and tie them to code paths.",
    eyebrow: "For developers",
    headline: routeTitles.developers.card,
    path: "/developers",
  },
  benchmarks: {
    description: "Wordcell’s retrieval and Oh’s memory studies.",
    eyebrow: "Benchmarks",
    headline: routeTitles.benchmarks.card,
    path: "/benchmarks",
  },
  docs: {
    description: "Learn the loop on a first vault, finish a task, or look up an exact interface.",
    headline: routeTitles.docs.card,
    path: "/docs",
  },
  compareBasicMemory: {
    description: "Wordcell adds typed relations and checks.",
    headline: routeTitles.compareBasicMemory.card,
    path: "/compare/basic-memory",
  },
  compareObsidian: {
    description: "Write in Obsidian; give your coding agent context with Wordcell.",
    headline: routeTitles.compareObsidian.card,
    path: "/compare/obsidian",
  },
  compareMem0: {
    description: "Facts about each user of your app, or agent memory as notes you own.",
    headline: routeTitles.compareMem0.card,
    path: "/compare/mem0",
  },
  compareSupermemory: {
    description: "A hosted memory API, or files you own.",
    headline: routeTitles.compareSupermemory.card,
    path: "/compare/supermemory",
  },
  migrateSupermemory: {
    description: "Export, import as Markdown, and verify.",
    eyebrow: "Guide",
    headline: routeTitles.migrateSupermemory.card,
    path: "/migrate/supermemory",
  },
} as const satisfies Record<string, SocialImagePage>;

/** Card copy for one documentation page, or the docs landing copy for an unknown slug. */
export function docSocialPage(slug: string): SocialImagePage {
  const entry: DocEntry | typeof docOverview | undefined =
    slug === docOverview.slug ? docOverview : docCatalog.find((doc) => doc.slug === slug);
  if (entry === undefined) return socialPages.docs;
  const description = "card" in entry && entry.card !== undefined ? entry.card : entry.summary;
  const headline = "cardTitle" in entry && entry.cardTitle !== undefined ? entry.cardTitle : entry.title;
  return { description, headline, path: `/docs/${entry.slug}` };
}
