import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseSiteCatalogV1,
  parseSiteDocsV1,
  parseSiteGraphV1,
  parseSiteManifestV1,
  parseSiteNoteV1,
  parseSiteTermsV1,
  WORDCELL_SITE_FORMAT_V1,
} from "./publish-model.js";
import {
  projectVault,
  publishVault,
  renderPublishReportText,
  type PublishIo,
} from "./publish.js";
import { scanVault } from "./vault.js";

const READER_STUB = new Map<string, Uint8Array>([
  ["reader.js", new TextEncoder().encode("// reader stub\n")],
  ["reader.css", new TextEncoder().encode("/* reader stub */\n")],
]);

async function makeVault(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "hraness-wordcell-publish-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "private"), { recursive: true });
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(
    join(root, "index.md"),
    "# Test Vault\n\nStart at [[docs/alpha]].\n",
    "utf8",
  );
  await writeFile(
    join(root, "docs", "alpha.md"),
    [
      "---",
      "tags: [public]",
      "type: concept",
      "relations:",
      "  depends-on: docs/beta",
      "---",
      "# Alpha",
      "",
      "Alpha links [[docs/beta]] and embeds ![diagram](../assets/diagram.png).",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "docs", "beta.md"),
    "---\ntags: [public]\n---\n# Beta\n\nBeta body with a searchable needle. Back to [[docs/alpha]].\n",
    "utf8",
  );
  await writeFile(
    join(root, "private", "secret.md"),
    "---\npublish: false\n---\n# Secret\n\nPrivate content never ships.\n",
    "utf8",
  );
  await writeFile(join(root, "assets", "diagram.png"), "PNG-BYTES", "utf8");
  return root;
}

