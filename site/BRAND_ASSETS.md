# Wordcell website identity

The header switches from the opaque `public/icon.png` favicon to the checked transparent `public/marks/kb.svg` artwork adopted
in PR #83. `MarketingSiteHeader` paints metallic foil with a subtle rainbow
reflection on that original silhouette and the Wordcell name. The image remains
as the fallback when masking is unavailable or forced colors are active; the
enclosing home link names the product once.

Preserve the mark geometry and the browser/touch PNG bytes. The header uses the
transparent SVG instead of the opaque favicon; the content footer retains its
existing image. The `kb` asset filename is the catalog’s stable product key.

| File | SHA-256 |
| --- | --- |
| marks/kb.svg | `0558395c7a0e4abf94735c710a23ff9348be623fca5bc0587b3d41552a63711f` |
