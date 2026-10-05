#!/usr/bin/env bash
# Builds, renders every format in the story, and delivers. Run through host-run.
set -euo pipefail
cd "$(dirname "$0")"
bun build.ts
for f in $(bun -e 'console.log(JSON.parse(require("fs").readFileSync("build/timeline.json","utf8")).formats.join(" "))'); do bun render.ts "$f"; done
bash deliver.sh "${1:?usage: render-all.sh <name>}"
