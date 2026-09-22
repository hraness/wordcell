import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import fc from "fast-check";

import { parseNote, type Note } from "./graph.js";
import {
  auditRepositoryMemoryScopes,
  type RepositoryMemoryScopeAudit,
} from "./repository-memory.js";

/** Canonical declarations the audit is expected to resolve inside the root. */
const safeScopes = [
  "src",
  "src/present.ts",
  "docs",
  "docs/design.md",
  "missing",
  "missing/deep/path.ts",
  "linked",
  "linked/target.md",
] as const;

/** Hostile declarations that must never reach the filesystem as written. */
const hostileScopes = [
  "../escape",
  "../../escape",
  "src/../../escape",
  "/etc/passwd",
  "C:/Windows",
  "./src",
  "src//present.ts",
  "src\\present.ts",
  "src/*",
  "src/present.ts ",
  "",
  "..",
  ".",
  "e\u0301",
  "src/\u0000null.ts",
] as const;

const noteKinds = [
  { lines: ["type: note"], raisesAdvisory: true },
  { lines: ["type: concept"], raisesAdvisory: true },
  { lines: ["type: plan", "status: in-progress"], raisesAdvisory: true },
  { lines: ["type: plan", "status: completed"], raisesAdvisory: false },
  { lines: ["type: plan", "status: superseded"], raisesAdvisory: false },
  { lines: ["type: report", "generated: 2026-01-02"], raisesAdvisory: true },
  { lines: ["type: source"], raisesAdvisory: false },
] as const;

type Declaration = {
  readonly kindIndex: number;
  readonly scopes: readonly string[];
};

function declaredNote(index: number, declaration: Declaration): Note {
  const kind = noteKinds[declaration.kindIndex % noteKinds.length];
  if (kind === undefined) throw new TypeError("note kind index escaped the table");
  const path = `notes/note-${index.toString().padStart(3, "0")}.md`;
  const scopeLines = declaration.scopes.length === 0
    ? []
    : [
        "repository_scopes:",
        ...declaration.scopes.map((scope) => `  - ${JSON.stringify(scope)}`),
      ];
  return parseNote(path, [
    "---",
    ...kind.lines,
    ...scopeLines,
    "---",
    `# Note ${index}`,
    "",
    "Prose that grounds the declaration.",
    "",
  ].join("\n"));
}

function insideRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function advisoryKeys(audit: RepositoryMemoryScopeAudit): readonly string[] {
  return audit.advisories.details.map(({ path, scope }) => `${path}\u0000${scope}`);
}

describe("repository scope audit properties", () => {
  test("keeps every inspected scope inside the repository root and stays deterministic", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hraness-wordcell-scope-property-"));
    const repository = join(temporary, "repository");
    try {
      await mkdir(join(repository, "src"), { recursive: true });
      await mkdir(join(repository, "docs"), { recursive: true });
      await writeFile(join(repository, "src", "present.ts"), "export const present = 1;\n", "utf8");
      await writeFile(join(repository, "docs", "design.md"), "# Design\n", "utf8");
      await writeFile(join(temporary, "escape"), "outside the repository\n", "utf8");
      await symlink(temporary, join(repository, "linked"), "dir");
      const canonicalRoot = await realpath(repository);

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              kindIndex: fc.integer({ min: 0, max: noteKinds.length - 1 }),
              scopes: fc.uniqueArray(
                fc.constantFrom(...safeScopes, ...hostileScopes),
                { maxLength: 4 },
              ),
            }),
            { maxLength: 8 },
          ),
          async (declarations) => {
            const notes = declarations.map((declaration, index) =>
              declaredNote(index, declaration));
            const audit = await auditRepositoryMemoryScopes(notes, {
              repositoryRoot: repository,
              detailLimit: 100,
            });

            expect(audit.repositoryRoot).toBe(canonicalRoot);

            // Path confinement: only canonical in-root declarations are inspected.
            for (const { scope } of audit.states.details) {
              expect(scope.split("/")).not.toContain("..");
              expect(insideRoot(canonicalRoot, resolve(canonicalRoot, scope))).toBe(true);
            }
            // A symlinked scope is reported, never followed into the parent directory.
            for (const detail of audit.states.details) {
              if (!detail.scope.startsWith("linked")) continue;
              expect(detail.state.status).toBe("invalid");
            }

            // Advisories are a subset of current records with absent scopes.
            const absent = new Set(audit.states.details
              .filter(({ state }) => state.status === "absent")
              .map(({ scope }) => scope));
            for (const advisory of audit.advisories.details) {
              expect(absent.has(advisory.scope)).toBe(true);
              const record = audit.records.details.find(({ path }) => path === advisory.path);
              expect(record?.classification).toMatchObject({ kind: "record", current: true });
            }

            // Ordering is total and stable on (note path, scope).
            expect(advisoryKeys(audit)).toEqual([...advisoryKeys(audit)].toSorted());
            expect(audit.states.details.map(({ scope }) => scope))
              .toEqual([...audit.states.details.map(({ scope }) => scope)].toSorted());
            expect(audit.counts.advisories).toBe(audit.advisories.total);
            expect(audit.counts.distinctScopes).toBe(audit.states.total);

            // Reordering the input never changes the report.
            const reversed = await auditRepositoryMemoryScopes([...notes].reverse(), {
              repositoryRoot: repository,
              detailLimit: 100,
            });
            expect(reversed).toEqual(audit);
          },
        ),
        { numRuns: 30 },
      );

      // Nothing the audit did rewrote or removed the file outside the root.
      expect(await Bun.file(join(temporary, "escape")).text())
        .toBe("outside the repository\n");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 60_000);

  test("terminal and ignored records stay silent while current records raise one advisory per absent scope", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hraness-wordcell-scope-history-"));
    const repository = join(temporary, "repository");
    try {
      await mkdir(repository, { recursive: true });
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc.constantFrom("missing/one.ts", "missing/two.ts", "missing/three.ts"),
            { minLength: 1, maxLength: 3 },
          ),
          async (scopes) => {
            const notes = noteKinds.map((_kind, index) => declaredNote(index, {
              kindIndex: index,
              scopes,
            }));
            const audit = await auditRepositoryMemoryScopes(notes, {
              repositoryRoot: repository,
              detailLimit: 100,
            });
            const currentPaths = noteKinds
              .map((kind, index) => ({ kind, index }))
              .filter(({ kind }) => kind.raisesAdvisory)
              .map(({ index }) => `notes/note-${index.toString().padStart(3, "0")}.md`);
            expect(audit.advisories.total).toBe(currentPaths.length * scopes.length);
            expect([...new Set(audit.advisories.details.map(({ path }) => path))].toSorted())
              .toEqual(currentPaths.toSorted());
          },
        ),
        { numRuns: 10 },
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 60_000);
});
