// @bun
import {
  isEvaluationBuilderHelp
} from "./index-3t0v457d.js";
import {
  parseCliStartupCommand
} from "./index-t4hjm1kk.js";
import {
  findKbPackageRoot
} from "./index-4knsp9qj.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/cli-update.ts
import { runCliUpdate } from "@hraness/cli-update";
import { readFileSync } from "fs";
import { dirname, join } from "path";
function wordcellUpdateOptions(bin, entrypoint, argv) {
  const packageRoot = findKbPackageRoot(dirname(entrypoint));
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  if (manifest === null || typeof manifest !== "object" || !("version" in manifest) || typeof manifest.version !== "string") {
    throw new Error("Wordcell package version is missing.");
  }
  const effectFree = bin === "wordcell" ? parseCliStartupCommand(argv) !== undefined : isEvaluationBuilderHelp(argv);
  return {
    packageName: "@hraness/wordcell",
    version: manifest.version,
    binName: bin,
    entrypoint,
    argv: effectFree && argv[0] === "update" ? ["--help"] : argv,
    provider: { kind: "github", repository: "hraness/wordcell", tagPrefix: "v", assetName: "hraness-wordcell-{version}.tgz" },
    ignoreScripts: true,
    effectFree,
    suppressAutomatic: bin === "wordcell" && argv[0] === "support",
    async verifyArtifact(artifact) {
      const { verifyUpdateArtifact } = await import("./cli-release-cf48w61z.js");
      await verifyUpdateArtifact(artifact);
    }
  };
}
async function runWordcellBin(bin, entrypoint, argv, dependencies = {}) {
  const update = await (dependencies.update ?? runCliUpdate)(wordcellUpdateOptions(bin, entrypoint, argv));
  if (update.handled)
    return update.exitCode;
  try {
    if (dependencies.run)
      return await dependencies.run();
    if (bin === "wordcell") {
      const { runStandaloneCli } = await import("./cli.js");
      return await runStandaloneCli(argv);
    }
    const { runKbEvidenceRoutingBuildCli, kbEvidenceRoutingBuildUsage } = await import("./evaluation-builder.js");
    if (isEvaluationBuilderHelp(argv))
      console.log(kbEvidenceRoutingBuildUsage);
    else
      await runKbEvidenceRoutingBuildCli(argv);
    return 0;
  } finally {
    await update.release();
  }
}

export { runWordcellBin };
