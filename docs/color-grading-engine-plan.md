# Color grading engine: port and upgrade plan

Date: 2026-11-16; re-checked against `main` 894c9d32 on 2026-11-20. Status:
**CGA merged on `main` (PR #70); the owner asked to continue the whole upgrade
(2026-11-20); CG0–CG2 done on `codex/color-grading-cg0-cg2` (PR #77); the owner
said "Yes, continue to CG3"; CG3 done on `codex/color-grading-cg3` (stacked on
PR #77).** The owner's stated
minimum need was the [fast track (CGA)](#fast-track-the-minimum-need); CG0–CG15
are the long-range upgrade, re-scoped in
[re-check against `main`](#re-check-against-main-2026-11-20).
Sources audited: `~/Documents/guthib/chroma-node` at `b804dc0` (owner's separate
repository, with uncommitted roadmap edits) and this checkout at `e6eb7b06`. No
package source changed and nothing was rendered for this plan.

## Goal

Give Still Shift a grading engine whose operator set, color management and
measurement tools match what a colorist expects from a frontier grading
application, and make every part of it drivable by a person or an AI through
code, the CLI and (later) the lab. A grade is deterministic data: text-diffable,
animatable, versioned, measurable and renderable by the existing export path.

Two outcomes are measured separately:

1. **Operator parity.** The same CDL, LUT and color-space transform produce the
   same picture as a reference grading application within a stated ΔE tolerance
   (CG15).
2. **Authoring reach.** An AI or a person can look at numbers and pictures
   (scopes, probes, mattes), change a grade, and confirm the result by
   measurement without hand-tuned guesswork (CG3, CG10, CG11).

"Same as a frontier app" is bounded by the [exclusions](#out-of-scope). This plan
does not claim real-time playback, camera RAW decoding, Dolby Vision or
proprietary neural tools.

## Fast track: the minimum need

Owner requirement (2026-11-16): fix clips generated with Google Flow, which come
out flat and neutral, by automatically adjusting **exposure, contrast and
saturation**.

That need does not require most of this plan. Flow output is 8-bit SDR video, so
the corrections are valid in the existing display-referred pipeline, and the
engine already has `color.levels`, `color.curves`, `color.exposure` and
`color.hue-saturation` on video layers. What is missing is small:

1. measuring a clip (nothing reads a video's tonal and saturation statistics);
2. a solver that turns those measurements into effect parameters;
3. a one-command path from an MP4 to a corrected MP4;
4. a saturation control that does not over-push colors that are already strong.

[CGA](#cga--automatic-exposure-contrast-and-saturation-for-flat-sdr-clips) is
that slice. It needs no float grade stage, no color management, no chroma-node
port and none of the parity or license decisions. Its measurement code later
becomes the start of CG3 and its solver the start of CG10. Everything from CG0
on is optional and should be approved only if a real need appears.

### Evidence from the owner's clips (2026-11-16)

Twelve raw Flow clips and the owner's own grade of them were measured (footage
stays local and is not committed). Each of the grade's eleven shots was matched
to its raw clip pixel-for-pixel; one raw clip is unused in the grade.

- **Flow sources are rejected today.** They are 1080×1920, 24 fps, 72 frames,
  H.264 `yuv420p`, tagged BT.709 primaries, sRGB transfer, **`smpte170m`
  matrix**, limited range. The media contract accepts only a `bt709` or `gbr`
  matrix, so the probe fails with `comp-media-color`. They are tagged, not
  untagged; the fix is correct BT.601-matrix decoding, not an assumption flag.
- **The owner's grade is one fixed color transform, identical on every clip.**
  A single 3×3 matrix plus offset reproduces it with an RMS error of 1.5 of 255
  code values. Fitted on ten clips and tested on the held-out one, the error is
  1.3–1.8 RMS and at most 5.5 at the 99th percentile.
- **What the grade does**, as a saturation gain followed by per-channel gains
  (RMS 1.8): saturation about ×1.48; red ×0.934, green ×0.942, blue ×1.012, which
  is a cooler white balance; overall luma about −5%; **no contrast change** (no
  curve, black offset under 0.01).
- **The footage is high-key and consistent.** Median luma is 0.71–0.73 on every
  raw clip and the grade keeps it near 0.69. A solver that pulls exposure toward
  mid-gray or stretches black and white points would damage these clips.
- **Applied to the unused clip**, the fitted transform renders with a 0.99 RMS
  difference from the numeric prediction (FFmpeg stopgap, local only).

Consequences for CGA: the fastest route to the owner's result is **learning a
look from a before/after pair and applying it**, with adaptive correction as a
second, conservative mode; white balance must be one of the corrections; and
source support for the BT.601 matrix is a prerequisite. Software agreement with
the reference is not visual acceptance.

## What the audit found

### chroma-node: what is worth porting

chroma-node is an Electron learning app (about 28,500 lines). The grading core is
`src/shared/colorEngine.ts` (4,364 lines) with no Electron, DOM or Node imports.

| Area                   | Source                                                                    | Verdict                                                          |
| ---------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Grade data model       | `ColorNode`, `PrimaryCorrection`, `HslQualifier`, `PowerWindow`, ranges   | Port as the starting contract                                    |
| `.cube` parsing        | `parseCubeLut`, `parseTechnicalLut`, technical LUT validation             | Port with tests                                                  |
| LUT interpolation      | trilinear and tetrahedral CPU                                             | Port; GPU version is new work                                    |
| Primaries and matrices | `buildRgbToXyzMatrix`, `buildPrimariesConversionMatrix`                   | Port after checking against published matrices                   |
| Transfer functions     | sRGB, BT.1886, PQ, HLG, Apple Log                                         | Port after reference validation; Apple Log is marked provisional |
| Scope analysis         | `scopeAnalysis.ts` (947 lines): waveform, parades, vectorscope, CIE, etc. | Port; pure functions over RGBA frames                            |
| Frame analysis         | `aiGrading.ts`: `analyzeFrame`, auto balance, `matchToReference`          | Port the statistics; rebuild the solvers (CG10)                  |
| Translation tracker    | `templateTracker.ts` (172 lines)                                          | Port as the first tracker (CG12)                                 |
| FFmpeg color tagging   | `buildFFmpegColorArgs`, `detectColorSpaceFromFfprobe`                     | Reuse the mapping tables                                         |

### chroma-node: what is not at the target level

These are stated plainly so the port does not inherit them as if they were done.

- **Display-referred and clamped.** `applyPrimaryCorrection`, `applyCurves` and
  `applyLut` each clamp to 0–1. Highlights clipped by one node cannot be recovered
  by the next. Frontier grading is unclamped floating point.
- **Declared but not evaluated.** `hueShift`, `colorBoost`, `midtoneDetail`,
  `shadowAmount`, `highlightAmount` and the five hue/saturation curves
  (`hueVsHue`, `hueVsSaturation`, `hueVsLuminance`, `luminanceVsSaturation`,
  `saturationVsSaturation`) exist in the schema and sanitizers only.
- **Preview and export disagree on LUTs.** The generated fragment shader has no
  LUT sampling; only the CPU export path applies node LUTs.
- **Curves are piecewise linear**, and the master curve scales by the RGB average.
- **Camera log profiles are placeholders.** Every profile except Apple Log maps to
  one generic `log25` transfer. The project's own status calls the managed paths
  "provisional until authoritative reference validation".
- **OCIO is a stub** (an environment-variable check; no transforms).
- **Three serial nodes only.** No parallel, layer or key mixing.
- **White balance is a per-channel RGB scale**, not chromatic adaptation.
- **Tracking is translation-only.**

### chroma-node: what stays behind

The Electron shell, IPC, React app shell, its FFmpeg export pipeline, project
file format, licensing, telemetry, entitlement, update, support and review
stores, the natural-language keyword parser and cloud-AI settings, and
`.github/workflows/ci.yml` (GitHub Actions are prohibited here).

### Still Shift: what already exists

- Video and PNG-sequence layers accept `effects`, `masks` (animated bezier paths
  with feather, expansion and opacity) and `trackMatte`; adjustment layers and
  precomps exist. Power windows therefore need no new mask engine.
- Registered effects with a GPU callback and an optional Canvas reference;
  animated scalars, colors, points and 2–16 point curves; drivers and
  expressions; versioned effect identity in export metadata.
- Ten `color.*` effects (levels, curves, exposure, hue-saturation, tint and
  others), all evaluated on encoded sRGB bytes with exact Canvas/WebGL parity.
  CGA added three more (`color.matrix`, `color.white-balance`,
  `color.vibrance`), so there are thirteen as of 2026-11-20. _Correction
  (CG0, 2026-11-20):_ only the three CGA effects are byte-exact between
  backends; the original ten meet the CE6 near tier (at most one code value),
  and 21 of the 273 CG0 renders differ by one.
- The WebGL2 device already allocates `RGBA32F` targets behind
  `EXT_color_buffer_float` for blur sums.

### Still Shift: what blocks frontier-level grading today

| Limit                                                           | Where                                            | Consequence                                            |
| --------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| Surfaces are premultiplied sRGB `RGBA8`; effects round to bytes | `render/webgl-device.ts`, effect plugin contract | Stacked corrections band and clip                      |
| Media is SDR BT.709 only, decoded to an RGBA8 PNG cache         | `composition/media.ts`, `composition-media*.ts`  | No log, 10-bit, wide-gamut or HDR sources              |
| No working color space or input/output transforms               | composition contract                             | No scene-referred grading; LUTs have no declared space |
| Effect parameters are scalar, color, point and curve only       | `effect-definition.ts`                           | No LUT assets, node graphs or per-effect keys          |
| No color-keyed selection                                        | —                                                | No qualifier                                           |
| No scopes or pixel probes; grade state is not measurable        | CLI                                              | An AI cannot see what it changed                       |
| ~~`comp lint --pixels` fails on native-video compositions~~     | Fixed by ET2 (PR #62); CG0 records it passing    | No longer blocks grade lint on video                   |
| Output profiles are 8-bit BT.709 except ProRes 4444             | `composition-output*.ts`                         | No 10-bit delivery for graded log footage              |

## Design decisions proposed

These are recommendations to confirm at CG1, each with a fallback.

1. **Port the engine, not the application.** New pure package
   `@still-shift/color-science` (`packages/color-science`): transfer functions,
   primaries, LUT parsing and interpolation, grade operators as a float64
   reference, scope analysis. No DOM, Node or renderer imports.
   `scene-contract` owns schemas, `renderer-core` owns GPU kernels,
   `animation-engine` owns decode, the CLI owns commands. _Fallback:_ folders
   inside the existing packages if `pnpm check:boundaries` makes a new package
   costly.
2. **A float grade stage beside the 8-bit pipeline.** A run of `grade.*`
   operations on a layer is evaluated unclamped in a floating-point surface chain
   in a declared working space and quantized once on exit, with an optional
   deterministic dither. Existing `color.*` effects and every existing baseline
   stay byte-identical.
3. **A different parity rule for the float stage.** Existing color effects prove
   backend parity between Canvas and WebGL: byte-exact for the three CGA
   effects, within one code value for the original ten (measured in CG0). Float `pow` and `log` are not
   bit-identical across GPUs. Proposal: the float64 reference in
   `color-science` is authoritative; the GPU must match it within one 8-bit code
   value (or the equivalent at higher depth) on the fixture set, and repeated
   renders on one machine and toolchain must be byte-identical. Separable
   per-channel operations are baked into CPU-computed 1D tables where that buys
   exactness. **Needs owner approval; it relaxes an existing rule for new effects
   only.**
4. **Atomic effects first, node graph on the same kernels.** `grade.primary`,
   `grade.curves`, `grade.lut` and others ship as ordinary registered effects
   (CG2–CG6). The node graph (CG9) is one `grade-1` document attached through a
   single effect, compiled to fused passes. It needs structured, path-addressable
   effect parameters (`effects[look].nodes[skin].primary.gain`); CG1 proves that
   extension against drivers, expressions and lint. _Fallback:_ lower the graph to
   atomic effects and adjustment layers in the builder, as `intent-lowering.ts`
   already does for other intents.
5. **Windows reuse layer masks and shape paths.** Ellipse, rectangle and
   gradient are conveniences that produce the same mask data.
6. **Opt-in color management.** The default working space is "legacy
   display-referred sRGB", which is today's behavior. Scene-referred projects opt
   in per composition.
7. **Camera and ACES transforms come from published specifications**, each with a
   recorded provenance entry and reference vectors. No transform ships as
   "supported" on a placeholder curve.
8. **Neutral naming.** The API uses `window`, `key`, `look`, `object matte`. A
   third-party product is named only as a comparison reference in CG15.

## Rules for every milestone

- Start from `main` on a `codex/` branch and target the PR at `main`
  ([AGENTS.md](../AGENTS.md)). Never on `production`. Follow the
  [composition contribution rules](./composition-contributing.md).
- Use the pinned toolchain (`pnpm toolchain:check`). GitHub Actions are
  prohibited; verify locally ([verification tiers](./verification.md)).
- Each milestone starts with failing fixtures and ends with them passing. Retain
  failed runs and reruns in the milestone record.
- Existing outputs do not change silently. Any intended pixel or validation
  change is versioned, opt-in, or listed with its affected baselines.
- Every operator has a float64 reference, a GPU kernel, a neutral-identity test
  and numeric reference vectors. Ported chroma-node code arrives with its tests;
  untested ported code is treated as new code. For an exact-parity operator
  (integer or byte-table kernel, as the CGA effects), the integer reference that
  both backends match byte for byte is the reference vector, and the float64
  design formula is the float64 reference: tests hold the integer path within
  one code value of it.
- Record the chroma-node source commit for each ported file. chroma-node has no
  license file; ported code enters this repository under GPL-3.0 by its owner's
  decision (see [owner decisions](#owner-decisions)).
- LUTs and footage are user-supplied assets pinned by SHA-256. Do not commit
  third-party LUTs or footage without a recorded license.
- Software checks are not visual acceptance. Human review is recorded separately
  and never inferred from scopes, lint or an AI score.
- Close each milestone with a dated [dev-log](./dev-log.md) entry and a results
  JSON beside this plan. Regenerate the composition reference and skills with
  `pnpm schema:generate` when the contract changes.

## Milestone tracker

| ID   | Milestone                                          | Depends on                     | Estimate (active days) | Status          |
| ---- | -------------------------------------------------- | ------------------------------ | ---------------------- | --------------- |
| CGA  | Auto exposure, contrast, saturation, white balance | owner: review                  | 5–8                    | Merged (PR #70) |
| CG0  | Fixtures, reference vectors and baseline           | owner: approval (given)        | 2–3                    | Done (branch)   |
| CG1  | Color-science core and contract design             | CG0, owner: decided 2026-11-20 | 4–6                    | Done (branch)   |
| CG2  | Float grade stage and primary corrections          | CG1                            | 5–8 (WB, mixer seeded) | Done (branch)   |
| CG3  | Scopes, probes and machine-readable measurement    | CG1 (ET2 merged)               | 3–5 (stats seeded)     | Done (branch)   |
| CG4  | Curves and tonal-range tools                       | CG2                            | 4–6                    | Proposed        |
| CG5  | LUT and CDL interchange                            | CG2                            | 3–5                    | Proposed        |
| CG6  | Keys: qualifiers, windows and matte finesse        | CG2, CG3                       | 6–9                    | Proposed        |
| CG7  | Scene-referred input and working space             | CG2, owner: working space      | 6–10 (BT.601 done)     | Proposed        |
| CG8  | Output transforms and 10-bit delivery              | CG7                            | 5–8                    | Proposed        |
| CG9  | Node graph and reusable looks                      | CG4–CG6                        | 6–10                   | Proposed        |
| CG10 | Grade lint and solvers                             | CG3, CG6                       | 4–6 (solvers seeded)   | Proposed        |
| CG11 | AI and code authoring surface                      | CG9, CG10                      | 4–7                    | Proposed        |
| CG12 | Tracking and object mattes                         | CG6                            | 5–8                    | Proposed        |
| CG13 | Texture and finishing operations                   | CG6                            | 4–7                    | Proposed        |
| CG14 | Lab grading workspace                              | CG3, CG9, owner: scope         | 8–15                   | Proposed        |
| CG15 | Parity proof and acceptance on authorized footage  | CG8, CG9, owner: footage       | 3–5                    | Proposed        |

CGA stands alone at about 5–8 active days. CG0–CG15 total about 75–122 active days. Estimates are planning ranges, not deadlines;
re-estimate at entry against the then-current code.

Recommended order: CGA first, then stop and review. If the upgrade continues: CG0 → CG1 → CG2 → CG3 → CG4 → CG5 → CG6 → CG7 → CG8 → CG9 →
CG10 → CG11 → CG15, with CG12–CG14 scheduled by need. CG3 can run in parallel
with CG2; CG4 and CG5 can run in parallel after CG2.

Useful stopping points:

- **After CGA:** flat SDR clips are corrected automatically with one command.
  This meets the stated minimum need.
- **After CG2:** SDR video can be graded with unclamped primaries from code.
- **After CG3:** an AI can measure what a grade did.
- **After CG6:** secondary corrections (selected colors and regions) work.
- **After CG8:** log and 10-bit footage is graded scene-referred and delivered
  at 10 bits.
- **After CG11:** the complete code and AI workflow.

---

## Re-check against `main` (2026-11-20)

CGA and the composition colour-accuracy decision (D-colour, PR #72) landed on
`main` after this plan was written. They deliver parts of later milestones. Those
parts are folded in below, not rebuilt; each later milestone starts from them.

| Delivered on `main`                                                                                                                                                         | Was planned in | Now                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BT.601 (`smpte170m`) SDR sources decode with BT.601 coefficients (CGA)                                                                                                      | CG7            | Done. CG7 extends the color contract from this matrix list; it does not re-add BT.601.                                                                                                                                                           |
| BT.709-tagged SDR video is display-equivalent to sRGB on decode (`composition-media-decoder-3`) and export (`composition-output-2`) (D-colour)                              | CG7, CG8       | The legacy working space keeps this rule. The CGA finding "`comp render` tags sRGB pixels BT.709, so a re-imported render is ~5% brighter" is resolved by it; CG0 records the round trip. Scene-referred modes (CG7) define the OETF explicitly. |
| `color.matrix` (3×3 + offset, strength), exact 8-bit parity                                                                                                                 | CG2 (mixer)    | Stays as the 8-bit effect. CG2's `grade.rgb-mixer` is its float-stage counterpart and must equal it within the parity bound on in-range values.                                                                                                  |
| `color.white-balance` (temperature/tint as linear-light channel gains), exact 8-bit parity                                                                                  | CG2            | Stays. CG2 adds chromatic adaptation in the float stage as a new operator; it does not change this effect. The two are compared on the CG0 chart and the difference recorded.                                                                    |
| `color.vibrance` (saturation-aware, skin-protecting), exact 8-bit parity                                                                                                    | CG2 (boost)    | Stays. `grade.primary` color boost is the float counterpart.                                                                                                                                                                                     |
| `comp color-stats`: media-path luma percentiles, black/white points, clipped and crushed fractions, saturation distribution, neutral cast, per clip                         | CG3            | The start of `comp scopes` statistics. CG3 adds regions, frame ranges, scopes, probes and a schema, and keeps `color-stats` output stable (or versions it).                                                                                      |
| `comp auto-color` (staged white balance → exposure → contrast → saturation solver) and `comp look fit\|apply` (match a before/after pair with one 3×3 + offset; look files) | CG10, CG9      | CG10 extends these solvers to the float operators (CDL recovery, neutral region, chart match) and reuses their residual reports. CGA look files are migrated, not replaced, when CG9 defines looks.                                              |
| ET2: `comp lint --pixels` measures native-video compositions (PR #62)                                                                                                       | CG3/CG10 dep.  | No longer a dependency. CG0 records it passing on a CG0 clip.                                                                                                                                                                                    |

CG0 found one more (2026-11-20): `comp render` already has 10-bit containers
(`hevc10`, `prores422hq`, `png16`, from CE15), but they carry the renderer's
8-bit pixels (a 256-code ramp exported as `hevc10` keeps 256 levels). CG8's
"10-bit delivery profiles" is therefore high-bit pixels into the existing
profiles plus correct tags, not new profiles.

Estimates in the tracker are revised for CG2, CG3, CG7 and CG10 accordingly.
Owner decisions 2 and 3 (license and parity rule) are still needed before CG1
code; CG0 needs neither.

## CGA — Automatic exposure, contrast, saturation and white balance for flat SDR clips

**Why:** this is the owner's minimum requirement, and it is reachable on the
existing 8-bit pipeline.

**Scope**

- **Measure.** Sample frames across the clip through the engine's own media
  preparation, so the statistics describe the pixels the renderer will see.
  Compute luma percentiles and mean, tonal spread, clipped and crushed fractions,
  and the saturation distribution. Emit a deterministic JSON report.
- **Solve.** Three corrections, each with limits and a `strength` from 0 to 1:
  - exposure: place the midtones at a target level;
  - contrast: set black and white points from robust percentiles, then add a
    bounded S-curve when the tonal spread is still narrow;
  - saturation: raise the average toward a target while protecting pixels that
    are already saturated and skin-tone hues.
- **Apply.** The result is ordinary, editable effect parameters on the video
  layer (`color.levels`, `color.curves` and one new effect, `color.vibrance`,
  built in the existing exact-parity framework). No opaque result.
- **One static correction per clip** by default, so the picture cannot flicker.
  Per-shot correction with cut detection is a follow-up.
- **One command.** `comp auto-color --input clip.mp4 --output fixed.mp4` probes
  the source, builds the composition, keeps the source audio, renders, and writes
  the before/after report. `--strength`, `--exposure`, `--contrast` and
  `--saturation` switch or scale each correction; `--write-composition` saves the
  editable program instead of rendering. A folder of clips runs through the
  existing batch path. _As built: folders run clip by clip in the command
  itself (see the implementation notes)._
- **Guards.** Near-identity on clips that are already well balanced; a clipping
  budget; a limit on stretch so 8-bit sources do not band visibly; clear
  diagnostics for sources the media contract rejects.
- **Source support (prerequisite).** Accept the `smpte170m` matrix on SDR
  sources and convert with the BT.601 coefficients, so Flow clips pass the probe
  without transcoding. Rotated and variable-frame-rate files keep their existing
  diagnostics.
- **Look from an example (build first).** `comp look fit --before raw.mp4
--after graded.mp4` aligns the pair, fits one color transform and writes a
  reusable look file with its residuals. `comp look apply` (and
  `comp auto-color --look file`) applies it through a new exact-parity
  `color.matrix` effect, with a 0–1 strength. This reproduces the owner's
  measured grade.
- **White balance (owner requirement, 2026-11-16).** Temperature (blue–amber)
  and tint (green–magenta) controls in a new `color.white-balance` effect, plus
  automatic neutral estimation. It is the largest part of the owner's measured
  grade, so the adaptive solver and fitted looks both set it.
- **Conservative adaptive mode.** The solver preserves a scene's key (it does not
  pull high-key footage toward mid-gray) and defaults to small moves; a look
  file can supply its targets.

**Not in CGA:** creative looks (warm, teal-orange, film-style), per-shot or
animated correction, secondary corrections, LUTs. Look presets are the natural
next small slice if neutral-but-correct is still too plain.

**Added beyond this scope (recorded after review, PR #70 B1).** Built while
measuring and tuning with the owner, kept as accepted additions:
`comp color-stats` (the statistics report on its own), `--adaptive` and
`--adaptive-strength` (adaptive corrections on top of a look), `--frames`
(sample count), `--backend` (Canvas or WebGL render), `--pairs-per-shot` and
`--after-interpretation` (look fitting controls), and
`scripts/color/cga-owner-evaluation.ts` (local owner sheets and measurements,
writing only to git-ignored `dist/`).

**Checks** (2026-11-16, `codex/cga-auto-color`; numbers in
[CGA results](./color-grading-cga-results.json); RMS is of 255)

- [ ] **Partly met.** Synthetic fixture: a reference clip with a known exposure
      shift, contrast compression and desaturation applied is restored within
      stated residuals. Met for exposure 24.4 → 2.4 (bound 3), contrast
      14.4 → 1.8 (bound 2.5) and white balance 5.7 → 0.7 (bound 1). **Not met
      for desaturation:** it is lifted to the solver's targets (median
      saturation 0.125 → 0.172, reference 0.30; RMS 16.8 → 13.7), not restored
      to the reference, by design (conservative targets). Its test bound
      (≤ 0.85 × the degraded RMS) was set from this result and only guards
      against regression; it is not a stated restoration residual.
- [x] A well-balanced fixture changes by less than a stated threshold (no effect
      is applied: exact identity). The threshold (0, identity) was stated when
      the result was recorded; the first plan left it open.
- [x] The same input gives a byte-identical report and parameters on rerun.
- [ ] **Partly met.** Parameters are constant over the clip (met); measured
      frame-to-frame luma continuity equals the source's. The criterion was
      reworded to "within codec noise" when the results were recorded: a static
      correction scales frame-to-frame differences by its tonal slope, so exact
      equality is not expected. Synthetic: |Δ| < 0.01 (the test's bound, set
      then). Owner clips: 0.0004–0.0025 before and after, up to about 1.6× the
      source's (e.g. 0.000843 → 0.001317), with no bound stated.
- [x] After correction, clipped and crushed fractions stay within the budget
      (≤ 0.3% added on the fixtures: the solver scales every correction, tone
      included, until it fits, and records a decision when four rounds are not
      enough) and the gradient fixture stays within the banding bound (no step
      over 2 codes; stretch ≤ 1.3).
- [x] `color.vibrance` has exact Canvas/WebGL parity and a neutral identity.
- [ ] **Partly met.** Output frame count, duration and audio match the source.
      Met for frames, picture duration and audio content (72/72 frames, 3.0 s,
      audio correlation ≥ 0.9987 on the 11 owner clips with sound). Not met for
      the audio track length: 3.00 s against the source's 2.98 s, because the
      export's audio master spans the picture and pads the last 20 ms with
      silence. Trimming the audio stream to the source length is an export
      change outside CGA.
- [ ] **Partly met.** A `smpte170m`-tagged source decodes to the same RGB as a
      reference BT.601 conversion within one code value. Met on the 4:4:4
      fixture (max 1; BT.709 coefficients would be 19 off). Not met on the
      owner's 4:2:0 clip: 99.5% of values are within one, p99 1, max 6 at chroma
      edges, because the reference and FFmpeg upsample chroma differently. The
      matrix is right; a 4:2:0 bound (for example p99 ≤ 1) would have to be
      stated before this can be ticked. Rotated and variable-rate sources
      produce the documented diagnostic (met).
- [ ] **Partly met.** A look fitted from the owner's pair, applied to each raw
      clip, matches the owner's grade within the measured bound (about 2 RMS of 255) on held-out clips: held-out 4×4 block means 1.82 (max 2.24), per pixel
      2.30 (max 2.69, above 2: the edit is softer and re-encoded). `color.matrix`
      has exact Canvas/WebGL parity.
- [x] The adaptive mode changes the owner's high-key clips' median luma by less
      than a stated limit (limit 0.02; largest 0.0107 on 12 clips with the first
      defaults, 0.0122 after the visibility retune; final defaults below). The
      0.02 limit was chosen when the first results were recorded; the first plan
      left it open.
- [x] At least five owner-supplied Flow clips: before/after statistics and
      contact sheets recorded (12 clips, local). Owner review is pending and is
      the only visual acceptance.
- [x] `pnpm check:fast` passes; existing baselines unchanged; CLI README and the
      generated reference updated.

**Owner tuning (2026-11-16).** Three rounds on the owner's 12 clips: the first
adaptive defaults were invisible ("no different"), the second too heavy and too
warm, and the look at full strength "too heavy". From a strength ladder the
owner chose 50–75%; **the look default is 0.6** (`--strength 1` keeps the full
grade). Final Auto defaults sit halfway between the first two: median/90%
saturation targets 0.185/0.36 (vibrance ≤ 80, gain ≤ 1.65), S-curve
0.75 × (0.625 − spread) up to 0.13, 50–90% of the cast removed with a coupled
magenta tint so cream stays beige. On the renders: median luma −0.012…+0.002,
5–95% spread −0.001…+0.063, 90% saturation +0.025…+0.131, median saturation
−0.035…+0.027 (cooling removes beige chroma), clipped ≤ 0.42%.

**Implementation notes.** BT.601 sources decode through `in_color_matrix=bt601`.
The three effects are integer/table exact on both backends. `comp look fit`
matches shots by gain/offset-invariant luma correlation and fits on 4×4 block
means; a graded edit tagged BT.709 transfer is compared in code values, because
`comp render` writes sRGB-encoded pixels tagged BT.709. The media path then
converted BT.709 transfer on import; D-colour (decoder 3, PR #72) removed that
asymmetry, so both readings now agree. The
adaptive solver works in stages (white balance → tone → saturation) on the
measured frames and re-measures the exact predicted result after each; it
removes 50–90% of the near-neutral cast (with a coupled magenta tint when it is unsure) depending on how much the near-neutral
pixels agree, never brightens a high-key clip, and keeps a dead band on every
correction. Exposure lifts a dim white point and then places the median in the
0.40–0.52 midtone range with the levels gamma (raise ≤ 0.08 in all, lower
≤ 0.05), so an over-exposed or dark-midtone clip is corrected too; high-key
clips (median ≥ 0.6) keep their exposure. Added after review (PR #70, A1): the
first version only lifted the white point and could never darken. A fitted look records its edit's measured
targets (median luma, median and 90% saturation); with that look the adaptive
solver aims for them instead of its defaults (PR #70, A2).

**Folders (deviation, PR #70 review A3).** The existing `batch` command is the
v0.1 still-image pipeline: it renders `AnimationRequest` manifests (one image
in, one animation out) with resume markers and per-item locks, and cannot carry
video clips, looks or composition effects. Extending that contract for CGA was
out of proportion, so `auto-color` and `look apply` take a folder directly and
follow batch's conventions instead: every clip is attempted, a failing clip is
recorded with its diagnostics and does not stop the run, one
`auto-color-summary.json` lists every item (`complete` or `partial`), the exit
code is 1 when any clip failed, and nothing is overwritten. Moving folders onto
a composition batch path is a follow-up if one is built.

**Owner inputs:** five or more representative Flow clips (kept local unless
licensed for the repository), and optionally one or two frames showing the
amount of punch that looks right.

## CG0 — Fixtures, reference vectors and baseline

**Why:** every later claim needs numbers to check against, and the existing
outputs need a recorded baseline before a second pipeline is added.

**Scope**

- Deterministic, license-free generators (FFmpeg and scripts) for: gray and RGB
  ramps, a hue sweep, a saturation sweep, a synthetic 24-patch chart with stated
  values, a skin-tone patch set, a noisy gradient for banding, and one short
  moving clip with a colored object crossing a textured background. Each with a
  descriptor and SHA-256, well under 1 MB.
- 10-bit and log-encoded variants generated by encoding a known scene-linear
  ramp through each transfer function, for CG7.
- Reference vectors as tracked JSON: published sample points for each transfer
  function and primaries matrix, ASC CDL reference values, and LUT interpolation
  cases. Record the source document for every vector. An offline reference
  generator (for example OpenColorIO through `uv`, development-only) is allowed;
  it is never a runtime dependency.
- Record the current behavior of the ten `color.*` effects and of
  `comp lint --pixels` on a native-video fixture.

**Checks** (2026-11-20, `codex/color-grading-cg0-cg2`; numbers in
[CG0 results](./color-grading-cg0-results.json) and the
[fixture README](../benchmarks/fixtures/color/cg0/README.md))

- [x] Generators reproduce every fixture byte-identically on rerun: 49 fixture
      files (`pnpm color:cg0-fixtures --check`) and 10 vector files
      (`pnpm color:cg0-vectors --check`), on darwin-arm64 with the pinned
      toolchain.
- [x] Each reference vector names its source and the tolerance it is good for:
      19 transfer functions (11 with published anchors or an independent
      OpenColorIO check, all asserted), 19 primaries sets with three published
      matrices, nine camera input transforms, eight CDL cases, five LUTs.
- [x] Baseline hashes for existing color effects recorded (13 effects × 3
      settings × 7 stills, both backends, plus gray-ramp transfer tables);
      `pnpm check:fast` passes; no existing baseline changes.
- [x] The video pixel-lint failure is shown fixed (ET2): `comp lint --pixels
true` on a graded native-video composition exits 0 with pixels measured;
      command and report retained in `cg0-baseline.json`.

## CG1 — Color-science core and contract design

**Why:** the math must exist once, tested without a browser, before any GPU work;
and the three contract questions decide the shape of everything after.

**Scope**

- Create the pure package. Port from chroma-node with tests: types and ranges
  (as zod schemas and bounds), `.cube` and technical-LUT parsing, trilinear and
  tetrahedral interpolation, primaries and matrix construction, sRGB, BT.1886,
  PQ and HLG transfers. Remove per-stage clamps.
- Replace placeholder camera transforms with an explicit registry of
  `validated` and `unavailable` entries; nothing reports a transform it cannot
  perform.
- Decide and prove, with small spikes: the float grade stage (surface format,
  memory budget, quantization, dither), the parity rule (decision 3), and
  structured effect parameters (decision 4).
- Write the provenance record (ported file → chroma-node commit → license).

**Checks** (2026-11-20, `codex/color-grading-cg0-cg2`; numbers in
[CG1 results](./color-grading-cg1-results.json), decisions in
[CG1 decisions](./color-grading-cg1-decisions.md), provenance in
[`PROVENANCE.md`](../packages/color-science/PROVENANCE.md))

- [x] Every ported function matches its CG0 vectors within the stated
      tolerance (85 tests). chroma-node's BT.1886, PQ, HLG and Apple Log
      failed the vectors before porting and were rewritten from the
      specifications; its tetrahedral path was trilinear and its `.cube`
      parser ignored domains.
- [x] Neutral parameters are an exact identity for every operator in CG1
      (primary, CDL; identity LUTs within 1e-12).
- [x] `pnpm check:boundaries` passes with the new package; it imports nothing
      from DOM, Node or the renderer (enforced, with a DOM-free type check).
- [x] A written decision for each of the three questions, with spike evidence
      and the fallback taken or rejected: RGBA32F intermediates, one
      quantization, no dither (RGBA16F rejected); the approved parity rule,
      met by the spike (worst 1 code value, byte-identical repeat); flat scalar
      parameters for CG2–CG6 and builder lowering for CG9 (nested type
      deferred).
- [x] No rendering behavior changes; all existing baselines are unchanged.

## CG2 — Float grade stage and primary corrections

**Why:** this is the first slice that grades video, and it establishes the
unclamped pipeline that the remaining operators run in.

**Scope**

- Renderer support for a floating-point grade stage: float scratch surfaces
  inside the effect ownership and memory limits, one quantization on exit,
  correct handling of premultiplied alpha (grade straight color, preserve
  coverage). (As built: the pointwise CG2 run is one fused shader with
  float32 registers and no float surfaces; see the
  [CG1 decisions](./color-grading-cg1-decisions.md#1-float-grade-stage).)
- `grade.primary`: lift, gamma, gain, offset (RGB and master), contrast and
  pivot, saturation, hue rotation, color boost, shadows, highlights and midtone
  detail — including the five controls chroma-node declares but never evaluates.
- Temperature and tint as chromatic adaptation in linear light, replacing the
  RGB scale.
- `grade.cdl` (ASC CDL slope, offset, power, saturation, exact to the
  specification) and `grade.rgb-mixer`.
- All parameters animatable; works on video, sequence, image, precomp and
  adjustment layers.

**Checks** (2026-11-20, `codex/color-grading-cg0-cg2`; numbers in
[CG2 results](./color-grading-cg2-results.json); operators in
[float grade stage](./composition-effect-plugins.md#float-grade-stage-cg2))

- [x] Fixture: a value pushed above 1.0 by one operation is recovered by the
      next: gain 2 then 0.5 is exact on both backends (8-bit `color.exposure`
      loses 127 codes; chroma-node clamps every stage).
- [x] `grade.cdl` matches the ASC reference values within tolerance (1e-12 in
      float64; Canvas exact and WebGL2 within 1 on the renderer). Release 1.2
      is `clamp: 1`; the default `clamp: 0` is OpenColorIO's no-clamp style,
      so a default CDL is neutral inside a run (a recorded deviation in the
      CG2 results).
- [x] GPU matches the float64 reference within the approved parity bound on all
      CG0 fixtures; repeated renders are byte-identical (72 rows: Canvas 0,
      WebGL2 ≤ 1 with 32 channels at 1).
- [x] A 16-step gray ramp through ten stacked neutral-sum corrections shows no
      added banding compared with one pass (16/16 and 256/256 levels, max
      difference 0).
- [x] A graded native-video composition renders and exports through the existing
      path; effect versions appear in export metadata (both backends, 48/48
      frames, scene manifest `effectVersions`).
- [x] Existing `color.*` baselines unchanged.

_Deviation:_ midtone detail is spatial, not pointwise, and moves to CG13 so the
stage stays one fused pointwise pass.

## CG3 — Scopes, probes and machine-readable measurement

**Why:** a grade that cannot be measured cannot be verified, and an AI cannot
grade from a picture alone. This is the engine's eyes, so it comes early.

**Scope**

- Port `scopeAnalysis.ts` into `color-science`: luma waveform, RGB/YRGB/YCbCr
  parades, vectorscope with skin-tone line, RGB, hue and saturation histograms,
  CIE chromaticity, false color, exposure zones.
- `comp scopes`: JSON statistics per frame, frame range or region (luma
  percentiles, per-channel black and white points, clipped and crushed
  fractions, saturation distribution, hue histogram, neutral-cast estimate,
  skin-line deviation) and optional scope PNGs for people and vision models.
- `comp probe`: values at a point or region, before and after any stage of the
  layer stack, in encoded, linear, HSL and perceptual coordinates; suggested
  qualifier ranges for a sampled region.
- `comp grade diff`: before/after statistics, a split or side-by-side still, and
  a contact sheet across the clip.
- Output is deterministic and schema-validated so it can be diffed and tested.

**Checks** (2026-11-21, `codex/color-grading-cg3`; numbers in
[CG3 results](./color-grading-cg3-results.json); commands in the
[CLI README](../tools/still-shift-cli/README.md#color-measurement-scopes-probe-and-grade-diff))

- [x] Statistics on CG0 synthetic fixtures match analytically known values
      (12 tests: ramps, sweeps, primaries, skin line, chart neutrals at D65,
      false color, zones, pixel coordinates).
- [x] Scope JSON is byte-stable across reruns and validated by a schema (JSON
      and scope PNGs identical on rerun; `ColorScopesReportSchema`).
- [x] Probe before/after values match the float64 reference for a graded pixel
      (exact on Canvas, stage by stage).
- [x] Works on a native-video frame range within the existing media memory
      limits; over-budget requests fail with a clear diagnostic (batches of
      `mediaLimits.decodedFrameBytes`, identical results; `comp-scope-limit`).
- [x] Documented in the CLI README and generated reference (the generated
      skill; the composition reference covers fields, not CLI commands).

_As built:_ `comp scopes` embeds `comp color-stats`' statistics unchanged
(the measurement is now an accumulator with the same summation order). YCbCr
and YRGB parades, HDR scopes and CIE 1976 are not built; the probe reports the
renderer's 8-bit output per effect stage, not values inside a fused grade run.

## CG4 — Curves and tonal-range tools

**Scope**

- `grade.curves` with smooth monotone splines (not piecewise linear), master and
  per-channel, with a luminance-preserving option.
- Hue vs hue, hue vs saturation, hue vs luminance, luminance vs saturation,
  saturation vs saturation and saturation vs luminance curves.
- Three-range wheels (shadows, midtones, highlights) with adjustable range
  boundaries, zone-based exposure controls with falloff, and high/low soft clip
  with knee.
- Curves baked to float tables on the CPU for deterministic GPU evaluation.

**Checks**

- [ ] Identity curves are exact identities; spline evaluation matches reference
      vectors; no overshoot outside the control hull for monotone inputs.
- [ ] Each hue/saturation curve changes only its target dimension on the sweep
      fixtures, within tolerance (measured with CG3).
- [ ] Hue curves are continuous across the 0°/360° wrap.
- [ ] Animated curve points keep the existing ordering and point-count rules.

## CG5 — LUT and CDL interchange

**Scope**

- LUT assets pinned by SHA-256: `.cube` 1D and 3D, domain bounds, optional
  shaper, sizes up to at least 65³, declared input and output spaces.
- `grade.lut` on the GPU with tetrahedral (default) and trilinear interpolation
  and an intensity control. Preview and export use the same kernel, closing the
  chroma-node mismatch.
- Bake a grade stack to `.cube` for use elsewhere; import and export ASC CDL
  (`.cdl`, `.cc`, `.ccc`).

**Checks**

- [ ] Identity LUTs of several sizes are identities within tolerance.
- [ ] GPU tetrahedral matches the CPU reference on random and edge samples.
- [ ] Malformed, oversized or wrong-hash LUTs fail before rendering.
- [ ] A baked `.cube` of a pointwise stack reproduces that stack within the
      stated tolerance; a non-pointwise stack (keys, blur) refuses to bake.
- [ ] CDL round trip preserves values exactly as text.

## CG6 — Keys: qualifiers, windows and matte finesse

**Why:** secondary correction — changing only the sky, skin or one garment — is
most of what separates grading from filtering.

**Scope**

- A key on every grade operation: qualifier × windows × external matte.
- Qualifiers: HSL (ported), RGB, luma, and a sampled 3D key in a perceptual
  space built from picked samples.
- Windows from layer masks and shape paths, plus ellipse, rectangle and linear
  gradient conveniences; all animatable.
- External matte from a named layer slot (depth image, alpha, luma, a supplied
  matte sequence).
- Matte finesse: denoise, black and white clip, clean black and clean white,
  blur, shrink and grow, in/out ratio, invert, output gain and offset.
- Matte views (grayscale key, highlight, high contrast) in preview and CLI.

**Checks**

- [ ] Qualifier keys on the hue and saturation sweeps match analytic masks.
- [ ] The key is taken from the operation's input, not its output (stated and
      tested).
- [ ] Window edges match the existing mask rasterizer on shared fixtures.
- [ ] A matte-stability metric on the moving CG0 clip is reported per frame;
      finesse controls measurably reduce chatter on the noisy fixture.
- [ ] A keyed correction leaves pixels outside the key byte-identical.

## CG7 — Scene-referred input and working space

**Why:** log and 10-bit footage cannot be graded properly in an 8-bit
display-referred pipeline. This is the largest and riskiest milestone.

**Scope**

- Extend the media color contract beyond SDR BT.709: BT.2020 and P3 primaries,
  PQ and HLG, limited and full range, and author-declared camera encodings
  (metadata alone often cannot identify a log curve).
- High-bit decode: 10- and 12-bit sources to a 16-bit frame cache and float
  textures, within revised media memory limits.
- Input transforms validated against published specifications, in priority
  order to be confirmed: Apple Log, ARRI LogC3/LogC4, Sony S-Log3, Canon Log
  2/3, Panasonic V-Log, RED Log3G10, Blackmagic Film Gen 5, DJI D-Log, Fujifilm
  F-Log/F-Log2, Nikon N-Log.
- Composition-level working space: legacy (default), linear BT.709, ACEScct /
  ACEScg, and a wide-gamut log intermediate. `grade.color-space-transform` for
  explicit conversions inside a stack.
- Compositing rules for mixing graded scene-referred media with existing
  display-referred layers (text, shapes) are specified and tested.

**Checks**

- [ ] Each transform round-trips and matches its published reference points;
      each has a provenance entry. Unvalidated transforms are rejected, not
      approximated.
- [ ] A 10-bit ramp decoded, passed through neutral grading and re-encoded at
      10 bits is lossless to the stated bound.
- [ ] A composition without color management renders byte-identically to
      before.
- [ ] Decode cache, live-frame and GPU memory stay within documented limits on
      the 4K fixture; over-budget cases fail before allocation.
- [ ] A declared space that contradicts stream metadata produces a diagnostic.

## CG8 — Output transforms and 10-bit delivery

**Scope**

- Output transform per composition: target primaries and transfer, tone mapping
  and gamut compression from published references, with documented parameters.
- 10-bit delivery profiles (ProRes 422 HQ, 10-bit HEVC/H.264, 16-bit PNG
  sequence) with correct color tags, verified by the existing ffprobe output
  validation.
- A viewing transform for preview that never alters exported pixels.
- HDR mastering output stays [conditional](#conditional-future-work).

**Checks**

- [ ] Output tags match pixels on every profile (ffprobe plus a decoded-pixel
      check on the ramp fixture).
- [ ] Tone-mapped and gamut-compressed results match reference vectors; no
      negative or non-finite values reach the encoder.
- [ ] 10-bit output of a smooth gradient has measurably fewer unique-step
      artifacts than the 8-bit profile.
- [ ] `pnpm release:check` scope is reviewed: any new output profile is added to
      the installed-package verification.

## CG9 — Node graph and reusable looks

**Scope**

- `grade-1` document: serial nodes, parallel mixer, layer mixer with blend
  modes, key mixer, channel split and combine, shared nodes, per-node enable and
  mix. Nodes carry the CG2–CG6 operators and keys.
- A compiler that fuses consecutive pointwise nodes into one pass and caches
  node outputs under the existing graph identity.
- Looks as standalone files with versions, applied to layers or adjustment
  layers. Clip, group and timeline levels map to layers, precomps and adjustment
  layers.
- Path addressing, drivers, expressions and animation for node parameters.

**Checks**

- [ ] A serial graph equals the same operators as stacked atomic effects,
      byte-identical.
- [ ] Parallel and layer mixing match the float64 reference on fixtures.
- [ ] Cycles, dangling inputs and unknown operators fail validation with the
      owning node named.
- [ ] Fused and unfused compilation produce identical output; pass count and
      timings are recorded.
- [ ] One look file applied to two clips stays linked; a per-clip override is
      visible in the normalized JSON.

## CG10 — Grade lint and solvers

**Scope**

- Grade rules in `comp lint`: clipped highlights and crushed shadows beyond
  policy, out-of-range delivery levels, gamut excursions, oversaturation,
  skin-tone deviation in a declared region, banding risk, key chatter, neutral
  drift over time, shot-to-shot mismatch between adjacent clips, LUT applied in
  the wrong declared space, and text contrast after grading (shared with ET3).
- Deterministic solvers that write editable parameters, never an opaque result:
  white balance from a neutral region, exposure and contrast to target
  percentiles, match to a reference frame or clip, and chart match from four
  given corners. Each returns the parameters and a residual report.

**Checks**

- [ ] Each rule has a passing and a failing fixture with measured values.
- [ ] Solvers recover a known applied cast, exposure offset and CDL on synthetic
      fixtures within stated residuals.
- [ ] Solver output is ordinary grade parameters that validate and render.
- [ ] Rules run on native video (requires the ET2 fix) within memory limits.

## CG11 — AI and code authoring surface

**Scope**

- Builder API in `@still-shift/motion` for grades, nodes, keys and looks, with
  source maps back to the program.
- A parametric looks library (original recipes with named, documented controls;
  no third-party LUTs).
- Generated reference sections and a `grade-with-still-shift` skill describing
  the loop: measure → propose → render → measure → lint → iterate.
- Blind trials: an AI is given footage and a written brief and must reach lint
  targets; record iterations, failures and the human review separately.

**Checks**

- [ ] Every operator and command is reachable from the builder and documented in
      the generated reference.
- [ ] Trial protocol and results recorded (as with
      `composition-ce10-skill-trials.json`), including failed attempts.
- [ ] No trial result is described as visual acceptance.

## CG12 — Tracking and object mattes

**Scope:** port the translation tracker as `comp track`, writing keys that a
window follows through existing constraints; add confidence and failure
reporting; then affine or planar tracking. Object mattes arrive as external
matte sequences; an optional local segmentation worker (like the depth worker)
is conditional on a model with an acceptable license.

**Checks**

- [ ] Recovers a known synthetic motion within a stated pixel error; stops and
      reports instead of writing low-confidence keys.
- [ ] Tracked window output is ordinary keys, editable and deterministic.

## CG13 — Texture and finishing operations

**Scope:** key-aware blur, sharpen and midtone detail; spatial noise reduction;
grain, halation, glow and vignette inside the float stage, reusing existing blur
and noise kernels where they are exact. Temporal noise reduction is conditional.

**Checks**

- [ ] Each operation has a reference, parity within the approved bound, and
      correct bounds expansion.
- [ ] Grain is deterministic per frame and seed.

## CG14 — Lab grading workspace

**Scope:** a grading panel in `apps/lab`: viewer with split, wipe and reference
still; scope panels; node list; wheels and curve editors; qualifier picker; matte
view; look versions. It reads and writes the same grade data as code. Reuse
chroma-node renderer pieces (`scopeRender.ts`, viewer geometry, hooks) where they
fit.

**Checks**

- [ ] Every edit round-trips through the normalized composition JSON.
- [ ] Viewer pixels match export pixels for the same frame.
- [ ] Browser tests cover the panel; no change to non-grading lab sessions.

## CG15 — Parity proof and acceptance on authorized footage

**Scope:** on owner-supplied footage (at least one log 10-bit clip), apply the
same CDL, LUT and color-space transform here and in a reference grading
application, and compare decoded frames with a ΔE report. Then one complete
grade by a person and one by an AI, reviewed by the owner.

**Checks**

- [ ] ΔE statistics per clip recorded with the reference application version and
      settings; tolerance agreed before the run.
- [ ] Differences above tolerance are explained or filed, not averaged away.
- [ ] Owner review recorded separately from software results.

---

## Conditional future work

- HDR mastering delivery (HDR10, HLG) and HDR scopes.
- Temporal noise reduction and optical-flow tools.
- A hue-saturation mesh warper.
- Local segmentation model for object mattes.
- Baking OpenColorIO configurations to LUT assets offline.

## Out of scope

- Camera RAW decoding (BRAW, R3D, ARRIRAW); transcode before authoring.
- Real-time playback guarantees and hardware control surfaces.
- Dolby Vision and other licensed mastering formats.
- Proprietary neural effects and third-party plug-in hosting.
- Merging the chroma-node application shell, licensing, telemetry or its CI.

## Risks

| Risk                                                           | Mitigation                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Float GPU results differ across machines                       | Reference-first parity bound; CPU-baked tables; record GPU and driver         |
| A second pipeline regresses existing exact-parity effects      | Grade stage is additive; baselines checked at every milestone                 |
| High-bit decode multiplies memory and cache size               | Budgets revised and enforced before allocation in CG7                         |
| Incorrect camera transforms presented as accurate              | Registry of validated transforms only; provenance and vectors required        |
| Structured effect parameters do not fit drivers and lint       | Proven in CG1; builder-lowering fallback                                      |
| Scope too large for one stream of work                         | Stopping points after CG2, CG3, CG6, CG8; later milestones are independent    |
| Mixed-license or unlicensed LUTs and footage enter the package | Assets are user-supplied and pinned; nothing third-party committed unrecorded |

## Owner decisions

1. Approve CGA alone, or CGA plus a first stopping point in the larger plan.
   Decisions 2–9 are not needed for CGA.
2. Confirm ported chroma-node code enters this repository under GPL-3.0.
   **Decided 2026-11-20: approved** ("Approve both"); provenance per ported
   file records the chroma-node source commit.
3. Approve the bounded parity rule for the float grade stage (decision 3).
   **Decided 2026-11-20: approved** ("Approve both"): the float64 reference is
   authoritative, the GPU matches it within one 8-bit code value, repeat renders
   on one machine are byte-identical; existing effects keep their current
   parity (exact for the CGA three, within one code for the original ten).
4. Choose the default working space for color-managed projects (CG7).
5. Priority order of camera input transforms (CG7).
6. Whether the lab grading workspace (CG14) is in scope.
7. Supply authorized log and 10-bit footage, and say whether reference renders
   from another grading application are available for CG15.
8. Priority against the pending editorial typography plan; ET2 is a shared
   dependency for pixel checks on video.
9. What happens to chroma-node afterward: archive, keep as a separate app, or
   later rebuild its UI on this engine.
