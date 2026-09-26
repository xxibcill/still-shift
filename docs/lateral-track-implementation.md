# Lateral Track — implementation and review

**Date:** 2026-09-26. **Status:** Implemented and technically verified; creative acceptance pending.

The third cinematic template is CI-02 `lateral_track`. [Primary-source research](./lateral-track-research.md) preceded the camera changes. The research led to a fixed-direction sideways camera, visible subject drift, a sustained middle speed, and reuse of the grounded storage-room assembly. This milestone adds no new generated imagery.

## Review

- [Seven-second primary](../benchmarks/results/cinematic-illustrated/lateral-v1/ci-02-lateral-track.mp4)
- [Review page](../benchmarks/results/cinematic-illustrated/lateral-v1/index.html), with optional strength comparison and alternate composition
- [Motion measurements](../benchmarks/results/cinematic-illustrated/lateral-v1/render-summary.json)
- [Preview/export verification](../benchmarks/results/cinematic-illustrated/lateral-v1/parity-report.json)

These local render outputs are ignored by Git and reproducible with the commands below. Only the main seven-second shot needs an initial creative review.

## Camera behavior

CI-02 translates camera X with zero Y/Z travel and fixed focal scale. Every stationary plane moves in the same screen direction, with displacement `-cameraX / depth`. Its subject anchor moves with the room. Layered Parallax keeps that anchor fixed; Threshold Push changes plane scales. These recipes have separate movement checks.

Camera progress is the integral of smoothstep velocity ramps around an exactly constant-speed middle. Each ramp occupies 12% of the moving interval; the middle occupies 76%. Evaluation uses absolute frame indices, so seeking does not accumulate errors. At 24 fps, movement begins at frame 3 (0.125 s) and finishes at frame 157 (6.542 s). Constant speed spans approximately 0.895–5.772 s. The output is 168 frames / 7 seconds. At 30 fps the compiler quantizes the same normalized timing to 210 frames.

| Measured treatment | Near travel | Subject travel | Far travel | Near plateau / peak speed | Minimum far coverage | Minimum source density |
| ------------------ | ----------: | -------------: | ---------: | ------------------------: | -------------------: | ---------------------: |
| Primary Dramatic   |   492.31 px |      182.86 px |      64 px |                87.19 px/s |                85 px |                 0.7498 |
| Alternate Dramatic |   454.55 px |      166.67 px |   41.67 px |                80.50 px/s |             93.70 px |                 0.7109 |
| Primary Standard   |   295.38 px |      109.71 px |   38.40 px |                52.31 px/s |                85 px |                 0.7498 |

All plane scales remain exactly one. Standard uses 60% and Restrained 40% of Dramatic travel, with the same timing. These strength factors and limits are project choices, not film-industry standards. The research suggested 65% Standard; 60% gives a useful comparison while preserving subject drift.

The primary uses authored travel `[128, 0]`, multiplied by five at Dramatic strength. Left post / room / far depths are 1.3 / 3.5 / 10; the right post has depth 1.6. The alternate uses `[-100, 0]`, foreground role on the right post, and right / room / far depths 1.1 / 3 / 12. Its left post has depth 1.6. Direction, room framing, foreground positions, and depth spacing change together.

## Prepared artwork and coverage

The four [Kit A source assets](../assets/cinematic-illustrated/kit-a-threshold/README.md) are reused unchanged, retaining their source hashes and generation provenance. The vessel, its contact shadow, floor, and immediate walls share the `room` card. The distant chamber is visible through its transparent rear opening. No retired corpus image is reintroduced.

The primary maps the 1672×941 room to width 2230, X −60, Y −85, preserving aspect ratio. Its smallest horizontal room margin is 60 px across the move. The alternate maps it to width 2352, X −370, Y −150; its smallest horizontal margin is 62 px. Both room cards declare all four outer cut edges. This prevents a distant plate from hiding an exposed middle-room boundary while still passing the background coverage check. The near posts retain their appropriate side, top, and bottom attachments.

