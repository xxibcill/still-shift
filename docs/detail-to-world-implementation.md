# Detail to World

Implemented 2026-09-26 after the [primary-source research](./detail-to-world-research.md). CI-05 is the seventh variation in the existing Cinematic Parallax family. Creative acceptance remains pending.

## Review

[Four-second preview](../benchmarks/results/cinematic-illustrated/detail-v1/index.html) · 1920×1080 · 24 fps · 96 frames · Dramatic.

The opening favors the vessel; the retreat reveals more chamber and incoming doorway framing. Kit A's grounded vessel, floor, room, distant plate and tall posts are reused without new image generation. This is a tighter-to-wider composition with the existing artwork, not a macro detail shot.

## Camera contract

```json
{
  "camera": {
    "travel": [0, 0],
    "pullback": 0.65,
    "anchor": [0.6070574162679426, 0.5844845908607864]
  },
  "recipe": {
    "preset": "detail_to_world",
    "foreground": "left",
    "subject": "room",
    "background": "far",
    "intensity": "dramatic"
  }
}
```

The scene file defines the final wide composition at z=0. The camera starts at positive `pullback` depth and retreats to zero, with focal scale fixed at 1. `pullback` is positive and exclusive to this variation; lateral travel, push and curve are rejected. Dramatic/Standard/Restrained scale the starting depth by 1/0.75/0.5. All strengths finish on the same authored composition.

The move starts at 6% and settles at 82% of the timeline, leaving time to read the ending. Dramatic uses the existing early-peaking easing; other strengths use smoothstep. Absolute-frame sampling supports seeking and repeatability. Renderer version: `cinematic-canvas-0.7.0`.

| Plane         | Depth | Opening scale | Ending scale | Reduction from opening |
| ------------- | ----- | ------------- | ------------ | ---------------------- |
| Doorway posts | 1.6   | 1.6842        | 1            | 40.63%                 |
| Vessel / room | 3     | 1.2766        | 1            | 21.67%                 |
| Distant plate | 12    | 1.0573        | 1            | 5.42%                  |

New `foregroundScaleReduction`, `subjectScaleReduction` and `backgroundScaleReduction` result fields report fractional shrink from opening. Existing scale-change fields report the greatest endpoint magnification above the authored frame. Horizontal and vertical travel metrics now measure opening-to-ending displacement; previous variations start at the authored frame and retain their existing values.

## Gates

- Every frame checks painted background coverage, attached image edges, protected subject framing, source density and depth clearance. Minimum background margin is 45.31 px; minimum source density is 0.67166 source pixels/output pixel, just above the existing 2/3 limit.
- The protected vessel region must not overlap any nearer image card's projected bounding rectangle. This conservative geometry check also excludes any possible alpha overlap; it can reject a transparent-card overlap that would look harmless. Both posts remain clear for every frame.
- Subject shrink must be 4–30%; near shrink at least 1.6× subject shrink and no more than 55%; far shrink no more than half the subject's and no more than 12%. These are project guardrails, not cinematography rules.
- Per-plane displacement stays within 65% of frame width and 60% of height, with maximum 2.25× projection scale, still subject to the stricter source-density limit. The subject anchor remains fixed to numerical precision.

## Verification and reproduction

- TypeScript build, targeted ESLint, formatting and all 82 unit tests pass. New cases cover monotonic depth-dependent shrink, stable anchor/focal length, invalid camera combinations, opening resolution, final coverage, depth crossing, foreground obstruction and insufficient depth separation.
- Both 24/30 fps, all strengths and 3/4/8-second durations compile with per-frame checks: 18 configurations.
- The real four-second 24 fps video has exact frame count, dimensions and duration; all five sampled lab/export comparisons pass without browser errors. [QA data](../benchmarks/results/cinematic-illustrated/detail-v1/qa.json).
- First/middle/last frames and the full-size ending were inspected for composition, visible context, exposed edges and vessel clarity.
- This targeted run used Node 24.16.0 instead of pinned 22.23.1. It does not claim the full Phase 0 gate or a new 30 fps video export.

```sh
pnpm cinematic:prepare
pnpm cinematic:preview --scene benchmarks/fixtures/cinematic-illustrated/ci-05-detail-to-world.json --duration 4 --strength dramatic --output benchmarks/results/cinematic-illustrated/my-detail/detail.mp4
node --import tsx tests/browser/parallax-paths.ts benchmarks/results/cinematic-illustrated/my-detail detail_to_world
```

Use a new output directory. The lab lists **Detail to World · The vessel and its chamber** under **Cinematic Parallax · variations**, with strength and duration controls.
