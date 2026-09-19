import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  WORDCELL_SITE_LIMITS_V1,
} from "./publish-model.js";
import {
  projectVault,
  MAX_PUBLISH_LIST_BYTES,
  publishVault,
  renderPublishReportText,
  type PublishIo,
} from "./publish.js";
import { analyzeVault, parseNote } from "./graph.js";
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
    "---\ntags: [public]\n---\n# Beta\n\nBeta body with a searchable needle. Back to [[docs/alpha]].\n\n## Details\n\nMore beta.\n",
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
        "graph/index.html",
        "reader/reader.js",
        "reader/reader.css",
        "reader/theme.js",
      ]) {
        expect(paths).toContain(required);
      }
      expect(paths.some((path) => path.startsWith("assets/"))).toBe(true);
      const alphaHtml = await readFile(join(out, "n/docs/alpha/index.html"), "utf8");
      expect(alphaHtml).toContain("Alpha");
      expect(alphaHtml).toContain("Beta");

      // Note chrome: sidebar tree, breadcrumbs, and per-note TOC.
      expect(alphaHtml).toContain('class="site-nav"');
      expect(alphaHtml).toContain('aria-current="page"');
      expect(alphaHtml).toContain('class="breadcrumbs"');
      expect(alphaHtml).toContain('href="../../../graph/"');
      const alphaNav = alphaHtml.indexOf('class="site-nav"');
      expect(alphaHtml.slice(alphaNav)).toContain("docs/beta");

      const graphHtml = await readFile(join(out, "graph/index.html"), "utf8");
      expect(graphHtml).toContain("data-wordcell-graph");
      expect(graphHtml).toContain('aria-current="page"');
      expect(graphHtml).toContain('class="graph-index"');
      expect(graphHtml).toContain("docs/alpha");

      // Two authored headings produce a per-note table of contents.
      const betaHtml = await readFile(join(out, "n/docs/beta/index.html"), "utf8");
      expect(betaHtml).toContain('class="note-toc"');
      expect(betaHtml).toContain('href="#details"');

      // The synchronous appearance bootstrap ships as a classic script
      // before the stylesheet on every page so stored palettes apply
      // pre-paint under the strict self-only CSP.
      for (const html of [alphaHtml, graphHtml]) {
        const themeAt = html.indexOf("reader/theme.js");
        const cssAt = html.indexOf("reader/reader.css");
        expect(themeAt).toBeGreaterThan(-1);
        expect(cssAt).toBeGreaterThan(themeAt);
        expect(html).not.toContain(`type="module" src="${"../".repeat(3)}reader/theme.js"`);
        expect(html).not.toContain('type="module" src="../reader/theme.js"');
      }

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

  test("rejects an output ancestor before force can delete the vault", async () => {
    const parent = await mkdtemp(join(tmpdir(), "hraness-wordcell-ancestor-"));
    const root = join(parent, "kb");
    await mkdir(root);
    await writeFile(join(root, "keep.md"), "# Keep this source\n");
    try {
      await expect(publishVault({ root, out: parent, force: true })).rejects.toThrow("contain the vault");
      expect(await readFile(join(root, "keep.md"), "utf8")).toBe("# Keep this source\n");
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("resolves symlink parents before checking output confinement", async () => {
    const root = await makeVault();
    const parent = await mkdtemp(join(tmpdir(), "hraness-wordcell-alias-"));
    const alias = join(parent, "alias");
    await symlink(root, alias, "dir");
    try {
      await expect(publishVault({ root, out: join(alias, "site"), force: true })).rejects.toThrow("inside");
      await expect(publishVault({ root, out: alias, force: true })).rejects.toThrow("symbolic link");
      const vaultThroughAlias = join(alias, "docs");
      await expect(publishVault({ root: vaultThroughAlias, out: root, force: true })).rejects.toThrow("contain the vault");
      expect(await readFile(join(root, "docs/alpha.md"), "utf8")).toContain("# Alpha");
    } finally {
      await rm(parent, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  });

  test("bounded dry-run report lists only selected ids and leaves the output untouched", async () => {
    const root = await makeVault();
    const parent = await mkdtemp(join(tmpdir(), "hraness-wordcell-report-"));
    await writeFile(join(parent, "keep.txt"), "unchanged");
    try {
      const result = await publishVault({
        root, out: parent, dryRun: true, force: true, listLimit: 1,
        selection: { includeGlobs: ["docs/**"], excludes: ["private/secret"] },
      });
      expect(result.report.selection.ids).toEqual(["docs/alpha"]);
      expect(result.report.selection.total).toBe(2);
      expect(result.report.selection.truncated).toBe(true);
      expect(result.report.selection.digest).toBe(result.manifest.source.digest);
      expect(JSON.stringify(result.report)).not.toContain("searchable needle");
      expect(JSON.stringify(result.manifest)).not.toContain("private/secret");
      expect(await readFile(join(parent, "keep.txt"), "utf8")).toBe("unchanged");
      const countsOnly = await publishVault({ root, out: parent, dryRun: true, listLimit: 0 });
      expect(countsOnly.report.selection.ids).toEqual([]);
      expect(countsOnly.report.selection.truncated).toBe(true);
      await expect(publishVault({ root, out: parent, listLimit: 1001 })).rejects.toThrow("--list-limit");
    } finally {
      await rm(parent, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  });

  test("an empty selection previews safely and cannot erase an existing output", async () => {
    const root = await makeVault();
    const out = await mkdtemp(join(tmpdir(), "hraness-wordcell-empty-"));
    await writeFile(join(out, "keep.txt"), "existing site");
    const options = { root, out, force: true, selection: { includeGlobs: ["typo/**/*.md"] } };
    try {
      const preview = await publishVault({ ...options, dryRun: true });
      expect(preview.report.notes.published).toBe(0);
      expect(preview.report.selection.ids).toEqual([]);
      await expect(publishVault(options)).rejects.toThrow("Publish selection is empty");
      expect(await readFile(join(out, "keep.txt"), "utf8")).toBe("existing site");
    } finally {
      await rm(out, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  });

  test.each([
    { label: "title", content: `# ${"界".repeat(200)}\n`, error: "note.title" },
    { label: "aliases", content: `---\naliases: [${Array.from({ length: 129 }, (_, i) => `alias${i}`).join(", ")}]\n---\n# Aliases\n`, error: "note.aliases" },
    { label: "tags", content: `---\ntags: [${Array.from({ length: 129 }, (_, i) => `tag${i}`).join(", ")}]\n---\n# Tags\n`, error: "note.tags" },
  ])("rejects oversized $label before replacing output", async ({ content, error }) => {
    const root = await makeVault();
    const out = await mkdtemp(join(tmpdir(), "hraness-wordcell-bounds-"));
    await writeFile(join(root, "oversized.md"), content);
    await writeFile(join(out, "keep.txt"), "existing site");
    try {
      await expect(publishVault({ root, out, force: true, selection: { includes: ["oversized"] } })).rejects.toThrow(error);
      expect(await readFile(join(out, "keep.txt"), "utf8")).toBe("existing site");
    } finally {
      await rm(out, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
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

test("report id bytes are bounded and preview limits do not change artifact bytes", async () => {
  const notes = Array.from({ length: 24 }, (_, index) => parseNote(`${"x".repeat(900)}${index}.md`, "# Note\n"));
  const snapshot = { root: "/vault", notes, analysis: analyzeVault(notes) };
  const io: PublishIo = {
    resolveAssetPath: () => undefined,
    readAsset: async () => undefined,
    readerFiles: async () => READER_STUB,
  };
  const first = await projectVault(snapshot, { root: "/vault", listLimit: 1000, deterministic: true }, io);
  const second = await projectVault(snapshot, { root: "/vault", listLimit: 0, deterministic: true }, io);
  expect(first.report.selection.ids.length).toBeGreaterThan(0);
  expect(first.report.selection.ids.reduce((sum, id) => sum + Buffer.byteLength(id), 0)).toBeLessThanOrEqual(MAX_PUBLISH_LIST_BYTES);
  expect(first.report.selection.truncated).toBe(true);
  expect(second.report.selection.ids).toEqual([]);
  expect(first.report.selection.digest).toBe(second.report.selection.digest);
  expect([...first.files.entries()]).toEqual([...second.files.entries()]);
});

test("multibyte note payloads respect byte limits without corrupting Unicode", async () => {
  const notes = [parseNote("unicode.md", `# Unicode\n\n${"界".repeat(WORDCELL_SITE_LIMITS_V1.noteTextBytes)}`)];
  const projection = await projectVault({ root: "/vault", notes, analysis: analyzeVault(notes) }, { root: "/vault" }, {
    resolveAssetPath: () => undefined,
    readAsset: async () => undefined,
    readerFiles: async () => READER_STUB,
  });
  const bytes = projection.files.get("n/unicode.json");
  const payload = parseSiteNoteV1(JSON.parse(new TextDecoder().decode(bytes)));
  expect(Buffer.byteLength(payload.text, "utf8")).toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.noteTextBytes);
  expect(payload.text).not.toContain("�");
  expect(payload.textTruncated).toBe(true);
  const decode = (path: string): unknown => JSON.parse(new TextDecoder().decode(projection.files.get(path)));
  const docs = parseSiteDocsV1(decode("index/docs.json"));
  parseSiteManifestV1(decode("manifest.json"));
  parseSiteCatalogV1(decode("catalog.json"));
  parseSiteGraphV1(decode("graph.json"));
  parseSiteTermsV1(decode("index/terms.json"));
  expect(Buffer.byteLength(docs.docs[0]?.p ?? "", "utf8")).toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.docPreviewBytes);
  expect(Buffer.byteLength(docs.docs[0]?.x ?? "", "utf8")).toBeLessThanOrEqual(WORDCELL_SITE_LIMITS_V1.inlineTextBytes);
});

describe("renderPublishReportText", () => {
  test("renders a bounded human report", () => {
    const text = renderPublishReportText({
      format: WORDCELL_SITE_FORMAT_V1,
      out: "/tmp/site",
      deterministic: true,
      selection: { ids: ["docs/a"], total: 3, truncated: true, digest: "sha256:example" },
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
