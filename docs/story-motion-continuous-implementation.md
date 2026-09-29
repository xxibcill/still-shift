# Continuous storytelling implementation

Updated: 2026-09-29. **Status: seven-study technical candidate rendered; plan-specific creative items pending.** Engine work, the Lab activity strip and seven opt-in continuous studies are implemented. The owner reported S01E01 published and excluded further episode passage work. The [implementation plan](story-motion-continuous-storytelling-plan.md) calls for owner review after the Unequal Margins prototype (P2). The owner's later instruction to continue Still Shift implementation authorized the standalone P3 studies. The published episode and its narrated passages were not changed.

## Calibration (P0)

The committed [baseline measurement](../benchmarks/results/story-motion-v012/motion-energy.json) uses full-resolution decoded greyscale, absolute difference >4 and at least 200 changed pixels per frame. Frame zero is excluded from the denominator because it has no predecessor. A synthetic half-pixel pan moves on all 191 comparisons; the known Unequal Margins hold at frames 150–191 remains frozen. No threshold increase was necessary.

The first draft's 480×270 any-pixel rule did not reproduce the recorded v012 table: isolated encode/scale changes gave false motion shares as high as 92% for Evidence Boundary. The reconciled method counts a frame as moving when **at least 7 pixels** each change by more than 6 grey levels. With that noise floor, the seven study MP4s reproduce the table's shares exactly after rounding: 27%, 34%, 42%, 33%, 17%, 2%, 47%. `calibrate-energy.ts` now asserts each share is within ±2 percentage points and records the MP4 hashes and comparisons in the committed baseline JSON. This seven-study P0 gate excludes the separately rendered 1507-frame resource passage; its v003 MP4 measures 18.13% moving and a 6.58 s longest freeze under the same rule. The plan corrects that row and Dated System Break's longest freeze (2.96 s). The full-resolution G1/G2/G4 method remains separate and unchanged; its seven v012 moving shares round to 30%, 34%, 45%, 34%, 16%, 2%, 48%.

Reproduce calibration with pinned Node 22.23.1 and `node --import tsx scripts/story-motion/calibrate-energy.ts --output-dir <new-directory>`. If the ignored v012 MP4s are unavailable, first render the seven legacy fixtures with `pnpm story:render --output-dir <fresh-v012-media-directory>`, then pass `--baseline <fresh-v012-media-directory>` to calibration. The committed JSON records each measured MP4's SHA-256. Generated media goes into new directories; the committed baseline JSON was refreshed without replacing any existing MP4.

## Engine (P1)

Optional camera, choreography, text reveal, flows and path pinching are implemented. Legacy scenes retain renderer version `story-canvas-0.13.3`; v2 opts into `story-canvas-0.14.0`. The camera uses monotone Hermite interpolation with endpoint-only sine time profiles whose velocity is continuous at interior keys. Explicit boundary tangents support passage handoffs. Bound connectors project each endpoint through its own root depth.

The continuous analyzer reports frozen runs, gaps between semantic event ends, essential-text screen velocity, camera speed and restriction-band/text envelopes. Text bounds use authored dimensions when supplied and a conservative width estimate otherwise; the browser remains the optical check. Continuous policy disables the previous final-hold diagnostic. Render commands accept `--require-continuous-motion` and retain measurements before reporting failed gates. Existing export CLI status codes are unchanged.

All 1,344 decoded frames from seven v012 fixtures matched the baseline exactly in `story-motion-legacy-regression-v002/legacy-pixels.json`. Browser checks establish that complete text reveals equal the original single `fillText` output, left/center/right wipes start at their visual left edges, and backward seeks are identical. V2 caches a complete raster of each SVG so clipped strips recompose with **zero channel difference**; drawing the SVG separately under each clip had exposed browser-dependent rasterization differences. Legacy SVG drawing is unchanged.

The art keeps all original flattened bytes and adds six decomposed layers. Land's base is a wash, not a separate cast shadow, so the decomposition retains that meaning. Ground overscan is opt-in to preserve old prepared fixtures. Tests now exclude cached copies under `.pnpm-store`; those copies previously introduced unrelated stale test failures. A small encoder-stream handler preserves the originating error during cleanup instead of crashing with an unhandled EPIPE.

The existing story browser suite passed 98 preview/export comparisons, 14 backward seeks, timing controls, phone layout, the exact 646-frame export and 30 fps CLI. Build and full lint passed. The full unit suite passed 204 tests, including the PR review regressions. Browser tests must run without concurrent source edits or competing Vite dependency optimization.

## Prototype checkpoint (P2)