Every output frame checks:

- Fully painted far-plate coverage and actual source alpha.
- Declared cut edges remaining outside the output frame.
- The vessel's protected polygon inside the inner 80% of the frame.
- Source density at least 2/3 source pixel per output pixel.
- At least 2× foreground/subject and 2× subject/background travel separation.

The lateral recipe accepts only a nonzero horizontal path. Dramatic foreground travel is limited to 15–30% of frame width, Standard 8–18%, and Restrained 4–12%. Maximum subject travel is respectively 12%, 8%, and 6%; maximum far travel is 5%, with a 0.3% minimum. The 15% Dramatic minimum allows alternate staging below the research's suggested 18% lower bound while retaining the two separation ratios. Delivered compositions exceed 23% foreground travel.

The 28-frame contact sheets for both Dramatic compositions and the full-size frames were inspected: the vessel stays readable, the shadow stays attached to its floor, and the near silhouettes pass without exposing rectangular cut edges. The rear opening reveals the prepared far wall and floor. Screen-bound protection does not measure foreground occlusion; that remains a visual review concern.

This is a bounded 2.5D set. The floor retains its painted perspective, and the vessel does not reveal newly reconstructed sides. The assets support this finite traverse, not unrestricted camera movement.

## Code and commands

`illustrated-scene-2` now accepts `lateral_track`; the renderer is `cinematic-canvas-0.4.0`. The scene/result contract, shared camera evaluator, lab catalog, preparation script, CLI render script, and browser verification support the new recipe. Existing template inputs retain their motion and output pixels.

```sh
pnpm cinematic:prepare
pnpm lateral:render --output-dir benchmarks/results/cinematic-illustrated/my-lateral-review
pnpm test:browser:lateral --renders benchmarks/results/cinematic-illustrated/my-lateral-review
pnpm lab
```

In the lab, choose **Lateral Track · Passing the storage chamber**, or open `illustrated.html?scene=ci-02-lateral-track`. All three strengths are available. `cinematic:prepare` produces six fixtures across the three cinematic recipes. The review gallery leads with one Dramatic clip and keeps comparison/alternate videos in expandable sections.

## Verification and cost

- TypeScript build and ESLint passed.
- All 69 unit tests passed. New tests cover same-direction inverse-depth movement, subject drift, fixed scale, sustained velocity, 24/30 fps, out-of-order seeking, both directions, strengths, room cut-edge failure, invalid paths, collapsed depth separation, and excess drift.
- Lateral Track passed 31 preview/export comparisons across two compositions and Standard strength, 210-frame 30 fps export, exact repeated-export hash, playback/strength controls, transparent plate rejection, and uncovered-frame rejection.
- Layered Parallax and Threshold Push each passed the same 31-comparison regression suite against their previous delivered exports. Repeated primary exports match their previous video hashes exactly.
- FFprobe confirms 1920×1080, 24 fps, 168 frames, 7.000 seconds. Both Dramatic files decode fully with FFmpeg.
- Primary/alternate/Standard renders took 9.29 / 8.51 / 8.50 seconds on this host. Output sizes are about 3.15 / 2.51 / 3.40 MB. These are single-run measurements, not throughput guarantees.
- New asset generations: zero. Existing Kit A now supports CI-01 and CI-02; original generation cost remains recorded with that kit. No asset repair was needed. Preparation labor was not separately timed.

Validation used the installed Node 24.16.0 and pnpm 10.29.3; the repository pins Node 22.23.1. This is not a claim that the complete pinned-toolchain gate passed. Legacy depth/illustrated suites were not rerun in this milestone; the shared cinematic path and its two existing recipes were covered directly.

Six cinematic templates remain planned, beginning with CI-03 Foreground Reveal. Creative acceptance of CI-02 and the separate Phase 0 corpus and decision gates remain open.
