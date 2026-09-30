import { MarketingActionLink, MarketingCardRow, ProviderMark } from "@hraness/design-kit/react/server";

export const comparisonLinks = [
  { id: "obsidian", label: "Obsidian", href: "/compare/obsidian", detail: "A visual editor for your Markdown vault." },
  { id: "basic-memory", label: "Basic Memory", href: "/compare/basic-memory", detail: "Markdown notes your assistant writes through MCP." },
  { id: "supermemory", label: "Supermemory", href: "/compare/supermemory", detail: "A hosted memory engine for agents and apps." },
  { id: "mem0", label: "Mem0", href: "/compare/mem0", detail: "Extracted memories for the users of your app." },
] as const;

export function ComparisonLinks() {
  return (
    <MarketingCardRow
      ariaLabel="Compare Wordcell with other tools"
      cards={comparisonLinks.map((item) => ({
        art: <ProviderMark mark={item.label} size={44} tone="solid" />,
        href: item.href,
        meta: item.detail,
        title: item.label,
      }))}
    />
  );
}

export function SupermemoryMigrationLink() {
  return (
    <div className="wordcell-migration-banner">
      <ProviderMark mark="supermemory" size={36} tone="solid" />
      <MarketingActionLink emphasis="secondary" href="/migrate/supermemory" label="Move from Supermemory to Wordcell" />
    </div>
  );
}
