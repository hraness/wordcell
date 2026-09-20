import { describe, expect, test } from "bun:test";

import { parseNote } from "./graph.js";
import { renderMarkdownToHtml } from "./publish-markdown.js";
import { renderNotePage, type PageContext } from "./publish-pages.js";

const context: PageContext = {
  site: { title: "Published notes", basePath: "/" },
  rel: "../../",
  noindex: false,
  generator: "@hraness/wordcell",
  nav: { nodes: [], hiddenRoots: 0 },
  current: "note",
  titles: new Map(),
};
const sides = { links: [], backlinks: [], relations: [], relationBacklinks: [] };

function page(markdown: string): { html: string; body: string } {
  const note = parseNote("note.md", markdown);
  const body = renderMarkdownToHtml(note.content, {
    source: note.path,
    resolveNote: () => undefined,
    resolveAsset: () => undefined,
    noteHref: (slug) => `n/${slug}/`,
  });
  return { html: renderNotePage(note, body, sides, context), body };
}

function headings(html: string): string[] {
  return [...html.matchAll(/<h1(?: [^>]*)?>[\s\S]*?<\/h1>/gu)].map(([heading]) => heading);
}

describe("published note title", () => {
  test("reuses a matching leading title and preserves its heading and TOC anchors", () => {
    const { html, body } = page("# Parser contract\n\nRead the [details](#details).\n\n## Details\n\nContract body.\n");
    expect(headings(html)).toEqual(['<h1 id="parser-contract">Parser contract</h1>']);
    expect(html).toContain('href="#parser-contract"');
    expect(html).toContain('href="#details"');
    expect(html).toContain('<h2 id="details">Details</h2>');
    expect(html).toContain("Contract body.");
    // Page chrome changes do not alter the rendered body supplied by the publisher.
    expect(body.startsWith('<h1 id="parser-contract">Parser contract</h1>')).toBe(true);
  });

  test("matches escaped titles without decoding or double-escaping their content", () => {
    const { html } = page('# A & B < C "quoted" \'single\'\n\nBody.\n');
    const titles = headings(html);
    expect(titles).toHaveLength(1);
    expect(titles[0]).toContain("A &amp; B &lt; C &quot;quoted&quot; &#39;single&#39;");
    expect(titles[0]).not.toContain("&amp;amp;");
    expect(titles[0]).toContain('id="');
  });

  test("preserves a distinct authored first heading", () => {
    const { html } = page("---\ntitle: Published title\n---\n# Different heading\n\nBody.\n");
    expect(headings(html)).toEqual([
      "<h1>Published title</h1>",
      '<h1 id="different-heading">Different heading</h1>',
    ]);
  });

  test("preserves a matching heading after leading content and later duplicate anchors", () => {
    const { html } = page("---\ntitle: Parser contract\n---\nIntroductory paragraph.\n\n# Parser contract\n\n# Parser contract\n");
    expect(headings(html)).toHaveLength(3);
    expect(html.indexOf("Introductory paragraph.")).toBeLessThan(html.indexOf('<h1 id="parser-contract">'));
    expect(html).toContain('<h1 id="parser-contract-2">');
  });

  test("preserves inline formatting and links in authored headings", () => {
    const { html } = page("---\ntitle: Parser contract\n---\n# Parser **contract**\n\n## Use `parser`\n\nKeep [the link](https://example.com).\n");
    expect(headings(html)).toHaveLength(2);
    expect(html).toContain('>Parser <strong>contract</strong></h1>');
    expect(html).toContain('<code>parser</code>');
    expect(html).toContain('href="https://example.com"');
  });
});
