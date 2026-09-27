# Static marketing field

Original Hraness SVG textures, authored 2026-09-11, covered by the package MIT
license. The checked generator is `scripts/marketing-textures.ts`. These are
background assets only; never apply them to a logo or over meaningful content.

- `grain.svg`: deterministic black/white one-unit stipple, seed 4652026,
  viewBox 128 × 128, group opacity .03.
- `cells.svg`: 64 individually shaded panes in a 768 × 768 viewBox. Each
  96-unit square has a seeded light direction and low-opacity gradient.
  Panes have no stroke; adjacent faces suggest their edges. Refined 2026-09-13.
  Refined 2026-09-23 to reduce light-mode tile contrast: black stop opacity is
  .008–.034, while white stops, seeded directions and face geometry are unchanged.
- Grain SHA-256: `b40c33a0e382c8e9d0518b4720321b5c262a929c28d40a190a902d07acd06553`
- Cells SHA-256: `2391e9b3ee964e1178fedc55c766d12ac43bfeda92cfa44aab16c64a15f9d712`

There is no animation, runtime canvas, or image overlay. The original seeded
face gradients express depth without a shader or visible grid stroke.
