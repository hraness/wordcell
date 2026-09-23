import {
  createSocialImageResponse,
  socialImageContentType as contentType,
  socialImageSize as size,
} from "@hraness/web-discovery/social-image";

export const alt = "Wordcell: the Markdown knowledge base with superpowers";
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
    description: "Save decisions, sources, and plans in Markdown you own. Recover them through exact and semantic search, typed relationships, backlinks, and Git history.",
    domain: "wordcell.io",
    eyebrow: "Wordcell",
    mark: <WordcellMark />,
    theme: {
      accent: "#065968",
      background: "#FBF1C7",
      foreground: "#393533",
      muted: "#584F48",
    },
    title: "The Markdown knowledge base with superpowers",
  });
}
