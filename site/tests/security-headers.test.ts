import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import nextConfig, { PUBLIC_SOURCE, apiSecurityHeaders, securityHeaders } from "../next.config";

describe("security headers", () => {
  test("applies the baseline to every route", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules).toHaveLength(2);
    expect(rules[0]?.source).toBe(PUBLIC_SOURCE);
    const names = rules[0]?.headers.map((header) => header.key) ?? [];
    expect(names).toEqual(securityHeaders.map((header) => header.key));
  });

  test("public pages stay frameable and the authenticated API refuses cross-origin framing", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const publicHeaders = rules[0]?.headers ?? [];
    expect(JSON.stringify(publicHeaders)).not.toContain("frame-ancestors");
    expect(publicHeaders.some((header) => header.key === "X-Frame-Options")).toBe(false);
    expect(rules[1]?.source).toBe("/api/:path*");
    const api = new Map((rules[1]?.headers ?? []).map((h) => [h.key, h.value]));
    expect(api.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(api.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(apiSecurityHeaders.map((h) => h.key)).toContain("Strict-Transport-Security");
  });

  test("sets the required values", () => {
    const byKey = new Map(securityHeaders.map((h) => [h.key, h.value]));
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(byKey.get("Strict-Transport-Security")).toContain("max-age=");
    expect(byKey.get("Permissions-Policy")).toContain("camera=()");
    const csp = byKey.get("Content-Security-Policy") ?? "";
    for (const directive of ["base-uri", "object-src 'none'"]) {
      expect(csp).toContain(directive);
    }
  });

  test("publishes a security.txt that points at private reporting and the email fallback", () => {
    const text = readFileSync(
      new URL("../public/.well-known/security.txt", import.meta.url),
      "utf8",
    );
    expect(text).toContain("Contact: https://github.com/hraness/wordcell/security/advisories/new");
    expect(text).toContain("Contact: mailto:hraness@pm.me");
    expect(text).toContain("Canonical: https://wordcell.io/.well-known/security.txt");
    const expires = /^Expires: (.+)$/mu.exec(text)?.[1];
    expect(Date.parse(expires ?? "")).toBeGreaterThan(Date.now());
  });
});
