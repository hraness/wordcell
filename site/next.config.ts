import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/** Baseline response headers for every route. */
export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'",
  },
] as const;

/** Authenticated API responses (Bearer tokens) refuse cross-origin framing. */
export const apiSecurityHeaders: { key: string; value: string }[] = [
  ...securityHeaders.map((header) =>
    header.key === "Content-Security-Policy"
      ? { key: header.key, value: `${header.value}; frame-ancestors 'self'` }
      : { key: header.key, value: header.value },
  ),
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

/** Every route except `/api/*`, which has its own frame-protected rule. */
export const PUBLIC_SOURCE = "/:path((?!api/).*)";

const nextConfig: NextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  // Published artifacts use directory-relative navigation and reader assets.
  // The proxy preserves /p/ directory URLs; other pages keep slashless URLs.
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      { source: PUBLIC_SOURCE, headers: [...securityHeaders] },
      { source: "/api/:path*", headers: [...apiSecurityHeaders] },
    ];
  },
};

export default nextConfig;
