import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import Home from "../app/page";
import Developers from "../app/developers/page";
import Docs from "../app/docs/page";
import DocPage, { generateMetadata as docMetadata } from "../app/docs/[slug]/page";
import BlogIndex from "../app/blog/page";
import BlogPostPage from "../app/blog/[slug]/page";
import { docCatalog, docQuadrants } from "../app/docs/catalog";
import { docHtml } from "../app/docs/docs.generated";
import { readmeVersion } from "../app/readme.generated";
import { publishedRelease } from "../app/publication";
import RootLayout from "../app/layout";
import Benchmarks from "../app/benchmarks/page";
import CompareBasicMemory from "../app/compare/basic-memory/page";
import CompareMem0 from "../app/compare/mem0/page";
import CompareSupermemory from "../app/compare/supermemory/page";
import MigrateSupermemory from "../app/migrate/supermemory/page";
import { locomoArms } from "../wordcell/oh-evidence";
import { AGENT_MEMORY_RELEASE, SETUP_PROMPT } from "../wordcell/setup-prompt";
import { BenchmarkComparison } from "../wordcell/benchmark-comparison";
import { scifactStudy } from "../wordcell/benchmark-evidence";

async function publicRoutes(): Promise<React.JSX.Element[]> {
  return [
    <Home key="home" />,
    <Docs key="docs" />,
    <Developers key="developers" />,
    <Benchmarks key="benchmarks" />,
    <CompareBasicMemory key="compare-basic-memory" />,
    <CompareMem0 key="compare-mem0" />,
    <CompareSupermemory key="compare-supermemory" />,
    <MigrateSupermemory key="migrate-supermemory" />,
    await DocPage({ params: Promise.resolve({ slug: "reference" }) }),
    await DocPage({ params: Promise.resolve({ slug: "overview" }) }),
    <BlogIndex key="blog" />,
    await BlogPostPage({ params: Promise.resolve({ slug: "introducing-wordcell" }) }),
  ];
}

test("every public route has the in-flow content footer above the network footer", async () => {
  for (const Page of await publicRoutes()) {
    const html = renderToStaticMarkup(<RootLayout>{Page}</RootLayout>);
    // An article's own sources footer is part of the article, not page chrome.
    expect(html.match(/<footer\b(?![^>]*plain-publication__article-footer)/gu)).toHaveLength(2);
    const contentFooter = html.indexOf('data-hraness-marketing="footer"');
    const networkFooter = html.indexOf('data-slot="hraness-site-footer"');
    expect(contentFooter).toBeGreaterThan(-1);
    expect(networkFooter).toBeGreaterThan(contentFooter);
    expect(html).toContain('src="/marks/kb.svg"');
    expect(html).not.toContain("📝");
    expect(html).toContain("https://account.hraness.com/support?product=kb&amp;source=web#support");
    expect(html).toContain("Support ongoing development of Wordcell.");
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('source=web#updates');
  }
});

test("every public route links the benchmarks page from the content footer", async () => {
  for (const Page of await publicRoutes()) {
    const html = renderToStaticMarkup(<RootLayout>{Page}</RootLayout>);
    const footer = html.slice(html.indexOf('data-hraness-marketing="footer"'));
    expect(footer).toContain('href="/benchmarks"');
  }
});

