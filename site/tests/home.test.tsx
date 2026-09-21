import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import Home from "../app/page";
import Docs from "../app/docs/page";
import { readmeVersion } from "../app/readme.generated";
import { publishedRelease } from "../app/publication";
import RootLayout from "../app/layout";

test("every public route has the in-flow content footer above the network footer", () => {
  for (const Page of [Home, Docs]) {
    const html = renderToStaticMarkup(<RootLayout><Page /></RootLayout>);
    expect(html.match(/<footer\b/gu)).toHaveLength(2);
    const contentFooter = html.indexOf('data-hraness-marketing="footer"');
    const networkFooter = html.indexOf('data-slot="hraness-site-footer"');
    expect(contentFooter).toBeGreaterThan(-1);
    expect(networkFooter).toBeGreaterThan(contentFooter);
    expect(html).toContain('<img alt="" height="20" src="/icon.png" width="20"/>');
    expect(html).not.toContain("📝");
    expect(html).toContain("https://account.hraness.com/support?product=kb&amp;source=web#support");
    expect(html).toContain("Support ongoing development of inspectable Markdown memory for coding agents.");
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('source=web#updates');
  }
});

test("every public route attributes the site to Hraness through the shared footer only", () => {
  for (const Page of [Home, Docs]) {
    const html = renderToStaticMarkup(<RootLayout><Page /></RootLayout>);
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
  expect(html).toContain("Built by Hraness. Hraness is an advanced software research organization dedicated to advancing the frontier of machine intelligence. Wordcell is published under the MIT license.");
  expect(html).not.toContain("Venmo");
  expect(html).not.toContain("Puerto Rico");
});

test("the homepage leads with the README identity and the verified install command", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html.match(/<h1\b/gu)).toHaveLength(1);
  expect(html).toContain("Give coding agents the decisions behind your code");
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

test("the docs page renders the README with its installation anchor", () => {
  const html = renderToStaticMarkup(<Docs />);
  expect(html).toContain('id="install"');
  expect(html).toContain('id="the-kb-vault-format"');
  expect(html).toContain("wordcell --help");
  expect(html).not.toContain("data-hraness-marketing-preset");
});

test("scopes the editorial preset to the homepage header and real command example", () => {
  const html = renderToStaticMarkup(<Home />);
  const elements: string[] = [];
  new HTMLRewriter()
    .on('[data-hraness-marketing-preset="editorial"] .hraness-marketing-header.hraness-material-chrome', {
      element() { elements.push("header"); },
    })
    .on('[data-hraness-marketing-preset="editorial"] #main .hraness-material-wall .hraness-marketing-proof-frame.hraness-material-pane', {
      element() { elements.push("proof"); },
    })
    .transform(html);
  expect(elements).toEqual(["header", "proof"]);
  expect(html).toContain('wordcell search &quot;parser retries&quot; --root kb --mode exact');
  expect(html).toContain("Example commands:");
});


test("keeps decision claims, privacy limits, and evidence visible with the quick start", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("80% fewer UTF-8 bytes");
  expect(html).toContain("not a token, accuracy, latency, or competitor benchmark");
  expect(html).toContain("opt-in Jev reranking");
  expect(html).toContain("removed in version 0.21.0");
  expect(html).toContain("--skill wordcell");
  expect(html).toContain('id="compare"');
  expect(html).toContain("docs/comparisons.md");
  expect(html).toContain("docs/evidence.md");
  expect(html).not.toContain("kb kept as a deprecated alias");
});


test("unreleased publishing is labeled and source docs do not silently pretend to be an older release", () => {
  const docs = renderToStaticMarkup(<Docs />);
  if (publishedRelease !== null && publishedRelease.version !== readmeVersion) {
    expect(docs).toContain(`Documentation preview for v${readmeVersion}`);
    expect(docs).toContain(`Installation examples use verified v${publishedRelease.version}`);
  } else {
    expect(docs).not.toContain("Documentation preview for v");
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
