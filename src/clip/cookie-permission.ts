/**
 * What a person sees before and after macOS guards a browser cookie source:
 * the keychain prompt for Chromium browsers' "Safe Storage" key, and Full
 * Disk Access for Safari's cookie file.
 *
 * TODO(df-0.8): use CHROME_SAFE_STORAGE, renderNotice, and renderRecovery from
 * @hraness/desktop-foundation's permissions kit once 0.8.0 is released. The
 * copy below follows that kit's templates (SPEC § D, "Copy templates").
 */

import { symbol, type TerminalEnvironment, type TerminalStyle } from "../cli-style.js";

export const PRODUCT = "Wordcell";
export const KEYCHAIN_REQUESTER = "security";
export const FULL_DISK_ACCESS_PATH = "System Settings › Privacy & Security › Full Disk Access";
export const FULL_DISK_ACCESS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

/** The Chromium browsers whose cookie key lives in the macOS keychain, by keychain label. */
const KEYCHAIN_BROWSERS = ["Chrome", "Brave", "Arc", "Chromium", "Dia", "Microsoft Edge"] as const;
export type KeychainBrowser = (typeof KEYCHAIN_BROWSERS)[number];

export type CookiePermissionNeed =
  | { readonly kind: "keychain"; readonly browser: KeychainBrowser }
  | { readonly kind: "full-disk-access"; readonly browser: "Safari" };

export type CookiePermissionState = "denied" | "unknown" | "missing";

export type CookiePermissionFailure = CookiePermissionNeed & {
  readonly state: CookiePermissionState;
  /** Keychain only: the login keychain is locked, so macOS could not ask. */
  readonly locked?: boolean;
};

/** Map a `--cookie-source` value to the browser whose keychain key it reads. */
export function keychainBrowserFor(source: string): KeychainBrowser | undefined {
  switch (source) {
    case "chrome": return "Chrome";
    case "brave": return "Brave";
    case "arc": return "Arc";
    case "chromium": return "Chromium";
    case "edge": return "Microsoft Edge";
    default: return undefined;
  }
}

/** The permission a cookie source needs on macOS, if any. */
export function cookiePermissionNeed(source: string, platform: string = process.platform): CookiePermissionNeed | undefined {
  if (platform !== "darwin") return undefined;
  if (source === "safari") return { kind: "full-disk-access", browser: "Safari" };
  const browser = keychainBrowserFor(source);
  return browser === undefined ? undefined : { kind: "keychain", browser };
}

const KEYCHAIN_WARNING = /^Failed to read macOS Keychain \(([A-Za-z ]{1,40}) Safe Storage\): ([\s\S]{0,2000})$/u;
const SAFARI_WARNING = /^Failed to read Safari cookies: ([\s\S]{0,2000})$/u;

/**
 * Classify a cookie provider's warnings as a permission failure. Only fixed
 * facts leave this function: the browser comes from a closed list and the
 * warning text itself is never retained.
 */
export function classifyCookieProviderWarnings(warnings: unknown): CookiePermissionFailure | undefined {
  if (!Array.isArray(warnings)) return undefined;
  for (const warning of warnings.slice(0, 64)) {
    if (typeof warning !== "string") continue;
    const keychain = KEYCHAIN_WARNING.exec(warning);
    if (keychain !== null) {
      const browser = KEYCHAIN_BROWSERS.find((name) => name === keychain[1]);
      if (browser === undefined) continue;
      return { kind: "keychain", browser, ...keychainState(keychain[2] ?? "") };
    }
    const safari = SAFARI_WARNING.exec(warning);
    if (safari !== null && /\b(?:EPERM|EACCES)\b|operation not permitted|permission denied/iu.test(safari[1] ?? "")) {
      return { kind: "full-disk-access", browser: "Safari", state: "denied" };
    }
  }
  return undefined;
}

/**
 * `security find-generic-password` failures: a cancel (-128) or a wrong
 * password (-25293) is a denial, a locked keychain with no UI (-25308) is
 * unknown, and a missing item (-25300) means the browser never made its key.
 */
function keychainState(detail: string): { readonly state: CookiePermissionState; readonly locked?: boolean } {
  if (/-25300\b|could not be found/iu.test(detail)) return { state: "missing" };
  if (/-25308\b|interaction is not allowed/iu.test(detail)) return { state: "unknown", locked: true };
  // Sweet Cookie's stderr-less fallback ("permission denied / keychain locked /
  // entry missing.") names three causes, so only a specific status is a denial.
  if (/-128\b|-25293\b|canceled|cancelled|passphrase you entered is not correct/iu.test(detail)) {
    return { state: "denied" };
  }
  return { state: "unknown" };
}

/** The terminal app that asks for Full Disk Access on the person's behalf. */
export function terminalAppName(env: TerminalEnvironment): string {
  switch (env.TERM_PROGRAM) {
    case "Apple_Terminal": return "Terminal";
    case "iTerm.app": return "iTerm";
    case "vscode": return "Visual Studio Code";
    case "WezTerm": return "WezTerm";
    case "ghostty": return "Ghostty";
    case "WarpTerminal": return "Warp";
    case "zed": return "Zed";
    default: return "your terminal app";
  }
}

function keychainAsk(browser: KeychainBrowser): string {
  return `use "${browser} Safe Storage" from your keychain`;
}