- [Paired v012 / v013 review gallery](../benchmarks/results/story-motion-v013-proto-reviewed-d/comparison.html)
- [Prototype MP4](../benchmarks/results/story-motion-v013-proto-reviewed-d/unequal-margins.mp4)
- [Nine-frame contact sheet](../benchmarks/results/story-motion-v013-proto-reviewed-d/after-nine-frames.jpg) and [390 px style frame](../benchmarks/results/story-motion-v013-proto-reviewed-d/phone-frame-390.png)
- [390 px gallery capture](../benchmarks/results/story-motion-v013-proto-reviewed-d/comparison-phone-390.png)
- [Pixel measurements](../benchmarks/results/story-motion-v013-proto-reviewed-d/unequal-margins.motion-energy.json), [compiled diagnostics](../benchmarks/results/story-motion-v013-proto-reviewed-d/quality-report.json), [browser parity](../benchmarks/results/story-motion-v013-proto-reviewed-d/browser-checks.json) and [gallery checks](../benchmarks/results/story-motion-v013-proto-reviewed-d/gallery-checks.json)

The review media lives in the local ignored render directory. Committed source and fixtures reproduce it. No existing render directory was overwritten; interrupted calibration/regression attempts have separate versioned directories.

| Gate                                |             v013 prototype |        Hard limit |
| ----------------------------------- | -------------------------: | ----------------: |
| G1, longest frozen run              |               **0 frames** |               ≤ 6 |
| G2, moving comparisons              |         **100%** (191/191) |             ≥ 97% |
| G3, gap between semantic event ends |              **44 frames** |              ≤ 48 |
| G4, peak/median changed pixels      |                 **2.984×** |            ≥ 2.5× |
| G5, essential-text velocity         |            **18.506 px/s** |              ≤ 20 |
| G6, declared cover planes           | **Pass at all 192 frames** | Complete viewport |

The calibrated v012 comparison had **29.84%** moving comparisons and a **79-frame** frozen run under the full-resolution metric. The separate downsampled P0 calibration reproduces its 27% baseline share under the reconciled method (§0). The prototype render took **4.0 seconds**, compared with the recorded v012 range of about 4–5 seconds. This is one local render, not a performance benchmark.

G3, G4 and G5 pass their hard limits but miss the plan's tighter targets of ≤ 36 frames, ≥ 3× and ≤ 12 px/s. The 2.984× G4 result is 0.016× below target.

The proposed camera (`960 → 1010 → 1290`) produced 170.29 px/s essential-text velocity, 6.23 px/frame pan and 0.00113 zoom/frame. The reviewed prototype uses `(930,540,1.00)`, `(936.283,540.471,1.002356)`, `(1003.717,545.529,1.027644)`, `(1010,546,1.03)` at frames 0/15/176/191. Its maxima are 0.621 px/frame pan and 0.000226 zoom/frame. Of 191 transitions, 181 stay within R7's 0.4–2.5 px/frame sustained-travel range; the first and last five ease into and out of motion below 0.4. Titles, subheading and qualification remain screen-locked. The ground overscans horizontally; it is a lower scenery strip, not a full-screen cover plane. Opaque paper is the declared full-screen cover.

The smaller margin response still finishes at frame 92 without changing the main strain window (48–104). The PR review revision staggers the house set-downs through frames 42 and 76, then compresses household B during frames 77–85 while household A's art recedes during frames 80–88. The strongest encoded change now falls at **frame 81 (137,536 pixels)** inside the strain beat; the largest earlier entrance change is 124,778 pixels at frame 34. The longest semantic gap is 44 frames (120→164). The strain current and micro-press continue through the end. Type sizes and all wording are preserved. The default seven-scene catalog and both narrated passages remain unchanged; the prototype has its own fixture directory.

**Creative concern:** the measured peak now lands in the strain response, but the fading of household A contributes more changed pixels than the margin line itself. The owner still needs to judge whether the unequal margin is the strongest perceived idea. The 390 px sample retains household/label separation, but qualifications remain small at phone size. The owner’s rejection of larger type has been respected.

**Verification:** 204 unit tests, full lint, TypeScript build and whole-project formatting checks pass after PR review. Pinned-toolchain verification and corpus schema validation passed earlier. The existing browser suite passed 98 parity comparisons, 14 backward seeks, timing controls, phone layout, a 646-frame export and 30 fps CLI. The prototype adds nine preview/export parity checks, four backward seeks, encoded G1/G2/G4 assertions, a peak-frame assertion for the shared-strain beat, complete-reveal text equality and exact strip recomposition. Paired gallery playback reaches the end, frame-90 scrubbing aligns both videos at 3.75 seconds, reduced-motion mode starts paused and the 390 px layout has no horizontal overflow.

