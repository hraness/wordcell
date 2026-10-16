import { decodeHTML } from "entities";

export const metadataLimits = { htmlBytes: 8 * 1024 * 1024, claims: 256, value: 8192, totalBytes: 256 * 1024, jsonBytes: 128 * 1024, jsonNodes: 2048, jsonDepth: 12 } as const;
export type MetadataSource = "html-title" | "html-meta" | "html-link" | "html-language" | "json-ld" | "extractor";
export type MetadataValue = string | readonly string[];
export type ArticleMetadataClaim = {
  readonly field: string;
  readonly observed: MetadataValue;
  readonly value: MetadataValue;
  readonly source: MetadataSource;
  readonly locator: string;
  readonly rule: string;
  readonly selected: boolean;
  readonly datePrecision?: "date" | "datetime" | "invalid";
  readonly timezone?: "explicit" | "unknown" | "not-applicable";
};
export type ArticleMetadata = {
  readonly schemaVersion: 1;
  readonly extractorVersion: "wordcell-metadata-v1";
  readonly claims: readonly ArticleMetadataClaim[];
  readonly warnings: readonly ("input-limit" | "claim-limit" | "value-limit" | "json-limit" | "json-invalid")[];
};
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sources = new Set<MetadataSource>(["html-title", "html-meta", "html-link", "html-language", "json-ld", "extractor"]);
const warningKinds = new Set(["input-limit", "claim-limit", "value-limit", "json-limit", "json-invalid"]);
const credentialName = /(?:csrf|xsrf|token|nonce|password|secret|session|authorization|api[-_]?key|signature)/i;
const urlFields = new Set(["canonical", "alternate", "image", "url"]);
const dateFields = new Set(["published", "modified"]);

/** Metadata is descriptive evidence, never an authenticated resource locator. */
function publicUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.username = ""; url.password = ""; url.search = ""; url.hash = "";
    return url.href;
  } catch { return null; }
}
function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "")
    .replace(/https?:\/\/[^\s<>"']+/giu, (url) => publicUrl(url) ?? "[invalid URL]")
    .replace(/\s+/gu, " ").trim();
}
function dateValue(value: string): Pick<ArticleMetadataClaim, "value" | "datePrecision" | "timezone"> {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(value);
  const parsed = Date.parse(dateOnly ? value + "T00:00:00Z" : local ? value + "Z" : value);
  const validDay = Number.isFinite(parsed) && new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))).toISOString().slice(0, 10) === value.slice(0, 10);
  if ((!dateOnly && !zoned && !local) || !validDay) return { value, datePrecision: "invalid", timezone: "unknown" };
  if (dateOnly) return { value, datePrecision: "date", timezone: "not-applicable" };
  return { value: zoned ? new Date(parsed).toISOString() : value, datePrecision: "datetime", timezone: zoned ? "explicit" : "unknown" };
}
function rank(claim: ArticleMetadataClaim): number {
  if (claim.datePrecision === "invalid") return 1000;
  if (claim.source === "json-ld") return claim.rule.includes("jsonld-type=WebPage") ? 15 : 10;
  if (claim.source === "html-link") return 5;
  if (claim.locator.includes("property=article:")) return 20;
  if (claim.locator.includes("property=og:")) return 30;
  if (claim.locator.includes("name=twitter:")) return 40;
  if (claim.source === "html-meta") return 50;
  if (claim.source === "html-title" || claim.source === "html-language") return 60;
  return 90;
}
function select(claims: readonly ArticleMetadataClaim[]): ArticleMetadataClaim[] {
  const ranks = new Map<string, number>();
  for (const claim of claims) ranks.set(claim.field, Math.min(ranks.get(claim.field) ?? 1000, rank(claim)));
  const chosen = new Set<string>();
  return claims.map((claim) => {
    const multiple = ["authors", "tags", "alternate"].includes(claim.field);
    const selected = rank(claim) < 1000 && rank(claim) === ranks.get(claim.field) && (multiple || !chosen.has(claim.field));
    if (selected) chosen.add(claim.field);
    return { ...claim, selected, rule: `metadata-precedence-v1:${claim.rule}` };
  });
}

