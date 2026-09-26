# Focus Handoff — research and implementation direction

Researched 2026-09-26 before implementation. CI-06 adds a focus treatment to the shared Cinematic Parallax family. It remains a prepared illustration study; the History Offstage channel bible's usual exclusion of shallow depth of field is unchanged.

## Findings from primary sources

1. **Rack focus directs attention between subjects within one shot.** Adobe describes it as a shift of attention between characters or objects in the same frame. Composition needs two readable points of interest for that shift to carry meaning. [Adobe: Cinematography](https://www.adobe.com/creativecloud/video/production/cinematography.html)
2. **A simulated focus pull can use opposite blur animations.** Adobe's post-production tutorial isolates an area with a mask, then animates that area from sharp to soft while reversing the values on its surroundings. It explicitly calls the result a simulation of a focus pull. Mask edges and image boundaries require attention. [Adobe: Add a focus pull effect](https://helpx.adobe.com/in_hi/premiere-pro/how-to/focus-pull-effect.html)
3. **Canvas blur is Gaussian, with a standard-deviation parameter.** A value such as `blur(4px)` describes Gaussian sigma, not a hard four-pixel support radius or a physical lens aperture. Browser support is not universal; MDN marks Canvas 2D filters as limited availability. [MDN: CanvasRenderingContext2D.filter](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter)
4. **Canvas filters operate in output coordinates and precede clipping/compositing.** The current transform affects the input image, while filter coordinates use the output bitmap's space. A node-shaped clip can therefore cut off blur extending beyond the original image rectangle. Resetting the filter requires `none`; assigning an invalid value leaves the previous filter active. [WHATWG: Canvas filters and drawing model](https://html.spec.whatwg.org/multipage/canvas.html#filters)
5. **Blur needs room around silhouettes and correct alpha handling.** Filter Effects specifies premultiplied RGBA processing by default. Its filter regions are hard clips, so padding may be necessary. Gaussian blur's default edge mode extends missing pixels as transparent black; duplicating edges is a different mode. [W3C: Filter regions](https://www.w3.org/TR/filter-effects-1/#FilterEffectsRegion), [filter primitive overview](https://www.w3.org/TR/filter-effects-1/#FilterPrimitivesOverview), [Gaussian blur](https://www.w3.org/TR/filter-effects-1/#feGaussianBlurElement)

## Project design choices

The values and model below are Still Shift authoring decisions. These sources do not prescribe a four-second timing, a four-pixel maximum, or a particular depth-to-blur equation.

### Attention and staging

- Reuse Kit B: the textured near stone doorway begins sharp; the isolated standing figure farther into the courtyard becomes the final sharp point of interest. Its complete courtyard plate provides coverage behind the cutouts. Kit A's vessel is painted into the room card, making an independent vessel focus treatment less suitable without new preparation.
- The doorway is a material/detail anchor and the figure is a narrative anchor. This is a masonry-to-person study, not a claim that two newly authored story props are present.
- Keep the figure's pose, face geometry, scale, opacity and exposure unchanged. Blur is the primary event. Small horizontal parallax supplies a quiet depth cue; cap visible relative near-plane travel at 1% of output width (19.2 px at 1920).
- Preserve the original study maximum of four pixels of Gaussian sigma at 1080p. This is a deliberately mild illustration treatment. At a 320-pixel-wide presentation, four pixels at source scale corresponds to about 0.67 output pixels; a clear thumbnail handoff therefore cannot be assumed. Inspect full size and thumbnail, and report if the result reads chiefly at full size.

### Timing and focus evaluation

- Scale the original CI-06 timing by duration: opening near emphasis to about 21% of the shot, focus transfer from about 21% to 50%, supporting travel settled by about 64%, then a sustained far emphasis.
- For a four-second proof, that is approximately 0–0.86 s near hold, 0.86–2.0 s focus transfer, small motion finished by 2.57 s, and an ending hold through four seconds. These are a starting schedule for inspection, not a cinema rule.
- Evaluate every frame from its absolute normalized time. Use one smooth monotonic transition and retain exact opening/final states during their holds. Avoid a focus oscillation or a sharpness loop.
- A useful layer model interpolates reciprocal focus depth from the near plane to the subject plane, then maps each plane's reciprocal-depth difference to bounded blur. For near depth 1, subject depth 4 and background depth 8, normalize by `abs(1/1 - 1/4)`. At maximum strength the near and subject exchange 0/4 px blur; the far plate starts at the four-pixel cap and ends near 0.67 px. This is an authored depth-based approximation, not an optical circle-of-confusion or bokeh model.
- Keep the blur cap explicit and deterministic across strengths. Any strength scaling should remain within the same cap. Do not advertise focal-length changes, focus breathing, reconstructed surfaces, or physically accurate lens defocus.

### Rendering choices and risks

- Apply blur to each prepared plane before it is composited with other planes. Blurring the already-composited scene would soften the intended sharp subject as well.
- Cinematic stretch images can be drawn directly with the Canvas filter while omitting their rectangular per-node clip. The frame clip still applies after the layer's blur. This preserves naturally softened alpha silhouettes without allocating a cropped intermediate surface. If the implementation uses intermediate surfaces instead, expand them for blur support and retain their position offset.
- Retain transparent space around cutout silhouettes. Do not repeat opaque edge pixels across a silhouette, which would change the illustrated shape. Opaque background plates instead need painted overscan beyond the frame to prevent their outer borders fading into the canvas background.
- Keep each draw operation's filter scoped with save/restore and set `none` on the sharp path. Otherwise one softened layer can leak its filter into later layers or later frames.
- Check filter support before rendering a focus scene. Unsupported runtimes must produce an explicit failure, rather than silently exporting a shot with no focus handoff. The known Chromium export and lab path should use the same renderer behavior.
- Verify the filter actually changes pixels, not only that assigning its property succeeds. Inspect a bright cutout edge against dark surroundings and a dark edge against light surroundings for clipped blur, halos and dark fringes.

## Focused acceptance checks

- Opening: near masonry sharp, figure soft. Ending: near masonry soft, figure sharp. Midpoint: a continuous transfer with usable illustration linework.
- Sample the opening hold, focus start, transfer midpoint, focus completion and final hold in lab/export comparisons. Include alpha boundaries and frame edges in pixel checks.
- Verify blur endpoints, bounded values, monotonic handoff, supported 24/30 fps timing and out-of-order frame determinism. Confirm supporting parallax remains within its small envelope.
- Reuse existing painted coverage, source-density and protected-subject checks. Preserve opacity and subject geometry; only the designated focus treatment and bounded shared camera should change.
- Produce one four-second preview using existing art. Review the visual result before claiming that the mild treatment works equally well at all display sizes.
