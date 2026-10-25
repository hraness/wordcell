import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { FetchFailure, type FetchFailureCode } from "../clip/network.js";
import { PdfCaptureError, type PdfCaptureErrorCode } from "./errors.js";
import { preparePdfSource } from "./source.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("PDF source preparation", () => {
  test("leaves local paths untouched", async () => {
    const source = await preparePdfSource("/tmp/document.pdf");
    expect(source.inputPath).toBe("/tmp/document.pdf");
    expect(source.remoteSource).toBeUndefined();
    source.dispose();
  });

  test("downloads a public PDF into a disposable private file and records redirects", async () => {
    const directory = mkdtempSync(join(tmpdir(), "kb-pdf-source-test-"));
    roots.push(directory);
    const source = await preparePdfSource("https://example.com/paper?token=secret-value&view=full", {
      timeoutMs: 8_000,
      maxPdfBytes: 1_024,
    }, {
      fetch: (_url, options) => {
        expect(options).toMatchObject({
          timeoutMs: 8_000,
          maxBytes: 1_024,
          allowPrivateNetwork: false,
        });
        return Promise.resolve({
          bytes: new TextEncoder().encode("%PDF-1.4\n%%EOF\n"),
          finalUrl: new URL("https://cdn.example.com/files/paper?signature=secret-value&view=full"),
          status: 200,
          contentType: "application/pdf",
          etag: null,
          lastModified: null,
        });
      },
      makeTemporaryDirectory: () => directory,
      removeDirectory: (path) => {
        expect(path).toBe(directory);
        rmSync(path, { recursive: true, force: true });
      },
    });

    expect(source.inputPath).toBe(join(directory, "paper.pdf"));
    expect(readFileSync(source.inputPath, "utf8")).toBe("%PDF-1.4\n%%EOF\n");
    expect(source.remoteSource).toEqual({
      requestedUrl: "https://example.com/paper?view=full",
      finalUrl: "https://cdn.example.com/files/paper?view=full",
    });
    source.dispose();
    expect(existsSync(directory)).toBe(false);
    source.dispose();
  });

  test("rejects a successful non-PDF response before creating a directory", async () => {
    let madeDirectory = false;
    let error: unknown;
    try {
      await preparePdfSource("https://example.com/not-a-pdf", {}, {
        fetch: () => Promise.resolve({
          bytes: new TextEncoder().encode("<html>not a PDF</html>"),
          finalUrl: new URL("https://example.com/not-a-pdf"),
          status: 200,
          contentType: "text/html",
          etag: null,
          lastModified: null,
        }),
        makeTemporaryDirectory: () => {
          madeDirectory = true;
          return "/unused";
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error ? error.message : "").toContain("valid PDF signature");
    expect(madeDirectory).toBe(false);
  });

  test("reports each fetch failure by its kind, never as an unknown error", async () => {
    const expected: Record<FetchFailureCode, PdfCaptureErrorCode> = {
      "invalid-url": "invalid-input",
      "private-network": "invalid-input",
      dns: "fetch-failed",
      timeout: "timeout",
      http: "fetch-failed",
      redirect: "fetch-failed",
      "too-large": "limit-exceeded",
      network: "fetch-failed",
    };
    for (const [kind, code] of Object.entries(expected) as [FetchFailureCode, PdfCaptureErrorCode][]) {
      const failure = new FetchFailure(kind, `request failed: ${kind}`);
      const error = await preparePdfSource("https://example.com/paper.pdf", {}, {
        fetch: () => Promise.reject(failure),
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PdfCaptureError);
      expect((error as PdfCaptureError).code).toBe(code);
      expect((error as PdfCaptureError).message).toBe(failure.message);
      expect((error as PdfCaptureError).cause).toBe(failure);
    }
  });

  test("passes through an error that is not a fetch failure", async () => {
    const failure = new Error("unexpected");
    const error = await preparePdfSource("https://example.com/paper.pdf", {}, {
      fetch: () => Promise.reject(failure),
    }).catch((caught: unknown) => caught);
    expect(error).toBe(failure);
  });
});
