import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import nextConfig, { securityHeaders } from "../next.config";

describe("security headers", () => {
  test("applies the baseline to every route", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]?.source).toBe("/:path*");
    const names = rules[0]?.headers.map((header) => header.key) ?? [];
    expect(names).toEqual(securityHeaders.map((header) => header.key));
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

  test("publishes a security.txt that points at private reporting", () => {
    const text = readFileSync(
      new URL("../public/.well-known/security.txt", import.meta.url),
      "utf8",
    );
    expect(text).toContain("Contact: https://github.com/hraness/wordcell/security/advisories/new");
    const expires = /^Expires: (.+)$/mu.exec(text)?.[1];
    expect(Date.parse(expires ?? "")).toBeGreaterThan(Date.now());
  });
});
