// @bun
// src/directory-sync.ts
function syncsDirectories(platform = process.platform) {
  return platform !== "win32";
}

export { syncsDirectories };
