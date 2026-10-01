A coding agent can open a repository and see how it works. To change it well, the agent also needs to understand why it works that way: the failure that led to a constraint, the alternative you tried, and the assumption that would make the decision worth revisiting.

Wordcell keeps that knowledge in Markdown beside your code. Decisions stay connected to their sources and the plans that put them into practice. Your agent can start from a file, recover the relevant reasoning, and leave the record better prepared for the next session. You keep using Claude Code, Codex, Cursor, or another agent with access to your files.

Consider a parser that retries a failed request. Your team settles on a rule: stop after three attempts. The code contains the limit. The useful knowledge includes why you chose it, which failures another attempt might resolve, and when that reasoning should change. Keeping those details available lets a later agent work from the decision you made instead of reopening the same discussion from scratch.

## Keep the decision with its evidence

Start with a note called `notes/parser-contract.md`. It states the retry rule, explains the reasoning, and links to the source that informed it. That source might be a captured page of provider documentation, an incident report, or a record of an experiment you ran.

Wordcell gives those materials distinct jobs. Captured sources preserve what you read. Maintained notes explain what you currently believe and why. Plans describe the work you intend to do, then accumulate decisions and results as that work proceeds.

For the parser, the decision note might explain that extra retries consume the request budget while malformed input needs a different recovery path. It also records the assumption behind the limit: the upstream service treats these failures as permanent. A plan for the next parser revision links to that note and includes tests for the behavior.

This is enough structure to answer several useful questions. The next agent can find the rule, inspect the source, and see the work that depends on it. A teammate reviewing the change can follow the same trail. If the provider changes its behavior, you have a place to record what changed and a reason to revisit the decision.

You can write these files in your editor or have your agent maintain them with Wordcell. Web capture saves a page as Markdown with its assets and capture details. PDF capture keeps the original document beside its extracted text. Those sources remain available when the conversation in which you discussed them is long gone.

## Give relationships a precise meaning

An ontology names the kinds of things you keep and how they relate. For a coding project, a useful starting point is a source, a decision, and a plan. The relationships explain why they belong together.

Wordcell records those relationships in ordinary Markdown links and frontmatter. A decision can be `evidenced-by` a source. A plan can be `informed-by` a decision. A revised decision can point to an earlier one with `supersedes`. You choose the names that express your project's meaning.

Direction matters. In the decision note, `evidenced-by` points toward the supporting source. In a new decision, `supersedes` points toward the old decision. Reading the relationship as a sentence helps catch mistakes before they become part of the record.

A note can hold both its connection to code and its supporting evidence:

```yaml
repository_scopes:
  - packages/parser
relations:
  evidenced-by:
    - articles/retry-guidance
```

Here, `articles/retry-guidance` is the vault-relative ID of a source you have saved. A plan's prose can link to `[[notes/parser-contract]]`, and Wordcell's backlinks show which notes refer to the decision. Named graph queries also follow chains of a particular relationship, such as `depends-on`.

