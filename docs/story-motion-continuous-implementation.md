# Continuous storytelling implementation

Date: 2026-09-26. In progress on `codex/story-continuous-motion`.
The [implementation plan](story-motion-continuous-storytelling-plan.md) requires owner review after the Unequal Margins prototype (P2), before the other studies or narrated passages change.

## Calibration (P0)

The committed [baseline measurement](../benchmarks/results/story-motion-v012/motion-energy.json) uses full-resolution decoded greyscale, absolute difference >4 and at least 200 changed pixels per frame. Frame zero is excluded from the denominator because it has no predecessor. A synthetic half-pixel pan moves on all 191 comparisons; the known Unequal Margins hold at frames 150–191 remains frozen. No threshold increase was necessary.

The plan's older 480×270 “any pixel >6” percentages were **not reproduced** for several existing MP4s: that definition picks up isolated encoded/scale changes in apparently static frames. Both measurements are retained, not presented as interchangeable. Full-resolution moving shares round to 30%, 34%, 45%, 34%, 16%, 2%, 48% for the seven v012 clips. The stated ±2-point baseline reproduction criterion remains unverified; this does not change G1–G6 or the new calibrated threshold.

Reproduce calibration with pinned Node 22.23.1 and `node --import tsx scripts/story-motion/calibrate-energy.ts --output-dir <new-directory>`. Generated media goes into a new directory; the baseline JSON was added without replacing any existing output.

## Engine (P1)

Optional camera, choreography, text reveal, flows and path pinching are implemented. Legacy scenes retain renderer version `story-canvas-0.13.3`; v2 opts into `story-canvas-0.14.0`. The camera uses monotone Hermite interpolation with endpoint-only sine time profiles whose velocity is continuous at interior keys. Explicit boundary tangents support passage handoffs. Bound connectors project each endpoint through its own root depth.

The continuous analyzer reports frozen runs, gaps between semantic event ends, essential-text screen velocity, camera speed and restriction-band/text envelopes. Text bounds use authored dimensions when supplied and a conservative width estimate otherwise; the browser remains the optical check. Continuous policy disables the previous final-hold diagnostic. Render commands accept `--require-continuous-motion` and retain measurements before reporting failed gates. Existing export CLI status codes are unchanged.

All 1,344 decoded frames from seven v012 fixtures matched the baseline exactly in `story-motion-legacy-regression-v002/legacy-pixels.json`. Browser checks establish that complete text reveals equal the original single `fillText` output, left/center/right wipes start at their visual left edges, and backward seeks are identical. V2 caches a complete raster of each SVG so clipped strips recompose with **zero channel difference**; drawing the SVG separately under each clip had exposed browser-dependent rasterization differences. Legacy SVG drawing is unchanged.

The art keeps all original flattened bytes and adds six decomposed layers. Land's base is a wash, not a separate cast shadow, so the decomposition retains that meaning. Ground overscan is opt-in to preserve old prepared fixtures. Tests now exclude cached copies under `.pnpm-store`; those copies previously introduced unrelated stale test failures. A small encoder-stream handler preserves the originating error during cleanup instead of crashing with an unhandled EPIPE.

The existing story browser suite passed 98 preview/export comparisons, 14 backward seeks, timing controls, phone layout, the exact 646-frame export and 30 fps CLI. Build and full lint passed. The full unit run passed 186 tests; two additional choreography checks subsequently passed, including repeated stamps beginning at their own authored windows. Browser tests must run without concurrent source edits or competing Vite dependency optimization.
