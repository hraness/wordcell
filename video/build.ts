/**
 * Builds the launch film's Slopcamera scene.
 *
 * Renders the product mockups to static markup, inlines the shared mockup
 * stylesheet (when @hraness/design-kit is installed), product CSS, the film's
 * own CSS and its bundled choreography into out/film.html, copies fonts next
 * to it as declared resources, and writes:
 *
 * - out/scene.json, validated against the Slopcamera scene schema
 * - out/captions.vtt, from the same timeline the film plays
 * - out/beats.json, each act's start and end for per-beat clips
 *
 * Usage: bun build.ts [--aspect 16:9|1:1|9:16] [--scale 0.5] [--fps 15] [--until 3]
 * --scale, --fps and --until make a quick draft without changing the layout.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createElement, Fragment, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { captionsFromTimeline } from "@hraness/slopcamera/local/html-film";
import { HtmlSceneInputSchema } from "@hraness/slopcamera/local/html-overlay";

import { OpenCard, ProductMockup } from "./mockups.tsx";
import { filmTimeline, type FilmCopy } from "./timeline.ts";

interface FilmFont { readonly name: string; readonly family: string; readonly weight: string; readonly file: string }
interface FilmConfig {
  readonly name: string;
  readonly aspect: Aspect;
  readonly fps: number;
  readonly seed: number;
  readonly background: string;
  readonly accent: string;
  readonly productCss?: readonly string[];
  readonly fonts?: readonly FilmFont[];
  readonly copy: FilmCopy;
}

const ASPECTS = { "16:9": [1920, 1080], "1:1": [1080, 1080], "9:16": [1080, 1920] } as const;
type Aspect = keyof typeof ASPECTS;

const here = dirname(new URL(import.meta.url).pathname);
const out = join(here, "out");
mkdirSync(join(out, "fonts"), { recursive: true });

const film = JSON.parse(readFileSync(join(here, "film.json"), "utf8")) as FilmConfig;
function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
const aspect = (flag("--aspect") ?? film.aspect) as Aspect;
if (!(aspect in ASPECTS)) throw new Error(`--aspect must be one of ${Object.keys(ASPECTS).join(", ")}.`);
const scale = Number(flag("--scale") ?? "1");
const fps = Number(flag("--fps") ?? String(film.fps));
if (!(scale > 0 && scale <= 1)) throw new Error("--scale must be above 0 and at most 1.");
if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error("--fps must be a whole number from 1 to 60.");
/** --until 3 renders only the first seconds, for a quick check of the path. */
const until = flag("--until") === undefined ? Infinity : Number(flag("--until"));
if (!(until > 0)) throw new Error("--until must be more than 0 seconds.");
/** The film lays out at full size; the canvas is that size times --scale. */
const [width, height] = ASPECTS[aspect];
const unit = Math.min(width, height) / 1080;
const even = (value: number) => Math.max(2, Math.round(value * scale / 2) * 2);
const canvasWidth = even(width);
const canvasHeight = even(height);

const timeline = filmTimeline(film.copy);

/** Slopcamera's own package root, for the default fonts. */
const slopcameraRoot = resolve(dirname(Bun.resolveSync("@hraness/slopcamera/local/html-film", here)), "../../..");
const fonts: readonly FilmFont[] = film.fonts ?? [
  { name: "sans-book", family: "Film Sans", weight: "400", file: join(slopcameraRoot, "src/assets/fonts/nebula-sans/NebulaSans-Book.woff2") },
  { name: "sans-bold", family: "Film Sans", weight: "700", file: join(slopcameraRoot, "src/assets/fonts/nebula-sans/NebulaSans-Bold.woff2") },
];
for (const font of fonts) copyFileSync(resolve(here, font.file), join(out, "fonts", `${font.name}.woff2`));

/**
 * The shared mockup stylesheet. The mockups are the site's own components, so
 * the stylesheet resolves from the site's @hraness/design-kit pin; a film
 * without it would draw empty windows, so a missing stylesheet is an error.
 */
