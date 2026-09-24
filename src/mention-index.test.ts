import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { analyzeVault, analyzeVaultComplete, parseNote, VaultAnalysisBudgetError, type Note } from "./graph.js";
import { MENTION_INDEX_LIMITS, MentionIndexBudgetError, MentionMatcher, type MentionIndexLimits } from "./mention-index.js";

const note = (id: string, title: string, body = "", aliases: readonly string[] = []): Note => parseNote(
  `notes/${id}.md`, `---\ntitle: ${JSON.stringify(title)}\naliases: ${JSON.stringify(aliases)}\n---\n${body}\n`,
);
const pattern = { targetId: "alpha", phrase: "Alpha", lowerPhrase: "alpha", rank: 0 };

describe("complete mention analysis", () => {
  test("preserves longest phrases, first offsets, ambiguous ownership and Unicode boundary semantics", () => {
    const notes = [
      note("source", "Source document", "İİİ\nalias phrase first.\nLong alias phrase later.\nSHARED WORDS.\nxAlpha conceptx. éAlpha concepté.\nİDEA TOOLS."),
      note("long", "Long alias phrase", "", ["alias phrase"]),
      note("alpha", "Alpha concept", "", ["Shared words"]),
      note("unicode", "İdea tools", "", ["Shared words"]),
      note("linked", "Linked document", "[[notes/alpha]] Alpha concept"),
    ];
    const expected = analyzeVault(notes);
    expect(analyzeVaultComplete(notes)).toEqual(expected);
    expect(expected.mentions.find((m) => m.source === "notes/source.md" && m.target === "notes/long.md")?.phrase).toBe("Long alias phrase");
    expect(expected.mentions.some((m) => m.phrase === "Shared words")).toBe(false);
    expect(expected.mentions.some((m) => m.source === "notes/linked.md" && m.target === "notes/alpha.md")).toBe(false);
    expect(analyzeVaultComplete([...notes, notes[1]!])).toEqual(analyzeVault([...notes, notes[1]!]));
  });

  test("preserves complete graph output over generated scopes, links, aliases and note orders", () => {
    const phrases = ["Alpha concept", "Beta tools", "Signal / noise", "İdea field", "e\u0301clair guide", "Shared title"];
    const entry = fc.record({
      title: fc.integer({ min: 0, max: phrases.length - 1 }),
      aliases: fc.array(fc.integer({ min: 0, max: phrases.length - 1 }), { maxLength: 3 }),
      mentions: fc.array(fc.nat(30), { maxLength: 12 }),
      links: fc.array(fc.nat(30), { maxLength: 3 }),
      prefix: fc.constantFrom("", "x", "é", "İ\n", "(", "_"),
    });
    fc.assert(fc.property(fc.array(entry, { maxLength: 14 }), (entries) => {
      const titles = entries.map((e, i) => `${phrases[e.title]} ${i}`);
      const notes = entries.map((e, i) => note(String(i), titles[i]!, [
        ...e.mentions.map((n) => `${e.prefix}${titles[n % entries.length]}${e.prefix}`),
        ...e.aliases.map((n) => phrases[n]!),
        ...e.links.map((n) => `[[notes/${n % entries.length}]]`),
      ].join("\n"), e.aliases.map((n) => phrases[n]!)));
      for (const ordered of [notes, [...notes].reverse()]) {
        for (const scope of [undefined, (n: Note) => Number(n.id.split("/").at(-1)) % 2 === 0, () => false]) {
          const options = {
            ...(scope === undefined ? {} : { mentionScope: scope }),
            includeInSuggestions: (n: Note) => !n.id.endsWith("/3"),
          };
          expect(analyzeVaultComplete(ordered, options)).toEqual(analyzeVault(ordered, options));
        }
      }
    }), { numRuns: 150 });
  });

  test("completes 1070 notes without enumerating their 1,143,830 ordered pairs", () => {
    const title = (i: number): string => `Concept ${String(i).padStart(4, "0")}`;
    const notes = Array.from({ length: 1070 }, (_, i) => note(String(i), title(i), title((i + 1) % 1070)));
    expect(() => analyzeVault(notes)).toThrow(VaultAnalysisBudgetError);
    const result = analyzeVaultComplete(notes);
    expect(result.noteCount).toBe(1070);
    expect(result.mentions).toHaveLength(1070);
    expect(analyzeVaultComplete(notes)).toEqual(result);
    expect(result.mentions.every((m) => m.target === `notes/${(Number(m.source.slice(6, -3)) + 1) % 1070}.md`)).toBe(true);
  });

  test("retains note, connection, candidate and materialized-result ceilings", () => {
    const notes = [note("a", "Alpha concept", "Beta concept"), note("b", "Beta concept")];
    for (const [options, kind] of [
      [{ maxNotes: 1 }, "notes"],
      [{ maxMentionPairs: 0 }, "mention-pairs"],
      [{ maxMentions: 0 }, "mentions"],
    ] as const) {
      expect(() => analyzeVaultComplete(notes, options)).toThrow(VaultAnalysisBudgetError);
      try { analyzeVaultComplete(notes, options); } catch (error) { expect(error).toMatchObject({ kind }); }
    }
    expect(() => analyzeVaultComplete([note("a", "Alpha concept", "[[notes/b]]"), notes[1]!], { maxConnectionObservations: 0 })).toThrow(VaultAnalysisBudgetError);
    expect(analyzeVaultComplete(notes, { maxMentionPairs: 0, mentionScope: () => false }).mentions).toEqual([]);
  });

  test("converts index exhaustion to the existing public budget failure", () => {
    expect(() => analyzeVaultComplete([note("a", "Alpha concept")], { mentionIndexLimits: { maxNodes: 0 } })).toThrow(VaultAnalysisBudgetError);
    try { analyzeVaultComplete([note("a", "Alpha concept")], { mentionIndexLimits: { maxNodes: 0 } }); }
    catch (error) { expect(error).toMatchObject({ kind: "mention-index-nodes", limit: 0 }); }
  });

  test("rejects input and invalid options before phrase normalization", () => {
    let normalized = 0;
    const guardedPhrase = {
      length: 100,
      trim: () => { normalized += 1; throw new Error("Must not normalize a phrase"); },
    } as unknown as string;
    const guarded = {
      ...note("a", "Alpha concept"),
      title: guardedPhrase,
      aliases: [guardedPhrase],
      searchableText: { length: 100, toLocaleLowerCase: () => { normalized += 1; throw new Error("Must not normalize"); } } as unknown as string,
    };
    expect(() => analyzeVaultComplete([guarded], { mentionIndexLimits: { maxInputCodeUnits: 99 } })).toThrow(VaultAnalysisBudgetError);
    expect(() => analyzeVaultComplete([guarded], { mentionIndexLimits: { maxWork: 0 } })).toThrow(VaultAnalysisBudgetError);
    expect(() => analyzeVaultComplete([guarded], { mentionIndexLimits: { maxNodes: -1 } })).toThrow(RangeError);
    expect(normalized).toBe(0);
  });
});

