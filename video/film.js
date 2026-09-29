/**
 * Launch film choreography.
 *
 * Every visible value is a pure function of the frame time: each frame resets
 * what it touches, measures layout, then writes styles. A frame renders the
 * same whether it is requested first, last, twice, or alone, which is what
 * `slopcamera html render` and `slopcamera html still` rely on.
 *
 * build.ts bundles this file with the helpers into film.html.
 */
import {
  camera, cameraBetween, cameraTransform, clamp, crossfade, cursor, drawMark, easings, kin, lerp,
  placeCursor, prog, show, split, spring,
} from "@hraness/slopcamera/local/html-film";
import { filmTimeline, formatValue } from "./timeline.ts";

const cfg = window.__FILM__;
const overlay = window.SlopcameraOverlay;
const copy = cfg.copy;
const T = filmTimeline(copy);
const $ = id => document.getElementById(id);
const W = cfg.width;
const H = cfg.height;
const { inOutCubic, inOutQuart, outCubic, outQuint, outExpo } = easings;

// ------------------------------------------------------------------ setup

/** Fills every [data-copy] element from film.json, then splits it for kinetic type. */
function fillCopy() {
  for (const el of document.querySelectorAll("[data-copy]")) {
    const value = el.dataset.copy.split(".").reduce((node, key) => node?.[key], copy);
    if (typeof value !== "string") throw new Error(`film.json has no copy for ${el.dataset.copy}`);
    el.textContent = value;
    split(el);
  }
}

/** The cold-open collage: cloned cards on a tilted plane. */
const tiles = [];
function buildCollage() {
  const cards = [...$("open-src").children];
  const columns = 4;
  const rows = 4;
  for (let i = 0; i < columns * rows; i++) {
    const tile = document.createElement("div");
    tile.className = "open-tile";
    tile.append(cards[i % cards.length].cloneNode(true));
    $("open-grid").append(tile);
    const column = i % columns;
    const row = Math.floor(i / columns);
    tiles.push({ el: tile, column, row, delay: ((i * 7) % 11) * 0.06 });
  }
}

/** Product steps: one copy block and one progress dot each. */
const steps = [];
function buildSteps() {
  copy.steps.forEach((step, index) => {
    const block = document.createElement("div");
    block.className = "walk-step";
    const num = document.createElement("span");
    num.className = "kin walk-num";
    num.textContent = `${String(index + 1).padStart(2, "0")} / ${String(copy.steps.length).padStart(2, "0")}`;
    const heading = document.createElement("h2");
    heading.className = "kin walk-h";
    heading.textContent = step.heading;
    const body = document.createElement("p");
    body.className = "kin walk-p";
    body.textContent = step.body;
    block.append(num, heading, body);
    $("walk-copy").append(block);
    [num, heading, body].forEach(el => split(el));
    const dot = document.createElement("span");
    dot.className = "walk-dot";
    const fill = document.createElement("i");
    dot.append(fill);
    $("walk-dots").append(dot);
    steps.push({ ...step, id: `step-${index + 1}`, block, num, heading, body, fill });
  });
}

/** Proof: one counter per fact. */
const proofs = [];
function buildProof() {
  for (const item of copy.proof.items) {
    const box = document.createElement("div");
    box.className = "proof-item";
    const value = document.createElement("span");
    value.className = "proof-value";
    const label = document.createElement("span");
    label.className = "proof-label";
    label.textContent = item.label;
    box.append(value, label);
    $("proof-row").append(box);
    proofs.push({ ...item, box, valueEl: value });
  }
}

// ----------------------------------------------------------------- layout

/** Where the copy, dots and product window sit for this aspect. */
function layout() {
  if (W / H > 1.3) {
    return {
      copy: { x: W * 0.07, y: H * 0.34, w: W * 0.29 },
      dots: { x: W * 0.07, y: H * 0.72 },
      win: { x: W * 0.41, y: H * 0.11, w: W * 0.53, h: H * 0.78 },
    };
  }
  const tall = H / W > 1.3;
  return {
    copy: { x: W * 0.08, y: H * (tall ? 0.07 : 0.06), w: W * 0.84 },
    dots: { x: W * 0.08, y: H * (tall ? 0.255 : 0.3) },
    win: { x: W * 0.06, y: H * (tall ? 0.3 : 0.36), w: W * 0.88, h: H * (tall ? 0.63 : 0.58) },
  };
}
const L = layout();

function place(el, box) {
  el.style.left = `${box.x}px`;
  el.style.top = `${box.y}px`;
  if (box.w !== undefined) el.style.width = `${box.w}px`;
  if (box.h !== undefined) el.style.height = `${box.h}px`;
}

