import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import fc from "fast-check";
import { canonicalJson, canonicalSha256 } from "@hraness/oh";

import {
  canonicalJsonRust,
  canonicalRustEngineInfo,
  canonicalSha256Rust,
  emitCanonicalRustFallback,
} from "./canonical-rust.js";
import {
  OH_CANONICAL_RAW_WASM_BASE64,
  OH_CANONICAL_RAW_WASM_SHA256,
} from "@hraness/oh/canonical-rust/artifact";
import { emitProjectionRustFallback } from "./projection-rust.js";

const jsonValueArb: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  root: fc.oneof(
    fc.constant(null),
    fc.boolean(),
    fc.oneof(
      fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
    ),
    fc.string(),
    fc.array(tie("root"), { maxLength: 6 }),
    fc.dictionary(fc.string(), tie("root"), { maxKeys: 6 }),
  ),
})).root;

describe("canonical-rust engine", () => {
  test("artifact is available and matches the vendored wasm bytes", () => {
    const info = canonicalRustEngineInfo();
    expect(info.available).toBe(true);
    expect(info.engine).toBe("oh.canonical.rust.v1");
    const wasmPath = fileURLToPath(new URL(import.meta.resolve("@hraness/oh/canonical-rust/raw-wasm")));
    const bytes = readFileSync(wasmPath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(OH_CANONICAL_RAW_WASM_SHA256);
    expect(Buffer.from(OH_CANONICAL_RAW_WASM_BASE64, "base64")).toEqual(Buffer.from(bytes));
  });

  test("canonicalJsonRust matches @hraness/oh canonicalJson", () => {
    fc.assert(
      fc.property(jsonValueArb, (value) => {
        const rust = canonicalJsonRust(value);
        if (rust === null) return;
        let expected: string;
        try {
          expected = canonicalJson(value);
        } catch {
          return;
        }
        expect(rust).toBe(expected);
      }),
      { numRuns: 300 },
    );
  });

  test("canonicalSha256Rust matches @hraness/oh canonicalSha256", () => {
    fc.assert(
      fc.property(jsonValueArb, (value) => {
        const rust = canonicalSha256Rust(value);
        if (rust === null) return;
        let expected: string;
        try {
          expected = canonicalSha256(value);
        } catch {
          return;
        }
        expect(rust).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  test("edge cases: numbers, unicode, escapes", () => {
    const cases: unknown[] = [
      1e-7,
      0.000001,
      { "": [], "\u0000": null, "é": "n", e: "ascii" },
      { "surrogate-pair-😀": { "😀": "value" } },
      [1e21, 1e-21, 5e-324],
      { nested: [{ deep: [[[{ x: "y" }]]] }] },
    ];
    for (const value of cases) {
      expect(canonicalJsonRust(value)).toBe(canonicalJson(value));
      expect(canonicalSha256Rust(value)).toBe(canonicalSha256(value));
    }
  });

  test("fallback diagnostics are emitted once per bounded class", () => {
    const write = spyOn(process.stderr, "write").mockImplementation(() => true);
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      emitCanonicalRustFallback("test-once", "object");
      emitCanonicalRustFallback("test-once", "object");
      emitProjectionRustFallback("evaluate-failed");
      emitProjectionRustFallback("evaluate-failed");
      expect(write).toHaveBeenCalledTimes(1);
      expect(String(write.mock.calls[0]?.[0])).toBe("[oh-canonical-rust-fallback] test-once input=object\n");
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith("[oh-projection-rust-fallback] evaluate-failed");
    } finally {
      error.mockRestore();
      write.mockRestore();
    }
  });
});
