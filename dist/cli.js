#!/usr/bin/env bun
// @bun
import {
  describeUsageError,
  main,
  parseArguments,
  runExecutable,
  usage
} from "./index-pf763jcq.js";
import"./index-b40e2dkx.js";
import"./index-vk6es4nx.js";
import"./index-3hts6yy9.js";
import"./index-8djdwjjd.js";
import"./index-xn5q4kne.js";
import"./index-58azscg5.js";
import"./index-fd8j527z.js";
import"./index-h2w7syy2.js";
import"./index-sp43012q.js";
import"./index-hnvx7m1j.js";
import"./index-t4hjm1kk.js";
import"./index-nwdzhj1h.js";
import"./index-jbtyp6q5.js";
import"./index-2gv8y733.js";
import"./index-g63d3937.js";
import"./index-e2wstc7t.js";
import"./index-w2zc0vwa.js";
import"./index-e5fbsywq.js";
import"./index-gh719d91.js";
import"./index-byz4kzww.js";
import"./index-23z4zxgg.js";
import"./index-pn14a2m5.js";
import"./index-pbz3qw1s.js";
import"./index-pj501bh1.js";
import"./index-yatn62qq.js";
import"./index-7bqwzjba.js";
import"./index-4j3tt0c3.js";
import"./index-adx6khj5.js";
import"./index-fp732bgg.js";
import"./index-wqx1x32f.js";
import"./index-3gc2yk4k.js";
import"./index-pgtm2nhf.js";
import"./index-bdwcjvr4.js";
import"./index-j70m75wd.js";
import"./index-b88v3vtm.js";
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
async function runStandaloneCli(args = process.argv.slice(2)) {
  const { standaloneSupportEnvironment, isUsefulSupportResult, runProductSupportCommand, showProductSupportInvitation } = await import("./support-dfymmqzq.js");
  const env = standaloneSupportEnvironment();
  if (args[0] === "support") {
    return await runProductSupportCommand(args.slice(1), { env });
  } else {
    const exitCode = await runExecutable(args);
    if (exitCode === 0 && isUsefulSupportResult(args, env))
      await showProductSupportInvitation({ env });
    return exitCode;
  }
}
if (import.meta.main)
  process.exitCode = await runStandaloneCli();
export {
  usage,
  runStandaloneCli,
  runExecutable,
  parseArguments,
  main,
  describeUsageError
};
