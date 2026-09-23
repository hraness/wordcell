import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import {
  escapeAttribute,
  escapeHtml,
  projectMarkdownText,
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

describe("published display text", () => {
  test("projects complete Markdown before excerpt clipping without citation identifiers", () => {
    const label = `sr-${"x".repeat(100)}`;
    const markdown = `---\ntitle: Private metadata is not prose\n---\n# Invented canary\n\nThe **Amberfin** claim.[^${label}]\n\n[^${label}]: [Named source](https://example.com/paper).\n    Continued *detail*.\n`;
    const original = markdown;
    expect(projectMarkdownText(markdown)).toEqual({
      text: "Invented canary\n\nThe Amberfin claim.\n\nNamed source. Continued detail.",
      preview: "The Amberfin claim.",
    });
    expect(markdown).toBe(original);
    expect(renderMarkdownToHtml(markdown, context())).toContain('role="doc-noteref"');
    expect(renderMarkdownToHtml(markdown, context())).toContain('role="doc-backlink"');
  });

  test("shares case-sensitive, duplicate, missing, escaped, code and nested citation rules", () => {
    const markdown = [
      "Case[^A][^a]. Missing[^absent]. Duplicate[^dup]. Escaped\\[^A]. Inline `[^a]`.", "",
      "[^A]: Upper source with nested[^a].", "[^a]: Lower source.", "",
      "[^dup]: First duplicate.", "[^dup]: Second duplicate.", "",
      "```md", "# Literal heading[^A]", "[^a]: Literal definition.", "```", "",
      "<!-- Hidden[^A]. -->", "%% Hidden too[^a]. %%",
    ].join("\n");
    const projection = projectMarkdownText(markdown);
    expect(projection.preview).toBe("Case. Missing[^absent]. Duplicate[^dup]. Escaped[^A]. Inline [^a].");
    expect(projection.text).toContain("Upper source with nested[^a].\n\nLower source.");
    expect(projection.text).toContain("[^dup]: First duplicate.");
    expect(projection.text).toContain("[^dup]: Second duplicate.");
    expect(projection.text).toContain("# Literal heading[^A]\n[^a]: Literal definition.");
    expect(projection.text).not.toContain("Hidden");
  });

  test("preserves malformed and over-limit definitions and references", () => {
    for (const definition of ["[^bad label]: Invalid.", `[^${"x".repeat(129)}]: Oversize.`, "[^empty]:"]) {
      const marker = definition.slice(0, definition.indexOf(":"));
      const text = projectMarkdownText(`Claim${marker}.\n\n${definition}`).text;
      expect(text).toContain(marker);
      expect(text).toContain(definition);
    }
    const disabled = `Claim[^a].\n\n${Array.from({ length: 257 }, (_, index) => `[^${index === 0 ? "a" : `n${index}`}]: Source.`).join("\n")}`;
    expect(projectMarkdownText(disabled).text).toContain("Claim[^a].");
    expect(projectMarkdownText(disabled).text).toContain("[^a]: Source.");
    const capped = projectMarkdownText(`${"Claim[^a]. ".repeat(2049)}\n\n[^a]: Source.`);
    expect(capped.text.match(/\[\^a\]/gu)).toHaveLength(1);
  });

  test("keeps block boundaries and visible labels without treating literal HTML as tags", () => {
    const projection = projectMarkdownText([
      "# Heading", "", "See [[note|Alias]], [link](https://example.com) and ![alt](local.png).", "",
      "- One", "- Two", "", "> Quote", "", "| Left | Right |", "| --- | --- |", "| A | B |", "",
      'Literal <img src=x onerror="alert(1)"> &lt; and <script>alert(1)</script>.',
    ].join("\n"));
    expect(projection.text).toContain("See Alias, link and alt.");
    expect(projection.text).toContain("One\nTwo\n\nQuote\n\nLeft Right\nA B");
    expect(projection.text).toContain('Literal <img src=x onerror="alert(1)"> &lt; and <script>alert(1)</script>.');
    expect(projection.text).not.toContain("https://example.com");
  });

  test("honors authored descriptions without consuming source citation admission", () => {
    const markdown = "# Title\n\nFirst paragraph.[^A]\n\n[^A]: Source.\n";
    const normal = projectMarkdownText(markdown);
    const described = projectMarkdownText(markdown, "**Authored** description.[^A] Literal\\[^A].");
    expect(described.preview).toBe("Authored description. Literal[^A].");
    expect(described.text).toBe(normal.text);
    expect(projectMarkdownText(markdown, "").preview).toBe(normal.preview);
    expect(projectMarkdownText("# Heading only").preview).toBe("Heading only");
  });

  test("deterministic Unicode citation projection preserves prose and case-distinct definitions", () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom("界", "😀", "é", "é", "İ", "𝄞", "a"), { minLength: 1, maxLength: 40 }),
      (points) => {
        const prose = points.join("");
        const markdown = `# Title\n\n${prose}.[^A][^a]\n\n[^A]: Upper.\n[^a]: Lower.\n`;
        const first = projectMarkdownText(markdown);
        expect(projectMarkdownText(markdown)).toEqual(first);
        expect(first.preview).toBe(`${prose}.`);
        expect(first.text).toBe(`Title\n\n${prose}.\n\nUpper.\n\nLower.`);
        expect(first.text).not.toContain("�");
      },
    ));
  });
});

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

  test("heading anchors strip nested markup to a stable slug", () => {
    const html = renderMarkdownToHtml("# `code` and <scr<script>ipt>\n", context());
    expect(html).toContain('id="code-and-scr-script-ipt"');
    expect(html).not.toContain("<script");
  });
});