test("the homepage connects an agent, links the launch pages, and keeps Oh LoCoMo figures off the page", () => {
  const html = renderToStaticMarkup(<Home />);
  const install = html.indexOf('id="install"');
  const agentMemory = html.indexOf('id="agent-memory"');
  const model = html.indexOf('id="model"');
  expect(install).toBeGreaterThan(-1);
  expect(agentMemory).toBeGreaterThan(install);
  expect(model).toBeGreaterThan(agentMemory);
  const section = html.slice(agentMemory, model);
  expect(section).toContain(`need Wordcell ${AGENT_MEMORY_RELEASE} or later.`);
  if (publishedRelease !== null) expect(section).toContain(`The prompt below installs Wordcell v${publishedRelease.version}.`);
  expect(section).not.toMatch(/from source|until the next release|checkout/u);
  expect(section).toContain("<code>wordcell mcp</code>");
  expect(section).toContain("<code>wordcell import supermemory</code>");
  expect(section).toContain("Wordcell’s local MCP server serves a vault");
  expect(section).not.toMatch(/<p[^>]*>wordcell (mcp|import)/u);
  expect(section).toContain(SETUP_PROMPT.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;"));
  expect(section).toContain("Copy prompt");
  expect(section).toContain('href="/migrate/supermemory"');
  const evidence = html.slice(html.indexOf('id="evidence"'), html.indexOf('id="context"'));
  expect(evidence).toContain('href="/benchmarks"');
  const compare = html.slice(html.indexOf('id="compare"'), html.indexOf('id="publish"'));
  expect(compare).toContain('href="/compare/supermemory"');
  expect(compare).toContain('href="/compare/basic-memory"');
  expect(compare).toContain('href="/compare/mem0"');
  expect(compare).toContain('href="/docs/comparisons"');
  expect(compare).toContain("claude-mem");
  expect(compare).toContain("CLAUDE.md");
  expect(html).not.toContain("blob/main/docs/");
  for (const arm of locomoArms) expect(html).not.toContain(`${arm.percent.replace(/%$/u, "")}%`);
  expect(html).not.toMatch(/\bSOTA\b|state[\s-]+of[\s-]+the[\s-]+art/iu);
});

test("every public route attributes the site to Hraness through the shared footer only", async () => {
  for (const Page of await publicRoutes()) {
    const html = renderToStaticMarkup(<RootLayout>{Page}</RootLayout>);
    const brandLinks: string[] = [];
    new HTMLRewriter()
      .on('footer[data-slot="hraness-site-footer"] a[aria-label="Hraness home"]', {
        element() { brandLinks.push("hraness-home"); },
      })
      .transform(html);
    expect(brandLinks).toEqual(["hraness-home"]);
    expect(html).toContain('data-slot="hraness-mark"');
    expect(html).toContain("by Hraness");
    expect(html).not.toContain('data-slot="hraness-attribution"');
    expect(html).not.toContain("Ben Guo");
    expect(html).not.toContain("Built by Ben");
    expect(html).not.toContain("hraness-marketing-maker");
    expect(html).not.toContain('id="maker"');
  }
});

test("the homepage's maker answer attributes Wordcell to Hraness", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("Who made it?");
  expect(html).toContain('<a href="https://hraness.com">Hraness</a>, which makes tools for agents and humans. Wordcell is MIT licensed, and its source is <a href="https://github.com/hraness/wordcell">on GitHub</a>.');
  expect(html).not.toContain("Venmo");
  expect(html).not.toContain("Puerto Rico");
});

test("the homepage describes the software and site without FAQ markup", () => {
  const html = renderToStaticMarkup(<Home />);
  const match = /<script type="application\/ld\+json">([^<]*)<\/script>/u.exec(html);
  expect(match).not.toBeNull();
  const nodes: unknown = JSON.parse(match?.[1] ?? "null");
  if (!Array.isArray(nodes)) throw new Error("expected a JSON-LD array");
  const byType = new Map(nodes.map((node: { "@type": string }) => [node["@type"], node as Record<string, unknown>]));
  expect([...byType.keys()]).toEqual(["WebSite", "SoftwareApplication", "SoftwareSourceCode"]);
  expect(byType.get("WebSite")?.["@id"]).toBe("https://wordcell.io/#website");
  const software = byType.get("SoftwareApplication");
  expect(software?.["@id"]).toBe("https://wordcell.io/#software");
  expect(software?.applicationCategory).toBe("DeveloperApplication");
  expect(software?.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "USD" });
  expect(software?.publisher).toEqual({ "@id": "https://hraness.com/#organization" });
  expect(software).not.toHaveProperty("operatingSystem");
  if (publishedRelease !== null) expect(software?.softwareVersion).toBe(publishedRelease.version);
  expect(byType.get("SoftwareSourceCode")?.targetProduct).toEqual({ "@id": "https://wordcell.io/#software" });
  expect(html).not.toContain("FAQPage");
});

test("the homepage leads with the README identity and the verified install command", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html.match(/<h1\b/gu)).toHaveLength(1);
  expect(html).toMatch(/<h1\b[^>]*>Give coding agents the decisions behind your code\.<\/h1>/u);
  expect(html).toContain("Markdown knowledge base");
  expect(html).toContain("free, open-source CLI and local MCP server");
  if (publishedRelease === null) {
    expect(html).toContain("First Wordcell release in preparation");
    expect(html).not.toContain(".tgz");
  } else {
    expect(html).toContain(`hraness-wordcell-${publishedRelease.version}.tgz`);
    expect(html).toContain("wordcell init kb");
    expect(html).toContain(publishedRelease.verificationRun);
  }
  expect(html).not.toContain("hraness.com/kb");
});

