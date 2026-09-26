#!/usr/bin/env bun
/** Generic, bounded, authenticated-when-explicit web capture CLI. */
import { parseArguments, usage, type CliArguments } from "./args.js";
import { runCapture, type CaptureOutcome } from "./capture.js";
import {
  adapterCapabilities,
  inspectClipEnvironment,
  renderAdapterCapabilities,
  renderDoctorReport,
} from "./doctor.js";
import { redactSensitiveText } from "./persist.js";
import { detectAudience, renderFailure, sentence, stderrStyle, terminalOutput, writesToTerminal } from "../cli-style.js";
import {
  CONFIRM_LINE,
  cookiePermissionRecovery,
  renderCookiePermissionNotice,
  renderCookiePermissionRecovery,
  setCookiePermissionReporter,
  type CookiePermissionFailure,
} from "./cookie-permission.js";
import { sanitizeTerminalLine, sanitizeTerminalText } from "./terminal.js";

type Output = {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
};

const defaultOutput: Output = terminalOutput({
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
});

function line(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function safe(value: string): string {
  return sanitizeTerminalLine(redactSensitiveText(value));
}

function redacted(value: string): string {
  return redactSensitiveText(value);
}

function terminalSafeJson(value: unknown): string {
  return `${JSON.stringify(
    value,
    (_key, candidate: unknown) => typeof candidate === "string" ? sanitizeTerminalText(candidate) : candidate,
    2,
  )}\n`;
}

type CliDependencies = {
  readonly runCapture?: typeof runCapture;
  readonly inspectClipEnvironment?: typeof inspectClipEnvironment;
  /** Ask whether to continue past a permission notice; present only when stdin and stderr are terminals. */
  readonly confirmPermission?: () => Promise<"continue" | "skip">;
  /** Whether the person is at a terminal on stderr; defaults to the real stderr. */
  readonly stderrIsTerminal?: boolean;
};

const CONFIRM_TIMEOUT_MS = 120_000;

/** Read one line from a terminal: Enter continues, `s` skips, and silence skips after two minutes. */
async function confirmFromTerminal(): Promise<"continue" | "skip"> {
  const reader = Bun.stdin.stream().getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"skip">((resolve) => {
      timer = setTimeout(() => resolve("skip"), CONFIRM_TIMEOUT_MS);
    });
    const answer = reader.read().then(({ value }) => {
      const text = value === undefined ? "" : new TextDecoder().decode(value).trim().toLowerCase();
      return text === "s" || text === "skip" ? "skip" as const : "continue" as const;
    });
    return await Promise.race([answer, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // A read still pending after the timeout must not keep stdin open.
    await reader.cancel().catch(() => undefined);
  }
}

export type ClipRuntimeOptions = {
  /** Trusted embedding hint; never parsed from public CLI arguments. */
  readonly ownedBrowserProfile?: {
    readonly path: string;
    readonly profileDirectory?: "Default";
  };
  /** Trusted embedding hint; never parsed from public CLI arguments. */
  readonly browserExecutable?: string;
};

export function captureSummary(outcome: CaptureOutcome): Record<string, unknown> {
  return {
    ok: captureSucceeded(outcome),
    status: outcome.status,
    sourceUrl: redacted(outcome.sourceUrl),
    canonicalUrl: redacted(outcome.canonicalUrl),
    platform: outcome.platform,
    scope: outcome.scope,
    slug: outcome.slug,
    acquisitionMethod: outcome.acquisitionMethod,
    extractor: outcome.extractor,
    wordCount: outcome.wordCount,
    capturedItems: outcome.capturedItems,
    expectedItems: outcome.expectedItems,
    outputDirectory: outcome.outputDirectory,
    markdownPath: outcome.markdownPath,
    assetCount: outcome.assetCount,
    warnings: outcome.warnings.map((warning) => redacted(warning)),
    attempts: outcome.attempts.map((attempt) => ({ ...attempt, message: redacted(attempt.message) })),
    manifest: outcome.manifest,
  };
}

export function captureSucceeded(outcome: CaptureOutcome): boolean {
  return outcome.status === "complete" || outcome.status === "partial";
}

export function captureExitCode(outcome: CaptureOutcome): number {
  return captureSucceeded(outcome) ? 0 : 3;
}

async function diagnosticCommand(
  arguments_: Extract<CliArguments, { readonly command: "doctor" }>,
  output: Output,
  inspectEnvironment: typeof inspectClipEnvironment,
): Promise<number> {
  const report = await inspectEnvironment();
  output.stdout(arguments_.json
    ? terminalSafeJson(report)
    : sanitizeTerminalText(renderDoctorReport(report)));
  const requiredReady = report.bun.status === "ready"
    && report.dependencies.every(({ status }) => status === "ready");
  return requiredReady ? 0 : 4;
}

/** CLI entry point, split out so argument and output behavior can be forward-tested. */
export async function main(
  rawArguments: readonly string[] = process.argv.slice(2),
  environment: Readonly<Record<string, string | undefined>> = process.env,
  output: Output = defaultOutput,
  dependencies: CliDependencies = {},
  runtimeOptions: ClipRuntimeOptions = {},
): Promise<number> {
  const parsed = parseArguments(rawArguments, environment);
  if (!parsed.ok) {
    const first = rawArguments[0];
    const next = first === "doctor" || first === "adapters" || first === "inspect" ? `wordcell ${first} --help` : "wordcell clip --help";
    output.stderr(renderFailure(sentence(safe(parsed.message)), next, stderrStyle(environment, output)));
    return 2;
  }
  const arguments_ = parsed.value;
  if (arguments_.command === "help") {
    output.stdout(sanitizeTerminalText(usage));
    return 0;
  }
  if (arguments_.command === "doctor") {
    return diagnosticCommand(arguments_, output, dependencies.inspectClipEnvironment ?? inspectClipEnvironment);
  }
  if (arguments_.command === "adapters") {
    output.stdout(arguments_.json
      ? terminalSafeJson({ schemaVersion: 1, adapters: adapterCapabilities })
      : sanitizeTerminalText(renderAdapterCapabilities()));
    return 0;
  }

  const onTerminal = dependencies.stderrIsTerminal ?? writesToTerminal(output);
  const human = !arguments_.json && detectAudience(environment, onTerminal) === "human";
  let permissionFailure: CookiePermissionFailure | undefined;
  setCookiePermissionReporter({
    notice: async (need) => {
      if (!human || arguments_.quiet) return "continue";
      output.stderr(renderCookiePermissionNotice(need, environment, stderrStyle(environment, output)));
      const confirm = dependencies.confirmPermission
        ?? (onTerminal && process.stdin.isTTY === true ? confirmFromTerminal : undefined);
      if (confirm === undefined) return "continue";
      output.stderr(CONFIRM_LINE);
      return await confirm();
    },
    failure: (failure) => {
      permissionFailure ??= failure;
    },
  });

  if (!arguments_.quiet && !arguments_.json) {
    const target = arguments_.currentTab ? "the current browser tab" : safe(arguments_.url?.href ?? "current");
    output.stderr(`Capturing ${target} (${arguments_.mode}, ${arguments_.scope}) ...\n`);
  }
  try {
    if (
      runtimeOptions.ownedBrowserProfile !== undefined
      && arguments_.browserProfile !== runtimeOptions.ownedBrowserProfile.path
    ) {
      throw new Error("owned browser-profile execution does not match the selected private profile path");
    }
    const captureArguments = runtimeOptions.ownedBrowserProfile === undefined
      ? {
          ...arguments_,
          ...(runtimeOptions.browserExecutable === undefined
            ? {}
            : { browserExecutable: runtimeOptions.browserExecutable }),
        }
      : {
          ...arguments_,
          browserProfileOwnership: "owned" as const,
          ...(runtimeOptions.browserExecutable === undefined
            ? {}
            : { browserExecutable: runtimeOptions.browserExecutable }),
          ...(runtimeOptions.ownedBrowserProfile.profileDirectory === undefined
            ? {}
            : { browserProfileDirectory: runtimeOptions.ownedBrowserProfile.profileDirectory }),
        };
    const outcome = await (dependencies.runCapture ?? runCapture)(captureArguments);
    if (arguments_.json) {
      output.stdout(terminalSafeJson(captureSummary(outcome)));
    } else if (arguments_.stdout) {
      output.stdout(sanitizeTerminalText(outcome.markdown));
    } else {
      output.stdout(line(safe(`Done: ${outcome.markdownPath ?? outcome.outputDirectory ?? outcome.slug}`)));
      output.stdout(line(safe(`Status: ${outcome.status}; ${outcome.wordCount} words; ${outcome.capturedItems}${outcome.expectedItems === null ? "" : `/${outcome.expectedItems}`} items; ${outcome.assetCount} assets.`)));
    }
    if (!arguments_.quiet && outcome.warnings.length > 0) {
      for (const warning of outcome.warnings) output.stderr(`warning: ${safe(warning)}\n`);
    }
    return captureExitCode(outcome);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const recovery = permissionFailure === undefined
      ? undefined
      : cookiePermissionRecovery(permissionFailure, environment);
    // Use the permission copy only when the capture failed because of it: the
    // cookie reader's own message is in the failure. Any other error wins.
    if (recovery !== undefined && raw.includes(recovery.message)) {
      if (arguments_.json) {
        output.stdout(terminalSafeJson({
          ok: false,
          error: recovery.message,
          code: recovery.code,
          next: recovery.next,
          permission: recovery.permission,
        }));
      } else {
        output.stderr(renderCookiePermissionRecovery(recovery, stderrStyle(environment, output)));
      }
      return 1;
    }
    const message = safe(raw);
    if (arguments_.json) output.stdout(terminalSafeJson({ ok: false, error: message }));
    else output.stderr(renderFailure(message, "wordcell doctor", stderrStyle(environment, output)));
    return 1;
  } finally {
    setCookiePermissionReporter(undefined);
  }
}

if (import.meta.main) process.exitCode = await main();