**Scope of visual review:** a full-resolution late frame, nine-frame contact sheet, 390 px style frame and phone gallery capture were inspected. Automated normal-speed playback passed. This is sampled visual inspection plus technical playback evidence; it is not owner acceptance or a human continuous watch. There is no audio in this study. No narration or passage files were changed.

Reproduce under the pinned toolchain, always choosing a fresh output directory:

```sh
pnpm story:prepare --prototype
pnpm story:render --fixtures-dir benchmarks/fixtures/story-motion-v2 --output-dir <new-directory> --require-continuous-motion
node --import tsx scripts/story-motion/prototype-gallery.ts --after <new-directory>
node --import tsx tests/browser/story-continuous.ts --prototype <new-directory>
node --import tsx scripts/story-motion/check-prototype-gallery.ts --directory <new-directory>
```

The P2 artifact remains a checkpoint. The later owner instruction to continue authorized P3 technical roll-out, while creative acceptance of the P2 and P3 emphasis remains open. P4 episode passage choreography is outside the current scope after the owner reported publication.

## Standalone study library (P3)

The opt-in `--continuous` preparation mode generates seven 192-frame, 24 fps fixtures in `benchmarks/fixtures/story-motion-continuous/`: the P2 Unequal Margins design and six additional studies. The default legacy catalog and its preparation command remain unchanged. P3 has a fresh [render index](../benchmarks/results/story-motion-v013-continuous-p3-20260929-i/index.html), 16-frame contact sheets, encoded energy JSON per clip, compiled quality report and exact-cut PNGs. A separate [synchronized paired comparison gallery](../benchmarks/results/story-motion-v013-continuous-p3-20260929-sync-check/comparison.html) and [browser playback report](../benchmarks/results/story-motion-v013-continuous-p3-20260929-sync-check/gallery-checks.json) use a copy of the verified -i media. These local media directories are ignored by Git; the source and fixtures reproduce them. The paired baseline is a fresh replay of the checked-in legacy fixtures in `story-motion-v012-replay-20260929/`, not a claim that all seven MP4 bytes match the older saved v012 render.

| Study              | G1 frozen frames | G2 moving | G3 gap | G4 peak/median | G5 text px/s | Peak frame |
| ------------------ | ---------------: | --------: | -----: | -------------: | -----------: | ---------: |
| Unequal Margins    |                0 |      100% |     44 |          2.99× |        18.51 |         81 |
| Access Constraint  |                0 |      100% |     36 |          2.61× |            0 |         90 |
| Relationship Build |                0 |      100% |     36 |          3.72× |         4.46 |        120 |
| Evidence Boundary  |                0 |      100% |     22 |          8.71× |        10.84 |        158 |
| Dated System Break |                0 |      100% |     30 |        124.42× |         9.58 |        120 |
| Category Swap      |                0 |      100% |     36 |          5.37× |            0 |         72 |
| Motif Resolve      |                0 |      100% |     29 |          3.80× |        11.11 |         45 |

All seven pass the hard G1–G5 limits, and compilation verifies G6 cover-plane coverage at every frame. Maximum camera motion across the library is 1.350 px/frame pan and 0.000650/frame zoom, within R7. Camera paths are milder than the illustrative values in §§5.2–5.7 because those values exceeded R7 or moved essential labels faster than G5 allows in this composition. The smaller pans retain continuous parallax and keep titles, labels and qualifications readable. At normal speed, the seven paired videos reached their ends in Chromium, each with an eight-second duration and no video or page error; frame-90 scrubbing aligned each pair at 3.75 seconds. The comparison gallery uses shared controls to keep pairs synchronized. Simulated one-sided pause and stall paused and realigned both videos before resume. A 390 px viewport had no horizontal overflow. This is automated playback plus sampled contact/full-frame visual review, not owner acceptance or a human continuous watch.

The exact category cut changes the basket state, caption state and current colour at **frame 72**; frame 71 still shows the first category. The encoded cut changes 160,958 pixels, compared with 27,025 on frame 71. The dated cut switches from the 1315–17 crisis at **frame 119** to a distinct Walsham 1327–29 context at **frame 120**, changing 2,015,664 pixels. The new household settles after the cut; frame 120 itself establishes the separate date and local context. [Cut stills and counts](../benchmarks/results/story-motion-v013-continuous-p3-20260929-i/exact-cut-review.json) support the compiled-state assertions in `tests/integration/story-continuous-library.test.ts`.

