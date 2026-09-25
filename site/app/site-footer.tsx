import { MarketingSiteFooter } from "@hraness/design-kit/react/server";

const repository = "https://github.com/hraness/wordcell";

export function WordcellContentFooter() {
  return (
    <MarketingSiteFooter
      ariaLabel="Wordcell"
      brand={<img alt="" height={20} src="/icon.png" width={20} />}
      brandHref="/"
      brandLabel="Wordcell home"
      links={[
        { href: "/developers", label: "For developers" },
        { href: "/docs", label: "Docs" },
        { href: "/blog", label: "Blog" },
        { href: repository, label: "hraness/wordcell" },
        { href: "https://hraness.com/projects", label: "Hraness projects" },
      ]}
      name="Wordcell"
    >
      <p>Wordcell is open source for developers and the agents working beside them.</p>
    </MarketingSiteFooter>
  );
}
