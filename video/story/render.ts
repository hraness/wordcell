/// <reference lib="dom" />
/**
 * Renders build/scene.html frame by frame on Chrome for Testing or the pinned
 * Playwright Chromium and pipes the frames into a lossless RGB H.264 master.
 *   bun render.ts wide|square|portrait [--from <frame>] [--to <frame>] [--out build/master-<fmt>.mp4]
 * Before each seek the scene is hidden for two animation frames and every node's
 * load-time inline transform, opacity and visibility is restored, so each frame
 * rasterizes as a fresh page load would (sharp text under will-change layers).
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

import { browserOptions } from "./browser.ts";

const args = process.argv.slice(2);
const fmt = args[0];
if (fmt !== "wide" && fmt !== "square" && fmt !== "portrait") throw new Error("usage: render.ts wide|square|portrait [--from n] [--to n] [--out path]");
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i > 0 ? args[i + 1] : undefined; };
const root = process.cwd();
const req = JSON.parse(readFileSync(join(root, "build", `scene-${fmt}.json`), "utf8")) as {
  document: { path: string }; canvas: { width: number; height: number }; timing: { fps: number; durationUs: number };
};
const { width, height } = req.canvas, fps = req.timing.fps;
const total = Math.round((req.timing.durationUs / 1e6) * fps);
const from = Number(opt("from") ?? 0), to = Math.min(Number(opt("to") ?? total), total);
if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= to) throw new Error("Frame range must satisfy 0 <= from < to <= total.");
const out = resolve(root, opt("out") ?? join("build", `master-${fmt}.mp4`));
mkdirSync(dirname(out), { recursive: true });

type FrameWindow = Window & {
  SlopcameraOverlay?: unknown; __ready?: Promise<unknown>; __frame?: (f: { timeMs: number }) => void;
  __init?: Map<HTMLElement | SVGElement, [string, string, string]>;
};
const browser = await chromium.launch(browserOptions());
const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
  "-c:v", "libx264rgb", "-qp", "0", "-preset", "veryfast", "-pix_fmt", "rgb24", "-r", String(fps), "-movflags", "+faststart", "-an", out],
{ stdio: ["pipe", "inherit", "inherit"] });
const ffDone = new Promise<number>((res) => { ff.on("close", (code) => res(code ?? 1)); ff.on("error", () => res(1)); });
ff.stdin.on("error", () => {});
const write = (buf: Buffer) => new Promise<void>((res, rej) => { ff.stdin.write(buf, (error) => (error ? rej(error) : res())); });
let code = 1;
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    const w = window as FrameWindow;
    w.SlopcameraOverlay = { ready(p: Promise<unknown>) { w.__ready = Promise.resolve(p); }, onFrame(cb: (f: { timeMs: number }) => void) { w.__frame = cb; } };
  });
  await page.goto(pathToFileURL(join(root, req.document.path)).href);
  await page.waitForFunction(() => (window as FrameWindow).__ready && (window as FrameWindow).__frame, null, { timeout: 30_000 });
  await page.evaluate(async () => {
    const w = window as FrameWindow;
    await w.__ready; await document.fonts.ready;
    const init = new Map<HTMLElement | SVGElement, [string, string, string]>();
    for (const node of document.getElementById("frame")!.querySelectorAll("*")) {
      if (node instanceof HTMLElement || node instanceof SVGElement) init.set(node, [node.style.transform, node.style.opacity, node.style.visibility]);
    }
    w.__init = init;
  });
  const cdp = await page.context().newCDPSession(page);
  const started = Date.now();
  for (let i = from; i < to; i++) {
    await page.evaluate((ms: number) => new Promise<void>((res) => {
      const w = window as FrameWindow, root = document.getElementById("frame")!;
      const rafs = (n: number, fn: () => void) => (n ? requestAnimationFrame(() => rafs(n - 1, fn)) : fn());
      root.style.display = "none";
      rafs(2, () => {
        for (const [node, [tf, op, vis]] of w.__init!) { node.style.transform = tf; node.style.opacity = op; node.style.visibility = vis; }
        root.style.display = "";
        rafs(2, () => { w.__frame!({ timeMs: ms }); rafs(2, res); });
      });
    }), (i * 1000) / fps);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: false, optimizeForSpeed: true });
    await write(Buffer.from(data, "base64"));
    if ((i - from) % 300 === 0 || i === to - 1) console.error(`${fmt}: frame ${i + 1}/${to} (${((i - from + 1) / ((Date.now() - started) / 1000)).toFixed(1)} fps)`);
  }
  code = 0;
} finally {
  await browser.close().catch(() => {});
  ff.stdin.end();
  const ffc = await ffDone;
  if (ffc !== 0) code = ffc;
}
if (code !== 0) { console.error(`render: failed (${code})`); process.exit(code); }
console.log(JSON.stringify({ fmt, out, width, height, fps, frames: to - from }));
