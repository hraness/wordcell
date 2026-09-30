import { runCliUpdate, type CliUpdateOptions } from "@hraness/cli-update";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findKbPackageRoot } from "./clip/package-root.js";
import { parseCliStartupCommand } from "./cli-startup.js";
import { isEvaluationBuilderHelp } from "./evaluation-builder-cli-args.js";

export type WordcellBin = "wordcell" | "wordcell-evaluation-builder";

export function wordcellUpdateOptions(bin: WordcellBin, entrypoint: string, argv: readonly string[]): CliUpdateOptions {
  const packageRoot = findKbPackageRoot(dirname(entrypoint));
  const manifest: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  if (manifest === null || typeof manifest !== "object" || !("version" in manifest) || typeof manifest.version !== "string") {
    throw new Error("Wordcell package version is missing.");
  }
  const effectFree = bin === "wordcell" ? parseCliStartupCommand(argv) !== undefined : isEvaluationBuilderHelp(argv);
  return {
    packageName: "@hraness/wordcell", version: manifest.version, binName: bin, entrypoint,
    argv: effectFree && argv[0] === "update" ? ["--help"] : argv,
    provider: { kind: "github", repository: "hraness/wordcell", tagPrefix: "v", assetName: "hraness-wordcell-{version}.tgz" },
    ignoreScripts: true,
    effectFree,
    suppressAutomatic: bin === "wordcell" && argv[0] === "support",
    async verifyArtifact(artifact) {
      const { verifyUpdateArtifact } = await import("./cli-release.js");
      await verifyUpdateArtifact(artifact);
    },
  };
}

/** Admission precedes imports of vault, capture, support, or evaluation code. */
export async function runWordcellBin(
  bin: WordcellBin,
  entrypoint: string,
  argv: readonly string[],
  dependencies: { update?: typeof runCliUpdate; run?: () => Promise<number> } = {},
): Promise<number> {
  const update = await (dependencies.update ?? runCliUpdate)(wordcellUpdateOptions(bin, entrypoint, argv));
  if (update.handled) return update.exitCode;
  try {
    if (dependencies.run) return await dependencies.run();
    if (bin === "wordcell") {
      const { runStandaloneCli } = await import("./cli.js");
      return await runStandaloneCli(argv);
    }
    const { runKbEvidenceRoutingBuildCli, kbEvidenceRoutingBuildUsage } = await import("./evaluation-builder.js");
    if (isEvaluationBuilderHelp(argv)) console.log(kbEvidenceRoutingBuildUsage);
    else await runKbEvidenceRoutingBuildCli(argv);
    return 0;
  } finally {
    await update.release();
  }
}
