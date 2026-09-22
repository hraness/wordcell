import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePublishedRelease } from "../app/publication";

const site = join(import.meta.dir, "..");
const read = async (path: string): Promise<string> => await readFile(join(site, path), "utf8");

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function stableVersion(value: unknown, label: string): readonly [bigint, bigint, bigint] {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string.`);
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.exec(value);
  if (match === null) throw new TypeError(`${label} must be a stable version.`);
  return [BigInt(match[1]!), BigInt(match[2]!), BigInt(match[3]!)];
}

function compare(left: readonly [bigint, bigint, bigint], right: readonly [bigint, bigint, bigint]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index]! > right[index]! ? 1 : -1;
  }
  return 0;
}

describe("Wordcell site source contract", () => {
  test("advertises only a verified published release that does not exceed the source version", async () => {
    const [home, publication, packageSource] = await Promise.all([
      read("app/page.tsx"),
      read("published-release.json"),
      readFile(join(site, "..", "package.json"), "utf8"),
    ]);
    const publishedRelease = record(JSON.parse(publication) as unknown, "published release");
    const packageJson = record(JSON.parse(packageSource) as unknown, "source package");
    expect(Object.keys(publishedRelease).sort()).toEqual(["verificationRun", "version"]);
    const admitted = parsePublishedRelease(publishedRelease);
    if (admitted === null) {
      expect(home).toContain("First Wordcell release in preparation");
      return;
    }
    const published = stableVersion(admitted.version, "published version");
    const source = stableVersion(packageJson.version, "source version");
    expect(compare(published, source)).toBeLessThanOrEqual(0);
    expect(publishedRelease.verificationRun).toMatch(/^https:\/\/github\.com\/hraness\/(?:kb|wordcell)\/actions\/runs\/[1-9][0-9]*$/u);
    expect(home).toContain('import { publishedRelease } from "./publication"');
    expect(home).toContain("const releaseVersion = publishedRelease?.version;");
    expect(home).not.toContain("package.json");
    expect(home).toContain("href={publishedRelease.verificationRun}");
  });

  test("renders the README landing identity and the shared Ask AI links", async () => {
    const [packageJson, home, docs, generated] = await Promise.all([
      read("package.json"),
      read("app/page.tsx"),
      read("app/docs/page.tsx"),
      read("app/readme.generated.ts"),
    ]);
    expect(packageJson).toContain('"@hraness/ui": "github:hraness/ui#v0.5.16"');
    expect(packageJson).toContain('"@hraness/design-kit": "github:hraness/design-kit#v0.11.1"');
    expect(home).toContain('import { AskAiAboutThis } from "@hraness/ui"');
    expect(home).toContain('<AskAiAboutThis className="ask-ai" url="https://wordcell.io" />');
    expect(docs).toContain('<AskAiAboutThis className="ask-ai" url="https://wordcell.io/docs" />');
    expect(generated).toContain('export const readmeTitle = "Wordcell";');
    expect(generated).toContain("export const readmeHtml = ");
  });

  test("uses the shared design-kit fonts and marketing grammar", async () => {
    const globals = await read("app/globals.css");
    expect(globals).toContain('@import "@hraness/design-kit/fonts.css"');
    expect(globals).toContain('@import "@hraness/design-kit/product-marketing.css"');
    expect(globals).toContain('@import "../wordcell/wordcell-theme.css"');
    expect(globals).not.toMatch(/Georgia|Times New Roman/u);
  });

  test("keeps the sitemap and robots on the canonical origin", async () => {
    const [sitemap, robots] = await Promise.all([read("public/sitemap.xml"), read("public/robots.txt")]);
    expect(sitemap).toContain("<loc>https://wordcell.io/</loc>");
    expect(sitemap).toContain("<loc>https://wordcell.io/docs</loc>");
    expect(sitemap).toContain("<loc>https://wordcell.io/developers</loc>");
    expect(sitemap).toContain("<loc>https://wordcell.io/docs/overview</loc>");
    const { docCatalog } = await import("../app/docs/catalog");
    for (const entry of docCatalog) {
      expect(sitemap).toContain(`<loc>https://wordcell.io/docs/${entry.slug}</loc>`);
    }
    expect(robots).toContain("Sitemap: https://wordcell.io/sitemap.xml");
  });
});


test("publication metadata fails closed on malformed or partially verified releases", () => {
  expect(parsePublishedRelease({ version: null, verificationRun: null })).toBeNull();
  const verificationRun = "https://github.com/hraness/wordcell/actions/runs/123";
  expect(parsePublishedRelease({ version: "0.20.0", verificationRun })).toEqual({ version: "0.20.0", verificationRun });
  for (const value of [null, {}, { version: "0.20.0", verificationRun: null }, { version: "0.20.0", verificationRun: "https://example.com" }, { version: "9007199254740992.0.0", verificationRun }, { version: "0.20.0", verificationRun, extra: true }]) {
    expect(() => parsePublishedRelease(value)).toThrow();
  }
});


