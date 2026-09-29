import type { LaunchFacts, LaunchStatus } from "@hraness/design-kit/launch";

import { publishedRelease } from "../../app/publication";

/**
 * Every number the "Introducing Wordcell" beats, the social kit, and the
 * launch film captions use, each typed once with the record it comes from.
 * tests/launch.test.ts reads those records and fails when a value drifts.
 */
export const LAUNCH_STATUS: LaunchStatus = publishedRelease === null
  ? "In development"
  : `Latest release: v${publishedRelease.version}` as LaunchStatus;

export const launchFacts = {
  status: {
    value: LAUNCH_STATUS,
    source: "site/published-release.json version, the release the site has verified, as a STYLE.md status label",
  },
  graphNotes: {
    value: "4,000",
    source: "src/graph-authority-model.ts GRAPH_LIMITS.notes = 4_000, also stated in docs/graph-authority.md",
  },
  graphDepth: {
    value: "8",
    source: "src/graph-authority-model.ts GRAPH_LIMITS.depth = 8; docs/graph-authority.md says depth is bounded at 8",
  },
  bunVersion: {
    value: "1.3.14",
    source: "package.json engines.bun >=1.3.14",
  },
} as const satisfies LaunchFacts;

export type LaunchFactKey = keyof typeof launchFacts;
