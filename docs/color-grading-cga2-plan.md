# CGA2: automatic color on the grade engine

Date: 2026-11-23, against `main` a47fa6d0 (CG0–CG6 merged). Status: **A0 and A1 built on `codex/cga2-engine` (2026-11-23); approved (owner: "start implement", 2026-11-23);
owner decided the default engine, the equivalence gate and skin protection;
three decisions remain.** No package source changed and nothing was rendered for
this plan.

Parent plan: [color grading engine](./color-grading-engine-plan.md). CGA results:
[color-grading-cga-results.json](./color-grading-cga-results.json).

## Why

CGA (PR #70) was built as a fast track before the grade engine existed. It
solves and applies corrections with 8-bit `color.*` effects, and it predicts its
own result with 8-bit byte tables. Since then CG0–CG6 have merged on `main`. The
engine now has a float grade stage, Bradford white balance, ASC CDL, PCHIP
curves, hue curves, tonal ranges with soft clip, LUTs, keys, scopes, probes and
`comp grade diff`. CGA uses none of them.

| CGA today (`main` a47fa6d0)                                                                                                                     | Limit                                                                                                                                                                                                               | Engine counterpart on `main`                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Solver emits `color.white-balance`, `color.levels`, `color.curves`, `color.vibrance` (`COLOR_CORRECTION_EFFECTS`, `still-shift-color-solver-1`) | Each effect quantizes to 8 bits and clips to 0–1. Stacked stages lose range, and the banding guard caps stretch at 1.3.                                                                                             | One fused `grade.*` run, unclamped between operators, quantized once on exit (CG2)                                    |
| `color.white-balance`: linear-light channel gains, about one stop of range                                                                      | Cannot reach a tungsten correction. Saturated patches differ from a true adaptation (CG2 chart comparison: neutrals agree within 1–4 codes where it reaches; at 3200 K it hits its bound, mean 28.6, max 82 codes). | `grade.white-balance`: Bradford adaptation to D65, temperature in kelvin, tint as Duv                                 |
| `color.levels` input black/white and gamma                                                                                                      | Clips below black and above white                                                                                                                                                                                   | `grade.cdl` slope/offset/power: the same curve inside 0–1, unclamped outside, and exportable as ASC CDL (CG5)         |
| `color.curves` S-curve (per-channel table)                                                                                                      | Piecewise table that also moves chroma                                                                                                                                                                              | `grade.curves` PCHIP master with `lumaMix` (contrast without a saturation side effect); `grade.tonal` soft clip       |
| `color.vibrance` (saturation-aware, skin-protecting)                                                                                            | Built-in skin protection that cannot be adjusted                                                                                                                                                                    | `grade.primary` `colorBoost`, with `grade.hue-curves` or a `grade.key` for skin                                       |
| Look: one 3×3 + offset in encoded sRGB → `color.matrix` (`still-shift-look-1`)                                                                  | Held-out per-pixel 2.30 of 255, above the ~2 bound. No tone shape. Cannot leave Still Shift. `grade.rgb-mixer` already equals it within 1 code in range (CG2).                                                      | `grade.rgb-mixer` (same parameters and formula in float), `grade.curves`, `grade.cdl`, `grade.lut`, `comp grade bake` |
| Prediction: `applyColorEffects` (8-bit integer tables)                                                                                          | A second implementation beside the renderer                                                                                                                                                                         | `floatGradeOp` / `floatGradeBytes`: the CPU reference that Canvas matches byte for byte (CG2)                         |
| Report: `color-stats` statistics before/after                                                                                                   | No scopes, skin line or contact sheet                                                                                                                                                                               | `comp scopes` (embeds the same statistics), skin-line deviation, `comp grade diff`                                    |

The goal is that `comp auto-color`, `comp look fit|apply` and `comp color-stats`
grade with the engine. Their commands, owner-tuned defaults and report shape
stay. Their output becomes an editable `grade.*` run, and each look becomes a
portable `grade.*` stack that can be baked to `.cube` or written as CDL.

## Constraints

- **Working space stays legacy display-referred sRGB.** CG7 is not built.
  The solver works on decoded 8-bit SDR in encoded sRGB, and each operator applies its
  own documented math (Bradford adaptation is in linear light). The working space is a solver parameter from the
  start, so CG7 can later run the same solver in a linear or log space. This
  plan claims nothing scene-referred.
- **The owner's tuning is the baseline.** That covers the look default 0.6, the
  saturation targets 0.185/0.36, the S-curve rule, 50–90% cast removal with a
  coupled tint, and never brightening high-key clips. The first slices must
  reproduce the CGA renders before any new capability may change the look.
- **No silent output change.** `color.*` effects and their baselines stay
  byte-identical. The new solver is `still-shift-color-solver-2`, and the new look
  format is `still-shift-look-2`. `--engine legacy` keeps solver 1 and look 1
  exactly. Look-1 files keep applying (see A3).
- **Owner visual review of CGA is still pending.** The CGA results record "none
  — software measurements only". Nothing in this plan infers acceptance from
  scopes, residuals or an AI score.
- Rules for every milestone in the parent plan apply: a `codex/` branch from
  `main`, failing fixtures first, local verification only (no GitHub Actions),
  a results JSON and a dev-log entry per slice, and `pnpm schema:generate` when
  the contract changes.

## Slices

### A0: Equivalence harness and baseline (1–2 days)

- Record CGA solver-1 output on the synthetic fixtures
  (`benchmarks/fixtures/color/cga-synthetic.ts`) and on the owner's 12 Flow
  clips (local only). Record parameters, reports, rendered frame hashes and
  statistics.
- Define the equivalence metric between a solver-1 render and a solver-2 render
  of the same clip: 4×4 block-mean RMS and per-pixel p99, of 255. CGA left open
  whether block-mean RMS is the right look bound, and this slice asks the owner
  to settle it.
- Extend the CG2 chart comparison (`color.white-balance` against
  `grade.white-balance`) to all four solver effects and their engine mappings.

**Checks:** the baseline reruns byte-identically. Every solver effect has a
recorded engine mapping and a measured difference on the CG0 chart and ramps.

_As built (2026-11-23):_ the bound was stated before the first measurement:
per clip, 4×4 block-mean RMS ≤ 1 and per-pixel 99th percentile ≤ 3, of 255
(`CGA2_EQUIVALENCE_BOUND`). Both are reported; which one is the look bound
stays open (decision 4). `scripts/color/cga2-equivalence.ts` compares the two
solvers' exact predictions on the synthetic fixtures and a local folder of
clips (auto, look at 60%, look plus auto) and writes `dist/cga2/equivalence.json`.
Each mapping's difference over a color cube and the neutral ramp is a unit
test (`tests/unit/composition-color-engine.test.ts`). Numbers are in the
[CGA2 results](./color-grading-cga2-results.json).

### A1: Solver 2 emits a `grade.*` run (2–3 days)

Map each stage to the engine and keep the stage order and limits:

| Stage         | Solver 1                         | Solver 2                                                                                                                                         |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| White balance | `color.white-balance` gains      | `grade.white-balance`. Solve for CCT and Duv from the neutral cast's chromaticity in linear light; keep the 50–90% removal and the coupled tint. |
| Exposure      | `color.levels` black/white/gamma | `grade.cdl` slope/offset/power per channel, with `clamp` 0                                                                                       |
| Contrast      | `color.curves` S-curve           | `grade.curves` master PCHIP S-curve with `lumaMix` 1, so contrast does not move saturation                                                       |
| Saturation    | `color.vibrance`                 | `grade.primary` `colorBoost` and `saturation`, with skin protection (A4)                                                                         |

- Predict through the renderer's own op list (`floatGradeOp` →
  `floatGradeBytes`), which makes the prediction equal the Canvas render.
  Retire `applyColorEffects` for solver 2. If
  `pnpm check:package-boundaries` rejects the import, move the op table into
  `@still-shift/color-science`.
