# Color grading CG1: contract decisions

Date: 2026-11-20. Milestone
[CG1](./color-grading-engine-plan.md#cg1--color-science-core-and-contract-design)
of the color grading engine plan. Numbers are in the
[CG1 results](./color-grading-cg1-results.json); spike sources and outputs are in
[`research/color-grading-cg1/`](../research/color-grading-cg1/). All
measurements are on darwin-arm64 with the pinned Chromium 151 / SwiftShader
renderer. Software measurements are not visual acceptance.

## 1. Float grade stage

**Decision.** A run of `grade.*` operations on a layer evaluates in **RGBA32F**
intermediates on WebGL2 (float64 on the CPU/Canvas path), on **straight
(unpremultiplied) color** with coverage carried unchanged, and is **quantized
once on exit** to the existing premultiplied RGBA8 surface with round-half-up.
**No dither** by default. Existing `color.*` effects and every baseline stay on
the 8-bit path unchanged.

**Evidence** (`float-stage-spike.json`):

- The pinned renderer exposes `EXT_color_buffer_float`,
  `EXT_color_buffer_half_float`, `OES_texture_float_linear` and
  `EXT_float_blend`; RGBA32F and RGBA16F framebuffers are complete;
  `MAX_TEXTURE_SIZE` 8192. The device already pools RGBA32F surfaces
  (`webgl-device.ts`, 16 bytes per pixel, charged to the managed pixel budget).
- A 4-pass chain (primary with `pow`, CDL with `pow`, an ACEScct exposure with
  `log2`/`exp2`, primary) on all seven CG0 stills:
  - RGBA32F intermediates: worst difference from the float64 reference 1 code
    value on 32 of 703,104 channels (hue sweep), largest float difference
    2.7e-6;
  - RGBA16F intermediates: also within 1 code value, but up to 26,176 differing
    channels on the chart and float differences up to 1.6e-3, which a longer
    stack would push past the bound. RGBA16F is rejected for intermediates.
- Gain 2 then gain 0.5: an RGBA8 intermediate loses up to 127 code values;
  RGBA16F and RGBA32F recover exactly (0).
- Eleven stacked corrections whose product is neutral, on the 256-code ramp:
  RGBA8 intermediates keep 57 distinct levels (max error 12); RGBA32F keeps all
  256 (error 0). This is the CG2 banding check's mechanism.
- The GPU's float → RGBA8 conversion agrees with round-half-up at exact ties on
  all 256 samples, so GPU and CPU quantization agree.
- Two full runs produced byte-identical float readbacks.

**Memory.** Per surface: 1080p RGBA32F 31.6 MiB (RGBA8 7.9 MiB); 4K UHD
RGBA32F 126.6 MiB. The managed pixel budget per export worker is 7.375 GiB at
one worker and 1.75 GiB at four. A grade run needs an input and a ping-pong pair
(three RGBA32F surfaces: about 380 MiB at 4K), which fits even at four workers,
but CG2 must reserve them through `createRenderStorage` so an over-budget stack
fails before allocation, and should fuse consecutive pointwise operators into
one pass (CG9's compiler, earlier where cheap) to keep the count at three.

**Dither.** Not by default: quantizing once already keeps every level of the
8-bit ramp, dither would make a neutral grade differ from its input and break
byte-identical comparison with the legacy path. An optional deterministic
ordered dither is a CG8 delivery option for high-bit output, not a CG2 feature.

**Fallback considered.** RGBA16F (half the memory) — rejected on the precision
measured above.

**As built in CG2 (PR #77 second review, 2026-11-21).** Every CG2 operator is
pointwise, so a run is one fused fragment shader: intermediates are float32
registers (the precision measured above for RGBA32F), the stage reads and
writes the layer's existing RGBA8 surfaces, and no float surface is
allocated. The `createRenderStorage` reservation above therefore has nothing
to reserve yet; it applies when an operator inside a run needs neighbouring
pixels (CG13 texture operations or later) and the run must be split across
RGBA32F surfaces. See the CG2 results, `delivered.deviations`.

## 2. Parity rule for the float stage

**Decision (owner decision 3, approved 2026-11-20).** The float64 reference in
`@still-shift/color-science` is authoritative. The WebGL2 float stage must match
it within **one 8-bit code value** on the CG0 fixture set, and repeated renders
on one machine and toolchain must be **byte-identical**. The Canvas backend runs
the float64 reference itself, so it is exact by construction. Separable
per-channel operations may be baked into CPU-computed 1D tables where that buys
exactness. Existing effects keep their current parity: byte-exact for the three
CGA effects, within one code value for the original ten (CG0 measured 21 of 273
renders at 1).

**Evidence.** The spike chain above meets the bound with RGBA32F (worst 1, 32
channels) and is byte-identical on rerun. The float64 core passes 85 vector
tests at the CG0 tolerances (1e-12 for ports of published equations).

**Consequence for CG2.** Each `grade.*` operator's browser test asserts "≤ 1
code value from the float64 reference on all CG0 stills, both backends" and
"two renders byte-identical", and records how many channels sit at 1.

## 3. Structured effect parameters

**Decision.** CG2–CG6 operators use **flat scalar parameters** (for example
`liftR`, `liftG`, `liftB`, `liftMaster`), exactly as `color.matrix` does today
(`rr` … `bo`, `strength`). No contract change is needed for them. The nested
`grade-1` document of CG9 starts from the plan's **fallback**: the builder
lowers a graph to stacked atomic effects and adjustment layers. A nested
parameter type is revisited at CG9 entry only if lowering cannot express a
needed graph (parallel or layer mixing of keyed nodes).

**Evidence** (`structured-params-spike.json`):

- `card.effects[grade].rr` and `.strength` resolve as scalars; a driver
  targeting `card.effects[grade].strength` validates and evaluates (0, 0.53, 1
  at frames 0, 12, 23).
- `card.effects[grade].lift`, `.lift.r` and
  `.nodes[skin].primary.gain` are rejected with `comp-path-property` ("does not
  name an effect parameter").
- A nested parameter type would touch the eight files that branch on the effect
  property union (contract schema, path resolution, expressions and their
  checker, the evaluator, color-effect rendering, the builder's
  property access and the lab's key editor).

**Fallback taken.** Lowering for CG9. **Rejected for now:** a `group` property
type in CG1 (eight-file contract change with no CG2–CG6 operator that needs
it).

**Parameter bounds (PR #77 second review, 2026-11-21).** The plan's "types and
ranges (as zod schemas and bounds)" are the `grade.*` effect definitions in
`@still-shift/scene-contract`; their `min`/`max` are the only authoring bounds.
chroma-node's `PRIMARY_RANGES` (lift ±0.5, gamma 0.1–3, gain 0–4, offset ±0.5,
contrast 0–2, saturation 0–2) were ported in CG1 but no effect read them, and
they disagreed with `grade.primary` (lift, gamma, gain and offset per channel
and master: lift ±1, gamma 0.1–10, gain 0–16, offset ±1; contrast 0–4,
saturation 0–4). They are removed from the package. chroma-node's lift
range also does not carry over: CG2 redefines lift as `v + lift·(1 − v)`.
