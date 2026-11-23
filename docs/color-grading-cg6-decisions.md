# Color grading CG6: key contract decision

Date: 2026-11-21. Milestone
[CG6](./color-grading-engine-plan.md#cg6--keys-qualifiers-windows-and-matte-finesse)
of the color grading engine plan. Numbers are in the
[CG6 results](./color-grading-cg6-results.json). Software measurements are not
visual acceptance.

## The question

A key limits a grade to selected colors or regions: qualifier × windows ×
external matte, refined by matte finesse. Where does it live in the contract?

1. **Keyed variants of `grade.*`**: key parameters on every grade operator.
2. **A key block on the fused grade run**: one key for a whole run.
3. **A separate key effect** that scopes the grade operations after it.

## Spike

Measured against the CG2–CG5 contract and renderer (`main` c3553e60):

| Criterion                                   | 1. Keyed variants                                                                                                                                         | 2. Run key block                                                                 | 3. Key effect                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Existing effects unchanged                  | No: about 50 key parameters on each of 8 effects, 8 version bumps (`grade.*` 1.0.0 → 1.1.0), every CE6 grade cell and the CG2/CG4/CG5 vectors re-recorded | Yes                                                                              | Yes                                                                       |
| A place in the contract                     | Effect params                                                                                                                                             | None: a run is a renderer grouping of consecutive effects, not a contract object | Effect params                                                             |
| One key shared by several operations        | No: each operation repeats the key and recomputes it (finesse passes per operation)                                                                       | Whole run only                                                                   | Yes: every operation up to the next key                                   |
| Key taken from the operation's input        | Per operation                                                                                                                                             | Run input only                                                                   | The value entering the key, that is the input of the operations it scopes |
| CG9 node graph (fallback: lower to effects) | Node key copied onto each operator                                                                                                                        | Not expressible per node                                                         | A serial node lowers to `grade.key` followed by its operators             |
| Neighbourhood finesse in the fused stage    | Per keyed operator                                                                                                                                        | Once per run                                                                     | Once per key                                                              |

**Decision: option 3**, one new effect `grade.key` 1.0.0 in the float grade
stage. It is one CG9 node's key: a serial node `{ key, operators }` lowers to
`grade.key` followed by the operators, which is how CG1 decision 3 already
plans to lower the graph.

## Semantics

- **Scope.** A `grade.key` applies to the `grade.*` operations after it in its
  grade run, up to the next `grade.key` or the end of the run (the first effect
  that is not a float grade effect, or has an effect window). Operations before
  the first key are not keyed. A key with every control at its default selects
  everything (key 1), so it ends the previous key's scope.
- **Input, not output.** The key is computed from the value entering the key,
  which is the input of every operation it scopes; the operations' output never
  feeds the key. Tested by keying an operation that would move pixels out of
  the qualifier's range (CG6 results, `keyFromInput`).
- **Mix.** Per pixel, with input `a` and the scoped operations' output `b`:
  key 0 → `a`, key 1 → `b`, otherwise `a + (b − a)·key`, in the run's float.
  A pixel that no operation touched (every operation keyed at 0) leaves the run
  as its source bytes, so pixels outside a key are byte-identical on any alpha.
- **Key.** `key = clamp(gain · (Q · W · G · M) + offset, 0, 1)`:
  - `Q`, the qualifier matte after finesse (1 without a qualifier);
  - `W`, the shape window's coverage (1 without one, `1 − W` with
    `windowInvert`);
  - `G`, the linear gradient window (1 without one);
  - `M`, the external matte (1 without one).
- **Views.** `view` 1 shows the key as gray, 2 highlights it (the scoped
  result where keyed, mid gray elsewhere, mixed by the key), 3 shows it in
  high contrast (white wherever the key is above 0). A view replaces the run's
  output from that key on; later operations in the run are not applied.

## Qualifiers

Evaluated on the key's input clamped to 0–1 (encoded working space), selected by
`qualifier`:

- **HSL** (1): ported from chroma-node `evaluateQualifierMask` (hexcone hue,
  HSL saturation, BT.709 luma; ranges with outward smoothstep softness),
  checked against analytic masks on the CG0 hue and saturation sweeps before
  trusting it. Its parameter names are `comp probe`'s qualifier suggestion
  names, so a probe's suggestion is a key's parameters.
- **RGB** (2): a range per channel, one softness.
- **Luma** (3): the HSL qualifier's luma range alone.
- **Sampled 3D** (4): up to eight picked sample colors; the key falls from 1
  within `sampleRadius` of the nearest sample to 0 at `sampleRadius +
sampleSoftness`, measured as Euclidean distance in OKLab (perceptual).

## Windows and the external matte

- **Ellipse and rectangle** (`window` 1, 2) are conveniences that produce layer
  mask data: the renderer builds the same Bézier path as a shape layer's
  ellipse or rectangle, in the key's layer space (its owner, or the `space`
  layer), and rasterizes it with the layer-mask rasterizer, feather and
  expansion included. Animatable through the parameters.
- **Existing layer masks and shape paths**: bind the layer that carries them
  to the key's optional `matte` slot in alpha mode; the layer is rendered by
  the existing pipeline (its masks, shapes and track matte included).
- **Linear gradient** (`gradient` 1): 0 at `gradientStart` to 1 at
  `gradientEnd` in layer space, linear. It has no edge, so it is computed
  directly rather than rasterized as a mask (a deviation from "the same mask
  data"); the formula is exact on both backends.
- **External matte**: the optional `matte` layer slot (a new
  `optionalLayers` field on effect definitions; required slots keep
  `requiresLayers`). `matteMode` 0 reads alpha, 1 reads BT.709 luma of the
  layer over black, that is of its premultiplied color, so a translucent
  pixel counts in proportion to its alpha (a depth image, a luma matte or a
  matte sequence; opaque sources read their own luma), then a range with softness (`matteLow`, `matteHigh`, `matteSoftness`) and
  `matteInvert`.

## Matte finesse

Applied to the qualifier matte, in this order: black and white clip (levels),
denoise (`denoise` passes of a 3×3 median), clean black (opening of radius
`cleanBlack`), clean white (closing of radius `cleanWhite`), shrink or grow
(erosion or dilation of radius `|shrinkGrow|`), blur (the existing Gaussian
kernel of `blur.gaussian` and mask feather: three box filters, σ = `blur`)
with `inOutRatio` (−1 keeps the softness inside the edge, +1 outside), then
`invert`. Morphology uses a square structuring element (separable and exact);
edges clamp. Gain and offset apply to the combined key.

## Precision

The float64 reference in `@still-shift/color-science` is authoritative (owner
decision 3). The Canvas backend runs it; WebGL2 evaluates the qualifier inside
the fused shader and, when the key needs neighbouring pixels, writes the
qualifier matte as float32 bits into RGBA8 textures for the finesse passes
(as CG5 does for LUT tables), so no float surface is allocated.