/** An element's rectangle in surface coordinates, measured with the camera reset. */
function surfaceRect(name) {
  const el = $("win-surface").querySelector(`[data-film="${name}"]`);
  if (el === null) throw new Error(`The product mockup has no [data-film="${name}"] element.`);
  const surface = $("win-surface");
  const origin = surface.getBoundingClientRect();
  // Undo any scale on the window or surface so the result is in layout pixels.
  const k = surface.offsetWidth > 0 ? surface.offsetWidth / origin.width : 1;
  const r = el.getBoundingClientRect();
  return { x: (r.left - origin.left) * k, y: (r.top - origin.top) * k, w: r.width * k, h: r.height * k, el };
}

// ------------------------------------------------------------------ scenes

function background(t) {
  const walkStart = T.act("step-1").start;
  const toPaper = crossfade(t, walkStart - 0.2, 0.9);
  // Back to night while the proof leaves, so the limits card lands on a settled ground.
  const toNight = crossfade(t, T.act("limits").start - 0.55, 0.6);
  const paper = toPaper.in * toNight.out;
  $("bg-paper").style.opacity = String(paper);
  show($("bg-paper"), paper > 0);
}

function coldOpen(t) {
  const s = $("s-open");
  const on = T.active(t, "open");
  show(s, on);
  if (!on) return;
  const local = T.local(t, "open");
  const end = T.act("open").end;
  const tileW = 520 * cfg.unit;
  const gapX = tileW * 1.08;
  const gapY = tileW * 0.46;
  const drift = local * 34 * cfg.unit;
  $("open-grid").style.transform = `rotateX(${lerp(24, 16, outCubic(prog(t, 0, end)))}deg) rotateZ(-8deg) scale(${lerp(1.18, 1.3, prog(t, 0, end)).toFixed(4)})`;
  for (const tile of tiles) {
    const x = W / 2 + (tile.column - 1.5) * gapX - tileW / 2 + (tile.row % 2) * gapX * 0.5;
    const y = H / 2 + (tile.row - 1.5) * gapY - gapY / 2 - drift;
    const rise = spring(local - 0.1 - tile.delay, 1.1, 0.8);
    tile.el.style.opacity = String(clamp(rise) * (1 - prog(t, end - 0.6, end)));
    tile.el.style.transform = `translate3d(${x.toFixed(2)}px, ${(y + (1 - rise) * 80 * cfg.unit).toFixed(2)}px, 0)`;
  }
  $("open-scrim").style.opacity = String(inOutCubic(prog(local, 0.7, 1.5)));
  const [first, second] = s.querySelectorAll(".open-line");
  // The second line waits for the first to leave, so words never stack.
  kin(first, local, 0.9, 2.45);
  kin(second, local, 3.05, 4.55);
}

function title(t) {
  const s = $("s-title");
  const on = T.active(t, "title");
  show(s, on);
  if (!on) return;
  const local = T.local(t, "title");
  const outAt = T.act("title").duration - 0.75;
  kin($("title-word"), local, 0.15, outAt, { stagger: 0.07, duration: 1.0 });
  kin($("title-promise"), local, 0.75, outAt + 0.05, { stagger: 0.035 });
}

/** The mark draws around the title, then opens into the product window. */
function mark(t) {
  const el = $("mark");
  const titleStart = T.act("title").start;
  const walkStart = T.act("step-1").start;
  const drawn = outQuint(prog(t, titleStart + 0.9, titleStart + 2.1));
  const morph = inOutQuart(prog(t, walkStart - 0.15, walkStart + 0.85));
  const fade = 1 - prog(t, walkStart + 0.8, walkStart + 1.2);
  if (drawn <= 0 || fade <= 0) {
    show(el, false);
    return;
  }
  show(el, true);
  el.style.transform = "";
  // Measure the title even after its scene has closed, then restore it.
  const scene = $("s-title");
  const display = scene.style.display;
  scene.style.display = "";
  const word = $("title-word");
  const wordBox = { x: word.offsetLeft, y: word.offsetTop, w: word.offsetWidth, h: word.offsetHeight };
  scene.style.display = display;
  const pad = 42 * cfg.unit;
  const from = { x: wordBox.x - pad, y: wordBox.y - pad * 0.6, w: wordBox.w + pad * 2, h: wordBox.h + pad * 1.2 };
  const to = L.win;
  drawMark({ box: el, svg: $("mark-svg"), rect: $("mark-rect") }, {
    x: lerp(from.x, to.x, morph),
    y: lerp(from.y, to.y, morph),
    w: lerp(from.w, to.w, morph),
    h: lerp(from.h, to.h, morph),
    radius: lerp(20, 18, morph) * cfg.unit,
    stroke: lerp(5, 2, morph) * cfg.unit,
    drawn,
    opacity: fade,
  });
}

