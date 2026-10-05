import { expect, test } from "bun:test";

import { metadata as homeMetadata } from "../app/layout";
import * as homeImage from "../app/opengraph-image";
import { metadata as developersMetadata } from "../app/developers/page";
import * as developersImage from "../app/developers/opengraph-image";
import { metadata as benchmarksMetadata } from "../app/benchmarks/page";
import * as benchmarksImage from "../app/benchmarks/opengraph-image";
import { metadata as docsMetadata } from "../app/docs/page";
import * as docsImage from "../app/docs/opengraph-image";
import { metadata as basicMemoryMetadata } from "../app/compare/basic-memory/page";
import * as basicMemoryImage from "../app/compare/basic-memory/opengraph-image";
import { metadata as obsidianMetadata } from "../app/compare/obsidian/page";
import * as obsidianImage from "../app/compare/obsidian/opengraph-image";
import { metadata as mem0Metadata } from "../app/compare/mem0/page";
import * as mem0Image from "../app/compare/mem0/opengraph-image";
import { metadata as supermemoryMetadata } from "../app/compare/supermemory/page";
import * as supermemoryImage from "../app/compare/supermemory/opengraph-image";
import { metadata as claudeMemMetadata } from "../app/compare/claude-mem/page";
import * as claudeMemImage from "../app/compare/claude-mem/opengraph-image";
import { metadata as migrateMetadata } from "../app/migrate/supermemory/page";
import * as migrateImage from "../app/migrate/supermemory/opengraph-image";
import * as docImage from "../app/docs/[slug]/opengraph-image";
import { docCatalog, docOverview, docTitle } from "../app/docs/catalog";
import { docSocialPage, homeSocialPage, socialPages, wordcellSocialSite } from "../app/social";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  socialImageAlt,
  socialImageFit,
  socialImageSiteDetails,
} from "@hraness/web-discovery/social-image/card";

const routes = [
  ["/", homeMetadata, homeImage, homeSocialPage],
  ["/developers", developersMetadata, developersImage, socialPages.developers],
  ["/benchmarks", benchmarksMetadata, benchmarksImage, socialPages.benchmarks],
  ["/docs", docsMetadata, docsImage, socialPages.docs],
  ["/compare/basic-memory", basicMemoryMetadata, basicMemoryImage, socialPages.compareBasicMemory],
  ["/compare/obsidian", obsidianMetadata, obsidianImage, socialPages.compareObsidian],
  ["/compare/mem0", mem0Metadata, mem0Image, socialPages.compareMem0],
  ["/compare/supermemory", supermemoryMetadata, supermemoryImage, socialPages.compareSupermemory],
  ["/compare/claude-mem", claudeMemMetadata, claudeMemImage, socialPages.compareClaudeMem],
  ["/migrate/supermemory", migrateMetadata, migrateImage, socialPages.migrateSupermemory],
] as const;

test("the site declares one share card with the header's foil mark, brand, and palette", () => {
  expect(wordcellSocialSite.name).toBe("Wordcell");
  expect(wordcellSocialSite.brand).toBe("Wordcell");
  expect(wordcellSocialSite.domain).toBe("wordcell.io");
  expect(wordcellSocialSite.palette).toBe("gruvbox");
  const layout = readFileSync(join(import.meta.dir, "../app/layout.tsx"), "utf8");
  expect(layout).toContain(`data-palette="${wordcellSocialSite.palette}"`);
  const prefix = "data:image/svg+xml;base64,";
  expect(wordcellSocialSite.brandMark).toStartWith(prefix);
  const embedded = Buffer.from(wordcellSocialSite.brandMark!.slice(prefix.length), "base64");
  expect(embedded.equals(readFileSync(join(import.meta.dir, "../public/marks/kb.svg")))).toBe(true);
  expect(wordcellSocialSite.icon).toBeUndefined();
  expect(wordcellSocialSite.theme).toBeUndefined();
});

test("each route renders the shared template from the site declaration", () => {
  for (const [, metadata, image, page] of routes) {
    expect(metadata.title).toBeString();
    expect(image.alt).toBe(socialImageAlt(wordcellSocialSite, page));
    expect(image.size).toEqual({ height: 630, width: 1200 });
    expect(image.contentType).toBe("image/png");
  }
  expect(new Set(routes.map(([, , image]) => image.alt)).size).toBe(routes.length);
  expect(docImage.size).toEqual({ height: 630, width: 1200 });
  expect(docImage.contentType).toBe("image/png");
});

test("the home card is a PNG of the declared size", async () => {
  const response = homeImage.default();
  expect(response.headers.get("content-type")).toBe("image/png");
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect([...bytes.slice(1, 4)].map((byte) => String.fromCharCode(byte)).join("")).toBe("PNG");
  const view = new DataView(bytes.buffer);
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
});

test("every documentation route passes its own page copy", () => {
  expect(docTitle("overview")).toBe("Wordcell overview");
  for (const entry of [docOverview, ...docCatalog]) {
    expect(docTitle(entry.slug)).toBe(entry.title);
    const card = "card" in entry ? entry.card : undefined;
    const cardTitle = "cardTitle" in entry ? entry.cardTitle : undefined;
    expect(docSocialPage(entry.slug)).toEqual({
      description: card ?? entry.summary,
      headline: cardTitle ?? entry.title,
      path: `/docs/${entry.slug}`,
    });
  }
  expect(docTitle("missing")).toBeNull();
  expect(docSocialPage("missing")).toBe(socialPages.docs);
});

test("every card fits as written with no review findings, and every page card has an eyebrow", () => {
  const pages = [
    homeSocialPage,
    ...Object.values(socialPages),
    ...[docOverview, ...docCatalog].map((entry) => docSocialPage(entry.slug)),
  ];
  for (const page of pages) {
    const fit = socialImageFit(socialImageSiteDetails(wordcellSocialSite, page));
    expect({ headline: page.headline, findings: fit.findings }).toEqual({
      headline: page.headline,
      findings: [],
    });
    expect(fit.eyebrow).toBeString();
  }
});

test("the home card sets the hero headline over the tagline, as the hero does", () => {
  const fit = socialImageFit(socialImageSiteDetails(wordcellSocialSite, homeSocialPage));
  expect(fit.headline.lines.join(" ")).toBe("Give coding agents the decisions behind your code.");
  expect(fit.headline.threeLine).toBe(false);
  expect(fit.description?.lines.join(" ")).toBe("Give the next session what this one learned.");
  expect(fit.eyebrow).toBe("Markdown knowledge base");
});

test("page cards describe their own page instead of repeating the site tagline", () => {
  for (const [, , , page] of routes.slice(1)) {
    expect(page?.description).toBeString();
    expect(page?.description).not.toBe(wordcellSocialSite.description);
  }
  for (const entry of [docOverview, ...docCatalog]) {
    const page = docSocialPage(entry.slug);
    expect(page.description?.toLowerCase().startsWith((page.headline ?? "").toLowerCase())).toBe(false);
  }
});
