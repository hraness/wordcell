import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { publishedRelease } from "../app/publication";
import { launchRoutes } from "../wordcell/launch-routes";

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
      const docsSlash = await fetch(`${server.origin}/docs/?query=preserved`, { redirect: "manual" });
      expect(docsSlash.status).toBe(308);
      expect(new URL(docsSlash.headers.get("location")!, server.origin).href).toBe(`${server.origin}/docs?query=preserved`);
      // The local Next server has no Vercel external rewrite. A 404 here proves
      // Next passed the hosted directory path through without stripping it.
      for (const path of ["/p/abcd1234/fixture/", "/p/abcd1234/fixture/n/reports/evidence/"]) {
        const hosted = await fetch(`${server.origin}${path}`, { redirect: "manual" });
        expect(hosted.status).toBe(404);
        expect(hosted.headers.get("location")).toBeNull();
      }
    } finally {
      await stopBuiltSite(server);
    }
  }, 20_000);

  test("serves the blog, its Atom feed, and noindex for quarantined posts", async () => {
    const server = await startBuiltSite();
    try {
      const [indexResponse, introResponse, heldResponse, feedResponse] = await Promise.all([
        fetch(`${server.origin}/blog`, { redirect: "manual" }),
        fetch(`${server.origin}/blog/introducing-wordcell`, { redirect: "manual" }),
        fetch(`${server.origin}/blog/how-wordcell-uses-oh`, { redirect: "manual" }),
        fetch(`${server.origin}/blog/feed.xml`, { redirect: "manual" }),
      ]);
      const [index, intro, held, feed] = await Promise.all([
        indexResponse.text(), introResponse.text(), heldResponse.text(), feedResponse.text(),
      ]);
      for (const response of [indexResponse, introResponse, heldResponse, feedResponse]) expect(response.status).toBe(200);
      expect(index).toContain('<link rel="canonical" href="https://wordcell.io/blog"');
      expect(index).toContain('type="application/atom+xml"');
      expect(intro).toContain('<link rel="canonical" href="https://wordcell.io/blog/introducing-wordcell"');
      expect(intro).toContain('<meta property="og:type" content="article"');
      expect(intro).toContain('"@type":"BlogPosting"');
      expect(intro).toContain("reviewed by Claude Opus 5.5 (claude-opus-5-5) editorial review.");
      expect(intro).not.toMatch(/<meta name="robots" content="[^"]*noindex/u);
      expect(held).toMatch(/<meta name="robots" content="noindex, nofollow"/u);
      expect(held).toContain("reviewed by Claude Opus 5.5 (claude-opus-5-5) editorial review.");
      expect(feedResponse.headers.get("content-type")).toContain("application/atom+xml");
      expect(feed).toContain("<id>https://wordcell.io/blog/introducing-wordcell</id>");
      expect(feed).not.toContain("<id>https://wordcell.io/blog/how-wordcell-uses-oh</id>");
    } finally {
      await stopBuiltSite(server);
    }
  }, 20_000);

  test("serves the benchmarks, comparison, and migration pages with share images", async () => {
    const server = await startBuiltSite();
    try {
      for (const path of launchRoutes) {
        const response = await fetch(`${server.origin}${path}`, { redirect: "manual" });
        expect(response.status).toBe(200);
        const page = await response.text();
        expect(page).toContain(`<link rel="canonical" href="https://wordcell.io${path}"`);
        expect(page).toContain(`<meta property="og:url" content="https://wordcell.io${path}"`);
        expect(page).toContain('<meta property="og:site_name" content="Wordcell"');
        expect(page).toContain('<meta name="twitter:card" content="summary_large_image"');
        expect(page).toContain('<meta name="twitter:image"');
        const image = /<meta property="og:image" content="([^"]+)"/u.exec(page)?.[1];
        expect(image).toBeDefined();
        const imageUrl = new URL(image!.replaceAll("&amp;", "&"));
        expect(imageUrl.pathname).toBe(`${path}/opengraph-image`);
        const imageResponse = await fetch(`${server.origin}${imageUrl.pathname}${imageUrl.search}`, { redirect: "manual" });
        expect(imageResponse.status).toBe(200);
        expect(imageResponse.headers.get("content-type")).toBe("image/png");
        await imageResponse.arrayBuffer();
      }
    } finally {
      await stopBuiltSite(server);
    }
  }, 20_000);
});
