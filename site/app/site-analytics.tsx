"use client";

import { useEffect } from "react";
import { PostHogAnalytics, PostHogPageNotFound, PostHogExceptionReporter } from "@hraness/posthog/react";
import { capturePostHogCtaClicked, capturePostHogOutboundLinkOpened } from "@hraness/posthog/client";
import { analyticsSite, analyticsCtaForUrl } from "../analytics-site";

const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_xqEpQgmKxZDYda3DvForfnKDuVL6urqD2YTtqDPmUL4u";

export function SiteAnalytics() {
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href);
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      const placement = anchor.closest("header") ? "nav" : anchor.closest("footer") ? "footer" : "inline";
      if (anchor.matches("[data-analytics-cta], .primary-action") || anchor.closest(".hraness-marketing-header__actions, .hraness-marketing-hero__actions")) {
        capturePostHogCtaClicked(analyticsSite, { cta: analyticsCtaForUrl(url), placement, targetHost: url.hostname });
      }
      if (url.hostname.replace(/^www\./, "") !== analyticsSite.canonicalDomain.replace(/^www\./, "")) capturePostHogOutboundLinkOpened(analyticsSite, { targetHost: url.hostname, placement });
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  return <PostHogAnalytics site={analyticsSite} apiKey={apiKey} />;
}

export function SiteNotFoundAnalytics() {
  return <PostHogPageNotFound site={analyticsSite} apiKey={apiKey} />;
}

export function SiteExceptionAnalytics({ error }: { error: unknown }) {
  return <PostHogExceptionReporter site={analyticsSite} apiKey={apiKey} error={error} />;
}

