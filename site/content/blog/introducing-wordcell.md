Wordcell keeps decisions, plans, and sources as Markdown files beside your code, and lets coding agents find them and cite the file each answer came from. Agents search by exact words, by meaning with an optional local model, or by the file they are about to change. Wordcell also builds a graph from the links you wrote. The files stay where they are, in a format Obsidian, Git, and any text editor can read, and every index can be deleted and rebuilt from them.

Take a rule like "parser retries stop after three attempts." It gets decided once and then lost: in a chat that closes, a commit message nobody searches, or a note on someone's laptop. The next coding agent to touch the parser starts from the code and never sees it. With Wordcell, the rule is a note the agent can find and cite.

Latest release: v{{release.version}}. Install the versioned archive from GitHub Releases or the npm mirror with Bun 1.3.14 or newer and Git; the [documentation](/docs) has the commands.

## Every answer points back to a file

Wordcell reads a folder of Markdown notes. Unlike some agent memory tools, it does not move them into a database of its own. Everything it builds on top can be rebuilt from the files: exact search, optional search by meaning, backlinks, graph queries, and published sites. None of these writes back into your notes, so deleting one costs you a way to look things up and leaves the notes as they were.

That makes each answer checkable. An exact search result names the note and the line that matched. A graph result names the note that wrote a link, the note it points to, and the line where the link appears, plus a proof tied to the version of the file it was read from. When an agent cites a Wordcell result, you can open the file and read the sentence yourself.

The same rule covers material from other tools. Wordcell's SDK can turn a verified set of Oh records into a Markdown review candidate, but that step never opens the vault, writes a note, or marks anything as reviewed. A person reads the candidate and decides what to write.

## Who it suits

Wordcell is for people who keep decisions, sources, and plans in Markdown or an Obsidian vault and work with coding agents such as Claude Code, Codex, Cursor, or GitHub Copilot. It helps most when the notes explain code: why a module rejects a tempting shortcut, which plan introduced a constraint, which source backed a decision.

Some people need less. A small set of notes may be fine with plain Markdown and a text search. If you only want local document retrieval, QMD is a good fit on its own; Wordcell uses it for its optional search by meaning. If you want a service that records everything an agent does without being asked, Wordcell is the wrong tool, because only what you save becomes a note.

## From one saved rule to a cited answer

Wordcell is a command-line tool and TypeScript SDK that runs on Bun, with Git. Once it is installed, saving one rule and searching for it looks like this:

```sh
wordcell init kb
wordcell note create notes/parser-contract \
  --title "Parser contract" --type concept \
  --body "Parser retries stop after three attempts." --root kb
wordcell search "parser retries" --root kb --mode exact
```

The result points to `notes/parser-contract`, an ordinary Markdown file you can open and edit. Exact search needs no model, account, or network request. You can also run the same search on a vault you already have, without initializing or converting it.

Links you write become the graph. A plan that mentions `[[notes/parser-contract]]` shows up when you ask what depends on the rule:

```sh
wordcell graph query --program backlinks --note notes/parser-contract --root kb --json
```

Each row names the source note, the target, and the line of the link. Wordcell answers graph queries with Oh, an embedded engine that needs no separate account or service. By default the graph lives in memory for one query and then closes. [How Wordcell uses Oh](/blog/how-wordcell-uses-oh) covers what the proofs contain and what they leave out.

To tie a note to code, list the paths it explains in its frontmatter:

```yaml
repository_scopes:
  - packages/parser
```

An agent about to edit a file in that package can then ask for the notes and repository rules that apply to it:

```sh
wordcell context packages/parser/src/index.ts --root kb --repo .
```

The result lists current notes and plans separately from finished or superseded ones, and includes the `AGENTS.md` files that govern the path. Wordcell's agent workflow asks agents to run this for the path they are changing before they try a broad search.

A public Agent Skill teaches compatible agents these commands. Installing it adds instructions only; it does not create a vault, change your notes, or give an agent access to other accounts. xcb can bind one vault you choose and give its workers read-only exact search over it with citations, and saving a note back is always a separate step, as [How xcb uses Wordcell](https://xcb.sh/blog/how-xcb-uses-wordcell) explains.

## Clipped pages and PDFs land in the same folder

Sources you read become files in the vault too. `wordcell clip` saves a web page as a Markdown bundle with its images and a record of how the page was fetched, and `wordcell pdf` keeps the original PDF beside the extracted text. Search and the graph read them alongside your notes, and the vault's rules keep captured text marked as source material, apart from your conclusions.

Some of what people read sits behind their own logins: a newsletter they subscribe to, a member article, a page already open in their browser. Wordcell can save those pages for the person who is signed in. It can read the tab you have open without navigating it, open a page with a browser profile you select, or use your browser's cookies for that site when the page needs nothing else. A profile given by its folder path runs from a temporary copy, so the profile itself is unchanged.

Capture only reads. It does not post, like, follow, send, delete, or submit anything. When a site answers with a login wall, paywall, or CAPTCHA, Wordcell stops instead of looking for an archived copy elsewhere. For a public page that no direct route can read, it may make one read-only lookup of that URL on Archive.today, which tells that service the URL. Screenshots can include private notifications, so review a bundle before you share it.

## Limits

Wordcell does not write answers. It returns notes, snippets, and graph rows, and your agent writes the answer from them. A graph proof shows that a file said something at a given version, not that the note is correct. Graph queries accept vaults of up to 4,000 notes. A result cut off by its row or proof limit is marked as truncated, and a query that runs out of work fails instead of returning a partial answer. Search by meaning downloads a local model the first time you use it. An optional reranking step sends the query and note snippets to a paid hosted provider and is off by default.

Wordcell was called KB until version 0.20.0, and the vault format keeps its `kb` names, so an existing vault needs no migration. Releases up to 0.19.6 use the package name `@hraness/kb`: npm carries them through 0.19.2, and the later 0.19.x versions exist as GitHub Release archives. Newer releases use `@hraness/wordcell`, but older install notes and lockfiles may show the old name.
