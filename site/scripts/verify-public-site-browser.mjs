// Hraness public-site browser check (template from hraness/.github).
//
// Copy to scripts/verify-public-site-browser.mjs in a Next.js site. It starts
// `next start` on an ephemeral 127.0.0.1 port (or checks config.origin with
// --production), then visits every public route at each (width, theme)
// context. Contexts run through a small pool instead of one after another.
//
// Inputs:
//   scripts/public-site-browser.json  { origin, routes, prefixes, minimalRoutes?, forcedTheme?, appearance? }
//   .next/prerender-manifest.json     prerendered routes (after `next build`)
// Options (flags or environment):
//   --production                      check config.origin instead of a local server
//   --local-origin=http://127.0.0.1:N  use an existing local server owned by the caller
//   --concurrency=N  SITE_BROWSER_CONCURRENCY  contexts at once (default 3 on 4+ CPUs, else 2)
//   --sample=N       SITE_BROWSER_SAMPLE       at most N routes per context; each context
//                                              takes a different slice, config.routes always run
//   SITE_BROWSER_ARTIFACTS           artifact directory (default: a fresh mkdtemp dir)
//   --self-test                      check the pool, sampling and failure helpers without a browser
//
// Every failure is collected and reported together at the end, and every
// response with status 400 or above is logged as `status url`.

import assert from "node:assert/strict";
import { publicationLinkGroups, verifyPublicationLinks } from "./verify-publication-links.mjs";
import { verifySettledConsentFlow } from "./verify-settled-consent.mjs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectComparisonLayout, inspectComparisonReflow } from "./check-comparison-layout.mjs";
import { inspectSearchLayout } from "./check-search-layout.mjs";
import { localVerificationOrigin as localBrowserOrigin, browserOwner, ownedChromiumLaunchOptions, pinnedBrowserExecutable, pinnedChromiumDefinition, verifyOwnedChromium } from "./owned-browser.mjs";

const WIDTHS = [360, 390, 1440];
const THEMES = ["light", "dark"];
const HEIGHTS = { 360: 740, 390: 844 };

export function option(argv, name) {
  const prefix = `--${name}=`;
  const found = argv.find(argument => argument.startsWith(prefix));
  return found === undefined ? undefined : found.slice(prefix.length);
}

export function positiveInteger(value, label) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  assert.ok(Number.isInteger(parsed) && parsed > 0, `${label} must be a positive integer, got ${JSON.stringify(value)}`);
  return parsed;
}

export { localVerificationOrigin as localBrowserOrigin } from "./owned-browser.mjs";

// Public GitHub-hosted runners have 4 vCPUs, private ones 2. One Chromium
// context per spare core keeps `next start` responsive.
export function defaultConcurrency(cpus = availableParallelism()) {
  return cpus >= 4 ? 3 : 2;
}