[Oh](https://oh.computer), the engine embedded in Wordcell, evaluates those graph queries and returns the supporting records. For a backlink, you can inspect the note that contains the link, its target, and the source line. The proof is tied to the version of the Markdown that the query read, so you can see which recorded connection produced the result.

That proof answers a precise question: where did this connection come from? Deciding whether the provider's guidance supports your interpretation still involves reading it. The structure gives you and your agent something concrete to examine when you disagree. The [graph guide](/docs/graph-authority) explains the query programs and their limits.

## Start from the code that is changing

When an agent opens `packages/parser/src/index.ts`, it has a much better starting point than a broad request to search everything it remembers. The path identifies the part of the project whose decisions matter.

The `repository_scopes` field ties the parser note to that area of code. Before editing, the agent can ask:

```sh
wordcell context packages/parser/src/index.ts --root kb --repo .
```

Wordcell returns the notes and repository rules that apply to the path. It groups current knowledge and active plans separately from finished or superseded work, so the agent can distinguish today's guidance from the history behind it. Applicable `AGENTS.md` files stay on the instruction path.

Suppose the task asks the agent to increase the retry limit. It can read the existing constraint and investigate the reason for the change before updating the implementation. If the request conflicts with the saved decision, the agent has enough context to explain the conflict and ask a useful question.

The result helps with review too. Instead of reconstructing the discussion from a diff, you can open the decision and the plan alongside the code. The shared record explains what the change is intended to preserve, which assumption it changes, and how the agent proposes to verify it.

## Find the reason in different words

You won't always remember the filename or the phrase you used. A decision written as “parser retries stop after three attempts” should remain discoverable when the question is “how many times do we retry?”

Wordcell offers several ways into the same knowledge. Exact search looks for names, phrases, and terms in your Markdown and runs without a model or account. Optional local semantic search finds passages by meaning. Hybrid search combines local keyword and vector retrieval.

The search result stays connected to the note. Wordcell joins matches to the current Markdown and its metadata, so the agent can open the surrounding explanation, follow links, or look at the work associated with it. The result gives the agent a starting point for investigating the record.

This is particularly useful when the vocabulary has changed. An older plan might call the module an importer while the current code calls it a parser. Search by meaning gives the agent another way to find the earlier reasoning, while exact names and repository scopes provide direct routes when you know them.

Local semantic search uses an optional model through QMD. For projects that want to evaluate a hosted reranker too, Wordcell has a separate, optional Jev integration. The [measured search comparison](/benchmarks) shows what that reranking changed on a public dataset, with the method and results linked beside the numbers.

## Revisit the decision when an assumption changes

A few weeks later, the upstream service introduces a new failure code. Some failed requests are now worth retrying. The old decision remains useful because it recorded the assumption that has changed.

The agent can follow the source link, read the updated guidance, and compare it with the saved explanation. It can inspect the parser plan and the notes that refer to the earlier rule. The work becomes a review of a specific decision with a specific dependency.

You might keep the three-attempt limit for malformed input and write a separate decision for the new transient failure. Or you might replace the original policy. When a new decision replaces an old one, record that direction with `supersedes`, explain the reason, and update the old record's status so later sessions can recognize its historical role.

Git supplies another view of the same change. Commit the notes with the repository, and Wordcell can show the commits behind a decision:

```sh
wordcell history notes/parser-contract --root kb --repo .
```

That history includes the files changed alongside the note when available. It helps connect an explanation to the implementation work that accompanied it. An agent can also request history with its search results; a TypeScript workflow combines matching notes, their connections, and recent commits into one context package.

The result is a record you can revise without losing the earlier reasoning. A future reader can see that the old rule made sense under the old assumption, and understand the change without guessing from the final code.

## Let the next session improve the method

The parser change can leave more than a finished patch. Its plan can retain the decision, the verification results, and anything the work revealed about the way your team operates.

Perhaps the review exposed a recurring mistake: agents were changing retry behavior without checking the provider's failure categories. Put that requirement in the applicable `AGENTS.md`, and keep the plan and source as its rationale. The next edit starts with a better instruction and an explanation the agent can investigate.

Wordcell's public Agent Skill teaches this maintenance workflow. It routes an agent to the appropriate steps for capturing a source, writing a durable plan, saving a session, or updating knowledge. Plans track assumptions, dependencies, decisions, and verification as work proceeds. At closeout, the agent records the result and moves reusable conclusions into the note, guide, or code that should carry them forward.

The distinction matters as a project grows. A session note can preserve what happened on a particular day. A maintained explanation should answer the question as you understand it today. A repository rule should be short enough to apply before an edit. Keeping each in its proper place gives the next session useful context without making every old conversation part of every prompt.

As the collection grows, `wordcell percolate` suggests recurring concepts and missing connections for review. Your agent reads the cited notes before adding a relationship. This gives you a way to improve the organization as real work reveals what deserves a lasting place.

## Use the agent and editor you already have

Wordcell is headless: a command-line tool, local MCP server, and TypeScript SDK over your files. It runs with Bun and Git. Your existing agent provides the conversation and works in the repository where the code and knowledge already live.

The CLI works well for agents with terminal access. MCP clients can use tools to search, read, and update notes or add relationships. Configure a repository alongside the vault to make path-based context available:

```sh
wordcell mcp --root kb --repo .
```

The TypeScript SDK lets you use the same knowledge in a script or build a view suited to your work. A review page might place a decision beside its evidence. A project tool might use note metadata to list active plans. You choose the interface while the Markdown remains readable on its own.

[How xcb uses Wordcell](https://xcb.sh/blog/how-xcb-uses-wordcell) shows this in a coding-agent workflow: workers search a vault you choose and cite the notes they read. The integration gives those workers read-only search; saving a new decision remains a separate step.

This also makes adoption gradual. Point Wordcell at an existing Markdown folder or Obsidian vault and search it without converting the files. Add links when the relationships become useful. Add repository scopes when a code path becomes the best way to find a decision. Local search, graph queries, and Git history give you useful capabilities before you configure a model.

Your agent's provider still follows the settings you use for that agent. [Privacy and data flow](/docs/overview#privacy-and-boundaries) explains the optional services and what they receive.

When part of the knowledge is useful to other people, Wordcell can publish selected notes as a static site. Share the explanation of a design or a project's working methods while choosing the files that belong in the published view. The same material remains available to your agent in the repository.

## Start with one decision worth keeping

Choose a decision you expect to explain again. Save its reasoning and the source that informed it, then connect the note to the code it affects. Ask your agent to recover that context before the next edit and update the record when the work changes what you know.

Wordcell is free and open source under the MIT license. The [setup guide](/docs/getting-started) covers installation, using an existing vault, and connecting your agent. The [developer workflow](/developers) follows the commands for working with repository context.

For a broader view of this approach, Heinrich's essay [how to build agentic systems for knowledge work](https://x.com/arscontexta/status/2105397004226494487) explores keeping knowledge, working methods, and ongoing work connected. Wordcell applies that idea through a small set of files and tools that fit the coding environment you already use.
