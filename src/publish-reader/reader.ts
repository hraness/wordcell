import {
  parseSiteCatalogV1,
  parseSiteDocsV1,
  parseSiteGraphV1,
  parseSiteManifestV1,
  parseSiteNoteV1,
  parseSitePostingsV1,
  parseSiteTermsV1,
  WORDCELL_SITE_LIMITS_V1,
  type WordcellSiteCatalogV1,
  type WordcellSiteDocV1,
  type WordcellSiteManifestV1,
  type WordcellSiteNoteV1,
} from "../publish-model.js";
import {
  layoutSiteGraph,
  siteGraphDegrees,
  siteGraphSeed,
  WORDCELL_SITE_GRAPH_VIEW_LIMIT,
  type SiteGraphLayoutEdge,
  type SiteGraphPoint,
} from "../publish-graph.js";
import {
  comparePublishScores,
  MAX_PUBLISH_PREFIX_EXPANSIONS,
  publishDocMatchesFilters,
  publishMarkRanges,
  publishPrefixTerms,
  publishQuery,
  publishQueryParts,
  publishShardName,
  publishSnippet,
  scorePublishDocument,
  type PublishQuery,
  type PublishQueryFilters,
  type PublishScore,
} from "../publish-search.js";
import {
  wordcellAppearanceBridge,
  wordcellAppearanceModeLabels,
  wordcellAppearanceModes,
  wordcellPaletteLabels,
  wordcellPalettes,
} from "../publish-theme.js";

/**
 * Zero-dependency reference reader bundled into every published site. It
 * progressively enhances static pages with a search overlay powered by the
 * precomputed exact-search index — including tag:/type:/path: field filters
 * and <mark> highlighting — and an interactive pan/zoom map over graph.json
 * on the graph page. Everything runs against the minimal DOM shim below so
 * the package stays on the ES2023 lib — no design-system or framework
 * dependency, and the bundle imports only the pure contract, layout, and
 * search modules.
 */

type FetchResponse = {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
};

type ReaderText = { readonly kind: "text" };
type ReaderNode = ReaderElement | ReaderText;

type CanvasContext2d = {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: number[]): void;
};

type ReaderRect = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

type ReaderElement = {
  className: string;
  textContent: string | null;
  innerHTML: string;
  href: string;
  type: string;
  name: string;
  checked: boolean;
  placeholder: string;
  value: string;
  hidden: boolean;
  width: number;
  height: number;
  readonly style: { cursor: string };
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  querySelector(selector: string): ReaderElement | null;
  getContext(kind: "2d"): CanvasContext2d | null;
  getBoundingClientRect(): ReaderRect;
  appendChild(child: ReaderNode): ReaderNode;
  remove(): void;
  focus(): void;
  addEventListener(name: string, listener: (event: ReaderEvent) => void): void;
};

type ReaderEvent = {
  readonly key?: string;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly deltaY?: number;
  readonly shiftKey?: boolean;
  readonly target?: {
    readonly value?: string;
    readonly tagName?: string;
    closest?(selector: string): ReaderElement | null;
  } | null;
  preventDefault(): void;
};

type ReaderDocument = {
  readonly body: { appendChild(child: ReaderNode): ReaderNode };
  readonly documentElement: ReaderElement;
  querySelector(selector: string): ReaderElement | null;
  querySelectorAll(selector: string): ArrayLike<ReaderElement>;
  createElement(tag: string): ReaderElement;
  createTextNode(text: string): ReaderText;
  addEventListener(name: string, listener: (event: ReaderEvent) => void): void;
};

type ReaderMediaQuery = {
  readonly matches: boolean;
  addEventListener(name: "change", listener: () => void): void;
};

type ReaderLocation = {
  readonly hash?: string;
  assign(url: string): void;
};

const dom = globalThis as unknown as {
  readonly document: ReaderDocument;
  readonly location: ReaderLocation;
  readonly devicePixelRatio?: number;
  fetch(url: string): Promise<FetchResponse>;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
  requestAnimationFrame?(callback: () => void): number;
  getComputedStyle?(element: ReaderElement): { getPropertyValue(name: string): string };
  matchMedia?(query: string): ReaderMediaQuery;
  addEventListener?(name: string, listener: (event: ReaderEvent) => void): void;
};

