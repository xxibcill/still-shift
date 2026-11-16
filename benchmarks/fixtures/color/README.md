# CGA synthetic color fixtures

[`cga-synthetic.ts`](./cga-synthetic.ts) generates the deterministic test clips
for the [CGA milestone](../../../docs/color-grading-engine-plan.md#cga--automatic-exposure-contrast-saturation-and-white-balance-for-flat-sdr-clips):
a 96×160, 12-frame, 24 fps portrait clip of arithmetic test patches.

- **License:** generated arithmetic test pattern; no third-party content. Same
  terms as the repository. Nothing binary is committed: tests generate the
  frames and encode them losslessly (FFV1 RGB, full range, sRGB transfer,
  BT.709 primaries), so the media path returns these exact bytes.
- **Content:** a neutral ramp (rows 0–15, for the banding bound), a 6-column
  grid of 16×16 patches — nine neutrals from 0.01 to 0.97, strong, medium and
  soft colors and three skin tones — and a neutral bar drifting 6 px per frame.
  `variant` 1 shifts the patch layout and mirrors the ramp (a second clip with
  the same statistics and different content, for shot matching).
- **Balanced by construction:** the adaptive solver leaves the reference
  unchanged (shadows reach 0.012, highlights 0.969, median luma 0.486, median
  saturation 0.30, neutral cast 0).
- **Degradations:** `cgaDegrade` applies a known exposure (linear-light stops),
  contrast compression (encoded black/white), desaturation (toward luma),
  white balance (`color.white-balance` gains) or `color.matrix` look.
  `writeCgaClip` can add a 440 Hz stereo PCM track for audio checks.

The tests are in
[`tests/integration/composition-color.test.ts`](../../../tests/integration/composition-color.test.ts).
