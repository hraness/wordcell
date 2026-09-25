import {
  createSocialImageResponse,
  socialImageContentType as contentType,
  socialImageSize as size,
} from "@hraness/web-discovery/social-image";

import { siteDescription } from "./site-description";

export const alt = "Wordcell: Give the next session what this one learned";
export { contentType, size };

function WordcellMark() {
  return (
    <svg aria-label="Wordcell mark" height="42" role="img" viewBox="0 0 42 42" width="42">
      <rect fill="none" height="28" rx="8" stroke="currentColor" strokeWidth="5" width="28" x="7" y="7" />
    </svg>
  );
}

export default function OpengraphImage() {
  return createSocialImageResponse({
    description: siteDescription,
    domain: "wordcell.io",
    eyebrow: "Wordcell",
    mark: <WordcellMark />,
    theme: {
      accent: "#065968",
      background: "#FBF1C7",
      foreground: "#393533",
      muted: "#584F48",
    },
    title: "Give the next session what this one learned",
  });
}
