Wordcell is a local knowledge base built on the Markdown files you already keep. It indexes those files for search, builds a graph from the links you wrote, and gives every result a path back to the note it came from. The files stay where they are, in a format Obsidian, Git, and any text editor can read, and every index can be deleted and rebuilt from them.

A rule like "parser retries stop after three attempts" tends to get decided once and then lost. It lives in a chat that closes, a commit message nobody searches, or a note on someone's laptop. The next coding agent to touch the parser starts from the code and never sees it. With Wordcell, the rule is a note the agent can find and cite.

## Your Markdown stays the record

Wordcell reads a folder of Markdown and never moves your notes into a database of its own, as some agent memory tools do. Everything it builds on top is a view it can rebuild: exact search, optional search by meaning with a local model, backlinks, graph queries, and published sites. None of these views writes back into your notes, so losing one costs you a way to look things up and leaves the notes untouched.

You can check any Wordcell answer against the file. An exact search result names the note and the line that matched. A graph result names the note that wrote a link, the note it points to, and the line where the link appears, plus a proof that ties the row to the exact version of the file it was read from. When an agent cites a Wordcell result, you open the file and read the sentence yourself.

Wordcell was called KB until version 0.20.0. Releases up to 0.19.6 are still published under the package name `@hraness/kb`, so older install notes and lockfiles may show that name. Newer releases use `@hraness/wordcell`, and the vault format keeps its `kb` names, so an existing vault needs no migration.

## Who it suits

Wordcell is for people who keep decisions, sources, and plans in Markdown or an Obsidian vault and work with coding agents such as Claude Code, Codex, Cursor, or GitHub Copilot. It helps most when the notes explain code: why a module rejects a tempting shortcut, which plan introduced a constraint, which source backed a decision.

Some people need less. A small set of notes may be fine with plain Markdown and a text search. If you only want local document retrieval, QMD is a good fit on its own; Wordcell uses it for its optional search by meaning. And if you want a service that silently records everything an agent does, Wordcell is the wrong tool: only what you save becomes part of the record.

## From one saved rule to a cited answer

Wordcell runs as a command-line tool and TypeScript SDK on Bun, with Git. After installing it from the release on GitHub or its npm mirror, one saved rule and one search look like this:

```sh
wordcell init kb
wordcell note create notes/parser-contract \
  --title "Parser contract" --type concept \
  --body "Parser retries stop after three attempts." --root kb
wordcell search "parser retries" --root kb --mode exact
```

The result points to `notes/parser-contract`, which is an ordinary Markdown file you can open and edit. Exact search needs no model, account, or network request. You can also point the same search at a vault you already have, without initializing or converting it.

Links you write become the graph. A plan that mentions `[[notes/parser-contract]]` shows up when you ask what depends on the rule:

```sh
wordcell graph query --program backlinks --note notes/parser-contract --root kb --json
```

Each row names the source note, the target, and the line of the link. Wordcell computes these queries with Oh, an embedded engine that needs no separate account or service, and by default the whole graph lives in memory for one query and then closes. [How Wordcell uses Oh](/blog/how-wordcell-uses-oh) covers what the proofs contain and what they leave out.

To tie a note to code, add the paths it explains to its frontmatter:

```yaml
repository_scopes:
  - packages/parser
```

Then an agent about to edit a file in that package can ask for the notes and repository rules that apply to it:

```sh
wordcell context packages/parser/src/index.ts --root kb --repo .
```

The result groups current notes and plans apart from finished or superseded ones, and includes the `AGENTS.md` files that govern the path. A public Agent Skill teaches compatible agents these commands. Installing it adds instructions only; it does not create a vault, change your notes, or give an agent access to other accounts. xcb can bind one vault you choose and give its workers read-only exact search over it with citations, and saving a note back is always a separate step, as [How xcb uses Wordcell](https://xcb.sh/blog/how-xcb-uses-wordcell) explains.

### Clipped pages and PDFs land in the same folder

Sources you read become files in the vault too. `wordcell clip` saves a web page as a Markdown bundle with its images and a record of how the page was fetched, and `wordcell pdf` keeps the original PDF beside the extracted text. Search and the graph read them alongside your notes, and the vault's own rules keep captured text as source material rather than your conclusions.

Some of what people read sits behind their own logins: a newsletter they subscribe to, a member article, a page already open in their browser. Wordcell can save those pages for the person who is signed in. It can read the tab you have open without navigating it, open a page with a browser profile you select (a profile given by its folder path runs from a temporary copy, so that profile is unchanged), or use your browser's cookies for that site when the page needs nothing else. Capture only reads. It does not post, like, follow, send, delete, or submit anything. When a site answers with a login wall, paywall, or CAPTCHA, Wordcell stops rather than looking for an archived copy elsewhere. For a public page that no direct route can read, it may make one read-only lookup of that exact URL on Archive.today, which tells that service the URL. Screenshots can include private notifications, so review a bundle before sharing it.

## What stays fixed

The project's guidelines keep Markdown and Git as the only record. Search indexes, backlinks, and the graph are views rebuilt from the files, and none of them writes back. Material from other tools follows the same rule. Wordcell's SDK can turn a verified set of Oh records into a Markdown review candidate, and that step never opens the vault, writes a note, or marks anything as reviewed. A person reads the candidate and writes the note. The agent workflow asks agents to start from `wordcell context` for the path they are changing, and the notes a person wrote about it, before running a broad search.

## Status and limits

Latest release: v{{release.version}}. Install the versioned archive from GitHub Releases or the npm mirror with Bun 1.3.14 or newer and Git; the [documentation](/docs) has the commands.

Wordcell does not write answers. It returns notes, snippets, and graph rows, and your agent writes the answer from them. A graph proof shows that a file said something at a given version, not that the note is correct. Graph queries accept vaults of up to 4,000 notes and mark a result as truncated rather than presenting a partial answer as complete. Search by meaning downloads a local model the first time you use it. An optional reranking step sends query and note snippets to a paid hosted provider and is off by default.
