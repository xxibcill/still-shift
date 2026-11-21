# Composition effect plugins and color correction

The scene contract owns effect descriptors, validation, animation defaults and
property paths. The renderer pairs each descriptor with a GPU callback and an
optional Canvas reference callback. Register custom effects in each rendering
host before validating a document or preparing its preview/export.

```ts
import { defineCompositionEffect } from "@still-shift/scene-contract";
import { registerCompositionEffect } from "@still-shift/renderer-core";

const release = registerCompositionEffect({
  id: "example.invert",
  definition: defineCompositionEffect({
    version: "1.0.0",
    properties: {
      amount: { type: "scalar", default: 1, min: 0, max: 1 },
    },
  }),
  renderGpu(context, input, params) {
    const output = context.createSurface(input.width, input.height);
    context.pass(
      `uniform float amount;
       void main() {
         vec4 value = texelFetch(source, ivec2(gl_FragCoord.xy), 0);
         pixel = bytes(vec4(mix(value.rgb, vec3(value.a) - value.rgb, amount), value.a));
       }`,
      output,
      [input],
      { amount: params.amount as number },
    );
    return output;
  },
});

// Release when the host no longer uses the plugin.
release();
```

For installed applications, import from `still-shift/schema` and
`still-shift/renderer` respectively. Register the callbacks in every rendering
host; a composition JSON file contains the effect identity/parameters and does
not install executable plugins into the stock CLI.

GPU textures contain premultiplied RGBA in top-left image coordinates. A pass has
`source`, `backdrop`, `coverage`, then `input3`, `input4`, etc. samplers. The shader
header supplies `uv`, `pixel` and the byte-rounding function `bytes`. Uniforms are
finite scalar controls, vectors with 2/3/4 components, or 3×3 matrices. Kernels use
actual GPU passes; host code can compute deterministic control values.
`uploadBytes(surface, bytes)` uploads exactly `width × height × 4` premultiplied
RGBA bytes to an owned scratch surface; foreign surfaces and mismatched lengths
fail before upload.

Each callback owns its input snapshot and scratch surfaces for that invocation.
It can return the input or an unreleased surface created through its context;
the output must have the input dimensions. Input/output texture feedback and
foreign or released outputs fail explicitly. Scratch ownership is limited to
32 surfaces and 128 MiB, or four full-size frames for larger compositions.
Surfaces are released after success or failure. The target receives the output
only after callback and output validation succeed. Canvas callbacks use the same
ownership rules and can draw/read their owned Canvas surfaces. A missing optional
Canvas callback produces `comp-effect-unavailable` on that backend.

Descriptors support bounded animated scalars, colors and joint/separated 2D
points and curves with 2–16 ordered control points. Curve coordinates are bounded
to 0–1, endpoint x values are 0 and 1, and x values strictly increase. Whole-curve
keys retain the same point count; individual points support joint or separated
keys. Paths such as `box.effects[grade].curve[p1].y` address point components.
Drivers and expressions can target supported components. Pure
`expandBounds` callbacks receive the evaluated parameters and surface bounds;
return a finite ordered rectangle, or `null` when input bounds do not constrain
the output. `validateParams` checks pure cross-parameter invariants after drivers
and expressions, using an immutable snapshot; it must synchronously return no
value. Failures include the owning layer and root frame.

Effect versions enter evaluated graph identity and captured export metadata.
Change the semantic version when changing kernel behavior. Compiled validation
also follows registration revisions. An export host rejects captured effect
versions that differ from its installed definitions. Documents carry effect IDs,
parameters and versions; executable callbacks belong to each rendering host.

## Native color corrections