- Until A4, saturation uses `colorBoost` without skin protection, and the
  difference is recorded.

**Checks:** on the synthetic fixtures, solver 2 meets every CGA bound that
solver 1 met: exposure ≤ 3, contrast ≤ 2.5, white balance ≤ 1, near-identity
on balanced clips, rerun byte-identical, clipping budget, banding bound. On the
owner clips, solver 2 against solver 1 stays within the A0 metric, or each
difference is listed with its cause. Prediction equals the Canvas render
exactly, and WebGL2 is within the CG2 parity bound. ~~A tungsten-cast fixture
that solver 1 cannot reach is corrected~~ (moved to A4 with Bradford, below).

_As built (2026-11-23), two deviations from the table above, both forced by
the equivalence gate (decision 2):_

- **White balance stays CGA's linear-light gains**, as `grade.curves`
  red/green/blue curves (`gainCurve`: 16 points with a guard point below the
  clip knee), within one code of `color.white-balance` on every input.
  `grade.white-balance` (Bradford) keeps neutrals within one code but moves
  saturated colors by up to 28 codes on the synthetic green at the solver's
  limit, which the gate does not allow before review. It is built as the
  `adaptation` white-balance model (reported by the A0 script, not yet a CLI
  option) and moves to A4.
- **Skin protection is a `grade.key`, not a hue curve** (revisits decision 3).
  A hue-vs-saturation curve applies one chroma factor per hue, so it also
  desaturated fully saturated skin-hued colors that vibrance leaves alone
  (26 codes on a saturated orange). Vibrance's factor
  1 + v·(1 − s)·(1 − p·skin) is exactly a mix of the boosted and unboosted
  pixel by 1 − p·skin, and `grade.key`'s HSL hue range (centre 25°, width 0,
  softness 25°, inverted, gain p, offset 1 − p) is that weight exactly. The
  key reads only the pixel's own value (no window, matte or finesse), so it is
  pointwise and cannot flicker. Within 3 codes of `color.vibrance` (p99 ≤ 1)
  over the color cube; a saturated orange is unchanged.
