#!/usr/bin/env bash
# Encodes the rendered masters in build/ into web files in out/:
#   <name>-1080p.mp4, <name>-1080p.webm, <name>-preview.mp4 (960x540), <name>-poster.{png,jpg,webp},
#   <name>-1x1.mp4, <name>-9x16.mp4 when those masters exist, and <name>.en.vtt.
# usage: deliver.sh <name>
set -euo pipefail
NAME="${1:?usage: deliver.sh <name>}"
cd "$(dirname "$0")" 2>/dev/null || true
cd "${FILM_DIR:-$PWD}"
POSTER=$(bun -e 'console.log(JSON.parse(require("fs").readFileSync("build/timeline.json","utf8")).posterAt)')
mkdir -p out
YUV=(-vf 'scale=out_color_matrix=bt709:out_range=tv:flags=bicubic+accurate_rnd+full_chroma_int,format=yuv420p' -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv)
enc() { ffmpeg -loglevel error -y -i "$1" "${YUV[@]}" -c:v libx264 -preset slow -crf 18 -tune animation -profile:v high -movflags +faststart -an "$2"; }
if [ -f build/master-wide.mp4 ]; then
  enc build/master-wide.mp4 "out/$NAME-1080p.mp4"
  ffmpeg -loglevel error -y -i build/master-wide.mp4 "${YUV[@]}" -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -deadline good -cpu-used 2 -an "out/$NAME-1080p.webm"
  ffmpeg -loglevel error -y -i "out/$NAME-1080p.mp4" -vf scale=960:540 -an -c:v libx264 -crf 28 -preset slow -movflags +faststart "out/$NAME-preview.mp4"
  ffmpeg -loglevel error -y -ss "$POSTER" -i build/master-wide.mp4 -frames:v 1 "out/$NAME-poster.png"
  ffmpeg -loglevel error -y -i "out/$NAME-poster.png" -q:v 3 "out/$NAME-poster.jpg"
  ffmpeg -loglevel error -y -i "out/$NAME-poster.png" -c:v libwebp -quality 90 "out/$NAME-poster.webp"
  ffmpeg -loglevel error -y -i "out/$NAME-poster.png" -vf "scale=1200:-2,crop=1200:630" -q:v 3 "out/$NAME-social.jpg"
fi
if [ -f build/master-square.mp4 ]; then enc build/master-square.mp4 "out/$NAME-1x1.mp4"; fi
if [ -f build/master-portrait.mp4 ]; then
  enc build/master-portrait.mp4 "out/$NAME-9x16.mp4"
  ffmpeg -loglevel error -y -ss "$POSTER" -i build/master-portrait.mp4 -frames:v 1 -q:v 3 "out/$NAME-9x16-poster.jpg"
fi
cp build/captions.vtt "out/$NAME.en.vtt"
ls -la out
