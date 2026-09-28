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
import { docCatalog, docTitle } from "../app/docs/catalog";

const routes = [
  ["/", homeMetadata, homeImage],
  ["/developers", developersMetadata, developersImage],
  ["/benchmarks", benchmarksMetadata, benchmarksImage],
  ["/docs", docsMetadata, docsImage],
  ["/compare/basic-memory", basicMemoryMetadata, basicMemoryImage],
  ["/compare/mem0", mem0Metadata, mem0Image],
  ["/compare/supermemory", supermemoryMetadata, supermemoryImage],
  ["/migrate/supermemory", migrateMetadata, migrateImage],
] as const;

test("each route's share image alt text matches its page title", () => {
  for (const [, metadata, image] of routes) {
    expect(metadata.title).toBe(image.alt);
    expect(image.size).toEqual({ height: 630, width: 1200 });
    expect(image.contentType).toBe("image/png");
  }
  expect(new Set(routes.map(([, , image]) => image.alt)).size).toBe(routes.length);
});

test("every documentation route resolves a card title", () => {
  expect(docTitle("overview")).toBe("Wordcell overview");
  for (const entry of docCatalog) expect(docTitle(entry.slug)).toBe(entry.title);
  expect(docTitle("missing")).toBeNull();
});