function kitCss(): string {
  const path = Bun.resolveSync("@hraness/design-kit/mockups.css", join(here, "../site"));
  return readFileSync(path, "utf8");
}

async function bundle(entry: string): Promise<string> {
  const result = await Bun.build({ entrypoints: [join(here, entry)], target: "browser", format: "iife", minify: { whitespace: true, syntax: true } });
  if (!result.success) throw new AggregateError(result.logs, `Could not bundle ${entry}.`);
  return (await result.outputs[0]!.text()).replaceAll("</script", "<\\/script");
}

/**
 * Mockup slots: each `{{ID}}` in film.html becomes the static markup of its
 * element. Swap in your site's real mockup components here.
 */
const mockupSlots: readonly { readonly id: string; readonly element: ReactElement }[] = [
  { id: "PRODUCT", element: createElement(ProductMockup, { url: `app.${film.copy.url}` }) },
  { id: "OPEN_CARDS", element: createElement(Fragment, null, ...Array.from({ length: 6 }, (_, index) => createElement(OpenCard, { index, key: index }))) },
];

const read = (path: string) => readFileSync(join(here, path), "utf8");
const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
/** Seconds rounded to the millisecond, so beats.json reads cleanly as post source text. */
const ms = (value: number) => Math.round(value * 1000) / 1000;
const slots: Record<string, string> = {
  TITLE: escapeHtml(film.name),
  ASPECT: aspect,
  WIDTH: String(width),
  HEIGHT: String(height),
  CANVAS_WIDTH: String(canvasWidth),
  CANVAS_HEIGHT: String(canvasHeight),
  ZOOM: String(canvasWidth / width),
  UNIT: String(unit),
  ACCENT: film.accent,
  KIT_CSS: kitCss(),
  PRODUCT_CSS: (film.productCss ?? []).map(path => readFileSync(resolve(here, path), "utf8")).join("\n"),
  FILM_CSS: read("film.css"),
  FILM_JS: await bundle("film.js"),
  CONFIG: JSON.stringify({ width, height, unit, copy: film.copy, fonts: fonts.map(({ name, family, weight }) => ({ name, family, weight })) }).replaceAll("<", "\\u003c"),
  ...Object.fromEntries(mockupSlots.map(({ id, element }) => [id, renderToStaticMarkup(element)])),
};

let html = read("film.html");
for (const [key, value] of Object.entries(slots)) html = html.replaceAll(`{{${key}}}`, () => value);
const missing = /\{\{[A-Z_]+\}\}/u.exec(html);
if (missing !== null) throw new Error(`Unfilled slot ${missing[0]}`);
writeFileSync(join(out, "film.html"), html);

const scene = HtmlSceneInputSchema.parse({
  kind: "slopcamera.html-scene",
  schemaVersion: 1,
  name: film.name,
  document: { path: "out/film.html" },
  canvas: { width: canvasWidth, height: canvasHeight, deviceScaleFactor: 1 },
  timing: { durationUs: Math.round(Math.min(timeline.duration, until) * 1_000_000), fps },
  libraries: [],
  seed: film.seed,
  background: film.background,
  parameters: {},
  resources: fonts.map(font => ({
    name: font.name,
    path: `out/fonts/${font.name}.woff2`,
    urlPath: `fonts/${font.name}.woff2`,
    mediaType: "font/woff2",
  })),
});
writeFileSync(join(out, "scene.json"), `${JSON.stringify(scene, null, 2)}\n`);
writeFileSync(join(out, "captions.vtt"), captionsFromTimeline(timeline));
writeFileSync(join(out, "beats.json"), `${JSON.stringify({
  duration: ms(Math.min(timeline.duration, until)),
  beats: timeline.acts
    .filter(({ start }) => start < until)
    .map(({ id, start, end, caption }) => ({ id, start: ms(start), end: ms(Math.min(end, until)), caption })),
}, null, 2)}\n`);

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`out/film.html ${kb} KB of 1024 KB; ${aspect} ${canvasWidth}x${canvasHeight} at ${fps} fps; ${Math.min(timeline.duration, until).toFixed(1)} s; ${timeline.acts.length} acts`);
