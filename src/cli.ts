#!/usr/bin/env bun
import { runExecutable } from "./cli-program.js";

export * from "./cli-program.js";

if (import.meta.main) {
  const { standaloneSupportEnvironment, isUsefulSupportResult, runProductSupportCommand, showProductSupportInvitation } = await import("./support.js");
  const env = standaloneSupportEnvironment();
  const args = process.argv.slice(2);
  if (args[0] === "support") {
    process.exitCode = await runProductSupportCommand(args.slice(1), { env });
  } else {
    const exitCode = await runExecutable(args);
    process.exitCode = exitCode;
    if (exitCode === 0 && isUsefulSupportResult(args, env)) await showProductSupportInvitation({ env });
  }
}
