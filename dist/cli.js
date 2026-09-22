#!/usr/bin/env bun
// @bun
import {
  main,
  parseArguments,
  runExecutable,
  usage
} from "./index-bw2r37z9.js";
import"./index-bcknqxrq.js";
import"./index-054mb7d3.js";
import"./index-bqtqeak3.js";
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
import"./index-9rf81m0p.js";
import"./index-1k595z6v.js";
import"./index-q7tbg07z.js";
import"./index-adx6khj5.js";
import"./index-rr9kzq4n.js";
import"./index-4j3tt0c3.js";
import"./index-j70m75wd.js";
import"./index-b88v3vtm.js";
import"./index-djrcc1yf.js";
import"./index-jk1sgx36.js";
import"./index-xv80vzfp.js";
import"./index-tf4wzjew.js";
import"./index-1gwbassd.js";
import"./index-vnybgywh.js";
import"./index-1xxnjn0d.js";
import"./index-hmw17zaa.js";
import"./index-233z9wmn.js";
import"./index-d13v9ckt.js";
import"./index-48pz4jpc.js";
import"./index-06c9ctr6.js";
import"./index-4knsp9qj.js";
import"./index-66pshdtx.js";
import"./index-3agn8scn.js";
import"./index-hya40gb2.js";
import"./index-5vwpzb5a.js";
import"./index-x3fthpsc.js";
import"./index-ecqpgr5y.js";
import"./index-3rm7cz6h.js";
import"./index-qbssx940.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/cli.ts
if (import.meta.main) {
  const { standaloneSupportEnvironment, isUsefulSupportResult, runProductSupportCommand, showProductSupportInvitation } = await import("./support-p452p9c4.js");
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