/**
 * The pre-prompt printed before Wordcell reads a guarded cookie source. The
 * confirm line is added by the caller only when stdin and stderr are terminals.
 */
export function renderCookiePermissionNotice(
  need: CookiePermissionNeed,
  env: TerminalEnvironment,
  style: TerminalStyle,
): string {
  const icon = symbol("notice", style);
  if (need.kind === "keychain") {
    return `${icon} macOS will ask to let ${KEYCHAIN_REQUESTER} ${keychainAsk(need.browser)} for ${PRODUCT}.\n`
      + `   ${PRODUCT} uses it to read the ${need.browser} sign-in you already have and never stores it. `
      + "Enter your Mac password if asked, then choose Always Allow so macOS doesn't ask again.\n";
  }
  const requester = terminalAppName(env);
  return `${icon} ${PRODUCT} needs Full Disk Access to read your Safari cookies.\n`
    + `   macOS doesn't ask for this. Turn on ${requester} in ${FULL_DISK_ACCESS_PATH}. `
    + `${PRODUCT} reads only the cookies for the page you capture and never stores them.\n`;
}

export const CONFIRM_LINE = "   Press Enter to continue · s to skip\n";

export type CookiePermissionRecovery = {
  /** The first line after the failure symbol. */
  readonly message: string;
  /** The indented line that says how to fix it. */
  readonly detail: string;
  /** Exactly one next command. */
  readonly next: string;
  readonly code: "permission-denied" | "permission-unknown" | "permission-missing";
  readonly permission: { readonly kind: CookiePermissionNeed["kind"]; readonly settingsUrl?: string };
};

const COOKIES_FILE_NEXT = "wordcell clip <url> --cookies-file <path>";

/** Recovery copy for a failed guarded cookie read. */
export function cookiePermissionRecovery(
  failure: CookiePermissionFailure,
  env: TerminalEnvironment,
): CookiePermissionRecovery {
  if (failure.kind === "full-disk-access") {
    const requester = terminalAppName(env);
    return {
      message: `${PRODUCT} can't read your Safari cookies: macOS access is off for ${requester}.`,
      detail: `Turn on ${requester} in ${FULL_DISK_ACCESS_PATH}, then run it again.`,
      next: `open "${FULL_DISK_ACCESS_URL}"`,
      code: "permission-denied",
      permission: { kind: "full-disk-access", settingsUrl: FULL_DISK_ACCESS_URL },
    };
  }
  const ask = keychainAsk(failure.browser);
  switch (failure.state) {
    case "denied":
      return {
        message: `${PRODUCT} can't ${ask}: the keychain request was denied.`,
        detail: "Run it again and choose Always Allow when macOS asks, or pass a cookie file exported from the browser.",
        next: COOKIES_FILE_NEXT,
        code: "permission-denied",
        permission: { kind: "keychain" },
      };
    case "missing":
      return {
        message: `${PRODUCT} can't find "${failure.browser} Safe Storage" in your keychain.`,
        detail: `Open ${failure.browser} and sign in to the site once, or pass a cookie file exported from the browser.`,
        next: COOKIES_FILE_NEXT,
        code: "permission-missing",
        permission: { kind: "keychain" },
      };
    case "unknown":
      return {
        message: `${PRODUCT} couldn't ${ask}. macOS may be blocking ${KEYCHAIN_REQUESTER}.`,
        detail: failure.locked === true
          ? "Unlock your login keychain, then run it again."
          : "Check the key in Keychain Access, then run it again.",
        next: COOKIES_FILE_NEXT,
        code: "permission-unknown",
        permission: { kind: "keychain" },
      };
  }
}

/** The three-line human recovery: what happened, how to fix it, one next command. */
export function renderCookiePermissionRecovery(recovery: CookiePermissionRecovery, style: TerminalStyle): string {
  return `${symbol("fail", style)} ${recovery.message}\n  ${recovery.detail}\n${symbol("next", style)} ${recovery.next}\n`;
}

/**
 * What the CLI registers so library capture stays quiet: `notice` runs once
 * per need before the guarded read and may decline it; `failure` records a
 * classified failure for the final error.
 */
export type CookiePermissionReporter = {
  readonly notice: (need: CookiePermissionNeed) => Promise<"continue" | "skip">;
  readonly failure: (failure: CookiePermissionFailure) => void;
};

let reporter: CookiePermissionReporter | undefined;
const answers = new Map<string, Promise<"continue" | "skip">>();

export function setCookiePermissionReporter(next: CookiePermissionReporter | undefined): void {
  reporter = next;
  answers.clear();
}

/**
 * Show the pre-prompt for each need once per run. Capture lanes read cookies
 * concurrently, so every caller waits on the same answer and a skip stops them
 * all. Resolves false when the person skipped.
 */
export async function announceCookiePermissions(needs: readonly CookiePermissionNeed[]): Promise<boolean> {
  const current = reporter;
  if (current === undefined) return true;
  for (const need of needs) {
    const key = `${need.kind}:${need.browser}`;
    let answer = answers.get(key);
    if (answer === undefined) {
      answer = current.notice(need);
      answers.set(key, answer);
    }
    if (await answer === "skip") return false;
  }
  return true;
}

export function reportCookiePermissionFailure(failure: CookiePermissionFailure): void {
  reporter?.failure(failure);
}