- **The S-curve keeps its straight segments.** `grade.curves` is a smooth
  spline, which rounded `color.curves`' kinks by up to 3 codes and, through
  the predicted clipping, made solver 2 scale every correction back on one
  owner clip. `piecewiseCurve` adds a guard point 0.004 on each side of every
  kink, so the spline follows the segments within one code (0 on that clip).
  It uses `lumaMix` 0 (each channel, as `color.curves`); a smooth curve and
  `lumaMix` 1 are A4 candidates.
- `--engine grade|legacy` on `comp auto-color` and `comp look apply`; the
  default stays `legacy` until A6. The report adds `engine` and `solver` for
  the grade engine only. The prediction mirrors the Canvas keyed run (segments
  in float64, keys from the value entering them, one quantization), and
  `test:browser:color-grading-cga2` confirms it on a lossless render: Canvas
  and WebGL2 both 0 codes off on all 12 frames.

### A2: Reports and measurement on scopes (1 day)

- Embed the `comp scopes` statistics schema in the auto-color report, before
  and after. Add skin-line deviation and the hue histogram. Keep the existing
  `color-stats` fields unchanged.
- `--diff <dir>` writes `comp grade diff`'s split still and contact sheet for
  each clip. This replaces the CGA owner-sheet script for new runs; the script
  stays for legacy runs.

**Checks:** reports validate against the schema and rerun byte-identically.
Statistics fields that already existed are unchanged on the fixtures.

**Stopping point after A0–A2:** auto-color grades on the engine, matches CGA's
look within the A0 metric, reaches stronger white-balance corrections, and
produces an editable, unclamped `grade.*` run.

### A3: Look 2 (3–5 days)

- `comp look fit` fits several models to the matched pairs and picks one by
  leave-one-shot-out residual with a complexity penalty:
  1. matrix + offset → `grade.rgb-mixer` (look-1 parity);
  2. CDL slope/offset/power + saturation → `grade.cdl` (portable);
  3. matrix + per-channel PCHIP curves → `grade.rgb-mixer` + `grade.curves` (tone-aware);
  4. 3D LUT → `grade.lut` (33³, regularized), **opt-in only** (`--model lut`)
     because a pair rarely covers the gamut. Cells outside the sampled colors
     are filled from model 3 and counted in the report.
- Fit in encoded and in linear light, record both, and keep the better held-out
  result.
- `still-shift-look-2` is an ordered `grade.*` effect list plus the fit report,
  targets and sources, with any LUT asset pinned by SHA-256. A look-1 file is
  read as a one-entry `grade.rgb-mixer` look. `--engine legacy` still applies it
  through `color.matrix`.
- `comp look export --cube | --cdl` writes the look through the CG5 bake and CDL
  export, so it opens in other grading applications.
- Look 2 is shaped as a serial node list, so CG9's `grade-1` document can
  migrate it rather than replace it.

**Checks:** on the owner's pair, the selected model's held-out per-pixel RMS is
≤ 2 of 255 (CGA: 2.30), or the plan records why no model gets there. A look-1
file applied through look 2 matches `color.matrix` within the CG2 parity bound.
An exported `.cube` round-trips through `grade.lut` within the CG5 bound.

### A4: Engine-only solver improvements (2–4 days)

