import { afterEach, describe, expect, test } from "bun:test";
import fc from "fast-check";
import { createCookieRecordReader } from "./acquire.js";
import { main } from "./cli.js";
import {
  classifyCookieProviderWarnings,
  cookiePermissionNeed,
  cookiePermissionRecovery,
  renderCookiePermissionNotice,
  renderCookiePermissionRecovery,
  setCookiePermissionReporter,
  terminalAppName,
  type CookiePermissionFailure,
} from "./cookie-permission.js";
import type { CaptureOutcome } from "./capture.js";

const PLAIN = { ascii: false, color: false } as const;
const ASCII = { ascii: true, color: false } as const;
const ENV = { LANG: "en_US.UTF-8", TERM_PROGRAM: "Apple_Terminal" } as const;

afterEach(() => setCookiePermissionReporter(undefined));

describe("pre-prompt notices", () => {
  test("keychain notice names security, the key, and Wordcell", () => {
    expect(renderCookiePermissionNotice({ kind: "keychain", browser: "Chrome" }, ENV, PLAIN)).toBe(
      "🔐 macOS will ask to let security use \"Chrome Safe Storage\" from your keychain for Wordcell.\n"
      + "   Wordcell uses it to read the Chrome sign-in you already have and never stores it. "
      + "Enter your Mac password if asked, then choose Always Allow so macOS doesn't ask again.\n",
    );
  });

  test("Safari notice says macOS doesn't ask and names the terminal app", () => {
    expect(renderCookiePermissionNotice({ kind: "full-disk-access", browser: "Safari" }, ENV, PLAIN)).toBe(
      "🔐 Wordcell needs Full Disk Access to read your Safari cookies.\n"
      + "   macOS doesn't ask for this. Turn on Terminal in System Settings › Privacy & Security › Full Disk Access. "
      + "Wordcell reads only the cookies for the page you capture and never stores them.\n",
    );
  });

  test("ASCII fallback replaces the lock", () => {
    expect(renderCookiePermissionNotice({ kind: "keychain", browser: "Brave" }, ENV, ASCII)).toStartWith("NOTE macOS will ask");
  });

  test("needs exist only on macOS and only for guarded sources", () => {
    expect(cookiePermissionNeed("chrome", "darwin")).toEqual({ kind: "keychain", browser: "Chrome" });
    expect(cookiePermissionNeed("edge", "darwin")).toEqual({ kind: "keychain", browser: "Microsoft Edge" });
    expect(cookiePermissionNeed("safari", "darwin")).toEqual({ kind: "full-disk-access", browser: "Safari" });
    expect(cookiePermissionNeed("firefox", "darwin")).toBeUndefined();
    expect(cookiePermissionNeed("chrome", "linux")).toBeUndefined();
  });

  test("terminal app names", () => {
    expect(terminalAppName({ TERM_PROGRAM: "iTerm.app" })).toBe("iTerm");
    expect(terminalAppName({ TERM_PROGRAM: "vscode" })).toBe("Visual Studio Code");
    expect(terminalAppName({})).toBe("your terminal app");
  });
});

describe("classification", () => {
  const keychain = (detail: string) => [`Failed to read macOS Keychain (Chrome Safe Storage): ${detail}`];

  test("cancel and wrong password are denials", () => {
    expect(classifyCookieProviderWarnings(keychain("security: SecKeychainSearchCopyNext: User canceled the operation. (-128)")))
      .toEqual({ kind: "keychain", browser: "Chrome", state: "denied" });
    expect(classifyCookieProviderWarnings(keychain("The user name or passphrase you entered is not correct.")))
      .toEqual({ kind: "keychain", browser: "Chrome", state: "denied" });
  });

  test("a locked keychain is unknown and a missing item is missing", () => {
    expect(classifyCookieProviderWarnings(keychain("User interaction is not allowed. (-25308)")))
      .toEqual({ kind: "keychain", browser: "Chrome", state: "unknown", locked: true });
    expect(classifyCookieProviderWarnings(keychain("The specified item could not be found in the keychain.")))
      .toEqual({ kind: "keychain", browser: "Chrome", state: "missing" });
    expect(classifyCookieProviderWarnings(keychain("exit 1"))).toEqual({ kind: "keychain", browser: "Chrome", state: "unknown" });
    // Sweet Cookie's stderr-less fallback names three causes; it is not a firm denial.
    expect(classifyCookieProviderWarnings(keychain("permission denied / keychain locked / entry missing.")))
      .toEqual({ kind: "keychain", browser: "Chrome", state: "unknown" });
  });

  test("Safari EPERM is a Full Disk Access denial", () => {
    expect(classifyCookieProviderWarnings([
      "Failed to read Safari cookies: EPERM: operation not permitted, open '/Users/x/Library/Cookies/Cookies.binarycookies'",
    ])).toEqual({ kind: "full-disk-access", browser: "Safari", state: "denied" });
    expect(classifyCookieProviderWarnings(["Failed to read Safari cookies: bad magic"])).toBeUndefined();
  });

  test("unknown browsers, foreign shapes, and ordinary warnings are ignored", () => {
    expect(classifyCookieProviderWarnings(["Failed to read macOS Keychain (Evil\u001b[31m Safe Storage): denied"])).toBeUndefined();
    expect(classifyCookieProviderWarnings(["Failed to read macOS Keychain (Netscape Safe Storage): denied"])).toBeUndefined();
    expect(classifyCookieProviderWarnings("denied")).toBeUndefined();
    expect(classifyCookieProviderWarnings([1, null, "No cookies found"])).toBeUndefined();
  });

  test("classification never throws and only returns fixed browser names", () => {
    fc.assert(fc.property(fc.array(fc.string({ maxLength: 200 }), { maxLength: 8 }), (warnings) => {
      const result = classifyCookieProviderWarnings(warnings);
      if (result !== undefined) {
        expect(["Chrome", "Brave", "Arc", "Chromium", "Dia", "Microsoft Edge", "Safari"]).toContain(result.browser);
      }
    }));
  });
});

