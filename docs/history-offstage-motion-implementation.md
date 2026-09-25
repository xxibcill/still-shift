# History Offstage motion study 02 — implementation

**Date:** 2026-09-25

**Status:** All six planned presets implemented; creative review pending. Phase 0 remains open.

## Review

Watch the [42-second reel](../benchmarks/results/history-offstage-v2/review-v3/history-offstage-motion-reel.mp4), or replay individual clips in the [six-clip gallery](../benchmarks/results/history-offstage-v2/review-v3/index.html). All clips are silent, 1920×1080, seven seconds, 24 fps, and exactly 168 frames. The joined reel is 1,008 frames.

| Time    | Preset             | Visible change                                                                                |
| ------- | ------------------ | --------------------------------------------------------------------------------------------- |
| 0–7 s   | `chronicle_reveal` | Foreground and middle layers separate; a relationship appears.                                |
| 7–14 s  | `resource_flow`    | Two paths draw sequentially; tokens reach a bowl and seed pouch.                              |
| 14–21 s | `access_pressure`  | A route becomes restricted; the token stops before the gap.                                   |
| 21–28 s | `comparison_build` | A shared view separates into aligned panels; reserve margins change differently.              |
| 28–35 s | `pose_prop_change` | A portion moves from a store; the bowl switches from an empty to a filled drawing at contact. |
| 35–42 s | `crisis_fracture`  | Two connections break in sequence; groups separate with a short registration pulse.           |

`locked_hold` is now grouped under **Timing utility** and labelled **Static hold · no animation** in the original lab.

## Source preparation

The [analysis](./history-offstage-motion-plan.md) used the channel bible, production profile, storyboards, and representative drawings. Execution used three original generated images: a clean field background, a six-object transparent atlas, and two bowl states. The object kit is reused by every preset. The six scene layouts are assembled from those assets, editable text, and authored paths.

See [exact prompts](../assets/history-offstage-v2/prompts.md) and [asset provenance](../assets/history-offstage-v2/provenance.json). No selected episode image was transformed or included in this proof. All 43 previously retired inputs remain retired.

## Shared implementation

- `PreparedSceneSchema` describes hashed local assets, image states with atlas crops, groups and rectangular clips, paths, editable text, geometry, pivots, and typed preset roles. It rejects missing roles/assets, conflicting role assignments, cycles, invalid crops, a blocked token that would cross its gap, and a state-change actor with fewer than two drawings.
- `compilePreparedScene` resolves a recipe into tracks and path-follow events. Frames are evaluated from absolute time, so scrubbing and rendering use the same result.
- `createIllustratedPreview` renders the prepared scene with Canvas 2D inside `renderer-core`. This is a deliberate implementation choice for alpha illustrations, paths, clipping, and text. It shares the Chromium/FFmpeg export pipeline with the existing WebGL renderer; there is no separate animation implementation embedded in the demo page.
- `PreparedAnimationEngine` verifies hashes/dimensions, exports the MP4, and records the compiled scene and result metadata. Existing output paths are rejected. The prepared format has explicit 24/30 fps metadata; the legacy image request contract remains 30 fps.
- The lab and CLI use the same compiler and drawing code. Scene JSON can be used outside the gallery.

### Run

```bash
pnpm illustrated:prepare
pnpm still-shift animate-scene \
  --scene benchmarks/fixtures/history-offstage-v2/resource-flow.json \
  --output /tmp/resource-flow-new.mp4

pnpm illustrated:render --output-dir benchmarks/results/history-offstage-v2/my-review
pnpm lab
# Open /illustrated.html from the lab, or use its Illustrated motion link.
```

Each export writes `.mp4`, `.mp4.scene.json`, and `.mp4.result.json`. The scene controls duration and frame rate. The six presets require compatible prepared inputs; `animate --input arbitrary.png` cannot infer their semantic structure.

## Verification

- Build and lint pass; all **52 unit tests** and **four CLI integration tests** pass. CLI integration needed local IPC permission for tsx; the sandbox-only attempt failed before running the CLI and passed when rerun with that permission.
- Seven prepared-scene unit cases cover schema failures, alternate frame rates, semantic stop points, deterministic seeking, and the exact authored-state contact boundary.
- The illustrated browser check compares seven frames per preset against the actual H.264 output: **42 comparisons**, including the frames immediately before and after the prop contact. It also checks first/last states differ, six alternate layouts render and seek deterministically, a 30 fps export produces 210 frames, and a tampered asset hash is rejected.
- The five existing golden scenes pass **30 preview/export comparisons**, without changing baselines.
- Four unchanged clips are byte-identical across the second and final export runs. The two clips with revised wording were exported and checked again. FFprobe confirms the joined reel is H.264, 1080p, 24 fps, 1,008 frames, and exactly 42 seconds; a full FFmpeg decode reports no errors.
- Visual inspection covers the six exported motion contact sheets and full-size compositions: transparent edges, path direction, stop gap, layer displacement, state registration, and readable labels. One overlapping resource label was moved below the art before final delivery.

Commands and machine-readable evidence:

```bash
pnpm build
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:golden
pnpm test:browser:illustrated --renders benchmarks/results/history-offstage-v2/review-v3
```

[Render measurements](../benchmarks/results/history-offstage-v2/review-v3/render-summary.json) and [frame comparisons](../benchmarks/results/history-offstage-v2/review-v3/parity-report.json) refer to the final review files. Checks ran on Node 24.16.0; the repository pins Node 22.23.1, so this is not a claim that the entire pinned-toolchain release gate passed.

## Practical limits and remaining decision

This establishes reusable motion from prepared illustrations. It does not demonstrate automatic segmentation, mask repair, background inpainting, or unseen pose synthesis from arbitrary episode stills. Alpha cutouts and rectangular group clipping are supported; an arbitrary mask-image editor is not included. The pose proof uses an empty/filled prop, not a walking character.

The current presets provide fixed relative event schedules scaled to clip length. They are not a general narration timeline editor. Labels use system serif/sans-serif fonts, so cross-machine typography can differ. The demonstrations carry qualitative relationships, not measured historical shares or dates.

Rendering time is measured separately from asset work. The final six exports took **17.47 seconds** in aggregate for 42 seconds of footage on this machine, excluding reel assembly and QA. Three image-generation calls were used; preparation time and provider cost were not instrumented. Full-production savings cannot be inferred from fast rendering alone.

The next human decision is whether the six treatments meet the channel's creative needs. Corpus selection/freezing, representative episode assembly, usability ratings, and total cost remain later Phase 0 gates.