type SiteIndex = {
  readonly manifest: WordcellSiteManifestV1;
  readonly docs: readonly WordcellSiteDocV1[];
  readonly terms: readonly string[];
  readonly postings: Map<string, Map<string, readonly number[]>>;
  readonly notes: Map<string, WordcellSiteNoteV1>;
  /** Lazily loaded for type: filters; absent catalog disables type matching. */
  catalog: WordcellSiteCatalogV1 | undefined;
};

async function fetchJson(base: string, path: string): Promise<unknown | undefined> {
  const response = await dom.fetch(`${base}${path}`);
  if (!response.ok) return undefined;
  return response.json() as Promise<unknown>;
}

async function loadIndex(base: string): Promise<SiteIndex | undefined> {
  const manifestRaw = await fetchJson(base, "manifest.json");
  if (manifestRaw === undefined) return undefined;
  const manifest = parseSiteManifestV1(manifestRaw);
  const docsRaw = await fetchJson(base, manifest.paths.docs);
  const termsRaw = await fetchJson(base, manifest.paths.terms);
  if (docsRaw === undefined || termsRaw === undefined) return undefined;
  const docs = parseSiteDocsV1(docsRaw);
  const terms = parseSiteTermsV1(termsRaw);
  return {
    manifest,
    docs: docs.docs,
    terms: terms.terms,
    postings: new Map(),
    notes: new Map(),
    catalog: undefined,
  };
}

async function loadShard(
  index: SiteIndex,
  base: string,
  shard: string,
): Promise<Map<string, readonly number[]>> {
  const cached = index.postings.get(shard);
  if (cached !== undefined) return cached;
  const raw = await fetchJson(base, `${index.manifest.paths.postingsPrefix}${shard}.json`);
  const postings = raw === undefined
    ? new Map<string, readonly number[]>()
    : new Map(Object.entries(parseSitePostingsV1(raw).postings));
  index.postings.set(shard, postings);
  return postings;
}

async function loadCatalog(
  index: SiteIndex,
  base: string,
): Promise<WordcellSiteCatalogV1 | undefined> {
  if (index.catalog !== undefined) return index.catalog;
  const raw = await fetchJson(base, index.manifest.paths.catalog);
  if (raw === undefined) return undefined;
  index.catalog = parseSiteCatalogV1(raw);
  return index.catalog;
}

async function hydrate(
  index: SiteIndex,
  base: string,
  slug: string,
): Promise<WordcellSiteNoteV1 | undefined> {
  const cached = index.notes.get(slug);
  if (cached !== undefined) return cached;
  const path = slug === "" ? "index.json" : `${index.manifest.paths.notePrefix}${slug}.json`;
  const raw = await fetchJson(base, path);
  if (raw === undefined) return undefined;
  const note = parseSiteNoteV1(raw);
  index.notes.set(slug, note);
  return note;
}

type ScoredHit = {
  readonly doc: WordcellSiteDocV1;
  readonly score: PublishScore;
};

const FILTER_ONLY_SCORE: PublishScore = Object.freeze({
  score: 0,
  identity: false,
  phraseMatched: false,
  matchedTerms: 0,
});

function hasFilters(filters: PublishQueryFilters): boolean {
  return filters.tags.length + filters.types.length + filters.paths.length > 0;
}