test("loads the immutable material after Paper and editorial styling", async () => {
  const [css, layout, checker] = await Promise.all([read("app/globals.css"), read("app/layout.tsx"), read("scripts/check-paper-theme.mjs")]);
  const materialImport = '@import "../vendor/hraness-lantern/lantern-material.css";';
  expect(css).toContain(materialImport);
  expect(css.indexOf(materialImport)).toBeGreaterThan(css.indexOf('product-marketing-preset.css";'));
  expect(layout).toContain('data-hraness-material="lantern"');
  expect(checker).toContain('import { checkLanternMaterialSnapshot } from "../vendor/hraness-lantern/check.mjs"');
  expect(checker).toContain("await checkLanternMaterialSnapshot();");
});

test("registers the footer layer after UI layers in one stylesheet", async () => {
  const [css, layout] = await Promise.all([read("app/globals.css"), read("app/layout.tsx")]);
  const footer = '@import "@hraness/site-footer/styles.css";';
  expect(css).toContain(footer);
  expect(css.indexOf(footer)).toBeGreaterThan(css.indexOf('@import "@hraness/ui/styles.css";'));
  expect(css.indexOf(footer)).toBeGreaterThan(css.indexOf('lantern-material.css";'));
  expect(layout).not.toContain('import "@hraness/site-footer/styles.css"');
});

test("adopts the shared palette contract with Paper as the default appearance", async () => {
  const [layout, home, bootstrap, css, packageJson] = await Promise.all([
    read("app/layout.tsx"),
    read("app/page.tsx"),
    read("browser/theme-bootstrap.ts"),
    read("app/globals.css"),
    read("package.json"),
  ]);
  expect(layout).toContain('data-palette="paper"');
  expect(layout).toContain('getDesignPaletteTheme("paper", "light")');
  expect(layout).toContain('src="/theme-bootstrap.js"');
  expect(layout).toContain('<DesignPaletteProvider defaultPreference={{ palette: "paper", mode: "system" }}>');
  expect(layout).toContain("suppressHydrationWarning");
  // The single appearance control sits at the rightmost header action.
  expect(home).toContain('trailing={<ThemeMenuButton aria-label="Appearance" />}');
  // The blocking bootstrap keeps Paper as the system-following default.
  expect(bootstrap).toContain("initDesignPalette");
  expect(bootstrap).toContain('palette: "paper", mode: "system"');
  // Palette themes and the semantic bridge load before the product theme.
  expect(css).toContain('@import "@hraness/design-kit/palettes.css";');
  expect(css.indexOf('palettes.css')).toBeLessThan(css.indexOf("wordcell/wordcell-theme"));
  expect(packageJson).toContain('"build:theme"');
});

test("adopts the wordcell product theme on the shared foundations", async () => {
  const [layout, theme, components] = await Promise.all([
    read("app/layout.tsx"),
    read("wordcell/wordcell-theme.css"),
    read("wordcell/wordcell.css"),
  ]);
  expect(layout).toContain('data-hraness-theme="wordcell"');
  // The theme owns the complete standalone token surface for the default
  // paper path, like the shared themes it sits beside.
  expect(theme).toContain('[data-hraness-theme="wordcell"]');
  expect(theme).toContain("--ui-foreground: var(--foreground)");
  expect(theme).toContain("--ui-ring: var(--focus)");
  expect(theme).toContain("forced-colors: active");
  expect(theme).toContain("color-scheme");
  // Component motion stays decorative: pointer-transparent and collapsible.
  expect(components).toContain("prefers-reduced-motion: reduce");
  expect(components).toContain("forced-colors: active");
  expect(components).toContain("pointer-events: none");
});

test("pins the shared footer release and leaves attribution to the package", async () => {
  const [packageJson, layout, home, docs, css] = await Promise.all([
    read("package.json"),
    read("app/layout.tsx"),
    read("app/page.tsx"),
    read("app/docs/page.tsx"),
    read("app/globals.css"),
  ]);
  expect(packageJson).toContain('"@hraness/site-footer": "github:hraness/site-footer#v0.15.0"');
  expect(layout).toContain('import { HranessSiteFooter } from "@hraness/site-footer/react"');
  expect(layout).toMatch(/<HranessSiteFooter\b[^>]*placement="flow"/u);
  for (const source of [home, docs, css]) {
    expect(source).not.toContain("Ben Guo");
    expect(source).not.toContain("Built by Ben");
    expect(source).not.toContain("MarketingMaker");
    expect(source).not.toContain("hraness-marketing-maker");
  }
});


test("public payload numbers stay tied to the committed evidence receipt", async () => {
  const [home, readme, receiptSource] = await Promise.all([
    read("app/page.tsx"),
    readFile(join(site, "..", "README.md"), "utf8"),
    readFile(join(site, "..", "docs/product-evidence.json"), "utf8"),
  ]);
  const receipt = record(JSON.parse(receiptSource) as unknown, "evidence receipt");
  const aggregate = record(receipt.aggregate, "evidence aggregate");
  expect(aggregate.queries).toBe(4);
  expect(record(receipt.corpus, "evidence corpus").noteCount).toBe(7);
  const number = (value: unknown): string => {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new TypeError("Evidence byte count must be an integer.");
    return new Intl.NumberFormat("en-US").format(value);
  };
  for (const text of [home, readme]) {
    expect(text).toContain(number(aggregate.packedBytes));
    expect(text).toContain(number(aggregate.selectedFullNoteBytes));
    expect(text).toContain("80% fewer UTF-8 bytes");
  }
  expect(Math.round(Number(aggregate.reductionVsSelectedFullNotesPercent))).toBe(80);
});
