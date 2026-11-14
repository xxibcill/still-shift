#!/usr/bin/env bash
# Extract review frames from a proof render and build contact sheets.
#   review-frames.sh <render.mp4> <output-dir>
# Frames: entrance 16/24/32, hold 60/100, exit 130/138/146 (24 fps, 168 frames).
# Uses FFmpeg's frame ordinal (select=eq(n,N)), matching Still Shift's frames.
set -euo pipefail
src="$1"
out="$2"
mkdir -p "$out"
frames=(16 24 32 60 100 130 138 146)
for n in "${frames[@]}"; do
  ffmpeg -v error -y -i "$src" -vf "select=eq(n\,$n)" -frames:v 1 "$out/f$(printf %03d "$n").png"
done
# Phone-scale sheet, row-major in the frame order above, 360x640 per frame.
inputs=()
for n in "${frames[@]}"; do inputs+=(-i "$out/f$(printf %03d "$n").png"); done
ffmpeg -v error -y "${inputs[@]}" -filter_complex \
  "$(for i in "${!frames[@]}"; do printf '[%d]scale=360:640[s%d];' "$i" "$i"; done)$(for i in "${!frames[@]}"; do printf '[s%d]' "$i"; done)xstack=inputs=8:layout=0_0|360_0|720_0|1080_0|0_640|360_640|720_640|1080_640" \
  "$out/phone-sheet.png"
# Small phone-size check: hold frame at 270 px wide (small in-feed tile).
ffmpeg -v error -y -i "$out/f060.png" -vf scale=270:480 "$out/hold-270.png"
echo "$out"
