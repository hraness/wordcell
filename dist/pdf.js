// @bun
import {
  PDF_CAPTURE_ANNOTATIONS_FILENAME,
  PDF_CAPTURE_MANIFEST_FILENAME,
  PDF_CAPTURE_MANIFEST_SCHEMA_VERSION,
  PDF_CAPTURE_SOURCE_FILENAME,
  PdfCaptureError,
  buildPdfMarkdown,
  decodePopplerText,
  inspectPdf,
  layoutBlocks,
  main,
  ocrPdfImage,
  parsePdfArguments,
  parsePdfImageInterpretations,
  parsePdfInfo,
  parsePopplerXml,
  parseTesseractTsv,
  pdfCaptureDefaults,
  pdfCaptureSummary,
  pdfImageAssetPath,
  pdfMarkdownFilename,
  pdfUsage,
  persistPdfCapture,
  resolvePdfTools,
  runPdfCapture,
  runPdfToolCommand
} from "./index-my50xsa3.js";
import"./index-h2w7syy2.js";
import"./index-jbtyp6q5.js";
import"./index-g63d3937.js";
import"./index-e2wstc7t.js";
import"./index-e5fbsywq.js";
import"./index-gh719d91.js";
import"./index-1xxnjn0d.js";
import"./index-z1w83f81.js";

// src/pdf/bundle-reader.ts
import { createHash } from "crypto";
import { constants as fsConstants } from "fs";
import { lstat, open, opendir, realpath } from "fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "path";
function boundedInteger(value, fallback, maximum, label) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) {
    throw new PdfCaptureError("invalid-input", `${label} must be an integer from 1 through ${maximum}`);
  }
  return selected;
}
function confinedRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 || value.includes("\x00")) {
    throw new PdfCaptureError("integrity", `${label} must be a bounded non-empty path`);
  }
  if (isAbsolute(value) || value.includes("\\"))
    throw new PdfCaptureError("integrity", `${label} must be a relative POSIX path`);
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new PdfCaptureError("integrity", `${label} contains an unsafe segment`);
  }
  return value;
}

