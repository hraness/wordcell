import { maybeShowSupportInvitation, runSupportCommand, type SupportCommandOptions } from "@hraness/support-foundation/node";
import { parseArguments } from "./cli-program.js";
import { parseArguments as parseCaptureArguments } from "./clip/args.js";
import { parseUrlMetadataArguments } from "./clip/url-metadata-cli.js";
import { parsePdfArguments } from "./pdf/args.js";
import { supportProfile } from "./support-profile.js";

/** Called only by the standalone executable. Nested children inherit quiet mode. */
export function standaloneSupportEnvironment(): Readonly<Record<string, string | undefined>> {
  const environment = { ...process.env };
  process.env.HRANESS_SUPPORT_AUDIENCE = "off";
  return environment;
}

/** Positive completed-work classification. New command kinds stay quiet by default. */
export function isUsefulSupportResult(args: readonly string[], environment: Readonly<Record<string, string | undefined>>): boolean {
  const parsed = parseArguments(args);
  if (!parsed.ok) return false;
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
      const capture = parseCaptureArguments(command.arguments, environment);
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
      // stdout belongs to JSON-RPC frames, so a long-running server never invites.
      return false;
    default:
      return false;
  }
}

export async function runProductSupportCommand(args: readonly string[], options: SupportCommandOptions = {}): Promise<number> {
  const result = await runSupportCommand(supportProfile, args, { command: ["wordcell"], gitEmail: false, ...options });
  if (result.stdout !== "") process.stdout.write(result.stdout);
  if (result.stderr !== "") process.stderr.write(result.stderr);
  return result.exitCode;
}

export async function showProductSupportInvitation(options: SupportCommandOptions = {}): Promise<void> {
  try {
    await maybeShowSupportInvitation(supportProfile, { command: ["wordcell"], usefulResult: true, gitEmail: false, ...options });
  } catch {
    // Optional support must preserve the completed command's output and exit status.
  }
}