async function search(index: SiteIndex, base: string, raw: string): Promise<ScoredHit[]> {
  const { filters, text } = publishQueryParts(raw);
  const filtered = hasFilters(filters);
  const query = publishQuery(text);
  if (!filtered && query.terms.length === 0 && query.normalized === "") return [];

  // type: filters need the catalog's raw type values; fetch it lazily.
  let typeByIndex: ReadonlyMap<number, string> | undefined;
  if (filters.types.length > 0) {
    const catalog = await loadCatalog(index, base);
    typeByIndex = new Map(
      (catalog?.entries ?? []).map((entry) => [entry.i, entry.type ?? "note"]),
    );
  }

  // Content term admission: inline scans doc.x directly; shard mode expands
  // each query term through the sorted dictionary prefix index, then unions
  // the matching postings. Both reproduce the exact lane's content.includes
  // semantics — a query term matches content containing it as a substring.
  const postingsHits = new Map<number, Set<string>>();
  if (index.manifest.search.content === "shards" && query.terms.length > 0) {
    const expandedByTerm = new Map<string, readonly string[]>();
    const shards = new Set<string>();
    for (const term of query.terms) {
      const expanded = publishPrefixTerms(index.terms, term, MAX_PUBLISH_PREFIX_EXPANSIONS);
      expandedByTerm.set(term, expanded);
      for (const candidate of expanded) shards.add(publishShardName(candidate));
    }
    const tables = new Map<string, Map<string, readonly number[]>>();
    for (const shard of shards) tables.set(shard, await loadShard(index, base, shard));
    for (const doc of index.docs) {
      const hits = new Set<string>();
      for (const term of query.terms) {
        const matched = (expandedByTerm.get(term) ?? []).some((candidate) =>
          tables.get(publishShardName(candidate))?.get(candidate)?.includes(doc.i) === true);
        if (matched) hits.add(term);
      }
      postingsHits.set(doc.i, hits);
    }
  }

  const hits: ScoredHit[] = [];
  for (const doc of index.docs) {
    if (!publishDocMatchesFilters(doc, filters, typeByIndex?.get(doc.i))) continue;
    if (query.terms.length === 0 && query.normalized === "") {
      // Filter-only query: admit every matching document in catalog order.
      hits.push({ doc, score: FILTER_ONLY_SCORE });
      continue;
    }
    const inline = index.manifest.search.content === "inline" ? doc.x : undefined;
    const contentTerms = inline !== undefined
      ? new Set(query.terms.filter((term) => inline.includes(term)))
      : postingsHits.get(doc.i) ?? new Set<string>();
    const scored = scorePublishDocument(
      { doc, contentTerms, ...(inline === undefined ? {} : { contentText: inline }) },
      query,
    );
    if (scored === null) continue;
    hits.push({ doc, score: scored });
  }
  hits.sort((left, right) =>
    comparePublishScores({ i: left.doc.i, ...left.score }, { i: right.doc.i, ...right.score }));
  return hits.slice(0, WORDCELL_SITE_LIMITS_V1.searchResults);
}

function resultHref(base: string, slug: string): string {
  return slug === "" ? base : `${base}n/${encodeURI(slug)}/`;
}

function snippetFor(index: SiteIndex, doc: WordcellSiteDocV1, query: PublishQuery): string {
  const hydrated = index.notes.get(doc.s);
  const text = hydrated?.text ?? doc.x;
  return text === undefined ? doc.p : publishSnippet(text, query, doc.p);
}

/**
 * Append text with matched terms wrapped in <mark>. Ranges come from the pure
 * search module and every span is a DOM text node — no innerHTML, so hostile
 * note text can never inject markup.
 */
function appendMarked(parent: ReaderElement, text: string, terms: readonly string[]): void {
  const display = text.normalize("NFC");
  const ranges = publishMarkRanges(display, terms);
  if (ranges.length === 0) {
    parent.appendChild(dom.document.createTextNode(display));
    return;
  }
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parent.appendChild(dom.document.createTextNode(display.slice(cursor, range.start)));
    }
    const mark = dom.document.createElement("mark");
    mark.textContent = display.slice(range.start, range.end);
    parent.appendChild(mark);
    cursor = range.end;
  }
  if (cursor < display.length) {
    parent.appendChild(dom.document.createTextNode(display.slice(cursor)));
  }
}

