import {
  createSiteSocialImageResponse,
  socialImageAlt,
  socialImageContentType,
  socialImageSize,
} from "@hraness/web-discovery/social-image";

import { homeSocialPage, wordcellSocialSite } from "./social";

export const alt = socialImageAlt(wordcellSocialSite, homeSocialPage);
export const contentType = socialImageContentType;
export const size = socialImageSize;

export default function OpengraphImage() {
  return createSiteSocialImageResponse(wordcellSocialSite, homeSocialPage);
}
