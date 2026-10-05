/**
 * Copies delivered files from out/ to the paths the product site serves,
 * as listed in publish.json: { "copies": [["out-file", "repo-relative target"], ...] }.
 *   bun publish.ts
 * Fails before copying anything when a source is missing or empty.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();
const config = JSON.parse(readFileSync(join(root, "publish.json"), "utf8")) as { copies: [string, string][] };
for (const [from] of config.copies) {
  const path = join(root, "out", from);
  if (!existsSync(path) || statSync(path).size === 0) throw new Error(`Missing or empty delivery file: out/${from}`);
}
for (const [from, to] of config.copies) {
  const target = resolve(root, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(root, "out", from), target);
  console.log(`${from} -> ${to}`);
}