/** Camera target for a step, in window coordinates. */
function stepCamera(step, baseZoom, content, rects) {
  return camera({
    viewport: { w: L.win.w, h: L.win.h },
    content,
    focus: rects.get(step.focus),
    zoom: Math.max(baseZoom, Math.min(baseZoom * (step.zoom ?? 1.45), 1.4)),
    anchor: 0.45,
  });
}

function walk(t) {
  const s = $("s-walk");
  const first = T.act("step-1");
  const last = T.act(steps.at(-1).id);
  const on = t >= first.start && t < last.end;
  show(s, on);
  if (!on) return;

  place($("walk-copy"), L.copy);
  place($("walk-dots"), L.dots);
  place($("win"), L.win);

  // Window entrance: grows out of the mark, then settles with a spring.
  const enter = spring(t - first.start - 0.45, 1.1, 0.78);
  const leave = inOutCubic(prog(t, last.end - 0.7, last.end));
  $("win").style.opacity = String(clamp(enter * 1.4) * (1 - leave));
  $("win").style.transform = `translate3d(0, ${((1 - enter) * 40 - leave * 30) * cfg.unit}px, 0) scale(${lerp(0.94, 1, enter).toFixed(4)})`;

  // Camera: measure with the transform reset, then glide between steps.
  const surface = $("win-surface");
  surface.style.transform = "";
  for (const el of surface.querySelectorAll("[data-film-state]")) el.removeAttribute("data-film-state");
  surface.style.minHeight = "";
  const content = { w: surface.offsetWidth, h: surface.offsetHeight };
  const baseZoom = L.win.w / content.w;
  // Measure every target while the camera is reset; the transform below would skew the rects.
  const rects = new Map();
  for (const step of steps) {
    for (const name of [step.focus, step.target, step.highlight]) {
      if (name !== undefined && !rects.has(name)) rects.set(name, surfaceRect(name));
    }
  }
  const rest = camera({ viewport: { w: L.win.w, h: L.win.h }, content, focus: { x: 0, y: 0, w: content.w, h: 0 }, zoom: baseZoom, anchor: 0 });
  let cam = rest;
  let previous = rest;
  for (const step of steps) {
    const act = T.act(step.id);
    const target = stepCamera(step, baseZoom, content, rects);
    cam = cameraBetween(previous, target, inOutQuart(prog(t, act.start + 0.2, act.start + 1.4)));
    if (t < act.end) break;
    previous = target;
  }
  cam = cameraBetween(cam, rest, inOutCubic(prog(t, last.end - 1.4, last.end - 0.4)));
  surface.style.transform = cameraTransform(cam);
  // Paint the mockup's own page below its natural height, so a short mockup in a tall
  // window never leaves a blank band. The camera above still frames the measured content.
  surface.style.minHeight = `${Math.ceil(Math.max(content.h, (L.win.h - cam.ty) / cam.z))}px`;

  // Copy, dots, cursor and highlight for each step.
  const toWindow = (x, y) => ({ x: cam.tx + x * cam.z, y: cam.ty + y * cam.z });
  const aims = steps.map(step => {
    const target = rects.get(step.target);
    return { target, ...toWindow(target.x + target.w * 0.5, target.y + target.h * 0.55) };
  });
  let cursorState = { x: 0, y: 0, opacity: 0, press: 0 };
  let highlight = null;
  steps.forEach((step, index) => {
    const act = T.act(step.id);
    const local = t - act.start;
    const isLast = index === steps.length - 1;
    const outAt = isLast ? act.duration - 0.9 : act.duration - 0.45;
    const visible = t >= act.start - 0.1 && t < act.end + 0.8;
    show(step.block, visible);
    if (visible) {
      kin(step.num, local, 0.35, outAt, { stagger: 0.03 });
      kin(step.heading, local, 0.45, outAt + 0.03, { stagger: 0.06 });
      kin(step.body, local, 0.7, outAt + 0.06, { stagger: 0.025 });
    }
    step.fill.style.transform = `scaleX(${prog(t, act.start, act.end).toFixed(4)})`;

    const { target } = aims[index];
    const clickAt = act.start + 1.95;
    if (step.after !== undefined && t >= clickAt + 0.12) target.el.setAttribute("data-film-state", step.after);
    if (t >= act.start && t < act.end) {
      const aim = { x: aims[index].x, y: aims[index].y };
      const from = index === 0
        ? { at: act.start + 0.6, x: L.win.w * 0.82, y: L.win.h * 0.95 }
        : { at: act.start + 0.3, x: aims[index - 1].x, y: aims[index - 1].y };
      const keys = [from, { at: act.start + 1.5, ...aim }, { at: clickAt, ...aim, click: true }];
      // The cursor fades in on the first step and out after the last click.
      cursorState = cursor(t, keys, { hold: isLast ? 1.2 : 99, fade: 0.3 });
      if (index > 0) cursorState = { ...cursorState, opacity: isLast ? 1 - prog(t, clickAt + 1.2, clickAt + 1.5) : 1 };
      if (step.highlight !== undefined) {
        const hl = rects.get(step.highlight);
        const a = toWindow(hl.x, hl.y);
        const pad = 8;
        highlight = {
          x: a.x - pad, y: a.y - pad, w: hl.w * cam.z + pad * 2, h: hl.h * cam.z + pad * 2,
          radius: 12, stroke: 3,
          drawn: outQuint(prog(t, clickAt + 0.05, clickAt + 0.85)),
          opacity: 1 - prog(t, act.end - 0.5, act.end - 0.2),
        };
      }
    }
  });
  placeCursor($("win-cursor"), cursorState);
  $("win-ripple").style.opacity = String(cursorState.press * 0.9);
  $("win-ripple").style.transform = `scale(${lerp(0.4, 1.6, cursorState.press).toFixed(4)})`;
  const hl = { box: $("hl"), svg: $("hl-svg"), rect: $("hl-rect") };
  if (highlight === null) show(hl.box, false);
  else {
    show(hl.box, true);
    drawMark(hl, highlight);
  }
}

