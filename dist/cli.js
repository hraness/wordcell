#!/usr/bin/env bun
// @bun
import {
  main,
  parseArguments,
  runExecutable,
  usage
} from "./index-p8gznx4x.js";
import"./index-bcknqxrq.js";
import"./index-054mb7d3.js";
import"./index-meyfaqje.js";
import"./index-j4zgmzjr.js";
import"./index-de2w8crk.js";
import"./index-6jcz0m1c.js";
import"./index-f984hw45.js";
import"./index-fc4dr114.js";
import"./index-5n05se68.js";
import"./index-g5vsqmdy.js";
import"./index-hgve9rh2.js";
import"./index-2gv8y733.js";
import"./index-w2zc0vwa.js";
import"./index-e5fbsywq.js";
import"./index-dfag79p7.js";
import"./index-gh719d91.js";
import"./index-npg9z1a4.js";
import"./index-mxxxytys.js";
import"./index-23z4zxgg.js";
import"./index-pj501bh1.js";
import"./index-fqgktctx.js";
import"./index-3s8frz9g.js";
import"./index-x48wxx0w.js";
import"./index-adx6khj5.js";
import"./index-trgxvmy6.js";
import"./index-4j3tt0c3.js";
import"./index-sbg6k9q1.js";
import"./index-b88v3vtm.js";
import"./index-py7681h5.js";
import"./index-nd6nynv2.js";
import"./index-7s6dytxy.js";
import"./index-11621h23.js";
import"./index-1gwbassd.js";
import"./index-gm9t95d9.js";
import"./index-1xxnjn0d.js";
import"./index-jsn2tmjz.js";
import"./index-0k2x4nn9.js";
import"./index-d13v9ckt.js";
import"./index-48pz4jpc.js";
import"./index-06c9ctr6.js";
import"./index-4knsp9qj.js";
import"./index-66pshdtx.js";
import"./index-3agn8scn.js";
import"./index-hya40gb2.js";
import"./index-5vwpzb5a.js";
import"./index-x3fthpsc.js";
import"./index-6sw24nvv.js";
import"./index-3rm7cz6h.js";
import"./index-ekpwvbra.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/cli.ts
if (import.meta.main) {
  const { standaloneSupportEnvironment, isUsefulSupportResult, runProductSupportCommand, showProductSupportInvitation } = await import("./support-cfc9tdg2.js");
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
  main
};