The strongest measured moment is semantically aligned in Access (route pinch/household response), Relationship (claim pull), Category (the exact swap) and Unequal Margins (strain response, with the P2 caveat below). Evidence deliberately moves its largest moment from the plan's composite assembly to the final full evidence-boundary reveal at frame 158. The final tableau keeps **Supported**, **Exact details Unknown** and **Composite** visible together, with the qualifier intact. Dated System Break's exact context cut is much larger in pixel energy than the preceding break; this preserves the mandated sharp change of place and time but differs from the plan's proposed break peak. Motif Resolve still peaks at frame 45 when land arrives. The land→rent/service arrow was thickened and its draw concentrated to frames 116–130, followed by red outgoing current and the rent/service label; the arrival remains stronger in encoded energy. The recipe requires the motif regrouping moves before `resolve`, so simply moving the land arrival past the arrow is invalid. Motif therefore **does not meet the intended R4 story emphasis**, despite passing G4's numerical contrast gate. These are creative review exceptions, not hidden gate passes.

The authored fixtures deliberately differ from several illustrative entrances in the plan. Access leaves the grain source and two households present before the pinch; Relationship leaves its initial store present before land and access arrive; Motif leaves the household present from the opening frame. Dated System Break has no camera jolt at frame 74. The -i design uses the system lines, destination drop and exact context cut for that break. These omissions keep the named actions from being displaced by large-art entrances or a camera speed violation. They remain open plan deviations, not silently completed beats.

Two bounded revisions were measured in separate ignored render directories and then reverted. In `story-motion-v013-continuous-p3-20260929-j/`, Access set-downs moved its peak to frame 4 (180,283 changed pixels), Motif still peaked on an early arrival at frame 22 (73,013 versus 41,045 at the arrow), and a 2 px jolt drove Dated camera pan to 3.030 px/frame, above R7. In `story-motion-v013-continuous-p3-20260929-k/`, staggered linear arrivals restored Access's pinch peak at frame 90 but lowered G4 contrast to 2.21×; Relationship's initial store fade moved its peak from claims to frame 26; Motif peaked at frame 4 (80,349 pixels); and a smaller Dated jolt passed R7 at 2.278 px/frame but was too slight to carry the proposed break emphasis. The verified -i study source and fixtures were restored. No new household fade was kept to force the measurements.

The P2 Unequal Margins concern remains: household A's fading art contributes more changed pixels than the margin line at its strain peak. Other residuals are the subtle contrast between the two access flows at phone size and the locally small labels in Relationship and Evidence at phone playback size. The current designs preserve the approved typography roles and qualification wording; a future creative pass should judge whether the named action reads most strongly at normal viewing size before treating the library as accepted.

Reproduce with pinned Node 22.23.1 and fresh output paths:

```sh
pnpm story:prepare --continuous
pnpm story:render --fixtures-dir benchmarks/fixtures/story-motion --output-dir <new-legacy-replay-directory>
pnpm story:render --fixtures-dir benchmarks/fixtures/story-motion-continuous --output-dir <new-p3-directory> --require-continuous-motion
node --import tsx scripts/story-motion/continuous-library-gallery.ts --before <new-legacy-replay-directory> --after <new-p3-directory>
node --import tsx scripts/story-motion/check-continuous-library-gallery.ts --directory <new-p3-directory>
pnpm exec vitest run tests/integration/story-continuous-library.test.ts
```

The comparison gallery and playback checker are opt-in; no default render or Lab catalog is replaced. The P3 regression compiles all seven, asserts G3/G5/G6/R7, final living currents, category states at 71/72, the dated reset at 119/120 and the final three-part evidence tableau. The final `pnpm check` passed on 2026-09-29: toolchain, schema, package boundaries, formatting, lint, TypeScript, 494 unit tests, 43 runtime tests, 104 integration tests, 14 depth tests and all configured browser suites. The existing Story browser suite passed 98 parity comparisons and 14 backward seeks. These checks establish engineering behavior; the creative exceptions above remain open.

## Lab activity strip (P5 slice)

The Story recipe Lab now shows carrier, action, response and current activity below the scrubber. Each coloured frame records a change from its predecessor, sampled from the compiled camera, flow tokens, node tracks and Motion Craft layers/drivers. An authored event window with no actual change stays uncoloured. Continuous V2 scenes also show frozen-run, semantic-gap and essential-text-velocity diagnostics with seek buttons.

The focused browser test checks a 192-frame study with a static camera, an active pan and another static interval; only the pan appears in the carrier row. It checks timing edits, collection switching and a phone-width viewport. The 192-frame V2 controls refreshed in 13 ms under pinned Node 22.23.1 and local Chromium; the test allows up to 2.5 seconds to catch a regression, not as a product performance promise. The integrated `pnpm check` passed on 2026-09-29; owner creative acceptance remains open.
