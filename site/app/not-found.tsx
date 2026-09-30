import { SiteNotFoundAnalytics } from "./site-analytics";
import type { Metadata } from "next";
import { RouteNotFoundPage } from "@hraness/design-kit/react";

import { articlePath, BLOG_PATH, BLOG_TITLE, indexableArticles } from "./blog/articles";
import { docCatalog } from "./docs/catalog";
import { launchRoutes, type LaunchRoute } from "../wordcell/launch-routes";
import { WordcellSiteHeader } from "../wordcell/page-chrome";

export const metadata: Metadata = {
  title: "Page not found · Wordcell",
};

/** The status page caps route labels at 48 characters; cut a long title at a word. */
function routeLabel(title: string): string {
  if (title.length <= 48) return title;
  const cut = title.slice(0, 47);
  const space = cut.lastIndexOf(" ");
  return `${(space > 24 ? cut.slice(0, space) : cut).replace(/[\s,:;–—-]+$/u, "")}…`;
}

const launchLabels: Readonly<Record<LaunchRoute, string>> = {
  "/benchmarks": "Wordcell and Oh benchmarks",
  "/compare/basic-memory": "Wordcell and Basic Memory compared",
  "/compare/obsidian": "Wordcell and Obsidian compared",
  "/compare/mem0": "Wordcell and Mem0 compared",
  "/compare/supermemory": "Wordcell and Supermemory compared",
  "/migrate/supermemory": "Migrate from Supermemory to Wordcell",
};

/** The sitemap's pages; a mistyped address is matched against them for "Did you mean". */
const knownPages = [
  { href: "/", label: "Wordcell" },
  { href: "/developers", label: "Wordcell for developers and coding agents" },
  ...launchRoutes.map((path) => ({ href: path, label: launchLabels[path] })),
  { href: "/docs", label: "Wordcell documentation" },
  { href: "/docs/overview", label: "Wordcell overview" },
  ...docCatalog.map((entry) => ({ href: `/docs/${entry.slug}`, label: routeLabel(entry.title) })),
  { href: BLOG_PATH, label: BLOG_TITLE },
  ...indexableArticles.map((article) => ({ href: articlePath(article), label: routeLabel(article.title) })),
];

export default function NotFound() {
  return (
    <div data-hraness-marketing-preset="editorial">
      <SiteNotFoundAnalytics />
      <a className="skip-link" href="#main">Skip to content</a>
      <WordcellSiteHeader />
      <main id="main" tabIndex={-1}>
        <RouteNotFoundPage
          agentIndexHref="/llms.txt"
          canvasAs="div"
          next={[
            {
              href: "/docs/getting-started",
              label: "Get started",
              description: "Install the CLI, create a vault, save a decision, and find it again.",
            },
            {
              href: "/developers",
              label: "For coding agents",
              description: "Give an agent the notes and plans for the file it is about to change.",
            },
            {
              href: "/benchmarks",
              label: "Benchmarks",
              description: "Wordcell and Oh results, with their sources and limits.",
            },
          ]}
          primaryAction={{ href: "/#install", label: "Install Wordcell" }}
          routes={knownPages}
          siteName="Wordcell"
        />
      </main>
    </div>
  );
}
