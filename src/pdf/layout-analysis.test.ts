import { expect, test } from "bun:test";
import fc from "fast-check";
import { analyzePdfLayout } from "./layout.js";
import type { PdfPageLayout, PdfTextFragment } from "./model.js";
import { buildPdfMarkdown } from "./markdown.js";
function fragment(text: string, left: number, top: number, width = 210, extra: Partial<PdfTextFragment> = {}): PdfTextFragment {
  return { text, left, top, width, height: 14, fontSize: 12, fontId: "1", bold: false, italic: false, ...extra };
}
const page = (text: readonly PdfTextFragment[]): PdfPageLayout => ({ page: 1, width: 600, height: 800, text, images: [] });
const content = (result: ReturnType<typeof analyzePdfLayout>): string => result.blocks.map(block => block.kind === "image" ? "image" : block.kind === "table" ? block.rows.flat().join(" ") : block.text).join(" ");
test("orders columns before merging baselines and preserves a spanning heading", () => {
  const text = [fragment("Heading", 30, 30, 300, { fontSize: 24 }), ...[0, 1, 2, 3].flatMap(i => [fragment(`left${i}`, 30, 100 + i * 20), fragment(`right${i}`, 330, 100 + i * 20)])];
  const result = analyzePdfLayout([page(text)]);
  expect(content(result)).toBe("Heading left0 left1 left2 left3 right0 right1 right2 right3"); expect(result.issues).toEqual([]); expect(result.blocks[0]!.kind).toBe("heading");
});
test("aligned compact numeric table with explicit header becomes escaped Markdown", () => {
  const text = [fragment("Name\\|type", 30, 80, 60, { bold: true }), fragment("Count", 250, 80, 40, { bold: true }), ...[0, 1, 2].flatMap(i => [fragment(`item${i}`, 30, 100 + i * 20, 50), fragment(String(i), 250, 100 + i * 20, 30)])];
  const result = analyzePdfLayout([page(text)]); expect(result.blocks[0]!.kind).toBe("table"); expect(result.issues).toEqual([]);
  const built = buildPdfMarkdown({ slug: "table", originalFilename: "table.pdf", sourceSha256: "a".repeat(64), capturedDate: "2026-10-16", status: "complete", metadata: { title: null, author: null, subject: null, keywords: null, creator: null, producer: null, createdAt: null, modifiedAt: null, pageCount: 1, encrypted: false }, blocks: result.blocks, images: new Map(), embeddedPlatforms: [] });
  expect(built.markdown).toContain("| Name\\\\\\|type | Count |"); expect(built.markdown).toContain("| --- | --- |");
});
test("adjacent raised digits remain attached while unsupported math is partial", () => {
  const result = analyzePdfLayout([page([fragment("x", 30, 100, 10), fragment("2", 40, 95, 6, { fontSize: 8, height: 9 })])]); expect(content(result)).toBe("x²");
  const uncertain = analyzePdfLayout([page([fragment("∫ f(x)", 30, 100)])]); expect(uncertain.issues).toEqual([{ page: 1, code: "math-structure-uncertain" }]);
});
test("ambiguous multi-cell geometry is reported instead of asserting a table", () => {
  const result = analyzePdfLayout([page([0, 1, 2].flatMap(i => [fragment(`a${i}`, 30, 100 + i * 20, 30), fragment(`b${i}`, 200, 100 + i * 20, 30), fragment(`c${i}`, 400, 100 + i * 20, 30)]))]);
  expect(result.issues.some(issue => issue.code === "table-structure-uncertain")).toBe(true);
});
test("column output is invariant to fragment input permutation and translation", () => {
  fc.assert(fc.property(fc.integer({ min: 3, max: 20 }), fc.integer({ min: 0, max: 20 }), (count, shift) => {
    const text = Array.from({ length: count }, (_, i) => [fragment(`L${i}`, 30 + shift, 100 + i * 20), fragment(`R${i}`, 330 + shift, 100 + i * 20)]).flat();
    expect(content(analyzePdfLayout([page(text)]))).toBe(content(analyzePdfLayout([page([...text].reverse())])));
    const output = content(analyzePdfLayout([page(text)])); for (let i = 0; i < count; i++) { expect(output.split(`L${i}`).length).toBeGreaterThan(1); expect(output.split(`R${i}`).length).toBeGreaterThan(1); }
  }), { numRuns: 50 });
});
test("removing repeated margins preserves identical body text",()=>{
 const pages=[1,2,3].map(number=>({...page([fragment("Methods",30,20),fragment("Methods",30,200)]),page:number}));
 const result=analyzePdfLayout(pages);expect(content(result)).toBe("Methods Methods Methods");
});
