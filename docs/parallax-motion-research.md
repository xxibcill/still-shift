# Making Layered Parallax more dramatic

**Research date:** 2026-09-25

**Scope:** Still Shift CI-09, separated still artwork, seven-second cinematic shots.

**Status:** Research applied in the new Dramatic setting. Numerical targets below are creative experiments, not industry standards. See the [implementation and comparison](cinematic-parallax-implementation.md).

## What makes the current shot feel slow

The original Standard [study](../benchmarks/results/cinematic-illustrated/review-v3/ci-09-layered-parallax.mp4) moves the foreground 60 px and background 10 px across a 1920 px frame: about 3.1% and 0.5% of frame width. The person stays fixed in position and scale. At a 480 px preview width those movements become 15 px and 2.5 px.

The Standard profile in the [camera implementation](../packages/renderer-core/src/cinematic-scene.ts) holds until frame 17, moves until frame 131, then holds through frame 167. At 24 fps this gives approximately 0.71 seconds before motion, 4.75 seconds of travel, and a 1.5-second terminal interval. Its symmetric smoothstep curve reaches a peak foreground speed of roughly 19 px/s; movement is slower around both ends. These are calculations from the code, not perceptual measurements.

The recipe also fixes camera Z to zero and focal scale to one. Standard's foreground movement ceiling is 4% of frame width (76.8 px), background ceiling 1% (19.2 px), and subject scale ceiling 1%. Those original limits prevented a substantially heavier move. Dramatic now has its own wider artistic envelope while retaining coverage and framing checks.

## Findings from primary sources

### 1. Depth separation and camera travel produce the effect

Adobe's parallax tutorial begins with a high-resolution image, isolates foreground objects, reconstructs the background, separates layers in Z, rescales them to preserve the initial composition, and animates the camera through that arrangement. It emphasizes adequate distance between layers and choosing depths that suit the depicted scene. [Adobe: Animate photos with a parallax effect](https://helpx.adobe.com/ph_fil/after-effects/how-to/animate-picture.html)

**Application:** Keep a coherent shared camera. Increase the actual difference in projected movement between near and distant surfaces, while arranging a clear foreground edge that reveals part of the environment. More layer count alone is not a useful target; another layer should represent a meaningful depth boundary.

For our current anchored, lateral projection, a layer's horizontal displacement is:

```text
displacement = cameraTravel × (1 / subjectDepth − 1 / layerDepth)
```

This follows directly from our renderer with focal scale 1 and Z travel 0. At depths 1/4/8 and camera travel 80, the result is −60/0/+10 px. A fivefold travel gives −300/0/+50 px without changing the depth relationships. It also exposes five times as much hidden background at relevant edges.

### 2. Dolly and lens zoom serve different purposes

Apple Motion defines Dolly as movement along the camera's Z axis, while Zoom In/Out animates angle of view. After Effects defines projected size relative to camera distance and its Zoom parameter. [Apple: Dolly](https://support.apple.com/guide/motion/dolly-behavior-motn17c675de/mac), [Apple: Zoom In/Out](https://support.apple.com/guide/motion/zoom-inout-behavior-motn17c68d76/mac), [Adobe: Camera settings](https://helpx.adobe.com/after-effects/desktop/work-with-layers/camera-layer/cameras-lights-points-interest.html)

**Inference for this renderer:** A common focal-scale change with a stationary camera magnifies all planes together. Axial camera translation changes near and far scales by different amounts. A subtle axial component could later create an approach into the courtyard, but requires dynamic scale, sampling, and framing validation. A larger global zoom alone would not add the missing depth separation.

### 3. Weight comes from the velocity profile as well as distance

