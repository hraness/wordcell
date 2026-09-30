import { ctaClickedProperties } from "@hraness/posthog/event";
import { expect, test } from "bun:test";
import { classifyAnalyticsRoute } from "@hraness/posthog";
import { checkPostHogContract, runPostHogHarness } from "@hraness/posthog/testing";
import { analyticsSite, analyticsCtaForUrl } from "./analytics-site";

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
