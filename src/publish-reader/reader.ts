import {
  parseSiteDocsV1,
  parseSiteManifestV1,
  parseSiteNoteV1,
  parseSitePostingsV1,
  parseSiteTermsV1,
  WORDCELL_SITE_LIMITS_V1,
  type WordcellSiteDocV1,
  type WordcellSiteManifestV1,
  type WordcellSiteNoteV1,
} from "../publish-model.js";
import {
  comparePublishScores,
  MAX_PUBLISH_PREFIX_EXPANSIONS,
  publishPrefixTerms,
  publishQuery,
  publishShardName,
  publishSnippet,
  scorePublishDocument,
  type PublishQuery,
  type PublishScore,
} from "../publish-search.js";

/**
 * Zero-dependency reference reader bundled into every published site. It
 * progressively enhances static pages with a search overlay powered by the
 * precomputed exact-search index. Everything runs against the minimal DOM
 * shim below so the package stays on the ES2023 lib — no design-system or
 * framework dependency, and the bundle imports only the pure contract and
 * search modules.
 */

type FetchResponse = {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
};

type ReaderElement = {
  className: string;
  textContent: string | null;
  innerHTML: string;
  href: string;
  type: string;
  placeholder: string;
  value: string;
  hidden: boolean;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  appendChild(child: ReaderElement): ReaderElement;
  remove(): void;
  focus(): void;
  addEventListener(name: string, listener: (event: ReaderEvent) => void): void;
};

type ReaderEvent = {
  readonly key?: string;
  readonly target?: {
    readonly value?: string;
    readonly tagName?: string;
  } | null;
  preventDefault(): void;
};

type ReaderDocument = {
  readonly body: { appendChild(child: ReaderElement): ReaderElement };
  querySelector(selector: string): ReaderElement | null;
  querySelectorAll(selector: string): ArrayLike<ReaderElement>;
  createElement(tag: string): ReaderElement;
  addEventListener(name: string, listener: (event: ReaderEvent) => void): void;
};

type ReaderLocation = { assign(url: string): void };

const dom = globalThis as unknown as {
  readonly document: ReaderDocument;
  readonly location: ReaderLocation;
  fetch(url: string): Promise<FetchResponse>;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
};

type SiteIndex = {
  readonly manifest: WordcellSiteManifestV1;
  readonly docs: readonly WordcellSiteDocV1[];
  readonly terms: readonly string[];
  readonly postings: Map<string, Map<string, readonly number[]>>;
  readonly notes: Map<string, WordcellSiteNoteV1>;
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

async function search(index: SiteIndex, base: string, raw: string): Promise<ScoredHit[]> {
  const query = publishQuery(raw);
  if (query.terms.length === 0 && query.normalized === "") return [];

  // Content term admission: inline scans doc.x directly; shard mode expands
  // each query term through the sorted dictionary prefix index, then unions
  // the matching postings. Both reproduce the exact lane's content.includes
  // semantics — a query term matches content containing it as a substring.
  const postingsHits = new Map<number, Set<string>>();
  if (index.manifest.search.content === "shards") {
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
  input.placeholder = "Search this site…";
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
      query = publishQuery(input.value);
    } catch {
      query = undefined;
    }
    for (const [position, hit] of hits.entries()) {
      const item = dom.document.createElement("li");
      const link = dom.document.createElement("a");
      link.href = resultHref(base, hit.doc.s);
      link.className = position === active ? "active" : "";
      const title = dom.document.createElement("span");
      title.className = "title";
      title.textContent = hit.doc.t;
      const snippet = dom.document.createElement("span");
      snippet.className = "snippet";
      snippet.textContent = index === undefined || query === undefined
        ? hit.doc.p
        : snippetFor(index, hit.doc, query);
      link.appendChild(title);
      link.appendChild(snippet);
      item.appendChild(link);
      list.appendChild(item);
    }
    status.textContent = hits.length === 0
      ? (input.value.trim() === "" ? "Type to search." : "No results.")
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

function start(): void {
  const content = dom.document
    .querySelector('meta[name="wordcell:base"]')
    ?.getAttribute("content") ?? "./";
  const base = content.endsWith("/") ? content : `${content}/`;
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
}

if (dom.document.querySelector("[data-wordcell-search]") !== null) {
  start();
}
