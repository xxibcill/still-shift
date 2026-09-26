# Illustrated editorial presets — Phase 0 trial

**Status:** First trial implemented; owner found it too basic on 2026-09-25.
It does not satisfy the requested History Offstage animation quality.
The [replacement analysis and motion plan](./history-offstage-motion-plan.md)
has now been implemented as [six richer prepared-scene presets](./history-offstage-motion-implementation.md), with a 42-second review reel. Creative review and Phase 0 gates remain open. This document preserves the first trial's behavior and evidence.

`locked_hold` is a static timing utility, not an animated treatment. Its technical
render success should not be counted as evidence of animation variety.

History Offstage's Layered Chronicle style calls for authored holds, short panel
changes, and purposeful motion. The four opt-in presets below use intentional
flat 2D rendering. They normalize the source image but skip depth inference and
do not deform linework, figures, text, or halftone patterns with a depth map.
The original three depth presets and the `auto` choice remain unchanged.

| Preset            | Treatment                                                                                 | Use when                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `locked_hold`     | Keep the entire frame still.                                                              | Narration, evidence, or detailed illustration needs uninterrupted reading time.                   |
| `story_settle`    | Push 0.8–2% during the first 21 frames, then hold.                                        | An authored scene needs one brief entrance emphasis. Do not apply as idle motion.                 |
| `panel_reveal`    | Reveal left to right over 12–20 frames, then hold.                                        | The complete frame is composed for that reading order and has a suitable clear background corner. |
| `comparison_step` | Hold the left half, reveal the right half after the opening hold, then keep both visible. | A balanced two-panel comparison has its divider at the center.                                    |

For `panel_reveal` and `comparison_step`, intensity changes the reveal duration:
`subtle` uses 20 frames, `standard` 16, and `strong` 12. The final source frame is
fully visible; neither preset changes source pixels after the reveal. The hidden
area uses the source's upper-left background color so a prepared bone-field
illustration does not gain a mismatched fill.

## Local review

The [four-clip local gallery](../benchmarks/results/history-offstage-preset-demo/index.html)
uses three [original synthetic fixtures](../benchmarks/fixtures/history-offstage/README.md).
No selected episode still was rendered, edited, or copied into the fixtures.
The 43 images retired from the earlier candidate remain retired. The four clips
are three seconds, 1920×1080, 30 fps, and 90 frames each. All four exported
without warnings or safety fallbacks.

To render an authored image with a chosen flat preset:

```bash
pnpm still-shift animate \
  --input /path/to/cleared-image.png \
  --output /path/to/clip.mp4 \
  --duration 3 \
  --preset panel_reveal
```

For a future corpus evaluation, pass the same explicit preset list to
`evaluation:prepare`, `evaluation:gallery`, and `evaluation:assemble`:

```text
--presets locked_hold,story_settle,panel_reveal,comparison_step
```

The default evaluation list remains the historical three depth presets.
`evaluation:report` reads the prepared job list, so its clip count follows the
chosen list.

## Limits and release status

These treatments work on a single flattened still. They can show or hold a
composition, but cannot independently draw a causal path, substitute an object,
or move a character without authored layers, masks, clean plates, and anchors.
Use a panel preset only when its reveal order explains the shot. This single-image
input outputs 30 fps; the prepared-scene input supports 24/30 fps. The History Offstage style bible normally uses a 24 fps
master. These clips are Phase 0 engineering previews, not episode-ready exports.

The episode's selected-image treatment restrictions still apply before any new
render using those sources. A new representative corpus must be chosen and
frozen before these presets can support Phase 0 acceptance. The existing
synthetic demos and retired 43-image run do not satisfy that gate.

## Verification

- `pnpm test:unit`: 45 tests passed, including flat-mode, hold, reveal, and
  deterministic frame checks.
- `pnpm test:browser:depth`: source-only flat preview and mask visibility passed
  alongside the existing depth and fallback checks.
- `pnpm test:golden`: 30 legacy preview/export comparisons passed without a
  baseline update.
- `pnpm build` and `pnpm lint` passed. The four local MP4s rendered successfully.
