# Use Wordcell with an existing Obsidian vault

Point Wordcell at the folder Obsidian already uses as a vault. Wordcell reads
the Markdown files where they are: it needs no `index.md`, no import, and no
change to your notes, and it does not read the `.obsidian/` settings folder.
Your coding agent can then search the vault, follow its wikilinks, and read
notes, with the write tools turned off if you prefer.

The behavior on this page was checked on October 4, 2026 with Wordcell 0.26.3
on a test vault that has an `.obsidian/` folder and one note for each link
form in the table below. The vault was a Git repository, and `git status`
showed no changes after any command on this page, including the MCP tool
calls.

## Search the vault

Wordcell 0.22.0 and newer search a folder without initializing it. Run an
exact search with the vault's absolute path:

```sh
wordcell search "retry budget" --root /absolute/path/to/vault --mode exact
```

[Search an existing Markdown or Obsidian vault](getting-started.md#search-an-existing-markdown-or-obsidian-vault)
lists the files a search skips and what to try when nothing matches. Exact
search finds text in callouts, inline `#tags`, and frontmatter, and it matches
a note's `aliases` as well as its title. Wordcell reads only `.md` files, so
canvases and attachments are not searched.

## What Wordcell reads from Obsidian notes

| Obsidian syntax | Example | What Wordcell does |
| --- | --- | --- |
| Wikilink to a note | `[[Parser rewrite]]` | Resolves the link and counts it as a backlink. |
| Display text | `[[Parser rewrite\|the rewrite]]` | Resolves the link. |
| Folder path | `[[Projects/Parser rewrite]]` | Resolves the link. |
| Heading or block link | `[[Parser rewrite#Retry budget]]`, `[[Parser rewrite#^retry-budget]]` | Resolves the link to the note. It does not check that the heading or block exists. |
| Embedded note or section | `![[Parser rewrite]]`, `![[Parser rewrite#Retry budget]]` | Resolves the link and counts it as a backlink. |
| Two notes with the same name | `[[Standup]]` | Reports an ambiguous link and names both paths. Link with the folder path instead. |
| Different letter case | `[[parser rewrite]]` | Reports a broken link. Match the case of the file name. |
| Alias as the link target | `[[Parser v2]]` | Reports a broken link and lists an unlinked mention of the note that has the alias. |
| Markdown link to a note | `[the rewrite](../Projects/Parser%20rewrite.md)` | Ignores it: the link is neither counted nor reported. |
| Embedded or linked attachment | `![[Diagram.png]]`, `![[Diagram.png\|300]]`, `![[Spec.pdf#page=2]]`, `[[Spec.pdf]]` | Finds the file by name anywhere in the vault. A missing file is an error. |
| Frontmatter properties | `status: active` | Filters with `wordcell list --where status=active`. |
| Frontmatter tags | `tags: [project, standup/weekly]` | Filters with `wordcell list --tag project`. A nested tag matches only in full: `--tag standup/weekly` finds it and `--tag standup` does not. |
| Inline tags | `#decision`, `#standup/notes` | Searches them as text. `--tag` does not see them. |
| Callouts | `> [!warning] Rollback plan` | Searches the callout's text. |
| Settings folder | `.obsidian/app.json` | Does not read it. |

When you pick a note through one of its aliases, Obsidian writes the link as
`[[Parser rewrite|Parser v2]]`, as its
[aliases guide](https://obsidian.md/help/aliases) describes, and Wordcell
resolves that form. Only a link that names the alias alone breaks. Wordcell's
link graph reads wikilinks and typed relations, so a vault that links notes
with Markdown links has no backlinks in Wordcell. In Obsidian's own search,
`tag:inbox` also matches nested tags such as `#inbox/to-read`
([tags guide](https://obsidian.md/help/tags)); Wordcell's `--tag` matches the
full tag and reads only the `tags` property.

## Check links and attachments

`wordcell check` reports broken and ambiguous wikilinks and missing
attachments, and it changes no files. It runs on a vault without an
`index.md`:

```sh
wordcell check --root /absolute/path/to/vault
```

On the test vault it reported these errors:

```text
error: Links/alias-as-target.md:5: broken wikilink [[Parser v2]]
error: Links/ambiguous-name.md:5: ambiguous wikilink [[Standup]] (Archive/Standup, Meetings/2026/Standup)
error: Links/different-case.md:5: broken wikilink [[parser rewrite]]
error: Links/missing-note.md:5: broken wikilink [[Tokenizer benchmark]]
error: Areas/Inbox.md:3: missing attachment Missing diagram.png: Obsidian attachment basename was not found in the vault.
```

The command exits with status 3 when it finds an error. It also lists notes
that nothing links to and titles or aliases mentioned without a link. Those
are advisories: a vault with advisories and no errors exits with status 0.

Obsidian's own help vault is a larger test. On a local copy of the
[obsidian-help](https://github.com/obsidianmd/obsidian-help) repository at its
September 29, 2026 commit, Wordcell read the 176 notes in the English folder,
resolved 959 links, and reported 68 broken and five ambiguous ones. Of the 68, 46
named an existing note with different letter case. It found 251 of the 253
attachments the notes reference.

## Serve the vault to your agent without changes

Start the server with `--read-only`, so the agent can search and read but not
write. For Claude Code:

```sh
claude mcp add --transport stdio wordcell -- wordcell mcp --root /absolute/path/to/vault --read-only
```

[Connect Wordcell to your coding agent](agent-handoffs.md) has the same step
for Codex, Cursor, and Claude Desktop, and the checks to run after it. With
`--read-only`, the server offers `search`, `list_notes`, `get_note`,
`backlinks`, and `links`, and a call to `create_note` fails with
`Unknown tool: create_note`.

Note IDs are vault paths without `.md`, spaces included, such as
`Projects/Parser rewrite`. `get_note` returns the note's frontmatter as JSON,
including `aliases`, `tags`, and your other properties, and `backlinks`
returns the notes that link to it.

Ask for `mode: "exact"` until you decide to use semantic search. The default
mode, `hybrid`, downloads an embedding model on first use. In this check,
Wordcell kept that model and its search index under `~/.cache`, outside the
vault.

## Let the agent write notes

Without `--read-only`, the agent can create notes, replace a note body at the
revision it read, and add typed relations. A new note is an ordinary Markdown
file with YAML frontmatter, and Obsidian
[picks up changes made by other programs](https://obsidian.md/help/data-storage),
so it appears in the vault like any other note. `create_note` does not create
folders. `update_note_body` keeps the note's frontmatter and fails if the note
changed after the agent read it. Commit the vault before you turn on the write
tools, so `git diff` shows each change the agent makes.
