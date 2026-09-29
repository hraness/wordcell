import { expect, test } from "bun:test";
import { embeddedArticleHtml, EMBEDDED_ARTICLE_LIMITS } from "./embedded-article.js";
const url = "https://publisher.example/articles/42";
const record = { dataType: "Article", dataId: 42, urlArticle: "/articles/42", title: "Example field study", body: "<p>Measured water retention increased by 12 percent in the second season. Soil samples came from four independently monitored fields.</p>" };
const page = (value: unknown = record, attrs = 'type="application/json" id="jsonArticle"') => `<html><head><title>Shell</title></head><body><nav>Account Navigation</nav><script ${attrs}>${JSON.stringify(value).replaceAll("<", "\\u003c")}</script></body></html>`;
test("extracts only matching inert article prose", async () => {
  const result = await embeddedArticleHtml(page(), url);
  expect(result).toContain(record.body);
  expect(result).not.toContain("Account Navigation");
  expect(await embeddedArticleHtml(page(), `${url}#section`)).toBe(result);
  expect(await embeddedArticleHtml(page({ ...record, title: '<script>bad()</script>' }), url)).toContain('&lt;script&gt;bad()&lt;/script&gt;');
});
test("rejects foreign, metadata-only, executable and ambiguous records", async () => {
  for (const value of [null, [], { ...record, dataType: "Profile" }, { ...record, body: "" }, { ...record, body: undefined }, { ...record, urlArticle: "https://other.example/articles/42" }, { ...record, urlArticle: "/articles/43" }, { ...record, dataId: 43 }, { ...record, urlArticle: url + "#fragment" }]) expect(await embeddedArticleHtml(page(value), url)).toBeNull();
  for (const attrs of ['id="jsonArticle"', 'id="jsonArticle" type="text/javascript"', 'id="jsonArticle" type="application/json" src="/payload"', 'id="other" type="application/json"']) expect(await embeddedArticleHtml(page(record, attrs), url)).toBeNull();
  expect(await embeddedArticleHtml(page() + page(), url)).toBeNull();
  expect(await embeddedArticleHtml(`<!--${page()}-->`, url)).toBeNull();
  expect(await embeddedArticleHtml(page(), "file:///articles/42")).toBeNull();
});
test("bounds page, scripts, payload, body and nesting", async () => {
  expect(await embeddedArticleHtml(page() + ' '.repeat(EMBEDDED_ARTICLE_LIMITS.htmlBytes), url)).toBeNull();
  expect(await embeddedArticleHtml(page() + '<script></script>'.repeat(64), url)).toBeNull();
  expect(await embeddedArticleHtml(page({ ...record, body: 'a'.repeat(EMBEDDED_ARTICLE_LIMITS.bodyBytes + 1) }), url)).toBeNull();
  expect(await embeddedArticleHtml(page({ ...record, extra: 'a'.repeat(EMBEDDED_ARTICLE_LIMITS.jsonBytes) }), url)).toBeNull();
  let nested: unknown = 1;
  for (let i = 0; i < 10; i++) nested = { nested };
  expect(await embeddedArticleHtml(page({ ...record, extra: nested }), url)).toBeNull();
});
test("real worker converts embedded prose and strips active HTML without executing it", async () => {
  const worker = new Worker(new URL('./defuddle-worker.ts', import.meta.url).href, { type: 'module' });
  try {
    const response = await new Promise<{ ok: boolean; value: { contentMarkdown: string; content: string } }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker deadline')), 10000);
      worker.onmessage = event => { clearTimeout(timer); resolve(event.data); };
      worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
      worker.postMessage({ html: page({ ...record, body: record.body.repeat(6) + '<script>throw new Error("EXECUTED")</script>' }), url, includeReplies: false });
    });
    expect(response.ok).toBe(true);
    expect(JSON.stringify(response.value)).toContain('12 percent');
    expect(response.value.content).not.toContain('<script>');
    expect(JSON.stringify(response.value)).not.toContain('Account Navigation');
  } finally { worker.terminate(); }
}, 15000);
