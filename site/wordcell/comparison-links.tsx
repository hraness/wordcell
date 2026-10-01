import { MarketingActionLink, MarketingCardRow, ProviderMark } from "@hraness/design-kit/react/server";

export const comparisonLinks = [
  { id: "obsidian", label: "Obsidian", href: "/compare/obsidian", detail: "Add semantic search and code context to your Markdown vault." },
  { id: "basic-memory", label: "Basic Memory", href: "/compare/basic-memory", detail: "Find the decisions and rules behind the code you’re changing." },
  { id: "supermemory", label: "Supermemory", href: "/compare/supermemory", detail: "Free local memory, with no account or subscription." },
  { id: "mem0", label: "Mem0", href: "/compare/mem0", detail: "Keep memories editable and review every change in Git." },
] as const;

export function ComparisonLinks() {
  return (
    <MarketingCardRow
      ariaLabel="Compare Wordcell with other tools"
      columns={2}
      cards={comparisonLinks.map((item) => ({
        icon: <ProviderMark mark={item.label} size={56} tone="solid" />,
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
