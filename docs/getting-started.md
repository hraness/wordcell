# Get started with Wordcell

[Documentation index](https://wordcell.io/docs) · [Installation reference](reference.md)

This tutorial walks through one complete loop on a fresh vault: create it, save
a decision, find it, connect a second note, and preview a published page. Every
step runs locally; no account, model, or network request is involved until the
optional last step.

## Install the CLI

Install [Bun 1.3.14 or newer](https://bun.sh/docs/installation) and Git first,
then install the pinned release archive:

```sh
bun add --global --ignore-scripts https://github.com/hraness/wordcell/releases/download/v0.22.4/hraness-wordcell-0.22.4.tgz
wordcell --help
```

If your shell cannot find `wordcell`, add your package manager's global
executable directory to `PATH` and reopen the terminal. The npm mirror
`npm install --global --ignore-scripts @hraness/wordcell@0.22.4` carries the
same bytes.

## Create the vault

Choose a directory where you want the vault to live, then create `kb/` inside
it:

```sh
wordcell init kb
```

The vault is a folder of Markdown. `kb/index.md` is its front door; you can
open every file it makes in Obsidian or any text editor.

## Save a decision

```sh
wordcell note create notes/parser-contract \
  --title "Parser contract" --type concept --tag architecture \
  --body "Parser retries stop after three attempts." --root kb
```

Open `kb/notes/parser-contract.md` and look at the file. It is ordinary
Markdown with YAML frontmatter; Wordcell added a stable `document_id`. You can
edit the prose normally.

## Find the note

```sh
wordcell search "parser retries" --root kb --mode exact
```

The result names `notes/parser-contract` and the saved retry constraint. Exact
mode reads the current Markdown on your machine; it downloads nothing.

## Connect a second note

Create a plan that links to the decision:

```sh
wordcell note create plans/parser-v2 \
  --title "Parser v2" --type plan \
  --body "The plan implements [[notes/parser-contract|the parser contract]]." \
  --root kb
```

The wikilink is a graph edge you authored. Ask for the decision's incoming
connections:

```sh
wordcell backlinks notes/parser-contract --root kb
```

The result includes `plans/parser-v2`: the work that depends on the constraint
is now recoverable from the note itself.

## Preview the vault as a site

```sh
wordcell publish --root kb --out site \
  --include notes/parser-contract --include plans/parser-v2 --dry-run --json
```

The dry run reports what would be published without writing files. Remove
`--dry-run` to build, then preview it:

```sh
wordcell publish --root kb --out site \
  --include notes/parser-contract --include plans/parser-v2
wordcell serve --root site --port 8080
```

Open `http://127.0.0.1:8080` to read the two pages and search them in the
browser. Publishing writes a local folder; nothing uploads until you copy the
files somewhere yourself.

## Where to go next

- Search an existing folder without initializing:
  `wordcell search "a phrase from your notes" --root /path/to/vault --mode exact`.
- [Set up repository memory for a coding agent](agent-workflow.md): repository
  scopes, `AGENTS.md` rules, Git history, and the Agent Skill.
- [Capture a web source](capture.md) or [a PDF](pdf.md) beside your notes.
- [Look up any command](reference.md) in the reference, or read
  [how the pieces fit together](design.md).
