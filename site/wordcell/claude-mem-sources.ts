// The Claude-Mem release, source files, and documentation pages the comparison
// page cites, read on the checked-on date. Recheck each page and the pinned
// release before changing a claim; Claude-Mem publishes new releases often.

/** When the Claude-Mem pages and source files linked from the comparison page were last read. */
export const claudeMemCheckedOn = "2026-10-04";

/** The Claude-Mem release whose README, hooks file, and license the page cites. */
export const claudeMemVersion = "13.30.0";

const source = (path: string) => `https://github.com/thedotmack/claude-mem/blob/v${claudeMemVersion}/${path}`;

export const claudeMemPages = {
  readme: source("README.md"),
  hooks: source("plugin/hooks/hooks.json"),
  license: source("LICENSE"),
  installation: "https://docs.claude-mem.ai/installation",
  gettingStarted: "https://docs.claude-mem.ai/usage/getting-started",
  configuration: "https://docs.claude-mem.ai/configuration",
  platforms: "https://docs.claude-mem.ai/platform-integration",
  searchTools: "https://docs.claude-mem.ai/usage/search-tools",
  exportImport: "https://docs.claude-mem.ai/usage/export-import",
  cloudSync: "https://docs.claude-mem.ai/cloud-sync",
  privateTags: "https://docs.claude-mem.ai/usage/private-tags",
} as const;
