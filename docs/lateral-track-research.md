# Lateral Track — research and prototype specification

**Researched:** 2026-09-25. **Template:** CI-02 `lateral_track`.

**Implementation follow-up:** Research preceded the new camera implementation. See [Lateral Track results](./lateral-track-implementation.md) for final staging, strength factors and verification.

**Owner direction:** Research the next cinematic template before implementation. Carry forward the preference for strong, visibly moving shots. The numerical profile below is a Still Shift artistic and engineering proposal; the cited sources do not prescribe its distances, speeds, or quality limits.

## Recommendation

Build a sustained horizontal camera traverse with a fixed viewing direction and focal scale. Let the subject travel through the composition while nearby masonry passes much faster and the distant chamber drifts slowly. Use the existing Kit A room, vessel, floor, distant chamber, and near posts. This can establish a third camera idea without another image-generation round.

CI-09 holds its subject in place with a screen-space anchor correction and emphasizes movement around that subject. CI-02 should omit that correction, carry the whole grounded middle room across the screen, and sustain a steady middle section of travel. CI-01 changes depth-dependent size. CI-02 should keep every plane's scale constant. Those differences must be measured and visible in playback; a renamed CI-09 path would not fulfill this proposal.

## Primary-source findings

### Position and rotation are different operations

Apple Motion documents its 3D view translation control as movement along the camera-relative X and Y axes. Its Sweep behavior pivots the camera around an axis. For this implementation, animate camera X position while keeping Y, Z, orientation, and focal scale constant. Terminology varies between software controls: Motion labels its X/Y translation control “Pan,” so the parameter behavior is a more reliable specification than that UI label alone. [Apple: 3D view tools](https://support.apple.com/en-gb/guide/motion/motn17c671ef/mac), [Apple: Sweep behavior](https://support.apple.com/en-mn/guide/motion/motn17c6964f/mac)

**Implementation inference:** A fixed-direction sideways camera produces same-direction screen displacement for stationary objects at all positive depths, with greater displacement for nearer planes. Retaining the current subject-lock correction would change that composition behavior and preserve CI-09's defining constraint.

### Sustained travel needs a sustained velocity section

Apple distinguishes constant speed from ease-in, ease-out, and ease-both movement. It also explains that longer movement duration reduces speed for the same destination. [Apple: Move behavior](https://support.apple.com/en-gb/guide/motion/motn13744817/mac)

**Artistic recommendation:** Use short smooth acceleration and braking sections surrounding a long constant-speed section. This creates sustained passage across architecture. Applying the existing early-peaking Dramatic curve to the full move would spend much of the shot decelerating, weakening that distinction. Neither easing nor a particular plateau duration is a universal cinematic rule.

### Hidden regions require artwork

Adobe's parallax workflow starts with separable foreground/background elements, reconstructs missing background detail, uses a composition smaller than the source, and places layers at different Z positions while preserving their initial appearance. Camera experiments are then evaluated against those prepared layers. [Adobe: Animate photos with a parallax effect](https://helpx.adobe.com/ph_fil/after-effects/how-to/animate-picture.html)

Shih and colleagues' view-synthesis research explicitly generates color and depth for occluded regions before rendering new viewpoints. Their layered-depth representation is more capable than our flat cards; it supports the need for concealed content, not a claim that our renderer reconstructs an unrestricted scene. [Shih et al., CVPR 2020: Layered Depth Inpainting](https://arxiv.org/abs/2004.04727)

### Depth placement preserves flat source geometry

Adobe states that an image layer remains flat when made into a 3D layer. Giving an illustration a depth coordinate does not reconstruct a turning vessel, the side of a wall, or a continuous receding floor. [Adobe: 3D layers](https://helpx.adobe.com/after-effects/desktop/work-with-layers/3d-layers/3d-layers.html)

**Implementation inference:** Keep the vessel, contact shadow, immediate wall, and floor together in the middle card. Their common transform preserves the depicted contact. The floor's internal perspective remains fixed, so describe the result as an authored 2.5D traverse and judge whether the finite movement remains convincing.

## Asset choice and grounding

Local inspection of [Kit A](../assets/cinematic-illustrated/kit-a-threshold/README.md) found a suitable prepared assembly:

- `threshold-room.png` contains the vessel, contact shadow, immediate architecture, and visible floor; its rear doorway is transparent.
- `threshold-far.png` supplies a complete opaque distant room behind that opening.
- The two portrait post assets supply near framing and genuine source detail at the required display size.
- The master and room art have been visually inspected for this research. Actual composited animation still needs inspection; transparent RGB alone is not the displayed result.

Reusing the courtyard's isolated standing figure over a separately moving floor would preserve the known contact-sliding risk. Kit A avoids that particular separation. A copied soft floor patch around a figure would only move the seam elsewhere. If a future courtyard proof requires independent feet, floor perspective, and freely changing viewpoints, use an authored support assembly or a calibrated ground/depth mesh.

The current room card is 1672×941. Mapping it to width 2230 while preserving aspect ratio gives about 1255 output pixels of height and a source density of `1672 / 2230 = 0.750`. That remains above the project's `2/3` minimum without axial enlargement. Check the exact dimensions and framing used by the implementation.

### Coverage must include the middle room

Opaque far-background coverage is necessary but insufficient. If the middle room's outer edge enters the frame, a distant wall can fill the pixels while still exposing an impossible floor/wall seam. Require all four outer room edges to remain outside the output frame, and apply left/right/top/bottom attachment constraints to the posts as appropriate.

Keep each post's artificial crop edge out of view. A post's natural inner silhouette may pass through the frame; its source rectangle's cut outer edge may not. Check both starting and ending compositions at every strength. Reversing the camera requires new overscan placement, not a sign flip alone.

The rear aperture should be the intentional boundary between room and distant card. Inspect its reveals for duplicated doorway frames, mismatched floor texture, matte fringes, or impossible sliding at the threshold. The vessel should stay visibly readable as the framing changes; a protected screen polygon does not detect an opaque foreground post covering it.

## Projection and a concrete starting profile

The following is derived from [Still Shift's existing projection](../packages/renderer-core/src/cinematic-scene.ts), with zero axial travel, focal factor one, and no anchor correction:

```text
projectedX = sourceX - cameraX / depth
projectedY = sourceY
scale = 1
screenTravelMagnitude = abs(cameraTravelX) / depth
```

Depth is an authoring parameter, not a distance in meters. All three roles should have positive ordered depths. The subject anchor remains useful as a reported landmark and authored framing reference, but it must move with the room.

An initial Dramatic fixture can use actual camera X travel `640`, near depth `1.3`, room depth `3.5`, and far depth `10`:

| Role                   | Screen travel | Fraction of 1920 px width | Purpose                          |
| ---------------------- | ------------: | ------------------------: | -------------------------------- |
| Near masonry           |     492.31 px |                    25.64% | Strong passing foreground        |
| Grounded room / vessel |     182.86 px |                     9.52% | Visible compositional relocation |
| Distant chamber        |         64 px |                     3.33% | Slow depth reference             |

These figures are a starting point for visual review. The near/subject ratio is approximately 2.69, and subject/far approximately 2.86. The original plan's 3–4% near movement was a mild draft; the owner-approved heavier direction warrants this separate, explicitly bounded proposal.

For example, a room of width 2230 starting at X = −60 and translating left by 182.86 ends at X = −242.86, with a right edge of 1987.14. Horizontal coverage retains at least 60 px over the move. Vertical placement, protected vessel geometry, and near-post occlusion still require independent checks.

Suggested study bounds for Dramatic are near travel 18–30% W, subject 5–12% W, and far 1–5% W. Require at least 2× near/subject and 2× subject/far displacement. Lower strengths should scale the same path and retain visible subject drift; assign their own minima instead of applying CI-09's nearly stationary subject gate. A 0.65 Standard multiplier and 0.4 Restrained multiplier are plausible starting choices, subject to the review.

## Timing proposal

Use a seven-second shot, verified at both 24 and 30 fps:

1. Establish for approximately 0.125 seconds.
2. Accelerate smoothly for roughly the first 12% of the movement interval.
3. Hold constant velocity for the middle 76%.
4. Brake smoothly for the final 12%.
5. Finish travel around 6.4–6.5 seconds and hold the destination briefly.

Use one normalized camera-progress function for all layers. One analytic option integrates smoothstep velocity ramps. For movement progress `p` in `[0,1]` and ramp fraction `r = 0.12`:

```text
I(q) = q^3 - q^4 / 2

raw(p) = r * I(p/r)                       if p < r
         p - r/2                         if r <= p <= 1-r
         (1-r) - r * I((1-p)/r)           if p > 1-r

distanceProgress(p) = raw(p) / (1-r)
```

This has zero speed at its endpoints, an exactly constant middle velocity, continuous acceleration at the joins, and no overshoot. It is a proposed implementation, not an Apple-defined curve. Evaluate it from absolute frame time; do not accumulate per-frame deltas. With a roughly 6.3-second movement and 492 px near travel, the plateau is about 89 px/s, approximately 3.7 px per frame at 24 fps. That offers a sustained heavy move in the range of the approved CI-09 peak, while the subject now travels visibly.

## Implementation and review checks

- Add an explicit `lateral_track` recipe. Require nonzero X travel, zero Y/Z travel, fixed focal factor, distinct near/middle/far roles, and unanchored projection.
- Measure signed displacement as well as magnitude: all stationary planes move in the same screen direction and obey inverse-depth ordering. Verify nonzero subject-anchor travel, stable scale, and constant middle velocity.
- Check every output frame for far painted coverage, middle-card outer edges, declared post cut edges, protected vessel framing, and source density. A wider motion envelope must not weaken these checks.
- Verify that subject/floor/contact-shadow landmarks share one transform. Inspect foreground occlusion separately from protected framing.
- Render a primary and a meaningfully different alternate composition. Reversing travel can be part of the alternate, but also alter room framing, near-post staging, and depth spacing.
- Compare lab/export at ramp boundaries, several plateau frames, midpoint, braking, and final frame. Repeat representative renders and seek out of order. Preserve CI-09 and CI-01 output behavior.
- Review full-size and embedded playback for continued passage, clear subject relocation, fixed horizon, sampling shimmer, seams, and excessive cardboard appearance. The endpoint difference alone does not establish successful pacing.

No new artwork is required if Kit A passes those visual checks. If the stronger motion exposes an incompatible doorway or floor relationship, revise staging or prepare the missing surface before considering the template complete. Technical passing remains separate from owner creative approval and Phase 0 corpus acceptance.
