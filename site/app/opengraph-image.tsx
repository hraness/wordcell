import {
  createSocialImageResponse,
  socialImageContentType as contentType,
  socialImageSize as size,
} from "@hraness/web-discovery/social-image";

export const alt = "Wordcell: local knowledge for coding agents";
export { contentType, size };

function WordcellMark() {
  return (
    <svg aria-label="Wordcell mark" height="42" role="img" viewBox="0 0 42 42" width="42">
      <rect fill="none" height="14" stroke="currentColor" strokeWidth="3" width="14" x="5" y="5" />
      <rect fill="currentColor" height="14" width="14" x="23" y="5" />
      <rect fill="currentColor" height="14" width="14" x="5" y="23" />
      <rect fill="none" height="14" stroke="currentColor" strokeWidth="3" width="14" x="23" y="23" />
    </svg>
  );
}

export default function OpengraphImage() {
  return createSocialImageResponse({
    description: "Save decisions in Markdown. Find the notes behind a code change. Give the next session the context it needs.",
    domain: "wordcell.io",
    eyebrow: "Wordcell",
    mark: <WordcellMark />,
    theme: {
      accent: "#356A54",
      background: "#F8F7F4",
      foreground: "#1C1A18",
      muted: "#6A655E",
    },
    title: "Local knowledge for coding agents",
  });
}
