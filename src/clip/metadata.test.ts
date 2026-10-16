import { describe, expect, test } from "bun:test";
import { extractArticleMetadata, parseArticleMetadata, metadataLimits } from "./metadata.js";

describe("observed article metadata", () => {
  test("retains conflicts, authors and evidence with deterministic choice", async () => {
    const metadata = await extractArticleMetadata(`<html lang="en"><head><title>HTML &amp; title</title>
      <link rel="canonical" href="/article?token=private#secret"><link rel="alternate" href="/fr">
      <meta property="og:title" content="OG title"><meta name="twitter:title" content="Twitter title">
      <meta name="author" content="Élodie &amp; Jo"><meta name="description" content="Description &eacute;">
      <meta name="keywords" content="science, history"><meta name="citation_doi" content="10.1000/example">
      <script type="application/ld+json">{"@context":"https://unreachable.invalid/schema","@type":"Article","headline":"LD title","author":[{"name":"Ada"},{"name":"Bo"}],"datePublished":"2026-10-16T12:30:00+08:00","publisher":{"name":"Press"}}</script></head></html>`, "https://example.test/post");
    const selected = metadata.claims.filter((claim) => claim.selected);
    expect(selected.find((claim) => claim.field === "title")?.value).toBe("LD title");
    expect(metadata.claims.filter((claim) => claim.field === "title")).toHaveLength(4);
    expect(selected.find((claim) => claim.field === "authors")?.value).toEqual(["Ada", "Bo"]);
    expect(selected.find((claim) => claim.field === "published")).toMatchObject({ value: "2026-10-16T04:30:00.000Z", timezone: "explicit", datePrecision: "datetime", source: "json-ld" });
    expect(selected.find((claim) => claim.field === "description")?.value).toBe("Description é");
    expect(selected.find((claim) => claim.field === "canonical")?.value).toBe("https://example.test/article");
    expect(metadata.claims.every((claim) => claim.locator && claim.rule)).toBe(true);
  });
  test("retains timezone uncertainty and never invents publication time", async () => {
    for (const [date, precision, timezone] of [["2026-10-16", "date", "not-applicable"], ["2026-10-16T12:30:00", "datetime", "unknown"], ["2026-02-31", "invalid", "unknown"]]) {
      const metadata = await extractArticleMetadata(`<meta property="article:published_time" content="${date}">`, "https://example.test/");
      expect(metadata.claims[0]).toMatchObject({ value: date, datePrecision: precision, timezone, selected: precision !== "invalid" });
    }
    expect((await extractArticleMetadata("<title>No date</title>", "https://example.test/")).claims.some((claim) => claim.field === "published")).toBe(false);
  });
  test("bounded JSON-LD ignores remote contexts, hostile depth and malformed scripts", async () => {
    const deep = '{"x":'.repeat(20) + '0' + '}'.repeat(20);
    const metadata = await extractArticleMetadata(`<script type="application/ld+json">${deep}</script><script type="application/ld+json">no json</script><meta name="csrf-token" content="secret"><meta property="og:image" content="https://user:pass@example.test/image?X-Amz-Signature=secret">`, "https://example.test/");
    expect(metadata.warnings).toContain("json-limit"); expect(metadata.warnings).toContain("json-invalid");
    expect(JSON.stringify(metadata)).not.toContain("secret"); expect(JSON.stringify(metadata)).not.toContain("pass@");
    expect(metadata.claims).toHaveLength(1);
  });
  test("enforces claim/value limits and rejects unknown envelopes", async () => {
    const metadata = await extractArticleMetadata('<meta name="description" content="x">'.repeat(metadataLimits.claims + 20), "https://example.test/");
    expect(metadata.claims.length).toBeLessThanOrEqual(metadataLimits.claims); expect(metadata.warnings).toContain("claim-limit");
    expect(() => parseArticleMetadata({ ...metadata, schemaVersion: 2 })).toThrow();
    expect(() => parseArticleMetadata({ ...metadata, claims: [{ ...metadata.claims[0], value: "x".repeat(9000) }] })).toThrow();
    expect(() => parseArticleMetadata({ ...metadata, claims: [{ ...metadata.claims[0], selected: "yes" }] })).toThrow();
  });
});


test("unknown meta keys do not inherit object prototype fields", async () => {
  const metadata = await extractArticleMetadata('<meta name="constructor" content="A builder"><title>Still captured</title>', "https://example.test/");
  expect(metadata.claims.find(claim => claim.field === "meta:constructor")?.value).toBe("A builder");
  expect(metadata.claims.find(claim => claim.field === "title")?.value).toBe("Still captured");
});
test("an unterminated JSON-LD script is explicitly incomplete", async () => {
  const metadata = await extractArticleMetadata('<title>Useful title</title><script type="application/ld+json">{"@type":"Article","headline":"Unclosed"}', "https://example.test/");
  expect(metadata.warnings).toContain("json-invalid");
  expect(metadata.claims.some(claim => claim.source === "json-ld")).toBe(false);
});
test("stored URL evidence rejects relative signed locators and non-HTTP schemes", async () => {
  const metadata = await extractArticleMetadata('<meta property="og:image" content="/image?token=private#secret">', "https://example.test/");
  for (const field of ["observed", "value"]) for (const unsafe of ["/image?token=private", "javascript:alert(1)", "data:text/plain,secret"]) {
    expect(() => parseArticleMetadata({ ...metadata, claims: metadata.claims.map(claim => ({ ...claim, [field]: unsafe })) })).toThrow("metadata URL");
  }
  expect(JSON.stringify(metadata)).not.toContain("private"); expect(JSON.stringify(metadata)).not.toContain("secret");
  expect(metadata.claims[0]?.value).toBe("https://example.test/image");
});


test("specific article JSON-LD outranks generic WebPage independent of graph order", async () => {
  for (const type of ["Article", "NewsArticle", "BlogPosting", "https://schema.org/ScholarlyArticle"]) for (const reverse of [false, true]) {
    const nodes = [{ "@type": "WebPage", name: "Generic page", description: "Page details" }, { "@type": type, headline: "Actual article", description: "Article details" }];
    if (reverse) nodes.reverse();
    const metadata = await extractArticleMetadata(`<script type="application/ld+json">${JSON.stringify({ "@graph": nodes })}</script>`, "https://example.test/");
    expect(metadata.claims.find(claim => claim.field === "title" && claim.selected)?.value).toBe("Actual article");
    expect(metadata.claims.find(claim => claim.field === "description" && claim.selected)?.value).toBe("Article details");
    expect(metadata.claims.find(claim => claim.observed === "Generic page")?.rule).toContain("jsonld-type=WebPage");
    expect(metadata.claims.filter(claim => claim.field === "title")).toHaveLength(2);
  }
});
