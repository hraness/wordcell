/// <reference lib="dom" />
/**
 * Captures a real product surface from the live site in dark mode, for a
 * gallery item or a chat card image.
 *   bun site-shot.ts <https-url> <out.png> [--width 1600] [--height 1000] [--click locator]... [--selector css] [--wait ms]
 * Keep the URL, date and selector in story.config.ts next to the image path.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright-core";

import { browserOptions } from "./browser.ts";

const [url, outArg, ...rest] = process.argv.slice(2);
if (!url?.startsWith("https://") || !outArg) throw new Error("usage: site-shot.ts https://url out.png [--width n] [--height n] [--selector css] [--wait ms]");
const opt = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const width = Number(opt("width") ?? 1600), height = Number(opt("height") ?? 1000);
const out = resolve(outArg);
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch(browserOptions());
try {
  const context = await browser.newContext({ colorScheme: "dark", viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
  // Each --click (a Playwright locator such as `role=tab[name="Email"]`) runs in order, to show a state.
  for (const [index, arg] of rest.entries()) {
    if (arg !== "--click") continue;
    await page.locator(rest[index + 1]!).first().click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(Number(opt("wait") ?? 800));
  const selector = opt("selector");
  if (selector) await page.locator(selector).first().screenshot({ path: out });
  else await page.screenshot({ path: out });
  console.log(out);
} finally {
  await browser.close();
}
