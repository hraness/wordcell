import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { openKnowledgeBase } from "../src/sdk.ts";
import { scanVault, type VaultSnapshot } from "../src/vault.ts";

export type PassageEvidenceGold = {
  readonly path: string;
  readonly quote: string;
  readonly anchors: readonly string[];
};

export type PassageEvidenceCase = {
  readonly id: string;
  readonly split: string;
  readonly caseType: string;
  readonly query: string;
  readonly relevantPaths: readonly string[];
  readonly goldEvidence: readonly PassageEvidenceGold[];
};

const configuration = Object.freeze({
  mode: "exact" as const,
  limit: 5,
  graph: false as const,
  history: false as const,
  selectedPassage: true as const,
  maxTextBytes: 512,
});

const DEFAULT_CASES = resolve(import.meta.dir, "../docs/evaluations/wordcell-passages-20260927/cases.json");

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const normalizeWhitespace = (value: string): string => value.replace(/\s+/gu, " ").trim();

/** The longest prefix of `value` within `maximumBytes` UTF-8 bytes, never splitting a code point. */
export function clipUtf8(value: string, maximumBytes: number): string {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError("The byte limit must be a nonnegative safe integer.");
  }
  let bytes = 0;
  let end = 0;
  for (const character of value) {
    const width = Buffer.byteLength(character, "utf8");
    if (bytes + width > maximumBytes) break;
    bytes += width;
    end += character.length;
  }
  return value.slice(0, end);
}

/**
 * True when one text contains a labeled answer: every anchor of one evidence
 * alternative together, or its whole quote when it has no anchors. Whitespace
 * is normalized because the legacy snippet folds it; matching is case-sensitive.
 */
export function containsEvidence(text: string, gold: PassageEvidenceGold): boolean {
  const normalized = normalizeWhitespace(text);
  return gold.anchors.length > 0
    ? gold.anchors.every((anchor) => normalized.includes(normalizeWhitespace(anchor)))
    : normalized.includes(normalizeWhitespace(gold.quote));
}

function parseCases(value: unknown): readonly PassageEvidenceCase[] {
  const cases = (value as { cases?: unknown } | null)?.cases;
  if (!Array.isArray(cases) || cases.length === 0 || cases.length > 100) {
    throw new TypeError("The case file must contain between 1 and 100 cases.");
  }
  return cases.map((entry: PassageEvidenceCase, index) => {
    if (typeof entry?.id !== "string" || typeof entry.query !== "string" || typeof entry.split !== "string"
      || typeof entry.caseType !== "string" || !Array.isArray(entry.relevantPaths) || !Array.isArray(entry.goldEvidence)) {
      throw new TypeError(`Case ${index + 1} is malformed.`);
    }
    for (const gold of entry.goldEvidence) {
      if (typeof gold?.path !== "string" || typeof gold.quote !== "string" || !Array.isArray(gold.anchors)
        || gold.anchors.some((anchor) => typeof anchor !== "string" || anchor === "" || !gold.quote.includes(anchor))) {
        throw new TypeError(`Case ${entry.id} has malformed evidence.`);
      }
    }
    return entry;
  });
}

