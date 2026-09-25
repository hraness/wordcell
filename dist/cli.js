#!/usr/bin/env bun
// @bun
import {
  main,
  parseArguments,
  runExecutable,
  usage
} from "./index-sda8x0ga.js";
import"./index-bcknqxrq.js";
import"./index-054mb7d3.js";
import"./index-h2qn3y3f.js";
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
import"./index-1r5rnkfr.js";
import"./index-42tb8qqp.js";
import"./index-adx6khj5.js";
import"./index-n57tewfr.js";
import"./index-4j3tt0c3.js";
import"./index-j70m75wd.js";
import"./index-b88v3vtm.js";
import"./index-gtwqye5a.js";
import"./index-qdb8f8va.js";
import"./index-f75zmmdr.js";
import"./index-pz2b2x0y.js";
import"./index-1gwbassd.js";
import"./index-aer0jdrq.js";
import"./index-1xxnjn0d.js";
import"./index-xzvcw9ga.js";
import"./index-8v6k9h4r.js";
import"./index-d13v9ckt.js";
import"./index-48pz4jpc.js";
import"./index-06c9ctr6.js";
import"./index-4knsp9qj.js";
import"./index-66pshdtx.js";
import"./index-23m6bbjt.js";
import"./index-hya40gb2.js";
import"./index-5vwpzb5a.js";
import"./index-x3fthpsc.js";
import"./index-f7fnww7a.js";
import"./index-3rm7cz6h.js";
import"./index-zy7an84p.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/cli.ts
if (import.meta.main) {
  const { standaloneSupportEnvironment, isUsefulSupportResult, runProductSupportCommand, showProductSupportInvitation } = await import("./support-m53p44mx.js");
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
