/// <reference lib="dom" />
/**
 * Reads a live site's dark-mode palette as the browser resolves it, so the film
 * uses the exact tint the site shows in dark mode, whatever palette system the
 * site uses.
 *   bun site-palette.ts https://example.com [--root-selector html]
 * Prints a Palette JSON object for story.config.ts `palette.values`.
 */
import { chromium } from "playwright-core";

import { browserOptions } from "./browser.ts";

const url = process.argv[2];
if (!url?.startsWith("https://")) throw new Error("usage: site-palette.ts https://site");
const tokens = {
  background: ["--background", "--paper"], foreground: ["--foreground", "--ink"], muted: ["--muted", "--muted-foreground"],
  surface: ["--surface", "--card"], surfaceRaised: ["--surface-raised", "--popover", "--surface"], primary: ["--primary", "--accent"],
  primarySoft: ["--primary-soft", "--accent"], primaryForeground: ["--primary-foreground"],
} as const;
const browser = await chromium.launch(browserOptions());
try {
  const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
  const result = await page.evaluate((map) => {
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const hex = (rgb: string) => {
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/u.exec(rgb);
      if (!m) return rgb;
      const to = (v: string) => Math.round(Number(v)).toString(16).padStart(2, "0");
      return `#${to(m[1]!)}${to(m[2]!)}${to(m[3]!)}${m[4] !== undefined && Number(m[4]) < 1 ? to(String(Number(m[4]) * 255)) : ""}`;
    };
    const out: Record<string, string> = {}, used: Record<string, string> = {};
    for (const [key, names] of Object.entries(map)) {
      for (const name of names) {
        if (getComputedStyle(document.documentElement).getPropertyValue(name).trim() === "") continue;
        probe.style.color = `var(${name})`;
        out[key] = hex(getComputedStyle(probe).color); used[key] = name;
        break;
      }
    }
    probe.remove();
    return { palette: out, used, body: hex(getComputedStyle(document.body).backgroundColor), html: hex(getComputedStyle(document.documentElement).backgroundColor) };
  }, tokens);
  console.log(JSON.stringify({ url, readOn: new Date().toISOString().slice(0, 10), ...result }, null, 2));
} finally {
  await browser.close();
}
