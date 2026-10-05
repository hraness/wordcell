import { constants, accessSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium, type LaunchOptions } from "playwright-core";

// Playwright has no public default-arguments API. Read this checkout's pinned
// implementation so its other disabled features survive as one merged switch.
const require = createRequire(import.meta.url);
const playwrightRoot = dirname(require.resolve("playwright-core/package.json"));
const { chromiumSwitches } = require(join(playwrightRoot, "lib/server/chromium/chromiumSwitches.js")) as {
  chromiumSwitches: (assistantMode: boolean, channel?: string, android?: boolean) => string[];
};
const defaultFeatureSwitches = chromiumSwitches(false).filter((arg) => arg.startsWith("--disable-features="));
if (defaultFeatureSwitches.length !== 1) throw new Error("Review Playwright's changed default feature switches before launching the film renderer.");
const disabledFeatures = [...new Set([
  ...defaultFeatureSwitches[0]!.slice("--disable-features=".length).split(","),
  "PaintHolding", "MacAppCodeSignClone",
])];

/** Accept Chrome for Testing or this repository's pinned Playwright Chromium. */
export function browserOptions(): LaunchOptions {
  const requested = process.env.CHROMIUM_EXECUTABLE_PATH ?? chromium.executablePath();
  let executablePath: string;
  try {
    executablePath = realpathSync(requested);
    accessSync(executablePath, constants.X_OK);
  } catch {
    throw new Error(`Browser not found at ${requested}. Install the pinned Playwright Chromium or set CHROMIUM_EXECUTABLE_PATH to Chrome for Testing.`);
  }
  if (/Google Chrome(?: Beta| Canary| Dev)?\.app[/\\]/u.test(executablePath)) {
    throw new Error("The installed auto-updating Google Chrome app is not supported. Use Chrome for Testing or pinned Playwright Chromium.");
  }
  const testing = /(?:Google Chrome for Testing\.app|chrome-for-testing)[/\\]/u.test(executablePath);
  let pinned = false;
  try { pinned = executablePath === realpathSync(chromium.executablePath()); } catch { /* An explicit Chrome for Testing install is sufficient. */ }
  if (!testing && !pinned) throw new Error("CHROMIUM_EXECUTABLE_PATH must select Chrome for Testing or this repository's pinned Playwright Chromium.");
  return {
    executablePath, headless: true,
    ignoreDefaultArgs: defaultFeatureSwitches,
    args: ["--mute-audio", "--hide-scrollbars", `--disable-features=${disabledFeatures.join(",")}`, "--force-color-profile=srgb"],
  };
}
