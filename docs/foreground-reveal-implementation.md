# Foreground Reveal — implementation and review

**Date:** 2026-09-26. **Status:** Implemented and technically verified; creative acceptance pending.

CI-03 `foreground_reveal` is the fourth implemented cinematic template. [Research](./foreground-reveal-research.md) preceded implementation and established its defining event: real foreground concealment, completed clearance, and an exact held destination. The proof reuses Kit A without new image generation.

## Review

- [Primary seven-second clip](../benchmarks/results/cinematic-illustrated/reveal-v1/ci-03-foreground-reveal.mp4)
- [Review page](../benchmarks/results/cinematic-illustrated/reveal-v1/index.html), with optional Standard comparison and alternate composition
- [Motion measurements](../benchmarks/results/cinematic-illustrated/reveal-v1/render-summary.json)
- [Preview/export and alpha checks](../benchmarks/results/cinematic-illustrated/reveal-v1/parity-report.json)

Start with the main clip. The other versions are optional. Local outputs are ignored by Git and can be reproduced with the commands below.

## Shot and camera

The near right-hand stone wall starts across part of the vessel. One horizontal camera move carries the wall right, holds the vessel/room in place through an explicit screen-space anchor correction, and moves the far chamber slightly left. Camera Y, Z, focal scale and all plane scales remain constant. This is an authored 2.5D composition constraint, not a simulated camera rotation or reconstructed interior.

Dramatic uses the existing early-peaking camera curve but compresses the event into the opening half. Motion begins at frame 7 / 0.292 seconds and settles at frame 77 / 3.208 seconds. The pose then stays exactly constant through frame 167. Standard settles at frame 87 / 3.625 seconds; Restrained at frame 97 / 4.042 seconds. All strengths clear the vessel before settling.

| Composition / strength | Initial target concealment | First clear frame / time | Settle frame / time | Near travel |
| ---------------------- | -------------------------: | -----------------------: | ------------------: | ----------: |
| Primary Dramatic       |                     17.48% |             24 / 1.000 s |        77 / 3.208 s |   329.55 px |
| Primary Standard       |                     17.48% |             38 / 1.583 s |        87 / 3.625 s |   263.64 px |
| Primary Restrained     |                     17.48% |             49 / 2.042 s |        97 / 4.042 s |   197.73 px |
| Alternate Dramatic     |                     18.59% |             26 / 1.083 s |        77 / 3.208 s |   317.78 px |
| Alternate Standard     |                     18.59% |             41 / 1.708 s |        87 / 3.625 s |   254.22 px |
| Alternate Restrained   |                     18.59% |             53 / 2.208 s |        97 / 4.042 s |   190.67 px |

“Clear” means no more than 1% average foreground alpha over the authored vessel region. Every composition/strength remains below that threshold after its first clear frame. Settled coverage is at most 0.000612% in these measurements; tiny nonzero values come from the source alpha. These are sampled geometric/alpha measurements, not human ratings.

The primary Dramatic peak near speed is 200.84 px/s; the alternate is 193.66 px/s. Far travel is 83.33 / 82.94 px. Both have at least 70 px of painted background coverage margin. Worst source density is 0.7498 / 0.7378 source pixel per output pixel, above the project's 2/3 minimum.

## Source preparation

The three consumed assets are the unchanged Kit A room, far chamber and right post. The vessel, contact shadow, floor and immediate walls share one card. Its rear aperture exposes the prepared far chamber. Source hashes and generation lineage remain in [Kit A](../assets/cinematic-illustrated/kit-a-threshold/README.md); no retired corpus image was used.

The primary room retains width 1984 and X −32. Its right post is uniformly mapped from 948×1660 to height 2100, width about 1199.28, X 780, Y −480. Its near/room/far depths are 1.1 / 4 / 12 with authored horizontal travel −100. Dramatic, Standard and Restrained multipliers are 5 / 4 / 3.

The alternate room is width 2080 at X −155, Y −60. Its post is height 2250, width about 1284.94, X 680, Y −650. Depths are 1.25 / 4.5 / 14 with authored travel −110. It changes room framing, post scale/placement, and depth spacing. Both far plates are width 2230 at X −70, Y −85.

The first attempted primary post placement at height 1900 concealed only 6.79% of the target and was rejected before video frames were exported. Enlarging and repositioning the existing post produced the final 17.48% concealment while preserving source density. No horizontal stretching, image repair, new generation, or artificial opaque extension was needed.

