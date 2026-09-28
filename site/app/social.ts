import { defineSocialImageSite, type SocialImagePage } from "@hraness/web-discovery/social-image/card";

import { docCatalog, docOverview } from "./docs/catalog";
import { routeTitles } from "./route-titles";
import { socialIconDataUrl } from "./social-icon";

/**
 * Wordcell's one share-card declaration. Every opengraph-image route renders
 * the shared @hraness/web-discovery template from this site and passes only
 * its page copy; the card design lives in that package.
 */
export const wordcellSocialSite = defineSocialImageSite({
  description: "Markdown knowledge base that gives agents the decisions behind code",
  domain: "wordcell.io",
  icon: { kind: "app", src: socialIconDataUrl },
  name: "Wordcell",
  theme: {
    accent: "#076678",
    background: "#FBF1C7",
    foreground: "#3C3836",
    muted: "#665C54",
  },
});

/** Page copy for each route with its own card. The home card uses the site alone. */
export const socialPages = {
  developers: { eyebrow: "For developers", headline: routeTitles.developers.card },
  benchmarks: { eyebrow: "Evidence", headline: routeTitles.benchmarks.card },
  docs: { eyebrow: "Tutorials, guides, and reference", headline: routeTitles.docs.card },
  compareBasicMemory: { eyebrow: "Comparison", headline: routeTitles.compareBasicMemory.card },
  compareMem0: { eyebrow: "Comparison", headline: routeTitles.compareMem0.card },
  compareSupermemory: { eyebrow: "Comparison", headline: routeTitles.compareSupermemory.card },
  migrateSupermemory: { eyebrow: "Migration guide", headline: routeTitles.migrateSupermemory.card },
} as const satisfies Record<string, SocialImagePage>;

/** Card copy for one documentation page, or the docs landing copy for an unknown slug. */
export function docSocialPage(slug: string): SocialImagePage {
  const entry = slug === docOverview.slug ? docOverview : docCatalog.find((doc) => doc.slug === slug);
  if (entry === undefined) return socialPages.docs;
  return { description: entry.summary, eyebrow: "Documentation", headline: entry.title };
}
