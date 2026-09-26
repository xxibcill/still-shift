# Threshold Push — research and prototype specification

**Researched:** 2026-09-25. **Template:** CI-01 `threshold_push`.

**Implementation follow-up:** Research was completed before generation and code changes. The [resulting prototype](./threshold-push-implementation.md) implements the preferred grounded room assembly below.

**Owner direction:** Research the next cinematic template before implementing it. The owner approved the heavier CI-09 treatment after finding the original too slow. This report therefore revises the earlier CI-01 study targets toward a clearly visible approach. Numeric targets below are our prototype choices, not industry standards or values prescribed by the cited sources.

## Recommendation

Build an axial camera approach through two near doorway edges toward a storage vessel. Keep focal scale constant. The near framing expands strongly, the vessel grows moderately, and the distant room grows slightly. Start movement within the first few frames and decelerate into the final composition. Use new Kit A artwork, including a deliberately grounded subject assembly; the courtyard floor should not be reused for this proof.

This is the next template in the [cinematic plan](./cinematic-template-plan.md). It builds on the shared camera used by [Layered Parallax](./cinematic-parallax-implementation.md), while introducing depth-dependent growth and per-frame sampling checks.

## Primary-source findings

### Dolly motion changes the camera position

Apple Motion's Dolly behavior translates a camera along its Z axis and offers several speed interpolation choices. Its Zoom In/Out behavior changes the angle of view instead. These separate operations provide the useful distinction for this template: translate the camera toward the prepared depth planes while keeping the lens factor fixed. [Apple: Dolly](https://support.apple.com/guide/motion/dolly-behavior-motn17c675de/mac), [Apple: Zoom In/Out](https://support.apple.com/guide/motion/zoom-inout-behavior-motn17c68d76/mac)

Adobe describes apparent layer size in relation to camera distance and its Zoom parameter. A layer twice as far away has half the apparent linear size when other settings stay fixed. This supports using perspective projection to derive each plane's change from one camera move. [Adobe: Camera settings](https://helpx.adobe.com/dk/after-effects/desktop/work-with-layers/camera-layer/cameras-lights-points-interest.html)

### Prepare separate surfaces and concealed artwork

Adobe's photo-parallax workflow separates foreground content, reconstructs the concealed background, and places layers at different Z positions while preserving their initial appearance. It recommends a composition smaller than the source image and evaluating camera moves against the prepared layers. [Adobe: Animate photos with a parallax effect](https://helpx.adobe.com/ph_fil/after-effects/how-to/animate-picture.html)

View-synthesis research likewise treats hidden content as an explicit reconstruction problem: Shih and colleagues' layered-depth method synthesizes color and depth behind occlusions before rendering new viewpoints. That paper describes a richer representation than this plane renderer; it does not validate arbitrary movement of our illustrated cutouts. [Shih et al., CVPR 2020: Layered Depth Inpainting](https://arxiv.org/abs/2004.04727)

### A framing target is an explicit choice

Apple's Framing behavior permits a target point offset from the layer center, along with camera path, final framing, and transition controls. For this proof, choose an authored point on the vessel or its support and retain its screen position as the vessel grows. This is an intentional composition constraint. [Apple: Framing behavior](https://support.apple.com/en-lamr/guide/motion/motn17c67514/mac)

### A depth plane retains flat geometry

