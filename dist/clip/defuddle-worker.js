// @bun
import"../index-z1w83f81.js";

// src/clip/defuddle-worker.ts
import { Defuddle } from "defuddle/node";

// src/clip/embedded-article.ts
var EMBEDDED_ARTICLE_LIMITS = Object.freeze({ htmlBytes: 8 * 1024 * 1024, scripts: 64, jsonBytes: 256 * 1024, bodyBytes: 192 * 1024, depth: 8 });
function shallowJson(value) {
  let depth = 0, quoted = false, escaped = false;
  for (const char of value) {
    if (quoted) {
      if (escaped)
        escaped = false;
      else if (char === "\\")
        escaped = true;
      else if (char === '"')
        quoted = false;
    } else if (char === '"')
      quoted = true;
    else if (char === "{" || char === "[") {
      if (++depth > EMBEDDED_ARTICLE_LIMITS.depth)
        return false;
    } else if (char === "}" || char === "]")
      depth--;
  }
  return !quoted && depth === 0;
}
var escapeText = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
async function embeddedArticleHtml(html, sourceUrl) {
  if (Buffer.byteLength(html) > EMBEDDED_ARTICLE_LIMITS.htmlBytes)
    return null;
  let source;
  try {
    source = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(source.protocol) || source.username || source.password)
    return null;
  source.hash = "";
  let scripts = 0, candidates = 0, active = false, invalid = false, payload = "";
  const rewriter = new HTMLRewriter().on("script", {
    element(element) {
      if (++scripts > EMBEDDED_ARTICLE_LIMITS.scripts)
        invalid = true;
      active = element.getAttribute("id") === "jsonArticle";
      if (!active)
        return;
      candidates++;
      if (element.getAttribute("type")?.toLowerCase() !== "application/json" || element.hasAttribute("src"))
        invalid = true;
    },
    text(chunk) {
      if (!active || invalid)
        return;
      payload += chunk.text;
      if (Buffer.byteLength(payload) > EMBEDDED_ARTICLE_LIMITS.jsonBytes)
        invalid = true;
    }
  });
  await rewriter.transform(new Response(html)).text();
  if (invalid || candidates !== 1 || !shallowJson(payload))
    return null;
  let value;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const row = value;
  if (Object.keys(row).length > 128 || row.dataType !== "Article" || !Number.isSafeInteger(row.dataId) || row.dataId <= 0 || typeof row.urlArticle !== "string" || row.urlArticle.length > 8192 || typeof row.title !== "string" || !row.title.trim() || Buffer.byteLength(row.title) > 4096 || typeof row.body !== "string" || !row.body.trim() || Buffer.byteLength(row.body) > EMBEDDED_ARTICLE_LIMITS.bodyBytes)
    return null;
  let article;
  try {
    article = new URL(row.urlArticle, source);
  } catch {
    return null;
  }
  if (article.username || article.password || article.hash || article.href !== source.href || article.pathname.split("/").filter(Boolean).at(-1) !== String(row.dataId))
    return null;
  return `<!doctype html><html><head><title>${escapeText(row.title)}</title></head><body><article><h1>${escapeText(row.title)}</h1>${row.body}</article></body></html>`;
}

// src/clip/defuddle-worker.ts
var workerGlobal = globalThis;
function asciiCaseEqualAt(value, offset, expected, end = value.length) {
  if (offset < 0 || offset + expected.length > end)
    return false;
  for (let index = 0;index < expected.length; index += 1) {
    const actual = value.charCodeAt(offset + index);
    const folded = actual >= 65 && actual <= 90 ? actual + 32 : actual;
    if (folded !== expected.charCodeAt(index))
      return false;
  }
  return true;
}
function isTagBoundary(code) {
  return code === 62 || code === 47 || code === 32 || code === 9 || code === 10 || code === 12 || code === 13;
}
function decodeHtmlAttribute(value) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(?:x([0-9a-f]{1,6})|(\d{1,7}));/gi, (_match, hexadecimal, decimal) => {
    const codePoint = Number.parseInt(hexadecimal ?? decimal ?? "", hexadecimal === undefined ? 10 : 16);
    return Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 1114111 && !(codePoint >= 55296 && codePoint <= 57343) ? String.fromCodePoint(codePoint) : "";
  });
}
function collectVideoPosters(html) {
  const posters = [];
  let cursor = 0;
  while (cursor < html.length && posters.length < 64) {
    const start = html.indexOf("<", cursor);
    if (start < 0)
      break;
    cursor = start + 1;
    if (!asciiCaseEqualAt(html, start + 1, "video"))
      continue;
    const afterName = start + 6;
    if (afterName >= html.length || !isTagBoundary(html.charCodeAt(afterName)))
      continue;
    const unboundedEnd = html.indexOf(">", afterName);
    if (unboundedEnd < 0)
      break;
    cursor = unboundedEnd + 1;
    if (unboundedEnd - afterName > 16384)
      continue;
    const tag = html.slice(afterName, unboundedEnd);
    const match = /(?:^|\s)poster\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(tag);
    const candidate = match?.[1] ?? match?.[2] ?? match?.[3];
    if (candidate === undefined || candidate.trim() === "")
      continue;
    const decoded = decodeHtmlAttribute(candidate.trim());
    if (decoded.length <= 8192 && !posters.includes(decoded))
      posters.push(decoded);
  }
  return posters;
}
var domGlobal = globalThis;
domGlobal.Node ??= Object.freeze({
  DOCUMENT_POSITION_DISCONNECTED: 1,
  DOCUMENT_POSITION_PRECEDING: 2,
  DOCUMENT_POSITION_FOLLOWING: 4,
  DOCUMENT_POSITION_CONTAINS: 8,
  DOCUMENT_POSITION_CONTAINED_BY: 16,
  DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32
});
workerGlobal.onmessage = async (event) => {
  const request = event.data;
  if (typeof request !== "object" || request === null || Array.isArray(request) || !("html" in request) || typeof request.html !== "string" || !("url" in request) || typeof request.url !== "string" || !("includeReplies" in request) || request.includeReplies !== true && request.includeReplies !== false && request.includeReplies !== "extractors") {
    workerGlobal.postMessage({ ok: false, message: "Defuddle worker received an invalid request." });
    return;
  }
  try {
    const extractionHtml = request.includeReplies === false ? await embeddedArticleHtml(request.html, request.url) ?? request.html : request.html;
    const videoPosters = collectVideoPosters(extractionHtml);
    const value = await Defuddle(extractionHtml, request.url, {
      markdown: false,
      separateMarkdown: true,
      includeReplies: request.includeReplies,
      useAsync: false,
      removeImages: false
    });
    const enriched = typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value, captureVideoPosters: videoPosters } : value;
    workerGlobal.postMessage({ ok: true, value: enriched });
  } catch {
    workerGlobal.postMessage({ ok: false, message: "Defuddle could not parse this acquisition." });
  }
};
