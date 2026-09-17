(() => {
  // src/publish-theme.ts
  var WORDCELL_APPEARANCE_STORAGE_KEY = "hraness-design-palette-v1";
  var wordcellPalettes = [
    "wordcell",
    "catppuccin",
    "gruvbox",
    "rose-pine",
    "tokyo-night"
  ];
  var wordcellAppearanceModes = ["system", "light", "dark"];
  var DEFAULT_WORDCELL_APPEARANCE = {
    palette: "wordcell",
    mode: "system"
  };
  function isWordcellPalette(value) {
    return typeof value === "string" && wordcellPalettes.includes(value);
  }
  function isWordcellAppearanceMode(value) {
    return typeof value === "string" && wordcellAppearanceModes.includes(value);
  }
  function parseAppearancePreference(value) {
    if (typeof value !== "object" || value === null)
      return;
    const palette = value.palette;
    const mode = value.mode;
    if (!isWordcellPalette(palette) || !isWordcellAppearanceMode(mode))
      return;
    return { palette, mode };
  }
  function serializeAppearancePreference(preference) {
    return JSON.stringify({ palette: preference.palette, mode: preference.mode });
  }
  function resolveAppearanceMode(mode, systemPrefersDark) {
    if (mode === "system")
      return systemPrefersDark ? "dark" : "light";
    return mode;
  }

  // src/publish-reader/theme.ts
  var host = globalThis;
  var root = host.document?.documentElement;
  var media = host.matchMedia?.("(prefers-color-scheme: dark)");
  function readPreference() {
    try {
      const raw = host.localStorage?.getItem(WORDCELL_APPEARANCE_STORAGE_KEY);
      if (raw === null || raw === undefined)
        return DEFAULT_WORDCELL_APPEARANCE;
      return parseAppearancePreference(JSON.parse(raw)) ?? DEFAULT_WORDCELL_APPEARANCE;
    } catch {
      return DEFAULT_WORDCELL_APPEARANCE;
    }
  }
  var preference = readPreference();
  var listeners = new Set;
  function resolved() {
    return resolveAppearanceMode(preference.mode, media?.matches === true);
  }
  function apply() {
    const theme = resolved();
    root?.setAttribute("data-palette", preference.palette);
    root?.setAttribute("data-theme", theme);
    for (const listener of listeners)
      listener(preference, theme);
  }
  host.addEventListener?.("storage", (event) => {
    if (event.key !== WORDCELL_APPEARANCE_STORAGE_KEY)
      return;
    preference = readPreference();
    apply();
  });
  media?.addEventListener("change", () => {
    if (preference.mode === "system")
      apply();
  });
  host.wordcellAppearance = {
    get: () => preference,
    resolvedTheme: resolved,
    set(next) {
      preference = parseAppearancePreference(next) ?? DEFAULT_WORDCELL_APPEARANCE;
      try {
        host.localStorage?.setItem(WORDCELL_APPEARANCE_STORAGE_KEY, serializeAppearancePreference(preference));
      } catch {}
      apply();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  apply();
})();
