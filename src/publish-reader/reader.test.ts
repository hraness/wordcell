import { beforeAll, describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

let readerCode = "";
beforeAll(async () => {
  const bundle = await Bun.build({
    entrypoints: [new URL("./reader.ts", import.meta.url).pathname],
    target: "browser",
    format: "iife",
  });
  expect(bundle.success).toBe(true);
  readerCode = await bundle.outputs[0]!.text();
});

type Event = { deltaY?: number; clientX?: number; clientY?: number; preventDefault(): void };
class Element {
  hidden = false;
  textContent = "";
  style = { cursor: "" };
  width = 0;
  height = 0;
  attributes = new Map<string, string>();
  children = new Map<string, Element>();
  listeners = new Map<string, (event: Event) => void>();
  setAttribute(key: string, value: string): void { this.attributes.set(key, value); }
  getAttribute(key: string): string | null { return this.attributes.get(key) ?? null; }
  querySelector(selector: string): Element | null { return this.children.get(selector) ?? null; }
  appendChild(child: unknown): unknown { return child; }
  addEventListener(name: string, listener: (event: Event) => void): void { this.listeners.set(name, listener); }
  remove(): void {}
  focus(): void {}
}

type Circle = { x: number; y: number; radius: number };
type Label = { x: number; y: number };
async function graphCanvas(width: number, height: number, ratio: number) {
  const circles: Circle[] = [];
  const labels: Label[] = [];
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const context = {
    font: "",
    setTransform(a: number, _b: number, _c: number, _d: number, e: number, f: number) {
      scale = a / ratio; tx = e / ratio; ty = f / ratio;
    },
    clearRect() { circles.length = 0; labels.length = 0; },
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, fill() {}, stroke() {}, setLineDash() {},
    arc(x: number, y: number, radius: number) {
      circles.push({ x: x * scale + tx, y: y * scale + ty, radius: radius * scale });
    },
    fillText(_text: string, x: number, y: number) { labels.push({ x: x * scale + tx, y: y * scale + ty }); },
  };
  const canvas = Object.assign(new Element(), {
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  });
  const shell = new Element();
  const status = new Element();
  shell.children.set("[data-wordcell-graph-canvas]", canvas);
  shell.children.set("[data-wordcell-graph-status]", status);
  const searchButton = new Element();
  const manifest = {
    format: "hraness.wordcell.site.v1",
    site: { title: "Graph", basePath: "/" },
    generated: { by: "@hraness/wordcell", version: "0.0.0-test" },
    source: { selection: {}, notes: 3, digest: `sha256:${"0".repeat(64)}` },
    paths: {
      catalog: "catalog.json", graph: "graph.json", docs: "index/docs.json", terms: "index/terms.json",
      postingsPrefix: "index/c/", notePrefix: "n/", assetPrefix: "assets/", readerPrefix: "reader/",
    },
    search: { mode: "exact", content: "inline", shards: 0, hash: "fnv1a32-8bit" },
    counts: { notes: 3, assets: 0, bytes: 100 }, truncated: {},
  };
  const responses = new Map<string, unknown>([
    ["./manifest.json", manifest],
    ["./catalog.json", { format: "hraness.wordcell.site-catalog.v1", entries: [
      { i: 0, s: "a", t: "Alpha" }, { i: 1, s: "b", t: "Beta" }, { i: 2, s: "c", t: "Isolated" },
    ] }],
    ["./graph.json", { format: "hraness.wordcell.site-graph.v1", edges: [{ s: 0, t: 1, k: "link" }] }],
  ]);
  runInNewContext(readerCode, {
    document: {
      body: new Element(), documentElement: new Element(), createElement: () => new Element(),
      querySelector: (selector: string) => selector === "[data-wordcell-search]" ? searchButton
        : selector === "[data-wordcell-graph]" ? shell : null,
      querySelectorAll: () => [], addEventListener() {},
    },
    location: { hash: "", assign() {} }, devicePixelRatio: ratio, TextEncoder,
    fetch: async (url: string) => ({ ok: responses.has(url), status: 200, json: async () => responses.get(url) }),
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(status.hidden).toBe(true);
  return { canvas, circles, labels, scale: () => scale, font: () => Number.parseFloat(context.font) * scale };
}

describe("graph node screen size", () => {
  test.each([
    { width: 375, height: 320, ratio: 1 },
    { width: 375, height: 320, ratio: 2 },
    { width: 1280, height: 720, ratio: 1 },
    { width: 1280, height: 720, ratio: 2 },
  ])("keeps visible circles and label clearance at $width px and DPR $ratio", async ({ width, height, ratio }) => {
    const graph = await graphCanvas(width, height, ratio);
    const checkFrame = () => {
      expect(graph.circles).toHaveLength(3);
      expect(graph.labels).toHaveLength(3);
      for (const [index, expectedRadius] of [3.8, 3.8, 3].entries()) {
        const circle = graph.circles[index]!;
        const label = graph.labels[index]!;
        expect(circle.radius).toBeCloseTo(expectedRadius, 8);
        expect(label.x).toBeCloseTo(circle.x, 8);
        expect(label.y - circle.y - circle.radius).toBeCloseTo(4, 8);
      }
      expect(graph.font()).toBeCloseTo(11, 8);
    };
    checkFrame();
    for (const [deltaY, expectedScale] of [[10_000, 0.05], [-10_000, 8]] as const) {
      graph.canvas.listeners.get("wheel")?.({ deltaY, clientX: width / 2, clientY: height / 2, preventDefault() {} });
      expect(graph.scale()).toBe(expectedScale);
      checkFrame();
    }
  });
});