Room cards declare all four outer cut edges; the post declares right/top/bottom attachments. The vessel remains inside the protected inner-frame area. A separate 18-vertex `recipe.revealRegion` traces the meaningful vessel silhouette in room coordinates. It is authored semantic information, not automatic segmentation.

## Real-alpha validation

`reveal-validation.ts` evaluates decoded asset alpha before preview or export. It:

1. Builds a deterministic grid inside the semantic polygon, using opaque target samples only.
2. Projects those samples and every plane closer than the subject using the same camera function as rendering.
3. Applies crop coordinates and bilinear source-alpha sampling, treating outside-node points as transparent.
4. Computes combined foreground coverage as `1 - product(1 - alpha)`.
5. Inspects every output frame, requires initial concealment of 10–35%, at most 1% coverage by the stop frame, and no later reocclusion. A rise over the running minimum by more than one percentage point fails; once clear, coverage must stay at most 1%.

The grid spacing is four subject-coordinate pixels; subject scale is one in this recipe, so that is also four output pixels. The primary contains 11,036 probes and the alternate 12,132. This is a sampled alpha gate with a 1% clearance tolerance, not an exact pixel-area integration. Full-size frame and motion-sheet review supplements it. Polygons with fewer than 100 opaque probes fail rather than bypassing validation.

The check includes all nearer planes, so another foreground object cannot remain over the vessel unnoticed. Missing/transparent/misplaced occluders and incomplete reveals fail. The usual framing, source-density, far coverage and cut-edge checks remain active. Maximum near travel is 30% W, far travel 6% W, and subject anchor drift 0.01 px.

Alpha metrics are saved in the browser QA report. The CLI's existing result retains geometric `cameraValidation`; it does not claim those fields include alpha measurements. Alpha validation still runs in the actual export browser before any frame is delivered.

## Code and reproduction

The recipe extends `illustrated-scene-2` and `illustrated-result-2`; renderer version is `cinematic-canvas-0.5.0`. Other recipes reject the new semantic-region field. Preparation produces eight fixtures across four cinematic templates.

```sh
pnpm cinematic:prepare
pnpm reveal:render --output-dir benchmarks/results/cinematic-illustrated/my-reveal-review
pnpm test:browser:reveal --renders benchmarks/results/cinematic-illustrated/my-reveal-review
pnpm lab
```

Choose **Foreground Reveal · Behind the stone wall**, or use `illustrated.html?scene=ci-03-foreground-reveal`. Standard and Restrained remain available. The gallery shows the opening occlusion as the video poster, with optional comparison and alternate sections.

## Verification and practical limits

- All 74 unit tests passed; TypeScript and ESLint passed.
- New tests cover actual alpha, transparent padding, all strengths at 24/30 fps, early settling, exact held poses, deterministic seeking, invalid paths/regions, empty target masks, wrong-direction/incomplete reveals, and additional foreground occluders.
- 37 preview/export comparisons passed, including frames immediately before/at/after clearance, camera stop, and held ending. All six composition/strength combinations passed every-frame real-image alpha checks.
- The main export repeated with an identical video hash. A 30 fps export has exactly 210 frames. Lab playback, strength changes, transparent far-plate rejection and uncovered-frame rejection passed.
- Each of the three earlier cinematic templates passed 31 regression comparisons and reproduced its previous primary video hash.
- FFprobe confirms 1920×1080, 24 fps, 168 frames and 7.000 seconds; both Dramatic exports decode fully.
- Full-size opening and revealed frames plus 28-frame motion sheets show a readable reveal, connected vessel/shadow/floor, complete background, and no exposed artificial post edges.
- The primary, alternate and Standard renders took 9.37 / 9.16 / 9.28 seconds and produced approximately 1.02 / 1.04 / 0.96 MB files. These are single-run host measurements.
- New image-generation calls and asset repairs: zero. One preliminary staging was rejected. Separate preparation labor was not timed; the original kit's provider cost remains unknown.

The source keeps its painted perspective and fixed pose. Free camera rotation and unseen object sides require different source preparation or geometry. Technical verification does not imply creative acceptance or Phase 0 completion. Five planned cinematic templates remain, beginning with Rising Vista.

Validation used installed Node 24.16.0; the repo pins 22.23.1. This is not a claim that the full pinned-toolchain gate passed. Legacy depth and illustrated suites were not rerun; the changed cinematic path and all three prior cinematic recipes were checked directly.
