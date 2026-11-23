# Color grading CG7: scene-referred input and working space

Date: 2026-11-23. Milestone
[CG7](./color-grading-engine-plan.md#cg7--scene-referred-input-and-working-space)
of the color grading engine plan. Numbers are in the
[CG7 results](./color-grading-cg7-results.json). Software measurements are not
visual acceptance.

Owner decisions (2026-11-23): color management is **opt-in per composition**;
a color-managed composition grades in **ACEScct** by default, with ACEScg as
its linear companion. Camera priority: none; the nine `validated` input
transforms are supported and the seven `unavailable` ones keep refusing.

## 1. Where the pixels are today

A media layer's prepared frame is an 8-bit encoded-sRGB PNG, decoded in the
page to an `ImageBitmap`, drawn with the layer's transform into a
composition-sized RGBA8 surface (the `isolate` op), and only then do the
layer's effects run, `grade.*` runs included (CG2: read RGBA8, float inside,
quantize once on exit). Compositing is RGBA8 in encoded sRGB or, with
`colorSpace: "linear-srgb"`, in 16-bit linear light over 8-bit storage.

So a 10-bit log value is lost twice before any grade sees it: at decode (8
bits) and at the draw (8-bit surface). Two ways to keep it:

1. **A float compositor**: every surface in a color-managed composition is
   RGBA16F/32F in the working space and the display transform runs once at
   the end. Every effect, draw path, cache and the linear blender would need a
   float variant on both backends — most of `renderer-core`.
2. **A source stage**: scene-referred media are converted, and their leading
   pointwise grade is applied, at source resolution on the high-bit decoded
   frame, before the draw. The result is an ordinary display-referred frame
   for the existing pipeline.

**Decision: 2.** It is the only one that fits the milestone, keeps every
existing path untouched, and grades at source resolution (a 4K clip in a 1080p
composition is graded at 4K). Option 1 stays possible later; nothing below
prevents it.

## 2. Contract

**Media color descriptor** (`color` on video and sequence assets). Stream
metadata, ffprobe names, verified by the probe as today:

| Field       | Values                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `primaries` | `bt709`; new: `bt2020`, `smpte432` (P3-D65), `unspecified`                                                                |
| `transfer`  | `bt709`, `iec61966-2-1`; new: `smpte2084` (PQ), `arib-std-b67` (HLG), `unspecified`                                       |
| `matrix`    | `bt709`, `smpte170m`, `gbr`; new: `bt2020nc`                                                                              |
| `range`     | `tv`, `pc`                                                                                                                |
| `encoding`  | new, optional, author-declared: a camera input transform id (`sony-slog3-sgamut3`, …). Metadata rarely names a log curve. |

The new values and `encoding` are accepted **only in a color-managed
composition**; a legacy composition accepts exactly the CG6 set, so its
validation, decoding and pixels are unchanged. An `unavailable` encoding is
rejected with its reason. Sequences stay 8/16-bit sRGB PNG (CG7 adds no
sequence encodings).

