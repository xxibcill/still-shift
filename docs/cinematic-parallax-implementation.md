# Cinematic study 01 — Layered Parallax

**Date:** 2026-09-25

**Status:** CI-09 Layered Parallax now includes a researched Dramatic setting in response to the owner's slow-motion feedback. Technical checks pass; creative acceptance remains pending. The other eight cinematic templates remain planned.

## Review

Watch the [seven-second Dramatic clip](../benchmarks/results/cinematic-illustrated/dramatic-v2/ci-09-layered-parallax.mp4). The [review gallery](../benchmarks/results/cinematic-illustrated/dramatic-v2/index.html) plays Original and Dramatic together and includes an optional second composition.

Both are silent, full-frame illustrations with no instructional overlays: 1920×1080, 24 fps, exactly 168 frames. The original courtyard art separates a near doorway, a stationary figure with contact shadow, and a continuous distant setting.

| Measurement                         | Primary                 | Alternate               |
| ----------------------------------- | ----------------------- | ----------------------- |
| Foreground horizontal displacement  | 300 px                  | 252.94 px               |
| Background horizontal displacement  | 50 px                   | 70 px                   |
| Subject displacement / scale change | Effectively zero / zero | Effectively zero / zero |
| Minimum background coverage margin  | 30 px                   | 10 px                   |
| Frames checked before export        | 168                     | 168                     |
| Export wall time                    | 7.94 s                  | 7.93 s                  |

The alternate moves the subject 220 px left and foreground 260 px left, changes near/middle/far depth from 1/4/8 to 0.85/3/10, and reverses the camera direction with authored travel −60/6. Moving the foreground's initial position keeps its cropped source edge out of view. It is another composition of the same art kit, not an independently sourced environment.

## Stronger motion, based on research

The [primary-source research](./parallax-motion-research.md) covers depth spacing, camera travel, acceleration, clean plates, temporal blur, and the limits of flat layers. Dramatic applies a fivefold horizontal camera travel multiplier and a 1.5× vertical multiplier. These are creative choices for this study, not industry standards.

| Primary composition   | Original Standard | Dramatic    |
| --------------------- | ----------------- | ----------- |
| Near / far travel     | 60 / 10 px        | 300 / 50 px |
| Peak foreground speed | 18.95 px/s        | 84.77 px/s  |
| Motion starts         | 0.71 s            | 0.125 s     |
| Motion ends           | 5.46 s            | 6.42 s      |

Dramatic uses a monotonic progress curve `6p² − 8p³ + 3p⁴`, with zero endpoint velocity, an earlier speed peak, and a longer deceleration. It does not overshoot or loop. The original symmetric smoothstep stays in Standard and Restrained. The exported Standard reference is byte-identical to the original `review-v3` primary MP4.

Dramatic's artistic ceilings are 20% frame width near travel, 5% far travel, and 2% frame height vertical movement; minimum near travel is 10%. Actual painted coverage, protected framing, and source resolution can impose tighter limits. The layer contract now supports `edgeAttachments` for left, right, top, and bottom: declared cropped edges must remain outside the frame throughout the move. Standard retains its earlier ceilings.

## Implementation

- `illustrated-scene-2` adds authored depth planes, a subject anchor, camera travel, painted background bounds, and protected subject polygons. Version 1 and its six recipes retain their original format and rendering path.
- A shared camera projects all planes from absolute frame time. Near and far layers move coherently around the anchored subject. The camera establishes, travels once, and settles; it does not loop or use accumulated animation state.
- Plane order is derived from depth. The existing Canvas 2D preview/export compositor draws the projection, so CLI and lab use the same evaluated positions.
- Before export, every frame is checked for painted coverage, subject framing, attached cut edges, movement limits, sufficient near/far separation, and acceptable source sampling scale. Missing layers, collapsed depth bands, insufficient resolution, invalid regions, and unsafe movement are errors.
- The browser also checks actual background alpha against its declared painted rectangle. A transparent plate cannot pass by claiming full coverage in JSON.
- `illustrated-result-2` and `illustrated-render-2` record the new format and camera validation. Old result/manifests retain version 1. Asset hashes and dimensions remain required.

