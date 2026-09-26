# Sync a vault with Git

Wordcell has no sync service. A vault is a folder of Markdown files, so a Git
remote can carry it between machines, and each machine rebuilds its own search
index from those files. This guide puts a vault in a private repository, pulls
it before you work, commits and pushes it on a schedule, and resolves the
conflicts Git cannot merge.

## Choose where the vault lives

Keep the vault inside a project repository when its notes describe that
project. A `kb/` directory beside the code travels with every clone, branch, and
pull request, and `wordcell context` and `wordcell history` read the same
repository through `--repo`. Your usual Git workflow already syncs it, so you
need only [Resolve a merge conflict](#resolve-a-merge-conflict) from this
guide.

Give the vault its own repository when it holds memory that spans projects,
such as preferences, people, and decisions that every agent session should
read. The rest of this guide covers that case, with the vault at `~/kb`.

## Create a private repository

The Git host stores a copy of every note, so choose a host you would trust with
the vault’s contents. A private GitHub repository is accessible only to you,
the people you share it with, and, for an organization repository, certain
organization members
([GitHub documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories),
checked September 26, 2026). A bare repository on a server you control
(`git init --bare`) works the same way over SSH.

These steps use the [GitHub CLI](https://cli.github.com/).

1. Create the vault if you do not have one: `wordcell init ~/kb`.
2. Change to the vault: `cd ~/kb`.
3. Start a repository: `git init -b main`.
4. Stage every file: `git add -A`.
5. Commit: `git commit -m "Start vault"`.
6. Create the private repository and add it as `origin`:
   `gh repo create kb --private --source=. --remote=origin`.
7. Push and set the upstream branch: `git push -u origin main`.

With another host, create an empty private repository in its interface, then
run `git remote add origin <repository URL>` in place of step 6.

## Pull before you work

On each other machine, clone the repository once:

```sh
git clone <repository URL> ~/kb
```

Pull at the start of each session so that you and your agents read the latest
notes:

```sh
git -C ~/kb pull --no-rebase
```

Git carries only the files. Exact search, links, and `wordcell check` read the
Markdown directly, so they are current after a pull. Keyword, semantic, and
hybrid search read the optional local QMD index, which stays on each machine.
Where you use those modes, run `wordcell index --root ~/kb` after a pull to
update the index incrementally. `wordcell graph rebuild` writes
`.wordcell/oh.sqlite`, which Git ignores, so rebuild it on each machine that
uses it.

A running [`wordcell mcp`](reference.md#local-mcp-server) server reads edits
from an editor or Git on its next call, so you do not need to restart it after
a pull. `wordcell mcp` is available from source until the next release.

## Commit and push on a schedule

Save this script as `~/bin/sync-vault.sh`. It commits every change in the vault,
merges the remote branch, and pushes. When the merge conflicts, it restores the
state from before the pull, keeps your local commit, and exits 1. A scheduled
run never leaves conflict markers in your notes.

```sh
#!/bin/sh
# Commit local changes, merge the remote branch, and push.
# On a merge conflict, restore the pre-merge state and exit 1.
set -eu
vault="${1:?usage: sync-vault.sh <vault directory>}"
cd "$vault"

git add -A
if ! git diff --cached --quiet; then
  git commit --quiet -m "Sync vault from $(hostname)"
fi

if ! git pull --quiet --no-rebase --no-edit; then
  if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
    git merge --abort
    echo "sync-vault: merge conflict in $vault; resolve it by hand" >&2
  fi
  exit 1
fi

git push --quiet
```

`git add -A` stages every file under the vault. Keep files you do not want on
the remote outside the vault, or list them in a `.gitignore` file. The script
merges instead of rebasing, so `git merge --abort` returns the vault to the
exact state it had before the pull, and the next run tries again.

The job runs without a terminal, so Git must reach the remote without asking
for a password or passphrase. For a GitHub remote over HTTPS,
`gh auth setup-git` configures the GitHub CLI as Git’s credential helper. Run
the script once by hand to confirm that it exits 0:

```sh
sh ~/bin/sync-vault.sh ~/kb
```

### Schedule it with cron

Run `crontab -e` and add this line to sync every 30 minutes:

```text
*/30 * * * * /bin/sh "$HOME/bin/sync-vault.sh" "$HOME/kb" >>"$HOME/sync-vault.log" 2>&1
```

### Schedule it with launchd on macOS

Save this agent as `~/Library/LaunchAgents/com.example.wordcell-sync.plist`.
Replace `/Users/you` with your home directory, because each path must be
absolute.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.example.wordcell-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>/Users/you/bin/sync-vault.sh</string>
    <string>/Users/you/kb</string>
  </array>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>StandardOutPath</key>
  <string>/Users/you/Library/Logs/wordcell-sync.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/you/Library/Logs/wordcell-sync.log</string>
</dict>
</plist>
```

Load it:

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.wordcell-sync.plist
```

To stop it, run the same command with `bootout` in place of `bootstrap`.
launchd skips an interval that falls while the Mac is asleep and runs the job
at the next one.

## Resolve a merge conflict

Git merges changes to separate parts of a file and stops when both sides
changed the same or neighboring lines
([git-merge documentation](https://git-scm.com/docs/git-merge#_how_conflicts_are_presented),
checked September 26, 2026). Edits to different notes never conflict. Three
conflicts are common in a vault:

- Two machines changed the same or neighboring lines of one note.
- Two machines created a note with the same ID.
- Two machines added notes and ran `wordcell refresh`, so both rewrote the
  managed catalog in `index.md`.

When the log shows `sync-vault: merge conflict`, resolve it by hand:

1. Change to the vault: `cd ~/kb`.
2. Merge the remote branch: `git pull --no-rebase`.
3. List the conflicted files: `git status --short`. Each one starts with `UU`,
   or with `AA` when both machines created it. `UD` or `DU` means one machine
   deleted a note that the other edited. Step 8 keeps the edited note unless
   you remove it first with `git rm`.
4. Edit each conflicted note to keep the text you want, and delete the
   `<<<<<<<`, `=======`, and `>>>>>>>` lines.
5. If `index.md` conflicts, take the remote side: `git checkout --theirs index.md`.
   The next step regenerates its catalog from the notes.
6. Rebuild the catalog: `wordcell refresh --root .`.
7. Check the vault: `wordcell check --root .`. Fix anything it reports.
8. Stage the result: `git add -A`.
9. Commit the merge: `git commit --no-edit`.
10. Push: `sh ~/bin/sync-vault.sh ~/kb`.

To give up on a merge and return to your local commit, run `git merge --abort`.

If you import from Supermemory, run
[`wordcell import supermemory`](reference.md#import-again) on one machine and
let its notes sync like any other file. A later import on any machine reports a
note that was edited after the last import as a `conflict` and leaves it
unchanged. `wordcell import supermemory` is available from source until the
next release.

## Search several vaults instead of syncing them

When each project keeps its own `kb/`, you do not need to combine them to search
across them. List the vaults in a portfolio registry and search the ones you
select:

```sh
wordcell portfolio search "retry policy" \
  --registry ./kb-portfolio.json \
  --workspace ~/src \
  --shared
```

Portfolio search reads the checkouts under the workspace as they are on disk,
so pull each repository first. `--shared` selects vaults whose registry
visibility is `public` or `organization`. Select a private vault with
`--vault owner/id`. See [Define a v1 registry](portfolio.md#define-a-v1-registry)
and [Search selected vaults](portfolio.md#search-selected-vaults).
