---
title: Evidence obedience
type: concept
tags:
  - agents
  - evaluation
  - knowledge-management
---

# Evidence obedience

An agent handed retrieved context acts on it completely, including when the
context is wrong, and cites it while doing so. Inspectability is a property the
reader gets, not a property the agent exercises: a note that is stale, mistaken,
or contradicted by the repository is obeyed at full strength and its citation
looks identical to a correct one.

The measurement behind that claim used three conditions over identical
relational structure, with the supplied table as the exact answer key so no
vocabulary difference could intervene. One condition used real entity names, one
renamed every entity to an opaque identifier, and one kept real names but
permuted whole attribute rows so the table asserted what the domain does not.
All three scored 44 of 44 for both models tested. In the permuted condition,
where 37 entries qualified under the table only and a different 37 under real
domain facts only, both models returned 37 of 37 table-only and 0 of 37
real-only, flagged none, and cited the false rows confidently.

Stripping recognisable names changed nothing, so the models were reading the
supplied context rather than recalling training data. That is the result
retrieval wants. Read the other way it is the constraint: the quality of what a
vault asserts sets the ceiling on what an agent does with it, and no amount of
graph structure, backlink density, or provenance over those notes can observe an
error inside one.

This is why vault hygiene is load-bearing rather than cosmetic. Preserving
source authority so captures stay captures and maintained notes own later
synthesis, reviewing cited evidence after percolation, and keeping a rule in one
normative place instead of several drifting ones are all defences against the
only failure this result leaves open, which is a confidently wrong note. The
same reasoning gives [[notes/documentation-ownership|documentation ownership]]
its force: a duplicated rule is a rule that can go stale in one copy while
reading exactly as authoritative as the other.

## Omission is safer than assertion

A complementary condition tested a field that was omitted rather than set false.
Both models placed all 40 affected items in "cannot be determined" and none in
"does not qualify", with the hint given and withheld alike. Absence is read as
unknown, not as a negative claim.

So a note that declines to state something is handled correctly, while a note
that states something wrong is not. When a fact is uncertain, leaving it out
costs a reader nothing and guessing it costs correctness.

## Which review signals are worth building

Measured on two external corpora, as lift over asking a curator to read an
equal-size random sample. Above 1.0 beats random review; at or below it the
signal is worthless.

| signal | lift | verdict |
| --- | --- | --- |
| disagreement between two models on the same extraction | 1.88x and 2.38x | worth building |
| the model's own self-reported confidence | 1.21x and 1.03x | undemonstrated |
| checking the source text for vocabulary supporting the claim | 0.54x and 0.45x | worse than random |

Self-reported confidence did not separate its own strata: items marked high and
medium were indistinguishable in accuracy, and one model marked 91% of its
claims high. The same conclusion held against a third party's published
confidence field, which across 15,394 samples appearing in two of its releases
failed to predict which of its own labels would later be revised.

Inter-model disagreement is the one signal that survived, and it is a property
of a model pair on a corpus rather than of a model. On a second corpus the same
two models agreed on 117 of 120 values and were wrong together, so disagreement
carried nothing there. Measure it on the corpus in hand before relying on it.

Full scripts, data, and the retraction history behind these numbers are in
[algal-bio](https://github.com/0thernet/algal-bio).
