import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const production = process.argv.includes("--production");
assert.ok(process.argv.slice(2).every(argument => argument === "--production"), "Unknown argument");
const config = JSON.parse(await readFile(resolve(root, "scripts/public-site-browser.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, ".next/prerender-manifest.json"), "utf8"));
const allowed = route => config.prefixes.some(prefix => prefix === "*" || route === prefix || (prefix !== "/" && route.startsWith(prefix + "/")));
const routes = [...new Set([...config.routes, ...Object.keys(manifest.routes).filter(route => allowed(route) && !route.includes("[") && !route.startsWith("/_") && !route.startsWith("/api/") && !/\.[a-z0-9]+$/iu.test(route) && !/\/(opengraph-image|twitter-image|icon|apple-icon)(\/|$)/u.test(route))])].sort();
assert.ok(routes.includes("/") && routes.every(route => route.startsWith("/") && !route.startsWith("//")), "Invalid public route inventory");
assert.ok(routes.length <= 2500, "Unexpectedly large public route inventory");
const artifacts = resolve(process.env.SITE_BROWSER_ARTIFACTS ?? "/tmp/public-site-browser");
await mkdir(artifacts, { recursive: true });
let origin = config.origin;
assert.match(origin, /^https:\/\/[a-z0-9.-]+$/u);
let server;
let exited;
let output = "";
let browser;
const results = [];
let failure;
try {
  if (!production) {
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((resolveClose, reject) => reservation.close(error => error ? reject(error) : resolveClose()));
    origin = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    exited = new Promise((resolveExit, reject) => { server.once("exit", resolveExit); server.once("error", reject); });
    // Keep diagnostics bounded while draining both pipes.
    for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { output = (output + chunk).slice(-32_768); });
    const deadline = Date.now() + 45_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Next exited: ${output}`);
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(2_000) })).ok) { ready = true; break; } } catch { /* Wait for our server to bind. */ }
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    assert.ok(ready, `Next did not become ready: ${output}`);
  }
  browser = await chromium.launch();
  for (const width of [360, 390, 1440]) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height: width === 360 ? 740 : width === 390 ? 844 : 900 }, colorScheme: theme });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      for (const route of routes) {
        const response = await page.goto(origin + route);
        assert.equal(response?.status(), 200, route);
        await page.locator("main").waitFor();
        await page.evaluate(() => document.fonts.ready);
        const state = await page.evaluate(() => {
          const footer = document.querySelector("#hraness-site-footer");
          return {
            overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, document.querySelector("main")?.getBoundingClientRect().right ?? 0) > innerWidth + 1,
            viewportWidth: innerWidth,
            bodyWidth: document.body.scrollWidth,
            heading: document.querySelector("h1")?.textContent?.trim(),
            theme: document.documentElement.dataset.theme,
            footerPositions: [footer, footer?.querySelector(".hraness-site-footer__inner")].map(element => element ? getComputedStyle(element).position : null),
            smallHeaderTargets: innerWidth > 600 ? [] : [...document.querySelectorAll("header a, header button, header summary")].filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && (box.width < 43.5 || box.height < 43.5); }).map(element => ({ label: element.textContent?.trim() || element.getAttribute("aria-label"), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
          };
        });
        const name = `${width}-${theme}-${route === "/" ? "home" : route.slice(1).replaceAll("/", "_")}`;
        const screenshot = await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true, animations: "disabled" });
        const screenshotWidth = screenshot.readUInt32BE(16);
        await writeFile(resolve(artifacts, `${name}.json`), JSON.stringify({ route, state, screenshotWidth, errors }, null, 2));
        assert.equal(screenshotWidth, width, `${route}: full-page screenshot width`);
        assert.ok(!state.overflow, `${route}: horizontal overflow at ${width}`);
        assert.ok(state.heading || config.minimalRoutes?.includes(route), `${route}: missing heading`);
        assert.equal(state.theme, config.forcedTheme ?? theme, `${route}: system appearance`);
        assert.ok(state.footerPositions.every(position => position === null || position === "static" || position === "relative"), `${route}: footer not in normal flow`);
        assert.ok(state.footerPositions[0] || config.minimalRoutes?.includes(route), `${route}: footer missing`);
        assert.deepEqual(state.smallHeaderTargets, [], `${route}: phone targets below 44px`);
        assert.deepEqual(errors, [], `${route}: browser errors`);
        results.push({ route, width, theme });
      }
      await page.goto(origin);
      const targetTheme = config.forcedTheme ?? (theme === "light" ? "dark" : "light");
      if (config.appearance !== "forced") {
        const trigger = config.appearance === "palette" ? "summary" : "button";
        await page.locator(`[data-hraness-appearance-menu][data-ready="true"] ${trigger}`).first().click();
        await page.getByRole(config.appearance === "palette" ? "radio" : "menuitemradio", { name: new RegExp(`^${targetTheme}$`, "iu") }).click();
      }
      await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, targetTheme);
      await page.reload();
      await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, targetTheme);
      const destination = await page.locator('header a[href^="/"]').evaluateAll(links => links.map(link => link.getAttribute("href")).find(href => href !== "/" && !href.startsWith("//")));
      assert.ok(destination, "Header has no internal navigation link");
      await page.locator(`header a[href=${JSON.stringify(destination)}]`).first().click();
      await page.waitForURL(url => url.pathname === new URL(destination, origin).pathname);
      await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, targetTheme);
      assert.deepEqual(errors, [], "Browser errors after appearance and navigation");
    } finally { await context.close(); }
  }
} catch (error) {
  failure = error;
} finally {
  try { await browser?.close(); }
  finally {
    if (server) {
      if (server.exitCode === null && server.signalCode === null) server.kill("SIGTERM");
      const timer = setTimeout(() => { if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL"); }, 5_000);
      try { await exited; } finally { clearTimeout(timer); }
    }
  }
}
await writeFile(resolve(artifacts, "results.json"), JSON.stringify({ passed: !failure, failure: failure?.message ?? null, origin, production, source: process.env.GITHUB_SHA ?? null, capturedAt: new Date().toISOString(), cleanup: "browser and owned server closed", results }, null, 2) + "\n");
if (failure) throw failure;
console.log(`Verified ${results.length} route/viewport/theme combinations at ${origin}.`);
