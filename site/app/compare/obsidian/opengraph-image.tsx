import {
  createSiteSocialImageResponse,
  socialImageAlt,
  socialImageContentType,
  socialImageSize,
} from "@hraness/web-discovery/social-image";

import { socialPages, wordcellSocialSite } from "../../social";

export const alt = socialImageAlt(wordcellSocialSite, socialPages.compareObsidian);
export const contentType = socialImageContentType;
export const size = socialImageSize;

export default function OpengraphImage() {
  return createSiteSocialImageResponse(wordcellSocialSite, socialPages.compareObsidian);
}