// Runs task(item, index) for every item with at most `limit` in flight.
// Never rejects: returns one { item, value } or { item, error } per input, in input order.
export async function pool(items, limit, task) {
  const settled = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try { settled[index] = { item: items[index], value: await task(items[index], index) }; }
      catch (error) { settled[index] = { item: items[index], error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return settled;
}

// Deterministic sample: pinned routes always, then every k-th remaining route
// starting at a per-context offset, so the contexts together cover more routes.
export function sampleRoutes(routes, pinned, size, offset) {
  if (size === undefined || size >= routes.length) return [...routes];
  const pinnedSet = new Set(pinned.filter(route => routes.includes(route)));
  const rest = routes.filter(route => !pinnedSet.has(route));
  const room = Math.max(0, size - pinnedSet.size);
  const picked = [];
  if (room > 0 && rest.length > 0) {
    const stride = rest.length / room;
    for (let slot = 0; slot < room && slot < rest.length; slot++) picked.push(rest[(Math.floor(slot * stride) + offset) % rest.length]);
  }
  return [...new Set([...pinnedSet, ...picked])].sort();
}

export function sortResults(results) {
  return [...results].sort((a, b) => a.route.localeCompare(b.route) || a.width - b.width || a.theme.localeCompare(b.theme));
}

export function formatFailures(failures, limit = 50) {
  const lines = failures.slice(0, limit).map(failure => `- ${failure.context}: ${failure.message}`);
  if (failures.length > limit) lines.push(`- ... ${failures.length - limit} more in results.json`);
  return `${failures.length} public-site browser check(s) failed:\n${lines.join("\n")}`;
}

async function selfTest() {
  assert.equal(defaultConcurrency(2), 2);
  assert.equal(defaultConcurrency(4), 3);
  assert.equal(positiveInteger(undefined, "x"), undefined);
  assert.equal(positiveInteger("3", "x"), 3);
  assert.throws(() => positiveInteger("0", "x"));
  assert.equal(option(["--sample=5", "--production"], "sample"), "5");
  assert.equal(localBrowserOrigin(undefined), undefined);
  assert.equal(localBrowserOrigin(undefined, true), undefined);
  assert.throws(() => localBrowserOrigin("http://127.0.0.1:12345", true));
  assert.equal(localBrowserOrigin("http://127.0.0.1:12345"), "http://127.0.0.1:12345");
  for (const origin of ["http://127.0.0.1:0", "http://127.0.0.1:80", "http://127.0.0.1:65536", "http://localhost:12345", "https://127.0.0.1:12345", "http://127.0.0.1:12345/path", "http://127.0.0.1:12345?redirect=https://example.com"]) {
    assert.throws(() => localBrowserOrigin(origin));
  }

  let inFlight = 0;
  let peak = 0;
  const settled = await pool([1, 2, 3, 4, 5], 2, async item => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise(done => setTimeout(done, 5 * (6 - item)));
    inFlight--;
    if (item === 3) throw new Error("three");
    return item * 10;
  });
  assert.equal(peak, 2);
  assert.deepEqual(settled.map(entry => entry.value ?? entry.error.message), [10, 20, "three", 40, 50]);
  assert.deepEqual(await pool([], 3, async () => 1), []);

  const routes = ["/", "/a", "/b", "/c", "/d", "/e", "/f", "/g"];
  assert.deepEqual(sampleRoutes(routes, ["/"], undefined, 0), routes);
  const first = sampleRoutes(routes, ["/"], 3, 0);
  const second = sampleRoutes(routes, ["/"], 3, 1);
  assert.equal(first.length, 3);
  assert.ok(first.includes("/") && second.includes("/"));
  assert.notDeepEqual(first, second);
  assert.deepEqual(sampleRoutes(routes, ["/", "/zzz"], 1, 4), ["/"]);

  assert.deepEqual(sortResults([{ route: "/b", width: 360, theme: "light" }, { route: "/a", width: 1440, theme: "dark" }, { route: "/a", width: 360, theme: "light" }]).map(result => `${result.route}@${result.width}`), ["/a@360", "/a@1440", "/b@360"]);
  const message = formatFailures(Array.from({ length: 3 }, (_, index) => ({ context: "360-light", message: `m${index}` })), 2);
  assert.match(message, /^3 public-site browser check\(s\) failed/u);
  assert.match(message, /1 more in results\.json/u);
  console.log("verify-public-site-browser self-test passed");
}

async function main(argv) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const production = argv.includes("--production");
  assert.ok(argv.every(argument => argument === "--production" || /^--(concurrency|sample|local-origin)=/u.test(argument)), `Unknown argument in ${argv.join(" ")}`);
  const existingOrigin = localBrowserOrigin(option(argv, "local-origin"), production);
  const concurrency = positiveInteger(option(argv, "concurrency") ?? process.env.SITE_BROWSER_CONCURRENCY, "concurrency") ?? defaultConcurrency();
  const sample = positiveInteger(option(argv, "sample") ?? process.env.SITE_BROWSER_SAMPLE, "sample");

  const config = JSON.parse(await readFile(resolve(root, "scripts/public-site-browser.json"), "utf8"));
  const manifest = JSON.parse(await readFile(resolve(root, ".next/prerender-manifest.json"), "utf8"));
  const allowed = route => config.prefixes.some(prefix => prefix === "*" || route === prefix || (prefix !== "/" && route.startsWith(prefix + "/")));
  // Prerendered route handlers (downloads, images) have no RSC data route.
  const routes = [...new Set([...config.routes, ...Object.keys(manifest.routes).filter(route => allowed(route) && manifest.routes[route].dataRoute !== null && !route.includes("[") && !route.startsWith("/_") && !route.startsWith("/api/") && !/\.[a-z0-9]+$/iu.test(route) && !/\/(opengraph-image|twitter-image|icon|apple-icon)(\/|$)/u.test(route))])].sort();
  assert.ok(routes.includes("/") && routes.every(route => route.startsWith("/") && !route.startsWith("//")), "Invalid public route inventory");
  assert.ok(routes.length <= 2500, "Unexpectedly large public route inventory");

  const artifacts = process.env.SITE_BROWSER_ARTIFACTS ? resolve(process.env.SITE_BROWSER_ARTIFACTS) : await mkdtemp(join(tmpdir(), "public-site-browser-"));
  await mkdir(artifacts, { recursive: true });
  let origin = existingOrigin ?? config.origin;
  assert.match(config.origin, /^https:\/\/[a-z0-9.-]+$/u);

  const contexts = WIDTHS.flatMap(width => THEMES.map(theme => ({ width, theme, name: `${width}-${theme}` })));
  const results = [];
  const failures = [];
  let server;
  let exited;
  let output = "";
  let browser;
  let fatal;
  let launchOptions;
  let chromium;
  let browserIdentity;
  let interruption;
  const owner = browserOwner({
    launch: () => chromium.launch(launchOptions),
    close: acquired => acquired.close(),
    stopServer: async () => {
      if (!server) return;
      if (server.exitCode === null && server.signalCode === null) server.kill("SIGTERM");
      const timer = setTimeout(() => { if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL"); }, 5_000);
      try { await exited; } finally { clearTimeout(timer); }
    },
  });
  const interrupted = signal => {
    interruption ??= new Error(`Browser verification interrupted by ${signal}.`);
    process.exitCode = signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143;
    void owner.stop().catch(error => { console.error(error); process.exitCode = 1; });
  };
  const onSIGINT = () => interrupted("SIGINT");
  const onSIGTERM = () => interrupted("SIGTERM");
  const onSIGHUP = () => interrupted("SIGHUP");
  process.once("SIGINT", onSIGINT);
  process.once("SIGTERM", onSIGTERM);
  process.once("SIGHUP", onSIGHUP);
  try {
    ({ chromium } = await import("playwright-core"));
    const definition = pinnedChromiumDefinition();
    const executablePath = await pinnedBrowserExecutable(chromium.executablePath(), process.env.WORDCELL_BROWSER_EXECUTABLE);
    launchOptions = { ...ownedChromiumLaunchOptions(executablePath, definition.defaultArgs), timeout: 15_000,
      handleSIGHUP: false, handleSIGINT: false, handleSIGTERM: false };
    if (interruption) throw interruption;
    if (!production && existingOrigin === undefined) {
      const reservation = createServer();
      reservation.listen(0, "127.0.0.1");
      await once(reservation, "listening");
      const port = reservation.address().port;
      await new Promise((done, reject) => reservation.close(error => error ? reject(error) : done()));
      if (interruption) throw interruption;
      origin = `http://127.0.0.1:${port}`;
      server = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
      exited = new Promise((done, reject) => { server.once("exit", done); server.once("error", reject); });
      void exited.catch(() => undefined);
      for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { output = (output + chunk).slice(-32_768); });
      const deadline = Date.now() + 45_000;
      let ready = false;
      while (Date.now() < deadline) {
        if (interruption) throw interruption;
        if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Next exited: ${output}`);
        try { if ((await fetch(origin, { signal: AbortSignal.timeout(2_000) })).ok) { ready = true; break; } } catch { /* Wait for the server to bind. */ }
        await new Promise(done => setTimeout(done, 100));
      }
      assert.ok(ready, `Next did not become ready: ${output}`);
    }

    browser = await owner.start();
    browserIdentity = await verifyOwnedChromium(browser, executablePath, definition.expectedVersion);
    console.log(`Verification browser: ${browserIdentity.browserVersion}; executable: ${browserIdentity.executable}; source: pinned Playwright`);
    const settled = await pool(contexts, concurrency, async ({ width, theme, name }, index) => {
      const context = await browser.newContext({ viewport: { width, height: HEIGHTS[width] ?? 900 }, colorScheme: theme, hasTouch: width < 600 });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        page.on("response", response => { if (response.status() >= 400) console.log(`${response.status()} ${response.url()}`); });
        for (const route of sampleRoutes(routes, [...config.routes, "/"], sample, index)) {
          errors.length = 0;
          try {
            const response = await page.goto(origin + route);
            assert.equal(response?.status(), 200, `${route}: status`);
            await page.locator("main").waitFor();
            await page.evaluate(() => document.fonts.ready);
            const settledConsent = route === "/" ? await verifySettledConsentFlow(page) : undefined;
            const publicationLinks = route === "/blog/introducing-wordcell"
              ? await verifyPublicationLinks(page, publicationLinkGroups.map(group => ({ ...group, required: group.name !== "footer" })))
              : undefined;
            let searchLayout;
            if (route === "/") {
              searchLayout = await inspectSearchLayout(page, width === 1440);
              await inspectComparisonLayout(page);
              if (width === 1440) await inspectComparisonReflow(page);
            }
            const state = await page.evaluate(() => {
              const footer = document.querySelector("#hraness-site-footer");
              return {
                overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, document.querySelector("main")?.getBoundingClientRect().right ?? 0) > innerWidth + 1,
                heading: document.querySelector("h1")?.textContent?.trim(),
                theme: document.documentElement.dataset.theme,
                footerPositions: [footer, footer?.querySelector(".hraness-site-footer__inner")].map(element => element ? getComputedStyle(element).position : null),
                smallHeaderTargets: innerWidth > 600 ? [] : [...document.querySelectorAll("header a, header button, header summary")].filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && (box.width < 43.5 || box.height < 43.5); }).map(element => element.textContent?.trim() || element.getAttribute("aria-label")),
              };
            });
            const file = `${name}-${route === "/" ? "home" : route.slice(1).replaceAll("/", "_")}`;
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const screenshot = await page.screenshot({ path: resolve(artifacts, `${file}.png`), fullPage: true, animations: "disabled" });
            await writeFile(resolve(artifacts, `${file}.json`), JSON.stringify({ route, state, searchLayout, errors, publicationLinks, settledConsent }, null, 2));
            assert.equal(screenshot.readUInt32BE(16), width, `${route}: full-page screenshot width`);
            assert.ok(!state.overflow, `${route}: horizontal overflow at ${width}`);
            assert.ok(state.heading || config.minimalRoutes?.includes(route), `${route}: missing heading`);
            assert.equal(state.theme, config.forcedTheme ?? theme, `${route}: system appearance`);
            assert.ok(state.footerPositions.every(position => position === null || position === "static" || position === "relative"), `${route}: footer not in normal flow`);
            assert.ok(state.footerPositions[0] || config.minimalRoutes?.includes(route), `${route}: footer missing`);
            assert.deepEqual(state.smallHeaderTargets, [], `${route}: phone targets below 44px`);
            assert.deepEqual(errors, [], `${route}: browser errors`);
            results.push({ route, width, theme });
          } catch (error) {
            failures.push({ context: name, route, message: error.message.split("\n")[0] });
          }
        }

        // Appearance switch persists across reload and navigation.
        errors.length = 0;
        try {
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
        } catch (error) {
          failures.push({ context: name, route: "(appearance)", message: error.message.split("\n")[0] });
        }
      } finally { await context.close(); }
    });
    for (const entry of settled) if (entry.error) failures.push({ context: entry.item.name, route: null, message: entry.error.message.split("\n")[0] });
  } catch (error) {
    fatal = error;
  } finally {
    try { await owner.stop(); }
    finally {
      process.removeListener("SIGINT", onSIGINT);
     process.removeListener("SIGTERM", onSIGTERM);
      process.removeListener("SIGHUP", onSIGHUP);
    }
  }

  if (interruption) fatal ??= interruption;
  failures.sort((a, b) => a.context.localeCompare(b.context) || String(a.route).localeCompare(String(b.route)));
  const passed = !fatal && failures.length === 0;
  await writeFile(resolve(artifacts, "results.json"), JSON.stringify({ passed, fatal: fatal?.message ?? null, failures, origin, production, externalLocalServer: existingOrigin !== undefined, concurrency, sample: sample ?? null, browserIdentity, source: process.env.GITHUB_SHA ?? null, capturedAt: new Date().toISOString(), cleanup: "browser and owned server closed", results: sortResults(results) }, null, 2) + "\n");
  console.log(`Artifacts: ${artifacts}`);
  if (fatal) throw fatal;
  if (failures.length > 0) throw new Error(formatFailures(failures));
  console.log(`Verified ${results.length} route/viewport/theme combinations at ${origin} (${concurrency} contexts at once).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) await selfTest();
  else await main(argv);
}
