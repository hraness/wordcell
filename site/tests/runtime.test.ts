import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { publishedRelease } from "../app/publication";

const site = join(import.meta.dir, "..");

async function startBuiltSite() {
  const process_ = Bun.spawn([
    join(site, "node_modules/.bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "0",
  ], {
    cwd: site,
    env: { ...process.env, NODE_ENV: "production" },
    stderr: "pipe",
    stdout: "pipe",
  });
  let output = "";
  let startupSettled = false;
  let rejectStartup: (error: Error) => void = () => {};
  let resolveStartup: (origin: string) => void = () => {};
  const startup = new Promise<string>((resolve, reject) => {
    rejectStartup = reject;
    resolveStartup = resolve;
  });
  const settleFromOutput = (): void => {
    const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/u);
    if (match === null || !output.includes("Ready in") || startupSettled) return;
    startupSettled = true;
    resolveStartup(`http://127.0.0.1:${match[1]}`);
  };
  const capture = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
        settleFromOutput();
      }
      output += decoder.decode();
      settleFromOutput();
    } catch (error) {
      if (!startupSettled) {
        startupSettled = true;
        rejectStartup(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      reader.releaseLock();
    }
  };
  const captureTasks = [capture(process_.stdout), capture(process_.stderr)];
  const exitTask = process_.exited.then((exitCode) => {
    if (startupSettled) return;
    startupSettled = true;
    rejectStartup(new Error(`Next exited with code ${exitCode} before startup.\n${output}`));
  });
  const timeout = setTimeout(() => {
    if (startupSettled) return;
    startupSettled = true;
    rejectStartup(new Error(`Next did not start within 10 seconds.\n${output}`));
  }, 10_000);
  try {
    const origin = await startup;
    clearTimeout(timeout);
    return { captureTasks, exitTask, origin, process_ };
  } catch (error) {
    clearTimeout(timeout);
    if (process_.exitCode === null) process_.kill("SIGTERM");
    await process_.exited;
    await Promise.allSettled(captureTasks);
    throw error;
  }
}

async function stopBuiltSite(server: Awaited<ReturnType<typeof startBuiltSite>>): Promise<void> {
  if (server.process_.exitCode === null) server.process_.kill("SIGTERM");
  const stoppedGracefully = await Promise.race([
    server.process_.exited.then(() => true),
    Bun.sleep(2_000).then(() => false),
  ]);
  if (!stoppedGracefully && server.process_.exitCode === null) {
    server.process_.kill("SIGKILL");
    await server.process_.exited;
  }
  await server.exitTask;
  await Promise.allSettled(server.captureTasks);
}

describe("built Wordcell site", () => {
  test("serves the homepage, docs, and static discovery files through Next", async () => {
    const server = await startBuiltSite();
    try {
      const [homeResponse, docsResponse, robotsResponse, llmsResponse, missingResponse, developersResponse, docPageResponse] = await Promise.all([
        fetch(`${server.origin}/`, { redirect: "manual" }),
        fetch(`${server.origin}/docs`, { redirect: "manual" }),
        fetch(`${server.origin}/robots.txt`, { redirect: "manual" }),
        fetch(`${server.origin}/llms.txt`, { redirect: "manual" }),
        fetch(`${server.origin}/missing`, { redirect: "manual" }),
        fetch(`${server.origin}/developers`, { redirect: "manual" }),
        fetch(`${server.origin}/docs/reference`, { redirect: "manual" }),
      ]);
      const [home, docs, robots, llms, developers, docPage] = await Promise.all([
        homeResponse.text(), docsResponse.text(), robotsResponse.text(), llmsResponse.text(),
        developersResponse.text(), docPageResponse.text(),
      ]);
      expect(homeResponse.status).toBe(200);
      expect(home).toContain(publishedRelease === null ? "First Wordcell release in preparation" : `hraness-wordcell-${publishedRelease.version}.tgz`);
      expect(home).toContain('<link rel="canonical" href="https://wordcell.io"');
      expect(home).toContain('aria-label="Ask AI about this"');
      expect(developersResponse.status).toBe(200);
      expect(docPageResponse.status).toBe(200);
      for (const page of [home, docs, developers, docPage]) {
        expect(page).toContain('<meta property="og:image"');
        expect(page).toContain('<meta property="og:site_name" content="Wordcell"');
        expect(page).toContain('<meta name="twitter:card" content="summary_large_image"');
        expect(page).toContain('<meta name="twitter:image"');
      }
      expect(docsResponse.status).toBe(200);
      expect(docs).toContain('<link rel="canonical" href="https://wordcell.io/docs"');
      expect(docs).toContain('<meta name="twitter:title" content="Wordcell documentation"');
      expect(docs).toContain('id="install"');
      expect(robotsResponse.status).toBe(200);
      expect(robots).toContain("Sitemap: https://wordcell.io/sitemap.xml");
      expect(llmsResponse.status).toBe(200);
      expect(llms).toContain("# Wordcell");
      expect(llms).toContain("https://wordcell.io/docs");
      expect(missingResponse.status).toBe(404);
    } finally {
      await stopBuiltSite(server);
    }
  }, 20_000);
});
