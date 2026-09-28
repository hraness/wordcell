import {
  createSocialImageResponse,
  socialImageContentType,
  socialImageSize,
} from "@hraness/web-discovery/social-image";

import { siteDescription } from "./site-description";

export const contentType = socialImageContentType;
export const size = socialImageSize;

function WordcellMark() {
  return (
    <svg aria-label="Wordcell mark" height="42" role="img" viewBox="0 0 42 42" width="42">
      <rect fill="none" height="28" rx="8" stroke="currentColor" strokeWidth="5" width="28" x="7" y="7" />
    </svg>
  );
}

/** Renders the Wordcell share card with one page's own heading. */
export function wordcellSocialImage(title: string, description: string = siteDescription) {
  return createSocialImageResponse({
    description,
    domain: "wordcell.io",
    eyebrow: "Wordcell",
    mark: <WordcellMark />,
    theme: {
      accent: "#065968",
      background: "#FBF1C7",
      foreground: "#393533",
      muted: "#584F48",
    },
    title,
  });
}
