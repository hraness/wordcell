import type { ReactNode } from "react";
import { MarketingPage, MarketingSiteHeader } from "@hraness/design-kit/react/server";
import { ThemeMenuButton } from "@hraness/design-kit/react";
import { AskAiAboutThis } from "@hraness/ui";

import { WordcellContentFooter } from "../app/site-footer";

const repository = "https://github.com/hraness/wordcell";

const navigation = [
  { href: "/#install", label: "Install" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
  { href: repository, label: "GitHub" },
] as const;

/* Shared chrome for the launch pages (/benchmarks, /compare/supermemory,
 * /migrate/supermemory). Home and /developers keep their own chrome. */
export function WordcellPageChrome({ path, children }: Readonly<{ path: `/${string}`; children: ReactNode }>) {
  return (
    <div data-hraness-marketing-preset="editorial">
      <a className="skip-link" href="#main">Skip to content</a>
      <MarketingSiteHeader
        className="hraness-material-chrome"
        action={{ href: "/#install", label: "Install Wordcell" }}
        brand="Wordcell"
        brandMark="/marks/kb.svg"
        brandLabel="Wordcell home"
        links={navigation}
        trailing={<ThemeMenuButton aria-label="Appearance" />}
      />

      <main id="main" tabIndex={-1}>
        <MarketingPage>{children}</MarketingPage>
      </main>

      <AskAiAboutThis className="ask-ai" url={`https://wordcell.io${path}`} />

      <WordcellContentFooter />
    </div>
  );
}
