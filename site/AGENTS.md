# Contents

- `app/` – public site pages, layouts, and generated documentation projections.
- `lib/` – shared rendering, release metadata, and hosted document helpers.
- `scripts/` – source synchronization and build/browser checks.
- `tests/` – source, rendering, and hosted reader regressions.
- `public/` – static site assets and discovery files.
- `vendor/` – pinned design assets and provenance records.

# Guidelines

- Share images come only from the shared `@hraness/web-discovery` social-image template, rendered from the single `defineSocialImageSite` declaration in `app/social.ts` (the header's foil mark `public/marks/kb.svg`, the `gruvbox` palette from `data-palette`, and the registry copy). Routes pass page copy only (`headline`, `description`, and `path` for the default eyebrow, or an explicit `eyebrow`) and take alt text from `socialImageAlt`; never add per-site drawing code.

<!-- BEGIN:nextjs-agent-rules -->

**This is NOT the Next.js you know**

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- Website names, product descriptions, hero copy, and named headings read the website-local `portfolio-messaging.generated.json` projection of `https://hraness.com/portfolio.json`. Edit the canonical Jungle portfolio registry and refresh that snapshot; ordinary builds never fetch or rewrite it.
