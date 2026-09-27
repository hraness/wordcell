import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  // Published artifacts use directory-relative navigation and reader assets.
  // The proxy preserves /p/ directory URLs; other pages keep slashless URLs.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
