import { ctaClickedProperties, pageNotFoundProperties } from "@hraness/posthog/event";
import { expect, test } from "bun:test";
import { classifyAnalyticsRoute } from "@hraness/posthog";
import { checkPostHogContract, runPostHogHarness } from "@hraness/posthog/testing";
import { analyticsSite, analyticsCtaForUrl } from "./analytics-site";

test("encoded identifiers are redacted from real SDK paths, missing pages, and errors", () => {
  const segments = [
    "+@a.aa",
    "%2B%2540a.aa",
    "privacycanary%40example.com",
    "privacycanary%2540example.com",
    "%70%72%69%76%61%63%79%63%61%6e%61%72%79%40example.com",
    "privacycanary%40%E4%BE%8B%E5%AD%90.%E4%B8%AD%E5%9B%BD",
  ];
  const paths = segments.map((segment) => `/blog/${segment}`);
  const result = runPostHogHarness({
    site: analyticsSite,
    scenarios: paths.map((path) => ({
      href: `https://${analyticsSite.canonicalDomain}${path}`,
      captures: [
        { event: "$pageview" },
        { event: "page not found", properties: { requested_path: path } },
        { event: "$exception", error: { message: "Failed privacycanary%2540example.com Bearer%2520phx_credentialcanary at /docs/page?private_context=personal-value" } },
      ],
    })),
  });
  for (const event of ["$pageview", "page not found", "$exception"]) {
    expect(result.sent.some((capture) => capture.event === event)).toBe(true);
  }
  const wire = JSON.stringify(result.sent);
  expect(wire).not.toContain("privacycanary");
  expect(wire).not.toContain("credentialcanary");
  expect(wire).not.toContain("personal-value");
  expect(wire).not.toContain("@a.aa");
  expect(wire).not.toContain("40a.aa");
  for (const path of paths) {
    expect(pageNotFoundProperties({ requestedPath: path })?.requested_path).toBe("/blog/[email]");
  }
});

test("real SDK enforces the shared privacy and event contract", () => {
  expect(checkPostHogContract({ site: analyticsSite, publicPath: "/", sensitivePath: "/docs/auth", customEvents: [
    { event: "cta clicked", properties: { cta: "get_started", placement: "nav" } },
    { event: "outbound link opened", properties: { target_host: "github.com", placement: "nav" } },
  ] }).violations).toEqual([]);
});
test("preview hosts never classify", () => {
  expect(classifyAnalyticsRoute(analyticsSite, "https://preview.vercel.app/")).toBeNull();
});

test("private routes emit no pageviews, actions, or exceptions through the real SDK", () => {
  const paths = ["/p/private", "/p%2Fprivate", "/%70/private", "/auth/callback"];
  const result = runPostHogHarness({ site: analyticsSite, scenarios: paths.map((path) => ({ href: `https://${analyticsSite.canonicalDomain}${path}?code=private-token`, captures: [{ event: "$pageview" }, { event: "cta clicked", properties: { cta: "get_started", placement: "nav" } }, { event: "$exception", error: { message: "private-profile-value" } }] })) });
  expect(result.sent).toEqual([]);
});

test("CTA identifiers describe known destinations and satisfy the bounded event schema", () => {
  for (const [path, expected] of [["https://github.com/hraness/repo", "github"], ["/install", "install"], ["/docs/guide", "docs"], ["/compare/tool", "compare"], ["/#use", "use_cases"], ["/", "get_started"]]) {
    const cta = analyticsCtaForUrl(new URL(path!, `https://${analyticsSite.canonicalDomain}`));
    expect(cta).toBe(expected!);
    expect(ctaClickedProperties({ cta, placement: "nav" })).not.toBeNull();
  }
});
