import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import type { CliUpdateOptions } from "@hraness/cli-update";
import { parseArguments } from "./cli-program.js";
import { parseCliStartupCommand } from "./cli-startup.js";
import { runWordcellBin, wordcellUpdateOptions, type WordcellBin } from "./cli-update.js";

const entrypoint = fileURLToPath(new URL("./cli-bin.ts", import.meta.url));

test("both executables identify one package and preserve disabled lifecycle scripts", () => {
  for (const bin of ["wordcell", "wordcell-evaluation-builder"] as const) {
    const options = wordcellUpdateOptions(bin, entrypoint, ["update", "status", "--json"]);
    expect(options.packageName).toBe("@hraness/wordcell");
    expect(options.binName).toBe(bin);
    expect(options.entrypoint).toBe(entrypoint);
    expect(options.ignoreScripts).toBe(true);
    expect(options.provider).toEqual({ kind: "github", repository: "hraness/wordcell", tagPrefix: "v", assetName: "hraness-wordcell-{version}.tgz" });
    expect(typeof options.verifyArtifact).toBe("function");
  }
});

test("effect-free classification uses the product help grammar and keeps data under a lease", () => {
  for (const args of [[], ["--help"], ["version", "--json"], ["help", "search"], ["search", "x", "--help"], ["clip", "--help"], ["capture", "help"]]) {
    expect(wordcellUpdateOptions("wordcell", entrypoint, args).effectFree).toBe(true);
    expect(parseArguments(args)).toEqual(parseCliStartupCommand(args)!);
  }
  for (const args of [["search", "--", "--help"], ["note", "create", "x", "--title", "x", "--body", "-h"], ["mcp", "--root", "kb"], ["serve", "--root", "out"], ["completion"]]) {
    expect(wordcellUpdateOptions("wordcell", entrypoint, args).effectFree).toBe(false);
  }
  fc.assert(fc.property(fc.array(fc.constantFrom("search", "note", "create", "--help", "-h", "help", "--", "--body", "x", "--json", "version"), { maxLength: 8 }), args => {
    const early = parseCliStartupCommand(args);
    if (early !== undefined) expect(parseArguments(args)).toEqual(early);
  }));
  expect(wordcellUpdateOptions("wordcell-evaluation-builder", entrypoint, ["--help"]).effectFree).toBe(true);
  for (const args of [["version"], ["completion"], ["--build", "--config", "--help", "--artifact-root", "out"]]) {
    expect(wordcellUpdateOptions("wordcell-evaluation-builder", entrypoint, args).effectFree).toBe(false);
  }
});

test("support suppresses incidental updates without claiming the command has no work", () => {
  const options = wordcellUpdateOptions("wordcell", entrypoint, ["support", "status"]);
  expect(options.suppressAutomatic).toBe(true);
  expect(options.effectFree).toBe(false);
});

test("update commands finish before application work and preserve the updater exit status", async () => {
  for (const bin of ["wordcell", "wordcell-evaluation-builder"] as const) {
    let work = 0;
    const code = await runWordcellBin(bin, entrypoint, ["update", "--json"], {
      update: async () => ({ handled: true, exitCode: 17, release: async () => {} }),
      run: async () => { work++; return 0; },
    });
    expect(code).toBe(17);
    expect(work).toBe(0);
  }
});

test("both commands hold admission through successful and failed application work", async () => {
  for (const bin of ["wordcell", "wordcell-evaluation-builder"] satisfies WordcellBin[]) {
    for (const fails of [false, true]) {
      const events: string[] = [];
      let observed: CliUpdateOptions | undefined;
      const result = runWordcellBin(bin, entrypoint, ["command", "--", "--help"], {
        update: async options => { observed = options; events.push("admit"); return { handled: false, exitCode: 0, release: async () => { events.push("release"); } }; },
        run: async () => { events.push("work"); await Promise.resolve(); expect(events).toEqual(["admit", "work"]); if (fails) throw new Error("work failed"); return 9; },
      });
      if (fails) await expect(result).rejects.toThrow("work failed");
      else expect(await result).toBe(9);
      expect(events).toEqual(["admit", "work", "release"]);
      expect(observed?.effectFree).toBe(false);
    }
  }
});
