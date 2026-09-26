# Continuous storytelling implementation

Date: 2026-09-26. In progress on `codex/story-continuous-motion`.
The [implementation plan](story-motion-continuous-storytelling-plan.md) requires owner review after the Unequal Margins prototype (P2), before the other studies or narrated passages change.

## Calibration (P0)

The committed [baseline measurement](../benchmarks/results/story-motion-v012/motion-energy.json) uses full-resolution decoded greyscale, absolute difference >4 and at least 200 changed pixels per frame. Frame zero is excluded from the denominator because it has no predecessor. A synthetic half-pixel pan moves on all 191 comparisons; the known Unequal Margins hold at frames 150–191 remains frozen. No threshold increase was necessary.

The plan's older 480×270 “any pixel >6” percentages were **not reproduced** for several existing MP4s: that definition picks up isolated encoded/scale changes in apparently static frames. Both measurements are retained, not presented as interchangeable. Full-resolution moving shares round to 30%, 34%, 45%, 34%, 16%, 2%, 48% for the seven v012 clips. The stated ±2-point baseline reproduction criterion remains unverified; this does not change G1–G6 or the new calibrated threshold.

Reproduce calibration with pinned Node 22.23.1 and `node --import tsx scripts/story-motion/calibrate-energy.ts --output-dir <new-directory>`. Generated media goes into a new directory; the baseline JSON was added without replacing any existing output.
