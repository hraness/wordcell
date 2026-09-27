import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { renderMarkdownToHtml, type PublishRenderContext } from "./publish-markdown.js";

const context: PublishRenderContext = {
  source: "notes/report.md",
  resolveNote: () => undefined,
  resolveAsset: () => undefined,
  noteHref: (slug) => `n/${slug}/`,
};

function ids(html: string): string[] {
  return [...html.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1] ?? "");
}

function footnoteLinks(html: string): string[] {
  return [...html.matchAll(/\bhref="#(wordcell:footnote(?:-ref)?:[^"]+)"/gu)].map((match) => match[1] ?? "");
}

describe("published footnote properties", () => {
  test("every reference and backlink has one deterministic target across heading and quote collisions", () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        suffix: fc.constantFrom("é", "é", "文", "λ", "م", "१", "한", "a:b_c.d-e"),
        repeats: fc.integer({ min: 1, max: 6 }),
      }), { minLength: 1, maxLength: 25 }),
      (notes) => {
        const labels = notes.map((note, index) => `n${index}-${note.suffix}`);
        const references = notes.map((note, index) => Array.from({ length: note.repeats }, (_, occurrence) =>
          `${occurrence % 2 === 0 ? "> " : ""}Claim[^${labels[index]}].`).join("\n\n"));
        const definitions = labels.toReversed().map((label) => `[^${label}]: A retained source.`);
        const markdown = [
          "# Repeat", "# Repeat-2", "# Repeat", "> # Repeat", "# wordcell:footnote:1", "# wordcell:footnote-ref:1:1",
          ...references, ...definitions,
        ].join("\n\n");
        const html = renderMarkdownToHtml(markdown, context);
        expect(renderMarkdownToHtml(markdown, context)).toBe(html);
        const targets = ids(html);
        expect(new Set(targets).size).toBe(targets.length);
        for (const target of footnoteLinks(html)) expect(targets.filter((id) => id === target)).toHaveLength(1);
        const count = notes.reduce((sum, note) => sum + note.repeats, 0);
        expect(html.match(/role="doc-noteref"/gu)).toHaveLength(count);
        expect(html.match(/role="doc-backlink"/gu)).toHaveLength(count);
        expect(html.match(/id="wordcell:footnote:\d+"/gu)).toHaveLength(notes.length);
        for (let index = 1; index <= notes.length; index += 1) expect(targets).toContain(`wordcell:footnote:${index}`);
      },
    ), { numRuns: 80 });
  });

  test("canonical-equivalent duplicate labels never select an arbitrary definition", () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom("é", "ñ", "가", "Å", "ü"), { minLength: 1, maxLength: 20 }),
      fc.integer({ min: 1, max: 12 }),
      (characters, repeats) => {
        const composed = characters.join("");
        const decomposed = composed.normalize("NFD");
        const html = renderMarkdownToHtml(`${`Claim[^${composed}]. `.repeat(repeats)}\n\n[^${composed}]: First body.\n    First continuation.\n[^${decomposed}]: Second body.\n    Second continuation.`, context);
        expect(html).not.toContain('role="doc-noteref"');
        expect(html).not.toContain('class="footnotes"');
        expect(html.match(/class="unresolved footnote-definition"/gu)).toHaveLength(2);
        expect(html).toContain("First continuation.");
        expect(html).toContain("Second continuation.");
      },
    ));
  });

  test("hostile labels cannot enter generated IDs, HTML, or executable URLs", () => {
    const rawLabel = fc.array(fc.constantFrom(
      "a", "é", "é", "文", "😀", "\u0000", "\u202e", " ", "'", '"', "<", ">", "&", "[", "]", "\\", "`", "_", "-", ":",
    ), { maxLength: 150 }).map((parts) => parts.join(""));
    fc.assert(fc.property(rawLabel, (label) => {
      const markdown = `Claim[^${label}].\n\n[^${label}]: <script>alert(1)</script> [bad](javascript:alert(1)).`;
      const html = renderMarkdownToHtml(markdown, context);
      expect(renderMarkdownToHtml(markdown, context)).toBe(html);
      expect(html).not.toContain("<script");
      expect(html).not.toContain('href="javascript:');
      for (const id of ids(html)) expect(id).toMatch(/^wordcell:footnote(?:-ref)?:\d+(?::\d+)?$/u);
      const targets = ids(html);
      for (const target of footnoteLinks(html)) expect(targets).toContain(target);
    }));
  });

  test("the body byte boundary is independent of Unicode width", () => {
    fc.assert(fc.property(
      fc.constantFrom("a", "é", "界", "😀"),
      fc.integer({ min: 0, max: 16 }),
      (character, excess) => {
        const width = new TextEncoder().encode(character).byteLength;
        const body = character.repeat(Math.floor(8_192 / width)) + "a".repeat(8_192 % width) + "x".repeat(excess);
        const html = renderMarkdownToHtml(`Claim[^a].\n\n[^a]: ${body}`, context);
        expect(html.includes('role="doc-noteref"')).toBe(excess === 0);
        expect(html.includes('class="unresolved footnote-definition"')).toBe(excess !== 0);
        expect(html).not.toContain("�");
        expect(html).toContain(body);
      },
    ), { numRuns: 40 });
  });

  test("definition count overflow cannot retain a partially admitted label set", () => {
    fc.assert(fc.property(fc.integer({ min: 254, max: 260 }), (count) => {
      const definitions = Array.from({ length: count }, (_, index) => `[^n${index}]: Body ${index}.`);
      const html = renderMarkdownToHtml(`First[^n0]. Last[^n${count - 1}].\n\n${definitions.join("\n")}`, context);
      const disabled = count > 256;
      expect(html.includes('class="footnotes"')).toBe(!disabled);
      expect(html.match(/role="doc-noteref"/gu)?.length ?? 0).toBe(disabled ? 0 : 2);
      expect(html.match(/class="unresolved footnote-definition"/gu)?.length ?? 0).toBe(disabled ? count : 0);
      expect(html).toContain(`Body ${count - 1}.`);
    }), { numRuns: 20 });
  });
});
