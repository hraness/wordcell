import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { openKnowledgeBase, packUntrustedSearchContext } from "../src/sdk.ts";
import { scanVault, type VaultSnapshot } from "../src/vault.ts";

// These product tasks are fixed before measuring. They are not relevance judgments.
export const PRODUCT_EVIDENCE_QUERIES = Object.freeze([
  "selective publishing",
  "repository memory",
  "typed relationships",
  "capture",
]);

const configuration = Object.freeze({
  mode: "exact" as const,
  limit: 5,
  graph: false as const,
  history: false as const,
  maxBytes: 12_000,
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** A byte comparison, including honest negative savings and empty baselines. */
export function reductionPercent(outputBytes: number, baselineBytes: number): number | null {
  for (const value of [outputBytes, baselineBytes]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("Payload sizes must be nonnegative safe integers.");
    }
  }
  return baselineBytes === 0
    ? null
    : Math.round((1 - outputBytes / baselineBytes) * 10_000) / 100;
}

/** Measure actual SDK output against the same selected notes in one snapshot. */
export async function measureProductEvidence(
  root: string,
  queries: readonly string[] = PRODUCT_EVIDENCE_QUERIES,
) {
  if (queries.length === 0 || queries.length > 100) {
    throw new RangeError("Measure between 1 and 100 queries.");
  }
  let snapshot: VaultSnapshot | undefined;
  let vaultScans = 0;
  let semanticSessionOpens = 0;
  const kb = await openKnowledgeBase({ root }, {
    scanVault: async (...args) => {
      vaultScans += 1;
      snapshot = await scanVault(...args);
      return snapshot;
    },
    openSemanticSearchSession: async () => {
      semanticSessionOpens += 1;
      throw new Error("This payload-size demonstration must not open a model-backed search session.");
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
    const corpusBytes = manifest.reduce((sum, note) => sum + note.bytes, 0);
    const cases = [];
    for (const query of queries) {
      const { maxBytes, ...searchOptions } = configuration;
      const result = await kb.search({ query, ...searchOptions });
      if (result.partial) throw new Error(`Search was partial for ${JSON.stringify(query)}.`);
      const packed = packUntrustedSearchContext(result, { maxBytes });
      const selected = result.results.map(({ path }) => {
        const note = noteByPath.get(path);
        if (note === undefined) throw new Error(`Search returned a note outside its snapshot: ${path}`);
        return { path, bytes: Buffer.byteLength(note.content, "utf8"), sha256: sha256(note.content) };
      });
      const selectedFullNoteBytes = selected.reduce((sum, note) => sum + note.bytes, 0);
      const packedBytes = Buffer.byteLength(packed.content, "utf8");
      cases.push({
        query,
        selected,
        selectedFullNoteBytes,
        packedBytes,
        reductionVsSelectedFullNotesPercent: reductionPercent(packedBytes, selectedFullNoteBytes),
        reductionVsWholeVaultPercent: reductionPercent(packedBytes, corpusBytes),
        truncated: packed.truncated,
        packedSha256: sha256(packed.content),
        packedContent: packed.content,
      });
    }
    const selectedFullNoteBytes = cases.reduce((sum, item) => sum + item.selectedFullNoteBytes, 0);
    const packedBytes = cases.reduce((sum, item) => sum + item.packedBytes, 0);
    return {
      schema: "wordcell.product-evidence.v1",
      metric: "UTF-8 payload bytes, not model tokens, latency, cost, or relevance",
      configuration,
      corpus: {
        noteCount: notes.length,
        bytes: corpusBytes,
        // Canonical array order and property order are fixed above; no newline.
        sha256: sha256(JSON.stringify(manifest)),
        manifest,
      },
      execution: { vaultScans, semanticSessionOpens },
      cases,
      aggregate: {
        queries: cases.length,
        selectedFullNoteBytes,
        packedBytes,
        reductionVsSelectedFullNotesPercent: reductionPercent(packedBytes, selectedFullNoteBytes),
        wholeVaultRepeatedPerQueryBytes: corpusBytes * cases.length,
        reductionVsWholeVaultPercent: reductionPercent(packedBytes, corpusBytes * cases.length),
      },
    };
  } finally {
    await kb.close();
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg.startsWith("-"))) {
    throw new Error("Usage: bun scripts/product-evidence.ts [vault-directory]");
  }
  const packagePath = resolve(import.meta.dir, "../package.json");
  const pkg: unknown = JSON.parse(await readFile(packagePath, "utf8"));
  if (typeof pkg !== "object" || pkg === null || !("version" in pkg) || typeof pkg.version !== "string") {
    throw new Error("package.json has no version string.");
  }
  const measurement = await measureProductEvidence(resolve(args[0] ?? "kb"));
  console.log(JSON.stringify({
    tool: { name: "@hraness/wordcell", version: pkg.version, bun: Bun.version },
    ...measurement,
  }, null, 2));
}