class MissingCaptureAssetError extends PdfCaptureError {
  constructor(message) {
    super("integrity", message);
  }
}
function isMissingPathError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function assertAssetVerificationDeadline(deadline) {
  if (deadline !== undefined && performance.now() >= deadline) {
    throw new PdfCaptureError("timeout", "capture asset verification exceeded its time budget");
  }
}
function confined(root, relativePath, label) {
  const path = resolve(root.path, relativePath);
  const lexical = relative(root.path, path);
  if (lexical === "" || lexical === ".." || lexical.startsWith(`..${sep}`) || isAbsolute(lexical)) {
    throw new PdfCaptureError("integrity", `${label} escapes the capture bundle`);
  }
  return path;
}
async function safeDirectory(pathInput) {
  if (pathInput.trim() === "")
    throw new PdfCaptureError("integrity", "capture bundle path is required");
  const path = resolve(pathInput);
  const canonical = await realpath(path);
  if (canonical !== path)
    throw new PdfCaptureError("integrity", "capture bundle path must be canonical and cannot traverse a symbolic link");
  const stats = await lstat(path, { bigint: true });
  if (!stats.isDirectory() || stats.isSymbolicLink())
    throw new PdfCaptureError("integrity", "capture bundle path must be a real directory");
  if (dirname(path) === path)
    throw new PdfCaptureError("integrity", "refusing a filesystem root as a capture bundle");
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isDirectory() || opened.dev !== stats.dev || opened.ino !== stats.ino) {
      throw new PdfCaptureError("integrity", "capture bundle root changed while it was opened");
    }
    return { path, handle, device: opened.dev, inode: opened.ino };
  } catch (error) {
    await handle.close();
    throw error;
  }
}
async function assertBundleRoot(root, deadline) {
  assertAssetVerificationDeadline(deadline);
  const [opened, named, canonical] = await Promise.all([
    root.handle.stat({ bigint: true }),
    lstat(root.path, { bigint: true }),
    realpath(root.path)
  ]);
  assertAssetVerificationDeadline(deadline);
  if (canonical !== root.path || !opened.isDirectory() || !named.isDirectory() || named.isSymbolicLink() || opened.dev !== root.device || opened.ino !== root.inode || named.dev !== root.device || named.ino !== root.inode)
    throw new PdfCaptureError("integrity", "capture bundle root changed during inspection");
}
async function assertAncestorChain(root, relativePath, label, deadline) {
  await assertBundleRoot(root, deadline);
  const segments = confinedRelativePath(relativePath, label).split("/");
  let current = root.path;
  for (const segment of segments.slice(0, -1)) {
    current = resolve(current, segment);
    assertAssetVerificationDeadline(deadline);
    const metadata = await lstat(current, { bigint: true });
    assertAssetVerificationDeadline(deadline);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new PdfCaptureError("integrity", `${label} must not traverse a linked or non-directory ancestor`);
    }
    const canonical = await realpath(current);
    assertAssetVerificationDeadline(deadline);
    if (canonical !== current) {
      throw new PdfCaptureError("integrity", `${label} must not traverse a filesystem alias`);
    }
  }
  await assertBundleRoot(root, deadline);
}
async function withRegularFile(root, relativePath, maximumBytes, label, read, deadline, missingError) {
  await assertAncestorChain(root, relativePath, label, deadline);
  const path = confined(root, relativePath, label);
  assertAssetVerificationDeadline(deadline);
  let before;
  try {
    before = await lstat(path, { bigint: true });
  } catch (error) {
    assertAssetVerificationDeadline(deadline);
    if (missingError !== undefined && isMissingPathError(error))
      throw missingError;
    throw error;
  }
  assertAssetVerificationDeadline(deadline);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) {
    throw new PdfCaptureError("integrity", `${label} must be a regular single-link file`);
  }
  if (before.size > BigInt(maximumBytes))
    throw new PdfCaptureError("integrity", `${label} exceeds ${maximumBytes} bytes`);
  const canonical = await realpath(path);
  assertAssetVerificationDeadline(deadline);
  if (canonical !== path)
    throw new PdfCaptureError("integrity", `${label} must not traverse a filesystem alias`);
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    assertAssetVerificationDeadline(deadline);
    const opened = await handle.stat({ bigint: true });
    assertAssetVerificationDeadline(deadline);
    if (!opened.isFile() || opened.nlink !== 1n || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size)
      throw new PdfCaptureError("integrity", `${label} changed while it was opened`);
    await assertAncestorChain(root, relativePath, label, deadline);
    const result = await read(handle, Number(opened.size));
    assertAssetVerificationDeadline(deadline);
    const after = await handle.stat({ bigint: true });
    assertAssetVerificationDeadline(deadline);
    const named = await lstat(path, { bigint: true });
    assertAssetVerificationDeadline(deadline);
    await assertAncestorChain(root, relativePath, label, deadline);
    const finalCanonical = await realpath(path);
    assertAssetVerificationDeadline(deadline);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.nlink !== 1n || named.dev !== before.dev || named.ino !== before.ino || named.size !== before.size || named.mtimeNs !== before.mtimeNs || named.nlink !== 1n || named.isSymbolicLink() || finalCanonical !== path)
      throw new PdfCaptureError("integrity", `${label} changed while it was read`);
    return result;
  } finally {
    await handle.close();
    assertAssetVerificationDeadline(deadline);
  }
}
async function readRegularFile(root, relativePath, maximumBytes, label, deadline) {
  return withRegularFile(root, relativePath, maximumBytes, label, async (handle, size) => {
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      assertAssetVerificationDeadline(deadline);
      const result = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (result.bytesRead === 0)
        throw new PdfCaptureError("integrity", `${label} changed while it was read`);
      offset += result.bytesRead;
    }
    return bytes;
  }, deadline);
}
async function hashRegularFile(root, relativePath, maximumBytes, deadline, label) {
  assertAssetVerificationDeadline(deadline);
  await assertBundleRoot(root, deadline);
  assertAssetVerificationDeadline(deadline);
  await assertAncestorChain(root, relativePath, label, deadline);
  const path = confined(root, relativePath, label);
  assertAssetVerificationDeadline(deadline);
  try {
    await lstat(path, { bigint: true });
  } catch (error) {
    assertAssetVerificationDeadline(deadline);
    if (isMissingPathError(error)) {
      await assertBundleRoot(root, deadline);
      throw new MissingCaptureAssetError(`capture asset ${relativePath} is missing`);
    }
    throw error;
  }
  assertAssetVerificationDeadline(deadline);
  return withRegularFile(root, relativePath, maximumBytes, label, async (handle, size) => {
    assertAssetVerificationDeadline(deadline);
    const hash = createHash("sha256");
    const chunk = Buffer.allocUnsafe(Math.min(1 * 1024 * 1024, Math.max(1, size)));
    let offset = 0;
    while (offset < size) {
      assertAssetVerificationDeadline(deadline);
      const result = await handle.read(chunk, 0, Math.min(chunk.byteLength, size - offset), offset);
      assertAssetVerificationDeadline(deadline);
      if (result.bytesRead === 0)
        throw new PdfCaptureError("integrity", `${label} changed while it was read`);
      hash.update(chunk.subarray(0, result.bytesRead));
      offset += result.bytesRead;
    }
    assertAssetVerificationDeadline(deadline);
    return { bytes: size, sha256: hash.digest("hex") };
  }, deadline, new MissingCaptureAssetError(`capture asset ${relativePath} is missing`));
}
function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function invalid(message) {
  throw new PdfCaptureError("invalid-input", message);
}
function object(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    invalid("PDF bundle requires an object");
  return value;
}
function integer(value, maximum, minimum = 0) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum)
    invalid("PDF bundle has an invalid count or page reference");
  return value;
}
function descriptor(value) {
  const entry = object(value);
  if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256))
    invalid("PDF bundle has an invalid digest");
  return { path: confinedRelativePath(entry.path, "PDF artifact"), bytes: integer(entry.bytes, 8 * 1024 ** 3), sha256: entry.sha256 };
}
function decode(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalid("PDF bundle text is not UTF-8");
  }
}
function parse(bytes) {
  try {
    return JSON.parse(decode(bytes));
  } catch (error) {
    if (error instanceof PdfCaptureError)
      throw error;
    return invalid("PDF bundle JSON is invalid");
  }
}
async function inspectPdfCaptureBundle(path, options = {}) {
  const maxDocument = boundedInteger(options.maxDocumentBytes, 64 * 1024 ** 2, 256 * 1024 ** 2, "maxDocumentBytes");
  const maxSource = boundedInteger(options.maxSourceBytes, 512 * 1024 ** 2, 8 * 1024 ** 3, "maxSourceBytes");
  const maxAsset = boundedInteger(options.maxAssetBytes, 100 * 1024 ** 2, 8 * 1024 ** 3, "maxAssetBytes");
  const maxTotal = boundedInteger(options.maxTotalAssetBytes, 500 * 1024 ** 2, 8 * 1024 ** 3, "maxTotalAssetBytes");
  const maxAssets = boundedInteger(options.maxVerifiedAssets, 1000, 1e4, "maxVerifiedAssets");
  const deadline = performance.now() + boundedInteger(options.maxVerificationMs, 30000, 300000, "maxVerificationMs");
  const root = await safeDirectory(path);
  try {
    const manifest = object(parse(await readRegularFile(root, "capture.json", 4 * 1024 ** 2, "PDF manifest", deadline)));
    if (manifest.schemaVersion !== 1)
      throw new PdfCaptureError("unsupported-schema", "Unsupported PDF manifest schema");
    if (manifest.kind !== "pdf" || manifest.status !== "complete" && manifest.status !== "partial")
      invalid("Invalid PDF manifest kind or status");
    const document = object(manifest.document);
    const pageCount = integer(document.pageCount, 1e5, 1);
    const processedPages = integer(document.processedPages, pageCount, 1);
    if (processedPages < pageCount && manifest.status !== "partial")
      invalid("Truncated PDF cannot claim complete");
    if (manifest.quality !== undefined) {
      const quality = object(manifest.quality);
      if (quality.schemaVersion !== 1)
        throw new PdfCaptureError("unsupported-schema", "Unsupported PDF quality schema");
      if (!Array.isArray(quality.issues) || quality.issues.length > 1e5)
        invalid("Invalid PDF quality issues");
      for (const raw of quality.issues) {
        const issue = object(raw);
        if (!["reading-order-uncertain", "table-structure-uncertain", "math-structure-uncertain", "ocr-needed"].includes(String(issue.code)))
          invalid("Unknown PDF quality issue");
        integer(issue.page, processedPages, 1);
      }
      if (quality.issues.length > 0 && manifest.status !== "partial")
        invalid("Uncertain PDF cannot claim complete");
    }
    const sourceDescriptor = descriptor(manifest.source);
    if (sourceDescriptor.path !== "source.pdf" || object(manifest.source).mimeType !== "application/pdf")
      invalid("Invalid retained PDF source");
    const check = async (expected, maximum) => {
      if (expected.bytes > maximum)
        throw new PdfCaptureError("limit-exceeded", "PDF artifact exceeds verification byte limit");
      const actual = await hashRegularFile(root, expected.path, maximum, deadline, "PDF artifact");
      return { ...actual, path: expected.path, integrity: actual.bytes === expected.bytes && actual.sha256 === expected.sha256 ? "verified" : "mismatch" };
    };
    const source = await check(sourceDescriptor, maxSource);
    let expectedMarkdown = null;
    let markdownPath;
    if (manifest.markdown !== undefined) {
      expectedMarkdown = descriptor(manifest.markdown);
      markdownPath = expectedMarkdown.path;
      if (markdownPath.includes("/") || !markdownPath.endsWith(".md"))
        invalid("Invalid PDF Markdown path");
    } else {
      const directory = await opendir(root.path);
      const candidates = [];
      let entries = 0;
      try {
        for await (const entry of directory) {
          assertAssetVerificationDeadline(deadline);
          if (++entries > 1000)
            throw new PdfCaptureError("limit-exceeded", "Legacy PDF directory exceeds entry limit");
          if (entry.name.endsWith(".md"))
            candidates.push(entry.name);
        }
      } finally {
        try {
          await directory.close();
        } catch {}
      }
      if (candidates.length !== 1)
        invalid("Legacy PDF bundle must contain exactly one Markdown document");
      markdownPath = candidates[0];
    }
    const markdownBytes = await readRegularFile(root, markdownPath, maxDocument, "PDF Markdown", deadline);
    const markdownText = decode(markdownBytes);
    const markdownDigest = digest(markdownBytes);
    const markdown = {
      path: markdownPath,
      bytes: markdownBytes.length,
      sha256: markdownDigest,
      markdown: markdownText,
      integrity: expectedMarkdown === null ? "unavailable" : expectedMarkdown.bytes === markdownBytes.length && expectedMarkdown.sha256 === markdownDigest ? "verified" : "mismatch"
    };
    const assetReferences = new Map;
    let currentPage = 0;
    for (const match of markdownText.matchAll(/<!-- pdf-page: (\d+) -->|!\[[^\]\n]*\]\((assets\/[^)\r\n]+)\)/gu)) {
      if (match[1] !== undefined)
        currentPage = integer(Number(match[1]), processedPages, 1);
      else if (match[2] !== undefined) {
        const pages = assetReferences.get(match[2]) ?? new Set;
        pages.add(currentPage);
        assetReferences.set(match[2], pages);
      }
    }
    const anchors = new Set;
    let anchorCount = 0;
    for (const match of markdownText.matchAll(/<!-- pdf-page: (\d+) -->/gu)) {
      if (++anchorCount > 1e5)
        invalid("Too many PDF page anchors");
      anchors.add(integer(Number(match[1]), processedPages, 1));
    }
    if (!Array.isArray(manifest.images) || manifest.images.length > maxAssets)
      invalid("Invalid PDF image count");
    const imageIds = new Map;
    const assetsByPath = new Map;
    const declaredPages = new Map;
    let totalBytes = 0;
    for (const raw of manifest.images) {
      const image = object(raw);
      if (typeof image.id !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,255}$/u.test(image.id) || imageIds.has(image.id))
        invalid("Invalid or duplicate PDF image ID");
      const page = integer(image.page, processedPages, 1);
      if (!anchors.has(page))
        invalid("PDF image has no corresponding Markdown page anchor");
      const asset = descriptor(image.asset);
      if (!/^assets\/[^/]+$/u.test(asset.path))
        invalid("PDF image must be a direct assets child");
      if (!assetReferences.get(asset.path)?.has(page))
        invalid("PDF image has no corresponding Markdown asset reference");
      imageIds.set(image.id, asset.sha256);
      const pages = declaredPages.get(asset.path) ?? new Set;
      pages.add(page);
      declaredPages.set(asset.path, pages);
      const existing = assetsByPath.get(asset.path);
      if (existing !== undefined) {
        if (existing.bytes !== asset.bytes || existing.sha256 !== asset.sha256)
          invalid("Conflicting PDF asset descriptors");
      } else {
        totalBytes += asset.bytes;
        if (totalBytes > maxTotal)
          throw new PdfCaptureError("limit-exceeded", "PDF assets exceed total byte limit");
        const checked = await check(asset, Math.min(maxAsset, maxTotal - (totalBytes - asset.bytes)));
        totalBytes += checked.bytes - asset.bytes;
        assetsByPath.set(asset.path, checked);
      }
    }
    for (const [path2, pages] of assetReferences) {
      if (!assetsByPath.has(path2))
        invalid("Markdown references an undeclared PDF asset");
      if ([...pages].some((page) => !declaredPages.get(path2)?.has(page)))
        invalid("Markdown asset page disagrees with PDF manifest");
    }
    const extraction = object(manifest.extraction);
    if (integer(extraction.imageCount, maxAssets) !== imageIds.size)
      invalid("PDF image count disagrees with manifest");
    let annotations = null;
    if (manifest.annotations !== null) {
      const annotationDescriptor = descriptor(manifest.annotations);
      if (annotationDescriptor.path !== "annotations.json")
        invalid("Invalid PDF annotations path");
      const annotationBytes = await readRegularFile(root, "annotations.json", 16 * 1024 ** 2, "PDF annotations", deadline);
      const annotationHash = digest(annotationBytes);
      annotations = { path: annotationDescriptor.path, bytes: annotationBytes.length, sha256: annotationHash, integrity: annotationDescriptor.bytes === annotationBytes.length && annotationDescriptor.sha256 === annotationHash ? "verified" : "mismatch" };
      let retained;
      try {
        retained = parsePdfImageInterpretations(parse(annotationBytes));
      } catch (error) {
        if (error instanceof PdfCaptureError)
          throw error;
        throw new PdfCaptureError("invalid-input", "Invalid PDF image annotations", { cause: error });
      }
      if (retained.length !== integer(object(manifest.annotations).count, 1e4))
        invalid("PDF annotation count disagrees with manifest");
      for (const annotation of retained) {
        if (imageIds.get(annotation.id) !== annotation.sha256)
          invalid("PDF annotation references an unknown image or digest");
      }
    }
    await assertBundleRoot(root, deadline);
    return { root: root.path, schemaVersion: 1, status: manifest.status, pageCount, processedPages, markdown, source, assets: [...assetsByPath.values()], annotations };
  } finally {
    await root.handle.close();
  }
}
async function verifyPdfCaptureBundle(path, options = {}) {
  const inspection = await inspectPdfCaptureBundle(path, options);
  const issues = [];
  const add = (file, kind) => {
    if (file.integrity !== "verified")
      issues.push({ kind, path: file.path, integrity: file.integrity });
  };
  add(inspection.markdown, "document-integrity");
  add(inspection.source, "source-integrity");
  for (const asset of inspection.assets)
    add(asset, "asset-integrity");
  if (inspection.annotations !== null)
    add(inspection.annotations, "annotation-integrity");
  return { ok: issues.length === 0, inspection, issues };
}

