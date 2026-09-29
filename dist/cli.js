#!/usr/bin/env bun
// @bun
import {
  describeUsageError,
  main,
  parseArguments,
  runExecutable,
  usage
} from "./index-m8jpvczw.js";
import"./index-47893rgw.js";
import"./index-qfqjfxaa.js";
import"./index-hz2wyggk.js";
import"./index-j4zgmzjr.js";
import"./index-t3abkwk4.js";
import"./index-hxyjer3x.js";
import"./index-k86wepd8.js";
import"./index-nwrehke7.js";
import"./index-5n05se68.js";
import"./index-xwxy71ew.js";
import"./index-cd75vky9.js";
import"./index-2gv8y733.js";
import"./index-w2zc0vwa.js";
import"./index-e5fbsywq.js";
import"./index-byz4kzww.js";
import"./index-gh719d91.js";
import"./index-npg9z1a4.js";
import"./index-mxxxytys.js";
import"./index-23z4zxgg.js";
import"./index-pj501bh1.js";
import"./index-9rf81m0p.js";
import"./index-59bcxqee.js";
import"./index-mcpppwbq.js";
import"./index-adx6khj5.js";
import"./index-fp732bgg.js";
import"./index-4j3tt0c3.js";
import"./index-j70m75wd.js";
import"./index-b88v3vtm.js";
import"./index-e26mdwxz.js";
import"./index-bdwcjvr4.js";
import"./index-3gc2yk4k.js";
import"./index-pgtm2nhf.js";
import"./index-1gwbassd.js";
import"./index-ahyhryb8.js";
import"./index-1xxnjn0d.js";
import"./index-r0m5taz2.js";
import"./index-1s8mc4hz.js";
import"./index-d13v9ckt.js";
import"./index-48pz4jpc.js";
import"./index-06c9ctr6.js";
import"./index-4knsp9qj.js";
import"./index-66pshdtx.js";
import"./index-23m6bbjt.js";
import"./index-hya40gb2.js";
import"./index-5vwpzb5a.js";
import"./index-x3fthpsc.js";
import"./index-qt2zwza8.js";
import"./index-3rm7cz6h.js";
import"./index-qkesh4c6.js";
import"./index-jvb7w0gg.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/cli.ts
if (import.meta.main) {
  const { standaloneSupportEnvironment, isUsefulSupportResult, runProductSupportCommand, showProductSupportInvitation } = await import("./support-v86z70sw.js");
  const env = standaloneSupportEnvironment();
  const args = process.argv.slice(2);
  if (args[0] === "support") {
    process.exitCode = await runProductSupportCommand(args.slice(1), { env });
  } else {
    const exitCode = await runExecutable(args);
    process.exitCode = exitCode;
    if (exitCode === 0 && isUsefulSupportResult(args, env))
      await showProductSupportInvitation({ env });
  }
}
export {
  usage,
  runExecutable,
  parseArguments,
  main,
  describeUsageError
};
