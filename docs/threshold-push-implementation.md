# Cinematic study 02 — Threshold Push

**Date:** 2026-09-25

**Status:** CI-01 implemented and technically verified after [primary-source research](./threshold-push-research.md). Creative review pending. Two of the nine cinematic templates are implemented; seven remain planned.

## Review

Watch the [seven-second Dramatic clip](../benchmarks/results/cinematic-illustrated/threshold-v1/ci-01-threshold-push.mp4). The [review page](../benchmarks/results/cinematic-illustrated/threshold-v1/index.html) leads with that shot, with optional Standard comparison and alternate composition underneath.

The camera approaches a storage vessel through two near stone doorway posts. The posts expand outward faster than the room. A distant chamber remains visible through a transparent rear opening. The vessel, its contact shadow, the floor, and immediate walls share one transform, preserving their painted relationship.

| Measurement                          |          Primary |        Alternate |
| ------------------------------------ | ---------------: | ---------------: |
| Left doorway growth                  |           33.33% |           32.81% |
| Right doorway growth                 |           33.33% |           38.89% |
| Vessel / middle room growth          |           11.11% |           11.11% |
| Distant chamber growth               |            3.45% |            3.09% |
| Anchor drift                         | Effectively zero | Effectively zero |
| Minimum far-plate coverage margin    |         18.30 px |         18.30 px |
| Worst source pixels per output pixel |           0.7585 |           0.7400 |
| Export wall time                     |           8.17 s |           8.09 s |

Both clips are 1920×1080, 24 fps, exactly 168 frames / seven seconds. Movement starts at 0.125 s and settles at 6.42 s. The alternate uses a narrower doorway, unequal near depths, a 2.5% tighter room composition, and a different framing anchor. It reuses the same artwork rather than proving a second independently sourced scene.

## Research applied

The research distinguished forward camera translation from changing focal scale, examined authored framing targets and flat-layer limits, and identified dynamic sampling as a new requirement. Its recommended prototype became:

- One shared camera with forward travel and fixed focal scale. A plane at depth `d` scales by `d / (d - z)`.
- Primary depths 1.6 / 4 / 12 with forward travel 0.4, giving the measured 33.33% / 11.11% / 3.45% growth.
- Separate portrait source images for the near posts, providing enough pixels at the closest camera position.
- One grounded middle-room assembly, with the far chamber revealed through its alpha opening.
- The approved Dramatic pacing: prompt start, early speed peak, gradual deceleration, short final hold.

These movement values are project-specific artistic choices. Sources and alternatives are recorded in the research report. The room remains a flat 2.5D stage with fixed internal perspective; it does not reconstruct a walkable interior or support arbitrary orbiting.

## Contract and renderer

`illustrated-scene-2` now accepts `threshold_push` alongside `layered_parallax`:

- `camera.push` supplies positive forward travel; `camera.travel` must be `[0, 0]` for this recipe.
- `recipe.foreground` and `foregroundRight` identify distinct near posts. Their depths must be closer than the subject. Left and right edge attachments are required.
- `recipe.subject` identifies the middle room assembly. Its protected polygon covers the vessel, and `camera.anchor` targets the vessel inside the larger image.
- `recipe.background` identifies the complete opaque distant plate.
- Dramatic / Standard / Restrained apply forward-travel factors 1 / 0.65 / 0.4. The lateral Dramatic multiplier is not applied to Z.

The `cinematic-canvas-0.3.0` renderer retains the shared Canvas preview/export path. Every frame validates near-plane clearance, painted coverage, attached cut edges, protected vessel bounds, and source density after magnification. The existing minimum density of 2/3 remains enforced. Errors identify the undersized layer and frame.

Axial acceptance checks growth separation instead of lateral distance: both near sides must grow meaningfully more than the subject, which must grow more than the far plate. Artistic growth ceilings are 50% near, 15% subject, and 6% far, with a 0.01 px anchor-drift ceiling. Coverage or resolution may impose a smaller move. Unsafe scenes fail explicitly; automatic reduction and the planned labelled 2D fallback are not implemented.

Result metadata adds `foregroundScaleChange`, `backgroundScaleChange`, and `subjectAnchorTravelPx`. They remain optional when reading earlier cinematic results. Legacy `subjectTravelPx` still measures the node rectangle's top-left displacement; that corner legitimately moves while the vessel anchor holds during a push.

## Use

```bash
pnpm cinematic:prepare
pnpm threshold:render --output-dir benchmarks/results/cinematic-illustrated/my-threshold-review
pnpm still-shift animate-scene \
  --scene benchmarks/fixtures/cinematic-illustrated/ci-01-threshold-push.json \
  --output /tmp/threshold-new.mp4
pnpm test:browser:threshold --renders benchmarks/results/cinematic-illustrated/my-threshold-review
pnpm lab
```

In the lab, choose **Threshold Push** in the Cinematic group, or open `/illustrated.html?collection=cinematic&scene=ci-01-threshold-push`. Play, scrub, and change motion strength. The render command writes two Dramatic compositions, one Standard reference, metadata, posters, contact sheets, and the review page. Use a new output directory.

## Artwork and verification

The [original Kit A assets](../assets/cinematic-illustrated/kit-a-threshold/README.md) were created using built-in `image_gen.imagegen`: one master and four reference-led derivatives. [Exact prompts](../assets/cinematic-illustrated/kit-a-threshold/prompts.md) and [provenance](../assets/cinematic-illustrated/kit-a-threshold/provenance.json) are retained. Generated PNGs were copied unchanged; source aspect ratios are preserved in the fixture. No episode artwork or retired corpus image was used.

The room and far plate are 1672×941. The near posts are 948×1659 and 948×1660. The lowest measured density occurs in the enlarged room, corresponding to approximately 1.32× enlargement in the primary and 1.35× in the alternate. This is within the project limit, not native 1080p source detail.

- All **65 unit tests** pass, including known forward-projection scales at 24/30 fps, stable anchoring, deterministic seeking, dynamic-resolution failure, missing roles, invalid depth order, near-plane crossing, and insufficient growth separation.
- Threshold Push passes **31 preview/export comparisons** across both Dramatic compositions and Standard, plus all strength controls, a 210-frame Dramatic export at 30 fps, and a byte-identical repeat render.
- Layered Parallax passes another **31 comparisons** against the previously delivered clips; its repeat export remains byte-identical to the approved version.
- Transparent far-plate substitution and uncovered frames are rejected. Build and ESLint pass.
- FFprobe confirms 1920×1080 / 24 fps / 168 frames / seven seconds. The primary decodes fully without errors.
- Full-size rendered frames and both motion contact sheets were inspected for exposed edges, visible matte contamination, detached vessel contact, duplicate objects, and framing. The review page's optional comparison playback was checked.

[Render measurements](../benchmarks/results/cinematic-illustrated/threshold-v1/render-summary.json) and [frame comparison report](../benchmarks/results/cinematic-illustrated/threshold-v1/parity-report.json) accompany the clips. Checks ran on Node 24.16.0, while the project pins 22.23.1; this is not a claim that the full pinned-toolchain release gate passed.

Rendering is slightly slower than real time with the lossless PNG transport. Generation and preparation are additional work. Provider billing and isolated preparation labor are unavailable. Phase 0 corpus and acceptance gates remain open. Lateral Track is the next planned template.
