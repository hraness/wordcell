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

  test("facts come from their sources", () => {
    expect(launchFacts.graphNotes.value).toBe("4,000");
    expect(launchFacts.bunVersion.value).toBe("1.3.14");
    expect(publishedRelease).not.toBeNull();
    expect(html).toContain(launchFacts.graphNotes.value);
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
