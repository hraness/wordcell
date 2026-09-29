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
import { metadata as mem0Metadata } from "../app/compare/mem0/page";
import * as mem0Image from "../app/compare/mem0/opengraph-image";
import { metadata as supermemoryMetadata } from "../app/compare/supermemory/page";
import * as supermemoryImage from "../app/compare/supermemory/opengraph-image";
import { metadata as migrateMetadata } from "../app/migrate/supermemory/page";
import * as migrateImage from "../app/migrate/supermemory/opengraph-image";
import * as docImage from "../app/docs/[slug]/opengraph-image";
import { docCatalog, docOverview, docTitle } from "../app/docs/catalog";
import { docSocialPage, socialPages, wordcellSocialSite } from "../app/social";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  socialImageAlt,
  socialImageFit,
  socialImageIconShape,
  socialImageSiteDetails,
} from "@hraness/web-discovery/social-image/card";

const routes = [
  ["/", homeMetadata, homeImage, undefined],
  ["/developers", developersMetadata, developersImage, socialPages.developers],
  ["/benchmarks", benchmarksMetadata, benchmarksImage, socialPages.benchmarks],
  ["/docs", docsMetadata, docsImage, socialPages.docs],
  ["/compare/basic-memory", basicMemoryMetadata, basicMemoryImage, socialPages.compareBasicMemory],
  ["/compare/mem0", mem0Metadata, mem0Image, socialPages.compareMem0],
  ["/compare/supermemory", supermemoryMetadata, supermemoryImage, socialPages.compareSupermemory],
  ["/migrate/supermemory", migrateMetadata, migrateImage, socialPages.migrateSupermemory],
] as const;

test("the site declares one share card with the pinned Wordcell mark and brand", () => {
  expect(wordcellSocialSite.name).toBe("Wordcell");
  expect(wordcellSocialSite.domain).toBe("wordcell.io");
  expect(wordcellSocialSite.icon?.kind).toBe("mark");
  const prefix = "data:image/svg+xml;base64,";
  expect(wordcellSocialSite.icon?.src).toStartWith(prefix);
  const embedded = Buffer.from(wordcellSocialSite.icon!.src.slice(prefix.length), "base64");
  expect(embedded.equals(readFileSync(join(import.meta.dir, "../public/marks/kb.svg")))).toBe(true);
  expect(socialImageIconShape(wordcellSocialSite.icon!)).toBe("open");
  expect(Object.keys(wordcellSocialSite.theme ?? {}).sort()).toEqual(["accent", "background", "foreground", "muted"]);
  for (const color of Object.values(wordcellSocialSite.theme ?? {})) expect(color).toMatch(/^#[0-9A-F]{6}$/i);
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
      eyebrow: "Documentation",
      headline: cardTitle ?? entry.title,
    });
  }
  expect(docTitle("missing")).toBeNull();
  expect(docSocialPage("missing")).toBe(socialPages.docs);
});

test("every card fits as written: no cut description, smaller headline, or stripped text", () => {
  const pages = [
    undefined,
    ...Object.values(socialPages),
    ...[docOverview, ...docCatalog].map((entry) => docSocialPage(entry.slug)),
  ];
  for (const page of pages) {
    const details = socialImageSiteDetails(wordcellSocialSite, page);
    expect({ headline: page?.headline ?? "home", issues: socialImageFit(details).issues }).toEqual({
      headline: page?.headline ?? "home",
      issues: [],
    });
  }
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