describe("recovery copy", () => {
  const cases: readonly [CookiePermissionFailure, string][] = [
    [
      { kind: "keychain", browser: "Chrome", state: "denied" },
      "✗ Wordcell can't use \"Chrome Safe Storage\" from your keychain: the keychain request was denied.\n"
      + "  Run it again and choose Always Allow when macOS asks, or pass a cookie file exported from the browser.\n"
      + "→ wordcell clip <url> --cookies-file <path>\n",
    ],
    [
      { kind: "keychain", browser: "Arc", state: "unknown", locked: true },
      "✗ Wordcell couldn't use \"Arc Safe Storage\" from your keychain. macOS may be blocking security.\n"
      + "  Unlock your login keychain, then run it again.\n"
      + "→ wordcell clip <url> --cookies-file <path>\n",
    ],
    [
      { kind: "keychain", browser: "Brave", state: "missing" },
      "✗ Wordcell can't find \"Brave Safe Storage\" in your keychain.\n"
      + "  Open Brave and sign in to the site once, or pass a cookie file exported from the browser.\n"
      + "→ wordcell clip <url> --cookies-file <path>\n",
    ],
    [
      { kind: "full-disk-access", browser: "Safari", state: "denied" },
      "✗ Wordcell can't read your Safari cookies: macOS access is off for Terminal.\n"
      + "  Turn on Terminal in System Settings › Privacy & Security › Full Disk Access, then run it again.\n"
      + "→ open \"x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles\"\n",
    ],
  ];
  for (const [failure, expected] of cases) {
    test(`${failure.kind} ${failure.state}`, () => {
      expect(renderCookiePermissionRecovery(cookiePermissionRecovery(failure, ENV), PLAIN)).toBe(expected);
    });
  }

  test("ASCII fallback", () => {
    const text = renderCookiePermissionRecovery(cookiePermissionRecovery(cases[0]![0], ENV), ASCII);
    expect(text).toStartWith("FAIL Wordcell can't");
    expect(text).toContain("\n-> wordcell clip");
  });
});

