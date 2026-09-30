// @bun
import {
  parseArguments as parseArguments2,
  parseUrlMetadataArguments
} from "./index-3391g0k1.js";
import"./index-5h5awwh4.js";
import {
  parsePdfArguments
} from "./index-m9p2a4mj.js";
import"./index-9paxge84.js";
import"./index-j4zgmzjr.js";
import"./index-npg9z1a4.js";
import"./index-zbv70qmk.js";
import"./index-hacpnaew.js";
import"./index-k86wepd8.js";
import"./index-nd8v7r0z.js";
import"./index-5n05se68.js";
import"./index-8pabwzqg.js";
import"./index-ncwzmsge.js";
import"./index-cd75vky9.js";
import"./index-2gv8y733.js";
import"./index-mxxxytys.js";
import"./index-w2zc0vwa.js";
import"./index-e5fbsywq.js";
import"./index-gh719d91.js";
import {
  parseArguments
} from "./index-byz4kzww.js";
import"./index-23z4zxgg.js";
import"./index-9rf81m0p.js";
import"./index-pj501bh1.js";
import"./index-j2jt49gr.js";
import"./index-9zkba8hr.js";
import"./index-adx6khj5.js";
import"./index-fp732bgg.js";
import"./index-4j3tt0c3.js";
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
import"./index-z1w83f81.js";

// src/support.ts
import { maybeShowSupportInvitation, runSupportCommand } from "@hraness/support-foundation/node";

// src/support-profile.ts
var supportProfile = {
  id: "kb",
  name: "Wordcell",
  valueProposition: "Support ongoing development of Wordcell.",
  updates: false
};

// src/support.ts
function standaloneSupportEnvironment() {
  const environment = { ...process.env };
  process.env.HRANESS_SUPPORT_AUDIENCE = "off";
  return environment;
}
function isUsefulSupportResult(args, environment) {
  const parsed = parseArguments2(args);
  if (!parsed.ok)
    return false;
  const command = parsed.value;
  switch (command.kind) {
    case "init":
    case "refresh":
    case "graph":
    case "graph-rebuild":
    case "graph-query":
    case "backlinks":
    case "links":
    case "catalog":
    case "context":
    case "index":
    case "search":
    case "history":
    case "list":
    case "inbox":
    case "note-create":
    case "relation":
    case "percolate":
    case "portfolio-search":
    case "capture-diff":
      return true;
    case "capture-bundle":
      return command.action === "show";
    case "clip": {
      const capture = parseArguments(command.arguments, environment);
      return capture.ok && (capture.value.command === "capture" || capture.value.command === "inspect") && !capture.value.quiet;
    }
    case "pdf": {
      const pdf = parsePdfArguments(command.arguments, environment);
      return pdf.ok && pdf.value.command === "capture" && !pdf.value.quiet;
    }
    case "url-metadata": {
      const metadata = parseUrlMetadataArguments(command.arguments, environment);
      return metadata.ok && metadata.value.kind === "backfill";
    }
    case "mcp":
      return false;
    default:
      return false;
  }
}
async function runProductSupportCommand(args, options = {}) {
  const result = await runSupportCommand(supportProfile, args, { command: ["wordcell"], gitEmail: false, ...options });
  if (result.stdout !== "")
    process.stdout.write(result.stdout);
  if (result.stderr !== "")
    process.stderr.write(result.stderr);
  return result.exitCode;
}
async function showProductSupportInvitation(options = {}) {
  try {
    await maybeShowSupportInvitation(supportProfile, { command: ["wordcell"], usefulResult: true, gitEmail: false, ...options });
  } catch {}
}
export {
  standaloneSupportEnvironment,
  showProductSupportInvitation,
  runProductSupportCommand,
  isUsefulSupportResult
};
