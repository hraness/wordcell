/** An inert publisher article record, never executable hydration code. */
export const EMBEDDED_ARTICLE_LIMITS = Object.freeze({ htmlBytes: 8 * 1024 * 1024, scripts: 64, jsonBytes: 256 * 1024, bodyBytes: 192 * 1024, depth: 8 });

function shallowJson(value: string): boolean {
  let depth = 0, quoted = false, escaped = false;
  for (const char of value) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") { if (++depth > EMBEDDED_ARTICLE_LIMITS.depth) return false; }
    else if (char === "}" || char === "]") depth--;
  }
  return !quoted && depth === 0;
}
const escapeText = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Returns a synthetic HTML article for the existing extractor, or null on ambiguity.
 * HTMLRewriter parses inert bytes: it does not run scripts or load resources.
 * Only the observed jsonArticle / Article / body format is supported.
 */
export async function embeddedArticleHtml(html: string, sourceUrl: string): Promise<string | null> {
  if (Buffer.byteLength(html) > EMBEDDED_ARTICLE_LIMITS.htmlBytes) return null;
  let source: URL;
  try { source = new URL(sourceUrl); } catch { return null; }
  if (!/^https?:$/.test(source.protocol) || source.username || source.password) return null;
  source.hash = "";
  let scripts = 0, candidates = 0, active = false, invalid = false, payload = "";
  const rewriter = new HTMLRewriter().on("script", {
    element(element) {
      if (++scripts > EMBEDDED_ARTICLE_LIMITS.scripts) invalid = true;
      active = element.getAttribute("id") === "jsonArticle";
      if (!active) return;
      candidates++;
      if (element.getAttribute("type")?.toLowerCase() !== "application/json" || element.hasAttribute("src")) invalid = true;
    },
    text(chunk) {
      if (!active || invalid) return;
      payload += chunk.text;
      if (Buffer.byteLength(payload) > EMBEDDED_ARTICLE_LIMITS.jsonBytes) invalid = true;
    },
  });
  await rewriter.transform(new Response(html)).text();
  if (invalid || candidates !== 1 || !shallowJson(payload)) return null;
  let value: unknown;
  try { value = JSON.parse(payload); } catch { return null; }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length > 128 || row.dataType !== "Article" || !Number.isSafeInteger(row.dataId) || (row.dataId as number) <= 0
    || typeof row.urlArticle !== "string" || row.urlArticle.length > 8192
    || typeof row.title !== "string" || !row.title.trim() || Buffer.byteLength(row.title) > 4096
    || typeof row.body !== "string" || !row.body.trim() || Buffer.byteLength(row.body) > EMBEDDED_ARTICLE_LIMITS.bodyBytes) return null;
  let article: URL;
  try { article = new URL(row.urlArticle, source); } catch { return null; }
  if (article.username || article.password || article.hash || article.href !== source.href
    || article.pathname.split("/").filter(Boolean).at(-1) !== String(row.dataId)) return null;
  // The original URL remains authoritative. Metadata never becomes prose.
  return `<!doctype html><html><head><title>${escapeText(row.title)}</title></head><body><article><h1>${escapeText(row.title)}</h1>${row.body}</article></body></html>`;
}
