A vault a tool can maintain raises an obvious question: if the tool rebuilds your index, what stops it from owning your notes? Wordcell's answer is a boundary you can see in one file. The `index.md` front door either contains one marked, tool-managed block, or it declares `kb_catalog: authored` and the tool writes nothing there at all.

## One marked region

A managed vault gives Wordcell exactly one region: a marked catalog block inside `index.md`. `wordcell refresh` rebuilds that block atomically from the current notes, and everything outside the markers belongs to the author. Your front door can greet a reader, name the areas that matter, and carry the catalog the tool maintains, without the two kinds of content competing for the same lines.

Inside the markers, the catalog is regenerated, not patched. That makes drift visible: `wordcell check` computes the expected catalog and reports a diff, so a stale or hand-edited managed block is a finding, not a mystery.

## Malformed markers fail closed

The boundary is enforced by refusing ambiguity. If the markers are missing, duplicated, or malformed, the tool does not guess at a larger region to rewrite; it fails closed and leaves the file alone. A tool that "helps" by rewriting more than its region would be a bug even when it meant well, because the line between maintained and authored is the whole contract.

The same discipline holds for derived content generally. Percolation surfaces title, alias, inbox, and relationship candidates as advisory findings with their evidence. Nothing becomes an authored edge until a person or an agent reviews the candidate and writes the link or relationship deliberately.

## Or no region at all

An authored vault declares `kb_catalog: authored` in the front door's frontmatter. Refresh then leaves `index.md` completely untouched: you write the whole index yourself, and the tool's graph, search, and checks run over the notes exactly as you arranged them.

Whichever mode you choose, `wordcell catalog` renders an exhaustive disposable inventory without modifying either kind of front door. So "see everything the vault holds" never requires giving up the page you curated.

Parallel work respects the same split. An edit lane runs `wordcell check --no-catalog` to verify its own notes without performing the shared catalog write; a managed vault does one final refresh after lanes join, and an authored vault never needs a generated write at all. Concurrent authors do not race a regenerating index.

## The deeper guarantee

The boundary works because the Markdown files are the only authority. The catalog, backlink view, graph traversal, search index, and Git history view are all derived projections, rebuilt on demand and replaceable. Deleting one of them removes a way to retrieve knowledge, not the knowledge itself.

That is also why the boundary can stay small. A tool that only ever owns a marked block, a disposable projection, and advisory candidates has no silent way to rewrite what you authored. And what you authored remains ordinary Markdown: open it in Obsidian, edit it in any editor, and version it with Git, with or without the tool running.

## Go deeper

- [Getting started](/docs/getting-started)
- [Design principles](/docs/design)
- [Command reference](/docs/reference)
- [Markdown memory for coding agents](/docs/agent-memory)
