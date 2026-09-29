# Motion Craft MC3 historical video verification

The MC3 plan asks the signal/driver rewrite to reproduce the archived v014-g
video. The archived render and the later 442-key Buffer Press source are
different compositions. This check keeps their evidence separate.

## Reproduce the comparison

The MP4s and their result/scene sidecars are generated files under
`benchmarks/results/` and are not committed. With both local render directories
available, run from the repository root:

```sh
node --import tsx scripts/story-motion/check-motion-craft-historical.ts \
  --historical-result benchmarks/results/story-motion-v014-proto-g/unequal-margins.mp4.result.json \
  --candidate-result benchmarks/results/motion-craft-20260927-browser-03/buffer-press.mp4.result.json \
  --candidate-scene benchmarks/fixtures/motion-craft/buffer-press.json \
  --output-dir benchmarks/results/motion-craft-historical-audit \
  --report-only
```

Use a fresh output directory. The verifier checks both MP4 checksums against
their render result sidecars, checks the candidate fixture checksum against its
render manifest, and decodes every full-resolution RGB frame. It reports each
frame's maximum channel difference, mean absolute difference, count of channels
outside the default ±2 tolerance, and first differing pixel. It also restores
the 20 historical art/font files to `archived-assets/` from Git commit
`e3990bc855176984c38261a2c4c0f15c63217d24`, accepting each only when its
SHA-256 matches the archived render manifest. No current source asset is
overwritten.
Without `--report-only`, a failed MC3 historical acceptance exits nonzero after
writing the report.

The restored assets also support an isolated replay under the current engine:

```sh
node --import tsx scripts/story-motion/replay-motion-craft-v014.ts \
  --historical-result benchmarks/results/story-motion-v014-proto-g/unequal-margins.mp4.result.json \
  --archived-assets benchmarks/results/motion-craft-historical-audit/archived-assets \
  --output-dir benchmarks/results/motion-craft-v014-replay
```

This generates three scenes and videos: the archived composition recompiled by
the current engine, the same composition with `motionModel: curves-1`, and a
five-signal/five-driver rewrite of its move properties. The generator verifies
all asset hashes and every node pose at every frame, then separately compares
the saved video with the current-engine replay, the legacy replay with the
opt-in scene, and the opt-in scene with its signal rewrite. It removes the
archived `camera.cover: ["paper"]` declaration only in these generated replay
scenes because that transparent image fails the current coverage validator.
Production validation remains enabled.

The archived `pressure-b.x` move is authored as an absolute x position despite
its `current` role. The opt-in model otherwise defaults that role to additive
motion, moving the pressure band 1,630 pixels at frame 0. The replay explicitly
sets that move to `blend: "replace"`. Its signal rewrite then uses additive
offsets from the stable legacy x track value of 1,630 after frame 150; this
avoids a second replace writer on a property animated earlier in the beat.

The saved v014-g video can also be reproduced exactly without changing the
production renderer. The archival compatibility checker extracts pinned engine
commit `50b5dca0bea23d86fd2cb35ad68e63b6813794b3` into a temporary
checkout. There it changes only the Canvas transform call from the current
matrix application to the sequential translate/rotate/scale/translate calls
used by the archived renderer. It renders the opt-in and signal-rewrite scenes,
checks every decoded full-resolution frame at ±2/channel, checks the complete
MP4 hashes, runs MC7 focal attribution with local copies of the pinned art,
writes both reports, and removes the temporary engine checkout:

```sh
node --import tsx scripts/story-motion/replay-motion-craft-v014-archive.ts \
  --historical-result benchmarks/results/story-motion-v014-proto-g/unequal-margins.mp4.result.json \
  --replay-dir benchmarks/results/motion-craft-v014-replay \
  --output-dir benchmarks/results/motion-craft-v014-archival-transform
```

The archival replay's `focal-report.json` uses that same isolated Canvas
transform. It declares the actual `margin-b.scaleX` / `less-room-remains` and
`pressure-b.x` / `shared-strain` motion events as focal, and removes the
archived `house-a-art` fade in a separate counterfactual. To compare the same
composition under the current production renderer, run the focal checker
directly:

