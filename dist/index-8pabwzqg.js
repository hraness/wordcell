// @bun
// src/cli-help.ts
var ROOT = ["--root <directory>", "Knowledge base folder (default: current directory)"];
var INDEX = ["--index <path>", "Catalog note to use (default: index.md)"];
var JSON_OPTION = ["--json", "Print machine-readable output"];
var REPO = ["--repo <repository>", "Git repository the notes describe"];
var WHERE = ["--where <path=value>", "Keep notes whose metadata field has this value"];
var HAS = ["--has <path>", "Keep notes that set this metadata field"];
var TAG = ["--tag <tag>", "Keep notes with this tag"];
var SCOPE = ["--scope <repository-path>", "Keep notes about this code path"];
var DATABASE = ["--database <path>", "Use this search index file"];
var MODE = [
  "--mode <hybrid|exact|keyword|semantic>",
  "Match exact words, the keyword index, meaning, or keywords and meaning together"
];
var RULES = ["--rules <file>", "Apply reviewed search aliases from a JSON file"];
var PRIORITY = ["--priority", "Order results by the rules file first"];
var DEPTH = ["--depth <count>", "How many links to follow (1 to 10)"];
var DIRECTION = ["--direction <in|out|both>", "Follow incoming links, outgoing links, or both"];
var commandHelp = [
  {
    id: "init",
    label: "init [directory]",
    usage: "wordcell init [directory] [--json]",
    summary: "Create a knowledge base folder (default: kb). It never merges into an existing folder.",
    group: "start",
    options: [JSON_OPTION],
    examples: ["wordcell init kb"]
  },
  {
    id: "note create",
    label: "note create <id>",
    usage: "wordcell note create <id> --title <title> [options]",
    summary: "Write one new Markdown note.",
    group: "start",
    options: [
      ["--title <title>", "Note title (required)"],
      ["--type <type>", "Note type, such as decision or concept"],
      ["--tag <tag>", "Add a tag (repeatable)"],
      ["--body <markdown>", "Note body"],
      ["--body-file <path|->", "Read the body from a file, or from piped input with -"],
      ROOT,
      JSON_OPTION
    ],
    examples: [
      'wordcell note create notes/first --title "First note" --body "Keep retries bounded." --root kb'
    ]
  },
  {
    id: "search",
    label: "search <query>",
    usage: "wordcell search <query> [options]",
    summary: "Search notes by words or meaning.",
    group: "start",
    notes: [
      "Exact mode needs no index or model. Keyword, semantic, and hybrid modes",
      "use the local index from `wordcell index`."
    ],
    options: [
      ROOT,
      MODE,
      ["--limit <count>", "Show at most this many results"],
      WHERE,
      HAS,
      TAG,
      SCOPE,
      ["--related <note>", "Also show notes linked to this note"],
      ["--graph-depth <1|2>", "How far to follow links for context"],
      ["--no-graph", "Skip link context"],
      ["--history", "Add recent Git history when available"],
      ["--no-history", "Skip Git history (default)"],
      ["--require-history", "Fail when Git history is unavailable"],
      REPO,
      DATABASE,
      RULES,
      PRIORITY,
      ["--candidate-limit <count>", "How many candidates to rank before trimming"],
      ["--min-score <score>", "Drop results scoring below this (0 to 1)"],
      ["--rerank <typesafe>", "Rerank results with the hosted TypeSafe service"],
      ["--rerank-limit <2..25>", "How many results the reranker sees"],
      ["--selected-passage", "Add a local source excerpt to each result"],
      JSON_OPTION
    ],
    examples: ['wordcell search "retries" --root kb --mode exact', 'wordcell search "retry policy" --root kb --limit 5']
  },
  {
    id: "check",
    label: "check",
    usage: "wordcell check [options]",
    summary: "Check links, metadata, and attachments. It changes no files.",
    group: "start",
    options: [
      ROOT,
      INDEX,
      ["--no-catalog", "Skip the catalog check"],
      ["--repo <repository>", "Also report notes whose code paths no longer exist"],
      JSON_OPTION
    ],
    examples: ["wordcell check --root kb", "wordcell check --root kb --repo ."]
  },
  {
    id: "list",
    label: "list",
    usage: "wordcell list [options]",
    summary: "List notes by metadata or tag. Also: wordcell notes.",
    group: "notes",
    options: [
      ROOT,
      INDEX,
      WHERE,
      HAS,
      TAG,
      SCOPE,
      ["--sort <field>", "Sort by a metadata field, title, path, or link counts"],
      ["--order <asc|desc>", "Sort direction"],
      ["--limit <count>", "Show at most this many notes"],
      JSON_OPTION
    ],
    examples: ["wordcell list --root kb --tag decision", "wordcell list --root kb --where status=active"]
  },
  {
    id: "links",
    label: "links <note>",
    usage: "wordcell links <note> [options]",
    summary: "Follow links into and out of a note.",
    group: "notes",
    options: [ROOT, INDEX, DIRECTION, DEPTH, ["--limit <count>", "Show at most this many notes"], JSON_OPTION],
    examples: ["wordcell links notes/first --root kb --direction both --depth 2"]
  },
  {
    id: "backlinks",
    label: "backlinks <note>",
    usage: "wordcell backlinks <note> [options]",
    summary: "Show the notes that link to a note.",
    group: "notes",
    options: [ROOT, INDEX, JSON_OPTION],
    examples: ["wordcell backlinks notes/first --root kb"]
  },
  {
    id: "relation",
    label: "relation add|remove|list",
    usage: "wordcell relation <add|remove|list> ...",
    summary: "Edit a note's typed links. They live in its frontmatter.",
    group: "notes",
    family: true,
    options: [],
    examples: ["wordcell relation add notes/first supersedes notes/old --root kb"],
    notes: ["Run `wordcell relation add --help` for each action."]
  },
  {
    id: "relation add",
    label: "relation add <source> <predicate> <target>",
    usage: "wordcell relation add <source> <predicate> <target> [options]",
    summary: "Add a typed link from one note to another. Running it twice changes nothing.",
    group: "notes",
    unlisted: true,
    options: [ROOT, ["--expected-revision <sha256:...>", "Only write if the note is still at this revision"], JSON_OPTION],
    examples: ["wordcell relation add notes/first supersedes notes/old --root kb"]
  },
  {
    id: "relation remove",
    label: "relation remove <source> <predicate> <target>",
    usage: "wordcell relation remove <source> <predicate> <target> [options]",
    summary: "Remove a typed link from a note.",
    group: "notes",
    unlisted: true,
    options: [ROOT, ["--expected-revision <sha256:...>", "Only write if the note is still at this revision"], JSON_OPTION],
    examples: ["wordcell relation remove notes/first supersedes notes/old --root kb"]
  },
  {
    id: "relation list",
    label: "relation list <note>",
    usage: "wordcell relation list <note> [options]",
    summary: "List a note's typed links in both directions.",
    group: "notes",
    unlisted: true,
    options: [ROOT, JSON_OPTION],
    examples: ["wordcell relation list notes/first --root kb"]
  },
  {
    id: "refresh",
    label: "refresh",
    usage: "wordcell refresh [options]",
    summary: "Update the catalog in index.md. It also reports link problems.",
    group: "notes",
    options: [ROOT, INDEX, JSON_OPTION],
    examples: ["wordcell refresh --root kb"]
  },
  {
    id: "catalog",
    label: "catalog",
    usage: "wordcell catalog [options]",
    summary: "Print a catalog of every note. It writes nothing.",
    group: "notes",
    options: [ROOT, INDEX, JSON_OPTION],
    examples: ["wordcell catalog --root kb"]
  },
  {
    id: "import supermemory",
    label: "import supermemory <file>",
    usage: "wordcell import supermemory <export.json>... [options]",
    summary: "Import a Supermemory export as notes.",
    group: "notes",
    options: [
      ROOT,
      ["--prefix <directory>", "Put every imported note in this folder"],
      ["--dry-run", "Show what would be written without writing"],
      JSON_OPTION
    ],
    examples: ["wordcell import supermemory export.json --root kb --dry-run"]
  },
  {
    id: "index",
    label: "index",
    usage: "wordcell index [options]",
    summary: "Build the local index for meaning-based search.",
    group: "search",
    notes: ["The first run downloads a local embedding model (about 300 MB) once."],
    options: [ROOT, DATABASE, ["--force", "Rebuild the index from scratch"], JSON_OPTION],
    examples: ["wordcell index --root kb"]
  },
  {
    id: "context",
    label: "context <path>",
    usage: "wordcell context <repository-path> [options]",
    summary: "Find notes and AGENTS.md files for a code path.",
    group: "search",
    options: [
      ["--root <vault>", "Knowledge base folder (default: current directory)"],
      REPO,
      ["--kind <auto|file|directory>", "Treat the path as a file or a folder"],
      JSON_OPTION
    ],
    examples: ["wordcell context src/index.ts --root kb --repo ."]
  },
  {
    id: "history",
    label: "history <note>",
    usage: "wordcell history <note> [options]",
    summary: "Show the Git commits that changed a note. Also: wordcell history search <query>.",
    group: "search",
    options: [
      ROOT,
      REPO,
      ["--limit <count>", "Show at most this many commits"],
      ["--cochanged-limit <count>", "Show at most this many files changed alongside"],
      JSON_OPTION
    ],
    examples: ["wordcell history notes/first --root kb --repo ."]
  },
  {
    id: "history search",
    label: "history search <query>",
    usage: "wordcell history search <query-or-path> [options]",
    summary: "Search commit messages and changed paths in the repository.",
    group: "search",
    unlisted: true,
    options: [
      ROOT,
      REPO,
      ["--limit <count>", "Show at most this many results"],
      ["--commit-limit <count>", "Read at most this many commits"],
      ["--cochanged-limit <count>", "Show at most this many files changed alongside"],
      JSON_OPTION
    ],
    examples: ['wordcell history search "retry" --root kb --repo .']
  },
  {
    id: "inbox",
    label: "inbox",
    usage: "wordcell inbox [options]",
    summary: "List saved sources no note links to yet. Also: wordcell source-inbox.",
    group: "search",
    options: [
      ROOT,
      INDEX,
      ["--source-prefix <directory>", "Look for sources in this folder (repeatable)"],
      ["--limit <count>", "Show at most this many sources"],
      JSON_OPTION
    ],
    examples: ["wordcell inbox --root kb"]
  },
  {
    id: "clip",
    label: "clip <url|current>",
    usage: "wordcell clip <url|current> [options]",
    summary: "Save a web page as Markdown. Threads, videos, and images are kept too.",
    group: "capture",
    options: [],
    examples: ["wordcell clip https://example.com/article --output kb/articles"],
    notes: ["Run `wordcell clip --help` for every capture option."]
  },
  {
    id: "inspect",
    label: "inspect <url>",
    usage: "wordcell inspect <url> [options]",
    summary: "Preview a capture. It writes no files.",
    group: "capture",
    options: [],
    examples: ["wordcell inspect https://example.com/article"]
  },
  {
    id: "pdf",
    label: "pdf <file-or-url>",
    usage: "wordcell pdf <file-or-url> [options]",
    summary: "Save a PDF as Markdown. The original file and its images are kept.",
    group: "capture",
    options: [],
    examples: ["wordcell pdf paper.pdf --output kb/articles"]
  },
  {
    id: "capture",
    label: "capture show|verify|diff",
    usage: "wordcell capture <show|verify|diff> <bundle> [options]",
    summary: "Read, check, or compare a saved capture.",
    group: "capture",
    family: true,
    options: [],
    examples: ["wordcell capture verify kb/articles/example"],
    notes: ["Run `wordcell capture show --help` for each action. `wordcell capture <url>` is the same as clip."]
  },
  {
    id: "capture show",
    label: "capture show <bundle>",
    usage: "wordcell capture show <bundle> [options]",
    summary: "Print a saved capture as plain text.",
    group: "capture",
    unlisted: true,
    options: [
      ["--verify-assets", "Also check saved images and files"],
      ["--include-source-html", "Include the original page HTML"],
      JSON_OPTION
    ],
    examples: ["wordcell capture show kb/articles/example"]
  },
  {
    id: "capture verify",
    label: "capture verify <bundle>",
    usage: "wordcell capture verify <bundle> [options]",
    summary: "Check that a saved capture still matches its recorded hashes.",
    group: "capture",
    unlisted: true,
    options: [["--verify-assets", "Also check saved images and files"], JSON_OPTION],
    examples: ["wordcell capture verify kb/articles/example --verify-assets"]
  },
  {
    id: "capture diff",
    label: "capture diff <bundle>",
    usage: "wordcell capture diff <bundle> [options]",
    summary: "Compare a saved capture with an earlier Git version.",
    group: "capture",
    unlisted: true,
    options: [REPO, ["--ref <ref>", "Git version to compare with (default: HEAD)"], JSON_OPTION],
    examples: ["wordcell capture diff kb/articles/example --repo . --ref main"]
  },
  {
    id: "publish",
    label: "publish --out <directory>",
    usage: "wordcell publish --out <directory> [options]",
    summary: "Build a static website from your notes.",
    group: "publish",
    options: [
      ["--out <directory>", "Folder to write the site to (required)"],
      ROOT,
      INDEX,
      ["--include <path>", "Publish only these notes or folders (repeatable)"],
      ["--exclude <path>", "Leave out these notes or folders (repeatable)"],
      ["--include-glob <pattern>", "Publish notes matching a pattern (repeatable)"],
      ["--exclude-glob <pattern>", "Leave out notes matching a pattern (repeatable)"],
      WHERE,
      HAS,
      TAG,
      SCOPE,
      ["--from <note>", "Publish the notes linked from this note"],
      DEPTH,
      DIRECTION,
      ["--title <title>", "Site title"],
      ["--description <text>", "Site description"],
      ["--base-path <path>", "Serve the site under this path"],
      ["--base-url <url>", "Public address of the site"],
      ["--noindex", "Ask search engines not to index the site"],
      ["--no-index-content", "Leave note text out of the site search"],
      ["--deterministic", "Omit the build time so builds match byte for byte"],
      ["--dry-run", "Show what would be published without writing"],
      ["--list-limit <0-1000>", "How many paths to list in the report"],
      ["--force", "Replace an existing output folder"],
      JSON_OPTION
    ],
    examples: ["wordcell publish --root kb --out site", "wordcell publish --root kb --out site --tag public"]
  },
  {
    id: "serve",
    label: "serve --root <directory>",
    usage: "wordcell serve --root <directory> [options]",
    summary: "Preview a published site on this computer.",
    group: "publish",
    options: [
      ["--root <directory>", "Published site folder (required)"],
      ["--host <host>", "Address to listen on (default: 127.0.0.1)"],
      ["--port <port>", "Port to listen on"],
      JSON_OPTION
    ],
    examples: ["wordcell serve --root site --port 8080"]
  },
  {
    id: "mcp",
    label: "mcp --root <vault>",
    usage: "wordcell mcp --root <vault> [options]",
    summary: "Serve your notes to AI apps over MCP.",
    group: "publish",
    notes: ["MCP (Model Context Protocol) is how AI apps such as Claude call local tools."],
    options: [
      ["--root <vault>", "Knowledge base folder (required)"],
      REPO,
      ["--read-only", "Offer only the read tools"]
    ],
    examples: ["wordcell mcp --root /absolute/path/to/kb --read-only"]
  },
  {
    id: "agents",
    label: "agents check|audit",
    usage: "wordcell agents <check|audit|identity> ...",
    summary: "Check the notes that give coding agents context for each code folder.",
    group: "agents",
    family: true,
    unlisted: true,
    options: [],
    examples: ["wordcell agents check --root kb --repo ."],
    notes: ["Run `wordcell agents check --help` for each action."]
  },
  {
    id: "agents check",
    label: "agents check",
    usage: "wordcell agents check [options]",
    summary: "Check AGENTS.md context notes against the code.",
    group: "agents",
    options: [["--root <vault>", "Knowledge base folder"], REPO, JSON_OPTION],
    examples: ["wordcell agents check --root kb --repo ."]
  },
  {
    id: "agents audit",
    label: "agents audit",
    usage: "wordcell agents audit [options]",
    summary: "Find long or repeated AGENTS.md rules. It runs agents check first.",
    group: "agents",
    options: [["--root <vault>", "Knowledge base folder"], REPO, JSON_OPTION],
    examples: ["wordcell agents audit --root kb --repo ."]
  },
  {
    id: "doctor",
    label: "doctor",
    usage: "wordcell doctor [--json]",
    summary: "Check optional tools for capture and search. It changes nothing.",
    group: "diagnostics",
    options: [JSON_OPTION],
    examples: ["wordcell doctor"]
  },
  {
    id: "adapters",
    label: "adapters",
    usage: "wordcell adapters [--json]",
    summary: "List the sites and platforms clip supports.",
    group: "diagnostics",
    options: [JSON_OPTION],
    examples: ["wordcell adapters"]
  },
  {
    id: "graph",
    label: "graph",
    usage: "wordcell graph [options]",
    summary: "Show the link graph and broken links. Unlinked notes are listed too.",
    group: "diagnostics",
    notes: ["See `wordcell help advanced` for graph rebuild, verify, and query."],
    options: [ROOT, INDEX, JSON_OPTION],
    examples: ["wordcell graph --root kb"]
  },
  {
    id: "agents identity",
    label: "agents identity <scope>",
    usage: "wordcell agents identity <repository-scope> [--json]",
    summary: "Print the context note name and marker for a code folder, without writing.",
    group: "advanced",
    options: [JSON_OPTION],
    examples: ["wordcell agents identity packages/parser"]
  },
  {
    id: "graph rebuild",
    label: "graph rebuild",
    usage: "wordcell graph rebuild [options]",
    summary: "Rebuild the local graph cache from the Markdown files.",
    group: "advanced",
    options: [["--fresh", "Discard the old cache first"], ROOT, INDEX, JSON_OPTION],
    examples: ["wordcell graph rebuild --root kb"]
  },
  {
    id: "graph verify",
    label: "graph verify",
    usage: "wordcell graph verify [options]",
    summary: "Check that the local graph cache matches the Markdown files.",
    group: "advanced",
    options: [ROOT, INDEX, JSON_OPTION],
    examples: ["wordcell graph verify --root kb"]
  },
  {
    id: "graph query",
    label: "graph query --program <name>",
    usage: "wordcell graph query --program <name> [options]",
    summary: "Run a built-in graph query, with proof of each answer.",
    group: "advanced",
    options: [
      ["--program <name>", "backlinks, reachability, scope-route, relation-closure, shared-tags, or shared-concepts"],
      ["--note <id>", "Start from this note"],
      ["--scope <path>", "Start from this code path"],
      ["--predicate <predicate>", "Follow only this typed link"],
      DEPTH,
      ["--limit <count>", "Show at most this many results"],
      ["--persisted", "Read the saved graph cache"],
      ROOT,
      INDEX,
      JSON_OPTION
    ],
    examples: ["wordcell graph query --program backlinks --note notes/first --root kb"]
  },
  {
    id: "percolate",
    label: "percolate [note]",
    usage: "wordcell percolate [note] [options]",
    summary: "Suggest recurring concepts and missing links, with evidence. Writes nothing.",
    group: "advanced",
    options: [
      ["--proofs", "Show the evidence for one note"],
      ["--min-support <count>", "Require this many supporting notes"],
      ["--limit <count>", "Show at most this many suggestions"],
      ROOT,
      JSON_OPTION
    ],
    examples: ["wordcell percolate --root kb"]
  },
  {
    id: "portfolio search",
    label: "portfolio search <query>",
    usage: "wordcell portfolio search <query> --registry <file> --workspace <directory> [options]",
    summary: "Search several knowledge bases you list in a registry file.",
    group: "advanced",
    options: [
      ["--registry <file>", "Registry of knowledge bases (required)"],
      ["--workspace <directory>", "Folder that holds their checkouts (required)"],
      ["--shared", "Search every shared entry"],
      ["--vault <owner/id>", "Search this entry (repeatable)"],
      MODE,
      RULES,
      PRIORITY,
      ["--limit <count>", "Show at most this many results"],
      ["--require-all", "Fail when any selected knowledge base is missing"],
      JSON_OPTION
    ],
    examples: ['wordcell portfolio search "retries" --registry kb-portfolio.json --workspace .. --shared']
  },
  {
    id: "portfolio audit",
    label: "portfolio audit",
    usage: "wordcell portfolio audit --registry <file> --workspace <directory> [options]",
    summary: "Check several knowledge bases for broken links, duplicates, and missing files.",
    group: "advanced",
    options: [
      ["--registry <file>", "Registry of knowledge bases (required)"],
      ["--workspace <directory>", "Folder that holds their checkouts (required)"],
      ["--all", "Audit every entry"],
      ["--shared", "Audit every shared entry"],
      ["--vault <owner/id>", "Audit this entry (repeatable)"],
      ["--strict", "Fail on warnings"],
      JSON_OPTION
    ],
    examples: ["wordcell portfolio audit --registry kb-portfolio.json --workspace .. --all"]
  },
  {
    id: "evaluate",
    label: "evaluate <manifest.json>",
    usage: "wordcell evaluate <manifest.json> [options]",
    summary: "Measure how well each search method finds the right notes in a frozen test set.",
    group: "advanced",
    options: [
      ROOT,
      REPO,
      DATABASE,
      ["--retriever <id>", "Run only this search method (repeatable)"],
      ["--split <development|test|all>", "Which questions to run"],
      ["--limit <count>", "Results to keep per question"],
      ["--cutoff <count>", "Rank cutoff for the scores"],
      ["--timeout <milliseconds>", "Time limit per question"],
      ["--baseline <id>", "Compare every method with this one"],
      ["--model-file <path>", "Record the embedding model file used"],
      ["--cache-state <cold|mixed|warm>", "Record how warm the caches were"],
      JSON_OPTION
    ],
    examples: ["wordcell evaluate eval/manifest.json --root kb --repo ."]
  },
  {
    id: "url-metadata tool",
    label: "url-metadata tool build|check",
    usage: "wordcell url-metadata tool <build|check>",
    summary: "Build or check the helper that looks up metadata for saved links. Needs Rust.",
    group: "advanced",
    options: [],
    examples: ["wordcell url-metadata tool build"]
  },
  {
    id: "url-metadata backfill",
    label: "url-metadata backfill",
    usage: "wordcell url-metadata backfill [options]",
    summary: "Add title and archive metadata files next to saved links.",
    group: "advanced",
    options: [],
    examples: ["wordcell url-metadata backfill --root kb"],
    notes: ["Run `wordcell url-metadata --help` for every option."]
  },
  {
    id: "update",
    label: "update [check|status|enable|disable]",
    usage: "wordcell update [check|status|enable|disable] [--json]",
    summary: "Update this global installation or change automatic update settings.",
    group: "advanced",
    options: [JSON_OPTION, ["--check", "Check the latest release without installing"]],
    examples: ["wordcell update status", "wordcell update disable"],
    notes: [
      "Supported global installs on macOS and Linux update daily before work.",
      "Set HRANESS_NO_UPDATE=1 to skip automatic checks for one invocation.",
      "Active commands prevent replacement. SDK imports never check for updates."
    ]
  },
  {
    id: "support",
    label: "support",
    usage: "wordcell support [status | enable | dismiss | snooze] [--json]",
    summary: "Optional support settings. No command signs you up or charges you.",
    group: "advanced",
    notes: ["Set HRANESS_SUPPORT=off to turn off support invitations."],
    options: [JSON_OPTION],
    examples: ["wordcell support status"]
  }
];
var COMMAND_ALIASES = {
  notes: "list",
  "source-inbox": "inbox"
};
var byId = new Map(commandHelp.map((entry) => [entry.id, entry]));
var GROUP_TITLES = [
  ["start", "Start here"],
  ["notes", "Notes and links"],
  ["search", "Search"],
  ["capture", "Capture"],
  ["publish", "Publish and serve"],
  ["agents", "Agents"],
  ["diagnostics", "Diagnostics"]
];
var DESCRIPTION = [
  "Wordcell keeps decisions, plans, and sources as Markdown beside your code,",
  "so coding agents can find them from the file they are about to change."
];
var LABEL_WIDTH = 28;
var MAX_COLUMNS = 80;
function wrapWords(text, width) {
  const lines = [];
  let current = "";
  for (const word of text.split(" ")) {
    if (current !== "" && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current === "" ? word : `${current} ${word}`;
    }
  }
  if (current !== "")
    lines.push(current);
  return lines;
}
function row(label, summary, indent = "  ", width = LABEL_WIDTH) {
  const column = indent.length + width;
  const padded = `${indent}${label}`;
  const summaryLines = wrapWords(summary, Math.max(20, MAX_COLUMNS - column));
  const continuation = summaryLines.slice(1).map((line) => `${" ".repeat(column)}${line}`);
  if (label === "")
    return [`${" ".repeat(column)}${summaryLines[0] ?? ""}`, ...continuation].join(`
`);
  const head = padded.length < column ? [`${padded.padEnd(column)}${summaryLines[0] ?? ""}`] : [padded, `${" ".repeat(column)}${summaryLines[0] ?? ""}`];
  return [...head, ...continuation].join(`
`);
}
function firstSentence(summary) {
  const end = summary.search(/\.(\s|$)/u);
  return end === -1 ? summary : summary.slice(0, end);
}
function listGroup(group) {
  return commandHelp.filter((entry) => entry.group === group && entry.unlisted !== true).map((entry) => row(entry.label, firstSentence(entry.summary)));
}
function startHelp(version) {
  const start = (command, summary) => row(command, summary, "  ", 40);
  const lines = [
    ...DESCRIPTION,
    "",
    "Start here (no account or model needed)",
    start("wordcell init kb", "Create a knowledge base in ./kb"),
    start('wordcell note create notes/first --title "First note" --root kb', "Write your first note"),
    start('wordcell search "first" --root kb', "Search your notes"),
    start("wordcell check --root kb", "Check links and metadata"),
    "",
    "Everyday",
    start("wordcell clip <url> --output kb/articles", "Save a web page as Markdown"),
    start("wordcell context <path> --root kb", "Find notes about a code path"),
    start("wordcell index --root kb", "Turn on meaning-based search"),
    "",
    "All commands: wordcell --help \xB7 Command help: wordcell help <command>"
  ];
  if (version !== undefined)
    lines.push(`wordcell ${version}`);
  return `${lines.join(`
`)}
`;
}
function rootHelp() {
  const lines = ["Usage: wordcell <command> [options]", "", ...DESCRIPTION];
  for (const [group, title] of GROUP_TITLES) {
    lines.push("", title, ...listGroup(group));
  }
  lines.push("", "Options", row("-h, --help", "Show help. Also: wordcell help <command>", "  ", 22), row("-V, --version", "Print the version", "  ", 22), row("--root <directory>", "Knowledge base folder (default: current directory)", "  ", 22), row("--json", "Print machine-readable output", "  ", 22), "", "More commands: wordcell help advanced \xB7 Docs: https://wordcell.io/docs", "Optional support: wordcell support \xB7 Turn off: HRANESS_SUPPORT=off");
  return `${lines.join(`
`)}
`;
}
function advancedHelp() {
  const lines = [
    "Usage: wordcell <command> [options]",
    "",
    "Advanced commands for maintainers, evaluation, and several knowledge bases.",
    "",
    ...listGroup("advanced"),
    "",
    "Command help: wordcell help <command> \xB7 Everyday commands: wordcell --help"
  ];
  return `${lines.join(`
`)}
`;
}
function commandHelpText(id) {
  const entry = byId.get(id);
  if (entry === undefined)
    return;
  const lines = [`Usage: ${entry.usage}`, "", ...wrapWords(entry.summary, MAX_COLUMNS)];
  if (entry.notes !== undefined)
    lines.push(...entry.notes);
  const family = commandHelp.filter((candidate) => candidate.id.startsWith(`${entry.id} `));
  if (family.length > 0) {
    lines.push("", "Commands", ...family.map((candidate) => row(`${candidate.label}`, firstSentence(candidate.summary))));
  }
  if (entry.options.length > 0) {
    const width = Math.min(30, Math.max(...entry.options.map(([spelling]) => spelling.length)) + 2);
    lines.push("", "Options", ...entry.options.map(([spelling, description]) => row(spelling, description, "  ", width)));
  }
  if (entry.examples.length > 0) {
    lines.push("", entry.examples.length === 1 ? "Example" : "Examples", ...entry.examples.map((example) => `  ${example}`));
  }
  return `${lines.join(`
`)}
`;
}
function canonicalFirstWord(word) {
  return COMMAND_ALIASES[word] ?? word;
}
function resolveCommandId(words) {
  const first = words[0];
  if (first === undefined)
    return;
  const head = canonicalFirstWord(first);
  const second = words[1];
  if (second !== undefined && byId.has(`${head} ${second}`))
    return `${head} ${second}`;
  if (byId.has(head))
    return head;
  if (head === "note")
    return "note create";
  if (head === "import")
    return "import supermemory";
  if (head === "portfolio")
    return "portfolio search";
  if (head === "url-metadata")
    return "url-metadata backfill";
  return;
}
function commandWordCount(id) {
  return id.split(" ").length;
}
function knownCommandWords() {
  const words = new Set;
  for (const entry of commandHelp)
    words.add(entry.id.split(" ")[0] ?? entry.id);
  for (const alias of Object.keys(COMMAND_ALIASES))
    words.add(alias);
  for (const word of ["help", "version", "note", "import", "portfolio", "url-metadata"])
    words.add(word);
  return [...words].toSorted();
}
function valueOptions(id) {
  const entry = byId.get(id);
  const names = new Set;
  for (const [spelling] of entry?.options ?? []) {
    if (spelling.includes("<"))
      names.add(spelling.split(" ")[0] ?? spelling);
  }
  return names;
}
function optionNames(id) {
  const entry = byId.get(id);
  return (entry?.options ?? []).map(([spelling]) => spelling.split(" ")[0] ?? spelling);
}
function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row_ = 1;row_ <= left.length; row_ += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = row_;
    for (let column = 1;column <= right.length; column += 1) {
      const above = previous[column] ?? 0;
      const cost = left[row_ - 1] === right[column - 1] ? 0 : 1;
      previous[column] = Math.min(above + 1, (previous[column - 1] ?? 0) + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[right.length] ?? Number.MAX_SAFE_INTEGER;
}
function closestMatch(input, candidates) {
  const letters = input.replace(/^-+/u, "").length;
  let best;
  let bestDistance = Math.max(1, Math.floor(letters / 3)) + 1;
  for (const candidate of candidates) {
    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

// src/cli-startup.ts
function isHelpFlag(argument) {
  return argument === "--help" || argument === "-h";
}
function delegatedHelp(first) {
  if (first === "clip" || first === "inspect")
    return { kind: "clip", arguments: ["help"] };
  if (first === "pdf")
    return { kind: "pdf", arguments: ["--help"] };
  if (first === "url-metadata")
    return { kind: "url-metadata", arguments: ["--help"] };
  return;
}
function parseHelpTopic(words) {
  const topic = words.filter((word) => !isHelpFlag(word) && word !== "--json");
  if (topic.length === 0)
    return { ok: true, value: { kind: "help" } };
  if (topic.length === 1 && topic[0] === "advanced")
    return { ok: true, value: { kind: "help", topic: "advanced" } };
  const delegated = delegatedHelp(topic[0] ?? "");
  if (delegated !== undefined)
    return { ok: true, value: delegated };
  const id = resolveCommandId(topic);
  if (id === undefined)
    return { ok: false, message: "unknown help topic" };
  return { ok: true, value: { kind: "help", topic: id } };
}
function embeddedHelp(arguments_) {
  const separator = arguments_.indexOf("--");
  const end = separator === -1 ? arguments_.length : separator;
  const index = arguments_.slice(0, end).findIndex(isHelpFlag);
  if (index <= 0)
    return;
  const delegated = delegatedHelp(arguments_[0] ?? "");
  if (delegated !== undefined) {
    return index === 1 || index === end - 1 ? { ok: true, value: delegated } : undefined;
  }
  const id = resolveCommandId(arguments_.slice(0, index).filter((word) => !word.startsWith("-")));
  if (id === undefined)
    return;
  const words = commandWordCount(id);
  const previous = arguments_[index - 1] ?? "";
  const flag = arguments_[index];
  const lastArgument = index === end - 1 && (flag === "--help" || !valueOptions(id).has(previous));
  if (index !== words && !lastArgument)
    return;
  return { ok: true, value: { kind: "help", topic: id } };
}
function parseCliStartupCommand(arguments_) {
  const command = arguments_[0];
  if (command === undefined)
    return { ok: true, value: { kind: "help", topic: "start" } };
  if (command === "help" || isHelpFlag(command))
    return parseHelpTopic(arguments_.slice(1));
  if (command === "--version" || command === "-V" || command === "-v" || command === "version") {
    return { ok: true, value: { kind: "version", json: arguments_.includes("--json") } };
  }
  const help = embeddedHelp(arguments_);
  if (help !== undefined)
    return help;
  if ((command === "clip" || command === "capture" || command === "inspect") && ["--help", "-h", "help"].includes(arguments_[1] ?? "")) {
    return { ok: true, value: { kind: "clip", arguments: ["help"] } };
  }
  return;
}

export { startHelp, rootHelp, advancedHelp, commandHelpText, resolveCommandId, knownCommandWords, optionNames, closestMatch, parseCliStartupCommand };
