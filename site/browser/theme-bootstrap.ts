import { initDesignPalette } from "@hraness/design-kit/browser";

// Bundled as a same-origin classic script and executed before the page paints.
// The site's default shares the Wordcell family's Gruvbox identity following the operating system.
initDesignPalette({
  defaultPreference: { palette: "gruvbox", mode: "system" },
});
