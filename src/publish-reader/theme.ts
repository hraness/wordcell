import {
  DEFAULT_WORDCELL_APPEARANCE,
  parseAppearancePreference,
  resolveAppearanceMode,
  serializeAppearancePreference,
  WORDCELL_APPEARANCE_STORAGE_KEY,
  type WordcellAppearanceBridge,
  type WordcellAppearancePreference,
} from "../publish-theme.js";

/**
 * Synchronous appearance bootstrap emitted as `reader/theme.js` — a classic
 * (non-module) script in every published page head. It applies the saved
 * palette to `data-palette`/`data-theme` on the document element before the
 * first paint so a stored preference never flashes the default theme, then
 * keeps the attributes current across operating-system appearance changes
 * under `system` and cross-tab storage writes. It exposes the small
 * `wordcellAppearance` bridge for the deferred reader bundle's menu and
 * graph repaint. No inline script or style is required, so the strict
 * `default-src 'self'` policy still applies.
 */

type ThemeMediaQuery = {
  readonly matches: boolean;
  addEventListener(name: "change", listener: () => void): void;
};

const host = globalThis as {
  document?: { documentElement?: { setAttribute(name: string, value: string): void } };
  localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  matchMedia?(query: string): ThemeMediaQuery;
  addEventListener?(name: "storage", listener: (event: { key?: string }) => void): void;
  wordcellAppearance?: WordcellAppearanceBridge;
};

const root = host.document?.documentElement;
const media = host.matchMedia?.("(prefers-color-scheme: dark)");

function readPreference(): WordcellAppearancePreference {
  try {
    const raw = host.localStorage?.getItem(WORDCELL_APPEARANCE_STORAGE_KEY);
    if (raw === null || raw === undefined) return DEFAULT_WORDCELL_APPEARANCE;
    return parseAppearancePreference(JSON.parse(raw)) ?? DEFAULT_WORDCELL_APPEARANCE;
  } catch {
    return DEFAULT_WORDCELL_APPEARANCE;
  }
}

let preference = readPreference();
const listeners = new Set<
  (preference: WordcellAppearancePreference, resolved: "light" | "dark") => void
>();

function resolved(): "light" | "dark" {
  return resolveAppearanceMode(preference.mode, media?.matches === true);
}

function apply(): void {
  const theme = resolved();
  root?.setAttribute("data-palette", preference.palette);
  root?.setAttribute("data-theme", theme);
  for (const listener of listeners) listener(preference, theme);
}

host.addEventListener?.("storage", (event) => {
  if (event.key !== WORDCELL_APPEARANCE_STORAGE_KEY) return;
  preference = readPreference();
  apply();
});

media?.addEventListener("change", () => {
  if (preference.mode === "system") apply();
});

host.wordcellAppearance = {
  get: () => preference,
  resolvedTheme: resolved,
  set(next: WordcellAppearancePreference) {
    preference = parseAppearancePreference(next) ?? DEFAULT_WORDCELL_APPEARANCE;
    try {
      host.localStorage?.setItem(
        WORDCELL_APPEARANCE_STORAGE_KEY,
        serializeAppearancePreference(preference),
      );
    } catch {
      // Storage may be unavailable (private mode, disabled cookies); the
      // preference still applies for this page view.
    }
    apply();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

apply();