```sh
node --import tsx scripts/story-motion/check-motion-craft-v014-focal.ts \
  --replay-dir benchmarks/results/motion-craft-v014-replay \
  --output-report benchmarks/results/motion-craft-v014-archival-transform/focal-current-renderer.json
```

## Recorded local result, 2026-09-29

The archived v014-g and Motion Craft browser-03 result sidecars both validate
their respective MP4 hashes. All 20 historical assets are recoverable from the
pinned commit; current `house-body.svg`, `store-body.svg`, and `land-body.svg`
differ from their archived versions.

All 192 decoded 1920×1080 frames exceed ±2 in at least one RGB channel. The
first mismatch is frame 0. Across frames, the mean of frame mean absolute
channel differences is 17.1933; the smallest frame maximum is 143 and the
largest is 228. This is an explicit **cross-composition parity failure**, not an
accepted tolerance result for the later Buffer Press candidate. The
source-specific v014-g rewrite is verified separately below.

The archived scene has 19 nodes, 4 recipe moves and 8 explicit keys. The later
Buffer Press source has 25 nodes, 14 moves and 442 sampled keys; its rewrite
has zero baked keys, one signal, seven drivers and one contact constraint. The
archived and candidate camera, cover art, and node composition differ. The
existing 0.000497248 numeric pose bound demonstrates the later 442-key source
rewrite, not v014-g decoded-video parity.

In the isolated v014-g replay, the current-engine legacy scene and the opt-in
scene have equal numeric poses for every node and **192/192 identical decoded
RGB frames**. The opt-in scene and its move-to-signal rewrite also match every
node pose and **192/192 decoded frames**. The rewrite has zero recipe move keys.
These are the current-engine apples-to-apples MC3 migration proofs.

The current-engine archival replay matches the saved v014-g MP4 within ±2 in
only frames 0–10. The first mismatch is frame 11 in the entering left house,
and subsequent differences reach 51/channel. Both renders use the same
recorded Chromium and FFmpeg versions; the old and newly compiled track data
are equal. The cause is the later Canvas transform implementation. Replacing
only `ctx.transform(...nodeMatrix(node, state))` with the archived sequence of
Canvas translate, rotate, scale, and translate calls in an isolated copy of the
current engine reproduces the saved MP4 **byte for byte**. The transforms are
algebraically equivalent, but their floating-point operation order changes
rasterized edge pixels during motion. A separate render
using the pinned historical `e3990bc` renderer and the recovered assets also
reproduced the saved MP4 SHA-256 exactly:
`59916b3457df4c92e0a188d0d591195fa05a4e477dfd00040b17f7e9a1ac862a`.

The isolated archival-transform renders of **both** the opt-in source and the
five-signal/five-driver rewrite match **192/192** saved v014-g decoded frames
within ±2/channel and produce that same complete MP4 SHA-256. This closes the
literal v014-g MC3 historical parity check with a pinned compatibility render
path. The production renderer keeps its current matrix transform. Its own
legacy→opt-in→rewrite parity is separately exact, as described above.

The archived scene declares transparent `paper.svg` as a full-screen camera
cover. Current production alpha-coverage validation rejects it at frame 0.
The direct verifier compares the saved decoded videos; the replay removes only
that legacy cover declaration in generated copies. The cover change does not
alter these pixels: the isolated archival-transform opt-in and rewrite renders
still match the saved MP4 byte for byte. Production alpha validation remains
intact. The existing 442→0-key acceptance remains attributed to the later
Buffer Press fixture; the v014-g rewrite removes its own eight explicit recipe
move keys.

MC7's focal-event lint on the reconstructed v014-g composition under the
archival Canvas transform reports `peak-not-story` at checker frame 85. The
thin-margin action contributes 2,833 marginal changed pixels there while all
other change contributes 328,966. Removing the archived household A art fade
reduces frame-85 total energy by 8,854, more than three times the margin focal
contribution. The household B response remains a large contributor, so the
fade is not the sole reason for the warning. The direct current-renderer check
also warns (margin 2,833; other 328,975; fade counterfactual 8,847). This
reproduces the documented creative concern with the same archived art and
transform that produce the saved MP4 byte for byte. The saved MP4's previously
reported frame-81 peak uses a different, greyscale encoded-video metric; MC7
uses reduced-resolution marginal RGB change.
