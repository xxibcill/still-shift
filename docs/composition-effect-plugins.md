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
the output. Failures include the owning layer and root frame.

Effect versions enter evaluated graph identity and captured export metadata.
Change the semantic version when changing kernel behavior. Compiled validation
also follows registration revisions. An export host rejects captured effect
versions that differ from its installed definitions. Documents carry effect IDs,
parameters and versions; executable callbacks belong to each rendering host.

## Native color corrections

The current color slice provides `color.levels`, `color.tint`,
`color.hue-saturation`, `color.exposure`, `color.brightness-contrast`, `color.fill`,
`color.gradient-ramp`, `color.invert`, `color.posterize` and `color.curves`. See the generated
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

The remaining CE6 catalogue/dependency stages, linear-light composition
and full milestone acceptance are tracked in
[CE6 results](./composition-ce6-completion-results.json).

## Native transitions

`transition.linear-wipe`, `transition.radial-wipe`,
`transition.venetian-blinds` and `transition.block-dissolve` remove source coverage
with animated `progress`: zero preserves the input, one clears it. `softness`
sets the transition band in normalized rank space; zero gives a hard boundary.
The remaining fraction is rounded to an 8-bit coverage value before multiplying
premultiplied channels. Masks and mattes follow the effect stack.

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
backdrops. Gradient wipe follows the remaining scoped-input dependency work.

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
