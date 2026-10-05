/** The launch pages that sit outside the docs and blog catalogs. The blog link
 * check, the sitemap and llms.txt tests, and the runtime route test read this
 * one list, so a page added here must be served and listed everywhere. */
export const launchRoutes = ["/benchmarks", "/compare/basic-memory", "/compare/obsidian", "/compare/mem0", "/compare/supermemory", "/compare/claude-mem", "/migrate/supermemory"] as const;

export type LaunchRoute = (typeof launchRoutes)[number];

/** Comparison pages served with noindex while their review record in
 * comparison-admissions.ts is pending. They stay out of the sitemap, llms.txt,
 * and the home page links; when a review admits one, move it to launchRoutes. */
export const reviewPendingRoutes: readonly string[] = [];

export function isLaunchRoute(path: string): path is LaunchRoute {
  return (launchRoutes as readonly string[]).includes(path);
}
