# Continuous storytelling implementation

Date: 2026-09-26. **Status: P2 prototype ready for owner review** on `codex/story-continuous-motion`. Engine work is implemented; library roll-out, passage choreography and the lab timeline strip remain pending.
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

## Prototype checkpoint (P2)

- [Paired v012 / v013 review gallery](../benchmarks/results/story-motion-v013-proto/comparison.html)
- [Prototype MP4](../benchmarks/results/story-motion-v013-proto/unequal-margins.mp4)
- [Nine-frame contact sheet](../benchmarks/results/story-motion-v013-proto/after-nine-frames.jpg) and [390 px style frame](../benchmarks/results/story-motion-v013-proto/phone-frame-390.png)
- [390 px gallery capture](../benchmarks/results/story-motion-v013-proto/comparison-phone-390.png)
- [Pixel measurements](../benchmarks/results/story-motion-v013-proto/unequal-margins.motion-energy.json), [compiled diagnostics](../benchmarks/results/story-motion-v013-proto/quality-report.json), [browser parity](../benchmarks/results/story-motion-v013-proto/browser-checks.json) and [gallery checks](../benchmarks/results/story-motion-v013-proto/gallery-checks.json)

The review media lives in the local ignored render directory. Committed source and fixtures reproduce it. No existing render directory was overwritten; interrupted calibration/regression attempts have separate versioned directories.

| Gate                                |             v013 prototype |        Hard limit |
| ----------------------------------- | -------------------------: | ----------------: |
| G1, longest frozen run              |               **0 frames** |               ≤ 6 |
| G2, moving comparisons              |         **100%** (191/191) |             ≥ 97% |
| G3, gap between semantic event ends |              **40 frames** |              ≤ 48 |
| G4, peak/median changed pixels      |                 **3.897×** |            ≥ 2.5× |
| G5, essential-text velocity         |            **15.915 px/s** |              ≤ 20 |
| G6, declared cover planes           | **Pass at all 192 frames** | Complete viewport |

The calibrated v012 comparison had **29.84%** moving comparisons and a **79-frame** frozen run. These measurements use the new full-resolution metric, rather than claiming to reproduce the plan’s 27% downsampled baseline. The prototype render took **3.9 seconds**, compared with the recorded v012 range of about 4–5 seconds. This is one local render, not a performance benchmark.

The proposed camera (`960 → 1010 → 1290`) produced 170.29 px/s essential-text velocity, 6.23 px/frame pan and 0.00113 zoom/frame. The prototype reduces its keys to `(960,540,1.00)`, `(976,542,1.02)`, `(998,546,1.04)` at frames 0/110/191. Its maxima are 0.432 px/frame pan and 0.000366 zoom/frame. Titles, subheading and qualification remain screen-locked. The ground overscans horizontally; it is a lower scenery strip, not a full-screen cover plane. Paper is the declared full-screen cover.

The original beat sheet also leaves 52 frames between the pressure draw’s end (52) and the strain’s end (104). Completing the smaller margin response at frame 92 reduces this gap to 40 without adding decoration or changing the main strain window (48–104). Household B responds at 88–116; the strain current and micro-press continue through the end. Type sizes and all wording are preserved. The default seven-scene catalog and both narrated passages remain unchanged; the prototype has its own fixture directory.

**Creative concern:** peak energy occurs at **frame 14**, during the second house’s entrance. Although G4 passes, the strain response does not yet provide the shot’s strongest measured moment as the beat sheet intends. This remains an explicit review issue, not a claimed creative success. The 390 px sample retains clear household/label separation, but qualifications remain small at phone size. The owner’s rejection of larger type has been respected.

**Verification:** 188 unit tests, full lint, TypeScript build, pinned-toolchain verification, corpus schema validation and whole-project formatting checks pass. The existing browser suite passed 98 parity comparisons, 14 backward seeks, timing controls, phone layout, a 646-frame export and 30 fps CLI. The prototype adds nine preview/export parity checks, four backward seeks, encoded G1/G2/G4 assertions, complete-reveal text equality and exact strip recomposition. Paired gallery playback reaches the end, frame-90 scrubbing aligns both videos at 3.75 seconds, reduced-motion mode starts paused and the 390 px layout has no horizontal overflow.

**Scope of visual review:** a full-resolution late frame, nine-frame contact sheet, 390 px style frame and phone gallery capture were inspected. Automated normal-speed playback passed. This is sampled visual inspection plus technical playback evidence; it is not owner acceptance or a human continuous watch. There is no audio in this study. No narration or passage files were changed.

Reproduce under the pinned toolchain, always choosing a fresh output directory:

```sh
pnpm story:prepare --prototype
pnpm story:render --fixtures-dir benchmarks/fixtures/story-motion-v2 --output-dir <new-directory> --require-continuous-motion
node --import tsx scripts/story-motion/prototype-gallery.ts --after <new-directory>
node --import tsx tests/browser/story-continuous.ts --prototype <new-directory>
node --import tsx scripts/story-motion/check-prototype-gallery.ts --directory <new-directory>
```

The plan’s **“P2 Prototype, then STOP”** instruction applies here. Do not roll out the six remaining studies, modify narrated passages or claim final creative acceptance until the owner reviews this candidate and resolves the peak-emphasis concern. P3–P5 remain pending, including passage cue maps/handoff tests and the lab activity strip.