The first camera recipe provides a diagonal lateral sweep with fixed focal scale. Axial pushes, curved paths, focus filters, and dolly-zoom recipes are future work. Unsafe input currently fails explicitly; automatic envelope reduction and a reported 2D fallback are not implemented for this recipe.

## Use

```bash
pnpm cinematic:prepare
pnpm still-shift animate-scene \
  --scene benchmarks/fixtures/cinematic-illustrated/ci-09-layered-parallax.json \
  --output /tmp/parallax-new.mp4
pnpm cinematic:render --output-dir benchmarks/results/cinematic-illustrated/my-review
pnpm lab
```

In the lab, open `/illustrated.html?collection=cinematic` or choose the **Cinematic** optgroup. Select Dramatic, Standard, or Restrained motion, play or scrub, and compare with the CLI render. Dramatic is the current demo default. Export the matching `recipe.intensity` from the scene JSON. The original illustrated presets remain available in the same selector. `cinematic:render` exports both Dramatic compositions plus a Standard reference of the primary.

## Assets and preparation

The [courtyard kit](../assets/cinematic-illustrated/kit-b-courtyard/README.md) contains four images created with built-in image generation: one master and three referenced derivatives. The generated PNGs are unchanged; source rectangles register the usable foreground and subject regions. [Exact prompts](../assets/cinematic-illustrated/kit-b-courtyard/prompts.md) and [provenance](../assets/cinematic-illustrated/kit-b-courtyard/provenance.json) identify all outputs.

The source is 1672×941 and is mapped at approximately 1.244× enlargement for overscan. This does not provide native 1080p detail. Full-size frames and the motion contact sheets were checked for matte rectangles, cutout edges, duplicated people, exposed plate regions, framing, and grounded shadows. Hidden courtyard pixels were generated once in the clean plate; the renderer does not reconstruct them.

The courtyard floor and distant buildings still share one flat plate. The body and shadow stay together, but the texture beneath them translates with that plate. This is a limitation of the scene's depth model; a perspective ground receiver or depth mesh is needed for larger physically grounded camera moves. No new art was generated for the Dramatic revision. Temporal motion blur and axial camera travel remain future work.

## Verification

- Nine camera unit cases cover 24/30 fps, depth ordering, subject anchoring, deterministic seeking, missing or collapsed planes, uncovered frames, protected bounds, insufficient motion, vertical limits, zero-area polygons, stronger/faster monotonic motion, and attached cut edges.
- The cinematic browser test passes **31 preview/export comparisons** across both Dramatic compositions and the Standard reference. It checks all three strength choices and confirms visible movement within the first half second.
- An additional Dramatic export at 30 fps has **210 frames**. A repeated primary export is byte-identical. Transparent background substitution and unsafe coverage are rejected.
- All **61 unit tests** pass. The prior foundation verification also passed **4 integration tests**, **42 illustrated comparisons**, and **30 golden comparisons**; those suites were not rerun for this additive camera profile.
- The primary MP4 decodes without errors; FFprobe confirms exactly seven seconds and 168 frames.
- Build and lint pass. The new checks are included in `pnpm test:browser:cinematic` and the repository's main test chain.

[Render results](../benchmarks/results/cinematic-illustrated/dramatic-v2/render-summary.json) and [frame comparison report](../benchmarks/results/cinematic-illustrated/dramatic-v2/parity-report.json) refer to the delivered clips. Checks use local Chromium/FFmpeg on Node 24.16.0; the repository's pinned Node version is 22.23.1, so these results are not a claim that the full pinned-toolchain release gate passed.

## Remaining work

Threshold Push, Lateral Track, and Foreground Reveal follow this first prototype, then the other planned templates. Arbitrary single-image segmentation, general mask editing, local character animation, and automatic background reconstruction are outside this milestone.

The measured exports are slightly slower than real time with the lossless PNG transport. Generation, preparation, and QA are additional work. The generation window was recorded, but isolated active preparation time and billed provider cost were unavailable; no end-to-end cost saving is claimed. The retired 43-image corpus stays retired, and Phase 0 acceptance remains open.