function buildOverlay(base: string): {
  readonly open: () => void;
  readonly close: () => void;
} {
  const overlay = dom.document.createElement("div");
  overlay.className = "wordcell-search-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Search");

  const panel = dom.document.createElement("div");
  panel.className = "wordcell-search-panel";

  const input = dom.document.createElement("input");
  input.type = "search";
  input.placeholder = "Search this site… (tag:, type:, path:)";
  input.setAttribute("aria-label", "Search this site");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");

  const status = dom.document.createElement("div");
  status.className = "wordcell-search-status";
  status.setAttribute("role", "status");

  const list = dom.document.createElement("ul");
  list.className = "wordcell-search-results";

  panel.appendChild(input);
  panel.appendChild(status);
  panel.appendChild(list);
  overlay.appendChild(panel);

  let index: SiteIndex | undefined;
  let loading: Promise<SiteIndex | undefined> | undefined;
  let hits: ScoredHit[] = [];
  let active = -1;
  let debounce = 0;

  const render = (): void => {
    list.innerHTML = "";
    let query: PublishQuery | undefined;
    try {
      query = publishQuery(publishQueryParts(input.value).text);
    } catch {
      query = undefined;
    }
    const terms = query?.terms ?? [];
    for (const [position, hit] of hits.entries()) {
      const item = dom.document.createElement("li");
      const link = dom.document.createElement("a");
      link.href = resultHref(base, hit.doc.s);
      link.className = position === active ? "active" : "";
      const title = dom.document.createElement("span");
      title.className = "title";
      appendMarked(title, hit.doc.t, terms);
      const snippet = dom.document.createElement("span");
      snippet.className = "snippet";
      const snippetText = index === undefined || query === undefined || query.terms.length === 0
        ? hit.doc.p
        : snippetFor(index, hit.doc, query);
      appendMarked(snippet, snippetText, terms);
      link.appendChild(title);
      link.appendChild(snippet);
      item.appendChild(link);
      list.appendChild(item);
    }
    status.textContent = hits.length === 0
      ? (input.value.trim() === "" ? "Type to search. Filter with tag:, type:, path:." : "No results.")
      : `${hits.length} result${hits.length === 1 ? "" : "s"}`;
  };

  const run = (): void => {
    void (async () => {
      if (index === undefined) {
        loading ??= loadIndex(base);
        index = await loading;
        if (index === undefined) {
          status.textContent = "Search is unavailable for this site.";
          return;
        }
      }
      try {
        hits = await search(index, base, input.value);
      } catch {
        hits = [];
      }
      active = hits.length === 0 ? -1 : 0;
      render();
      // Hydrate the top hits so postings-mode results still show snippets.
      const current = index;
      void Promise.all(
        hits.slice(0, WORDCELL_SITE_LIMITS_V1.searchHydration)
          .map((hit) => hydrate(current, base, hit.doc.s)),
      ).then(() => render());
    })();
  };

  input.addEventListener("input", () => {
    dom.clearTimeout(debounce);
    debounce = dom.setTimeout(run, 80);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (hits.length > 0) {
        active = Math.min(hits.length - 1, active + 1);
        render();
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (hits.length > 0) {
        active = Math.max(0, active - 1);
        render();
      }
    } else if (event.key === "Enter") {
      const hit = hits[active];
      if (hit !== undefined) {
        event.preventDefault();
        dom.location.assign(resultHref(base, hit.doc.s));
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      overlay.remove();
    }
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });

  return {
    open() {
      dom.document.body.appendChild(overlay);
      hits = [];
      active = -1;
      render();
      input.focus();
      if (index === undefined || input.value.trim() !== "") run();
    },
    close() {
      overlay.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// Interactive graph map over graph.json: seeded deterministic layout, canvas
// rendering, drag pan, wheel zoom, click-to-navigate, hash focus.

type GraphTheme = {
  readonly bg: string;
  readonly fg: string;
  readonly muted: string;
  readonly border: string;
  readonly accent: string;
};

type GraphView = {
  /** Screen (CSS px) = world * scale + translate. */
  scale: number;
  tx: number;
  ty: number;
  hover: number;
  focus: number;
};

const GRAPH_MIN_SCALE = 0.05;
const GRAPH_MAX_SCALE = 8;

function cssVar(shell: ReaderElement, name: string, fallback: string): string {
  const value = dom.getComputedStyle?.(shell).getPropertyValue(name).trim();
  return value === undefined || value === "" ? fallback : value;
}

function graphTheme(shell: ReaderElement): GraphTheme {
  return {
    bg: cssVar(shell, "--wordcell-bg", "#ffffff"),
    fg: cssVar(shell, "--wordcell-fg", "#1a1a1a"),
    muted: cssVar(shell, "--wordcell-muted", "#5f6368"),
    border: cssVar(shell, "--wordcell-border", "#e1e4e8"),
    accent: cssVar(shell, "--wordcell-accent", "#0b5bd3"),
  };
}

function fitView(
  points: readonly SiteGraphPoint[],
  width: number,
  height: number,
): GraphView {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(maxX - minX, 40);
  const spanY = Math.max(maxY - minY, 40);
  const margin = 48;
  const scale = Math.min(
    GRAPH_MAX_SCALE,
    Math.max(
      GRAPH_MIN_SCALE,
      Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY),
    ),
  );
  return {
    scale,
    tx: width / 2 - ((minX + maxX) / 2) * scale,
    ty: height / 2 - ((minY + maxY) / 2) * scale,
    hover: -1,
    focus: -1,
  };
}

function drawGraph(
  context: CanvasContext2d,
  ratio: number,
  theme: GraphTheme,
  view: GraphView,
  points: readonly SiteGraphPoint[],
  titles: readonly string[],
  degrees: readonly number[],
  edges: readonly { s: number; t: number; kind: "link" | "relation" }[],
  neighborFocus: ReadonlySet<number>,
): void {
  const { scale, tx, ty } = view;
  context.setTransform(scale * ratio, 0, 0, scale * ratio, tx * ratio, ty * ratio);
  const inv = 1 / scale;

  for (const edge of edges) {
    const a = points[edge.s];
    const b = points[edge.t];
    if (a === undefined || b === undefined) continue;
    const focused = view.focus >= 0 && (edge.s === view.focus || edge.t === view.focus);
    const hovered = view.hover >= 0 && (edge.s === view.hover || edge.t === view.hover);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.lineWidth = (focused || hovered ? 1.8 : 1) * inv;
    context.strokeStyle = focused || hovered ? theme.accent : theme.border;
    context.globalAlpha = focused || hovered ? 1 : 0.7;
    context.setLineDash(edge.kind === "relation" ? [4 * inv, 3 * inv] : []);
    context.stroke();
  }
  context.setLineDash([]);
  context.globalAlpha = 1;

  const labelEverywhere = points.length <= 48;
  for (const [index, point] of points.entries()) {
    const degree = degrees[index] ?? 0;
    const radius = Math.min(9, 3 + degree * 0.8) * inv;
    const active = index === view.hover || index === view.focus || neighborFocus.has(index);
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = active ? theme.accent : theme.muted;
    context.fill();
    context.lineWidth = 1.2 * inv;
    context.strokeStyle = theme.bg;
    context.stroke();
  }

  context.font = `${11 / scale}px ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "top";
  for (const [index, point] of points.entries()) {
    const degree = degrees[index] ?? 0;
    const active = index === view.hover || index === view.focus || neighborFocus.has(index);
    if (!labelEverywhere && !active && degree < 3) continue;
    context.fillStyle = active ? theme.fg : theme.muted;
    context.fillText(titles[index] ?? "", point.x, point.y + (Math.min(9, 3 + degree * 0.8) + 4) * inv);
  }
}

function initGraph(base: string): void {
  const shell = dom.document.querySelector("[data-wordcell-graph]");
  if (shell === null) return;
  const canvas = shell.querySelector("[data-wordcell-graph-canvas]");
  const status = shell.querySelector("[data-wordcell-graph-status]");
  const reset = shell.querySelector("[data-wordcell-graph-reset]");
  if (canvas === null) return;
  const context = canvas.getContext("2d");
  if (context === null) {
    if (status !== null) status.textContent = "Canvas is unavailable; every note is listed below.";
    return;
  }

  void (async () => {
    const manifestRaw = await fetchJson(base, "manifest.json");
    if (manifestRaw === undefined) throw new Error("manifest fetch failed");
    const manifest = parseSiteManifestV1(manifestRaw);
    const [catalogRaw, graphRaw] = await Promise.all([
      fetchJson(base, manifest.paths.catalog),
      fetchJson(base, manifest.paths.graph),
    ]);
    if (catalogRaw === undefined || graphRaw === undefined) throw new Error("graph data fetch failed");
    const catalog = parseSiteCatalogV1(catalogRaw);
    const graph = parseSiteGraphV1(graphRaw);

    const nodes = catalog.entries;
    if (nodes.length > WORDCELL_SITE_GRAPH_VIEW_LIMIT) {
      if (status !== null) {
        status.textContent =
          `This site has ${nodes.length} notes — over the ${WORDCELL_SITE_GRAPH_VIEW_LIMIT}-node interactive limit. Every note is listed below.`;
      }
      return;
    }

    const edges: SiteGraphLayoutEdge[] = [];
    const drawn: { s: number; t: number; kind: "link" | "relation" }[] = [];
    for (const edge of graph.edges) {
      if (edge.s === edge.t || edge.s < 0 || edge.t < 0) continue;
      if (edge.s >= nodes.length || edge.t >= nodes.length) continue;
      edges.push({ s: edge.s, t: edge.t });
      drawn.push({ s: edge.s, t: edge.t, kind: edge.k });
    }

    const slugs = nodes.map((entry) => entry.s);
    const titles = nodes.map((entry) => entry.t);
    const seed = siteGraphSeed(slugs, edges);
    const points = layoutSiteGraph(nodes.length, edges, { seed });
    const degrees = siteGraphDegrees(nodes.length, edges);
    const hrefFor = (index: number): string => resultHref(base, slugs[index] ?? "");

    const rect = canvas.getBoundingClientRect();
    const ratio = dom.devicePixelRatio ?? 1;
    const cssWidth = Math.max(320, rect.width || 960);
    const cssHeight = Math.max(280, rect.height || 560);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);

    let view = fitView(points, cssWidth, cssHeight);
    const theme = { current: graphTheme(shell) };
    let focusNeighbors: ReadonlySet<number> = new Set();
    const neighborsOf = (index: number): Set<number> => {
      const neighbors = new Set<number>();
      for (const edge of drawn) {
        if (edge.s === index) neighbors.add(edge.t);
        if (edge.t === index) neighbors.add(edge.s);
      }
      return neighbors;
    };

    const draw = (): void => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = theme.current.bg;
      context.fillRect(0, 0, cssWidth, cssHeight);
      drawGraph(context, ratio, theme.current, view, points, titles, degrees, drawn, focusNeighbors);
    };

    let scheduled = false;
    const redraw = (): void => {
      if (dom.requestAnimationFrame === undefined) {
        draw();
        return;
      }
      if (scheduled) return;
      scheduled = true;
      dom.requestAnimationFrame(() => {
        scheduled = false;
        draw();
      });
    };

    const nodeAt = (clientX: number, clientY: number): number => {
      const bounds = canvas.getBoundingClientRect();
      const px = clientX - bounds.left;
      const py = clientY - bounds.top;
      let best = -1;
      let bestDistance = 14;
      for (const [index, point] of points.entries()) {
        const sx = point.x * view.scale + view.tx;
        const sy = point.y * view.scale + view.ty;
        const distance = Math.sqrt((sx - px) * (sx - px) + (sy - py) * (sy - py));
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      return best;
    };

    const focusSlug = (): void => {
      const hash = dom.location.hash ?? "";
      const match = /^#n=(.+)$/u.exec(hash);
      if (match === null) return;
      let slug = match[1] ?? "";
      try {
        slug = decodeURIComponent(slug);
      } catch {
        return;
      }
      const index = slugs.indexOf(slug);
      if (index === -1) return;
      view.focus = index;
      focusNeighbors = neighborsOf(index);
      const point = points[index];
      if (point !== undefined) {
        view.tx = cssWidth / 2 - point.x * view.scale;
        view.ty = cssHeight / 2 - point.y * view.scale;
      }
      redraw();
    };

    let dragFrom: { x: number; y: number } | undefined;
    let dragged = false;

    canvas.addEventListener("pointerdown", (event) => {
      dragFrom = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
      dragged = false;
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", (event) => {
      const clientX = event.clientX ?? 0;
      const clientY = event.clientY ?? 0;
      if (dragFrom !== undefined) {
        const deltaX = clientX - dragFrom.x;
        const deltaY = clientY - dragFrom.y;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 4) dragged = true;
        if (dragged) {
          view.tx += deltaX;
          view.ty += deltaY;
          dragFrom = { x: clientX, y: clientY };
          redraw();
        }
        return;
      }
      const hit = nodeAt(clientX, clientY);
      if (hit !== view.hover) {
        view.hover = hit;
        canvas.style.cursor = hit >= 0 ? "pointer" : "grab";
        redraw();
      }
    });
    canvas.addEventListener("pointerup", (event) => {
      canvas.style.cursor = "grab";
      const wasDrag = dragged;
      dragFrom = undefined;
      dragged = false;
      if (wasDrag) return;
      const hit = nodeAt(event.clientX ?? 0, event.clientY ?? 0);
      if (hit >= 0) dom.location.assign(hrefFor(hit));
    });
    canvas.addEventListener("pointerleave", () => {
      dragFrom = undefined;
      dragged = false;
      if (view.hover !== -1) {
        view.hover = -1;
        redraw();
      }
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const px = (event.clientX ?? 0) - bounds.left;
      const py = (event.clientY ?? 0) - bounds.top;
      const factor = Math.exp(-(event.deltaY ?? 0) * 0.0015);
      const next = Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, view.scale * factor));
      const applied = next / view.scale;
      view.tx = px - (px - view.tx) * applied;
      view.ty = py - (py - view.ty) * applied;
      view.scale = next;
      redraw();
    });
    canvas.addEventListener("keydown", (event) => {
      const panStep = 48;
      if (event.key === "ArrowLeft") view.tx += panStep;
      else if (event.key === "ArrowRight") view.tx -= panStep;
      else if (event.key === "ArrowUp") view.ty += panStep;
      else if (event.key === "ArrowDown") view.ty -= panStep;
      else if (event.key === "+" || event.key === "=") {
        view.scale = Math.min(GRAPH_MAX_SCALE, view.scale * 1.25);
      } else if (event.key === "-" || event.key === "_") {
        view.scale = Math.max(GRAPH_MIN_SCALE, view.scale / 1.25);
      } else if (event.key === "0" || event.key === "Escape") {
        view = fitView(points, cssWidth, cssHeight);
      } else if (event.key === "Enter") {
        const target = view.hover >= 0 ? view.hover : view.focus;
        if (target < 0) return;
        dom.location.assign(hrefFor(target));
      } else {
        return;
      }
      event.preventDefault();
      redraw();
    });
    reset?.addEventListener("click", () => {
      view = fitView(points, cssWidth, cssHeight);
      redraw();
    });
    const repaintTheme = (): void => {
      theme.current = graphTheme(shell);
      redraw();
    };
    wordcellAppearanceBridge()?.subscribe(repaintTheme);
    dom.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", repaintTheme);

    if (status !== null) status.hidden = true;
    dom.addEventListener?.("hashchange", focusSlug);
    focusSlug();
    draw();
  })().catch(() => {
    if (status !== null) {
      status.hidden = false;
      status.textContent = "The graph data could not be loaded; every note is listed below.";
    }
  });
}

/**
 * The appearance control is injected by the reader so published pages carry
 * no dead control without JavaScript. It is a single icon button appended
 * as the final header action; its menu holds real radio inputs for keyboard
 * and screen-reader parity, and it drives the synchronous `theme.js`
 * bridge so a selection repaints instantly and persists under the shared
 * `hraness-design-palette-v1` key.
 */
function initAppearance(): void {
  const bridge = wordcellAppearanceBridge();
  const actions = dom.document.querySelector(".site-actions");
  if (bridge === undefined || actions === null) return;

  const wrap = dom.document.createElement("div");
  wrap.className = "appearance";

  const trigger = dom.document.createElement("button");
  trigger.type = "button";
  trigger.className = "appearance-trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "Appearance");
  trigger.innerHTML = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 16 16\" aria-hidden=\"true\">"
    + "<circle cx=\"8\" cy=\"8\" r=\"6.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/>"
    + "<path d=\"M8 1.4a6.6 6.6 0 0 1 0 13.2z\" fill=\"currentColor\"/></svg>";

  const menu = dom.document.createElement("div");
  menu.className = "appearance-menu";
  menu.hidden = true;
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", "Appearance");

  const paletteInputs = new Map<string, ReaderElement>();
  const modeInputs = new Map<string, ReaderElement>();

  const modeGroup = dom.document.createElement("div");
  modeGroup.className = "appearance-group";
  const modeLabel = dom.document.createElement("div");
  modeLabel.className = "appearance-label";
  modeLabel.textContent = "Appearance";
  modeGroup.appendChild(modeLabel);
  for (const mode of wordcellAppearanceModes) {
    const label = dom.document.createElement("label");
    label.className = "appearance-option";
    const input = dom.document.createElement("input");
    input.type = "radio";
    input.name = "wordcell-appearance-mode";
    input.value = mode;
    input.addEventListener("change", () => {
      bridge.set({ palette: bridge.get().palette, mode });
    });
    modeInputs.set(mode, input);
    const text = dom.document.createElement("span");
    text.textContent = wordcellAppearanceModeLabels[mode];
    label.appendChild(input);
    label.appendChild(text);
    modeGroup.appendChild(label);
  }

  const paletteGroup = dom.document.createElement("div");
  paletteGroup.className = "appearance-group";
  const paletteLabel = dom.document.createElement("div");
  paletteLabel.className = "appearance-label";
  paletteLabel.textContent = "Palette";
  paletteGroup.appendChild(paletteLabel);
  for (const palette of wordcellPalettes) {
    const label = dom.document.createElement("label");
    label.className = "appearance-option";
    const input = dom.document.createElement("input");
    input.type = "radio";
    input.name = "wordcell-appearance-palette";
    input.value = palette;
    input.addEventListener("change", () => {
      bridge.set({ palette, mode: bridge.get().mode });
    });
    paletteInputs.set(palette, input);
    const swatch = dom.document.createElement("span");
    swatch.className = `swatch swatch-${palette}`;
    const text = dom.document.createElement("span");
    text.textContent = wordcellPaletteLabels[palette];
    label.appendChild(input);
    label.appendChild(swatch);
    label.appendChild(text);
    paletteGroup.appendChild(label);
  }

  menu.appendChild(modeGroup);
  menu.appendChild(paletteGroup);
  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  actions.appendChild(wrap);

  const sync = (): void => {
    const preference = bridge.get();
    for (const [mode, input] of modeInputs) input.checked = mode === preference.mode;
    for (const [palette, input] of paletteInputs) input.checked = palette === preference.palette;
  };

  const close = (): void => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  const open = (): void => {
    sync();
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    paletteInputs.get(bridge.get().palette)?.focus();
  };
  trigger.addEventListener("click", () => {
    if (menu.hidden) open();
    else close();
  });
  dom.document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      close();
      trigger.focus();
    }
  });
  dom.document.addEventListener("click", (event) => {
    if (!menu.hidden && event.target?.closest?.(".appearance") == null) close();
  });
  bridge.subscribe(sync);
  sync();
}

function start(): void {
  const content = dom.document
    .querySelector('meta[name="wordcell:base"]')
    ?.getAttribute("content") ?? "./";
  const base = content.endsWith("/") ? content : `${content}/`;
  initAppearance();
  const overlay = buildOverlay(base);
  for (const button of Array.from(
    dom.document.querySelectorAll("[data-wordcell-search]"),
  )) {
    button.addEventListener("click", () => overlay.open());
  }
  dom.document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/u.test(event.target?.tagName ?? "")) {
      event.preventDefault();
      overlay.open();
    }
    if (event.key === "Escape") overlay.close();
  });
  initGraph(base);
}

if (dom.document.querySelector("[data-wordcell-search]") !== null) {
  start();
}
