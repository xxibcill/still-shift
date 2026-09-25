# Rising Vista and Curved Approach

Implemented 2026-09-26 in the shared Cinematic Parallax renderer (`cinematic-canvas-0.6.0`). Both use prepared depth planes, deterministic camera sampling, the existing lab and the MP4 exporter. Creative acceptance is pending.

## Review

[Two four-second previews](../benchmarks/results/cinematic-illustrated/path-variations-v1/index.html), each 1920×1080, 24 fps, 96 frames, Dramatic strength.

| Variation       | Camera behavior                                                                                                                 | Measured dramatic move                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Rising Vista    | Level upward camera translation; no anchor correction or zoom. A near grassy bank drops to expose more road and fields.         | Near moves down 200 px, terrain 50 px, distant plate 16.67 px.                       |
| Curved Approach | Quadratic Bézier camera path with forward travel and a fixed subject anchor. Near framing bends around the subject and settles. | Near scale +12.68%, room +4.71%, far +1.52%; subject anchor drift below 0.000001 px. |

These are two camera variations within the same parallax technique. The planes stay front facing: Curved Approach does not reconstruct or reveal unseen sides of objects. The landscape study contains a road and fields, without the building originally proposed in the backlog.

## Authoring

- `recipe.preset: "rising_vista"`: `camera.travel: [0, -40]`; no push or curve. Depths 1, 4 and 12. Dramatic/Standard/Restrained multiply vertical travel by 5/3.75/2.5. Near travel must visibly separate from the middle and far planes; per-frame vertical travel is bounded to 25% of frame height, middle to 10%, far to 6%.
- `recipe.preset: "curved_approach"`: `camera.travel: [30, 0]`, `camera.push: 0.18`, `camera.curve: [100, -40, 0.08]`. `curve` is the quadratic control point in authored camera x/y/depth units, between origin and the destination formed by travel plus push. Strength scales x/y by 3/2.25/1.5 and depth by 1/0.65/0.4. Curve depth must remain between start and destination; a collinear control is rejected. Subject growth stays between 0.5% and 12%, anchor drift within 0.01 px, every plane within 30% width/25% height displacement and 1.5× scale.
- Both hold briefly, move from approximately 4% to 92% of the timeline, and hold the ending. Dramatic peaks earlier; Standard and Restrained use symmetric easing. Duration changes pacing while preserving the path.
- Every frame retains background coverage, authored cut-edge, protected-region, depth-crossing and source-resolution checks. Maximum source upscaling remains 1.5×. Vertical displacement has dedicated result metrics; horizontal travel remains zero for Rising Vista.

Rising Vista reuses the existing generated landscape as a far plate and adds two generated RGBA layers. [Prompts](../assets/cinematic-illustrated/kit-c-vista/prompts.md) and [provenance](../assets/cinematic-illustrated/kit-c-vista/provenance.json) record both calls and unchanged PNG outputs. Curved Approach reuses the prepared storage-room assets. No retired corpus image is used or reinstated.

## Reproduce

```sh
pnpm cinematic:prepare
pnpm cinematic:preview --scene benchmarks/fixtures/cinematic-illustrated/ci-04-rising-vista.json --duration 4 --output benchmarks/results/cinematic-illustrated/my-paths/rising.mp4
pnpm cinematic:preview --scene benchmarks/fixtures/cinematic-illustrated/ci-07-curved-approach.json --duration 4 --output benchmarks/results/cinematic-illustrated/my-paths/curved.mp4
node --import tsx tests/browser/parallax-paths.ts benchmarks/results/cinematic-illustrated/my-paths
```

Use new output paths. Both fixtures appear in the lab's **Cinematic Parallax · variations** group with strength and duration controls.

## Verification

- TypeScript build, targeted ESLint and 78 unit tests pass, including new direction, depth separation, curve shape, determinism, interior coverage and invalid-input cases.
- Both actual assets compile at all three strengths, 3/4/8 seconds and 24/30 fps: 36 configurations, checking every frame.
- Two four-second 24 fps exports have exact dimensions, frame counts and durations. Ten sampled lab/export frames pass parity with no browser errors. See [QA data](../benchmarks/results/cinematic-illustrated/path-variations-v1/qa.json).
- Inspected first/middle/last rendered frames for framing, seams and motion separation. No full Phase 0 or pinned-toolchain gate is claimed: this run used Node 24.16.0 rather than pinned 22.23.1. The 30 fps check covers camera compilation, not a new 30 fps video export.
