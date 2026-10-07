# CE7 native time controls

These are new native fixtures with a separate baseline. CE0 and CE5 baselines
remain unchanged. Run `pnpm test:browser:composition-exposure` to verify all
48 frames of each fixture, reverse order, random seeks, independent analytic
painting, hardware preview and independently encoded exports on both backends.
The explicit `--write-ce7-baseline` flag writes only this directory.

`time-controls` has five rows: live motion, posterized motion at 8 fps, a hold at
source frame 12.5, two finite cycles of a 12-frame precomp, and unlimited ping-pong
motion. Frames 12 and 24 demonstrate the new-cycle side and finite terminal hold.

`adaptive` has a moving row at three pixels per frame, a stationary row, and an
opted-out row at two pixels per frame. The 180-degree shutter with 90-degree phase
selects three samples in the interior, the configured cap at the first key/source
edge, and one stationary sample at the final source clamp. A cached stationary
WebGL graph may report zero new draws without changing its selected sample/pixels.

The PNGs show frames 0, 12, 24 and 47. Stored hashes cover every frame separately
for Canvas and WebGL. Their raster fingerprint must match the pinned environment.
The analytic oracle uses its own clock formulas and opaque sample averaging,
without calling production sampling or evaluation helpers. Comparisons retain
the existing near-pixel and perceptual-hardware thresholds. `--profile` records
serial 1080p costs for 1, 2, 4, 8, 16, 32 and 64 samples on both backends, including
cold initialization/first draw and five warmed complete render/readback timings.