function proof(t) {
  const s = $("s-proof");
  const on = T.active(t, "proof");
  show(s, on);
  if (!on) return;
  const local = T.local(t, "proof");
  const outAt = T.act("proof").duration - 0.6;
  proofs.forEach((item, index) => {
    const start = 0.35 + index * 0.18;
    const rise = spring(local - start, 1.2, 0.75);
    const leave = inOutCubic(prog(local, outAt, outAt + 0.5));
    item.box.style.opacity = String(clamp(rise * 1.5) * (1 - leave));
    item.box.style.transform = `translate3d(0, ${((1 - rise) * 60 - leave * 40) * cfg.unit}px, 0)`;
    const count = outExpo(prog(local, start, start + 1.5));
    item.valueEl.textContent = `${formatValue(item.value * count, item.value)}${item.suffix ?? ""}`;
  });
  kin(s.querySelector(".proof-caption"), local, 1.2, outAt, { stagger: 0.03 });
}

function limits(t) {
  const s = $("s-limits");
  const on = T.active(t, "limits");
  show(s, on);
  if (!on) return;
  const local = T.local(t, "limits");
  const outAt = T.act("limits").duration - 0.55;
  const rise = spring(local - 0.05, 1.0, 0.85);
  const leave = inOutCubic(prog(local, outAt, outAt + 0.5));
  const card = $("limits-card");
  card.style.opacity = String(clamp(rise * 1.3) * (1 - leave));
  card.style.transform = `scale(${lerp(0.96, 1, rise).toFixed(4)})`;
  kin(card.querySelector(".limits-h"), local, 0.2, outAt, { stagger: 0.03 });
  kin(card.querySelector(".limits-p"), local, 0.4, outAt, { stagger: 0.045 });
}

function endCard(t) {
  const s = $("s-end");
  const on = t >= T.act("end").start;
  show(s, on);
  if (!on) return;
  const local = T.local(t, "end");
  kin($("end-word"), local, 0.2, Infinity, { stagger: 0.07, duration: 1.0 });
  kin(s.querySelector(".end-url"), local, 0.8);
  kin(s.querySelector(".end-line"), local, 1.05, Infinity, { stagger: 0.03 });
}

// ------------------------------------------------------------------ frame

function render(t) {
  background(t);
  coldOpen(t);
  title(t);
  walk(t);
  mark(t);
  proof(t);
  limits(t);
  endCard(t);
}

fillCopy();
buildCollage();
buildSteps();
buildProof();

overlay.ready(Promise.all(
  cfg.fonts.map(font => new FontFace(font.family, `url("${overlay.asset(font.name)}") format("woff2")`, { weight: font.weight, style: "normal" })
    .load()
    .then(face => document.fonts.add(face))),
).then(() => document.fonts.ready));

overlay.onFrame(({ timeMs }) => render(timeMs / 1000));
