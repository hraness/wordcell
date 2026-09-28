import {
  createSiteSocialImageResponse,
  socialImageAlt,
  socialImageContentType,
  socialImageSize,
} from "@hraness/web-discovery/social-image";

import { socialPages, wordcellSocialSite } from "../../social";

export const alt = socialImageAlt(wordcellSocialSite, socialPages.migrateSupermemory);
export const contentType = socialImageContentType;
export const size = socialImageSize;

export default function OpengraphImage() {
  return createSiteSocialImageResponse(wordcellSocialSite, socialPages.migrateSupermemory);
}
