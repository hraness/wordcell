import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LAUNCH_POST_SLUG, LaunchPostStory } from "../app/blog/launch-post";
import { blogContents, blogHtml } from "../app/blog/blog.generated";
import { launchBeats, socialKit } from "../wordcell/launch/beats";
import { launchFacts } from "../wordcell/launch/facts";
import { publishedRelease } from "../app/publication";

describe("Introducing Wordcell essay", () => {
  const prose = blogHtml[LAUNCH_POST_SLUG]!;
  const html = renderToStaticMarkup(<LaunchPostStory html={prose} />);

  test("the essay starts before its examples and every paragraph survives exactly once", () => {
    const opening = prose.slice(0, prose.indexOf("<h2"));
    expect(html).toContain(opening);
    expect(html.indexOf(opening)).toBeLessThan(html.indexOf("data-wordcell-story-visual"));
    for (const [paragraph] of prose.matchAll(/<p>[\s\S]*?<\/p>/gu)) {
      expect(html.split(paragraph).length - 1).toBe(1);
    }
    expect(html.match(/data-wordcell-story-visual=/gu)?.length).toBe(3);
    expect(html).not.toContain('id="beat-');
    expect(html).not.toContain('id="the-details"');
  });

  test("an edited section cannot silently strand its illustration", () => {
    expect(() => renderToStaticMarkup(<LaunchPostStory html="<p>Incomplete essay.</p>" />)).toThrow("illustration anchor");
  });

  test("facts match the records they name", async () => {
    const root = new URL("../../", import.meta.url);
    const graphModel = await Bun.file(new URL("src/graph-authority-model.ts", root)).text();
    const limit = (name: string) => Number(new RegExp(`\\b${name}: ([\\d_]+),`, "u").exec(graphModel)?.[1]?.replaceAll("_", ""));
    expect<string>(launchFacts.graphNotes.value).toBe(limit("notes").toLocaleString("en-US"));
    expect<string>(launchFacts.graphDepth.value).toBe(String(limit("depth")));
    const pkg = await Bun.file(new URL("package.json", root)).json() as { engines: { bun: string } };
    expect(`>=${launchFacts.bunVersion.value}`).toBe(pkg.engines.bun);
    expect(publishedRelease).not.toBeNull();
    expect<string>(launchFacts.status.value).toBe(`Latest release: v${publishedRelease?.version ?? ""}`);
    expect(launchBeats.some((beat) => beat.facts?.includes("graphNotes"))).toBe(true);
  });

  test("the film's numbers are the launch facts", async () => {
    const film = await Bun.file(new URL("../../video/film.json", import.meta.url)).json() as { copy: { proof: { items: { value: number }[] } } };
    expect(film.copy.proof.items.map((item) => item.value.toLocaleString("en-US"))).toEqual([launchFacts.graphNotes.value, launchFacts.graphDepth.value]);
  });

  test("the vision beat retains the name’s source without leading the essay", () => {
    const vision = launchBeats.find((beat) => beat.part === "vision");
    expect(vision?.post).toContain("A Song of Shapes and Words");
  });

  test("the social kit is cut from the beats and names no competitor", () => {
    const text = JSON.stringify(socialKit);
    for (const name of ["Supermemory", "Mem0", "Basic Memory", "QMD", "Mastodon"]) expect(text).not.toContain(name);
    expect(text).toContain("https://wordcell.io/blog/introducing-wordcell");
  });

  test("the table of contents follows the essay’s own headings", () => {
    const toc = blogContents[LAUNCH_POST_SLUG]!;
    const ids = [...prose.matchAll(/<h2 id="([^"]+)">/gu)].map((match) => `#${match[1]}` as const);
    expect(toc.map((item) => item.href)).toEqual(ids);
    for (const id of ids) expect(html.split(`id="${id.slice(1)}"`).length - 1).toBe(1);
  });

});

describe("site/launch/social-kit.md", () => {
  test("matches the beats and facts; run `bun run launch:kit` after changing them", async () => {
    const { renderSocialKitMarkdown } = await import("../wordcell/launch/social-kit-markdown");
    expect(await Bun.file(new URL("../launch/social-kit.md", import.meta.url)).text()).toBe(renderSocialKitMarkdown());
  });
});
