import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_WORDCELL_APPEARANCE,
  isWordcellAppearanceMode,
  isWordcellPalette,
  parseAppearancePreference,
  resolveAppearanceMode,
  serializeAppearancePreference,
  WORDCELL_APPEARANCE_STORAGE_KEY,
  wordcellAppearanceModeLabels,
  wordcellAppearanceModes,
  wordcellPaletteLabels,
  wordcellPalettes,
} from "./publish-theme.js";

describe("publish theme contract", () => {
  test("palette set mirrors the shared design-kit contract plus the reader neutral", () => {
    expect(wordcellPalettes).toEqual([
      "wordcell",
      "catppuccin",
      "gruvbox",
      "rose-pine",
      "tokyo-night",
    ]);
    for (const palette of wordcellPalettes) {
      expect(wordcellPaletteLabels[palette].length).toBeGreaterThan(0);
    }
    expect(wordcellAppearanceModes).toEqual(["system", "light", "dark"]);
    for (const mode of wordcellAppearanceModes) {
      expect(wordcellAppearanceModeLabels[mode].length).toBeGreaterThan(0);
    }
    expect(WORDCELL_APPEARANCE_STORAGE_KEY).toBe("hraness-design-palette-v1");
  });

  test("parseAppearancePreference accepts the stored shape and rejects foreign values", () => {
    expect(parseAppearancePreference({ palette: "gruvbox", mode: "dark" }))
      .toEqual({ palette: "gruvbox", mode: "dark" });
    expect(parseAppearancePreference({ palette: "catppuccin", mode: "system" }))
      .toEqual({ palette: "catppuccin", mode: "system" });
    expect(parseAppearancePreference({ palette: "wordcell", mode: "light" }))
      .toEqual({ palette: "wordcell", mode: "light" });
    for (const bad of [
      undefined,
      null,
      "gruvbox",
      42,
      {},
      { palette: "nord", mode: "dark" },
      { palette: "gruvbox" },
      { palette: "gruvbox", mode: "auto" },
      { palette: 7, mode: "dark" },
      { palette: "catppuccin", mode: null },
      ["catppuccin", "dark"],
    ]) {
      expect(parseAppearancePreference(bad)).toBeUndefined();
    }
  });

  test("preference serialization round-trips", () => {
    for (const palette of wordcellPalettes) {
      for (const mode of wordcellAppearanceModes) {
        const preference = { palette, mode } as const;
        expect(parseAppearancePreference(
          JSON.parse(serializeAppearancePreference(preference)),
        )).toEqual(preference);
      }
    }
    expect(DEFAULT_WORDCELL_APPEARANCE).toEqual({ palette: "wordcell", mode: "system" });
  });

  test("mode guards and resolution", () => {
    expect(isWordcellPalette("gruvbox")).toBe(true);
    expect(isWordcellPalette("nord")).toBe(false);
    expect(isWordcellPalette(3)).toBe(false);
    expect(isWordcellAppearanceMode("system")).toBe(true);
    expect(isWordcellAppearanceMode("auto")).toBe(false);
    expect(resolveAppearanceMode("light", true)).toBe("light");
    expect(resolveAppearanceMode("dark", false)).toBe("dark");
    expect(resolveAppearanceMode("system", true)).toBe("dark");
    expect(resolveAppearanceMode("system", false)).toBe("light");
  });

  test("reader.css carries a complete palette × theme matrix", async () => {
    const css = await readFile(
      new URL("./publish-reader/reader.css", import.meta.url),
      "utf8",
    );
    for (const palette of wordcellPalettes) {
      for (const theme of ["light", "dark"] as const) {
        const selector = `:root[data-palette="${palette}"][data-theme="${theme}"]`;
        expect(css).toContain(selector);
      }
      expect(css).toContain(`.swatch-${palette}`);
    }
    // The media-query fallback must not fight an explicit stored theme.
    expect(css).toContain(":root:not([data-theme])");
    // Every palette block defines the full token surface.
    for (const token of [
      "--wordcell-bg",
      "--wordcell-fg",
      "--wordcell-muted",
      "--wordcell-border",
      "--wordcell-border-strong",
      "--wordcell-accent",
      "--wordcell-accent-soft",
      "--wordcell-warning",
      "--wordcell-code-bg",
      "--wordcell-mark",
      "--wordcell-overlay",
      "--wordcell-panel",
    ]) {
      const block = css.slice(css.indexOf(':root[data-palette="gruvbox"][data-theme="dark"]'));
      expect(block.slice(0, block.indexOf("}"))).toContain(`${token}:`);
    }
  });
});
