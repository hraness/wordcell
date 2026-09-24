Every Wordcell graph answer comes with a proof you can check against your notes. Wordcell can list the notes that link to a decision, the plans that reach it through a chain of links, and the notes that share its tags. When Wordcell says a retry plan depends on your parser rule, you want to see the line in the plan that makes the link, and you want to know that line still reads the way it did when the answer was computed.

Wordcell reads your Markdown and hands the graph work to Oh, which works out the answer and keeps a proof for every row, naming the file that supports it, a fingerprint of that file's contents, and the rule that joined the pieces. The Markdown files stay the record. The graph is a copy Wordcell can throw away and build again from them.

## What Oh does, for someone who has not used it

Oh is a memory framework that applications embed as a library. It stores typed records, derives new facts from rules, and returns each derived answer with the chain of facts and rules that produced it. Wordcell uses the part that stores records and answers graph questions. There is no Oh account to create and no service to run. Wordcell pins one released version of Oh and upgrades only by changing that pin.

Oh writes every record in one exact text form, which it calls canonical JSON, and names the record by the SHA-256 fingerprint of that text. Two programs holding the same record produce the same bytes and the same fingerprint, whatever order they assembled its fields in. So a fingerprint in a proof names exactly one record.

## From a folder of notes to an answer you can check

When you run a graph query, Wordcell reads the whole vault as it is at that moment:

1. It fingerprints the text of each Markdown file.
2. It collects what you wrote: links, typed relationships, tags, and the code paths a note declares under `repository_scopes`. Each becomes a fact tied to the note it came from, and links keep their line.
3. It stores each note's facts as an Oh record in canonical JSON, and fingerprints the whole snapshot as one revision.
4. It turns the named query you asked for into a small set of Oh rules, and Oh evaluates them over that snapshot.

By default all of this lives in memory for one query and then closes. Nothing is written into the vault and no cache file appears. Here is the smallest case, a note that links to a rule and a query for what points at the rule:

```sh
wordcell note create notes/retry-review --title "Retry review" --type concept \
  --body "Use [[notes/parser-contract]] when changing retry behavior." --root kb
wordcell graph query --program backlinks --note notes/parser-contract --root kb --json
```

The row names `notes/retry-review` as the source, `notes/parser-contract` as the target, and the line where the link was written. Its proof names the source note, the fingerprint of that note's contents, and the fingerprint of the Oh record built from it. A longer answer, such as everything reachable within three links, adds the rule applied at each step and the facts it used. Six named queries are available: backlinks, reachability, relation-closure, scope-route, shared-tags, and shared-concepts.

To keep a graph on disk, `wordcell graph rebuild` writes one to a `.wordcell/oh.sqlite` file that Git ignores, checks it by replaying it, and only then replaces the previous file. Deleting that file loses nothing, because Wordcell can rebuild it from the notes.

## Three rules that give a proof its meaning

**Same files, same answer.** Equal snapshots of your notes produce equal rows and equal source proofs. An in-memory graph uses a fixed logical start time so the result can be reproduced in a later session; that time never claims anything about when a note was written.

**An edit retires the old proof.** A proof carries the fingerprint of each file it relies on, taken over the file's exact text. Change the file, even its spacing, and the fingerprint changes, so the old proof no longer matches. A Wordcell session holds one snapshot for its whole life, so reopen it after editing. From code, you can re-check any result against its session:

```ts
import { openKnowledgeBase } from "@hraness/wordcell";

const kb = await openKnowledgeBase({ root: "kb" });
try {
  const result = await kb.graphQuery({ program: "backlinks", note: "notes/parser-contract" });
  console.log(await kb.graphVerifyResult(result)); // false for modified, foreign, or stale evidence
} finally {
  await kb.close();
}
```

**Answers never write back.** A query never adds a link or an inferred relationship to a note. With `wordcell percolate --proofs`, Wordcell can show shared tags or shared concepts as evidence beside a suggested connection, but whether two notes should link stays your decision, made by editing the Markdown.

## Two engines held to the same bytes

Oh ships its canonical encoder and its query engine twice: a TypeScript reference and a Rust version compiled to WebAssembly. Wordcell's graph queries prefer the Rust engine when it loads and fall back to TypeScript when it does not, with the same source revision and the same limits either way. Wordcell also uses Oh's Rust canonical encoder to fingerprint the review drafts described in the last section, again with a TypeScript fallback.

Two encoders are only safe if they agree on every input, because one differing character changes a fingerprint and breaks every proof that cites it. The rule they share is short. Object keys are sorted, array order is kept, there is no extra whitespace, and numbers are written the way JavaScript's JSON writer writes them:

```ts
import { canonicalJson } from "@hraness/oh";

canonicalJson({ b: 1, a: [2, 1] }); // '{"a":[2,1],"b":1}'
```

Wordcell's own tests hold the Rust encoder it loads from Oh to that rule. They confirm that the WebAssembly bytes Wordcell loads match the SHA-256 recorded in the Oh package, then generate random JSON values, including nested arrays and objects and very large and very small numbers, and require the Rust and TypeScript encoders to return the same text and the same fingerprint for each. Fixed cases such as `1e21`, `5e-324`, an empty key, and an emoji key are checked on every run. Oh runs its own version of this test; How Oh keeps its TypeScript and Rust encoders byte for byte identical covers that side.

## What a Wordcell user can check

Every row of a graph answer names a file you can open and, for links, the line to read. When an agent cites a Wordcell graph result, you can open the cited note and read the line yourself instead of taking the agent's word for it. A result you saved can be verified against the session it came from, and a stale one fails that check. Your knowledge stays in the notes. If you delete the graph or the Rust engine is unavailable, the notes are unchanged and give the same answers.

## Where the proofs stop

A proof shows that a file said something at a given version. It does not show that the note is right. Wordcell runs only its six reviewed queries; there is no free-form query language. Absences, orphan notes, and counts are computed by Wordcell from the complete snapshot, not proved by Oh. A vault can hold up to 4,000 notes, 100,000 facts, and 64 MiB of text for graph queries, and a query that runs out of work fails instead of returning a partial answer as complete. A truncated result says so in its JSON and exits with code 4.

Wordcell's search does not use Oh. Exact search and optional local search by meaning are Wordcell's own, so Oh's memory benchmarks say nothing about Wordcell's search or answers. Wordcell also does not keep an agent's memory in Oh. Wordcell's SDK can turn selected records from an Oh memory store into a Markdown review draft that lists the source records and their fingerprints and fingerprints the draft itself; preparing that draft never opens a vault or writes a note, and whether any of it becomes a note is a separate, reviewed decision. A fresh rebuild of the on-disk graph returns the same rows and source proofs, though the stored graph's own history identifiers can differ.

Latest release: v{{release.version}}. For the full query reference, see [Query the derived graph](/docs/graph-authority) in the Wordcell documentation. [Oh](https://oh.computer) is the library behind the graph.
