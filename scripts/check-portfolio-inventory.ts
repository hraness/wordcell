import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalPortfolioInventoryBytes } from "@hraness/build-governance/portfolio-inventory";

const repositoryRoot = resolve(import.meta.dir, "..");
const inventoryPath = resolve(repositoryRoot, "portfolio-inventory.json");
if (import.meta.main) {
  const packageManifest = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  ) as unknown;
  const expectedBytes = canonicalPortfolioInventoryBytes(packageManifest);
  if (process.argv.includes("--write")) {
    await writeFile(inventoryPath, expectedBytes);
  }
  const actualBytes = await readFile(inventoryPath, "utf8");
  if (actualBytes !== expectedBytes) {
    throw new Error("portfolio-inventory.json does not match the canonical package inventory");
  }
}
