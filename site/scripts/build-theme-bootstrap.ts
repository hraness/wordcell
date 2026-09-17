import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const site = resolve(import.meta.dir, "..");

/** One self-contained classic script applies the saved palette before paint. */
export async function buildThemeBootstrap(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [resolve(site, "browser/theme-bootstrap.ts")],
    target: "browser",
    format: "iife",
    minify: true,
    env: "disable",
  });
  assert(result.success, `Appearance bootstrap build failed: ${result.logs.join("\n")}`);
  assert.equal(result.outputs.length, 1, "Appearance bootstrap must be one self-contained script");
  const output = result.outputs[0];
  assert(output !== undefined, "Missing appearance bootstrap output");
  const target = resolve(site, "public");
  await mkdir(target, { recursive: true });
  await Bun.write(resolve(target, "theme-bootstrap.js"), await output.text());
}

if (import.meta.main) await buildThemeBootstrap();
