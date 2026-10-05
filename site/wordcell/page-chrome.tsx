import type { ReactNode } from "react";
import { MarketingPage, MarketingSiteHeader } from "@hraness/design-kit/react/server";
import { ThemeMenuButton } from "@hraness/design-kit/react";
import { AskAiAboutThis } from "@hraness/ui";

const repository = "https://github.com/hraness/wordcell";

const navigation = [
  { href: "/#install", label: "Install" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
  { href: repository, label: "GitHub" },
] as const;

type HeaderAction = Readonly<{ href: string; label: string }>;

const releaseInstall: HeaderAction = { href: "/#install", label: "Install Wordcell" };

/** The launch-page header, also used by the 404 page. The action defaults to
 * the release install on the home page. */
export function WordcellSiteHeader({ action = releaseInstall }: Readonly<{ action?: HeaderAction | undefined }> = {}) {
  return (
    <MarketingSiteHeader
      className="hraness-material-chrome"
      action={action}
      brand="Wordcell"
      brandMark="/marks/kb.svg"
      brandLabel="Wordcell home"
      links={navigation}
      trailing={<ThemeMenuButton aria-label="Appearance" />}
    />
  );
}

/* Shared chrome for the launch pages (/benchmarks, the /compare/* pages, and
 * /migrate/supermemory). Home and /developers keep their own chrome. A page
 * with its own install step passes `action` so the header leads there. */
export function WordcellPageChrome({ path, action, children }: Readonly<{ path: `/${string}`; action?: HeaderAction; children: ReactNode }>) {
  return (
    <div data-hraness-marketing-preset="editorial">
      <a className="skip-link" href="#main">Skip to content</a>
      <WordcellSiteHeader action={action} />

      <main id="main" tabIndex={-1} data-hraness-landscape="page">
        <MarketingPage>{children}</MarketingPage>
      </main>

      <AskAiAboutThis className="ask-ai" url={`https://wordcell.io${path}`} />
    </div>
  );
}
