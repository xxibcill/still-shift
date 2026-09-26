# Motion blur research for commerce effects

Date: 2026-09-26. This records the research basis. The user subsequently authorized implementation; see [effects implementation and verification](ecommerce-motion-effects-implementation.md).

## Decision

Use motion blur as an optional rendering effect for fast Translate. It has little visible value for the present gentle Float. A shadow responding to height is a more promising next experiment for Float. Preserve the Production palm-up format unchanged; demonstrate effects in Experimental fixtures first.

## What established tools do

- **Temporal motion blur:** average several render samples within one exposure. Shutter angle controls exposure duration; sample count controls approximation quality. Adobe also provides a shutter phase to offset the exposure, with phase equal to minus half the angle centering it on the frame. [Adobe motion blur](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/assorted-animation-tools/assorted-animation-tools.html)
- **Directional blur:** a spatial blur along a specified direction. Adobe describes it as an illusion of movement, symmetric around each pixel. It can approximate a rigid object moving at near-constant velocity but does not itself inspect the animation. [Adobe blur effects](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/blur-sharpen-effects.html)
- **Ghost trail / echo:** older positions remain visible behind the current position. Remotion explicitly distinguishes Trail from realistic camera exposure. It is an expressive duplicate-image effect, not a substitute for motion blur. [Remotion guide](https://www.remotion.dev/docs/motion-blur-guide)
- **Exposure placement and weighting:** Blender supports exposures starting, centered, or ending on a frame and a shutter curve. Its shutter length is expressed in frame units. [Blender Cycles motion blur](https://docs.blender.org/manual/en/latest/render/cycles/render_settings/motion_blur.html)

Remotion's current recommended motion-blur implementation uses an experimental HTML-in-canvas API, averages snapshots, centers a 180-degree shutter over half a frame, and clamps samples beyond composition boundaries. Its older CameraMotionBlur warns of color damage from layered blending. These are useful design references, not a reason to introduce Remotion or its experimental browser dependency into this Canvas renderer. [HTML-in-canvas implementation](https://www.remotion.dev/docs/motion-blur/html-in-canvas-motion-blur), [older implementation caveat](https://www.remotion.dev/docs/motion-blur/camera-motion-blur)

## Exposure and our actual motion

Derived from Adobe's shutter-angle definition:

```text
exposureSeconds = shutterAngle / (360 * fps)
blurLengthPixels ≈ speedPixelsPerSecond * exposureSeconds
```

The length approximation assumes velocity is nearly constant during the short exposure. Render temporal samples for exact easing behavior.

| Shutter     | Exposure at 24 fps | Exposure at 30 fps |
| ----------- | -----------------: | -----------------: |
| 90 degrees  |             1/96 s |            1/120 s |
| 180 degrees |             1/48 s |             1/60 s |
| 360 degrees |             1/24 s |             1/30 s |

**Local evidence and calculation:** `atoms/float.demo.json` uses 18 px total travel and two cycles over frames 0–239 at 30 fps. `buildFloatMotion` divides this into four approximately two-second smoothstep segments. For smoothstep `3u²−2u³`, peak derivative is 1.5, so peak speed is approximately `1.5 * 18 / 2 = 13.5 px/s` (13.73 for the rounded 59-frame segment). At 180 degrees, the expected peak blur is only about **0.23 px at 30 fps**, or **0.28 px at 24 fps** for the same duration. It will not materially improve the perceived float.

The existing Translate demo moves from x = −600 to x = 240: **840 px**, with out-cubic easing over 1.1 seconds. Peak speed for `1−(1−u)³` is `3 * distance / duration`: approximately 2291 px/s. A 180-degree exposure corresponds to roughly **38.2 px** of travel near peak speed at 30 fps, or **47.7 px** at 24 fps. A hypothetical 600 px move over the same interval would be approximately **27.3 px / 34.1 px** respectively. The exact first-frame result is smaller with a centered exposure clamped at the start. This demonstrates why the two motions need different effect defaults.

## Integration proposal

Current `evaluatePreparedNode` and `renderFrame` reject fractional frames. The tracks contain continuous easing, but an internal subframe evaluator is a prerequisite. Keep integer frame validation at the public export boundary and add a finite continuous time path for effect samples. Existing cinematic `ctx.filter = blur(...)` is isotropic focus blur and must remain separate.

Suggested first implementation:

1. An optional effect with `target`, `shutterAngle`, and `samples`; default disabled. Fixed centered exposure initially; add phase only when a real use case needs it.
2. Deterministic evenly spaced midpoint samples: `frame + ((i + 0.5) / samples - 0.5) * shutterAngle / 360`.
3. A reference renderer that renders complete sample frames and computes a normalized average. This is the clearest correctness baseline for transparency and occlusion.
4. Optimize to isolated target groups only after matching the reference where the target crosses foreground layers, has children, or changes opacity. Sample all affected transforms and opacity at the same time; do not move only the parent while freezing dependent properties.
5. Use the same implementation for preview and export. Cache decoded assets and static work; never make sample placement depend on playback history or previous frames.

Proposed comparison settings, **not established production defaults**: shutter 0/90/180 degrees and 8/16 samples on Translate. Check contour banding and cost before selecting a preset. Sample count is a quality/performance control, not a blur-strength control.

## Alpha, bounds, and timing requirements

**Source-over is not averaging.** Drawing N transparent copies each at opacity 1/N yields combined opacity `1 − (1 − 1/N)^N`, about 0.65 at N = 10 for coincident opaque pixels. That is an unwanted transparency change. Accumulate weighted premultiplied color and alpha, normalize weights, then composite the result once. This follows the source-over equations in the [W3C compositing specification](https://www.w3.org/TR/compositing-1/#simplealphacompositing). A full-frame opaque reference average avoids isolated-layer alpha confusion; any transparent optimization must match it for its supported cases. Define the color-space policy explicitly; Canvas color blending is not automatically a physically linear light integral.

**Bounds:** allocate the union of sampled transformed bounds, including filter support if another blur is composed. Do not clip to the unblurred product rectangle. Transparent cutouts need transparent padding; repeating product edge pixels creates artificial streaks. Final clipping at the output canvas boundary is intentional. Adobe documents that blur edge handling changes both color and transparency. [Blur edge behavior](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/blur-sharpen-effects.html)

**Cuts and loops:** clamp a finite shot to its own start/end; never sample across a hard cut. For a declared seamless loop, wrap within its explicitly defined period. The current float keys deliberately duplicate first and last poses, so define whether the period is the timeline frame count or last-key interval before enabling wrap. Test the seam for pose, velocity, and blur continuity. Do not round each subframe to an integer: a 180-degree shutter spans only half a frame and rounding would erase most of the effect.

**Product consistency:** the approved product asset remains intact and unchanged, but rendered label readability and color can still degrade during blur. Ensure a sharp settled hold, no blur when stationary, no decomposition, and no generative alteration. “Same source asset” is not sufficient visual QA.

## Acceptance evidence before adoption

- Stationary opaque and translucent swatches match an unblurred render; color and opacity stay stable.
- Fast Translate comparisons: off, 90, 180 degrees; inspect contour smoothness, label readability, and final sharp hold.
- Transparent bottle edge over light and dark backgrounds; no dark halos or clipped blur.
- Parent/child transforms, opacity, and a foreground occluder match the full-frame reference.
- Forward play, backward seeks, random frame order, and source-bundle reproduction yield the same frames.
- 24/30 fps exposure comparison; loop seam and shot boundaries; preview/MP4 parity.
- Record render cost at 1080×1350 for 8/16 samples before deciding the default.

## Local files inspected

- `packages/renderer-core/src/commerce-motion.ts`
- `packages/renderer-core/src/motion-easing.ts`
- `packages/renderer-core/src/commerce-component-demos.ts`
- `packages/renderer-core/src/commerce-floating.ts`
- `packages/renderer-core/src/prepared-scene.ts`
- `packages/renderer-core/src/illustrated-renderer.ts`
- `benchmarks/fixtures/ecommerce-motion/atoms/float.demo.json`
- `benchmarks/fixtures/ecommerce-motion/atoms/translate.demo.json`
