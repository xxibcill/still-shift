# Foreground Reveal — research and prototype specification

**Researched:** 2026-09-26. **Template:** CI-03 `foreground_reveal`.

**Implementation follow-up:** Research preceded the new recipe. See [implementation and measured results](./foreground-reveal-implementation.md) for final post scaling, timing, and alpha validation.

**Owner direction:** Research before implementation; retain strong, visible cinematic motion. The distances, timing, and acceptance thresholds below are Still Shift design proposals, not industry standards.

## Recommendation

Stage an actual reveal: a near wall initially hides part of a grounded vessel, then the camera moves sideways until the wall clears it. Finish the movement around 3.2 seconds and hold the revealed composition through the seven-second shot. The hold is the result of the reveal; the first half must visibly change what the viewer can see.

Reuse Kit A's complete room, vessel, contact shadow, floor, and distant chamber. First test the existing right post at a larger uniform scale; prepare a wider foreground wall only if its real silhouette cannot satisfy the reveal and cut-edge checks. Preserve the subject's screen position with the existing explicit anchor correction. Require measurable initial occlusion and complete clearance at every strength. An endpoint that leaves the vessel partly hidden fails the template even if its motion is smooth.

## Primary-source findings

### A reveal is a change in available information

Adobe describes reveal pans as withholding a subject or detail until camera movement exposes it. Its examples concern an initially offscreen subject; this prototype applies the same information sequence to foreground occlusion. That adaptation is our staging choice. Adobe also defines a pan as rotation from a fixed camera position, so this translated-camera implementation should not be called a physical pan. [Adobe: Pan shot and reveal pan](https://www.adobe.com/uk/creativecloud/video/production/cinematography/camera-shots-and-angles/pan-shot.html)

### Translation and target framing are separate controls

Adobe's camera tutorial describes a one-node camera whose orientation stays fixed during a sideways truck, and a two-node camera that turns toward a point of interest. [Adobe: Animate a camera](https://helpx.adobe.com/ph_fil/after-effects/how-to/camera-animation.html)

Apple's Framing behavior provides a chosen target, framing offset, final composition, movement transition, and ease-out controls. This supports making the destination composition explicit. [Apple: Framing behavior](https://support.apple.com/en-lamr/guide/motion/motn17c67514/mac)

**Implementation inference:** The existing subject-anchor correction is suitable for the bounded illustrated proof, provided the documentation calls it an authored screen-space correction. It is not a reconstructed camera rotation. Keep camera Y, camera Z, focal scale, and layer scales constant; move the near wall relative to the held subject through depth-dependent horizontal projection.

### Stop deliberately at the revealed composition

Apple distinguishes constant-speed movement, gradual acceleration, and deceleration to a destination. It also notes that shorter movement duration increases speed for the same distance. [Apple: Move behavior](https://support.apple.com/en-gb/guide/motion/motn13744817/mac)

**Artistic recommendation:** Establish briefly, accelerate, clear the obstruction, decelerate into the destination, then hold it. Use one shared normalized camera curve, with an exact endpoint. CI-02's extended constant-speed middle section is inappropriate for the reveal's shorter event. No source specifies a universally cinematic three-second reveal; this timing is a prototype choice to make the new template's purpose obvious.

### Revealed pixels must already exist

Adobe's parallax workflow separates foreground elements, supplies concealed background details, allows source overscan by making the composition smaller, and evaluates the resulting camera move. [Adobe: Animate photos with a parallax effect](https://helpx.adobe.com/ph_fil/after-effects/how-to/animate-picture.html)

Adobe also states that a 3D image layer remains flat. Moving layers at different depths does not reconstruct the changing perspective of a continuous floor or the side of a vessel. [Adobe: 3D layers](https://helpx.adobe.com/after-effects/desktop/work-with-layers/3d-layers/3d-layers.html)

**Asset inference:** Keep vessel, contact shadow, and floor in the same complete room card. Use the farther plate only through the prepared rear aperture. This preserves depicted contact while retaining the limitations of a shallow 2.5D stage.

### Actual alpha determines concealment

The W3C compositing specification defines alpha as coverage/opacity and gives the source-over relationship: an overlaid source leaves a fraction `1 - sourceAlpha` of the backdrop visible. This provides the mathematical basis for a pixel-based reveal check; it does not prescribe our sampling density or threshold. [W3C: Simple alpha compositing](https://www.w3.org/TR/compositing-1/#simplealphacompositing)

## How this differs from the existing templates

| Template                | Defining visual event                                                 | Destination                                   |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------------------- |
| CI-09 Layered Parallax  | Depth planes move around an already readable anchored subject         | Brief settle after a longer move              |
| CI-02 Lateral Track     | Sustained travel carries the grounded subject through the composition | Different position after continued passage    |
| CI-03 Foreground Reveal | A real near silhouette conceals part of the subject, then uncovers it | Clearly readable subject held after clearance |

CI-03 can share projection machinery with CI-09. Its distinction must be enforced through staging, completion time, and asset-aware occlusion, rather than its name or travel multiplier alone.

## Prepared art and placement

Visual inspection of `threshold-room.png` confirms that the vessel, contact shadow, floor, and immediate wall form one card. The rear opening is transparent. Visual inspection of `threshold-left.png` shows why the silhouette's real alpha matters: the actual stone is considerably narrower than its full transparent source rectangle. A post at the previous 1200 px display height is too narrow for the proposed right-side staging, but that does not exhaust the existing source's resolution budget.

The implementation agent's full-source inspection found that the existing 948×1660 right post becomes opaque around source X=400. Uniformly mapping it to height 1900 gives width approximately 1085 and an opaque strip about 625 px wide. Starting near X=875 places its inner edge around X=1333 and its outer edge around X=1960. Y=−400 keeps its top and bottom beyond the frame. Density is approximately `1660 / 1900 = 0.874`, above the existing limit. This is a viable first staging experiment without new generation. Confirm exact alpha coverage, cut edges, and perceived material scale in the composite before accepting it.

If the existing post fails that experiment, prepare a broad right-hand near wall using Kit A's master and matching post as visual references:

- Full-height dark masonry occupies roughly the right 60% of a wide RGBA image; the left 40% is genuinely transparent.
- The inner edge is an irregular, deliberate architectural silhouette. The top, bottom, and outside right edge are cut edges that remain beyond the delivery frame.
- Preserve the original wall's material, lighting direction, warm highlights, and charcoal shadows. Do not include another vessel, floor, room, or baked background.
- Request genuine source detail. Preserve returned aspect ratio, inspect actual alpha and dimensions, and require the existing minimum `2/3` source pixel per output pixel at every frame.

A source near 16:9 mapped to 1200 px high would be approximately 2133 px wide. If its inner boundary lies near 40%, placing the rectangle around X=400 gives an inner silhouette near X=1253 and an outside edge near X=2533. This is only a staging estimate: generated silhouettes and the vessel polygon determine the actual start and end. Use asset pixels to resolve placement before declaring the scene valid.

For an anchored room with a vessel spanning approximately X=925–1400, the wall should begin across the right portion of the vessel and finish beyond its rightmost visible silhouette with a small clear gap. Exact framing should come from the local artwork. Do not stretch a narrow post horizontally or add an opaque rectangle to manufacture coverage.

## Motion and strength proposal

With zero axial displacement and focal factor one, the current subject-anchored projection gives:

```text
layerDisplacementX = cameraTravelX × (1 / subjectDepth - 1 / layerDepth)
```

A negative camera X moves a nearer wall right while holding the room still. A farther chamber moves slightly left. That opposite movement follows from the shared anchor correction; it is not independently animated layer drift.

Suggested starting values are near depth 1.3, subject depth 4, far depth 12, and camera X travel −600. They give approximately +312 px near-wall movement, 0 px room movement, and −100 px far movement. These values are illustrative and must fit source coverage. If −100 px far travel exceeds the prepared painted margin or existing gate, increase far/subject depth closeness, add genuine overscan, or reduce travel while preserving completed clearance.

Recommended seven-second schedule:

1. Establish the partially hidden subject for approximately 0.1–0.2 seconds.
2. Move strongly through the reveal with smooth acceleration and deceleration.
3. Complete clearance and stop around 3.2 seconds.
4. Keep the destination camera pose exactly constant through the final frame.

**Strength must retain the event.** Solve or author a minimum travel that clears the actual vessel polygon first. Standard and Restrained must satisfy that minimum too. Vary travel beyond the minimum and/or movement duration to make strengths different. Blindly applying CI-09's 0.65/1/5 or CI-02's distance multipliers can leave a weaker setting incomplete. Store and report the actual strength-specific distance and clear frame.

For a first proof, use a comparable initial occlusion across strengths, approximately 10–35% of the semantic vessel region, and require less than 1% remaining occlusion by the settled endpoint. Dramatic may finish with additional negative space and a more forceful early movement. These are project gates, subject to visual tuning.

## Asset-aware reveal validation

A screen-space protected polygon proves that the vessel stays inside the frame. It does not prove that it can be seen. Add a separate authored polygon tracing the meaningful vessel silhouette inside the larger room card; a large rectangle that includes surrounding wall would dilute the measurement. This is a semantic authoring responsibility, not automatic object recognition.

Validate after the real images are decoded and their dimensions/hashes are checked, before playback or export:

1. Project the target polygon at each output frame using the same camera evaluator as rendering.
2. Determine which image planes are in front of the target. For each target sample, obtain their actual alpha after crop, transform, and image sampling. Transparent padding must contribute zero coverage.
3. For ordinary source-over planes, compute target transmission as the product of `1 - alpha` across foreground layers. Coverage is one minus that transmission. Include every nearer occluder so an extra layer cannot defeat the check.
4. Average coverage over the semantic polygon. A rendered alpha mask at delivery resolution is the strongest straightforward reference; a deterministic coarser sample grid needs an explicit resolution and error allowance around the threshold.
5. Record initial coverage, endpoint coverage, first clear frame, worst later coverage, sample count/resolution, and any invalid frame. Require meaningful initial concealment, clearance by the authored stop frame, and no reocclusion during the held ending.

Use actual alpha for all strengths. Reject a fully transparent replacement wall, a misplaced wall that never conceals the subject, a wall that never clears, a different nearer plane that leaves the vessel covered, and a polygon with no usable sample area. Do not silently bypass the check if asset decoding or sampling fails.

Threshold tolerances may permit subpixel edge fluctuation during motion. Once the camera stops, repeated evaluation must produce the same mask and exact pose. Do not accept a continuously sliding composition merely because the target became visible once.

## Implementation and review checklist

- Add the explicit recipe, reveal target, early settle timing, and result metrics. Keep existing recipes and hashes reproducible.
- Retain painted far coverage, middle-card edge coverage, artificial foreground cut-edge attachment, protected framing, and per-frame sampling checks. None is replaced by the reveal percentage.
- Test projection direction and depth ordering; exact held endpoint; early motion; all-strength completion; transparent padding; multiple foreground occluders; malformed/no-area target regions; and failure when a weak path cannot clear the subject.
- Check 24 and 30 fps, deterministic out-of-order seeks, real source hashes, and lab/export agreement around the first clear frame and stop frame.
- Inspect full-size opening, half-revealed, just-clear, and held frames, then play the full clip at typical embedded width. Check matte fringes, artificial rectangular edges, exposure of unpainted content, contact sliding, and whether the initial obstruction and final subject read immediately.
- Deliver a primary composition and a meaningfully altered second framing, with a short review page. Creative approval remains the owner's decision; technical gates alone do not close Phase 0.

This report is a pre-implementation recommendation. Final measured values and any changes to the proposal belong in the implementation record.
