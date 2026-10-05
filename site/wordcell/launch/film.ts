import type { ArticleVideoRecord } from "@hraness/design-kit";

/**
 * The launch film, built in ../video/story (story.config.ts) with the
 * story-film engine from the launch post's own figures. Files live in
 * public/media; tests/launch-post.test.tsx checks every path exists.
 */
export const launchFilm: ArticleVideoRecord = {
  name: "Introducing Wordcell",
  description:
    "A 28-second captioned film about Wordcell: a coding agent changes a limit without knowing why it was set; Wordcell keeps the decision and its reason in a Markdown note, the agent recovers it before the next edit, search finds it in different words, and it ends with asking your agent to install Wordcell.",
  sources: [
    { src: "/media/wordcell-launch.webm", type: "video/webm" },
    { src: "/media/wordcell-launch.mp4", type: "video/mp4" },
  ],
  poster: "/media/wordcell-launch-poster.jpg",
  captions: "/media/wordcell-launch.vtt",
  captionsLanguage: "en",
  width: 1920,
  height: 1080,
  duration: "PT28.4S",
  uploadDate: "2026-10-04",
};
