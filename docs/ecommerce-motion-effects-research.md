# E-commerce motion effects: research and exploration plan

**Date:** 2026-09-26
**Status:** Research completed; the user subsequently requested all effects. See the [Experimental implementation and verification](ecommerce-motion-effects-implementation.md). No effects are promoted to Production.
**Context:** The atomic component foundation is complete. The next question is which effects improve Translate and Float while preserving the supplied product.

## Recommendation

Explore **temporal motion blur for fast Translate**, **a height-linked shadow for studio Float**, then **small coordinated drift/tilt**. Compare each independently against the current baseline before combining them. Lighting, focus and atmosphere form a later palette for specific creative briefs.

These priorities are design judgments based on our current scenes and renderer. The sources establish how professional tools implement these techniques; they do not establish popularity rankings or prove that an effect improves sales or attention.

## A useful vocabulary

- **Visual component:** what is visible — Product Layer, Shadow, Text Block, Path.
- **Motion behavior:** how a property changes — Float, Translate, Fade, overshoot, drift.
- **Rendering effect:** how those moving layers are imaged — motion blur, glow, focus blur.
- **Relationship:** how elements respond together — product height drives its shadow; an annotation follows a target.

An effect should have an explicit purpose: convey speed, height, weight, material, depth or atmosphere. A floating product can communicate suspension through its relationship to a surface. Adding more movement alone does not create a product story.

## Established techniques and their fit here

The first two columns describe techniques documented in the linked primary sources. The final column is our proposed art direction, not a claim made by those sources.