/** Validate an optional additive envelope from a worker or a stored bundle. */
export function parseArticleMetadata(input: unknown, redact: (text: string) => string = cleanText): ArticleMetadata {
  if (!record(input) || input.schemaVersion !== 1 || input.extractorVersion !== "wordcell-metadata-v1" || !Array.isArray(input.claims) || input.claims.length > metadataLimits.claims || !Array.isArray(input.warnings)) throw new Error("Unsupported or malformed article metadata envelope");
  let bytes = 0;
  const text = (value: unknown, limit: number = metadataLimits.value): string => {
    if (typeof value !== "string" || value.length > limit) throw new Error("Invalid article metadata text");
    const result = cleanText(redact(value));
    bytes += Buffer.byteLength(result);
    if (bytes > metadataLimits.totalBytes) throw new Error("Article metadata exceeds byte limit");
    return result;
  };
  const value = (v: unknown): MetadataValue => Array.isArray(v)
    ? v.length <= 32 ? v.map((part) => text(part)) : (() => { throw new Error("Article metadata list exceeds limit"); })()
    : text(v);
  const claims = input.claims.map((raw): ArticleMetadataClaim => {
    if (!record(raw) || !sources.has(raw.source as MetadataSource) || typeof raw.selected !== "boolean") throw new Error("Invalid article metadata claim");
    const field = text(raw.field, 128);
    if (!/^[a-z][a-z0-9:_-]{0,127}$/.test(field) || credentialName.test(field)) throw new Error("Invalid article metadata field");
    let observed = value(raw.observed), normalized = value(raw.value);
    if (urlFields.has(field)) {
      const urls = (input: MetadataValue): MetadataValue => {
        const normalize = (part: string): string => {
          const parsed = publicUrl(part);
          if (parsed === null) throw new Error("Invalid article metadata URL");
          return parsed;
        };
        return typeof input === "string" ? normalize(input) : input.map(normalize);
      };
      observed = urls(observed); normalized = urls(normalized);
    }
    const temporal = raw.datePrecision === undefined ? {} : dateFields.has(field) && typeof observed === "string"
      ? dateValue(observed) : (() => { throw new Error("Invalid article metadata date"); })();
    if (raw.datePrecision !== undefined && (raw.datePrecision !== (temporal as ArticleMetadataClaim).datePrecision || raw.timezone !== (temporal as ArticleMetadataClaim).timezone)) throw new Error("Invalid article metadata date precision");
    return { field, observed, value: normalized, source: raw.source as MetadataSource, locator: text(raw.locator, 512), rule: text(raw.rule, 256), selected: raw.selected, ...temporal };
  });
  if (input.warnings.length > warningKinds.size || input.warnings.some((warning) => !warningKinds.has(warning))) throw new Error("Invalid article metadata warnings");
  return { schemaVersion: 1, extractorVersion: "wordcell-metadata-v1", claims, warnings: [...input.warnings] as ArticleMetadata["warnings"] };
}

const fields: Readonly<Record<string, string>> = {
  "og:title": "title", "twitter:title": "title", title: "title", "citation_title": "title", "dc.title": "title",
  description: "description", "og:description": "description", "twitter:description": "description", "dc.description": "description",
  author: "authors", "article:author": "authors", "citation_author": "authors", "dc.creator": "authors",
  "article:published_time": "published", "datepublished": "published", "citation_publication_date": "published", "dc.date": "published",
  "article:modified_time": "modified", "datemodified": "modified", "last-modified": "modified",
  "og:url": "canonical", "twitter:url": "canonical", "og:image": "image", "og:image:url": "image", "twitter:image": "image", "twitter:image:src": "image",
  "og:site_name": "site", publisher: "publisher", "dc.publisher": "publisher", "citation_journal_title": "publisher",
  "og:locale": "language", language: "language", "dc.language": "language", "og:type": "type", "twitter:card": "card",
  "article:tag": "tags", keywords: "tags", "news_keywords": "tags", "citation_keywords": "tags",
  "citation_doi": "doi", "dc.identifier": "identifier", "citation_pdf_url": "alternate",
};