/** Compare the legacy snippet with the selected passage for the same retrieved notes. */
export async function measurePassageEvidence(root: string, cases: readonly PassageEvidenceCase[]) {
  let snapshot: VaultSnapshot | undefined;
  let semanticSessionOpens = 0;
  const kb = await openKnowledgeBase({ root }, {
    scanVault: async (...args) => {
      snapshot = await scanVault(...args);
      return snapshot;
    },
    openSemanticSearchSession: async () => {
      semanticSessionOpens += 1;
      throw new Error("This passage measurement must not open a model-backed search session.");
    },
  });
  try {
    if (snapshot === undefined) throw new Error("The SDK did not expose its vault scan.");
    const notes = snapshot.notes.toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const manifest = notes.map(({ path, content }) => ({
      path,
      bytes: Buffer.byteLength(content, "utf8"),
      sha256: sha256(content),
    }));
    const noteByPath = new Map(notes.map((note) => [note.path, note]));
    for (const entry of cases) {
      for (const gold of entry.goldEvidence) {
        if (!noteByPath.get(gold.path)?.content.includes(gold.quote)) {
          throw new Error(`Case ${entry.id} quotes text that is not in ${gold.path}.`);
        }
      }
    }
    const results = [];
    for (const entry of cases) {
      const { maxTextBytes, ...searchOptions } = configuration;
      const result = await kb.search({ query: entry.query, ...searchOptions });
      if (result.partial) throw new Error(`Search was partial for case ${entry.id}.`);
      const candidates = result.results.map((hit) => {
        const snippet = clipUtf8(hit.snippet, maxTextBytes);
        const passage = hit.selectedPassage;
        const passageText = passage?.status === "selected" ? passage.text : null;
        const alternatives = entry.goldEvidence.filter((gold) => gold.path === hit.path);
        return {
          rank: hit.rank,
          path: hit.path,
          relevant: entry.relevantPaths.includes(hit.path),
          snippetBytes: Buffer.byteLength(snippet, "utf8"),
          snippetContainsAnswer: alternatives.some((gold) => containsEvidence(snippet, gold)),
          passageStatus: passage?.status ?? "missing",
          ...(passage?.status === "selected"
            ? { passageLines: [passage.startLine, passage.endLine], passageBytes: passage.endByte - passage.startByte }
            : { passageReason: passage?.status === undefined ? "missing" : passage.reason }),
          passageContainsAnswer: passageText !== null
            && alternatives.some((gold) => containsEvidence(passageText, gold)),
        };
      });
      results.push({
        id: entry.id,
        split: entry.split,
        caseType: entry.caseType,
        query: entry.query,
        relevantPaths: entry.relevantPaths,
        candidateMiss: entry.relevantPaths.length > 0
          && !candidates.some((candidate) => candidate.relevant),
        snippetContainsAnswer: candidates.some((candidate) => candidate.snippetContainsAnswer),
        passageContainsAnswer: candidates.some((candidate) => candidate.passageContainsAnswer),
        candidates,
      });
    }
    const splits = [...new Set(results.map(({ split }) => split))].map((split) => {
      const inSplit = results.filter((entry) => entry.split === split);
      const positives = inSplit.filter((entry) => entry.caseType === "positive");
      const candidates = inSplit.flatMap((entry) => entry.candidates);
      return {
        split,
        cases: inSplit.length,
        positives: positives.length,
        candidateMisses: positives.filter((entry) => entry.candidateMiss).length,
        snippetAnswers: positives.filter((entry) => entry.snippetContainsAnswer).length,
        passageAnswers: positives.filter((entry) => entry.passageContainsAnswer).length,
        gained: positives.filter((entry) => entry.passageContainsAnswer && !entry.snippetContainsAnswer).length,
        lost: positives.filter((entry) => entry.snippetContainsAnswer && !entry.passageContainsAnswer).length,
        snippetBytes: candidates.reduce((sum, candidate) => sum + candidate.snippetBytes, 0),
        passageBytes: candidates.reduce((sum, candidate) => sum + (candidate.passageBytes ?? 0), 0),
      };
    });
    return {
      schema: "hraness.wordcell.passage-evidence.v1",
      tool: {
        name: "@hraness/wordcell",
        version: (JSON.parse(await readFile(resolve(import.meta.dir, "../package.json"), "utf8")) as { version: string }).version,
        bun: Bun.version,
      },
      corpus: {
        notes: manifest.length,
        bytes: manifest.reduce((sum, note) => sum + note.bytes, 0),
        identitySha256: sha256(JSON.stringify(manifest)),
        files: manifest,
      },
      configuration,
      semanticSessionOpens,
      splits,
      cases: results,
    };
  } finally {
    await kb.close();
  }
}

if (import.meta.main) {
  const root = resolve(process.argv[2] ?? "kb");
  const cases = parseCases(JSON.parse(await readFile(resolve(process.argv[3] ?? DEFAULT_CASES), "utf8")));
  process.stdout.write(`${JSON.stringify(await measurePassageEvidence(root, cases), null, 2)}\n`);
}
