# Launch film

A code-built product film for a launch post. Every frame is HTML and CSS drawn from a timeline, so the film renders the same way each time and you can change a word without re-cutting anything.

The film has six acts:

1. Cold open: a collage of the problem and two lines of copy.
2. Title: the product name and its one-line promise.
3. Product walk: your product in a browser frame, with a camera that moves between surfaces, a cursor and a drawn highlight. One step per entry in `film.json`.
4. Proof: numbers counted up from your facts file.
5. Limits: what the product does not do.
6. End card: name, address and one line.

## Files

| File | What it holds |
| --- | --- |
| `film.json` | Copy, aspect, frame rate, colors, fonts and product CSS. Start here. |
| `mockups.tsx` | Placeholder product surfaces. Replace them with your site's real mockup components. |
| `timeline.ts` | Act order and length. `film.js`, captions and per-beat clips all read it. |
| `film.html` | The stage, with `{{SLOT}}` placeholders that `build.ts` fills. |
| `film.css` | Canvas, scenes, masks, grain and the placeholder product styles. |
| `film.js` | The choreography. Each frame is a pure function of time. |
| `build.ts` | Writes `out/film.html`, `out/scene.json`, `out/captions.vtt` and `out/beats.json`. |

The motion helpers come from `@hraness/slopcamera/local/html-film` and are bundled into `out/film.html` at build time.

## Make the film

```sh
bun install
bun run build                # add -- --aspect 9:16 for a vertical cut
slopcamera html still --input out/scene.json --at 3,12.5 --output out/stills
slopcamera html render --input out/scene.json --json > out/export.json
slopcamera html deliver out/export.json --basename launch --poster-at 9 --social-at 9 \
  --beats out/beats.json --per-beat-clips
```

Run each command from this directory. Look at the stills before rendering the full film.

## Rules for the copy

- Take every number in `film.json` from a facts file or release record. Do not type numbers by hand.
- Keep the placeholder illustration note in `mockups.tsx` until the surfaces show your real product.
- Use sentence case and plain words. One idea per act.

## Swap in your product

1. Replace `ProductMockup` and `OpenCard` in `mockups.tsx`. Keep the `data-film` names that `film.json` steps point at (`list`, `detail-body`, `row-2`, `action`), or change both together. Each step names a `focus` for the camera, a `target` for the cursor click, an optional `highlight`, and an optional `after` state that the target gets once clicked (styled with `[data-film-state="done"]` in `film.css`).
2. If your site uses `@hraness/design-kit`, its `mockups.css` is inlined automatically. List any other product stylesheets in `film.json` under `productCss`.
3. List your fonts in `film.json` under `fonts` as `{ "name", "family", "weight", "file" }`. Without them the film uses the Nebula Sans files that ship with SlopCamera.