| Technique                         | What it does                                                                                                                                                                                                                                       | Fit for our product motion                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Temporal motion blur**          | Integrates positions during a shutter exposure, controlled by exposure length and sampling. [Adobe](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/assorted-animation-tools/assorted-animation-tools.html)                 | Strong candidate for fast Translate. Should disappear during the sharp reading hold.                                                                             |
| **Directional blur**              | Smears pixels along a chosen angle; it does not derive the exposure from our motion. [Adobe](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/blur-sharpen-effects.html)                          | Useful stylized shortcut; cannot assume it matches curved motion, rotation or changing opacity.                                                                  |
| **Overshoot and settle**          | Carries motion past its endpoint and lets it decay; Adobe's example responds to keyframe velocity. [Adobe](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-examples/expression-examples.html)                       | Small optional entrance accent. It changes the behavior, so evaluate separately from blur. Current Translate already eases out.                                  |
| **Secondary drift / rocking**     | Smooth procedural variation can affect position or rotation. [Adobe animation tools](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/assorted-animation-tools/assorted-animation-tools.html)                                | A bounded sideways arc or tiny in-plane tilt could soften the regular vertical Float. Preserve the entire rigid product image.                                   |
| **Animated shadows**              | Alpha-derived shadow effects expose opacity, distance and softness controls. [Adobe](https://helpx.adobe.com/nz/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/perspective-effects.html)                                | Couple a separate shadow to Float height on a flat authored surface. A hand needs a receiving mask/geometry; an ellipse cannot automatically conform to fingers. |
| **Focus / depth of field**        | Camera focus distance and aperture determine which depths remain sharp; image blur tools can also use a blur map. [Adobe cameras](https://helpx.adobe.com/after-effects/desktop/work-with-layers/camera-layer/cameras-lights-points-interest.html) | Keep the product legible and soften suitable background layers. A focus handoff needs a deliberate second subject.                                               |
| **Parallax**                      | Cameras view layers arranged in 3D space. [Adobe cameras](https://helpx.adobe.com/after-effects/desktop/work-with-layers/camera-layer/cameras-lights-points-interest.html)                                                                         | Requires separated foreground/background content and adequate coverage. A flat product cutout cannot reveal unseen sides. Defer for the basic float.             |
| **Light sweep / specular accent** | A moving streak simulates a reflected highlight, with width, intensity and edge controls. [Cycore manual, p. 45](https://www.cycorefx.com/downloads/cfx_hd_std/CycoreFX%20HD%201.8.9%20Manual.pdf)                                                 | Potentially useful on a metallic cap or glossy package. Use an authored material mask; avoid washing out the label or making matte packaging appear metallic.    |
| **Glow / bloom**                  | Spreads brightness around bright areas or an alpha edge. [Adobe](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/stylize-effects.html)                                                           | Restrained highlight treatment when justified. A large outline halo would suggest a luminous object and can erase its silhouette.                                |
| **Echo / trails**                 | Combines images from different times with controlled decay and blending. [Adobe](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/time-effects.html)                                              | Suitable for an intentionally graphic speed treatment; visible duplicate bottles can confuse product count. Not a default realistic float.                       |
| **Grain / noise**                 | Adds synthetic texture or matches grain across footage. [Adobe](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/noise-grain-effects.html)                                                        | Optional finishing pass for a photographic treatment. Keep strength low and check small labels and compressed output.                                            |
| **Particles**                     | Moves many small elements using speed/force and appearance controls. [Adobe](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/simulation-effects.html)                                            | Could support a supplied atmosphere brief; no automatic glitter, ingredient particles or implied product performance.                                            |
| **Distortion / displacement**     | Uses a field such as fractal noise to warp an image. [Adobe](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/distort-effects.html)                                                               | Can animate background graphics or liquid motifs. Defer warping the actual SKU because it changes package and label geometry.                                    |

## Why blur suits Translate more than Float

Approximate exposure travel:

```text
exposureSeconds = shutterAngle / (360 × fps)
blurPixels ≈ speedPixelsPerSecond × exposureSeconds
```

This is derived from the shutter model in [Adobe's motion blur documentation](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/assorted-animation-tools/assorted-animation-tools.html), assuming locally constant velocity.

Our current gallery Float travels 18 px between extrema, twice over about eight seconds. Its peak speed is approximately 13.5–13.7 px/s. At 30 fps with a 180° shutter, that gives only **0.23 px of blur** at peak speed. Strong visible smearing would exaggerate this gentle movement.

The current Translate moves 840 px in 1.1 seconds with out-cubic easing. Its theoretical peak exposure travel is approximately **38 px** at the same settings. The peak occurs near the start, when much of the cutout is still offscreen; this is not the blur length throughout the entrance. Temporal sampling handles the changing velocity and boundaries.

See the [motion blur technical research](ecommerce-motion-blur-research.md) for calculations, alpha compositing, sample placement, cut/loop policy and integration requirements.

## Ordered experimental queue

This was the research proposal. The user subsequently authorized all effects, and FX-01–05 plus the remaining inventory are now implemented as Experimental. See the implementation note for evidence and limits. AC-01–07 remain complete.

| Order     | Experiment                       | Proposed comparison                                                                                       | Evidence needed                                                                                                                                         |
| --------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FX-01** | Translate + temporal motion blur | Same entrance with shutter off / 90° / 180°; evaluate 8 and 16 samples                                    | Smoother moving contours; sharp settled hold; stable alpha/color; uncropped blur; deterministic seeking; preview/export agreement; measured render cost |
| **FX-02** | Float + height-linked shadow     | Current studio scene with static shadow versus a coupled shadow; same product path                        | Height becomes easier to read; shadow stays on its surface and follows the same phase; continuous loop; product asset unchanged                         |
| **FX-03** | Float + bounded drift/tilt       | Vertical baseline versus horizontal excursion of 2–4 px; separately compare up to ±0.5° in-plane rotation | Clear improvement at phone size without jitter, product distortion, clipping, contact or visible loop discontinuity                                     |
| **FX-04** | Background light movement        | Static studio backdrop versus one restrained soft light patch moving behind the product                   | Supports composition without competing with the label; no claim of physically relighting the photographed bottle                                        |
| **FX-05** | Masked material highlight        | Baseline versus one cap-only sweep using an authored mask                                                 | Consistent material appearance, clean mask boundaries, preserved label/color; requires a supplied or prepared mask                                      |

Numeric ranges above are starting hypotheses for comparisons, not validated production presets.

### Shadow specifics

For an art-directed flat studio setup, begin with a shadow that becomes slightly wider and lighter as the product rises, then reverses as it descends. An initial comparison could vary width by 5–10% and opacity from 0.18 to 0.14. These values must be judged at actual output size. Real shadow size and softness depend on the light and receiver geometry; this mapping is not a universal physical rule.

Use the same evaluated height/progress as the product. Keep the shadow's receiver position fixed for vertical motion; derive any lateral offset from a declared light direction. Current shadow softness is baked into a prepared texture. Scaling and opacity are available now; varying softness needs additional prepared textures or an explicit blur implementation. Avoid regenerating a texture on every frame.

### Comparison design

Use the existing fictional bottle, 1080×1350 canvas, identical composition and duration. Show synchronized baseline/treatment previews with the same scrub frame, each effect independently switchable. Compare at full size and phone size. Render both moving and settled frames, plus an MP4 for timing judgment. A poster alone cannot establish motion quality.

Implement and evaluate FX-01 through FX-03 before stacking their outputs. FX-04 and FX-05 remain conditional on a visual brief and mask availability. Keep the palm-up composition as a visual baseline; these comparisons belong to Experimental.

## Architectural implications

- Keep effects composable with existing Product Layer and motion behaviors; do not make a separate product component for every effect combination.
- Motion blur needs an internal continuous-time evaluator and exposure accumulation. The current public frame API accepts integers. Retain that export contract while evaluating fractional samples internally.
- Gaussian Canvas blur is a focus/softness operation; it does not integrate the Translate trajectory.
- Do not implement exposure by repeatedly drawing semi-transparent copies with ordinary source-over blending. That changes opacity. The technical note specifies normalized premultiplied accumulation and a full-frame reference.
- Use one clock and explicit property ownership for Float, drift and shadow relationships. No wall-clock randomness or playback-history-dependent simulation.
- Source bundles must include effect parameters, seeds if applicable, exact masks/textures and versions needed to reproduce the output.
- Preserve product bytes and aspect ratio, then separately check rendered label readability and material/color appearance. An unchanged asset hash alone does not prove visual consistency.

## Local evidence reviewed

- `packages/renderer-core/src/commerce-component-demos.ts`: actual Float/Translate composition and timing.
- `packages/renderer-core/src/commerce-motion.ts`: smoothstep Float and out-cubic Translate.
- `packages/renderer-core/src/product-shadow.ts` and `shadow-texture.ts`: static prepared shadow.
- `packages/renderer-core/src/prepared-scene.ts` and `illustrated-renderer.ts`: integer-frame evaluation and Canvas rendering, reviewed in the focused blur research.
- [Atomic component plan](ecommerce-atomic-components-plan.md) and [implementation evidence](ecommerce-atomic-components-implementation.md).

The research phase reviewed documentation and source code. The subsequent rendered examples and their verification are recorded separately in the implementation note.
