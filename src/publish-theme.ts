/**
 * Appearance contract for the published reader. Palette identifiers and the
 * storage key mirror the shared Hraness palette preference
 * (`hraness-design-palette-v1`, `{ palette, mode }`) so a reader hosted on the
 * same origin as a design-kit application honors the visitor's existing
 * choice, and values the reader writes degrade gracefully there. `wordcell`
 * is the reader's own neutral palette and is not a design-kit identifier;
 * other consumers treat it as an unknown value and fall back.
 *
 * The module is pure — the synchronous `theme.js` bootstrap and the deferred
 * reader bundle both consume it, and tests exercise it without a DOM.
 */

export const WORDCELL_APPEARANCE_STORAGE_KEY = "hraness-design-palette-v1";

export const wordcellPalettes = [
  "wordcell",
  "catppuccin",
  "gruvbox",
  "rose-pine",
  "tokyo-night",
] as const;
export type WordcellPalette = (typeof wordcellPalettes)[number];

export const wordcellPaletteLabels: Readonly<Record<WordcellPalette, string>> = {
  wordcell: "Wordcell",
  catppuccin: "Catppuccin",
  gruvbox: "Gruvbox",
  "rose-pine": "Rosé Pine",
  "tokyo-night": "Tokyo Night",
};

export const wordcellAppearanceModes = ["system", "light", "dark"] as const;
export type WordcellAppearanceMode = (typeof wordcellAppearanceModes)[number];

export const wordcellAppearanceModeLabels: Readonly<Record<WordcellAppearanceMode, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export type WordcellAppearancePreference = Readonly<{
  palette: WordcellPalette;
  mode: WordcellAppearanceMode;
}>;

export const DEFAULT_WORDCELL_APPEARANCE: WordcellAppearancePreference = {
  palette: "wordcell",
  mode: "system",
};

export function isWordcellPalette(value: unknown): value is WordcellPalette {
  return typeof value === "string"
    && (wordcellPalettes as readonly string[]).includes(value);
}

export function isWordcellAppearanceMode(value: unknown): value is WordcellAppearanceMode {
  return typeof value === "string"
    && (wordcellAppearanceModes as readonly string[]).includes(value);
}

/** Parses a foreign preference value; unknown shapes resolve to `undefined`. */
export function parseAppearancePreference(
  value: unknown,
): WordcellAppearancePreference | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const palette = (value as { palette?: unknown }).palette;
  const mode = (value as { mode?: unknown }).mode;
  if (!isWordcellPalette(palette) || !isWordcellAppearanceMode(mode)) return undefined;
  return { palette, mode };
}

export function serializeAppearancePreference(
  preference: WordcellAppearancePreference,
): string {
  return JSON.stringify({ palette: preference.palette, mode: preference.mode });
}

export function resolveAppearanceMode(
  mode: WordcellAppearanceMode,
  systemPrefersDark: boolean,
): "light" | "dark" {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

/**
 * Bridge installed by the synchronous `theme.js` bootstrap on `window` for
 * the deferred reader bundle. `set` persists and applies a preference,
 * `resolvedTheme` reports the concrete theme after `system` resolution, and
 * `subscribe` notifies on every applied change (menu selections, cross-tab
 * storage events, and operating-system appearance changes under `system`).
 */
export type WordcellAppearanceBridge = {
  get(): WordcellAppearancePreference;
  resolvedTheme(): "light" | "dark";
  set(preference: WordcellAppearancePreference): void;
  subscribe(
    listener: (preference: WordcellAppearancePreference, resolved: "light" | "dark") => void,
  ): () => void;
};

/** The bridge travels on `globalThis` so neither bundle needs DOM lib types. */
export function wordcellAppearanceBridge(): WordcellAppearanceBridge | undefined {
  return (globalThis as { wordcellAppearance?: WordcellAppearanceBridge }).wordcellAppearance;
}
