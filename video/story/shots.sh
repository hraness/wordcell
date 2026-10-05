#!/usr/bin/env bash
# Captures the launch post's three product figures from wordcell.io in dark mode.
set -euo pipefail
cd "$(dirname "$0")"
for id in give-relationships-a-precise-meaning find-the-reason-in-different-words revisit-the-decision-when-an-assumption-changes; do
  bun site-shot.ts https://wordcell.io/blog/introducing-wordcell "shots/$id.png" --width 1280 --height 1000 --selector "[data-wordcell-story-visual=\"$id\"]" --wait 1500
done