Adobe documents three controls over animation speed: distance between values, time between keyframes, and interpolation. Its speed graph allows separate control of acceleration, deceleration, and their influence. Apple likewise offers constant, eased, accelerating, and decelerating camera movement. [Adobe: Control speed between keyframes](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/speed-between-keyframes/speed.html), [Apple: Dolly](https://support.apple.com/guide/motion/dolly-behavior-motn17c675de/mac)

**Design recommendation:** Start moving promptly, build speed with a deliberate acceleration, then decelerate over a longer tail. This is our interpretation of a camera with weight. Avoid an extended static opening, a long frozen ending, or a springy bounce unless a particular shot calls for those choices. Evaluate speed during real-time playback; a contact sheet cannot establish the feel of acceleration.

### 4. Stronger travel requires painted space and sound grounding

Adobe's workflow fills removed objects and uses a composition smaller than the source photo. More advanced view-synthesis research also explicitly reconstructs color and depth in regions hidden in the original view. Those regions become visible when the viewpoint changes. [Adobe: Photo parallax preparation](https://helpx.adobe.com/ph_fil/after-effects/how-to/animate-picture.html), [Shih et al., CVPR 2020: Layered Depth Inpainting](https://arxiv.org/abs/2004.04727)

**Application:** Derive overscan from the whole camera path and reconstructed plate, rather than prescribing a universal margin. Check every frame and inspect internal disocclusions as well as the outer canvas. A filled rectangle can cover the frame while still revealing a duplicate silhouette, an implausible painted patch, or a cutout edge.

**Current asset limitation:** The courtyard's floor and distant architecture are painted on the same flat background. The person and contact shadow share another plane. With the person pinned and the floor moving farther, ground texture can slide under the feet or shadow. This is a geometric risk inferred from the asset structure; it must be reviewed in the heavier render. A grounded contact patch at the subject's depth can help a carefully chosen composition, but must blend invisibly into the floor. Larger viewpoint changes need a separate ground receiver with appropriate geometry or depth reconstruction.

### 5. Motion blur should follow actual movement

Adobe explains that synthetic movement can strobe without temporal blur, and that the amount depends on speed, shutter angle, and phase. More temporal samples cost rendering time. Its shutter calculation relates exposure to frame duration. [Adobe: Motion blur](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/assorted-animation-tools/assorted-animation-tools.html)

**Recommendation:** Compare the stronger motion unblurred first. If fast edges step visibly, evaluate temporal sampling around each output frame. A 180° shutter at 24 fps gives a 1/48-second exposure by that formula; use it as one test setting, not a mandatory cinematic rule. Blur should fall with velocity and preserve a sharp resting image. A constant Gaussian blur is not a substitute for motion blur. Keep preview/export sampling identical, include alpha correctly, and measure the extra render cost.

### 6. Flat artwork cannot support arbitrary camera moves

After Effects explicitly notes that a layer remains flat when converted to a 3D layer. Depth placement does not create the side or back of a photographed object. [Adobe: 3D layers](https://helpx.adobe.com/after-effects/desktop/work-with-layers/3d-layers/3d-layers.html)

**Application:** Lateral reveals fit this kit better than a large orbit. Strong rotation can expose the flat-plane construction; large dolly moves can exaggerate the painted floor and frozen perspective. Separate depth-of-field treatment may help depth readability, but does not repair missing geometry. Scale, matte, contact, and perspective inspection remain necessary even when coverage passes.

## Proposed next treatment

These are **authoring targets to test against this artwork**, not values copied from the sources.

| Choice          | Current Standard             | Proposed Dramatic experiment                                |
| --------------- | ---------------------------- | ----------------------------------------------------------- |
| Near movement   | 60 px                        | Approximately 240–360 px; begin at 300 px                   |
| Far movement    | 10 px                        | Approximately 40–60 px, subject to painted coverage         |
| Opening         | Approximately 0.7 s static   | Movement begins immediately or within about 0.15 s          |
| Pacing          | Symmetric ease across 4.75 s | Earlier acceleration, sustained travel, longer deceleration |
| Ending          | Approximately 1.5 s static   | Settle near the end; only a short hold if useful            |
| Framing         | Stationary subject           | Preserve readable subject; review feet and ground contact   |
| Lens/axial move | None                         | Keep lateral first; assess axial treatment separately       |
| Blur            | None                         | Add only after judging real-time motion and edge stepping   |

The first comparison should reuse the same artwork and seven-second duration. That makes the impact of travel and timing easy to judge. Keep Standard and Restrained available and add Dramatic as a separate choice. Revise artistic movement ceilings for that mode while retaining coverage, protected-region, depth, and resolution checks.

The current primary plate has 80 px of horizontal overscan before movement, so a 50 px far shift leaves 30 px on the more exposed side. The first alternate experiment shifted 77 px and left only 3 px; the delivered revision reduces this to 70 px and leaves 10 px. Inspection also found that its cropped foreground edge entered the frame. The revised alternate places the foreground 260 px farther left and declares its left/top/bottom edges as attached to the frame. Every frame now checks those edges. These rectangle checks do not certify internal cutouts, blur sampling, or grounded feet.

## Review criteria

- The near frame visibly passes the distant architecture at normal playback size.
- Motion is evident in the first second and has a deliberate build and settle.
- Feet and contact shadow stay convincingly attached to the ground.
- No transparent edges, duplicate silhouettes, rectangular matte boundaries, or sliding painted seams appear.
- Camera movement stays coherent across layers; the person remains readable.
- Preview and export agree, repeated seeks remain deterministic, and the clip retains its exact duration.

Technical verification and creative acceptance answer different questions. Passing these geometry checks permits review of the result; the user's judgment determines whether the motion is dramatic enough.