describe("finite mention index", () => {
  test("newline indexing preserves the legacy original-text slice at expanded UTF-16 offsets", () => {
    fc.assert(fc.property(fc.array(fc.constantFrom("A", "İ", "ß", "\n", "\r", "e\u0301", "🫧"), { maxLength: 100 }), (characters) => {
      const text = characters.join(""), matcher = new MentionMatcher([]), lines = matcher.newlineOffsets(text);
      for (const offset of [0, 1, Math.floor(text.length / 2), text.length, text.toLocaleLowerCase("en-US").length + 2]) {
        expect(matcher.lineAt(lines, offset)).toBe(text.slice(0, offset).split("\n").length);
      }
    }));
    expect(() => new MentionMatcher([], { maxWork: 2 }).newlineOffsets("abc")).toThrow(MentionIndexBudgetError);
  });

  test("enforces exact node, work, normalized-input and output boundaries", () => {
    const limits: MentionIndexLimits = { maxNodes: 6, maxWork: 14, maxInputCodeUnits: 10, maxMatches: 1 };
    expect(new MentionMatcher([pattern], limits).scan("alpha").get("alpha")?.offset).toBe(0);
    for (const [name, limit] of Object.entries(limits)) {
      expect(() => new MentionMatcher([pattern], { ...limits, [name]: limit - 1 }).scan("alpha")).toThrow(MentionIndexBudgetError);
      expect(new MentionMatcher([pattern], { ...limits, [name]: limit + 1 }).scan("alpha").size).toBe(1);
    }
    expect(() => new MentionMatcher([], { maxInputCodeUnits: 1 }, 2)).toThrow(MentionIndexBudgetError);
  });

  test("counts repeated, boundary-rejected and overlapping outputs before deduplication", () => {
    const repeated = new MentionMatcher([pattern], { maxMatches: 1 });
    expect(repeated.scan("alpha").size).toBe(1);
    expect(() => repeated.scan("alpha")).toThrow(MentionIndexBudgetError);
    expect(() => new MentionMatcher([pattern], { maxMatches: 1 }).scan("xalpha alpha")).toThrow(MentionIndexBudgetError);
    const suffix = { ...pattern, targetId: "suffix", phrase: "lpha", lowerPhrase: "lpha" };
    expect(() => new MentionMatcher([pattern, suffix], { maxMatches: 1 }).scan("alpha")).toThrow(MentionIndexBudgetError);
  });

  test("rejects invalid resource limits without widening package ceilings", () => {
    for (const [name, maximum] of Object.entries(MENTION_INDEX_LIMITS)) {
      for (const value of [-1, 0.5, NaN, Infinity, maximum + 1]) {
        expect(() => new MentionMatcher([], { [name]: value })).toThrow(RangeError);
      }
    }
  });
});
