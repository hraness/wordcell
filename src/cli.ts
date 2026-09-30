#!/usr/bin/env bun
import { runExecutable } from "./cli-program.js";

export * from "./cli-program.js";

export async function runStandaloneCli(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const { standaloneSupportEnvironment, isUsefulSupportResult, runProductSupportCommand, showProductSupportInvitation } = await import("./support.js");
  const env = standaloneSupportEnvironment();
  if (args[0] === "support") {
    return await runProductSupportCommand(args.slice(1), { env });
  } else {
    const exitCode = await runExecutable(args);
    if (exitCode === 0 && isUsefulSupportResult(args, env)) await showProductSupportInvitation({ env });
    return exitCode;
  }
}

if (import.meta.main) process.exitCode = await runStandaloneCli();