test("Wordcell compares its measured retrieval path and keeps the Oh boundary explicit", () => {
  const html = renderToStaticMarkup(<Home />);
  const fragments: string[] = [];
  const legacyTargets: string[] = [];
  new HTMLRewriter()
    .on("#memory, #evidence, #oh", {
      element(element) { fragments.push(element.getAttribute("id") ?? ""); },
    })
    .on("section#evidence #memory", {
      element(element) {
        legacyTargets.push(element.getAttribute("id") ?? "");
        expect(element.hasAttribute("href")).toBe(false);
        expect(element.hasAttribute("tabindex")).toBe(false);
      },
    })
    .transform(html);
  expect(fragments.toSorted()).toEqual(["evidence", "memory", "oh"]);
  expect(legacyTargets).toEqual(["memory"]);
  expect(html).toContain("hraness-design-bar-list-chart");
  expect(html).toContain("33.7%");
  expect(html).toContain("53.7%");
  expect(html).toContain("101 of 300 queries");
  expect(html).toContain("161 of 300 queries");
  expect(html).toContain("jev-1.13.0");
  expect(html).toContain("BEIR SciFact relevance judgments");
  expect(html).toContain("25-candidate windows");
  expect(html).toContain("260-query confirmation");
  expect(html).toContain("optional paid provider");
  expect(html).toContain('href="/docs/reranking#evidence-and-limits"');
  expect(html).toContain("Markdown and Git remain authoritative");
  expect(html).toContain("conversation-memory benchmark scores do not measure that search path");
  for (const page of [html, renderToStaticMarkup(<Developers />)]) {
    expect(page).not.toContain("89.8%");
    expect(page).not.toContain("84.4%");
    expect(page).not.toContain("for the same answer");
  }
});

test("unmatched published protocols cannot be plotted as a shared comparison", () => {
  expect(() => renderToStaticMarkup(
    <BenchmarkComparison study={{ ...scifactStudy, comparability: "published-context" }} />,
  )).toThrow("A comparison chart requires a shared evaluation protocol");
});

test("the docs page indexes every catalog entry by Diataxis quadrant", () => {
  const html = renderToStaticMarkup(<Docs />);
  expect(html).toContain('id="install"');
  expect(html).toContain("wordcell --help");
  expect(html).not.toContain("data-hraness-marketing-preset");
  for (const quadrant of docQuadrants) {
    expect(html).toContain(`id="docs-${quadrant.id}"`);
    expect(html).toContain(quadrant.label);
  }
  for (const entry of docCatalog) {
    expect(html).toContain(`href="/docs/${entry.slug}"`);
    expect(html).toContain(entry.title);
  }
  expect(html).toContain('href="/docs/overview"');
});

