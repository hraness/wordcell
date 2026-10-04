# Get started with Wordcell

[Documentation index](https://wordcell.io/docs) · [Installation reference](reference.md)

This tutorial walks through one complete loop on a fresh vault: create it, save
a decision, find it, connect a second note, and preview a published page. After
installation, every step runs on your machine without an account, a model, or a
remote service.

## Install the CLI

Install [Bun 1.3.14 or newer](https://bun.sh/docs/installation) and Git first,
then install the pinned release archive:

```sh
bun add --global --ignore-scripts https://github.com/hraness/wordcell/releases/download/v0.26.3/hraness-wordcell-0.26.3.tgz
wordcell --help
```

If your shell cannot find `wordcell`, add your package manager's global
executable directory to `PATH` and reopen the terminal. The npm mirror
`npm install --global --ignore-scripts @hraness/wordcell@0.26.3` carries the
same bytes.

## Search an existing Markdown or Obsidian vault

If you already have notes, start here instead of creating a new vault. Use
an absolute path to the folder and a phrase you know appears in a note:

```sh
wordcell search "a phrase from your notes" --root /absolute/path/to/vault --mode exact
```

Verify that the result names the expected note, then open that Markdown file
and compare its text. Exact search needs no model or index, and you don't need
to initialize, convert, or move the files. It reads `.md` files recursively,
excluding hidden entries, `coverage/`, `dist/`, `node_modules/`, and
`AGENTS.md`; it does not follow symlinks.

If nothing matches, confirm the root points to the folder containing your
notes and try a distinctive phrase from a `.md` file. An Obsidian vault's
`.obsidian/` settings are hidden and are not searched. Search works without
`index.md`; `wordcell refresh` requires that front door, so don't use refresh
as an initialization step for an existing vault. See the
[vault format reference](reference.md#the-kb-vault-format) before adding one.

To serve these notes to a coding agent, continue with
[Connect a client](reference.md#connect-a-client). To learn note authoring and
publishing without changing your existing vault, follow the remaining steps
in a separate directory.

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