Adobe explicitly documents that a layer remains flat after conversion to a 3D layer. Depth placement does not reconstruct the side of a vessel or the changing perspective of a receding floor. [Adobe: 3D layers](https://helpx.adobe.com/after-effects/desktop/work-with-layers/3d-layers/3d-layers.html)

**Inference for our artwork:** A straight, bounded approach is more compatible with these front-facing planes than passing through a doorframe or orbiting the vessel. Grounding and internal perspective need visual inspection even when a rectangular coverage test passes.

## Projection and anchor semantics

The following equations are derived for Still Shift's existing front-facing plane model in [cinematic-scene.ts](../packages/renderer-core/src/cinematic-scene.ts), using its depth-normalized initial artwork. Depth values are authoring units, not physical meters.

For a plane initially at positive depth `d`, forward camera displacement `z`, and constant focal factor one:

```text
scale(d, z) = d / (d - z)
growth = scale - 1
z needed for target scale S = d × (1 - 1/S)
```

Require `d - z` to remain positive with a configured near-plane margin throughout the move. As the camera approaches the nearest plane, its growth accelerates rapidly; using the same Z multiplier as CI-09's lateral Dramatic mode is unsafe.

Let `C` be the projection center, `A` the authored subject anchor in the starting composition, and `s_subject` its current scale. With no lateral travel, the existing subject correction gives any source point `P`:

```text
projected(P, d) = C + (P - C) × scale(d, z)
                 + (A - C) × (1 - s_subject)
```

At the subject depth this becomes `A + (P - A) × s_subject`, so the anchor holds while the subject grows. The subject's top-left corner moves legitimately. Measure anchor drift directly; a top-left displacement limit would incorrectly reject an anchored axial push. This correction is a screen-space framing adjustment, not a simulated camera rotation.

Choose an anchor near the visual center of the vessel's body for an approach into the subject, or at its support contact for fixed grounding. Record that choice in the fixture. A normalized anchor refers to the node rectangle, including any transparent padding; deriving it from the actual depicted feature avoids an accidental empty-space target.

## Proposed movement

Begin the primary proof with Dramatic strength. Preserve restrained alternatives in the controls.

| Choice            | Initial proof target                       | Reason                                                |
| ----------------- | ------------------------------------------ | ----------------------------------------------------- |
| Duration          | 7 seconds at 24 fps; verify 30 fps         | Consistent review length                              |
| Start             | Within approximately 0.15 seconds          | Owner wants movement to read promptly                 |
| Finish moving     | Approximately 6.3–6.5 seconds              | Deliberate settle with a short final reading interval |
| Near frame growth | Approximately 25–35% when sampling permits | Door edges visibly spread                             |
| Subject growth    | Approximately 8–12%                        | Clear approach while preserving shape and framing     |
| Distant growth    | Approximately 2–4%                         | Maintain perceptible depth separation                 |
| Path              | Axial, fixed focal scale, no roll          | One readable camera idea                              |
| Velocity          | Early acceleration and longer deceleration | Carry forward the approved CI-09 pacing               |

One coherent starting example is near depth `1.6`, subject depth `4`, background depth `12`, and forward travel `0.4`. It produces linear scales `1.3333`, `1.1111`, and `1.0345`. The near plane remains `1.2` authoring units ahead of the camera. These scales must be reduced or the assets improved if sampling, framing, or grounding fail.

For a 1,000 px wide opening at the projection center, a 1.3333 near scale widens it by roughly 333 px; each side moves about 167 px. This illustrates visible scale, not a mandatory opening size. Measure landmarks on the actual door edges rather than a transparent sprite's rectangle. Inspect real-time playback at typical embedded-video width: endpoints alone cannot establish whether the pacing feels heavy.

## Kit A artwork and ground strategy

Create a coherent master of an illustrated storage chamber: charcoal contours, warm bone walls, ochre vessel, field-green shadows, substantial dark doorway sides, and a quietly lit opening behind. No labels, arrows, moving particles, or episode-specific historical claims. Keep the vessel silhouette and support readable through the entire path.

Prepare reference-led derivatives from that master:

1. A middle room card containing the vessel, its contact shadow, and the entire visible floor together, with the rear opening genuinely transparent. Remove the near posts and reconstruct the concealed immediate walls and floor.
2. A left doorway cutout. Its outer cut edges must remain outside the frame throughout the move.
3. A matching right doorway cutout, likewise registered and constrained.
4. A distant chamber card behind that opening, sufficiently complete to cover the opening throughout the move. Layer count is not itself a quality target.

### Preferred bounded prototype: a complete middle room assembly

Keep the vessel, contact shadow, floor, and immediate room architecture in one card at the subject depth. Cut out a rear doorway so the farther chamber can grow more slowly behind it. Place the two near doorway posts at the nearest depth. The image then has three meaningful scale responses while every painted mark around the vessel's contact shares exactly the same transform.

This avoids the specific floor-sliding failure without requiring a ground mesh for this proof. The middle room retains its painted perspective during the approach; it is a deliberate 2.5D stage and not a reconstructed interior. Keep subject growth around 8–12%, inspect the rear opening boundary, and avoid an exaggerated near floor grid that would make the frozen internal perspective conspicuous. The protected polygon and anchor must describe the vessel feature inside the larger room card, rather than protecting or targeting the entire room rectangle.

A fully opaque farthest plate can retain a defensible global coverage check. That plate may be visible only through the transparent rear opening and around valid compositing boundaries; no duplicated vessel or floor detail may be exposed. Generation should establish a complete master first, then preserve registration and opening silhouette in the derivatives.

### Alternative bounded prototype: a discrete support

Place the vessel on a broad stone shelf, ledge, or low support with a clearly authored silhouette. Keep the vessel's contact shadow and all visible support texture in the same depth assembly. Compose the support's bottom into the lower frame or behind near framing, with its far boundary depicted as an intentional architectural edge. This prevents a separate far-plane floor texture from sliding directly beneath the vessel.

This is a designed shallow-depth approximation. A small, softly feathered patch over a differently moving patterned floor is insufficient: the surrounding seams can still slide. Do not present this strategy as reconstruction of a continuous floor.

### If changing floor perspective is essential

Use a real ground receiver or depth-varying mesh with the camera model. A floor's points span different depths; projecting every point with one plane distance cannot preserve that geometry. Author a horizon/contact calibration, ensure the receiver has the subject's depth at the contact point, and project the contact shadow on that same receiver. A renderer implementation could triangulate the ground and apply perspective-correct texture mapping. Its sampling and coverage checks must include the most magnified part of the ground. This is additional implementation scope, justified if the discrete-support composition fails its visual review.

## Dynamic source-resolution budget

The current CI-09 check measures only starting source pixels per output pixel. CI-01 must check the value after projection at every sampled frame:

```text
density(layer, frame) = min(sourceCropWidth / projectedWidth,
                            sourceCropHeight / projectedHeight)
```

Continue the existing minimum `2/3` source pixel per output pixel (maximum 1.5× linear enlargement) as a project quality limit. It is not an industry standard. Record the worst layer and frame so preparation failures are actionable.

For example, a 1672 px asset mapped to 2080 px starts at density `0.804`. A near scale of `1.333` lowers it to `0.603`, which fails that limit. The same source/mapping only supports about `1.206×` maximum scale. A source starting at native output density `1` supports `1.333×` growth at density `0.75`.

Request larger artwork when available, inspect its actual returned dimensions, and derive the output mapping from those dimensions. Neither a requested resolution nor transparent padding supplies detail. A genuine crop with native-scale placement can help an edge cutout; arbitrary enlargement cannot. The maximum camera displacement permitted by an individual plane's sampling budget follows from `z ≤ d × (1 - minimumDensity / startingDensity)`.

For this kit, prepare the two near posts as individual tall portrait RGBA assets with enough genuine source detail for their final display size. For example, an actual 941×1672 source mapped near 430×1200 retains at least `1672 / (1200 × 1.333) ≈ 1.045` source pixels per output pixel at maximum growth. Aspect ratio and silhouette must be authored for that mapping; do not stretch an unrelated post to fit it. A 1672 px wide middle room mapped to 1984 px and growing by 1.111 has horizontal density about `0.759`, subject to its vertical crop budget. Validate actual returned pixels and crop sizes before retaining the 33% near target.

## Implementation acceptance

- Add `threshold_push` as its own named recipe with axial travel and explicit foreground sides, subject, and background roles. CI-09 remains reproducible.
- Compile one shared camera path. Keep lens factor constant and enforce near-plane clearance. Reject missing roles, non-finite geometry, invalid depth order, and collapsed near/subject/far separation.
- Check all output frames for painted background coverage, attached cut edges, protected subject framing, and dynamic source sampling. A forward push usually improves outer coverage, but anchor correction and displaced layer bounds still require checking.
- Report each role's scale change and the actual anchor drift. Require near growth to exceed subject growth and subject growth to exceed distant growth by meaningful authored margins; do not reuse the lateral-travel gate.
- Unit-check known projected scales, anchored subject position, deterministic out-of-order seeking, and rejection of an overscaled or crossed plane. Include both left and right cut edges.
- Compare preview/export at the start, acceleration, mid-move, deceleration, and ending frames. Verify 24/30 fps, exact duration, and repeat determinism.
- Review the clip for doorway spread, subject readability, contact/shadow attachment, seams, matte fringes, duplicate imagery, and visible softness. Technical passing does not decide creative acceptance.
- Ship the seven-second Dramatic proof with strength controls and a concise preparation limitation: the input is authored layered artwork. Retain original generation lineage and actual asset dimensions.

The first proof succeeds when the camera visibly approaches a grounded subject through near framing, without a floor sliding beneath it or a flat global zoom standing in for depth-dependent projection.
