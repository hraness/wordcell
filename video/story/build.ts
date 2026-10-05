/**
 * Builds a story film from ./story.config.ts into ./build: one self-contained
 * scene.html, a scene request per format, the act timeline, and captions.
 *   bun build.ts [--fps 15]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Act, Palette, Story } from "./story.ts";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const fpsOverride = args.includes("--fps") ? Number(args[args.indexOf("--fps") + 1]) : undefined;
const configPath = resolve(process.cwd(), "story.config.ts");
if (!existsSync(configPath)) throw new Error("Run from a film directory that has story.config.ts.");
const loaded = (await import(pathToFileURL(configPath).href)) as { default: () => Story | Promise<Story> };
const story = await loaded.default();

// ---------- validation ----------
const fail = (message: string): never => { throw new Error(`story: ${message}`); };
if (story.acts.length < 3) fail("a film needs at least three acts");
if (!story.acts.some((act) => act.kind === "reveal")) fail("one act must be the brand reveal");
for (const [index, act] of story.acts.entries()) {
  if (act.kind === "reveal") continue;
  for (const word of act.accents ?? []) if (!act.headline.split(" ").includes(word)) fail(`act ${index + 1} accent "${word}" is not a word of its headline`);
  if (/[!?]$/u.test(act.headline.trim()) && /\?$/u.test(act.headline.trim())) fail(`act ${index + 1} headline is a question; state it`);
  if (/—/u.test(act.headline)) fail(`act ${index + 1} headline uses an em dash`);
}
if (story.end.prompt === undefined && story.end.action === undefined) fail("the end card needs a prompt or an action");

// ---------- timing ----------
const wordsIn = (text: string) => text.split(/\s+/u).filter(Boolean).length;
function actSeconds(act: Act): number {
  if (act.seconds !== undefined) return act.seconds;
  switch (act.kind) {
    case "scatter": return 5.0;
    case "reveal": return 4.0;
    case "chat": return 0.9 + act.exchanges.reduce((sum, ex) => sum + 0.6 + 0.65 + wordsIn(ex.agent) * 0.032 + 1.7 + (ex.chips || ex.card ? 0.9 : 0), 0);
    case "merge": return 1.6 + act.result.rows.length * 0.4 + 2.4 + (act.result.footnote ? 0.5 : 0);
    case "terminal": return 1.0 + act.lines.reduce((sum, line) => sum + (line.cmd !== undefined ? 0.3 + line.cmd.length * 0.026 + 0.3 : 0.11), 0) + 2.0;
    case "stats": return 1.2 + act.items.length * 0.2 + 2.8;
    case "cards": return 1.1 + act.items.length * 0.28 + 2.6;
    case "before-after": return 5.2;
    case "gallery": return 1.2 + act.items.length * 0.35 + 3.0;
  }
}
const END_SECONDS = 6.2;
let cursor = 0;
const timeline = story.acts.map((act, index) => {
  const start = cursor;
  cursor += actSeconds(act);
  return { id: act.id ?? `act-${index + 1}`, kind: act.kind, start: Number(start.toFixed(3)), end: Number(cursor.toFixed(3)) };
});
if (new Set(timeline.map((entry) => entry.id)).size !== timeline.length || timeline.some((entry) => entry.id === "end")) fail("act ids must be unique and not \"end\"");
const endStart = Number(cursor.toFixed(3));
const seconds = Math.ceil((cursor + END_SECONDS) * 10) / 10;
const firstProduct = timeline.findIndex((entry, index) => index > story.acts.findIndex((act) => act.kind === "reveal") && entry.kind !== "reveal");
const posterAt = story.posterAt ?? (firstProduct >= 0 ? Number(((timeline[firstProduct]!.start + timeline[firstProduct]!.end) / 2 + 0.6).toFixed(2)) : endStart + 3);

// ---------- palette ----------
const paletteKeys: (keyof Palette)[] = ["background", "foreground", "muted", "surface", "surfaceRaised", "primary", "primarySoft", "primaryForeground"];
const defaultTokens: Record<keyof Palette, string> = {
  background: "background", foreground: "foreground", muted: "muted", surface: "surface", surfaceRaised: "surface-raised",
  primary: "primary", primarySoft: "primary-soft", primaryForeground: "primary-foreground",
};
const css = story.brand.palette.css ? readFileSync(story.brand.palette.css, "utf8") : "";
const palette = Object.fromEntries(paletteKeys.map((key) => {
  const explicit = story.brand.palette.values?.[key];
  if (explicit) return [key, explicit];
  const token = story.brand.palette.tokens?.[key] ?? defaultTokens[key];
  const match = new RegExp(`--${token}:\\s*light-dark\\(\\s*([^,()]+(?:\\([^)]*\\))?)\\s*,\\s*([^;]+?)\\s*\\)\\s*;`, "u").exec(css);
  if (!match) fail(`palette token --${token} has no light-dark() pair in ${story.brand.palette.css ?? "(no css)"}; pass palette.values.${key}`);
  return [key, match![2]!.trim()];
})) as unknown as Palette;

// ---------- foil, mark, fonts ----------
const dk = story.brand.designKit;
const marketingCss = readFileSync(join(dk, "src/product-marketing.css"), "utf8");
const foilImage = /\.hraness-foil-text,[^{]*\{\s*--hraness-foil-glow: 0;\s*background-image: ([\s\S]+?);\s*-webkit-background-clip: text;/u.exec(marketingCss)?.[1]
  ?? fail("the design kit's .hraness-foil-text recipe moved; update the extraction");
const mime: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2", ".otf": "font/otf", ".ttf": "font/ttf" };
const dataUrl = (path: string) => `data:${mime[extname(path).toLowerCase()] ?? fail(`unsupported file ${path}`)};base64,${readFileSync(path).toString("base64")}`;
const mark = dataUrl(story.brand.mark);
const sans = story.brand.fonts?.sans ?? {
  book: join(dk, "src/fonts/nebula-sans/NebulaSans-Book.woff2"),
  medium: join(dk, "src/fonts/nebula-sans/NebulaSans-Medium.woff2"),
  semibold: join(dk, "src/fonts/nebula-sans/NebulaSans-Semibold.woff2"),
};
const family = story.brand.fonts?.sans?.family ?? "Film Sans";
const monoPath = story.brand.fonts?.mono ?? join(dk, "src/fonts/geist-mono/GeistMono[wght].woff2");
const face = (file: string, weight: string, name = family) => `@font-face{font-family:"${name}";font-weight:${weight};src:url(${dataUrl(file)})}`;
const fontCss = [face(sans.book, "400 450"), face(sans.medium, "500 550"), face(sans.semibold, "600 700"), face(monoPath, "100 900", "Film Mono")].join("\n");

// ---------- write ----------
const formats = story.formats ?? ["wide", "square"];
const sizes = { wide: [1920, 1080], square: [1080, 1080], portrait: [1080, 1920] } as const;
const fpsFor = (format: keyof typeof sizes) => fpsOverride ?? story.fps?.[format] ?? (format === "wide" ? 60 : 30);
// Inline every image an act names, so the scene stays one self-contained file.
const acts = story.acts.map((act) => {
  if (act.kind === "gallery") return { ...act, items: act.items.map((item) => ({ ...item, image: dataUrl(item.image), ...(item.portraitImage ? { portraitImage: dataUrl(item.portraitImage) } : {}) })) };
  if (act.kind === "chat") return { ...act, exchanges: act.exchanges.map((ex) => (ex.card?.image ? { ...ex, card: { ...ex.card, image: dataUrl(ex.card.image) } } : ex)) };
  return act;
});
const film = {
  id: story.id, brand: { wordmark: story.brand.wordmark, markAspect: story.brand.markAspect, tracking: story.brand.headlineTracking ?? "-.032em" },
  acts, end: story.end, timeline, endStart, seconds, sampleLabel: story.sampleLabel ?? "Sample data", fontFamily: family,
};
const cssVars = Object.entries({
  background: palette.background, foreground: palette.foreground, muted: palette.muted, surface: palette.surface,
  "surface-raised": palette.surfaceRaised, primary: palette.primary, "primary-soft": palette.primarySoft, "primary-foreground": palette.primaryForeground,
}).map(([key, value]) => `--${key}:${value};`).join("");
const html = readFileSync(join(here, "story.html"), "utf8")
  .replace("/*__FONTS__*/", () => fontCss)
  .replace("/*__VARS__*/", () => `${cssVars}--foil-image:${foilImage.replace(/\s+/gu, " ")};--mark:url("${mark}");`)
  .replace("/*__FILM__*/", () => `window.__FILM__=${JSON.stringify(film).replaceAll("<", "\\u003c")};`);