test("every documentation page renders its repository Markdown with on-site links", async () => {
  for (const entry of docCatalog) {
    const element = await DocPage({ params: Promise.resolve({ slug: entry.slug }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("<article");
    expect(html).toContain("<h1");
    expect(html).toContain(`docs/${entry.slug}.md`);
    expect(html).not.toContain("data-hraness-marketing-preset");
    expect(docHtml[entry.slug]).not.toContain('href="../');
    expect(docHtml[entry.slug]).not.toContain('href="./');
    const metadata = await docMetadata({ params: Promise.resolve({ slug: entry.slug }) });
    expect(metadata.title).toBe(`${entry.title} · Wordcell documentation`);
  }
});

test("the overview page renders the README with its installation anchor", async () => {
  const element = await DocPage({ params: Promise.resolve({ slug: "overview" }) });
  const html = renderToStaticMarkup(element);
  expect(html).toContain('id="install"');
  expect(html).toContain('id="the-kb-vault-format"');
  expect(html).toContain("wordcell --help");
});

test("scopes the editorial preset to the homepage header and a quiet CLI-first hero", () => {
  const html = renderToStaticMarkup(<Home />);
  const elements: string[] = [];
  new HTMLRewriter()
    .on('[data-hraness-marketing-preset="editorial"] .hraness-marketing-header.hraness-material-chrome', {
      element() { elements.push("header"); },
    })
    .on('[data-hraness-marketing-preset="editorial"] #main .hraness-material-wall .wordcell-field[aria-hidden="true"]', {
      element() { elements.push("field"); },
    })
    .transform(html);
  expect(elements).toEqual(["header"]);
  expect(html).toContain('wordcell search &quot;parser retries&quot; --root kb --mode exact');
  expect(html).not.toContain("wordcell-note");
  expect(html).not.toContain("wordcell-edge");
});


test("the 404 page leads with the install action inside the site header", async () => {
  const { default: NotFound } = await import("../app/not-found");
  const html = renderToStaticMarkup(<NotFound />);
  expect(html).toContain("hraness-status-page");
  expect(html).toContain('data-hraness-appearance-menu=');
  expect(html).toMatch(/data-emphasis="primary"[^>]*href="\/#install"[^>]*>Install Wordcell</u);
  expect(html).toContain('href="/docs/getting-started"');
  expect(html.match(/class="hraness-status-page__next-link"/gu)).toHaveLength(3);
  expect(html).toContain("data-hraness-status-routes=");
  expect(html).toContain('id="main"');
  expect(html.match(/<h1\b/gu)).toHaveLength(1);
});


test("keeps decision claims, privacy limits, and evidence visible with the quick start", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("80% fewer UTF-8 bytes");
  expect(html).toContain("12,126 bytes");
  expect(html).toContain("60,584 bytes");
  expect(html).toContain("Payload size, not accuracy");
  expect(html).toContain("hosted Jev reranking");
  expect(html).toContain("removed in version 0.21.0");
  expect(html).toContain("--skill wordcell");
  expect(html).toContain('id="compare"');
  expect(html).toContain('href="/docs/comparisons"');
  expect(html).toContain('href="/docs/evidence"');
  expect(html).not.toContain("kb kept as a deprecated alias");
});


test("unreleased publishing is labeled and source docs do not silently pretend to be an older release", () => {
  const docs = renderToStaticMarkup(<Docs />);
  if (publishedRelease !== null && publishedRelease.version !== readmeVersion) {
    expect(docs).toContain('class="release-preview"');
    expect(docs).toContain(`These docs describe v${readmeVersion}`);
    expect(docs).toContain(`The install commands use v${publishedRelease.version}`);
  } else {
    expect(docs).not.toContain('class="release-preview"');
  }
  if (publishedRelease?.version.startsWith("0.21.")) {
    const home = renderToStaticMarkup(<Home />);
    expect(home).toContain("The current verified install above predates this feature");
    expect(home).not.toContain("wordcell publish --root kb --out site");
    expect(home).toContain("The current verified install still needs a Wordcell index.md");
    expect(docs).toContain("v0.22.0 or newer");
  }
});


test("the header keeps a named home link and exact-artwork foil fallback", () => {
  for (const Page of [Home]) {
    const html = renderToStaticMarkup(<Page />);
    const homeLinks: string[] = [];
    const marks: string[] = [];
    const fallbackImages: string[] = [];
    const masks: string[] = [];
    new HTMLRewriter()
      .on('header a[aria-label="Wordcell home"]', {
        element(element) {
          homeLinks.push(element.getAttribute("href") ?? "");
          expect(element.hasAttribute("data-foil")).toBe(true);
        },
      })
      .on('header a[aria-label="Wordcell home"] .hraness-foil-mark', {
        element(element) { marks.push(element.getAttribute("aria-hidden") ?? ""); },
      })
      .on('header a[aria-label="Wordcell home"] .hraness-foil-mark img', {
        element(element) {
          fallbackImages.push(element.getAttribute("src") ?? "");
          expect(element.hasAttribute("alt")).toBe(true);
          expect(element.getAttribute("alt") ?? "").toBe("");
        },
      })
      .on('header a[aria-label="Wordcell home"] .hraness-foil-mark__paint', {
        element(element) { masks.push((element.getAttribute("style") ?? "").replaceAll("&quot;", '"')); },
      })
      .transform(html);
    expect(homeLinks).toEqual(["/"]);
    expect(marks).toEqual(["true"]);
    expect(fallbackImages).toEqual(["/marks/kb.svg"]);
    expect(masks).toEqual(['--hraness-foil-mask:url("/marks/kb.svg")']);
  }
});
