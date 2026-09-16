import { describe, expect, test } from "bun:test";

import {
  escapeAttribute,
  escapeHtml,
  renderMarkdownToHtml,
  type PublishRenderContext,
} from "./publish-markdown.js";

function context(overrides: Partial<PublishRenderContext> = {}): PublishRenderContext {
  return {
    source: "notes/source.md",
    resolveNote: (target) =>
      target === "docs/alpha" || target === "alpha" || target === "Alpha"
        ? { slug: "docs/alpha", title: "Alpha" }
        : undefined,
    resolveAsset: (target, _source) =>
      target === "img.png" || target === "assets/img.png"
        ? `assets/${target === "img.png" ? "deadbeef" : "cafe"}.png`
        : undefined,
    noteHref: (slug) => (slug === "" ? "./" : `n/${slug}/`),
    ...overrides,
  };
}

describe("escaping", () => {
  test("escapeHtml neutralizes markup characters", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`))
      .toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
    expect(escapeAttribute(`" onmouseover="alert(1)`))
      .toBe("&quot; onmouseover=&quot;alert(1)");
  });
});

describe("renderMarkdownToHtml", () => {
  test("renders common block and inline structure", () => {
    const html = renderMarkdownToHtml([
      "# Title One",
      "",
      "A paragraph with **bold**, *emphasis*, `code`, and a [link](https://example.com).",
      "",
      "- first",
      "- second",
      "",
      "> quoted",
      "",
      "```ts",
      "const x = 1 < 2;",
      "```",
    ].join("\n"), context());
    expect(html).toContain("<h1 id=\"title-one\">Title One</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer">link</a>');
    expect(html).toContain("<ul><li>first</li><li>second</li></ul>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("const x = 1 &lt; 2;");
  });

  test("never passes raw HTML through — every tag is escaped", () => {
    const html = renderMarkdownToHtml([
      "Intro <script>alert(1)</script> done.",
      "",
      "<div onclick=\"evil()\">block</div>",
      "",
      "<!-- comment with <img src=x onerror=alert(1)> -->",
    ].join("\n"), context());
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<div onclick="evil()"');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;div");
  });

  test("rejects unsafe link and image URL schemes", () => {
    const html = renderMarkdownToHtml([
      "[js](javascript:alert(1)) [vb](vbscript:x) [data](data:text/html,abc)",
      "![jsimg](javascript:alert(1)) ![ok](https://example.com/i.png)",
    ].join("\n"), context());
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("vbscript:");
    expect(html).not.toContain("data:text/html");
    // External images render as links, never remote-loaded <img>.
    expect(html).toContain('href="https://example.com/i.png"');
    expect(html).not.toContain('src="https://example.com/i.png"');
  });

  test("resolves wikilinks through the injected resolver and marks misses", () => {
    const html = renderMarkdownToHtml([
      "See [[docs/alpha]] and [[missing note|the missing one]].",
      "Also [[Absent]] plain.",
    ].join("\n"), context());
    expect(html).toContain('<a href="n/docs/alpha/">docs/alpha</a>');
    expect(html).toContain('class="unresolved"');
    expect(html).toContain("the missing one");
    expect(html).toContain("Absent");
  });

  test("same-page fragment links stay on the page", () => {
    const html = renderMarkdownToHtml(
      "Jump to [[#details]] and embed ![[#section]].",
      context(),
    );
    expect(html).toContain('href="#details"');
    expect(html).toContain('href="#section"');
    expect(html).not.toContain("unresolved");
  });

  test("resolves local assets and drops unresolved ones", () => {
    const html = renderMarkdownToHtml(
      "![pic](img.png) and ![gone](gone.png)",
      context(),
    );
    expect(html).toContain('src="assets/deadbeef.png"');
    expect(html).not.toContain("gone.png");
  });

  test("duplicate headings receive deterministic distinct anchors", () => {
    const html = renderMarkdownToHtml("# Repeat\n\n# Repeat\n", context());
    expect(html).toContain('id="repeat"');
    expect(html).toContain('id="repeat-2"');
  });
});
