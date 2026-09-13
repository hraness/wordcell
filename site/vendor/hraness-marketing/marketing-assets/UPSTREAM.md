# Static marketing field

Original Hraness SVG textures, authored 2026-09-11, covered by the package MIT
license. The checked generator is `scripts/marketing-textures.ts`. These are
background assets only; never apply them to a logo or over meaningful content.

- `grain.svg`: deterministic black/white one-unit stipple, seed 4652026,
  viewBox 128 × 128, group opacity .03.
- `cells.svg`: 64 individually shaded panes in a 768 × 768 viewBox. Each
  96-unit square has a seeded light direction and low-opacity gradient.
  Panes have no stroke; adjacent faces suggest their edges. Refined 2026-09-13.
- Grain SHA-256: `b40c33a0e382c8e9d0518b4720321b5c262a929c28d40a190a902d07acd06553`
- Cells SHA-256: `be9b12eefeae91772f024ed24ccda5be6173fb626921374b7e5270c298611b01`

There is no animation, runtime canvas, or image overlay. The original seeded
face gradients express depth without a shader or visible grid stroke.