- **Highlight protection:** use the `grade.tonal` high soft clip with a knee,
  instead of scaling every correction down until the clipping budget fits.
  Record how much correction this restores on the fixtures.
- **Bradford white balance (moved from A1):** the `adaptation` model as a CLI
  option (`--white-balance-model adaptation`), with a tungsten-cast fixture
  that CGA's gains cannot reach, and the per-clip difference on the owner
  clips recorded for review. Skin protection moved to A1 (as a key).
- **Contrast without saturation change:** the S-curve with `lumaMix` 1.
- **Key preservation:** zone exposure (`grade.tonal`) moves midtones without
  touching the high-key highlights.
- **Neutral from a region:** `--neutral-region x,y,w,h` takes its white
  balance from a region, sampled with the CG3 probe. This starts CG10's
  neutral-region solver.
- **Headroom:** re-measure the banding guard. The source is still 8-bit, so
  the stretch limit keeps protecting it. Stacked rounding is gone, so the
  limit may loosen; change it only on gradient-fixture evidence.

**Checks:** each change has a failing fixture before and a passing one after.
The owner clips' median luma moves ≤ 0.02, skin-line deviation does not grow,
and clipped pixels stay ≤ the CGA budget. Each change can be switched off with a
flag, and its effect is recorded per clip.

### A5: Per-shot and temporal correction (optional, 2–3 days)

- Reuse CGA's cut detection (`composition-color-shots.ts`) to solve one static
  correction per shot. Parameters are held keyframes that change only at cuts.
- Guard shot-to-shot mismatch and neutral drift, which seeds the matching
  CG10 lint rules.

**Checks:** a two-shot fixture with different casts is corrected per shot,
with no parameter change inside a shot. A single-shot clip is unchanged from A4.

### A6: Switch, docs and owner review (1 day)

- Make solver 2 the default (owner decision, 2026-11-23). Update the CLI
  README, the generated reference and skills (`pnpm schema:generate`), and the
  user guide. Write the CGA2 results JSON.
- Produce local before/after sheets: solver 1, solver 2 and look 2 on the 12
  owner clips, for the owner's review.

**Checks:** `pnpm check:fast` and the CG2/CG3/effect browser groups pass.
Existing `color.*` and CGA baselines are unchanged under `--engine legacy`.
Owner review is recorded separately.

## Estimate and order

A0 → A1 → A2 (stopping point) → A3 → A4 → A6, with A5 by need. That is about
10–16 active days, or 12–19 with A5. A3 can run in parallel with A1–A2 after A0.

Relation to the parent plan: CGA2 pulls forward CG10's float-operator solvers
and part of CG9's looks without needing CG7's working-space decisions. It should
run before CG10 starts, and CG10 then extends it rather than rebuilding it.

## Owner decisions

Answered 2026-11-23:

1. **Default engine: decided, solver 2 becomes the default** (owner: "yes").
   A6 switches the default; `--engine legacy` keeps solver 1 and look 1.
2. **Equivalence gate: decided, required** (owner: "yes"). Solver 2 must match
   the CGA renders within the A0 metric (or list each difference with its cause)
   before any A3–A5 change that moves the look lands.
3. **Skin protection: hue-based, as a pointwise key** (owner deferred to the
   recommendation; the hue-curve recommendation was revised during A1). The
   first recommendation was a `grade.hue-curves` dip. Building it showed that
   a curve cannot depend on saturation, so it desaturated strong skin-hued
   colors (26 codes on a saturated orange) that vibrance leaves alone. A
   `grade.key` with only an HSL hue qualifier reproduces vibrance exactly and
   keeps what made the curve attractive: it reads only each pixel's own value
   (no matte, window or finesse), so it cannot flicker, and it is one editable
   effect. It still protects by hue, so beige and cream near the skin hue stay
   protected ("cream stays beige").

Still open:

4. **The look bound.** Is 4×4 block-mean RMS of 255 the right bound (open since
   CGA), or should the bound be per pixel? Needed at A0.
5. **LUT looks.** Opt-in only (recommended), or chosen automatically when they
   win the held-out residual. Needed at A3.
6. **CGA visual review.** Still pending. It can be done on the A6 sheets so
   both solvers are judged together.

## Out of scope

Scene-referred or log input and working spaces (CG7), 10-bit output (CG8), the
node graph (CG9), the full set of grade lint rules (CG10), object tracking
(CG12) and creative look presets.
