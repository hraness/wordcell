/** The launch pages that sit outside the docs and blog catalogs. The blog link
 * check, the sitemap and llms.txt tests, and the runtime route test read this
 * one list, so a page added here must be served and listed everywhere. */
export const launchRoutes = ["/benchmarks", "/compare/supermemory", "/migrate/supermemory"] as const;

export type LaunchRoute = (typeof launchRoutes)[number];

export function isLaunchRoute(path: string): path is LaunchRoute {
  return (launchRoutes as readonly string[]).includes(path);
}