describe("published footnotes", () => {
  test("numbers notes by first reference and links every return target", () => {
    const html = renderMarkdownToHtml([
      "First[^second], then **again[^second]** and another[^first].",
      "",
      "[^first]: Earlier definition.",
      "[^second]: Later definition.",
      "[^unused]: An unreferenced definition stays visible.",
    ].join("\n"), context());
    expect(html).toContain('id="wordcell:footnote-ref:1:1" href="#wordcell:footnote:1" role="doc-noteref" aria-label="Footnote 1">1</a>');
    expect(html).toContain('id="wordcell:footnote-ref:1:2" href="#wordcell:footnote:1"');
    expect(html).toContain('id="wordcell:footnote:1" tabindex="-1">Later definition.');
    expect(html).toContain('id="wordcell:footnote:2" tabindex="-1">Earlier definition.');
    expect(html).toContain('id="wordcell:footnote:3" tabindex="-1">An unreferenced definition stays visible.</li>');
    expect(html).toContain('href="#wordcell:footnote-ref:1:2" role="doc-backlink" aria-label="Back to reference 2 for footnote 1">↩ 2</a>');
    expect(html).toContain('<section class="footnotes" aria-label="Footnotes"><ol>');
    expect(html.match(/role="doc-noteref"/gu)).toHaveLength(3);
    expect(html.match(/role="doc-backlink"/gu)).toHaveLength(3);
  });

  test("reuses safe note and asset resolution once per definition", () => {
    const notes: string[] = [];
    const assets: string[] = [];
    const base = context();
    const html = renderMarkdownToHtml([
      "Claim[^source]. Again[^source].",
      "",
      "[^source]: [[alpha]] [file](img.png) [source](https://example.com).",
      "    More *detail* on a continuation line.",
    ].join("\n"), context({
      resolveNote: (target) => { notes.push(target); return base.resolveNote(target); },
      resolveAsset: (target, source) => { assets.push(target); return base.resolveAsset(target, source); },
    }));
    expect(html).toContain('<a href="n/docs/alpha/">alpha</a>');
    expect(html).toContain('<a class="asset" href="assets/deadbeef.png">file</a>');
    expect(html).toContain('href="https://example.com" rel="noopener noreferrer"');
    expect(html).toContain("More <em>detail</em>");
    expect(notes).toEqual(["alpha"]);
    expect(assets).toEqual(["img.png", "https://example.com"]);
  });

  test("keeps missing and duplicate normalized labels visibly unresolved", () => {
    const html = renderMarkdownToHtml([
      "Missing[^absent], duplicate[^é], and case-sensitive[^É].",
      "",
      "[^é]: First retained body.",
      "    First retained continuation.",
      "[^é]: Second retained body.",
      "    Second retained continuation.",
      "[^É]: A separate label.",
    ].join("\n"), context());
    expect(html.match(/class="unresolved footnote-reference"/gu)).toHaveLength(2);
    expect(html.match(/class="unresolved footnote-definition"/gu)).toHaveLength(2);
    expect(html).toContain("First retained continuation.");
    expect(html).toContain("Second retained continuation.");
    expect(html).toContain('id="wordcell:footnote:1" tabindex="-1">A separate label.');
    expect(html.match(/role="doc-noteref"/gu)).toHaveLength(1);
  });

  test("leaves frontmatter, code, comments, and quoted definitions inert", () => {
    const html = renderMarkdownToHtml([
      "---", "[^front]: Hidden frontmatter.", "---",
      "`[^source]`[^source] and ``[^source]``[^source].",
      "", "```md", "[^fenced]: Not a definition.", "[^source]", "```",
      "", "    [^indented]: Not a definition.", "    [^source]", "",
      "<!--", "[^html]: Hidden comment.", "[^source]", "-->",
      "%%", "[^obsidian]: Hidden comment.", "[^source]", "%%",
      "> [^source]: A quoted definition stays literal.",
      ">     Quoted continuation.", "",
      "> Quoted prose[^source].", "",
      "Missing[^front][^fenced][^indented][^html][^obsidian].", "",
      "[^source]: Real source.",
    ].join("\n"), context());
    expect(html).toContain("<code>[^source]</code><sup><a");
    expect(html).toContain("[^fenced]: Not a definition.");
    expect(html).toContain("[^indented]: Not a definition.");
    expect(html).toContain("[^source]: A quoted definition stays literal.");
    expect(html).toContain("Quoted continuation.");
    expect(html).not.toContain("Hidden comment");
    expect(html).not.toContain("Hidden frontmatter");
    expect(html.match(/role="doc-noteref"/gu)).toHaveLength(3);
    expect(html.match(/class="unresolved footnote-reference"/gu)).toHaveLength(5);
    expect(html.match(/id="wordcell:footnote:\d+"/gu)).toHaveLength(1);
  });

  test("preserves multiline inline code and keeps unmatched delimiters local", () => {
    const html = renderMarkdownToHtml([
      "Before `code", "[^hidden]: Still code.", "<!-- still code -->", "end`[^source].", "",
      "An unmatched `delimiter", "", "[^source]: A source with `code", "    <!-- literal --> end`.",
      "", "Missing[^hidden].",
    ].join("\n"), context());
    expect(html).toContain("<code>code [^hidden]: Still code. &lt;!-- still code --&gt; end</code><sup><a");
    expect(html).toContain("A source with <code>code &lt;!-- literal --&gt; end</code>.");
    expect(html.match(/role="doc-noteref"/gu)).toHaveLength(1);
    expect(html).toContain('class="unresolved footnote-reference" aria-label="Unresolved footnote">[^hidden]');
  });

  test("strips comments in headings, lists, tables, and quotes without activating their contents", () => {
    const html = renderMarkdownToHtml([
      "# Heading <!-- [^source] --> visible[^source]",
      "- Item %% [^source] %% visible[^source]", "",
      "| Header <!-- [^source] --> |", "| --- |", "| Cell[^source] |", "",
      "> <!--", "> [^source]", "> -->", "> Visible[^source].", "",
      "> ```md", "> <!-- [^source] -->", "> ```", "",
      "[^source]: Source.",
    ].join("\n"), context());
    expect(html.match(/role="doc-noteref"/gu)).toHaveLength(4);
    expect(html).toContain("<pre><code class=\"language-md\">&lt;!-- [^source] --&gt;</code></pre>");
  });

  test("treats an indented top-level list marker as inert code", () => {
    const html = renderMarkdownToHtml("    - [^source]\n\n[^source]: Source.\n", context());
    expect(html).toContain("<pre><code>- [^source]</code></pre>");
    expect(html).not.toContain('role="doc-noteref"');
  });

  test("bounds label bytes and accepts case-sensitive Unicode labels", () => {
    for (const label of ["a".repeat(128), "é".repeat(64), "a\u030a\u0301".repeat(64), "文:م.λ_१-한"]) {
      const html = renderMarkdownToHtml(`Claim[^${label}].\n\n[^${label}]: Source.`, context());
      expect(html).toContain('role="doc-noteref"');
      expect(html).toContain('id="wordcell:footnote:1"');
    }
    for (const label of ["a".repeat(129), "é".repeat(65), "two words", "", "😀", "bad\\label", '<script onload="x">']) {
      const html = renderMarkdownToHtml(`Claim[^${label}].\n\n[^${label}]: Retained body.`, context());
      expect(html).not.toContain('role="doc-noteref"');
      expect(html).toContain("Retained body.");
      expect(html).toContain('class="unresolved footnote-definition"');
      expect(html).not.toContain('<script');
    }
  });

  test("bounds body bytes and lines while retaining rejected text", () => {
    for (const body of ["a".repeat(8_192), "é".repeat(4_096), "First" + "\n    x".repeat(31)]) {
      const html = renderMarkdownToHtml(`Claim[^a].\n\n[^a]: ${body}`, context());
      expect(html).toContain('role="doc-noteref"');
    }
    for (const body of ["a".repeat(8_193), "é".repeat(4_097), "First" + "\n    x".repeat(32)]) {
      const html = renderMarkdownToHtml(`Claim[^a].\n\n[^a]: ${body}\n    Final retained continuation.`, context());
      expect(html).not.toContain('role="doc-noteref"');
      expect(html).toContain('class="unresolved footnote-definition"');
      expect(html).toContain("Final retained continuation.");
    }
    expect(renderMarkdownToHtml("Claim[^a].\n\n[^a]:", context())).toContain('class="unresolved footnote-definition"');
  });

  test("does not normalize invalid raw labels by deleting their comments", () => {
    const html = renderMarkdownToHtml("Claim[^a].\n\n[^a<!-- hidden -->]: Invalid body.\n", context());
    expect(html).not.toContain('role="doc-noteref"');
    expect(html).toContain('class="unresolved footnote-definition"');
    expect(html).not.toContain("hidden");
  });

  test("disables all footnote admission at 257 definitions", () => {
    for (const count of [256, 257]) {
      const definitions = Array.from({ length: count }, (_, index) => `[^n${index}]: Body ${index}.`);
      const html = renderMarkdownToHtml(`Claim[^n0][^n${count - 1}].\n\n${definitions.join("\n")}`, context());
      expect(html.match(/role="doc-noteref"/gu)?.length ?? 0).toBe(count === 256 ? 2 : 0);
      expect(html.match(/class="unresolved footnote-definition"/gu)?.length ?? 0).toBe(count === 256 ? 0 : 257);
      expect(html).toContain(`Body ${count - 1}.`);
    }
  });

  test("limits linked references and preserves each excess marker visibly", () => {
    const html = renderMarkdownToHtml(`${"[^a]".repeat(2_049)}\n\n[^a]: Source.`, context());
    expect(html.match(/role="doc-noteref"/gu)).toHaveLength(2_048);
    expect(html.match(/role="doc-backlink"/gu)).toHaveLength(2_048);
    expect(html.match(/class="unresolved footnote-reference"/gu)).toHaveLength(1);
    expect(html).toContain('id="wordcell:footnote-ref:1:2048"');
    expect(html).not.toContain('id="wordcell:footnote-ref:1:2049"');
  });

  test("keeps cycles, explicit link labels, and escaped markers literal", () => {
    const html = renderMarkdownToHtml([
      "Claim[^a]. [^b](https://example.com) \\[^a].", "",
      "[^a]: Points to [^b] and [^a].", "[^b]: Points back to [^a].",
    ].join("\n"), context());
    expect(html.match(/role="doc-noteref"/gu)).toHaveLength(1);
    expect(html).toContain('href="https://example.com" rel="noopener noreferrer">^b</a>');
    expect(html).toContain("Points to [^b] and [^a].");
    expect(html).toContain("Points back to [^a].");
    expect(html).not.toMatch(/<a\b[^>]*>[^<]*<a\b/u);
  });

  test("retains unsupported nested-bracket link labels without nesting anchors", () => {
    const html = renderMarkdownToHtml("[See [^a]](https://example.com)\n\n[^a]: Source.", context());
    expect(html).toContain("<p>[See <sup><a");
    expect(html).toContain("](https://example.com)</p>");
    expect(html).not.toContain('href="https://example.com"');
    expect(html).not.toMatch(/<a\b[^>]*>[\s\S]*?<a\b[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/a>/u);
    expect(html.match(/role="doc-noteref"/gu)).toHaveLength(1);
  });

  test("keeps HTML and unsafe URLs inert in footnote bodies", () => {
    const html = renderMarkdownToHtml([
      "Claim[^safe].", "",
      '[^safe]: <script>alert(1)</script> <img src=x onerror="evil()"> [bad](javascript:alert(1)) [data](data:text/html,x) ![remote](https://example.com/image.png)',
    ].join("\n"), context());
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain('href="https://example.com/image.png"');
  });

  test("keeps all heading and navigation IDs unique across quoted blocks", () => {
    const html = renderMarkdownToHtml([
      "# Repeat", "# Repeat-2", "# Repeat", "> # Repeat", "# wordcell:footnote:1",
      "# wordcell:footnote-ref:1:1", "Claim[^a].", "", "> Again[^a].", "", "[^a]: Source.",
    ].join("\n"), context());
    const ids = [...html.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html.match(/role="doc-noteref"/gu)).toHaveLength(2);
  });
});
