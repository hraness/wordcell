/**
 * The film's acts, built from film.json. build.ts uses this for the scene
 * duration, captions.vtt and beats.json; film.js uses it for every frame. One
 * source, so captions and per-beat clips never drift from the picture.
 */
import { defineTimeline, type HtmlFilmTimeline } from "@hraness/slopcamera/local/html-film";

export interface FilmStep {
  readonly heading: string;
  readonly body: string;
  /** `data-film` name the camera frames. */
  readonly focus: string;
  /** `data-film` name the cursor clicks. */
  readonly target: string;
  /** `data-film` name the drawn box outlines after the click. */
  readonly highlight?: string;
  /** Sets `data-film-state` on the target after the click, such as `done`. */
  readonly after?: string;
  /** Camera push-in over the fitted view. Defaults to 1.45. */
  readonly zoom?: number;
}
export interface FilmProofItem { readonly value: number; readonly suffix?: string; readonly label: string }
export interface FilmCopy {
  readonly name: string;
  readonly promise: string;
  readonly url: string;
  readonly open: readonly string[];
  readonly steps: readonly FilmStep[];
  readonly proof: { readonly caption: string; readonly items: readonly FilmProofItem[] };
  readonly limits: { readonly heading: string; readonly body: string };
  readonly end: { readonly line: string };
}

/** Seconds each product step stays on screen. */
export const STEP_SECONDS = 4.4;

/** Formats `value` with as many decimals as `like` has. */
export function formatValue(value: number, like: number): string {
  const decimals = (String(like).split(".")[1] ?? "").length;
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function filmTimeline(copy: FilmCopy): HtmlFilmTimeline {
  return defineTimeline([
    { id: "open", duration: 5, caption: copy.open.join(" ") },
    { id: "title", duration: 4, overlap: 0.6, caption: `${copy.name}. ${copy.promise}` },
    ...copy.steps.map((step, index) => ({
      id: `step-${String(index + 1)}`,
      duration: STEP_SECONDS,
      overlap: index === 0 ? 0.8 : 0,
      caption: `${step.heading}. ${step.body}`,
    })),
    { id: "proof", duration: 4.5, overlap: 0.5, caption: copy.proof.items.map(item => `${formatValue(item.value, item.value)}${item.suffix ?? ""} ${item.label}`).join(". ") },
    { id: "limits", duration: 4.5, caption: `${copy.limits.heading}. ${copy.limits.body}` },
    { id: "end", duration: 4.5, overlap: 0.5, caption: `${copy.name}. ${copy.url}. ${copy.end.line}` },
  ]);
}
