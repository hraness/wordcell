# Save session memory and profiles

Save what a conversation settled as an ordinary `type: session` note, link it
to the notes it changed, and keep a maintained `type: profile` note. You write
every note and relationship, on request or at a session close that the user or
the vault's instructions ask for. Wordcell extracts no facts and writes no note
on its own.

## Locate the vault

- Resolve `KB_ROOT` and `KB_REPO` as in [the query guide](query.md), then read
  the vault's applicable agent instructions and note conventions.
- Pass the resolved path to every `--root`.
- `note create --body-file -` and the tools of the local MCP server that
  `wordcell mcp --root "$KB_ROOT"` starts are available from source until the
  next release. With the release CLI that SKILL.md installs, write the body to
  a file and pass `--body-file <path>`.
- Write each body file outside the vault, for example under `${TMPDIR:-/tmp}`,
  and delete it after `note create`. A Markdown file left in the vault becomes
  a note at the next refresh.

## Decide what to keep

- Keep the outcome, each decision and who made it, open threads, the
  repository paths touched, and the notes or plans the session changed.
- Leave out the raw transcript unless the user asks for it. Also leave out tool
  logs, secrets, credentials, and guesses nobody confirmed.
- Quote the user only when the exact wording matters.
- Write one session note per working session. When the same session continues,
  update its note as described under [Update a note](#update-a-note).

## Write the session note

1. List recent sessions, and update the note this session continues instead of
   creating another:

```sh
wordcell list --root "$KB_ROOT" --where type=session --sort date \
  --order desc --limit 5 --json
```

2. Choose the ID `notes/sessions/<YYYY-MM-DD>-<topic>` and the title
   `Session <YYYY-MM-DD>: <topic>`. When another session holds that ID, choose
   a distinct topic or add a suffix such as `-2`, and link the earlier note with
   `continues` when both belong to one thread. `note create` refuses an
   existing ID whose body differs.
3. Create the directory, because `note create` does not create directories:

```sh
mkdir -p "$KB_ROOT/notes/sessions"
```

4. Write the body file with these sections, and link each note the session
   changed:

```md
# Session 2026-09-26: bound parser retries

## Outcome

- `src/parser.ts` stops after three attempts.
- [[notes/parser-retries|Parser retries]] records the new bound.

## Decisions

- Three attempts, confirmed by the user.

## Open threads

- Whether the backoff needs jitter.
```

5. Create the note from the body file, or pipe the body with `--body-file -`:

```sh
wordcell note create notes/sessions/2026-09-26-bound-parser-retries \
  --root "$KB_ROOT" --title "Session 2026-09-26: bound parser retries" \
  --type session --body-file "${TMPDIR:-/tmp}/session.md"
```

6. Edit the frontmatter. Directly after `type: session`, add the date and each
   exact repository-relative file or directory path the session touched,
   without globs:

```yaml
type: session
date: 2026-09-26
repository_scopes:
  - src/parser.ts
```

Declare at most 16 paths, with no duplicates and no two paths that differ only
by case. A longer list gets only a check advisory, and `--scope` stops
returning the note. When the session touched more, keep the paths a later
reader will ask about, or declare a directory they share. `--scope` then
matches that directory's path, not the files in it. Omit `repository_scopes`
when the session touched no repository path.

`wordcell list --scope` matches a declared path exactly, and `wordcell context`
does not list session or profile notes, so recall them with `wordcell list` as
[the query guide](query.md#read-the-profile-first) describes. Do not tag every
session `session`. The type is the query surface, and a tag that every session
shares makes percolate propose a concept note for it.

Over MCP, `create_note` with `"type": "session"` takes the ID, title, and body.
It cannot set `date` or `repository_scopes`, and it does not create
directories. Without file access, keep the date in the title, list the paths
under Outcome, and use `notes/session-<YYYY-MM-DD>-<topic>` when
`notes/sessions/` is missing. Without those two fields, `--sort date` lists the
note after every dated session and `--scope` never returns it. Add both fields
the next time you have file access.

## Update a note

Update a session or profile note in one of two ways:

- Edit the file, then refresh and check as described under [Finish](#finish).
- Over MCP, call `get_note`, then `update_note_body` with the `revision` it
  returned as `expected_revision`. On a revision conflict, call `get_note`
  again and merge your change into the current body. When `get_note` reports
  `truncated: true`, edit the file instead. A server started with
  `--read-only` has no write tools.

## Link the session

Write each relationship from the session note. Never add the reverse edge to
the target.

```sh
wordcell relation add notes/sessions/2026-09-26-bound-parser-retries \
  updates notes/parser-retries --root "$KB_ROOT"
```

- `updates`: the session changed that note or plan.
- `informed-by`: the session relied on that note without changing it.
- `continues`: the target is an earlier session on the same thread.

The MCP `add_relation` tool takes the same source, predicate, and target.

## Review percolation before replacing a claim

```sh
wordcell percolate notes/sessions/2026-09-26-bound-parser-retries \
  --root "$KB_ROOT" --limit 25 --json
```

Open the cited notes before acting on a candidate. Add `supersedes` or
`contradicts` only when the new note's prose establishes the replacement or
the conflict. When a maintained note is the current account, update it in place
instead of recording a replacement.

## Keep a profile note

Look for existing profiles first, and read one as
[the query guide](query.md#read-the-profile-first) describes:

```sh
wordcell list --root "$KB_ROOT" --where type=profile --json
```

Update the profile that listing returns for the person, team, or project, as
described under [Update a note](#update-a-note). When none exists, create
`notes/profile` for the vault owner, or `notes/profile-<entity>` for anyone
else:

```md
# Profile

## Stable

- Uses Bun for tests.

## Recent

- 2026-09-26: capped [[notes/parser-retries|parser retries]] at three attempts
  ([[notes/sessions/2026-09-26-bound-parser-retries]]).
```

- Put role, preferences, environment, and standing decisions under Stable.
  Put dated items under Recent, each linking the session that established it.
- Move a Recent item to Stable once it keeps holding. Delete items that stop
  applying; Git keeps the history.
- Record only what the person stated or confirmed. Ask before recording
  sensitive personal details.

Create the profile the same way as a session note:

```sh
wordcell note create notes/profile --root "$KB_ROOT" --title Profile \
  --type profile --body-file "${TMPDIR:-/tmp}/profile.md"
```

## Finish

```sh
wordcell refresh --root "$KB_ROOT"
wordcell check --root "$KB_ROOT" --repo "$KB_REPO"
```

- Check names an absent repository path in an advisory only for current
  records, such as maintained notes and active plans. For session notes it only
  counts absent paths in its `Repository scopes:` summary line, so compare that
  count with the paths you declared. Neither changes the exit code.
- In parallel edit lanes, run `wordcell check --root "$KB_ROOT" --no-catalog`
  and leave the refresh to the integrating agent.
- The MCP tools cannot run percolate, refresh, or check. Over MCP alone, add no
  `supersedes` or `contradicts` relation, and ask the user to run
  `wordcell refresh` and then `wordcell check` from the CLI, because an MCP
  write leaves a managed catalog stale.
