# Focus Handoff

Implemented 2026-09-26 after [primary-source research](./focus-handoff-research.md). CI-06 is the eighth treatment in the shared Cinematic Parallax system. Creative acceptance is pending.

## Review

[Four-second preview](../benchmarks/results/cinematic-illustrated/focus-v1/index.html) · 1920×1080 · 24 fps · 96 frames · Dramatic.

The near masonry begins sharp while the courtyard figure is soft. Focus transfers to the figure, leaving the masonry soft. Existing Kit B artwork is reused without generation or image edits. The destination's position, scale, pose and opacity remain fixed. This is a simulated layer-local focus pull; it does not model optical bokeh or lens breathing. It is clearest at full size and remains a restrained treatment at small display sizes.

## Authoring and rendering

```json
{
  "camera": {
    "travel": [4, 0],
    "anchor": [0.3, 0.5],
    "focus": { "maxBlurPx": 4, "transition": [0.25, 0.65] }
  },
  "recipe": {
    "preset": "focus_handoff",
    "foreground": "foreground",
    "subject": "subject",
    "background": "background",
    "intensity": "dramatic"
  }
}
```

- Focus moves from the foreground's depth to the subject's depth. Smoothstep interpolates reciprocal focus depth; each plane's reciprocal-distance mismatch maps to bounded Gaussian sigma in output pixels. This is a deterministic authored approximation.
- Dramatic/Standard/Restrained have maximum blur 4/3/2 px for this fixture. At Dramatic, foreground goes 0→4 px, subject 4→0 px, and background 4→0.667 px. All planes keep scale 1 and focal scale 1.
- The selected timing holds near emphasis for approximately one second, transfers focus until 2.6 seconds, then holds the ending. This tunes the research's initial timing proposal to a longer transfer. Camera drift settles at the same time.
- Supporting foreground travel is 12/9/6 px across the three strengths; Dramatic background travel is 2 px. Every plane is capped at 1% of frame width. Subject anchor drift is below 0.000001 px.
- `camera.focus` is required and exclusive to this recipe. Blur is limited to 1–4 px before strength scaling; the forward transition stays within 10–80% of the timeline and lasts at least 15%. Vertical travel, push, pullback and curved motion are rejected. Zero lateral travel is supported.
- Renderer `cinematic-canvas-0.8.0` applies Canvas Gaussian blur before compositing each image. Focus scenes omit the image rectangle clip so blur can extend across alpha silhouettes; frame clipping remains. Filters use output coordinates and are isolated by save/restore, with `none` on sharp draws. Other recipes retain their existing image clipping.
- Unsupported Canvas filter runtimes fail explicitly. Painted background coverage and attached cut edges must retain three sigma of overscan. Near card bounds, expanded by that blur allowance, must stay clear of the protected destination. This conservative visibility gate may reject harmless transparent-card overlap.

## Verification

- TypeScript build, targeted lint/formatting and all 86 unit tests pass. New tests cover focus endpoints and holds, monotonicity, seeking, strength, 24/30 fps, invalid settings, small motion, blurred edge coverage and destination visibility including the blur halo.
- All 18 combinations of three strengths, 3/4/8 seconds and 24/30 fps compile with per-frame checks.
- Real 24 fps export has exact dimensions, duration and 96 frames. Five sampled lab/export frames cover opening, transfer start, midpoint, focus completion and ending; all pass parity without browser errors. [QA data](../benchmarks/results/cinematic-illustrated/focus-v1/qa.json).
- Actual artwork pixel checks with camera drift disabled confirm foreground high-frequency energy falls from 40.34 to 1.65, while the subject's rises from 7.70 to 95.33. Re-rendering the opening reproduces the same measurements.
- A synthetic red card on white checks that blur extends beyond the source rectangle without black fringing, sharp rendering restores the clear edge, frame corners remain covered, and missing filter support throws the expected error.
- Inspected first/middle/last frames and full-size opening/ending: the visible handoff, figure outline and frame coverage remain coherent. The browser test required a module-loaded probe to avoid a TypeScript callback-serialization issue; the product render was unaffected.
- This targeted run used Node 24.16.0 rather than pinned 22.23.1. The 30 fps check covers camera/focus sampling and compilation, not a separate exported video. No full Phase 0 gate is claimed.

```sh
pnpm cinematic:prepare
pnpm cinematic:preview --scene benchmarks/fixtures/cinematic-illustrated/ci-06-focus-handoff.json --duration 4 --strength dramatic --output benchmarks/results/cinematic-illustrated/my-focus/focus.mp4
node --import tsx tests/browser/parallax-paths.ts benchmarks/results/cinematic-illustrated/my-focus focus_handoff
```

Use a new output directory. The lab lists **Focus Handoff · From stone to figure** with strength and duration controls.
