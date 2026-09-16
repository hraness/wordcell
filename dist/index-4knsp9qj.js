// @bun
// src/clip/package-root.ts
import { existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join, resolve } from "path";
function isPackageManifest(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function findKbPackageRoot(startDirectory = import.meta.dir, dependencies = {}) {
  const exists = dependencies.exists ?? existsSync;
  const readText = dependencies.readText ?? ((path) => readFileSync(path, "utf8"));
  let directory = resolve(startDirectory);
  for (let depth = 0;depth < 8; depth += 1) {
    const manifestPath = join(directory, "package.json");
    if (exists(manifestPath)) {
      try {
        const parsed = JSON.parse(readText(manifestPath));
        if (isPackageManifest(parsed) && typeof parsed.name === "string" && parsed.name === "@hraness/wordcell" && typeof parsed.version === "string")
          return directory;
      } catch {}
    }
    const parent = dirname(directory);
    if (parent === directory)
      break;
    directory = parent;
  }
  throw new Error("Could not locate the wordcell package root.");
}
function resolvePackageDirectory(packageName, parentUrl = import.meta.url) {
  const manifest = createRequire(parentUrl).resolve(`${packageName}/package.json`);
  return dirname(manifest);
}

export { findKbPackageRoot, resolvePackageDirectory };