const buildDir = resolve(process.cwd(), "build");
mkdirSync(buildDir, { recursive: true });
writeFileSync(join(buildDir, "scene.html"), html);
for (const format of formats) {
  const [width, height] = sizes[format];
  writeFileSync(join(buildDir, `scene-${format}.json`), `${JSON.stringify({
    kind: "slopcamera.html-scene", schemaVersion: 1, name: `${story.id} launch ${format}`,
    document: { path: "build/scene.html" }, canvas: { width, height, deviceScaleFactor: 1 },
    timing: { durationUs: Math.round(seconds * 1_000_000), fps: fpsFor(format) }, libraries: [], seed: 20261004,
    parameters: { format }, resources: [],
  }, null, 2)}\n`);
}

// ---------- captions ----------
function cueText(act: Act): string {
  if (act.kind === "reveal") return `${story.brand.wordmark}\n${act.tagline}`;
  const lines = [act.headline];
  if (act.kind === "chat") for (const ex of act.exchanges) lines.push(`You: ${ex.you}`, `Agent: ${ex.agent}`);
  return lines.join("\n");
}
const endLine = [story.end.lead && story.end.prompt ? `${story.end.lead} “${story.end.prompt}”` : story.end.action ?? story.end.prompt ?? "",
  story.end.terms, [story.end.url, story.end.finePrint].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
const cues: [number, number, string][] = [
  ...story.acts.map((act, index): [number, number, string] => [timeline[index]!.start + 0.25, timeline[index]!.end - 0.05, cueText(act)]),
  [endStart + 0.3, seconds, endLine],
];
const stamp = (value: number, separator: string) => {
  const ms = Math.round(value * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${separator}${pad(ms % 1000, 3)}`;
};
const cueIds = [...timeline.map((entry) => entry.id), "end"];
const captions = (separator: string) => cues.map(([a, b, text], i) => `${cueIds[i]}\n${stamp(a, separator)} --> ${stamp(b, separator)}\n${text}\n`).join("\n");
writeFileSync(join(buildDir, "captions.vtt"), `WEBVTT\n\n${captions(".")}`);
writeFileSync(join(buildDir, "captions.srt"), captions(","));
const stills = [...timeline.map((entry) => Number(((entry.start + entry.end) / 2 + 0.4).toFixed(2))), Number((seconds - 0.6).toFixed(2))];
writeFileSync(join(buildDir, "beats.json"), `${JSON.stringify({ beats: [...timeline.map(({ id, start, end }) => ({ id, start, end })), { id: "end", start: endStart, end: seconds }] }, null, 2)}\n`);
writeFileSync(join(buildDir, "timeline.json"), `${JSON.stringify({ seconds, posterAt, endStart, timeline, stills, formats, palette }, null, 2)}\n`);
console.log(JSON.stringify({ id: story.id, seconds, posterAt, acts: timeline.length, formats, htmlBytes: Buffer.byteLength(html) }));