describe("cookie reader", () => {
  const selection = {
    cookieSources: ["chrome"] as const,
    cookiesFile: undefined,
    cookieProfile: undefined,
    timeoutMs: 1_000,
  };
  const url = new URL("https://example.com/account");

  test("a keychain denial is reported, never 'no matching cookies'", async () => {
    const failures: CookiePermissionFailure[] = [];
    const notices: string[] = [];
    setCookiePermissionReporter({
      notice: (need) => { notices.push(`${need.kind}:${need.browser}`); return Promise.resolve("continue"); },
      failure: (failure) => failures.push(failure),
    });
    const read = createCookieRecordReader(() => Promise.resolve({
      cookies: [],
      warnings: ["Failed to read macOS Keychain (Chrome Safe Storage): User canceled the operation. (-128)"],
    }));
    const error = await read(selection, url).then(() => undefined, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("no matching cookies");
    expect((error as Error).message).toContain("the keychain request was denied");
    if (process.platform === "darwin") expect(notices).toEqual(["keychain:Chrome"]);
    expect(failures).toEqual([{ kind: "keychain", browser: "Chrome", state: "denied" }]);
  });

  test("the notice is shown once per browser and a skip stops before the keychain", async () => {
    if (process.platform !== "darwin") return;
    let notices = 0;
    let probes = 0;
    setCookiePermissionReporter({
      notice: () => { notices += 1; return Promise.resolve("skip"); },
      failure: () => undefined,
    });
    const read = createCookieRecordReader(() => { probes += 1; return Promise.resolve({ cookies: [], warnings: [] }); });
    await expect(read(selection, url)).rejects.toThrow("reading browser cookies was skipped");
    expect(probes).toBe(0);
    await read(selection, url).catch(() => undefined);
    expect(notices).toBe(1);
  });

  test("concurrent readers share one answer, so a skip stops both before the keychain", async () => {
    if (process.platform !== "darwin") return;
    let notices = 0;
    let probes = 0;
    let answer: (value: "continue" | "skip") => void = () => undefined;
    setCookiePermissionReporter({
      notice: () => {
        notices += 1;
        return new Promise((resolve) => { answer = resolve; });
      },
      failure: () => undefined,
    });
    const read = createCookieRecordReader(() => { probes += 1; return Promise.resolve({ cookies: [], warnings: [] }); });
    const first = read(selection, url).then(() => "read", (error: unknown) => String(error));
    const second = read(selection, url).then(() => "read", (error: unknown) => String(error));
    await Promise.resolve();
    answer("skip");
    expect(await first).toContain("skipped");
    expect(await second).toContain("skipped");
    expect(notices).toBe(1);
    expect(probes).toBe(0);
  });

  test("without a reporter, library reads stay quiet", async () => {
    const read = createCookieRecordReader(() => Promise.resolve({ cookies: [], warnings: [] }));
    await expect(read(selection, url)).rejects.toThrow("no matching cookies");
  });
});

describe("clip CLI", () => {
  function capture() {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return { stdout, stderr, output: { stdout: (v: string) => { stdout.push(v); }, stderr: (v: string) => { stderr.push(v); } } };
  }
  const deniedCapture = async (): Promise<CaptureOutcome> => {
    const read = createCookieRecordReader(() => Promise.resolve({
      cookies: [],
      warnings: ["Failed to read macOS Keychain (Chrome Safe Storage): User canceled the operation. (-128)"],
    }));
    await read({ cookieSources: ["chrome"], cookiesFile: undefined, cookieProfile: undefined, timeoutMs: 1_000 }, new URL("https://example.com/"));
    throw new Error("unreachable");
  };
  const args = ["https://example.com/", "--cookie-source", "chrome", "--stdout"];

  test("a person sees the notice, the confirm line, and the recovery", async () => {
    const io = capture();
    const code = await main(args, { ...ENV, HRANESS_AUDIENCE: "human" }, io.output, {
      runCapture: deniedCapture,
      confirmPermission: () => Promise.resolve("continue"),
      stderrIsTerminal: true,
    });
    expect(code).toBe(1);
    const stderr = io.stderr.join("");
    if (process.platform === "darwin") {
      expect(stderr).toContain("🔐 macOS will ask to let security use \"Chrome Safe Storage\" from your keychain for Wordcell.\n");
      expect(stderr).toContain("   Press Enter to continue · s to skip\n");
    }
    expect(stderr).toEndWith(
      "✗ Wordcell can't use \"Chrome Safe Storage\" from your keychain: the keychain request was denied.\n"
      + "  Run it again and choose Always Allow when macOS asks, or pass a cookie file exported from the browser.\n"
      + "→ wordcell clip <url> --cookies-file <path>\n",
    );
  });

  test("--json prints the permission error object and no notice", async () => {
    const io = capture();
    const code = await main([...args.slice(0, 3), "--json"], { ...ENV, HRANESS_AUDIENCE: "human" }, io.output, {
      runCapture: deniedCapture,
      stderrIsTerminal: true,
    });
    expect(code).toBe(1);
    expect(io.stderr.join("")).not.toContain("macOS will ask");
    expect(JSON.parse(io.stdout.join(""))).toEqual({
      ok: false,
      error: "Wordcell can't use \"Chrome Safe Storage\" from your keychain: the keychain request was denied.",
      code: "permission-denied",
      next: "wordcell clip <url> --cookies-file <path>",
      permission: { kind: "keychain" },
    });
  });

  test("an unrelated failure after a cookie denial keeps its own message", async () => {
    const io = capture();
    const code = await main(args, { ...ENV, HRANESS_AUDIENCE: "human" }, io.output, {
      runCapture: async () => {
        await deniedCapture().catch(() => undefined);
        throw new Error("could not write the clip: disk full");
      },
      confirmPermission: () => Promise.resolve("continue"),
      stderrIsTerminal: true,
    });
    expect(code).toBe(1);
    const stderr = io.stderr.join("");
    expect(stderr).toContain("✗ could not write the clip: disk full\n");
    expect(stderr).not.toContain("keychain request was denied");
  });

  test("an agent or a pipe gets no notice and no confirm", async () => {
    for (const env of [{ ...ENV, CLAUDECODE: "1" }, ENV]) {
      const io = capture();
      let asked = false;
      await main(args, env, io.output, {
        runCapture: deniedCapture,
        confirmPermission: () => { asked = true; return Promise.resolve("continue"); },
        stderrIsTerminal: env === ENV ? false : true,
      });
      expect(asked).toBe(false);
      expect(io.stderr.join("")).not.toContain("macOS will ask");
    }
  });
});
