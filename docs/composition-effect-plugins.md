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
points. Drivers and expressions can target supported components. Pure
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
`color.gradient-ramp`, `color.invert` and `color.posterize`. See the generated
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
reciprocal-rounding differences at posterize boundaries. The permanent regression
covers all 32,895 valid nonzero-alpha byte pairs at six posterize level counts.

Curves, the remaining CE6 catalogue/dependency stages, linear-light composition
and full milestone acceptance are tracked in
[CE6 results](./composition-ce6-completion-results.json).