/** Parse inert HTML locally. JSON-LD contexts are evidence strings and are never resolved. */
export async function extractArticleMetadata(html: string, base: string, fallback: { readonly title?: unknown; readonly author?: unknown; readonly published?: unknown; readonly description?: unknown } = {}): Promise<ArticleMetadata> {
  const claims: ArticleMetadataClaim[] = [];
  const warnings = new Set<ArticleMetadata["warnings"][number]>();
  let totalBytes = 0, title = "", script = "", scriptIndex = 0, activeScript = false, jsonBytes = 0;
  const add = (field: string, raw: unknown, source: MetadataSource, locator: string, decode = false, evidenceRule?: string): void => {
    if (claims.length >= metadataLimits.claims) { warnings.add("claim-limit"); return; }
    let values = Array.isArray(raw) ? raw : [raw];
    if (values.length > 32) { warnings.add("value-limit"); values = values.slice(0, 32); }
    const strings: string[] = [];
    for (const value of values) {
      if (typeof value !== "string") continue;
      if (value.length > metadataLimits.value) { warnings.add("value-limit"); continue; }
      const decoded = decode ? decodeHTML(value) : value;
      const cleaned = cleanText(urlFields.has(field) ? publicUrl(decoded, base) ?? "" : decoded);
      if (cleaned) strings.push(cleaned);
    }
    if (!strings.length) return;
    const observed: MetadataValue = Array.isArray(raw) ? strings : strings[0]!;
    let value: MetadataValue = observed;
    if (urlFields.has(field)) {
      const urls = strings.map((part) => publicUrl(part, base)).filter((part): part is string => part !== null);
      if (!urls.length) return;
      value = Array.isArray(raw) ? urls : urls[0]!;
    }
    const temporal = dateFields.has(field) && typeof observed === "string" ? dateValue(observed) : {};
    const claim: ArticleMetadataClaim = { field, observed, value, source, locator, rule: `trim-whitespace-url-query-redaction${evidenceRule === undefined ? "" : `:${evidenceRule}`}`, selected: false, ...temporal };
    const bytes = Buffer.byteLength(JSON.stringify(claim));
    if (totalBytes + bytes > metadataLimits.totalBytes / 2) { warnings.add("claim-limit"); return; }
    totalBytes += bytes; claims.push(claim);
  };
  const parseLd = (raw: string, index: number): void => {
    if (!raw.trim()) return;
    if (Buffer.byteLength(raw) > metadataLimits.jsonBytes || (jsonBytes += Buffer.byteLength(raw)) > metadataLimits.jsonBytes * 4) { warnings.add("json-limit"); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { warnings.add("json-invalid"); return; }
    let nodes = 0;
    // A full bounded walk rejects deep or wide hostile payloads before extracting facts.
    const stack: { value: unknown; depth: number }[] = [{ value: parsed, depth: 0 }];
    while (stack.length) {
      const node = stack.pop()!;
      if (++nodes > metadataLimits.jsonNodes || node.depth > metadataLimits.jsonDepth) { warnings.add("json-limit"); return; }
      const children = Array.isArray(node.value) ? node.value : record(node.value) ? Object.values(node.value) : [];
      if (children.length + nodes + stack.length > metadataLimits.jsonNodes) { warnings.add("json-limit"); return; }
      for (const child of children) stack.push({ value: child, depth: node.depth + 1 });
    }
    const items: { value: unknown; path: string }[] = Array.isArray(parsed) ? parsed.map((value, i) => ({ value, path: `$[${i}]` })) : [{ value: parsed, path: "$" }];
    for (let cursor = 0; cursor < items.length && cursor < metadataLimits.jsonNodes; cursor++) {
      const item = items[cursor]!;
      if (!record(item.value)) continue;
      const object = item.value;
      if (Array.isArray(object["@graph"])) items.push(...object["@graph"].map((value, i) => ({ value, path: `${item.path}.@graph[${i}]` })));
      const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
      const entityTypes = types.flatMap((type) => {
        const match = typeof type === "string" ? /^(?:(?:https?:\/\/)?schema\.org\/)?(Article|NewsArticle|BlogPosting|ScholarlyArticle|TechArticle|Report|WebPage|VideoObject|AudioObject|PodcastEpisode)$/.exec(type) : null;
        return match?.[1] === undefined ? [] : [match[1]];
      });
      const entityType = entityTypes.find(type => type !== "WebPage") ?? entityTypes[0];
      if (entityType === undefined) continue;
      const names = (v: unknown): unknown => Array.isArray(v) ? v.slice(0, 32).map((entry) => record(entry) ? entry.name : entry) : record(v) ? v.name : v;
      const props: Readonly<Record<string, string>> = { headline: "title", name: "title", description: "description", author: "authors", creator: "authors", datePublished: "published", dateModified: "modified", inLanguage: "language", publisher: "publisher", keywords: "tags", image: "image", thumbnailUrl: "image", url: "canonical", mainEntityOfPage: "canonical", duration: "duration", episodeNumber: "episode", identifier: "identifier" };
      for (const [key, field] of Object.entries(props)) {
        let value = object[key];
        if (value === undefined) continue;
        if (["author", "creator", "publisher"].includes(key)) value = names(value);
        if (key === "image") value = Array.isArray(value) ? value.map((v) => record(v) ? v.url ?? v.contentUrl : v) : record(value) ? value.url ?? value.contentUrl : value;
        if (key === "mainEntityOfPage" && record(value)) value = value["@id"] ?? value.url;
        if (key === "episodeNumber" && typeof value === "number" && Number.isFinite(value)) value = String(value);
        add(field, value, "json-ld", `script[${index}]${item.path}.${key}`, false, `jsonld-type=${entityType}`);
      }
    }
  };
  let input = html;
  if (Buffer.byteLength(input) > metadataLimits.htmlBytes) { input = Buffer.from(input).subarray(0, metadataLimits.htmlBytes).toString("utf8"); warnings.add("input-limit"); }
  await new HTMLRewriter()
    .on("html", { element(element) { add("language", element.getAttribute("lang"), "html-language", "html@lang", true); } })
    .on("title", { text(chunk) { if (title.length <= metadataLimits.value) title += chunk.text; } })
    .on("meta", { element(element) {
      const attribute = element.getAttribute("property") ? "property" : "name";
      const key = decodeHTML(element.getAttribute(attribute) ?? "").toLowerCase();
      if (!/^[a-z][a-z0-9:._-]{0,100}$/.test(key) || credentialName.test(key)) return;
      const field = Object.hasOwn(fields, key) ? fields[key]! : `meta:${key.replaceAll(".", "_")}`;
      add(field, element.getAttribute("content"), "html-meta", `meta[${attribute}=${key}]@content`, true);
    } })
    .on("link", { element(element) {
      const rel = (element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
      const field = rel.includes("canonical") ? "canonical" : rel.includes("alternate") ? "alternate" : null;
      if (field) add(field, element.getAttribute("href"), "html-link", `link[rel=${field}]@href`, true);
    } })
    .on("script", { element(element) {
      activeScript = (element.getAttribute("type") ?? "").toLowerCase().trim() === "application/ld+json";
      script = "";
      if (activeScript) {
        const index = scriptIndex++;
        if (index >= 64) { activeScript = false; warnings.add("json-limit"); return; }
        element.onEndTag(() => { parseLd(script, index); activeScript = false; });
      }
    }, text(chunk) { if (activeScript && script.length <= metadataLimits.jsonBytes) script += chunk.text; } })
    .transform(new Response(input)).text();
  if (activeScript) warnings.add("json-invalid");
  add("title", title, "html-title", "title", true);
  for (const [key, field] of Object.entries({ title: "title", author: "authors", published: "published", description: "description" })) add(field, fallback[key as keyof typeof fallback], "extractor", `defuddle.${key}`);
  return parseArticleMetadata({ schemaVersion: 1, extractorVersion: "wordcell-metadata-v1", claims: select(claims), warnings: [...warnings] });
}
