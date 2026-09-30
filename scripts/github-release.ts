import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runGitHubReleaseCommand } from "../src/cli-release.ts";

export * from "../src/cli-release.ts";

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runGitHubReleaseCommand(process.argv.slice(2));
}
