import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LaunchPostBeats, launchBeatToc } from "../app/blog/launch-post";
import { launchBeats, socialKit } from "../wordcell/launch/beats";
import { launchFacts } from "../wordcell/launch/facts";
import { publishedRelease } from "../app/publication";

describe("Introducing Wordcell launch beats", () => {
  const html = renderToStaticMarkup(<LaunchPostBeats />);

  test("every beat renders with its anchor and one illustration", () => {
    for (const beat of launchBeats) {
      expect(html).toContain(`id="beat-${beat.id}"`);
    }
    expect(html.match(/class="wordcell-beat-visual"/gu)?.length).toBe(launchBeats.length);
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
    expect(html).toContain(launchFacts.graphNotes.value);
  });

  test("the film's numbers are the launch facts", async () => {
    const film = await Bun.file(new URL("../../video/film.json", import.meta.url)).json() as { copy: { proof: { items: { value: number }[] } } };
    expect(film.copy.proof.items.map((item) => item.value.toLocaleString("en-US"))).toEqual([launchFacts.graphNotes.value, launchFacts.graphDepth.value]);
  });

  test("the vision beat cites the essay the name comes from", () => {
    expect(html).toContain("https://read.roonscape.ai/p/a-song-of-shapes-and-words");
    expect(html).toContain("A Song of Shapes and Words");
  });

  test("the social kit is cut from the beats and names no competitor", () => {
    const text = JSON.stringify(socialKit);
    for (const name of ["Supermemory", "Mem0", "Basic Memory", "QMD", "Mastodon"]) expect(text).not.toContain(name);
    expect(text).toContain("https://wordcell.io/blog/introducing-wordcell");
  });

  test("the table of contents lists the beats before the walkthrough", () => {
    const toc = launchBeatToc();
    expect(toc.length).toBe(launchBeats.length + 1);
    expect(toc.at(-1)?.href).toBe("#the-details");
  });
});

describe("site/launch/social-kit.md", () => {
  test("matches the beats and facts; run `bun run launch:kit` after changing them", async () => {
    const { renderSocialKitMarkdown } = await import("../wordcell/launch/social-kit-markdown");
    expect(await Bun.file(new URL("../launch/social-kit.md", import.meta.url)).text()).toBe(renderSocialKitMarkdown());
  });
});
