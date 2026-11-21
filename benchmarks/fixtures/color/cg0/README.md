# CG0 color fixtures, reference vectors and baselines

Milestone CG0 of the
[color grading engine plan](../../../../docs/color-grading-engine-plan.md#cg0--fixtures-reference-vectors-and-baseline):
numbers to check every later grading claim against, and a record of what the
engine does today, before a second (float) pipeline is added. Results are in
[CG0 results](../../../../docs/color-grading-cg0-results.json).

Everything here is generated, deterministic and license-free: arithmetic test
patterns and numeric reference data, no camera footage, chart scan or
third-party value table. Every file has its SHA-256 in
[`manifest.json`](./manifest.json) and is under 1 MiB.

## Contents

| Path                                     | What                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stills/*.png`                           | 8-bit encoded-sRGB RGBA stills: gray ramp (256), 16-step gray ramp, RGB ramps, hue sweep, saturation sweep, a synthetic 24-patch chart with stated linear values, 12 skin tones, a narrow noisy gradient (banding) and straight-alpha patches.             |
| `media/moving-disc.mp4`                  | 640×360, 24 fps, 48 frames, H.264 BT.709 limited: an orange disc on a stated trajectory over a textured, noisy background (keys, matte chatter, tracking). Encoded from exact RGB frames.                                                                  |
| `ramps/<transfer>.png`                   | A 128-sample scene ramp encoded through each of 19 transfer functions, as 16-bit RGB.                                                                                                                                                                      |
| `ramps/<transfer>-10bit.mkv`             | The same ramp as lossless 10-bit 4:2:2 (FFV1). Display transfers use limited-range video levels; log curves carry their own 10-bit code values as Y′ (camera convention), tagged limited range with no transfer tag. See `lumaConvention` in the manifest. |
| `vectors/transfer-functions.json`        | Encode/decode samples, published anchors and segment breaks for sRGB, BT.709, BT.1886, PQ, HLG, ACEScct, ARRI LogC3/LogC4, S-Log3, V-Log, Apple Log, Canon Log 2/3, RED Log3G10, Blackmagic Film Gen 5, DJI D-Log, F-Log/F-Log2 and N-Log.                 |
| `vectors/primaries.json`                 | Primaries, white points and RGB→XYZ matrices for 19 spaces, published matrices (IEC 61966-2-1, ACES AP0/AP1, BT.2087), luma coefficients and Bradford adaptation.                                                                                          |
| `vectors/input-transforms.json`          | Nine camera log + gamut → ACES2065-1 transforms end to end (OpenColorIO built-ins), with colour-science agreement.                                                                                                                                         |
| `vectors/cdl.json`                       | ASC CDL v1.2 cases (clamped) and OpenColorIO's unclamped style.                                                                                                                                                                                            |
| `vectors/lut-interpolation.json`, `luts` | Trilinear and tetrahedral interpolation of generated `.cube` LUTs (sizes 2, 5, 17, a non-unit domain, a 1D curve and, CG5, a 9-point cube behind a 32-entry Resolve shaper).                                                                               |
| `cg0-baseline.json`                      | What the media path, pixel lint and export do with these fixtures today.                                                                                                                                                                                   |

The colour-effect baseline (13 `color.*` effects on seven stills, both backends)
is in [`tests/visual/color-grading/`](../../../../tests/visual/color-grading/).

## Reference vectors

Each vector names its source document and the tolerance it is good for. The
float64 port tolerance (CG1) is 1e-12; published anchors carry the precision
they were published to (half a 10-bit code for integer code values); the
independent implementation (OpenColorIO, float32) is a cross-check, not a port
target. Two findings are recorded in the files rather than hidden:

- OpenColorIO's BT.709 curve is a C1-continuous "moncurve" built from gamma and
  offset; the published BT.709 constants (4.5, 0.018) are rounded, so the two
  differ by up to 5.3e-5 near the break.
- DJI publishes D-Log's encode and decode equations with independently rounded
  constants; they are not exact inverses (4.4e-7). A port reproduces each
  published equation.

The references (colour-science 0.4.6, OpenColorIO 2.4.2) run through `uv` for
development only and are never runtime dependencies.

## Commands

Run from the repository root with the pinned toolchain.

```bash
pnpm color:cg0-fixtures --check
```

```bash
pnpm color:cg0-vectors --check
```

```bash
pnpm color:cg0-baseline
```

```bash
pnpm test:browser:color-grading-cg0
```

The first regenerates all 49 fixture files and compares them byte for byte. The
second regenerates the vectors (it downloads the pinned Python packages on first
use). The third recomputes the media, lint and export record and fails on any
difference. The fourth renders the colour-effect baseline; it is part of
`pnpm test`. Write modes: no flag (fixtures, vectors), `--write` (media record),
`--write-cg0-baseline` (effects). A milestone that intentionally changes a
recorded outcome rewrites it and lists the change in its results file.

Byte-identical regeneration and the render hashes are recorded on darwin-arm64
with the pinned Node, FFmpeg and Chromium. Other platforms may differ (zlib,
libm, encoder builds); record a separate baseline there rather than treating the
difference as a regression.
