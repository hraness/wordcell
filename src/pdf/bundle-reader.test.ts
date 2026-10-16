import { afterEach, expect, test } from "bun:test";
import fc from "fast-check";
import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, writeFileSync, mkdirSync, rmSync, symlinkSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectPdfCaptureBundle, verifyPdfCaptureBundle } from "./bundle-reader.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "pdf-bundle-test-"))); roots.push(root);
  const source = "%PDF-1.4\n%%EOF\n", markdown = "# Sample\n\n<!-- pdf-page: 1 -->\n\n![pixel](assets/image.png)\n", image = "fixture";
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "source.pdf"), source); writeFileSync(join(root, "note.md"), markdown); writeFileSync(join(root, "assets/image.png"), image);
  const descriptor = (path: string, text: string) => ({ path, bytes: Buffer.byteLength(text), sha256: hash(text) });
  const manifest = { schemaVersion: 1, kind: "pdf", status: "complete", document: { pageCount: 1, processedPages: 1 }, source: { ...descriptor("source.pdf", source), mimeType: "application/pdf" }, markdown: descriptor("note.md", markdown), images: [{ id: "image-1", page: 1, asset: descriptor("assets/image.png", image) }], annotations: null, extraction: { imageCount: 1 } };
  const save = (value: unknown = manifest) => writeFileSync(join(root, "capture.json"), JSON.stringify(value)); save();
  return { root, manifest, save };
}
test("verifies source, Markdown, image digests and page references", async () => {
  const { root } = fixture(); const result = await verifyPdfCaptureBundle(root);
  expect(result.ok).toBe(true); expect(result.inspection.assets).toHaveLength(1);
});
test("legacy Markdown is readable but explicitly unverified", async () => {
  const { root, manifest, save } = fixture(); const { markdown: _, ...legacy } = manifest; save(legacy);
  const result = await verifyPdfCaptureBundle(root); expect(result.ok).toBe(false); expect(result.inspection.markdown.integrity).toBe("unavailable");
});
test("tampering never verifies", async () => {
  const { root } = fixture(); writeFileSync(join(root, "source.pdf"), "%PDF-tampered"); writeFileSync(join(root, "assets/image.png"), "damage");
  const result = await verifyPdfCaptureBundle(root); expect(result.ok).toBe(false); expect(result.issues.map(issue => issue.kind)).toEqual(["source-integrity", "asset-integrity"]);
});
test("rejects unsupported schemas and false complete quality", async () => {
  const { root, manifest, save } = fixture(); save({ ...manifest, schemaVersion: 2 }); await expect(inspectPdfCaptureBundle(root)).rejects.toMatchObject({ code: "unsupported-schema" });
  save({ ...manifest, quality: { schemaVersion: 1, issues: [{ page: 1, code: "reading-order-uncertain" }] } }); await expect(inspectPdfCaptureBundle(root)).rejects.toThrow("cannot claim complete");
});
test("rejects linked files, linked parents, aliases and multiple hard links", async () => {
  const { root } = fixture(); rmSync(join(root, "assets/image.png")); symlinkSync(join(root, "source.pdf"), join(root, "assets/image.png")); await expect(inspectPdfCaptureBundle(root)).rejects.toThrow("single-link");
  rmSync(join(root, "assets/image.png")); linkSync(join(root, "source.pdf"), join(root, "assets/image.png")); await expect(inspectPdfCaptureBundle(root)).rejects.toThrow("single-link");
  rmSync(join(root, "assets"), { recursive: true }); symlinkSync(root, join(root, "assets")); await expect(inspectPdfCaptureBundle(root)).rejects.toThrow("ancestor");
  const alias = join(root, "alias"); symlinkSync(root, alias); await expect(inspectPdfCaptureBundle(alias)).rejects.toThrow("canonical");
});
test("rejects invalid UTF-8, image page references and asset quotas", async () => {
  const { root, manifest, save } = fixture();
  await expect(inspectPdfCaptureBundle(root, { maxTotalAssetBytes: 2 })).rejects.toMatchObject({ code: "limit-exceeded" });
  manifest.images[0]!.page = 2; save(); await expect(inspectPdfCaptureBundle(root)).rejects.toThrow("page reference");
  manifest.images[0]!.page = 1; save(); writeFileSync(join(root, "note.md"), Buffer.from([0xff])); await expect(inspectPdfCaptureBundle(root)).rejects.toThrow("UTF-8");
});
test("rejects mismatched annotation references", async () => {
  const { root, manifest, save } = fixture(); const bytes = JSON.stringify([{ id: "other", sha256: "a".repeat(64), kind: "visual" }]);
  writeFileSync(join(root, "annotations.json"), bytes);
  save({ ...manifest, annotations: { path: "annotations.json", bytes: Buffer.byteLength(bytes), sha256: hash(bytes), count: 1 } });
  await expect(inspectPdfCaptureBundle(root)).rejects.toThrow("unknown image");
});
test("arbitrary traversal paths are rejected", async () => {
  const { root, manifest, save } = fixture();
  await fc.assert(fc.asyncProperty(fc.stringMatching(/^[a-z]{1,20}$/), async value => {
    save({ ...manifest, markdown: { ...manifest.markdown, path: `../${value}.md` } });
    await expect(inspectPdfCaptureBundle(root)).rejects.toThrow("unsafe segment");
  }), { numRuns: 50 });
});
test("undeclared Markdown assets cannot pass verification", async () => {
  const {root, manifest, save}=fixture();
  const markdown="<!-- pdf-page: 1 -->\n![one](assets/image.png) ![missing](assets/absent.png)\n";
  writeFileSync(join(root,"note.md"),markdown);manifest.markdown={path:"note.md",bytes:Buffer.byteLength(markdown),sha256:hash(markdown)};save();
  await expect(verifyPdfCaptureBundle(root)).rejects.toThrow("undeclared PDF asset");
});
test("cumulative asset budget accounts actual bytes when declared sizes are understated", async () => {
  const {root,manifest,save}=fixture();
  const markdown="<!-- pdf-page: 1 -->\n![one](assets/image.png) ![two](assets/second.png)\n";
  writeFileSync(join(root,"note.md"),markdown);writeFileSync(join(root,"assets/second.png"),"fixture");
  manifest.markdown={path:"note.md",bytes:Buffer.byteLength(markdown),sha256:hash(markdown)};
  manifest.images[0]!.asset.bytes=1;manifest.images.push({id:"image-2",page:1,asset:{path:"assets/second.png",bytes:1,sha256:hash("fixture")}});manifest.extraction.imageCount=2;save();
  await expect(inspectPdfCaptureBundle(root,{maxTotalAssetBytes:10})).rejects.toThrow("exceeds");
  const result=await verifyPdfCaptureBundle(root,{maxTotalAssetBytes:14});expect(result.ok).toBe(false);expect(result.inspection.assets).toHaveLength(2);
});
test("invalid annotation shapes have a typed invalid-input failure",async()=>{
 const {root,manifest,save}=fixture();const bytes=JSON.stringify([{kind:"unknown"}]);writeFileSync(join(root,"annotations.json"),bytes);
 save({...manifest,annotations:{path:"annotations.json",bytes:Buffer.byteLength(bytes),sha256:hash(bytes),count:1}});
 await expect(inspectPdfCaptureBundle(root)).rejects.toMatchObject({code:"invalid-input"});
});
test("Markdown cannot silently associate a retained image with an undeclared page",async()=>{
 const {root,manifest,save}=fixture();const markdown="<!-- pdf-page: 1 -->\n![one](assets/image.png)\n<!-- pdf-page: 2 -->\n![two](assets/image.png)\n";
 writeFileSync(join(root,"note.md"),markdown);manifest.document={pageCount:2,processedPages:2};manifest.markdown={path:"note.md",bytes:Buffer.byteLength(markdown),sha256:hash(markdown)};save();
 await expect(verifyPdfCaptureBundle(root)).rejects.toThrow("page disagrees");
 manifest.images.push({...manifest.images[0]!,id:"image-2",page:2});manifest.extraction.imageCount=2;save();expect((await verifyPdfCaptureBundle(root)).ok).toBe(true);
});
