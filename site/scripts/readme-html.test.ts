import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { LANDING_END, LANDING_START, readmeLanding, renderMarkdownHtml, renderReadmeHtml } from "./readme-html.ts";
import { docsResolver } from "./sync-docs.ts";
import { docCatalog } from "../app/docs/catalog.ts";
import { docHtml } from "../app/docs/docs.generated.ts";
import { publishedRelease } from "../app/publication.ts";
import { readmeHtml, readmeLead, readmeTitle, readmeVersion } from "../app/readme.generated.ts";
import { publishedReadme } from "./published-readme.ts";

const repository = join(import.meta.dir, "..", "..");

test("site installation coordinates stay on the admitted release while new source is prepared", () => {
  const source = [
    "bun add https://github.com/hraness/wordcell/releases/download/v0.21.1/hraness-wordcell-0.21.1.tgz",
    "npm install @hraness/wordcell@0.21.1",
    "bunx skills add hraness/wordcell#v0.21.1 --skill wordcell",
    "Version 0.21.1 and historical @hraness/wordcell@0.20.0 remain prose.",
    "Unrelated @hraness/wordcell@0.21.10 and hraness/wordcell#v0.21.1-beta.1 stay literal.",
  ].join("\n");
  const projected = publishedReadme(source, "0.21.1", "0.21.0");
  expect(projected).toContain("/v0.21.0/hraness-wordcell-0.21.0.tgz");
  expect(projected).toContain("npm install @hraness/wordcell@0.21.0");
  expect(projected).toContain("hraness/wordcell#v0.21.0 --skill wordcell");
  expect(projected).toContain("Version 0.21.1 and historical @hraness/wordcell@0.20.0 remain prose.");
  expect(projected).toContain("Unrelated @hraness/wordcell@0.21.10 and hraness/wordcell#v0.21.1-beta.1 stay literal.");
  expect(publishedReadme(source, "0.21.1", "0.21.1")).toBe(source);
  expect(() => publishedReadme(source, "0.21.1", "latest")).toThrow();
  expect(() => publishedReadme(source, "0.21.1", null)).toThrow("without an admitted release");
});

test("documentation install coordinates follow admission without changing historical references", () => {
  const source = [
    "# Installation",
    "",
    "```sh",
    "bun add https://github.com/hraness/wordcell/releases/download/v0.22.4/hraness-wordcell-0.22.4.tgz",
    "npm install @hraness/wordcell@0.22.4",
    "bunx skills add hraness/wordcell#v0.22.4 --skill wordcell",
    "```",
    "",
    "Historical [archive](https://github.com/hraness/wordcell/releases/download/v0.20.0/hraness-wordcell-0.20.0.tgz).",
  ].join("\n");
  const html = renderMarkdownHtml(publishedReadme(source, "0.22.4", "0.22.3"));
  expect(html).toContain("/v0.22.3/hraness-wordcell-0.22.3.tgz");
  expect(html).toContain("npm install @hraness/wordcell@0.22.3");
  expect(html).toContain("hraness/wordcell#v0.22.3 --skill wordcell");
  expect(html).toContain("/v0.20.0/hraness-wordcell-0.20.0.tgz");
  expect(html).not.toContain("0.22.4");
});

test("every generated documentation page uses the admitted installation coordinates", async () => {
  const manifest = JSON.parse(await readFile(join(repository, "package.json"), "utf8")) as { version: string };
  const resolver = docsResolver(new Set(docCatalog.map(entry => entry.slug)));
  for (const entry of docCatalog) {
    const source = await readFile(join(repository, "docs", `${entry.slug}.md`), "utf8");
    const expected = renderMarkdownHtml(publishedReadme(source, manifest.version, publishedRelease?.version ?? null), resolver, "docs");
    expect(docHtml[entry.slug]).toBe(expected);
  }
});

test("renders the repository README with stable heading fragments and repository-rooted relative links", async () => {
  const source = await readFile(join(repository, "README.md"), "utf8");
  const html = renderReadmeHtml(source);
  expect(html).toContain('<h2 id="install">Install</h2>');
  expect(html).toContain('<h3 id="the-kb-vault-format">The kb vault format</h3>');
  expect(html).toContain('href="https://github.com/hraness/wordcell/blob/main/SECURITY.md"');
  expect(html).not.toContain("<script");
});

test("extracts the landing block between the shared Hraness markers", async () => {
  const source = await readFile(join(repository, "README.md"), "utf8");
  expect(source.indexOf(LANDING_START)).toBeGreaterThanOrEqual(0);
  expect(source.indexOf(LANDING_END)).toBeGreaterThan(source.indexOf(LANDING_START));
  const landing = readmeLanding(source);
  expect(landing.title).toBe("Wordcell");
  expect(landing.lead).toContain("decisions, plans, and sources as Markdown files beside your code");
  expect(landing.markdown).toContain("wordcell init kb");
});

test("rejects unsafe README link targets", () => {
  expect(() => renderReadmeHtml("[x](javascript:alert(1))")).toThrow("disallowed URL scheme");
  expect(() => renderReadmeHtml("[x](//evil.example)")).toThrow("protocol-relative");
  expect(() => renderReadmeHtml("[x](#missing)")).toThrow("no rendered heading");
});


test("omits repository landing markers and renders the skill badge as a durable text link", async () => {
  const source = await Bun.file(new URL("../../README.md", import.meta.url)).text();
  const html = renderReadmeHtml(source);
  expect(html).not.toContain("hraness:wordcell-landing");
  expect(html).not.toContain("https://skills.sh/b/");
  expect(html).toContain("Install the Agent Skill");
  expect(html).not.toContain("assets/agent-skill.svg");
});

