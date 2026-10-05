/**
 * The story-film contract. A product's `story.config.ts` default-exports a
 * function that returns a `Story`, built from the product's own facts module,
 * release record and recorded proof. Every act is one idea; the engine owns
 * layout, motion, timing, brand and captions.
 */

export interface Palette {
  readonly background: string;
  readonly foreground: string;
  readonly muted: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly primary: string;
  readonly primarySoft: string;
  readonly primaryForeground: string;
}

export interface Brand {
  /** Product name exactly as the site header shows it beside the mark. */
  readonly wordmark: string;
  /** Absolute path to the header's mark file (SVG or PNG with alpha). */
  readonly mark: string;
  /** Width / height of the mark artwork. */
  readonly markAspect: number;
  /**
   * Where the dark palette comes from: a theme CSS file with `--token:
   * light-dark(light, dark)` pairs, an explicit palette, or both (explicit
   * values win). `tokens` renames palette keys to the file's custom properties.
   */
  readonly palette: {
    readonly css?: string;
    readonly tokens?: Partial<Record<keyof Palette, string>>;
    readonly values?: Partial<Palette>;
  };
  /** Absolute path to the pinned `@hraness/design-kit` package root, for the foil paint and default fonts. */
  readonly designKit: string;
  /** Optional font files: sans weights 400/550/650 and a mono face. Defaults to the design kit's Nebula Sans and Geist Mono. */
  readonly fonts?: { readonly sans?: { readonly book: string; readonly medium: string; readonly semibold: string; readonly family?: string }; readonly mono?: string };
  /** Display tracking for headlines, from the site's heading style. Default -0.032em. */
  readonly headlineTracking?: string;
}

/** A source of scattered or joined information, such as an app. */
export interface SourceCard {
  readonly app: string;
  /** One or two letters for the app tile. */
  readonly glyph: string;
  /** CSS color for the tile and connectors. */
  readonly color: string;
  readonly lines: readonly string[];
}

export interface Exchange {
  readonly you: string;
  readonly agent: string;
  /** Labelled chips under the reply, such as sources. */
  readonly chips?: { readonly label?: string; readonly items: readonly string[] };
  /** A small result card under the reply. */
  readonly card?: { readonly kicker?: string; readonly title: string; readonly body?: string; readonly meta?: string; /** Absolute path to a real product render shown in the card. */ readonly image?: string };
}

export interface TerminalLine {
  readonly cmd?: string;
  readonly out?: string;
  readonly tone?: "plain" | "muted" | "ok" | "accent";
}

interface ActBase {
  /** Stable act id for caption cue ids and per-act clips. Defaults to act-<n>. */
  readonly id?: string;
  /** One sentence, read aloud in about two seconds. */
  readonly headline: string;
  /** Words painted with the foil accent; must appear in the headline exactly. */
  readonly accents?: readonly string[];
  /** Shows the "Sample data" chip while this act is on screen. */
  readonly sample?: boolean;
  /** Override the engine's default length. */
  readonly seconds?: number;
}

export type Act =
  | (ActBase & { readonly kind: "scatter"; readonly cards: readonly SourceCard[]; readonly ghosts?: readonly string[] })
  | (ActBase & { readonly kind: "chat"; readonly label?: string; readonly exchanges: readonly Exchange[] })
  | { readonly kind: "reveal"; readonly id?: string; readonly tagline: string; readonly seconds?: number }
  | (ActBase & {
      readonly kind: "merge";
      readonly sources: readonly SourceCard[];
      readonly result: {
        readonly title: string;
        readonly subtitle?: string;
        readonly avatar?: string;
        readonly rows: readonly { readonly label: string; readonly value: string; readonly from: readonly string[] }[];
        readonly footnote?: string;
      };
    })
  | (ActBase & { readonly kind: "terminal"; readonly title?: string; readonly lines: readonly TerminalLine[] })
  | (ActBase & { readonly kind: "stats"; readonly items: readonly { readonly value: string; readonly label: string }[]; readonly note?: string })
  | (ActBase & { readonly kind: "cards"; readonly items: readonly { readonly tag?: string; readonly title: string; readonly body?: string }[] })
  /** Real product renders or screenshots: absolute image paths, each with a short caption. */
  /** portraitImage: an optional phone-width capture of the same surface for the 9:16 cut. */
  | (ActBase & { readonly kind: "gallery"; readonly items: readonly { readonly image: string; readonly portraitImage?: string; readonly caption?: string }[] })
  | (ActBase & {
      readonly kind: "before-after";
      readonly before: { readonly label?: string; readonly items: readonly string[]; readonly redact?: boolean };
      readonly after: { readonly label?: string; readonly title: string; readonly rows: readonly { readonly label: string; readonly value: string }[]; readonly note?: string };
      readonly frame?: string;
    });

export interface EndCard {
  /** "Ask your agent:" for agent installs, otherwise a short lead or omitted. */
  readonly lead?: string;
  /** The exact prompt typed into the box. */
  readonly prompt?: string;
  /** For products without an agent install: the action on a button, such as "Open aicharts.io". */
  readonly action?: string;
  readonly terms?: string;
  readonly url: string;
  readonly finePrint?: string;
}

export interface Story {
  readonly id: string;
  readonly brand: Brand;
  readonly acts: readonly Act[];
  readonly end: EndCard;
  /** Label shown on acts with `sample: true`. */
  readonly sampleLabel?: string;
  /** Seconds into the film for the poster; defaults to the middle of the first product act after the reveal. */
  readonly posterAt?: number;
  readonly fps?: { readonly wide?: number; readonly square?: number; readonly portrait?: number };
  /** Aspects to build. Default wide and square. */
  readonly formats?: readonly ("wide" | "square" | "portrait")[];
}

export function defineStory(story: Story): Story {
  return story;
}