async function readJson(root: string, path: string): Promise<unknown> {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

describe("publishVault", () => {
  test("emits a complete parseable hraness.wordcell.site.v1 artifact", async () => {
    const root = await makeVault();
    const parent = await mkdtemp(join(tmpdir(), "hraness-wordcell-site-"));
    const out = join(parent, "site");
    try {
      const result = await publishVault({ root, out, deterministic: true });
      expect(result.report.format).toBe(WORDCELL_SITE_FORMAT_V1);
      expect(result.report.notes.published).toBe(3);
      expect(result.report.notes.excludedPrivate).toBe(1);
      expect(result.report.assets.count).toBe(1);

      // Every artifact parses under the contract.
      const manifest = parseSiteManifestV1(await readJson(out, "manifest.json"));
      expect(manifest.format).toBe(WORDCELL_SITE_FORMAT_V1);
      expect(manifest.generated.at).toBeUndefined(); // deterministic: no clock
      const catalog = parseSiteCatalogV1(await readJson(out, "catalog.json"));
      parseSiteDocsV1(await readJson(out, "index/docs.json"));
      parseSiteTermsV1(await readJson(out, "index/terms.json"));
      parseSiteGraphV1(await readJson(out, "graph.json"));

      // The vault index lands at the site root; other notes nest under n/.
      const slugs = catalog.entries.map(({ s }) => s).toSorted();
      expect(slugs).toEqual(["", "docs/alpha", "docs/beta"]);
      const indexPayload = parseSiteNoteV1(await readJson(out, "index.json"));
      expect(indexPayload.slug).toBe("");
      const alpha = parseSiteNoteV1(await readJson(out, "n/docs/alpha.json"));
      expect(alpha.links.map(({ s }) => s)).toContain("docs/beta");
      expect(alpha.relations.map(({ p }) => p)).toContain("depends-on");
      const beta = parseSiteNoteV1(await readJson(out, "n/docs/beta.json"));
      expect(beta.backlinks.map(({ s }) => s)).toContain("docs/alpha");

      // Pages, chrome, assets, and the reader all landed.
      const paths = [...result.files.keys()];
      for (const required of [
        "index.html",
        "404.html",
        "robots.txt",
        "n/docs/alpha/index.html",
        "n/docs/beta/index.html",
        "reader/reader.js",
        "reader/reader.css",
      ]) {
        expect(paths).toContain(required);
      }
      expect(paths.some((path) => path.startsWith("assets/"))).toBe(true);
      const alphaHtml = await readFile(join(out, "n/docs/alpha/index.html"), "utf8");
      expect(alphaHtml).toContain("Alpha");
      expect(alphaHtml).toContain("Beta");

      // Nothing outside the selection leaked into structured artifacts.
      const catalogText = await readFile(join(out, "catalog.json"), "utf8");
      expect(catalogText).not.toContain("secret");
      expect(catalogText).not.toContain("private/");
      const graphText = await readFile(join(out, "graph.json"), "utf8");
      expect(graphText).not.toContain("secret");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("deterministic mode produces byte-identical output across runs", async () => {
    const root = await makeVault();
    const parent = await mkdtemp(join(tmpdir(), "hraness-wordcell-site-"));
    try {
      const first = await publishVault({ root, out: join(parent, "a"), deterministic: true });
      const second = await publishVault({ root, out: join(parent, "b"), deterministic: true });
      expect([...first.files.keys()]).toEqual([...second.files.keys()]);
      for (const [path, bytes] of first.files) {
        expect(second.files.get(path)).toEqual(bytes);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("dry-run returns the file set without writing to disk", async () => {
    const root = await makeVault();
    const parent = await mkdtemp(join(tmpdir(), "hraness-wordcell-site-"));
    const out = join(parent, "site");
    try {
      const result = await publishVault({ root, out, dryRun: true });
      expect(result.files.size).toBeGreaterThan(0);
      let exists = true;
      try {
        await readFile(join(out, "manifest.json"), "utf8");
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("refuses to write inside the vault and requires --force for non-empty dirs", async () => {
    const root = await makeVault();
    const parent = await mkdtemp(join(tmpdir(), "hraness-wordcell-site-"));
    try {
      await expect(publishVault({ root, out: join(root, "site") }))
        .rejects.toThrow("inside");
      const out = join(parent, "occupied");
      await mkdir(out, { recursive: true });
      await writeFile(join(out, "stale.txt"), "x", "utf8");
      await expect(publishVault({ root, out }))
        .rejects.toThrow("not empty");
      await publishVault({ root, out, force: true, deterministic: true });
      const remaining = await readFile(join(out, "manifest.json"), "utf8");
      expect(remaining).toContain(WORDCELL_SITE_FORMAT_V1);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("selection subsets publish only the chosen neighborhood", async () => {
    const root = await makeVault();
    const parent = await mkdtemp(join(tmpdir(), "hraness-wordcell-site-"));
    try {
      const result = await publishVault({
        root,
        out: join(parent, "site"),
        deterministic: true,
        selection: { includes: ["docs/beta"] },
      });
      expect(result.report.notes.published).toBe(1);
      const catalog = parseSiteCatalogV1(await readJson(join(parent, "site"), "catalog.json"));
      expect(catalog.entries.map(({ s }) => s)).toEqual(["docs/beta"]);
      // The dropped alpha link is counted, and no alpha page was emitted.
      expect(result.report.links.droppedExternal).toBeGreaterThan(0);
      expect([...result.files.keys()]).not.toContain("n/docs/alpha/index.html");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe("projectVault", () => {
  test("projects a scanned vault without touching disk via injected IO", async () => {
    const root = await makeVault();
    try {
      const snapshot = await scanVault(root, { mentionScope: false });
      const io: PublishIo = {
        resolveAssetPath: () => undefined,
        readAsset: async () => undefined,
        readerFiles: async () => READER_STUB,
        version: "0.0.0-test",
      };
      const projection = await projectVault(snapshot, { root }, io);
      expect(projection.manifest.generated.version).toBe("0.0.0-test");
      expect(projection.files.get("reader/reader.js")).toBeDefined();
      // The stub resolver declined every asset, so none shipped.
      expect(projection.report.assets.count).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("renderPublishReportText", () => {
  test("renders a bounded human report", () => {
    const text = renderPublishReportText({
      format: WORDCELL_SITE_FORMAT_V1,
      out: "/tmp/site",
      deterministic: true,
      files: 10,
      bytes: 2048,
      notes: { published: 3, excludedPrivate: 1, excludedBySelection: 0 },
      links: { kept: 2, droppedExternal: 1 },
      assets: { count: 1, bytes: 9, skipped: 0 },
      search: { content: "inline", terms: 40, truncated: false },
    }, false);
    expect(text).toContain("Published 3 notes");
    expect(text).toContain("2,048");
    expect(text).not.toContain("warning");
  });
});
