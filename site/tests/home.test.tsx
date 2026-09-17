import { expect, test } from "bun:test";
import { hranessAttribution } from "@hraness/site-footer";
import { renderToStaticMarkup } from "react-dom/server";

import Home from "../app/page";
import Docs from "../app/docs/page";
import { publishedRelease } from "../app/publication";
import RootLayout from "../app/layout";

test("every public route has one optional support footer without product signup", () => {
  for (const Page of [Home, Docs]) {
    const html = renderToStaticMarkup(<RootLayout><Page /></RootLayout>);
    expect(html.match(/<footer\b/gu)).toHaveLength(1);
    expect(html).toContain("https://account.hraness.com/support?product=kb&amp;source=web#support");
    expect(html).toContain("Support ongoing development of inspectable Markdown memory for coding agents.");
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('source=web#updates');
  }
});

test("every public route attributes the site to Hraness through the shared footer only", () => {
  expect(hranessAttribution.title).toBe("Built by Hraness");
  expect(hranessAttribution.subtitle).toMatch(/^Hraness is an advanced software research organization/u);
  for (const Page of [Home, Docs]) {
    const html = renderToStaticMarkup(<RootLayout><Page /></RootLayout>);
    const attributionBlocks: Array<{ lang: string; lines: string[] }> = [];
    new HTMLRewriter()
      .on('footer [data-slot="hraness-attribution"]', {
        element(element) { attributionBlocks.push({ lang: element.getAttribute("lang") ?? "", lines: [] }); },
      })
      .on('footer [data-slot="hraness-attribution"] p', {
        text(chunk) {
          if (chunk.text !== "") attributionBlocks.at(-1)?.lines.push(chunk.text);
        },
      })
      .transform(html);
    expect(attributionBlocks).toEqual([{ lang: "en", lines: [hranessAttribution.title, hranessAttribution.subtitle] }]);
    expect(html).not.toContain("Ben Guo");
    expect(html).not.toContain("Built by Ben");
    expect(html).not.toContain("hraness-marketing-maker");
    expect(html).not.toContain('id="maker"');
  }
});

test("the homepage's maker answer repeats the shared footer attribution copy", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("Who made it?");
  expect(html).toContain(`${hranessAttribution.title}. ${hranessAttribution.subtitle} Wordcell is published under the MIT license.`);
  expect(html).not.toContain("Venmo");
  expect(html).not.toContain("Puerto Rico");
});

test("the homepage leads with the README identity and the verified install command", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html.match(/<h1\b/gu)).toHaveLength(1);
  expect(html).toContain("Memory your coding agents can open, search, and trust");
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
  expect(html).toContain("wordcell context packages/parser/src/index.ts --root kb --repo .");
  expect(html).toContain("Example commands:");
});
