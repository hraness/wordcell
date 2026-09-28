import {
  createSiteSocialImageResponse,
  socialImageAlt,
  socialImageContentType,
  socialImageSize,
} from "@hraness/web-discovery/social-image";

import { docCatalog, docOverview } from "../catalog";
import { docSocialPage, socialPages, wordcellSocialSite } from "../../social";

export const contentType = socialImageContentType;
export const size = socialImageSize;
// Next fixes alt per route segment, so it names the section; the card names the page.
export const alt = socialImageAlt(wordcellSocialSite, socialPages.docs);

// Prerender one card per documentation page at build time.
export function generateStaticParams() {
  return [...docCatalog.map((entry) => ({ slug: entry.slug })), { slug: docOverview.slug }];
}

export const dynamicParams = false;

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return createSiteSocialImageResponse(wordcellSocialSite, docSocialPage(slug));
}