test("replacing the skill badge preserves the following paragraph boundary", () => {
  for (const newline of ["\n", "\r\n"]) {
    const html = renderReadmeHtml([
      "[![Agent Skill](https://example.com/badge.svg)](https://example.com/skill) \t",
      "",
      "Markdown knowledge base that gives agents the decisions behind code.",
    ].join(newline));
    expect(html).toContain('<p><a href="https://example.com/skill">Install the Agent Skill</a></p>');
    expect(html).toContain('<p>Markdown knowledge base that gives agents the decisions behind code.</p>');
  }
});


describe("README HTML boundary", () => {
  test("derives stable fragments from parsed heading text", () => {
    const html = renderReadmeHtml([
      "## **Hello** &amp; `world`",
      "## **Hello** &amp; `world`",
      "[First](#hello--world) [Again](#hello--world-1)",
    ].join("\n\n"));
    expect(html).toContain('<h2 id="hello--world"><strong>Hello</strong> &amp; <code>world</code></h2>');
    expect(html).toContain('<h2 id="hello--world-1">');
  });

  test("keeps raw and nested malformed HTML inert, including inside headings", () => {
    const payloads = [
      '<script>alert(1)</script>',
      '<sc<script>ript>alert(1)</sc</script>ript>',
      '<img src="x" onerror="alert(1)">',
      '<svg onload="alert(1)"><a href="javascript:alert(1)">x</a></svg>',
      '<textarea><img src=x onerror=alert(1)></textarea>',
    ];
    for (const payload of payloads) {
      const html = renderReadmeHtml(`## Literal ${payload}\n\n${payload}`);
      const elements: string[] = [];
      const ids: string[] = [];
      new HTMLRewriter().on("*", {
        element(element) {
          elements.push(element.tagName);
          for (const [name] of element.attributes) expect(name).not.toMatch(/^on/iu);
          const id = element.getAttribute("id");
          if (id !== null) ids.push(id);
        },
      }).transform(html);
      expect(elements).toEqual(["h2", "p"]);
      expect(ids).toHaveLength(1);
      expect(ids[0]).toMatch(/^[\p{Letter}\p{Mark}\p{Number}_-]+$/u);
      expect(html).toContain("&lt;");
    }
  });

  test("rejects executable and protocol-relative Markdown URLs", () => {
    for (const target of ["javascript:alert", "java&#x73;cript:alert", "data:text/html,bad", "//example.com"]) {
      expect(() => renderReadmeHtml(`[link](${target})`)).toThrow();
      expect(() => renderReadmeHtml(`![image](${target})`)).toThrow();
    }
    expect(renderReadmeHtml("[Reference](docs/example.md)")).toContain(
      'href="https://github.com/hraness/wordcell/blob/main/docs/example.md"',
    );
  });
});


describe("documentation link resolution", () => {
  const slugs = new Set(docCatalog.map((entry) => entry.slug));
  const render = (source: string) => renderMarkdownHtml(source, docsResolver(slugs), "docs");

  test("routes repository-relative Markdown to site pages and keeps other files on GitHub", () => {
    const html = render([
      "## Heading",
      "",
      "[guide](capture.md) [anchored](publish.md#preview-and-publish-a-slice) [readme](../README.md#install)",
      "[security](../SECURITY.md) [receipt](evaluations/wordcell-scifact-20260919.json)",
    ].join("\n"));
    expect(html).toContain('href="/docs/capture"');
    expect(html).toContain('href="/docs/publish#preview-and-publish-a-slice"');
    expect(html).toContain('href="/docs/overview#install"');
    expect(html).toContain('href="https://github.com/hraness/wordcell/blob/main/SECURITY.md"');
    expect(html).toContain('href="https://github.com/hraness/wordcell/blob/main/docs/evaluations/wordcell-scifact-20260919.json"');
  });

  test("fails closed on uncataloged documentation and path escapes", () => {
    expect(() => render("[x](secret.md)")).toThrow("uncataloged");
    expect(() => render("[x](../../outside.md)")).toThrow("escapes the repository");
  });
});

test("the generated docs match the source README and identify its source release", async () => {
  const source = await readFile(join(repository, "README.md"), "utf8");
  const manifest = JSON.parse(await readFile(join(repository, "package.json"), "utf8")) as { version: string };
  const landing = readmeLanding(source);
  expect(readmeVersion).toBe(manifest.version);
  expect(readmeTitle).toBe(landing.title);
  expect(readmeLead).toBe(landing.lead);
  expect(readmeHtml).toBe(renderReadmeHtml(publishedReadme(source, manifest.version, publishedRelease?.version ?? null)));
});


test("the README landing selection rejects ambiguous boundaries and ignores surrounding prose", () => {
  const selection = `${LANDING_START}\n# Wordcell\n\nA local knowledge base.\n${LANDING_END}`;
  const expected = readmeLanding(selection);
  expect(readmeLanding(`Before\n\n${selection}\n\nAfter`)).toEqual(expected);
  for (const invalid of [
    `${selection}\n${LANDING_END}`,
    `${LANDING_START}\n${selection}`,
    `${LANDING_END}\n# Wordcell\nA local knowledge base.\n${LANDING_START}`,
    `${LANDING_START}\n${LANDING_END}`,
    `prefix ${selection}`,
  ]) expect(() => readmeLanding(invalid)).toThrow();
});
