// The migration landing page's steps. Every command is copied from
// docs/migration-from-supermemory.md, and a test checks that the guide still
// contains each one.

import type { ReactNode } from "react";

import { SETUP_COMMANDS } from "./setup-prompt";

export const MIGRATION_GUIDE_PATH = "/docs/migration-from-supermemory";

/** When the Supermemory pages linked from the migration page were last read. */
export const supermemoryFeaturesCheckedOn = "2026-09-26";

export const supermemoryPages = {
  containerTags: "https://supermemory.ai/docs/concepts/container-tags",
  userProfiles: "https://supermemory.ai/docs/concepts/user-profiles",
  graphMemory: "https://supermemory.ai/docs/concepts/graph-memory",
  connectors: "https://supermemory.ai/docs/connectors/overview",
  mcp: "https://supermemory.ai/docs/supermemory-mcp/mcp",
} as const;

export type MigrationStep = Readonly<{
  id: string;
  title: string;
  /** The prerequisite or condition, shown before the commands. */
  lead: ReactNode;
  commands: readonly string[];
  /** What the commands produce, shown after them. */
  note?: ReactNode;
  /** The docs section this step condenses. */
  href: `/docs/${string}`;
}>;

export const migrationSteps = [
  {
    id: "install",
    title: "Install Wordcell from source",
    lead: "You need Bun 1.3.14 or newer and Git.",
    commands: SETUP_COMMANDS.install,
    href: "/docs/reference#installation-reference",
  },
  {
    id: "export",
    title: "Export your data",
    lead: <>Leave the Wordcell checkout, for example with <code>cd ..</code>. Save the guide’s export script in your working directory and set <code>SUPERMEMORY_API_KEY</code>. The script uses curl and jq.</>,
    commands: ["sh export-supermemory.sh <tag>..."],
    note: <>The script saves your documents, and the memory entries for each container tag, as JSON pages. A Python version saves one <code>supermemory-export.json</code> file.</>,
    href: `${MIGRATION_GUIDE_PATH}#export-your-data`,
  },
  {
    id: "import",
    title: "Import into a vault",
    lead: <>Run <code>wordcell init kb</code> only if you do not have a vault yet. With the Python script, name <code>supermemory-export.json</code> in place of the two patterns.</>,
    commands: [
      "wordcell init kb",
      "wordcell import supermemory documents-*.json memories-*.json --root kb --dry-run",
      "wordcell import supermemory documents-*.json memories-*.json --root kb",
      "wordcell refresh --root kb",
      "wordcell check --root kb",
    ],
    note: "The dry run counts what the import would create, update, skip, report as a conflict, or reject, and writes nothing. Import again at any time: notes you edited since the last import are reported as conflicts and left unchanged.",
    href: `${MIGRATION_GUIDE_PATH}#import-into-a-vault`,
  },
  {
    id: "verify",
    title: "Verify and commit",
    lead: <>Search for a phrase you remember saving. Skip <code>git init</code> when the vault is inside a project repository.</>,
    commands: [
      "wordcell list --root kb --where imported_from=supermemory",
      "wordcell search \"dark mode\" --root kb --mode exact",
      "cd kb",
      "git init -b main",
      "git add -A",
      "git commit -m \"Import Supermemory export\"",
    ],
    href: `${MIGRATION_GUIDE_PATH}#verify-the-result`,
  },
] as const satisfies readonly MigrationStep[];

export type ConceptRow = Readonly<{ supermemory: string; href?: string; wordcell: ReactNode }>;

/** A condensed form of the guide's concept map. */
export const migrationConcepts: readonly ConceptRow[] = [
  { supermemory: "Container tag", href: supermemoryPages.containerTags, wordcell: <>A vault per project or person. Imported documents keep their tags in <code>container_tag</code> and <code>container_tags</code>.</> },
  { supermemory: "Document", wordcell: <>A note under <code>articles/</code> or <code>notes/imported/</code>.</> },
  { supermemory: "Memory entry and its versions", wordcell: <>One note per version under <code>notes/imported/memories/</code>, each linked to the one before it by a <code>supersedes</code> relation.</> },
  { supermemory: "User profile", href: supermemoryPages.userProfiles, wordcell: <>A <code>type: profile</code> note that your agent maintains.</> },
  { supermemory: "Automatic extraction", href: supermemoryPages.graphMemory, wordcell: <>Notes that you or your agent write. <code>wordcell percolate</code> suggests connections for you to review.</> },
  { supermemory: "Hosted MCP server", href: supermemoryPages.mcp, wordcell: <><code>wordcell mcp</code>, a local server whose tools include <code>search</code>, <code>list_notes</code>, <code>get_note</code>, <code>create_note</code>, and <code>update_note_body</code>.</> },
];