// src/pdf.ts
var PDF_CAPTURE_MANIFEST_FILENAME2 = PDF_CAPTURE_MANIFEST_FILENAME;
var PDF_CAPTURE_MANIFEST_SCHEMA_VERSION2 = PDF_CAPTURE_MANIFEST_SCHEMA_VERSION;
var PDF_CAPTURE_SOURCE_FILENAME2 = PDF_CAPTURE_SOURCE_FILENAME;
var PDF_CAPTURE_ANNOTATIONS_FILENAME2 = PDF_CAPTURE_ANNOTATIONS_FILENAME;
var buildPdfMarkdown2 = buildPdfMarkdown;
var decodePopplerText2 = decodePopplerText;
var inspectPdf2 = inspectPdf;
var layoutBlocks2 = layoutBlocks;
var ocrPdfImage2 = ocrPdfImage;
var parsePdfArguments2 = parsePdfArguments;
var parsePdfImageInterpretations2 = parsePdfImageInterpretations;
var parsePdfInfo2 = parsePdfInfo;
var parsePopplerXml2 = parsePopplerXml;
var parseTesseractTsv2 = parseTesseractTsv;
var pdfCaptureDefaults2 = pdfCaptureDefaults;
var pdfCaptureSummary2 = pdfCaptureSummary;
var pdfImageAssetPath2 = pdfImageAssetPath;
var pdfMarkdownFilename2 = pdfMarkdownFilename;
var pdfUsage2 = pdfUsage;
var persistPdfCapture2 = persistPdfCapture;
var resolvePdfTools2 = resolvePdfTools;
var runPdfCapture2 = runPdfCapture;
var runPdfCommand = main;
var runPdfToolCommand2 = runPdfToolCommand;
var inspectPdfCaptureBundle2 = (...arguments_) => inspectPdfCaptureBundle(...arguments_);
var verifyPdfCaptureBundle2 = (...arguments_) => verifyPdfCaptureBundle(...arguments_);
var PdfCaptureError2 = PdfCaptureError;
export {
  verifyPdfCaptureBundle2 as verifyPdfCaptureBundle,
  runPdfToolCommand2 as runPdfToolCommand,
  runPdfCommand,
  runPdfCapture2 as runPdfCapture,
  resolvePdfTools2 as resolvePdfTools,
  persistPdfCapture2 as persistPdfCapture,
  pdfUsage2 as pdfUsage,
  pdfMarkdownFilename2 as pdfMarkdownFilename,
  pdfImageAssetPath2 as pdfImageAssetPath,
  pdfCaptureSummary2 as pdfCaptureSummary,
  pdfCaptureDefaults2 as pdfCaptureDefaults,
  parseTesseractTsv2 as parseTesseractTsv,
  parsePopplerXml2 as parsePopplerXml,
  parsePdfInfo2 as parsePdfInfo,
  parsePdfImageInterpretations2 as parsePdfImageInterpretations,
  parsePdfArguments2 as parsePdfArguments,
  ocrPdfImage2 as ocrPdfImage,
  layoutBlocks2 as layoutBlocks,
  inspectPdfCaptureBundle2 as inspectPdfCaptureBundle,
  inspectPdf2 as inspectPdf,
  decodePopplerText2 as decodePopplerText,
  buildPdfMarkdown2 as buildPdfMarkdown,
  PdfCaptureError2 as PdfCaptureError,
  PDF_CAPTURE_SOURCE_FILENAME2 as PDF_CAPTURE_SOURCE_FILENAME,
  PDF_CAPTURE_MANIFEST_SCHEMA_VERSION2 as PDF_CAPTURE_MANIFEST_SCHEMA_VERSION,
  PDF_CAPTURE_MANIFEST_FILENAME2 as PDF_CAPTURE_MANIFEST_FILENAME,
  PDF_CAPTURE_ANNOTATIONS_FILENAME2 as PDF_CAPTURE_ANNOTATIONS_FILENAME
};
