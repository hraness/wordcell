# Migrate from Supermemory

This guide moves the documents and memory entries you saved in Supermemory into
a Wordcell vault: Markdown notes in a Git repository that your coding agent
reads and writes through `wordcell mcp`. You export your data with the
Supermemory API, import it with `wordcell import supermemory`, check the
result, and connect your agent. Every external page linked here was checked on
September 26, 2026.

`wordcell import supermemory` and `wordcell mcp` are available from source
until the next release. Install Wordcell from a checkout:

```sh
git clone https://github.com/hraness/wordcell.git
cd wordcell
bun install --frozen-lockfile
bun link
```

The [installation reference](reference.md#installation-reference) lists the
requirements.

## Who should switch and who should stay

Switch when your agents keep memory about your own work and you want that
memory in files. The
[Supermemory plugin for Claude Code](https://supermemory.ai/docs/integrations/claude-code)
saves conversations and tool use to your Supermemory account, and
[SMFS](https://supermemory.ai/docs/smfs/overview) mounts a container as a
directory whose writes push to Supermemory. A vault keeps the same kind of
memory as Markdown files that you and your agent read, edit, diff, and review
in Git, with no account or API key.

Stay with Supermemory when you build a product that stores memory for many
users and you need what the hosted service runs for you:
[container tags](https://supermemory.ai/docs/concepts/container-tags) that
isolate each user’s memories, API keys limited to chosen tags,
[analytics endpoints](https://supermemory.ai/docs/overview/analytics),
[connectors](https://supermemory.ai/docs/connectors/overview) that sync on
their own, automatic extraction of facts and
[user profiles](https://supermemory.ai/docs/concepts/user-profiles), and SOC 2
Type II compliance with a HIPAA business associate agreement on some plans
([security](https://supermemory.ai/docs/overview/security)). Wordcell has none
of these.

[Supermemory local](https://supermemory.ai/docs/self-hosting/overview) runs the
same engine on your own machine, so keeping data off a hosted service is not by
itself a reason to switch. Switch when you want the Markdown files themselves
to be the memory.

## Map Supermemory concepts to Wordcell

| Supermemory | Wordcell | Notes |
| --- | --- | --- |
| [Container tag](https://supermemory.ai/docs/concepts/container-tags) | A vault per project or person, or the imported `container_tag` and `container_tags` fields | Only imported documents keep their tags: `container_tag` holds the first tag, and `container_tags` lists every tag when a document has several. To find every document with a tag, run `wordcell list --where container_tag=<tag>`, then again with `--where container_tags=<tag>`. Memory entries keep no tag, so when the separation matters, import each tag into its own vault or under its own `--prefix`. |
| Document | A note under `articles/` or `notes/imported/` | See [Where notes go](reference.md#where-notes-go). |
| Memory entry and its versions | One note per version under `notes/imported/memories/` | Each version has a `supersedes` relation to the one before it. |
| Updates, Extends, and Derives relations ([graph memory](https://supermemory.ai/docs/concepts/graph-memory)) | Relations you add with `wordcell relation add` | Supermemory infers these links, so the importer does not convert them. |
| [User profile](https://supermemory.ai/docs/concepts/user-profiles) | A `type: profile` note that your agent maintains | See [Connect your agent](#connect-your-agent). |
| Automatic extraction | Notes that you or your agent write | `wordcell percolate` suggests connections for you to review. Nothing writes a note on its own. |
| [Forgetting](https://supermemory.ai/docs/api-reference/content-management/forget-a-memory) and `forgetAfter` | Delete the note (Git keeps its history) or mark it superseded | The importer skips forgotten entries and records `forget_after`, but no note expires. |
| [Connectors](https://supermemory.ai/docs/connectors/overview) | Exports that you save into the vault | Each source needs its own export. See [Replace connectors](#replace-connectors). |
| [Hosted MCP server](https://supermemory.ai/docs/supermemory-mcp/mcp) | `wordcell mcp` | `search_memory` becomes `search`; `get_document` and `get_profile` become `get_note`; `add_memory` becomes `create_note` or `update_note_body`; `list_documents` and `list_memories` become `list_notes`. `list_spaces` and `who_am_i` have no equivalent. |
| [SMFS](https://supermemory.ai/docs/smfs/overview) | The vault directory | [Sync it with Git](sync.md) between machines. |
| REST API and SDKs | The `wordcell` CLI and TypeScript SDK | See the [reference](reference.md). |

## Export your data

You need a Supermemory API key in `SUPERMEMORY_API_KEY`, and either curl and
jq or Python 3. Work in a directory outside the vault, so that the export files
are never committed.

Documents come from
[list documents](https://supermemory.ai/docs/api-reference/documents/list-documents)
(`POST /v3/documents/list`). Memory entries, with their earlier versions, come
from
[list memory entries](https://supermemory.ai/docs/api-reference/content-management/list-memory-entries-with-history)
(`POST /v4/memories/list`), which lists entries by container tag. The scripts
below request one tag at a time. They find tags in the `containerTags` field of
your documents, which the list documents reference marks as deprecated, so a
response may leave it out. Pass every container tag you used as an argument.
The scripts print the tags they export, and they stop with an error when they
find none.

Save this script as `export-supermemory.sh`:

```sh
#!/bin/sh
# Save Supermemory documents and memory entries as JSON pages in the
# current directory. Extra arguments are container tags to export
# in addition to the tags found on your documents.
set -eu
base=https://api.supermemory.ai

post() {
  curl -fsS "$base$1" \
    -H "Authorization: Bearer $SUPERMEMORY_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$2" -o "$3"
}

last_page() {
  jq '.pagination.totalPages // 0' "$1"
}

page=1
while :; do
  file=$(printf 'documents-%03d.json' "$page")
  post /v3/documents/list "{\"includeContent\": true, \"limit\": 100, \"page\": $page, \"sort\": \"createdAt\", \"order\": \"asc\"}" "$file"
  [ "$page" -ge "$(last_page "$file")" ] && break
  page=$((page + 1))
done

{
  jq -rn '[inputs.memories[].containerTags[]?] | unique[]' documents-*.json
  printf '%s\n' "$@"
} | sort -u | sed '/^$/d' > container-tags.txt

if [ ! -s container-tags.txt ]; then
  echo "export-supermemory: no container tags found; pass your tags as arguments" >&2
  exit 1
fi
echo "export-supermemory: exporting memory entries for these container tags:" >&2
cat container-tags.txt >&2

n=0
while read -r tag; do
  n=$((n + 1))
  page=1
  while :; do
    file=$(printf 'memories-%03d-%03d.json' "$n" "$page")
    body=$(jq -cn --arg tag "$tag" --argjson page "$page" \
      '{containerTags: [$tag], limit: 100, page: $page, sort: "createdAt", order: "asc"}')
    post /v4/memories/list "$body" "$file"
    [ "$page" -ge "$(last_page "$file")" ] && break
    page=$((page + 1))
  done
done < container-tags.txt
```

Run it with your container tags as arguments:

```sh
sh export-supermemory.sh <tag>...
```

Compare the tags it prints with the tags your application sends, or with the
spaces that the `list_spaces` tool of the
[hosted MCP server](https://supermemory.ai/docs/supermemory-mcp/mcp) shows. Run
it again with any tag it missed.

The script writes one file per page: `documents-001.json` and onward, then
`memories-001-001.json` and onward for each tag in `container-tags.txt`. It
requests 100 items per page in ascending creation order, so the pages stay
stable while it runs, and it stops after the last page that
`pagination.totalPages` reports. It stops at the first failed request and
prints the HTTP status.

`"includeContent": true` adds each document’s full text, which the API
reference notes can make responses much larger. Without it, each note holds
only the document’s summary.

The API reference marks the `containerTags` array as required, while the
[container tags page](https://supermemory.ai/docs/concepts/container-tags) says
the `/v4` API accepts only `containerTag`. If `/v4/memories/list` returns status
400, replace `containerTags: [$tag]` with `containerTag: $tag` in the script
and run it again.

With Python 3 in place of curl and jq, save this script as
`export_supermemory.py`. It saves every page in one file,
`supermemory-export.json`, and takes the same tag arguments:

```python
"""Save every Supermemory document and memory entry to supermemory-export.json.

Extra arguments are container tags to export in addition to the tags
found on your documents.
"""
import json
import os
import sys
import urllib.request

BASE = "https://api.supermemory.ai"
KEY = os.environ["SUPERMEMORY_API_KEY"]


def post(path, body):
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "User-Agent": "supermemory-export",
        },
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def pages(path, body):
    page = 1
    while True:
        query = {**body, "limit": 100, "page": page, "sort": "createdAt", "order": "asc"}
        result = post(path, query)
        yield result
        if page >= ((result.get("pagination") or {}).get("totalPages") or 0):
            return
        page += 1


export = list(pages("/v3/documents/list", {"includeContent": True}))
found = {tag for p in export for d in p["memories"] for tag in d.get("containerTags") or []}
tags = sorted(found | set(sys.argv[1:]))
if not tags:
    sys.exit("export_supermemory: no container tags found; pass your tags as arguments")
print("Exporting memory entries for these container tags:", *tags, sep="\n", file=sys.stderr)
for tag in tags:
    export.extend(pages("/v4/memories/list", {"containerTags": [tag]}))

with open("supermemory-export.json", "w", encoding="utf-8") as out:
    json.dump(export, out)
print(f"Saved {len(export)} pages to supermemory-export.json")
```

```sh
python3 export_supermemory.py <tag>...
```

## Import into a vault

1. Create a vault if you do not have one: `wordcell init kb`.
2. Preview the import:
   `wordcell import supermemory documents-*.json memories-*.json --root kb --dry-run`.
   With the Python script, name `supermemory-export.json` in place of the two
   patterns.
3. Read the summary. It counts what the import would create, update, skip,
   report as a conflict, or reject. Each `diagnostic` line names a value the
   importer dropped or a relation it left out.
4. Import: run the same command without `--dry-run`.
5. Rebuild the catalog: `wordcell refresh --root kb`.
6. Check the vault: `wordcell check --root kb`.

For example, a dry run over pages built from the importer’s
[test fixtures](https://github.com/hraness/wordcell/tree/main/src/fixtures/supermemory)
printed:

```text
Dry run of 11 items from 7 files: created 10, updated 0, skipped 1, conflicts 0, rejected 0. Nothing was written.
Would add 2 supersedes relations.
diagnostic: memoryRelations are the service's inferred links and were not imported
diagnostic: notes/imported/nested-metadata: metadata.author is a nested value; dropped
diagnostic: notes/imported/nested-metadata: metadata key "bad key" is not a safe key; dropped
diagnostic: notes/imported/nested-metadata: metadata.labels is a nested value; dropped
diagnostic: notes/imported/zr8tqw3nhc6ypd1fgk5lmv: status is "queued"; the imported text may be incomplete
diagnostic: notes/imported/memories/prefers-dark-mode-in-every-editor-and-terminal: metadata.context is a nested value; dropped
diagnostic: notes/imported/memories/works-from-berlin-utc-1-in-winter: parent memory mem_timezone_v1 was not imported; supersedes relation omitted
```

The skipped item was a forgotten memory entry. Apart from the `supersedes`
relations between memory versions, imported notes have no contextual links to
each other, so `wordcell check` lists most of them as contextual orphans. That
list is advisory and does not fail the check.

You can export and import again at any time. The importer updates notes you
have not edited, skips unchanged ones, and leaves a note you edited after the
last import unchanged, with a line such as
`conflict: <note> from <file>#<pointer> (<id>): the note was edited after the last import`.
Conflicts do not change the exit status. [Import again](reference.md#import-again)
describes each outcome, and [Frontmatter](reference.md#frontmatter) lists the
fields each note records.

## Verify the result

List the imported notes:

```sh
wordcell list --root kb --where imported_from=supermemory
```

Search for a phrase you remember saving:

```sh
wordcell search "dark mode" --root kb --mode exact
```

Follow a memory entry’s earlier versions:

```sh
wordcell relation list notes/imported/memories/<slug> --root kb
```

Commit the result. Skip `git init` when the vault is inside a project
repository.

```sh
cd kb
git init -b main
git add -A
git commit -m "Import Supermemory export"
```

To keep the vault current on several machines, see
[Sync a vault with Git](sync.md).

## Connect your agent

`wordcell mcp` serves the vault to a local Model Context Protocol client over
standard input and output. It runs on your machine and needs no account. With
Claude Code, run this in your project:

```sh
claude mcp add --transport stdio --scope project wordcell -- wordcell mcp --root /absolute/path/to/kb
```

[Connect a client](reference.md#connect-a-client) has the settings for Claude
Desktop, Cursor, and Codex, and [Tools](reference.md#tools) lists what each
tool accepts. Add `--read-only` to remove the three write tools.

Supermemory builds a profile of each user on its own. In a vault, keep one
maintained note in its place: `notes/profile.md` with `type: profile` and two
sections, “Stable” for lasting facts and “Recent” for current work. Ask your
agent to read it at the start of each session with `get_note` and to revise it
with `update_note_body`, which takes the revision that `get_note` returned. The
Wordcell skill describes this convention in
[Keep a profile note](../skills/wordcell/references/session-memory.md#keep-a-profile-note).

## Replace connectors

Supermemory [connectors](https://supermemory.ai/docs/connectors/overview) pull
content from sources such as Google Drive, Gmail, Notion, OneDrive, GitHub, and
websites, and keep it current with webhooks and scheduled syncs. Wordcell has no
connectors. Save what you want your agent to know as Markdown files in the
vault, check it, and commit. Wordcell reads Markdown files without frontmatter
as notes, and [Sync a vault with Git](sync.md) commits and pushes on a
schedule.

### Google Drive, OneDrive, or Dropbox

In Google Docs, choose File, then Download, then Markdown (.md) to save one
document as a Markdown file
([Google Docs Help](https://support.google.com/docs/answer/12014036)). Copy
Markdown files out of a synced OneDrive or Dropbox folder. Move the files into a
folder in the vault and check it:

```sh
mkdir -p kb/notes/drive
mv ~/Downloads/meeting-notes.md kb/notes/drive/
wordcell refresh --root kb
wordcell check --root kb
```

Convert a PDF into the vault with
`wordcell pdf <file> --output kb/articles`
([Capture PDF documents](pdf.md)).

### Gmail

Google Takeout downloads your mail from Gmail
([How to download your Google data](https://support.google.com/accounts/answer/3024190)),
but Wordcell has no mail importer. Save the messages worth keeping as notes
instead: ask your agent to write a note from a message with the `create_note`
tool, or pipe the text into `wordcell note create`. Reading the body from
standard input with `--body-file -` is available from source until the next
release. On macOS, pipe the text you copied:

```sh
mkdir -p kb/notes/mail
pbpaste | wordcell note create notes/mail/launch-date --title "Launch date" --body-file - --root kb
```

The folder must exist before `note create` writes into it.

### GitHub

Keep the vault in the repository, as `kb/` beside the code, and your notes
travel with every clone ([Choose where the vault lives](sync.md#choose-where-the-vault-lives)).
`wordcell context` then lists the guides and notes that apply to a path:

```sh
wordcell context src/index.ts --root kb --repo .
```

To keep an issue from another repository, save its text as a note with the
[GitHub CLI](https://cli.github.com/manual/gh_issue_view):

```sh
mkdir -p kb/notes/github
gh issue view 42 --repo owner/repo --json body --jq .body |
  wordcell note create notes/github/owner-repo-42 --title "owner/repo#42" --body-file - --root kb
```

Reading the body from standard input with `--body-file -` is available from
source until the next release.

### Web pages

Supermemory’s [web crawler](https://supermemory.ai/docs/connectors/web-crawler)
crawls a site and recrawls it on a schedule. `wordcell clip` captures one page
as a Markdown bundle under `articles/`, and Git records each change. Save this
script as `~/bin/clip-pages.sh`. It captures each page in a list again and
prints what changed since the last commit:

```sh
#!/bin/sh
# Capture each page in a list again and show what changed since the
# last commit. Each line of the list is a slug, a space, and a URL.
vault="${1:?usage: clip-pages.sh <vault directory> <page list>}"
list="${2:?usage: clip-pages.sh <vault directory> <page list>}"
PATH="$HOME/.bun/bin:$PATH"
status=0

while read -r slug url; do
  [ -n "$url" ] || continue
  if wordcell clip "$url" "$slug" --output "$vault/articles" --force </dev/null; then
    wordcell capture diff "$vault/articles/$slug" --repo "$vault" </dev/null
  else
    echo "clip-pages: could not capture $url" >&2
    status=1
  fi
done <"$list"

wordcell refresh --root "$vault" >/dev/null || status=1
exit "$status"
```

List the pages in `~/kb-pages.txt`:

```text
example-domain https://example.com/
```

Then run it once a day before the sync script. With cron, add this line
(`crontab -e`):

```text
0 6 * * * /bin/sh "$HOME/bin/clip-pages.sh" "$HOME/kb" "$HOME/kb-pages.txt" >>"$HOME/clip-pages.log" 2>&1
```

The script expects the vault to be its own repository, as in
[Sync a vault with Git](sync.md). Cron starts jobs with a short `PATH`, so the
script adds `~/.bun/bin`. If `command -v wordcell` or `command -v bun` prints
another directory, add that one too. `--force` replaces the whole bundle, so
edits inside a clipped file are lost on the next run. Write your own notes
about a page in a separate note that links to it. Wordcell captures only the
pages you list and does not follow links. [Capture web content](capture.md)
and `wordcell clip --help` cover the slug argument, `--force`, signed-in pages,
and other options.

### Notion

Notion exports a page, and optionally its subpages, as a zip file of Markdown
and CSV files
([Export your content](https://www.notion.com/help/export-your-content)).
Unzip it into the vault:

```sh
mkdir -p kb/notes/notion
unzip ~/Downloads/notion-export.zip -d kb/notes/notion
wordcell refresh --root kb
wordcell check --root kb
```

Search finds the pages right away. Wordcell ignores the CSV files, and
`wordcell check` may list the pages as orphans, which is advice, not an error.

## What does not transfer

The hosted features named in
[Who should switch and who should stay](#who-should-switch-and-who-should-stay)
have no Wordcell equivalent. Neither do these:

- The relations Supermemory infers between memories, such as Derives, and its
  time-based forgetting
  ([graph memory](https://supermemory.ai/docs/concepts/graph-memory)).
- Spaces, widgets, and OAuth sign-in in the hosted MCP server
  ([Supermemory MCP](https://supermemory.ai/docs/supermemory-mcp/mcp)).
