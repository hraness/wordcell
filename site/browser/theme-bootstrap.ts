import { initDesignPalette } from "@hraness/design-kit/browser";

// Bundled as a same-origin classic script and executed before the page paints.
// The site's default stays its Paper identity following the operating system.
initDesignPalette({
  defaultPreference: { palette: "paper", mode: "system" },
});
