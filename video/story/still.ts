/// <reference lib="dom" />
/**
 * Renders review stills and one JPEG contact sheet per format.
 *   bun still.ts wide|square|portrait [t1 t2 ...]
 * With no times it takes the middle of every act and the end card from
 * build/timeline.json. Stills go to frames/<fmt>-<t>.png and the sheet to
 * frames/<fmt>-sheet.jpg (ImageMagick `montage`).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

import { browserOptions } from "./browser.ts";

const [fmt, ...given] = process.argv.slice(2);
const sizes = { wide: [1920, 1080], square: [1080, 1080], portrait: [1080, 1920] } as const;
if (fmt !== "wide" && fmt !== "square" && fmt !== "portrait") throw new Error("usage: still.ts wide|square|portrait [t ...]");
const root = process.cwd();
const timeline = JSON.parse(readFileSync(join(root, "build/timeline.json"), "utf8")) as { stills: number[]; seconds: number };
const times = given.length ? given.map(Number) : timeline.stills;
const [width, height] = sizes[fmt];
const outDir = join(root, "frames");
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch(browserOptions());
const files: string[] = [];
try {
  for (const t of times) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const url = pathToFileURL(join(root, "build/scene.html")); url.searchParams.set("t", String(t));
    await page.goto(url.href);
    await page.waitForFunction(() => document.title === "ready", null, { timeout: 30_000 });
    const file = join(outDir, `${fmt}-${t}.png`);
    await page.screenshot({ path: file }); await page.close();
    files.push(file);
  }
} finally {
  await browser.close();
}
const cols = fmt === "wide" ? 3 : 4, tw = fmt === "wide" ? 640 : fmt === "square" ? 480 : 360, th = Math.round((tw * height) / width);
const sheet = join(outDir, `${fmt}-sheet.jpg`);
execFileSync("montage", [...files, "-tile", `${cols}x`, "-geometry", `${tw}x${th}+2+2`, "-background", "#000", "-depth", "8", "-quality", "86", sheet]);
console.log(sheet);
