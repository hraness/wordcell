# Public writing style

<!-- synced from hraness/.github STYLE.md sha256:66a56eb4c587e0b0bdbcec5fbb8dfa2879bac05dab0f9b0b9f19b3a8ccd7ffbe -->

This guide covers everything written for readers outside a repository: product pages, documentation, READMEs, interface text, metadata, and text a model writes for publication. Apply the voice rules in [`WRITING.md`](WRITING.md) first. The [documentation guidelines](https://github.com/hraness/.github/blob/main/DOCUMENTATION_GUIDELINES.md) choose a document's purpose and shape, and the [README guidelines](https://github.com/hraness/.github/blob/main/README_GUIDELINES.md) cover the repository front door.

Public prose must be precise, useful, and free of hype. Use a direct, natural voice that reads well aloud.

This copy is synced from [hraness/.github](https://github.com/hraness/.github/blob/main/STYLE.md). Change shared rules there; add rules for this repository under “Repository additions” below.

## Leave the reader with a clearer model

- Write for a reader who knows the general subject but has not read the sources, related articles, or internal project material.
- State the page's central claim and why it matters in plain language before adding detail.
- Introduce each person, organization, source, and necessary technical term at first use. Do not make a link carry context the prose has not supplied.
- Make every page understandable on its own. Related links may deepen the explanation but must not be prerequisites.
- Organize explanatory prose around the reader's questions rather than citation handling, repository structures, data schemas, search strategy, or the sequence in which the analysis was produced. A technical reference may mirror a public interface or schema when that structure is the reader's subject.
- Cite the primary source for a reported claim. Use a secondary digest only when it contributes distinct evidence or analysis, and state that contribution without explaining internal citation mechanics.
- Label personal observations, controlled benchmarks, official specifications, and forecasts accurately. Do not turn an anecdote into a general finding or a possible cause into the only cause.
- Do not invent an opposing claim, conflict, or consequence to manufacture an argument. If a source does not connect two topics, connect them only with independent evidence that helps answer the reader's question.
- Do not expose private implementation details, internal reasoning, or editorial process. A technical reference may document only the public interface, schema, and behavior readers need to use or evaluate the product. In explanatory prose, state the supported conclusion, the evidence a reader can inspect, and the limitations that affect it.
- Connect an external source to the product only when the connection helps answer the page's central question. Do not force every source into the project's current data model or product vocabulary.
- After editing, confirm that a first-time reader can state the thesis, key evidence, and limits after one pass. Rewrite or remove any passage that adds context without improving that understanding.

## Use a direct voice

- State what the object does. Let the reader decide whether it is good.
- Write about the reader's task. Use second person for instructions.
- Use present tense for current behavior. Use past tense for events and history.
- Use first person only when a named person or organization can support the claim.
- Name the exact control, command, limit, state, and outcome.
- Name limits and edge cases. A precise boundary makes the rest of the explanation credible.
- Do not use exclamation marks or all-capital emphasis.
- Remove “simply,” “just,” or “easily” when the word minimizes work or adds no meaning.

## Edit without changing meaning

Confirm the meaning before you shorten the prose. Preserve facts, names, numbers, quotations, links, code, commands, and necessary qualifications.

- Delete stock metaphors, similes, and figures of speech.
- Keep a fresh comparison only when it makes a mechanism easier to understand.
- Prefer the shortest familiar word that preserves the exact meaning.
- Keep an established technical term when an everyday substitute would be less precise.
- Delete each word that adds no fact, relationship, tone, or useful rhythm.
- Use active voice when the actor and action matter.
- Use passive voice when the actor is unknown or the result matters more than the actor.
- Replace jargon with plain English when both have the same meaning.
- Define a necessary technical term once. Use the same term after the definition.
- Rewrite a sentence when a word replacement changes the grammar or meaning.

Read the edited paragraph at speaking pace. Restore a transition or exact qualification if compression makes the paragraph mechanical.

When you shorten a claim, keep every condition that decides whether it is true, such as *closed*, *idle*, *by default*, *opt-in*, or *on macOS*. Recheck absolute words such as *any*, *every*, *never*, and *always* against the source. A simpler sentence that is no longer true is worse than the original.

Guides and briefs are held to the same standard. An example of good copy about a real product must be true of that product; check it like any other claim.

Accuracy has priority over a local line-editing rule. Record a recurring exception in the closest canonical guide.

## Support each claim

- Give each headline, summary line (`dek`), callout, and marketing line one concrete claim.
- Replace praise with observable behavior, a boundary, or evidence.
- Treat “revolutionary,” “seamless,” “powerful,” “robust,” and similar words as requests for proof.
- Use the swap test. If an unrelated product could publish the sentence unchanged, make it specific or delete it.
- Remove self-congratulation from release notes, documentation, and product copy.
- State what changed, why it changed, and what the reader can now do.
- Put each qualification beside the claim that it limits.
- Check each command, flag, version, license, price, and capability against current source or release output before you publish or edit it. Product pages go stale faster than code, so treat a claim on one as unverified until you check it.
- Label historical evidence as historical. A proof frame, benchmark, or screenshot from an earlier build names its date and scope, and a command shown on a page must run on the current release.
- Do not describe your own page, product, comparison, or caveat as *honest*, *plain*, *factual*, *checked*, *real*, or *clear*. Show the evidence and let the reader judge it. Title a limits section “Limits” or “Status”; “The landscape, honestly sorted” becomes “How they compare”.
- Check every heading, tagline, share image, and background visual against the body and the product's own rules. A heading may not promise what the next sentence walks back, and a decorative visual may not show what the product forbids.
- Check every promise on a pricing, purchase, or support page against the code that fulfills it.

## Describe the product that exists now

- Describe current behavior in the present tense. Words such as *now*, *no longer*, *still*, *remains unchanged*, *existing*, *retains*, and *this change* describe a diff; put them in release notes. Keep release history in `CHANGELOG.md` or GitHub Releases, not in a README or guide.
- Write historical facts as history (“Added in v3.3.1”). Do not pin a claim about today to an old release after a newer one has shipped.
- Derive every install command and version on a page from the package version or the release record, and test that they match. Type a version in one place only.
- After a rename, pivot, retirement, or restructure, search every surface for the old name and for the nouns that described the old product, follow every internal link, and fix or remove what no longer exists. Update `AGENTS.md`, `CONTRIBUTING.md`, design briefs, and product lists on legal pages in the same change, so the next agent does not restore the old product.
- Mention a retired product only in a redirect, a changelog, or a “formerly” note. Do not compare the current release with a retired product's release.

## Keep one definition per product

- Each product has one canonical one-line description in the portfolio registry. The page description, GitHub About text, package description, CLI introduction, README first sentence, `llms.txt` lead, and sibling sites use that line or a shortening of it.
- Shorten by cutting words from the original sentence. Do not replace plain words with house nouns: “a tool for creating a dossier on any person” should not become “evidence-backed dossiers and revisable models of people”.
- Render repeated text from one constant: the visible FAQ and its JSON-LD, a page and its Markdown twin, a hidden agent layer and the visible page.
- Describe a sibling product with its registry line. Say what two products do together only when both support it in shipped code, and take that sentence from the registry's relationships file.
- Do not paste a marketing sentence into several repositories. Put shared copy in a shared component or the registry.

## Cite sources exactly

- Resolve every DOI, PMID, PMCID, and arXiv ID before publishing, and confirm that the title, venue, and year at the link match the citation. A link that resolves does not show that the citation matches.
- Put only verbatim text in quotation marks, with its speaker. Present a paraphrase as a paraphrase.
- Take a number from the source's own results, not from its introduction or its account of other work. Keep the statistic (mean or median), the denominator, and the population.
- Label evidence at the strength the source supports. A preprint is not a journal article, an interview study is not a cohort, and a paper, its preprint, and its press release are one study.
- Do not present a sibling project's measurements as measurements of this product.
- Give every third-party figure a primary source the reader can open.

## Write for the reader, not the build

Most Hraness copy is drafted by agents working inside repository guides full of delivery and governance language. That language belongs in `AGENTS.md`. On a product page it tells the reader how carefully something was built instead of what it does for them.

- Treat the vocabulary of `AGENTS.md`, CI, admission ledgers, and data schemas as internal. On a page for readers outside the repository, define such a word where it first appears (a technical reference may) or say what the reader gets instead. The words that leak most often are *admission*, *admitted*, *qualification*, *qualified*, *custody*, *settlement*, *settled*, *receipt*, *attest*, *attested*, *evidence-backed*, *provenance* (as a label), *bounded*, *boundary*, *typed*, *contract*, *fenced*, *lease*, *manifest*, *promoted*, *gate*, *lane*, *workstream*, *surface*, *projection*, *foundation*, *substrate*, *authority*, *inert*, *canonical*, *retained*, *source pilot*, *source-bound*, *steel thread*, and *owns* (for a source or a record). “Every turn lands on one eligible account, bounded, with custody proven at settlement” becomes “Each task runs on one of your accounts that is signed in, idle, and not at a known quota limit, and xcb keeps that account locked until the provider process exits.”
- Do not stack precision words. *Exact*, *explicit*, *full*, *complete*, *independently*, and *retained* each have to change the meaning of their sentence. “Sign only the exact retained draft” becomes “Sign the draft you saved.”
- Do not let one word become the page's signature. When most sections lean on the same framing word, keep it where it marks a real distinction and rewrite the rest.
- Lead a product page with what the reader can do, then the mechanism. A hero that stacks four mechanisms into one sentence makes the reader do the work.
- Write a sentence, not a slogan. Verbless fragments (“All your subscriptions. One router.”) and reflexive threes (“Compact, resume, and audit”) read as generated. List three things only when there are exactly three.
- Keep a contrast only when readers actually hold the misconception it corrects. “A policy over your transcripts, not a new editor” argues with nobody; “You decide when to compact and how” says the same thing.
- Remove unverifiable superlatives such as “the first” and “the only” unless a cited source supports them.
- Keep repository instructions and tests from demanding reader-hostile copy. When a guide or test requires a status phrase on every page, change the requirement to the fact that must stay true and let the page say it plainly.

## State each limit once

Readers trust a page that states its limits plainly. They skim a page that repeats them.

- State the product's status once, near the top, with one of these labels: *In development*, *Preview*, *Beta*, *Latest release: vX.Y.Z*, *Paused*, or *Retired*. Follow it with one sentence on how to install or use it today, such as “Install from source; there is no signed release yet.”
- Put each other limit beside the feature it limits, once. Link to the status or limits page instead of restating the caveat in each section. Never drop a true limit to make the copy read better.
- Write a claim at its true scope instead of following it with what it does not prove. “Tests cover local networks only” replaces “These are tested local cases, not hosted private networking or evidence about independent devices.”
- State a privacy or scope rule once, positively (“Only documents you choose to publish become public”), and keep the full list of exclusions on the privacy or security page.
- Label a figure's evidence once, in plain words (“Stripe's own figure”).
- Do not end a page or section with a list of claims the page does not support.
- Keep notices about retired features on the status page, in the changelog, and in the messages a returning user sees. Keep them off the homepage, quick-start paths, and tutorials.

## Match the text to its reader

- Keep agent protocol (acknowledgement rules, discovery output, reservation windows, closeout offers) in the Agent Skill or agent reference. A README, package page, or `llms.txt` gives people two plain sentences and a link.
- Write any string that can reach a person to that person. Say “you”, not “the human” or “the operator”.
- Keep maintainer runbooks, release checklists, submission evidence packs, and agent task plans out of user documentation.
- Describe an editorial standard in the reader's terms (“Each figure links to its primary source”). Do not publish the repository's rules as imperatives.
- Public setup steps never require internal tools a reader cannot get.
- Treat decorative and ambient text as copy. Sample notes, hero backgrounds, fake terminals, and hidden text follow these rules: no invented quotations, metrics, or people.
- Do not hide text from readers to give a page a heading or description for crawlers.

## Write titles and descriptions as sentences of their own

- Write the page description as one or two complete sentences of 110 to 160 characters that name the thing and one concrete fact. Make each description unique on the site.
- Never make a description by cutting body text at a character limit. Code that derives one cuts at a sentence boundary and falls back to a word boundary only when the first sentence is too long. A description never ends mid-word or with “.…”.
- Do not list more than three parts in a description.
- Separate the page name and the site name in `<title>` with the repository's separator: a middle dot, a pipe, or a colon. Name the brand once.
- Make the share title and description match the page's own, or shorten them. An interior page does not inherit the homepage's share text.
- Write social image alt text that describes the image, in 125 characters or fewer.
- Keep each page's dates true to that page. Do not stamp one “updated” date on every page from a shared constant, and do not change a date because automation ran without changing the content.

## Use consistent text conventions

- Use sentence case for headings, buttons, tabs, labels, placeholders, and empty states.
- Capitalize proper nouns according to their official form.
- Put periods on full sentences, including callouts.
- Omit periods from headings, buttons, and short labels. A full-sentence display heading in the editorial marketing preset may end with a period.
- Use the Oxford comma.
- Use natural contractions when they match the voice. Do not force them.
- Use curly quotation marks in prose and straight quotation marks in code.
- Put literal input and interface values in `code`.
- Use an ellipsis glyph (`…`) only when an action opens another input step.
- Do not use em dashes in authored text: prose, titles, meta descriptions, social text, alt text, captions, image credits, list separators, and the templates that generate them. Rewrite the sentence instead of substituting a spaced hyphen. Quoted third-party titles keep their own punctuation. Use parentheses only for a short, necessary explanation.
- Use each product's name exactly as the portfolio registry spells it, including case (xcb, Textbutler, AI Charts, Soundfish, Sys1). Do not use the repository slug or the domain as the name in prose, and do not use a product name as a common noun.
- Give each destination one label across the header, footer, breadcrumbs, and Markdown twins.
- Make interpolated counts agree with their nouns (“1 check”, “2 checks”), and test zero, one, and several.
- Spell out zero through nine in prose. Use numerals for 10 or more, measurements, dates, and money.

## Write captions, alt text, and credits

- Write alt text for what the image shows in its context. Do not repeat the headline or start with “Image of”.
- Use a caption to connect the image to the text. Do not explain what the image is not, and do not end on an epigram.
- Credit tools and models by their current names.

## Write focused documentation

- Decide whether a page is a tutorial, how-to guide, explanation, or reference.
- Do not mix document modes when a link gives the reader a clearer path.
- Lead with the outcome. Do not write “In this guide, we will.”
- Make headings form a useful path through the page.
- Give each paragraph one main topic. Let the argument determine its length.
- Use numbered steps only for procedures. Start each step with an imperative verb.
- Give one instruction per step. Put a prerequisite condition before its command.
- Use notes, tips, warnings, and danger callouts according to consequence.
- Keep essential information in text. Do not put essential information only in an image or diagram.

## Keep interface copy operational

- Do not invent marketing copy to fill space.
- Omit taglines, benefit claims, unsupported proof, and decorative labels unless they help the reader complete a task.
- Use one literal heading for the object, task, data view, or state.
- Add supporting text only for a distinct instruction, constraint, status, or scope.
- Name the action, object, current state, limit, or recovery step.
- Do not narrate the interface or repeat visible information.
- Keep normal readiness silent. Show status text for pending work, important results, or problems that the reader can fix.
- Add search only when the collection is too large or varied for direct selection.
- Move secondary actions and settings out of persistent primary controls.
- Use checkboxes for independent form choices that take effect on submission.
- Use toggle buttons for immediate view, visibility, mute, solo, and mode changes.
- Keep a unit label with its control. Put longer explanations in nearby text or a disclosure.
- Put provenance, tuning, and methodology in a labeled disclosure when they compete with the primary task.
- Use a specific verb and object on buttons. Write “Create project,” not “Submit” or “OK.”
- Use “New noun” to open a creation flow. Use “Create noun” for the committing action.
- Name the missing object in an empty state. Give one useful sentence and the primary action.
- State the problem and the fix in an error. Do not blame the reader or write “Oops.”
- Name the consequence in a confirmation. Repeat the exact verb and object for a destructive action.
- Use nouns for labels. Use placeholders for a format or example, not a repeated label.
- State the completed result in past tense in a toast notification.

## Vary a generated series

When agents write many pages from one schema or one first example, the first page's habits become every page's.

- Give each page its own opening and ending. Do not repeat a title formula, a signpost opener (“This note answers three questions”), a closing heading, a closing checklist, or a disclaimer paragraph across the series.
- Take structure from the schema and the prompt, not from an earlier page. Check the corpus for repeated headings, openings, and closers.
- End a summary on its last supported fact. Write what an event means only when a source says it, and attribute it. Do not end with a sentence about what something signals, underscores, highlights, reflects, or represents, and do not end a paragraph on an aphorism.
- Report what a source shows instead of grading it (“Its value is…”, “The useful lens is…”).
- Do not narrate how the page was made: fetches, blocked pages, paywalls, captures, clip times, candidate pools, agent lanes, formulas, deduplication, date-precision notes, or who linked the source. State the evidence and its limits as facts about the world.
- Name a quoted speaker and their role. Do not add a paraphrase of the quote to the attribution (“Name, stating the governing claim”).

## Write prompts that produce public text

A prompt, skill, or template that makes a model write published text is public copy one step removed. The model follows its instructions and copies its examples.

- Point the prompt at this guide and `WRITING.md`, and state the reader, the form, and the length.
- Give examples in the house voice. A template example becomes output: the placeholder attribution “Ada Example, stating the governing claim” reappeared verbatim in published reading notes.
- Name the patterns to avoid, including em dashes, staged contrasts, and narration about how a source was fetched or blocked.
- Ask for summaries and descriptions as complete sentences that fit their limit. Do not rely on truncation to make text fit.
- Keep quoted source text and generated text distinguishable, and say who wrote the summary.
- Read a sample of real outputs after every prompt change.
- Tell the model who reads the output and that the reader has not seen the inputs or the instructions. Name every field that is published, including rationales and labels.
- Set length limits as maximums. A minimum longer than the evidence forces padding.
- Include the shared generation block from [`GENERATION_STYLE.md`](https://github.com/hraness/.github/blob/main/GENERATION_STYLE.md) and record its version with the prompt version.
- Check the prompt, skill, and examples for the patterns they forbid; a prompt that uses em dashes and staged contrasts produces them.

## Keep tests and guides from freezing copy

- Tests pin facts: commands, versions, counts, limits, prices, legal text, and links that resolve. They do not pin headings, taglines, or prose sentences. When a test protects a limit, it asserts the limit in plain words.
- Assert the shape of a real value, such as a run URL that matches `/runs/\d{10,}/`, never a placeholder.
- A test or validator may require that a disclosure exists and matches the provenance record. It may not require a reviewer name or a review claim.
- Guides, briefs, examples, schemas, and fixtures are copy one step removed; agents copy them word for word. Keep taglines, slogans, and internal vocabulary out of them. Do not define a field every item must fill (`closing`, `tagline`) whose role invites a closer or a slogan.

## Say who wrote and who checked

- Show AI-drafting disclosure on hraness.com only, through its shared disclosure component, on every page with AI-drafted text. Other Hraness sites and products do not carry AI-drafting disclosures, labels, or badges.
- Everywhere, keep a record of who drafted and who reviewed generated or agent-drafted text: the author, an independent human, or an AI agent, by name.
- Never credit AI-drafted text to a person as its sole author, never describe AI review as human review, and never claim a review that has no record. A page without a review record makes no review claim.
- Text an agent posts from a person's account does not claim that person wrote AI-drafted work.