**Contradiction diagnostic.** With `encoding` declared, the declared curve and
gamut win and every stream tag that says otherwise is reported as a warning
`comp-media-color-declared` (for example "stream transfer `bt709`, declared
`sony-slog3-sgamut3`"); cameras often tag log as BT.709, so this cannot be an
error. Without `encoding`, the descriptor must equal the stream, as today
(`comp-media-color` error).

**Camera range convention** (CG0 `lumaConvention`): a camera curve's input is
the recorded code value / 1023, so a declared camera encoding decodes Y′CbCr
with full-range equations even though such files are tagged `tv` (S-Log3 18%
grey is Y′ 420, "41% IRE"). The chroma scale of real camera files is not
verified without footage (CG15).

**Composition** `colorManagement?: { workingSpace?: "acescct" | "acescg" |
"linear-bt709" }`. Absent: `legacy-srgb`, today's behavior, byte-identical.
Present without `workingSpace`: ACEScct (owner default).

**`grade.color-space-transform` 1.0.0**: `from`, `to` (integer codes: 0
ACEScct, 1 ACEScg, 2 ACES2065-1, 3 linear BT.709, 4 sRGB-encoded BT.709, 5
linear BT.2020, 6 linear P3-D65); white changes use Bradford, as the
OpenColorIO utility transforms in the CG0 vectors. `from == to` is neutral and
dropped. It is pointwise and allowed in any composition.

**LUT assets**: `inputSpace` and `outputSpace` accept `legacy-srgb` (CG5) and
the seven spaces above. `grade.lut` converts working → `inputSpace` before the
table and `outputSpace` → working after it; a space equal to the working space
(`legacy-srgb` and `srgb` are the legacy working space) adds no conversion, so
every CG5 LUT render is unchanged.

## 3. Working space in the render graph

In a color-managed composition:

- **Display-referred layers** (text, shapes, images, solids, 8-bit SDR media
  under D-colour) render exactly as in a legacy composition.
- **Every grade run** converts on entry display → working (sRGB decode,
  BT.709 → AP1 with Bradford D65 → ACES white, then the working curve) and on
  exit working → display (the inverse, **clipped to 0–1** before the sRGB
  encode), then quantizes once. A run whose operators are all neutral stays an
  exact copy. Legacy compositions run no conversion.
- **Video layers** take the **source stage**: every video source in a
  color-managed composition, whatever its metadata (an 8-bit SDR clip
  round-trips exactly). 16-bit decoded frame → input transform → working → the
  layer's **leading pointwise grade run** → working → display → RGBA8 frame,
  which the layer then draws normally. Pointwise means every `grade.*` except
  a `grade.key` with a window, a matte or matte finesse (neighbourhood); the
  stage stops before the first such key, and that key, the rest of the run and
  every later effect run after the draw on display-referred values. Sequences
  are sRGB PNGs by contract and stay display-referred (8-bit, as today).
- **Input transforms** (all to linear AP1): camera encodings by their validated
  transform (curve, gamut, CAT02 or Bradford to ACES2065-1, then AP0 → AP1);
  display transfers (`bt709`, `iec61966-2-1`) by the sRGB decode (D-colour:
  players show them as sRGB) and the tagged primaries; PQ by the ST 2084 EOTF
  with 1.0 = 100 cd/m²; HLG by the BT.2100 inverse OETF and the reference OOTF
  at a 1000 cd/m² nominal peak (γ 1.2), 1.0 = 100 cd/m².
- **Display transform** for CG7 is colorimetric only: AP1 → BT.709 (Bradford),
  clip to 0–1, sRGB encode. No tone mapping or gamut compression: scene values
  above display white and out-of-gamut colors clip. CG8 replaces this step with
  the output transform; the clip is documented as the CG7 view.

Both backends run the source stage in the float64 reference on the CPU, so
they agree byte for byte; a GPU source stage is later work.

## 4. Compositing rule

Every layer leaves the working space at its own boundary: what reaches the
compositor is display-referred, clipped, encoded sRGB — as every legacy layer
is. Masks, mattes, opacity, blend modes and the composition's `colorSpace`
(`srgb` or `linear-srgb` blending) are unchanged. For `normal` and `add`
blending in `linear-srgb`, this equals compositing the clipped layers in
ACEScg (a linear blend commutes with the AP1 ↔ BT.709 matrix). Consequences,
recorded rather than hidden: a dissolve between two log clips mixes their
display-referred results; highlights above display white are already clipped
when layers mix; an adjustment-layer grade sees the clipped composite.

## 5. Cache format and memory budgets

- **Prepared frames.** Video in a color-managed composition prepares
  canonical 16-bit RGBA PNGs (row filter 0, no color chunks, opaque) of
  **encoded** source RGB under a separate decoder identity
  `composition-media-decoder-scene-1`; legacy frames, their decoder version and
  cache keys are unchanged. FFmpeg only lays the source out as 4:4:4 planes at
  its own depth (chroma upsampled, luma untouched); the Y′CbCr → RGB matrix and
  range run in float64 from the published equations. FFmpeg's own RGB64
  output was rejected: it widens 10-bit codes by a shift (1023 → 65472), so
  codes above 512 come back one low. Samples are stored over [−0.25, 1.25]
  (step 2.3e-5, under half a 12-bit code) so matrix results outside 0–1
  survive.
- **Disk.** Counted in `decodedCacheBytes` by actual bytes, as today.
- **Live frames.** A 16-bit frame is held as `Uint16Array` RGBA: 8 bytes per
  pixel, counted in `decodedFrameBytes`. A 4K UHD frame is 63.3 MiB; the
  128 MiB default holds a blended pair. The required set is checked before any
  decode, so an over-budget set fails before allocation.
- **Source stage.** One RGBA8 output per drawn frame (31.6 MiB at 4K),
  allocated through the managed pixel budget (fails before allocation); the
  page uploads it as an image texture, counted in `decodedTextureBytes` as
  today.
- **Node decode.** FFmpeg converts to `rgba64le` per frame (8 bytes per pixel,
  transient), bounded by `maxWidth`/`maxHeight`.

## 6. Checks and fixtures

- Transforms: every validated input transform round-trips and matches its CG0
  OpenColorIO vectors; working spaces and the display transform match CG0
  vectors (`aces-ap1-to-bt709-bradford`, ACEScct); PQ and HLG meet BT.2408
  reference points (203 cd/m² at PQ 58% and HLG 75%); `unavailable` ones are
  rejected.
- 10-bit lossless: each CG0 10-bit ramp (`ramps/*-10bit.mkv`) decoded to the
  16-bit cache → input transform → neutral grade → inverse → re-encoded at 10
  bits recovers every code value (bound: 0 code values).
- Legacy byte-identity: composition baselines, CG0/CG2/CG4–CG6 groups and the
  media groups unchanged.
- Memory: a generated 4K 10-bit fixture through preparation and the page within
  the limits above; an over-budget required set fails before decode.
- Contradiction: a declared encoding on a stream tagged otherwise warns.
