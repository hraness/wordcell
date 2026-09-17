import { canonicalJson } from "@hraness/oh";
import {
  OH_CANONICAL_RAW_WASM_BASE64,
  OH_CANONICAL_RAW_WASM_SHA256,
} from "@hraness/oh/canonical-rust/artifact";

/**
 * Optional Rust canonical-JSON/digest engine (`oh.canonical.rust.v1`), vendored
 * from `hraness/oh`. Returns `null` when the engine cannot be loaded or cannot
 * match the reference `@hraness/oh` output, so callers keep the existing TypeScript
 * path as the fallback.
 */

interface OhCanonicalRawExports {
  readonly memory: WebAssembly.Memory;
  readonly oh_canonical_alloc: (len: number) => number;
  readonly oh_canonical_free: (ptr: number, capacity: number) => void;
  readonly oh_canonical_json: (ptr: number, len: number) => number;
  readonly oh_canonical_sha256: (ptr: number, len: number) => number;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/u, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let bitCount = 0;
  let offset = 0;
  for (const character of clean) {
    const value = BASE64_ALPHABET.indexOf(character);
    if (value < 0) throw new Error("invalid base64 artifact");
    bits = (bits << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[offset] = (bits >> bitCount) & 0xff;
      offset += 1;
    }
  }
  if (offset !== bytes.length) throw new Error("base64 artifact length mismatch");
  return bytes;
}

let cached: OhCanonicalRawExports | null | undefined;

function engine(): OhCanonicalRawExports | null {
  if (cached !== undefined) return cached;
  try {
    const bytes = decodeBase64(OH_CANONICAL_RAW_WASM_BASE64);
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes.buffer as ArrayBuffer));
    cached = instance.exports as unknown as OhCanonicalRawExports;
  } catch {
    cached = null;
  }
  return cached;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function runEngine(
  text: string,
  call: (exports: OhCanonicalRawExports, ptr: number, len: number) => number,
): string | null {
  const exports = engine();
  if (exports === null) return null;
  const input = encoder.encode(text);
  if (input.length === 0) return null;
  const inputPtr = exports.oh_canonical_alloc(input.length);
  if (inputPtr === 0) return null;
  let resultPtr = 0;
  let resultCapacity = 0;
  try {
    new Uint8Array(exports.memory.buffer as ArrayBuffer, inputPtr, input.length).set(input);
    resultPtr = call(exports, inputPtr, input.length);
    if (resultPtr === 0) return null;
    const view = new DataView(exports.memory.buffer as ArrayBuffer, resultPtr, 12);
    resultCapacity = view.getUint32(0, true);
    const status = view.getUint32(4, true);
    const payloadLength = view.getUint32(8, true);
    if (status !== 0 || payloadLength === 0 || 12 + payloadLength > resultCapacity) return null;
    return decoder.decode(new Uint8Array(exports.memory.buffer as ArrayBuffer, resultPtr + 12, payloadLength));
  } catch {
    return null;
  } finally {
    if (resultPtr !== 0 && resultCapacity > 0) exports.oh_canonical_free(resultPtr, resultCapacity);
    exports.oh_canonical_free(inputPtr, input.length);
  }
}

/** Canonical JSON text matching `@hraness/oh`, or `null` if the engine cannot match. */
export function canonicalJsonRust(value: unknown): string | null {
  const json = JSON.stringify(value);
  if (json === undefined) return null;
  const rust = runEngine(json, (exports, ptr, len) => exports.oh_canonical_json(ptr, len));
  if (rust === null) return null;
  try {
    if (rust !== canonicalJson(value)) return null;
  } catch {
    return null;
  }
  return rust;
}

/** SHA-256 hex of the canonical JSON, matching `@hraness/oh`, or `null` if the engine cannot match. */
export function canonicalSha256Rust(value: unknown): string | null {
  if (canonicalJsonRust(value) === null) return null;
  const json = JSON.stringify(value);
  if (json === undefined) return null;
  return runEngine(json, (exports, ptr, len) => exports.oh_canonical_sha256(ptr, len));
}

/** Engine identity and artifact digest for diagnostics and tests. */
export function canonicalRustEngineInfo(): { engine: string; artifactSha256: string; available: boolean } {
  return { engine: "oh.canonical.rust.v1", artifactSha256: OH_CANONICAL_RAW_WASM_SHA256, available: engine() !== null };
}
