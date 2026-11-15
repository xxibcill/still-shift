#!/usr/bin/env bash
# ET0 re-baseline: re-run the 2026-11-15 proof programs on the current checkout.
#   research/editorial-typography-proof/rebaseline-main.sh <output-dir>
# Needs the git-ignored proof clip at
# benchmarks/results/cinematic-illustrated/review-v3/ci-09-layered-parallax.mp4
# (SHA-256 d5bc5a52…7fdcd); the clip descriptor rejects any other bytes.
# Each command's stdout/stderr and exit status are kept under <output-dir>/logs.
set -uo pipefail
out="$1"
mkdir -p "$out/logs"
proof=research/editorial-typography-proof
run() {
  local name="$1"
  shift
  "$@" >"$out/logs/$name.out" 2>"$out/logs/$name.err"
  echo "$?" >"$out/logs/$name.status"
  echo "$name exit $(cat "$out/logs/$name.status")"
}
cli() { pnpm --silent still-shift "$@"; }
for t in t1-editorial-stack t2-thai-condensed-poster t3-minimal-centered; do
  run "validate-$t" cli comp validate --input "$proof/$t.ts"
  run "render-$t" cli comp render --input "$proof/$t.ts" --output "$out/$t.mp4"
  run "render-$t.pass1" cli comp render --input "$proof/pass1/$t.composition.json" --output "$out/$t.pass1.mp4"
  run "lint-$t" cli comp lint --input "$proof/$t.ts"
  run "lint-pixels-$t" cli comp lint --input "$proof/$t.ts" --pixels true
  run "lint-pass1-$t" cli comp lint --input "$proof/pass1/$t.composition.json"
  run "lint-pixels-pass1-$t" cli comp lint --input "$proof/pass1/$t.composition.json" --pixels true
  PROOF_TREATMENT="$t" run "lint-pixels-noclip-$t" cli comp lint --input "$proof/without-clip.ts" --pixels true
done
run "render-t1-control-static" cli comp render --input "$proof/t1-control-static.ts" --output "$out/t1-control-static.mp4"
run "validate-coverage-negative" cli comp validate --input "$proof/coverage-negative.ts"
run "render-coverage-negative" cli comp render --input "$proof/coverage-negative.ts" --output "$out/coverage-negative.mp4"
PROOF_PLEX_ONLY=1 run "render-coverage-negative-plex-only" cli comp render --input "$proof/coverage-negative.ts" --output "$out/coverage-negative-plex-only.mp4"
run "cmap-probe" pnpm exec tsx "$proof/cmap-probe.ts"
(cd "$out" && shasum -a 256 ./*.mp4 >sha256.txt)
