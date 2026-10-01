Every Wordcell graph answer comes with a proof you can check against your notes. Wordcell hands its graph work to Oh, and Oh returns each row with the file that supports it, a fingerprint of that file's contents, and the rule that joined the pieces. When Wordcell says a retry plan depends on your parser rule, you can read the line in the plan that makes the link and confirm that the line still reads as it did when the answer was computed.

The Markdown files stay the record. The graph is a copy Wordcell can delete and rebuild from them.

## What Oh is

Oh is a memory framework that applications embed as a library. It stores typed records, derives new facts from rules, and returns each derived answer with the chain of facts and rules that produced it. Wordcell uses the part that stores records and answers graph questions. There is no Oh account to create and no service to run. Wordcell pins one released version of Oh and upgrades only by changing that pin.

Oh writes records in a defined text form, called canonical JSON, and identifies those contents with a SHA-256 fingerprint. Programs that follow the same encoding rules produce the same bytes and fingerprint, whatever order they assembled the object's fields in. A proof uses that fingerprint to identify the record it depends on.

## How a query turns notes into rows

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

To keep a graph on disk, `wordcell graph rebuild` writes one to a `.wordcell/oh.sqlite` file that Git ignores, checks it by replaying it, and only then replaces the previous file. Deleting that file loses nothing, because Wordcell can rebuild it from the notes. A fresh rebuild returns the same rows and source proofs, though the stored graph's own history identifiers can differ.

## What a proof guarantees

**The same files give the same answer.** Equal snapshots of your notes produce equal rows and equal source proofs. An in-memory graph uses a fixed logical start time so the result can be reproduced in a later session; that time says nothing about when a note was written.

**An edit invalidates the old proof.** A proof carries the fingerprint of each file it relies on, taken over the file's exact text. Change the file, even its spacing, and the fingerprint changes, so the old proof no longer matches. A Wordcell session holds one snapshot for its whole life, so reopen it after editing. From code, you can re-check any result against its session:

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

A proof shows that a file said something at a given version. It does not show that the note is right.

## Why the Rust and TypeScript encoders must agree

Oh ships its canonical encoder and its query engine twice: a TypeScript reference and a Rust version compiled to WebAssembly. Wordcell's graph queries use the Rust engine when it loads and fall back to TypeScript when it does not, with the same source revision and the same limits either way. If the Rust engine is unavailable, the notes are unchanged and give the same answers.

Two encoders are interchangeable only when they agree on the accepted inputs: a different byte sequence changes the fingerprint a proof uses to identify its evidence. The rule they share is short. Object keys are sorted, array order is kept, there is no extra whitespace, and numbers are written the way JavaScript's JSON writer writes them:

```ts
import { canonicalJson } from "@hraness/oh";

canonicalJson({ b: 1, a: [2, 1] }); // '{"a":[2,1],"b":1}'
```

Checking the artifact and checking its behavior answer different questions. A fingerprint identifies the WebAssembly bytes being loaded. Encoder comparisons establish whether those bytes produce the expected text for the inputs exercised, including extreme numbers, Unicode keys, and nested values.

For a useful cross-language comparison, exercise both implementations directly and account for every accepted input. A runtime fallback can preserve application behavior when an encoder fails, but a test that skips fallback cases cannot establish agreement on those cases. The [Oh encoder article](https://oh.computer/blog/oh-rust-typescript-parity) explains the encoding rules and testing approach.

## Oh records become notes only when a person writes them

Wordcell does not keep an agent's memory in Oh. Its SDK can turn selected records from an Oh memory store into a Markdown review draft that lists the source records and their fingerprints, and fingerprints the draft itself with Oh's Rust encoder, again with a TypeScript fallback. Preparing that draft never opens a vault or writes a note. Whether any of it becomes a note is a separate decision a person makes.

## What Oh does not do for Wordcell

Wordcell runs named graph queries; there is no free-form query language. Absences, orphan notes, and counts are computed by Wordcell from the complete snapshot, not proved by Oh. A query that exhausts its work budget fails. A result clipped by its row or proof limit is marked as truncated, so the caller can distinguish it from a complete answer. The [graph reference](/docs/graph-authority) lists the supported queries, limits, and exit codes.

Wordcell's search does not use Oh. Exact search and optional local search by meaning are Wordcell's own, so Oh's memory benchmarks say nothing about Wordcell's search or answers.