The current color slice provides `color.levels`, `color.tint`,
`color.hue-saturation`, `color.exposure`, `color.brightness-contrast`, `color.fill`,
`color.gradient-ramp`, `color.invert`, `color.posterize` and `color.curves`, plus
the CGA [grade corrections](#grade-corrections-cga) and the CG2
[float grade stage](#float-grade-stage-cg2). See the generated
[parameter reference](./composition-reference.md) for bounds and defaults.

Corrections evaluate encoded sRGB channels and preserve input coverage. Color
alpha scales correction strength. Gradient ramps project surface pixel centers
onto their animated start/end points; coincident endpoints use the start color.
Levels support reversed input/output ranges; coincident input endpoints produce
a threshold. Hue rotation uses HSL, saturation scales its saturation component,
and lightness moves toward white or black. Exposure multiplies by `2^exposure`,
adds offset and applies the inverse gamma. Positive contrast divides by
`max(0.001, 1 - contrast)`; negative contrast scales by `1 + contrast` around 0.5.

Both adapters reconstruct stored premultiplied input bytes, round straight
channels with explicit half-up ties, apply the correction, round corrected
straight bytes and preserve the original alpha. This rule avoids platform
unpremultiplication rounding differences at posterize boundaries. The permanent regression
covers all 32,895 valid nonzero-alpha byte pairs at six posterize level counts.

Curves interpolate linearly between controls and mix the result with the input
using `amount`. Ordering is validated after drivers and expressions resolve. The
GPU uses a deterministic 256-entry transfer table derived from control values;
all image pixels are transformed in a GPU pass without image readback. Canvas
uses the piecewise equation directly. Exhaustive byte parity includes tightly
spaced controls and sixteen-point curves.

The final CE6 audits and full milestone acceptance are tracked in
[CE6 results](./composition-ce6-completion-results.json).

### Grade corrections (CGA)

`color.matrix`, `color.white-balance` and `color.vibrance` correct flat SDR
footage ([color grading plan, CGA](./color-grading-engine-plan.md#cga--automatic-exposure-contrast-saturation-and-white-balance-for-flat-sdr-clips)).
They map straight encoded-sRGB bytes to bytes with integer arithmetic or a
host-built byte table, so Canvas, WebGL and Node-side measurement
(`gradeBytes`, `applyGradeToRgba`) give identical bytes. Neutral controls are an
exact identity. Straight bytes are recovered from stored premultiplied bytes
with the half-up rule above; alpha is preserved.

- `color.matrix` applies `(I + strength·(M − I))·rgb + strength·offset`. The nine
  coefficients are named output-then-input (`rr`, `rg`, … `bb`, −4…4) and offsets
  `ro`/`go`/`bo` (−1…1, normalized code values). The effective coefficients are
  quantized to 1/4096 and offsets to 1/4096 code value, then each channel is
  `clamp((Σ + 2048) >> 12)`. Look files apply through this effect.
- `color.white-balance` multiplies linear light by channel gains: temperature
  ±100 is a one-stop red/blue ratio (positive amber), tint ±100 moves green by
  half a stop (positive magenta), and the gains are normalized so a neutral
  keeps its BT.709 luminance. Each channel is a 256-entry table computed in
  float64.
- `color.vibrance` scales each channel's distance from encoded byte luma
  (weights 54/183/19 of 256) by `(1 + saturation)·(1 + vibrance·(1 − s)·(1 −
protectSkin·skin))`, with `s` the HSV saturation index `floor(255·chroma/max)`
  and `skin` a smooth 0–1 weight over 0–50° hues in the `r ≥ g ≥ b` sector
  (peak at 25°). Factors are bounded to 0–4 and tabulated in 1/4096 over
  256 saturation × 256 hue rows; channel output is
  `clamp((luma·4096 + (c·256 − luma)·factor + 2¹⁹) >> 20)`.

`pnpm test:browser:composition-grade-effects` checks 524,288 opaque colors per
case, all 32,895 premultiplied byte pairs and the color-effect layer/seek
matrix: every byte matches between backends and the integer reference.

### Float grade stage (CG2)

`grade.primary`, `grade.white-balance`, `grade.cdl` and `grade.rgb-mixer` are
the first operators of the [float grade stage](./color-grading-cg1-decisions.md)
([plan, CG2](./color-grading-engine-plan.md#cg2--float-grade-stage-and-primary-corrections)).
A run of consecutive `grade.*` effects on a layer is evaluated as one stage on
straight color, unclamped, and quantized once (round half up) on exit: one
fused fragment shader in float32 on WebGL2, and the float64 references of
`@still-shift/color-science` on Canvas. Values pushed above 1 or below 0 by one
operator are recovered by the next. Each operator saturates its output at
±10,000 (`GRADE_LIMIT`) and every power saturates there before it can overflow,
identically on both backends, so settings at the contract bounds stay finite
(no Infinity or NaN) and meet the parity rule; nothing inside ±10,000 is
clamped. Neutral operators are dropped, so a neutral
run leaves pixels unchanged on both backends. The working space is encoded sRGB,
as for `color.*`; white balance adapts in linear light. Parameters are flat
scalars (CG1 decision 3), so paths, drivers, expressions and keys work as for
any effect.

- `grade.primary`: per channel with the master combined (lift and offset add,
  gamma and gain multiply): `v + lift·(1 − v)` (black moves, white stays) →
  `v^(1/gamma)` (negative values unchanged) → `·gain` → `+offset` → contrast
  about `pivot` → `shadows`/`highlights` (a luma-weighted offset of up to ±0.25:
  shadows weight `1 − smoothstep(0, 0.6, Y)`, highlights `smoothstep(0.4, 1, Y)`)
  → `saturation` about Rec.709 luma → `hue` rotation about the luma axis in
  degrees → `colorBoost` (saturation scaled by `1 + colorBoost·(1 − s)`, `s` the
  HSV saturation, so soft colors move most). Midtone detail is spatial and is
  deferred to CG13.
- `grade.white-balance`: Bradford chromatic adaptation in linear BT.709 light
  from the stated illuminant to D65, BT.709's white, so a grey lit by that
  illuminant becomes R = G = B. `temperature` is the illuminant's correlated
  colour temperature (1667–25000 K, Kang et al. 2002 Planckian locus); `tint`
  ±100 moves it ±0.02 Duv in CIE 1960 uv, perpendicular to the locus (positive
  is greener, so the result turns magenta). Tint 0 is not the locus itself: D65
  lies about +0.0032 Duv above the 6500 K locus point, as daylight does, and
  the tint-0 line keeps that offset at every temperature, so 6500 K with tint
  0 is exactly D65 and the identity. A daylight-like light is neutralized at
  its temperature with tint 0; a light on the black-body locus (tungsten) needs
  tint ≈ −16 (within 0.1 of a code). Setting the temperature to the scene's
  light neutralizes it: 3200 K cools a tungsten scene. Unlike
  `color.white-balance` (channel gains), this keeps neutrals neutral under
  any illuminant. On the CG0 chart the closest `color.white-balance` setting
  differs as recorded in the [CG2 results](./color-grading-cg2-results.json)
  (`whiteBalanceComparison`), and cannot reach a 3200 K correction.
- `grade.cdl`: ASC CDL slope, offset, power (per channel) and saturation;
  `clamp` 0 (the default) is unclamped with the power skipped for negative
  values (OpenColorIO's no-clamp style), so a default CDL is neutral inside a
  run; `clamp` 1 is Release 1.2, clamped to 0–1 before the power and after
  saturation. Use `clamp` 1 for a CDL that must match other tools' ASC CDL
  output.
- `grade.rgb-mixer`: `color.matrix`'s parameters and formula
  (`(I + strength·(M − I))·rgb + strength·offset`) in float, without the 1/4096
  quantization.

`pnpm test:browser:color-grading-cg2` checks every operator, a five-operator
chain and a neutral run on the CG0 stills: Canvas equals the float64 reference
exactly on opaque pixels, WebGL2 is within one code value (owner decision 3),
repeated WebGL2 renders are byte-identical, gain 2 then 0.5 recovers exactly,
eleven neutral-sum passes lose no levels, the layer-kind/seek matrix keeps
backend parity, and a graded native-video composition exports with the effect
versions in its scene manifest. The CE6 cell `catalogue-float-grade` has its
own baseline file (`darwin-arm64-float-grade-1.json`).

### Curves and tonal ranges (CG4)

`grade.curves`, `grade.hue-curves` and `grade.tonal` join the float grade
stage ([plan, CG4](./color-grading-engine-plan.md#cg4--curves-and-tonal-range-tools)).
Curves use the ordinary `curve` parameter (2–16 points, endpoints at x = 0 and
x = 1, animatable points with a fixed count, x strictly increasing after
drivers and expressions). They are monotone cubic (PCHIP) splines: between two
control points a curve never leaves their range, and it matches SciPy's
`PchipInterpolator` within 1e-12. Each curve is baked on the CPU into a
1024-entry float32 table that both backends sample the same way (linear
interpolation, linear extrapolation beyond 0–1). Identity and flat curves
leave pixels unchanged.

- `grade.curves`: `red`, `green` and `blue` curves, then `master`; `lumaMix`
  moves the master curve from every channel (0) to luma only (1, chroma
  differences kept).
- `grade.hue-curves`: six curves in BT.709 Y′CbCr. The x axes are hue (the
  vectorscope angle, periodic: a hue curve's two ends must share y), luma Y′
  and saturation (chroma radius / 0.5). y = 0.5 is neutral: `hueVsHue` rotates
  by (y − 0.5) turns, `hueVsSat`, `lumVsSat` and `satVsSat` multiply the chroma
  radius by 2y, `hueVsLum` and `satVsLum` add (y − 0.5)·0.5 to Y′. Every curve
  reads the input, so each changes only its own dimension; hue-indexed curves
  fade in over a chroma radius of 0.02 (hue is undefined for greys).
- `grade.tonal`: shadow, midtone and highlight color offsets (`shadowR` …
  `highlightB`) and exposure in stops, weighted by Y′ with movable boundaries
  (`shadowEnd`, `highlightStart`, no higher than it) and a smooth `falloff`;
  then high and low soft clip with a C¹ knee (`softClipHigh` 1 and
  `softClipLow` 0 are off).

`pnpm test:browser:color-grading-cg4` checks the operators, a chain with CG2
operators and neutral settings on the CG0 stills (Canvas equals the float64
reference, WebGL2 within one code value, repeats byte-identical), measures
each hue/saturation curve's effect on the rendered sweeps with the CG3 scope
functions (only its own dimension moves, beyond 8-bit rounding), checks the
hue wrap on both backends and the layer-kind/animation/seek matrix. The CE6 cell
`catalogue-curve-grade` has its own baseline file
(`darwin-arm64-curve-grade-1.json`).

### LUTs and CDL interchange (CG5)

`grade.lut` applies a pinned `.cube` LUT inside the float grade stage
([plan, CG5](./color-grading-engine-plan.md#cg5--lut-and-cdl-interchange)).
The LUT is a composition asset; the effect binds it through its `lut` asset
slot:

```json
{
  "id": "look",
  "type": "lut",
  "path": "looks/warm.cube",
  "sha256": "sha256:…",
  "format": "cube",
  "inputSpace": "legacy-srgb",
  "outputSpace": "legacy-srgb"
}
```

```json
{
  "id": "warm",
  "effect": "grade.lut",
  "assets": { "lut": "look" },
  "params": { "intensity": 0.8 }
}
```

- Formats: `.cube` 1D (up to 65,536 entries), 3D (sizes 2–129, so 65³ and
  larger) with `DOMAIN_MIN`/`DOMAIN_MAX`, and Resolve's 3D-behind-a-1D-shaper
  form (`LUT_1D_INPUT_RANGE`, `LUT_3D_INPUT_RANGE`). Numbers are decimal. A
  range keyword for a table the file does not hold, or `DOMAIN_MIN`/`DOMAIN_MAX`
  together with an input range, is an error. Files are at most 128 MiB.
- Spaces: `inputSpace` and `outputSpace` must be declared. `legacy-srgb` (the
  display-referred working space, BT.709 footage display-equivalent) is the
  only value until CG7 adds working spaces; a LUT made for camera log or ACES
  input cannot be applied correctly before then.
- Before rendering, every LUT asset is read, size-checked, SHA-256-checked and
  parsed when the composition is loaded (`comp-lut-unreadable`,
  `comp-lut-checksum`, `comp-lut-invalid` with the `.cube` line). The page
  re-verifies the bytes it fetches.
- Evaluation: inputs are clamped to the table's domain (and the shaper's);
  3D tables interpolate tetrahedrally (`interpolation` 0, default) or
  trilinearly (1); `intensity` mixes the result with the input, and 0 drops
  the operator. Canvas samples the float64 table; WebGL2 reads the same table
  as float32 bit-exactly from a texture, in the same fused shader as the
  other `grade.*` operators. Preview and export use the same kernel.

`comp grade bake` writes a layer's grade stack as a `.cube` for other tools,
and `comp grade cdl-export` / `cdl-import` exchange `grade.cdl` values as ASC
CDL (`.cc`, `.ccc`, `.cdl`); see the
[CLI reference](../tools/still-shift-cli/README.md#grade-interchange-luts-and-asc-cdl).
A bake holds only pointwise operators (`grade.*`); any other effect refuses
to bake. Tolerance: a 33³ bake reproduces the stack within 2 code values
(65³ within 1) on the CG0 stills; a channel that crosses zero into a CDL power
puts a kink in one grid cell (up to 4.2·10⁻³ at 33³, still one code value).

`pnpm test:browser:color-grading-cg5` checks identity LUTs (pixels unchanged
on both backends), nine LUT cases on random, edge and graded stills (Canvas
equals the float64 reference, WebGL2 within one code value, repeats
byte-identical), animated intensity and 33³/65³ bakes. The CE6 cell
`catalogue-lut-grade` (a generated 17³ LUT, `lut-grade.cube`) has its own
baseline file (`darwin-arm64-lut-grade-1.json`).

## Native transitions

`transition.linear-wipe`, `transition.radial-wipe`,
`transition.venetian-blinds` and `transition.block-dissolve` remove source coverage
with animated `progress`: zero preserves the input, one clears it. `softness`
sets the transition band in normalized rank space; zero gives a hard boundary.
The remaining fraction is rounded to an 8-bit coverage value before multiplying
premultiplied channels. Canvas reconstructs stored premultiplied bytes before
applying coverage, then converts the rounded result back to straight image data.
The four transition kernels are version 1.0.1. Masks and mattes follow the effect stack.

Linear wipe projects pixel centers along the angle, normalized to the surface
rectangle. Venetian blinds repeat that projection at the authored pixel width.
Both use direction coefficients rounded to multiples of 1/256. Radial wipe
starts on the positive x ray, advances clockwise in image coordinates and
subtracts `angle`; `center` is normalized to surface dimensions. Angular rank
uses 65,536 bins with a one-millionth-turn positive tie offset; the center point
has angle zero. Full-turn angles are reduced before shader evaluation.
Block dissolve assigns a fixed rank to each authored pixel-size block using an
unsigned integer hash of block coordinates and seed. Sixteen-bit seed parts
preserve all supported integer seed bits in shader uniforms.

All four kernels run as actual GPU passes, with pure Canvas coverage references.
They apply to isolated drawable layers, groups, precomps and captured adjustment
backdrops. `transition.gradient-wipe` is also available with a scoped map-layer
input; see [displacement maps and gradient wipes](#displacement-maps-and-gradient-wipes).

## Native sampled blur

`blur.radial` averages centered angular samples about normalized `center`.
`blur.zoom` averages centered scale samples; `amount` ranges from −1 to 1.
`blur.lens` averages circular aperture samples using a fixed golden-angle disk
sequence and authored pixel `radius`. This aperture kernel is reusable by CE8
focus integration. All three accept 2–64 samples and preserve exact neutral
controls. Image edges have transparent padding.

Sample transforms are prepared once from controls: affine coefficients use
1/256 steps and translation/lens offsets use 1/16 pixel steps. Both adapters
interpolate stored premultiplied bytes with 1/16 bilinear weights, round each
sample to bytes, sum in ascending sample order, then round the average. GPU
shaders sample actual image textures; control preparation does not read image
pixels. Canvas reconstructs premultiplied input bytes for the same reference.
Lens bounds expand by radius plus one interpolation pixel when radius is
nonzero. Radial/zoom bounds conservatively cover the full target.

## Native geometric warps

`distort.transform` applies pixel `offset`, normalized `anchor`, nonuniform
`scale` and degree `rotation` to the captured surface. Negative scale mirrors
artwork; each scale magnitude must remain at least 1/256. Inverse coefficients
use 1/65,536 steps and translations use 1/131,072 pixel steps. GPU base-1024
arithmetic retains cancellation before flooring the source sampling grid to
1/16 pixel. Canvas evaluates the same control transform and byte sampler.

`distort.corner-pin` maps the surface rectangle to normalized `topLeft`,
`topRight`, `bottomRight` and `bottomLeft` points using an inverse projective
homography. The ordered quadrilateral must stay convex and noncollapsed; either
orientation is supported. Adjacent edge cross products must have magnitude
at least 0.000001. Host-prepared coefficients and intermediate mapping steps use
float32 on both adapters. Near-zero projective denominators give transparent
padding; out-of-image samples also have transparent padding.

Both effects use the premultiplied bilinear byte sampler, run before masks/mattes
and conservatively mark output bounds as unconstrained by source bounds.
Invalid enabled controls fail after final expressions with `comp-effect-params`,
including their owning layer, property path and root frame. Disabled effects
do not execute their cross-parameter validator.

## Seeded native fields

`stylize.fractal-noise` blends a colored fractal fill with the captured input
while preserving its coverage. `dark`/`light` color alpha and `amount` control
the blend; `contrast` and `brightness` adjust the normalized field.
`distort.turbulent` offsets source samples using two decorrelated fields, pixel
`amount` and transparent-padded premultiplied sampling. Zero amount preserves
the captured input exactly.

Both effects share a 32-bit coordinate/seed hash, 1–8 octaves and animated
`evolution`. Cell scale uses a reciprocal rounded to 1/1,048,576; pixel positions
and fractional evolution use 1/256 lattice steps. Each trilinear interpolation
rounds to an unsigned 16-bit field, and octaves sum in ascending order with
powers-of-two weights before an exact rounded normalization. Seed and signed
evolution epochs are uploaded as 16-bit parts, preserving their complete bits.

Turbulent amplitudes use 1/16 pixel steps. Signed offsets floor the field product
quotient to that sampling grid. The GPU corrects a floating quotient estimate
with unsigned integer product comparisons and handles signs explicitly. This
avoids relying on negative remainder or unspecified integer division rounding
in [GLSL ES 3.00](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf).
GPU kernels compute the field and sample image textures without image readback;
Canvas uses the independent integer reference. The permanent regression also
compares packed 16-bit field values and every possible field value at positive,
negative and neutral displacement amplitudes.

### Vignette and chromatic aberration

`stylize.vignette` uses a normalized center, elliptical radii in pixels and a
bounded soft shoulder. Its color/amount changes straight sRGB while retaining
source coverage. Geometry uses Float32 controls in the Canvas reference.
`stylize.chromatic-aberration` samples red at the signed offset and blue at its
negative, retaining the original green and coverage. Offsets use the common
1/16-pixel premultiplied sampling grid with transparent padding. Zero amount,
and a neutral chromatic offset, preserve the input exactly.

### Bulge and ripple

`distort.bulge` uses an elliptical polynomial falloff; `distort.ripple` uses a
radial sinusoidal displacement with optional exponential decay. Centers and
radii use 1/16 pixels; bulge normalized coordinates use 1/256; radial factors
use 1/4096. A bounded one-dimensional control table contains geometry factors,
never image pixels. Both adapters select identical control entries, multiply
signed coordinates in a fixed order, and sample the shared 1/16-pixel grid.
The GPU computes exact two-word squared distances and corrects its root estimate,
including full 8192-pixel diagonals. Neutral controls preserve the input exactly.

### Drop and inner shadows

`light.drop-shadow` and `light.inner-shadow` share a separable Gaussian with
three-sigma support, symmetric weights quantized to a mass near 4096, fixed
ascending sums and exact rounded normalization after each axis. Blur is bounded
to 128 pixels. Signed offsets use the common 1/16-pixel sampling grid. Drop
shadows composite behind the source; inner shadows blur complementary coverage
with opaque exterior padding and retain source alpha. Color alpha and opacity
control shadow strength. Zero opacity or color alpha preserves the input.

### Scoped layer inputs

`requiresLayers: ["map"]` declares named input slots. An instance binds them with
`inputs: {map: "source-layer"}` using static IDs in its composition scope. Both
plugin contexts expose `layers`, a read-only map of owned source snapshots with
the target’s dimensions. References retain source transforms, opacity, masks,
matte and effects at the matching scope/exposure clock. Hidden groups/precomps
can supply content without changing ordinary composition visibility.
Captured echo history uses the same visibility override as the current source;
source in/out points and descendant visibility still apply to each historical sample.

Missing or undeclared slots and cycles through inputs/mattes/groups fail with
`comp-effect-layer` or `comp-effect-cycle`. Null and adjustment layers are not
isolated source images. Graph construction permits at most 10,000 source visits
and 64 dependency levels, with `comp-effect-budget` on overflow. Staged source
surfaces and callback snapshots are released on success or failure. Scratch
ownership and size budgets still apply to input copies.

### Displacement maps and gradient wipes

`distort.displacement-map` and `transition.gradient-wipe` require the `map`
input slot. Channel selectors 0–3 choose straight RGBA; 4 chooses encoded-sRGB
luma with byte weights 54/183/19. Half-up unpremultiplication is explicit.
Displacement uses signed amounts on the 1/16-pixel grid, a byte midpoint and
map alpha as strength. Its signed quotient is corrected using exact integer
products on the GPU. Transparent maps and neutral amounts preserve the source.
Gradient wipe interpolates uncovered map pixels toward rank 1, supports inversion
and a soft band, and multiplies all premultiplied channels by quantized coverage.
Progress zero preserves the source and one clears it.

Gradient-ramp 1.1.0 projects pixels to canonical 16-bit ranks. Power-of-two
coefficient precision adapts to long gradients; gradients shorter than 1/256
pixel use an oriented midpoint step, and coincident endpoints use the start
color. Both backends use the same bounded straight-color control table. GPU
projection and image processing remain on the GPU; uploaded tables contain
controls, not image pixels. This policy prevents tiny projection differences
from being amplified by a downstream displacement map.

### Adjustment history and paint blur

Adjustment `time.echo` captures the upstream paint prefix at oldest-first
historical scope clocks, then paints the current backdrop over those samples.
Upstream effects, mattes, masks and echoes participate. Composition or isolated
surface backgrounds belong to those captures; opaque current input naturally
covers older samples. Declared source revisions can skip unchanged history.
At most 256 captures and 16 replay levels are allowed per graph, with
`comp-effect-budget` on overflow. Historical animated glyphs are prepared too.

On adjustments, `blur.primitive` filters the backdrop as a Gaussian at its stack
position. Drawable-layer primitive blur retains its per-draw semantics. GPU
precomp filtering captures offscreen input within the finite kernel support
before clipping output to the viewport. Padded targets must fit the GPU texture
limit and a bounded surface-memory budget; overflow has an explicit diagnostic.

### Gaussian and feather GPU completion

Gaussian image filters and transformed mask feathers use a mapped-sigma limit
of 532, matching [Skia's image-filter domain](https://skia.googlesource.com/skia/+/be1c1d62482d/src/effects/imagefilters/SkBlurImageFilter.cpp).
Above sigma 135, bounded centered downscales precede the existing integer blur
and a bilinear upscale; the policy follows the raster engine's
[progressive rescaling](https://skia.googlesource.com/skia/+/a471394b42dc43fe316364a94bc1312b9c82bf2d/src/core/SkImageFilterTypes.cpp).
Filtering remains on GPU-owned textures. Canvas rasterizes vector mask coverage
and its prefilter opacity; it never filters or reads back the GPU image. Lower
sigmas retain the existing image arithmetic. The earlier oversized-feather CPU
image-filter fallback has been removed.

### Recorded 1080p effect costs

The serial pinned Chromium 151 / SwiftShader run uses 1920×1080 native colored
stripes, complete synchronous readback, two warmups and five advancing frames.
Cold time includes first-frame shader and preparation work. Warm entries are
medians; cached staged map inputs are permitted. These are measured costs for the
[representative controls](../benchmarks/fixtures/composition/ce6/catalogue.ts),
not maximum-cost limits or CE6-P speed acceptance. The raw samples and environment
are in `benchmarks/results/composition-ce6-completion/effect-cost.json`.

| Effect                         | Canvas warm ms | SwiftShader cold ms | SwiftShader warm ms |
| ------------------------------ | -------------: | ------------------: | ------------------: |
| `blur.directional`             |           87.5 |               416.2 |               180.6 |
| `blur.gaussian`                |           10.2 |               233.7 |                56.3 |
| `blur.lens`                    |          687.6 |               365.5 |                60.1 |
| `blur.primitive`               |           24.3 |                44.2 |                24.0 |
| `blur.radial`                  |          518.9 |               243.7 |                44.8 |
| `blur.zoom`                    |          485.8 |               236.6 |                43.5 |
| `color.brightness-contrast`    |          208.3 |                80.1 |                16.4 |
| `color.curves`                 |          180.4 |                98.5 |                18.7 |
| `color.exposure`               |          310.6 |                87.2 |                17.6 |
| `color.fill`                   |          239.9 |                85.8 |                16.6 |
| `color.gradient-ramp`          |          175.3 |                96.6 |                18.1 |
| `color.hue-saturation`         |          264.2 |                87.6 |                17.7 |
| `color.invert`                 |          196.6 |                79.6 |                16.5 |
| `color.levels`                 |          305.6 |                91.1 |                18.2 |
| `color.posterize`              |          215.8 |                82.6 |                16.7 |
| `color.tint`                   |          215.2 |                87.0 |                17.3 |
| `distort.bulge`                |          112.4 |               116.5 |                22.7 |
| `distort.corner-pin`           |           97.6 |                97.3 |                18.7 |
| `distort.displacement-map`     |          318.1 |               172.9 |                26.5 |
| `distort.ripple`               |          113.0 |               117.2 |                23.4 |
| `distort.sine`                 |            6.4 |                68.4 |                14.0 |
| `distort.transform`            |           62.9 |                99.7 |                19.6 |
| `distort.turbulent`            |          600.1 |               127.9 |                26.9 |
| `light.drop-shadow`            |          498.1 |               188.1 |                75.9 |
| `light.glow`                   |           18.5 |               241.2 |                55.9 |
| `light.inner-shadow`           |          414.7 |               186.6 |                75.8 |
| `light.radial`                 |            5.5 |                78.7 |                14.4 |
| `light.sweep`                  |            9.9 |                74.0 |                21.4 |
| `particles.rise`               |            1.6 |                69.6 |                16.0 |
| `stylize.chromatic-aberration` |          201.1 |               110.3 |                23.4 |
| `stylize.fractal-noise`        |          424.3 |               103.0 |                20.2 |
| `stylize.grain`                |            2.8 |                79.5 |                12.5 |
| `stylize.vignette`             |          115.2 |                89.6 |                17.0 |
| `time.echo`                    |            2.5 |                49.9 |                13.0 |
| `transition.block-dissolve`    |           57.3 |                86.1 |                16.1 |
| `transition.gradient-wipe`     |          257.3 |               162.2 |                23.3 |
| `transition.linear-wipe`       |           68.3 |                89.8 |                16.8 |
| `transition.radial-wipe`       |           67.0 |                88.7 |                17.2 |
| `transition.venetian-blinds`   |          119.0 |                84.8 |                16.8 |
