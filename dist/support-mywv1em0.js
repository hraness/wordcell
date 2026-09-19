// @bun
import {
  parseArguments as parseArguments2,
  parseUrlMetadataArguments
} from "./index-4ag64rc1.js";
import"./index-bcknqxrq.js";
import {
  parsePdfArguments
} from "./index-054mb7d3.js";
import"./index-avbce90h.js";
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
import {
  parseArguments
} from "./index-dfag79p7.js";
import"./index-gh719d91.js";
import"./index-npg9z1a4.js";
import"./index-mxxxytys.js";
import"./index-23z4zxgg.js";
import"./index-pj501bh1.js";
import"./index-9rf81m0p.js";
import"./index-e6p9e926.js";
import"./index-2hf27mws.js";
import"./index-adx6khj5.js";
import"./index-hcw140eb.js";
import"./index-4j3tt0c3.js";
import"./index-j70m75wd.js";
import"./index-b88v3vtm.js";
import"./index-t2bs9xdr.js";
import"./index-nd6nynv2.js";
import"./index-famy7fhs.js";
import"./index-11621h23.js";
import"./index-1gwbassd.js";
import"./index-gm9t95d9.js";
import"./index-1xxnjn0d.js";
import"./index-0dqfnrz9.js";
import"./index-1tm7bgx7.js";
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
import"./index-z1w83f81.js";

// src/support.ts
import { maybeShowSupportInvitation, runSupportCommand } from "@hraness/support-foundation/node";

// src/support-profile.ts
var supportProfile = {
  id: "kb",
  name: "Wordcell",
  valueProposition: "Support ongoing development of inspectable Markdown memory for coding agents.",
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
