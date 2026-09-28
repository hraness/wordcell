import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fc from "fast-check";

import {
  createSelectedPassageBudget,
  SELECTED_PASSAGE_MAX_BYTES,
  SELECTED_PASSAGE_MAX_HEADING_BYTES,
  SELECTED_PASSAGE_MAX_SOURCE_BYTES,
  selectSearchPassage,
  type SelectedPassage,
  type SelectedPassageResult,
} from "./selected-passage.js";

function select(text: string, query: string, budget = createSelectedPassageBudget()): SelectedPassageResult {
  return selectSearchPassage({ query, text, budget });
}

function selected(text: string, query: string): SelectedPassage {
  const result = select(text, query);
  if (result.status !== "selected") throw new Error(`Expected a selected passage, got ${JSON.stringify(result)}`);
  verify(text, result);
  return result;
}

function lineOf(source: Buffer, byte: number): number {
  return source.subarray(0, byte).toString("utf8").split("\n").length;
}

function verify(text: string, passage: SelectedPassage): void {
  const source = Buffer.from(text, "utf8");
  const boundaries = new Set([0]);
  let offset = 0;
  for (const part of new Intl.Segmenter("en-US", { granularity: "grapheme" }).segment(text)) {
    offset += Buffer.byteLength(part.segment);
    boundaries.add(offset);
  }
  expect(passage.endByte).toBeGreaterThan(passage.startByte);
  expect(passage.endByte - passage.startByte).toBeLessThanOrEqual(SELECTED_PASSAGE_MAX_BYTES);
  expect(source.subarray(passage.startByte, passage.endByte).toString("utf8")).toBe(passage.text);
  expect(boundaries.has(passage.startByte)).toBe(true);
  expect(boundaries.has(passage.endByte)).toBe(true);
  expect(passage.startLine).toBe(lineOf(source, passage.startByte));
  expect(passage.endLine).toBe(source.subarray(0, passage.endByte).toString("utf8").replace(/\n$/u, "").split("\n").length);
  expect(passage.sourceSha256).toBe(createHash("sha256").update(source).digest("hex"));
  expect(passage.sourceEncoding).toBe("utf8-snapshot");
  let previousLevel = 0;
  let previousEnd = 0;
  for (const heading of passage.headings) {
    expect(heading.level).toBeGreaterThan(previousLevel);
    expect(heading.startByte).toBeGreaterThanOrEqual(previousEnd);
    expect(heading.endByte).toBeLessThanOrEqual(passage.startByte);
    expect(heading.endByte - heading.startByte).toBeLessThanOrEqual(SELECTED_PASSAGE_MAX_HEADING_BYTES);
    expect(source.subarray(heading.startByte, heading.endByte).toString("utf8")).toBe(heading.text);
    expect(heading.startLine).toBe(lineOf(source, heading.startByte));
    expect(heading.text.startsWith("#") || /^\s{1,3}#/u.test(heading.text)).toBe(true);
    previousLevel = heading.level;
    previousEnd = heading.endByte;
  }
}

describe("selected search passages", () => {
  test("chooses a dense later passage instead of the first query term", () => {
    const source = "The system must complete routine publication tasks.\n\n"
      + "The writer waits for directory flush completion before releasing its lock.\n\n"
      + "Other operations can finish later.\n";
    const passage = selected(source, "Why must a writer wait for directory flush before releasing the lock?");
    expect(passage.text).toBe("The writer waits for directory flush completion before releasing its lock.");
    expect(passage.startLine).toBe(3);
    expect(passage.clippedStart).toBe(false);
    expect(passage.clippedEnd).toBe(false);
  });

  test("is invariant to query-term order and repeated query terms", () => {
    const source = "A quartz record exists.\n\nThe cedar river contains quartz samples.\n\nA cedar archive exists.";
    const result = select(source, "quartz cedar river");
    expect(select(source, "river quartz cedar")).toEqual(result);
    expect(select(source, "cedar river quartz cedar river")).toEqual(result);
  });

  test("skips closed frontmatter without changing raw body offsets", () => {
    const frontmatter = "---\r\ntitle: quartz cedar river\r\n---\r\n";
    const source = `${frontmatter}# Notes\r\n\r\nThe cedar river carries quartz.\r\n`;
    const passage = selected(source, "quartz cedar river");
    expect(passage.text).toBe("# Notes\r\n\r\nThe cedar river carries quartz.");
    expect(passage.startLine).toBe(4);
    expect(passage.startByte).toBe(Buffer.byteLength(frontmatter));
    expect(select("---\ntitle: quartz\n---\nUnrelated body.", "quartz"))
      .toEqual({ status: "none", reason: "no-lexical-match" });
  });

  test("does not silently discard an unclosed frontmatter-like block", () => {
    const source = "---\nquartz remains ordinary text without a closing delimiter.";
    expect(selected(source, "quartz").text).toBe(source);
  });

  test("headings accompany prose instead of winning by standalone density", () => {
    const source = "# Quartz cedar river\n\nAn introductory explanation gives useful context.\n\n"
      + "The quartz in the cedar river comes from erosion.\n";
    const passage = selected(source, "quartz cedar river");
    expect(passage.text).toBe("The quartz in the cedar river comes from erosion.");
    expect(passage.headings.map(({ text }) => text)).toEqual(["# Quartz cedar river"]);
    expect(selected("# Quartz cedar river", "quartz").text).toBe("# Quartz cedar river");
  });

  test("returns the enclosing heading chain as separate exact spans", () => {
    const source = [
      "# Product",
      "",
      "Overview text.",
      "",
      "## Billing",
      "",
      "### Old plan",
      "",
      "Unrelated.",
      "",
      "### Retries",
      "",
      "```md",
      "# not a heading inside a fence",
      "```",
      "",
      "Failed invoices retry with exponential backoff.",
      "",
    ].join("\n");
    const passage = selected(source, "failed invoices backoff");
    expect(passage.text).toBe("Failed invoices retry with exponential backoff.");
    expect(passage.headings.map(({ level, text, startLine }) => ({ level, text, startLine }))).toEqual([
      { level: 1, text: "# Product", startLine: 1 },
      { level: 2, text: "## Billing", startLine: 5 },
      { level: 3, text: "### Retries", startLine: 11 },
    ]);
    expect(passage.headings.every(({ truncated }) => !truncated)).toBe(true);
  });

  test("omits headings that the passage already contains", () => {
    const source = "# Guide\n\nIntro.\n\n## Retries\n\n### Invoices\nFailed invoices retry with backoff.\n";
    const passage = selected(source, "failed invoices backoff");
    expect(passage.text).toBe("## Retries\n\n### Invoices\nFailed invoices retry with backoff.");
    expect(passage.headings.map(({ text }) => text)).toEqual(["# Guide"]);
  });

  test("a leading heading in the passage closes earlier sibling sections", () => {
    const source = "# Storage\n\n## Checklist\n\nRelease checklist.\n\n## Failure\n\n### Sync\n\nA failed sync keeps the lock.\n";
    const passage = selected(source, "failed sync lock");
    expect(passage.text).toBe("## Failure\n\n### Sync\n\nA failed sync keeps the lock.");
    expect(passage.headings.map(({ text }) => text)).toEqual(["# Storage"]);
  });

  test("shortens long headings on grapheme boundaries and says so", () => {
    const heading = `## ${"👩🏽‍💻 ".repeat(40)}`;
    const source = `${heading}\n\nIntro.\n\n### Detail\n\n${"filler words. ".repeat(40)}The quartz sample.\n`;
    const passage = selected(source, "quartz sample");
    expect(passage.clippedStart).toBe(true);
    expect(passage.headings.map(({ level, truncated }) => ({ level, truncated })))
      .toEqual([{ level: 2, truncated: true }, { level: 3, truncated: false }]);
    expect(heading.startsWith(passage.headings[0]?.text ?? "x")).toBe(true);
  });

  test("stops a heading span where a window that starts inside it begins", () => {
    const heading = `# ${"quartz ".repeat(60)}`;
    const source = `${heading}\n${"filler words. ".repeat(30)}quartz sample.\n`;
    const passage = selected(source, "quartz sample");
    for (const context of passage.headings) {
      expect(context.truncated).toBe(true);
      expect(context.endByte).toBeLessThanOrEqual(passage.startByte);
    }
  });

  test("keeps fenced code, inline code and indentation as source evidence", () => {
    const source = "# Example\n\n```ts\n  await directory.flush();\n  releaseLock();\n```\n\nUse `directory.flush()` first.\n";
    const passage = selected(source, "directory flush releaseLock");
    expect(passage.text).toContain("  await directory.flush();");
    expect(passage.text).toContain("```");
  });

  test("marks windows that start or end inside a long paragraph", () => {
    const source = `${"filler words appear here. ".repeat(40)}The quartz needle sits here. ${"more filler text. ".repeat(40)}\n`;
    const passage = selected(source, "quartz needle");
    expect(passage.text).toContain("quartz needle");
    expect(passage.clippedStart || passage.clippedEnd).toBe(true);
  });

  test("does not reward repeated terms over distinct coverage", () => {
    const source = `${"quartz ".repeat(70)}\n\nCedar river quartz evidence.`;
    expect(selected(source, "quartz cedar river").text).toBe("Cedar river quartz evidence.");
  });

  test("does not match a query term inside an unrelated word", () => {
    expect(select("A butterfly has colorful wings.", "fly")).toEqual({ status: "none", reason: "no-lexical-match" });
  });

  test("reports stop-word-only queries separately from unmatched ones", () => {
    expect(select("Anything.", "why must the")).toEqual({ status: "none", reason: "no-query-terms" });
    expect(select("", "quartz")).toEqual({ status: "none", reason: "no-lexical-match" });
  });

  test("matches NFC-equivalent query text while retaining decomposed source", () => {
    const source = "The cafe\u0301 contains a needle.";
    expect(selected(source, "café needle").text).toBe(source);
  });

  test("reports every bound as a status instead of a partial scan", () => {
    expect(select("x".repeat(SELECTED_PASSAGE_MAX_SOURCE_BYTES + 1), "x"))
      .toEqual({ status: "unavailable", reason: "source-limit" });
    expect(select("text", Array.from({ length: 65 }, (_, index) => `term${index}`).join(" ")))
      .toEqual({ status: "unavailable", reason: "query-limit" });
    expect(select("text", "x".repeat(16 * 1024 + 1))).toEqual({ status: "unavailable", reason: "query-limit" });
    expect(select("\ud800 text", "text")).toEqual({ status: "unavailable", reason: "invalid-source" });
    expect(select("e" + "\u0301".repeat(300), "e")).toEqual({ status: "unavailable", reason: "grapheme-limit" });
    expect(select("needle\n\n".repeat(10_001), "needle")).toEqual({ status: "unavailable", reason: "candidate-limit" });
  });

  test("shares one search budget across notes in rank order", () => {
    const budget = createSelectedPassageBudget(40);
    expect(select("quartz ".repeat(4), "quartz", budget).status).toBe("selected");
    expect(select("quartz ".repeat(4), "quartz", budget)).toEqual({ status: "unavailable", reason: "search-budget" });
    expect(select("quartz", "quartz", budget).status).toBe("selected");
    expect(() => createSelectedPassageBudget(-1)).toThrow("non-negative");
  });

  test("results are frozen data", () => {
    const passage = selected("# Title\n\nquartz body", "quartz");
    expect(Object.isFrozen(passage)).toBe(true);
    expect(Object.isFrozen(passage.headings)).toBe(true);
    expect(passage.headings.every((heading) => Object.isFrozen(heading))).toBe(true);
    expect(JSON.parse(JSON.stringify(passage))).toEqual(passage);
  });

  test("generated Markdown preserves exact spans, headings, and order invariance", () => {
    const piece = fc.constantFrom(
      "café", "e\u0301", "👩🏽‍💻", "中文", "alpha", "beta", "gamma", "\t", " ", "`code`", "quartz",
    );
    const line = fc.oneof(
      fc.array(piece, { minLength: 1, maxLength: 30 }).map((parts) => parts.join(" ")),
      fc.tuple(fc.integer({ min: 1, max: 6 }), fc.array(piece, { minLength: 1, maxLength: 4 }))
        .map(([level, parts]) => `${"#".repeat(level)} ${parts.join(" ")}`),
      fc.constant(""),
      fc.constant("```"),
    );
    fc.assert(fc.property(
      fc.array(line, { minLength: 1, maxLength: 40 }),
      fc.boolean(),
      fc.boolean(),
      (lines, crlf, frontmatter) => {
        const newline = crlf ? "\r\n" : "\n";
        const body = lines.join(newline);
        const source = frontmatter ? `---${newline}title: alpha${newline}---${newline}${body}` : body;
        const result = select(source, "alpha beta café");
        expect(select(source, "café alpha beta beta")).toEqual(result);
        if (result.status === "selected") verify(source, result);
        else expect(result).toEqual({ status: "none", reason: "no-lexical-match" });
      },
    ), { numRuns: 300 });
  });
});
