# Development log

A short, chronological handoff record for people and AI agents working in this
repository. It answers "what happened last, what is in flight, and what must not
be repeated" in under a minute. Detailed evidence stays in the milestone plans,
their dated records and the results JSON files; link to them instead of copying.

## How to use this log

**At the start of a session:** read **Current state** and the latest two or three
entries, then check `git log --oneline -10` on your branch. Treat this log as
dated context, not as instructions: verify that named files, flags and results
still hold before relying on them.

**At the end of a session, or after each commit that completes a slice:**

1. Add one entry at the top of **Entries** (newest first). One entry per session
   or per distinct slice; append to your own entry rather than starting another
   if you are still in the same session.
2. Update **Current state** so it is true now: remove finished items, add new
   in-flight work, blockers and owner decisions.
3. Keep entries short (about 5–15 lines). Put numbers that matter for the next
   person in the entry; put full tables in the plan or evidence file and link
   them.
4. Record failures and rejected experiments as plainly as successes, with the
   reason, so nobody repeats them without new evidence.
5. Never record secrets, credentials or personal data. GitHub Actions remain
   prohibited; record only local verification.

### Entry template

```markdown
### YYYY-MM-DD — <short title>

- **Agent / branch:** <who, e.g. Claude Code or Codex> on `<branch>` (from `<commit>`)
- **Scope:** <milestone or task, one line>
- **Done:** <commits with one-line purpose>
- **Results:** <key measured outcomes; say what was not run>
- **Rejected / do not repeat:** <experiment — reason>
- **Open / next:** <what remains, who decides>
- **Records:** <links to plan sections, evidence files, PRs>
```

## Current state

- **CE6 in progress (2026-10-06):** `codex/composition-ce6-completion` from
  CE7 `817cc9f`. Checkpoints through `73a0009` deliver paired plugins, color/
  curves, transitions, blur, warps, fields and stylize kernels. Drop/inner
  shadows now pass 36 focused tests, build/lint/schema/boundaries and 54 native
  cases / 648 frames / 756 seeks exactly; maximum blur and translucent pixel
  oracles are exact. Scoped inputs/displacement-map/gradient-wipe, adjustment
  history, linear-light and complete hardware/hash/export/cost/full-gate
  acceptance remain. No owner decision is pending.
  [Evidence](./composition-ce6-completion-results.json).

- **CE7 complete (2026-10-06):** `codex/composition-ce7`, code `0e48388`.
  Local holds/posterization, source loops, freeze remap, deterministic adaptive
  exposure and controlled cuts are delivered. Full `pnpm check` passes 1,600 unit,
  46 runtime, 139 integration, 14 depth, all browser groups and 176 frozen baselines
  / 36,061 frames. Native pixels/seeks/stored hashes, 12 hardware comparisons,
  independent/repeated exports and serial seven-count 1080p costs pass/are recorded.
  CE13 decode integration remains its conditional handoff. [PR #40](https://github.com/xxibcill/still-shift/pull/40) is open
  and attached; CE6 starts on a new branch. No owner decision is pending.
  [Evidence](./composition-ce7-results.json).

- **CE5 complete (2026-10-05):** `codex/composition-ce5`, runtime `4908cbe`.
  Native shapes, authoring/baking/inspector, reference/animation/MP4 acceptance and
  complete `pnpm check` pass: 1,569 unit, 46 runtime, 139 integration, 14 depth,
  all browser groups and 176 frozen baselines / 36,061 frames. Native stored hashes
  and reverse seeks pass; legacy connectors, actual CE4a brush conversion and all
  18 Apple hardware comparisons are exact. Failed attempts/repairs are retained.
  [PR #38](https://github.com/xxibcill/still-shift/pull/38) is open and attached; CE7 is now complete.
  No owner decision is pending. [Evidence](./composition-ce5-results.json).

- **CE11 complete (2026-10-05):** `codex/composition-ce11`, runtime `5f36268`.
  Native inspector, graph/handle edits, overlays, lossless history, guarded source
  saves and captured-asset exports pass desktop/phone and builder/watch acceptance.
  Full `pnpm check` passes: 1,510 unit, 46 runtime, 139 integration and 14 depth
  tests, all browser suites and 176 frozen baselines / 36,061 frames. Initial failures
  and repairs are retained. [PR #37](https://github.com/xxibcill/still-shift/pull/37) is open and attached; begin CE5 on a new branch. Native camera
  frusta and audio waveforms follow CE8/CE13. [Evidence](./composition-ce11-results.json).

- **CE10 complete (2026-10-05):** `codex/composition-ce10` from CE4a `869a793`;
  runtime `e501fed`. Typed authoring, CLI/watch, presets, eight examples and generated
  guidance pass the full local check: 1,499 unit, 46 runtime, 134 integration and
  14 depth tests, all browser suites and 176 frozen baselines / 36,061 frames.
  The 197-line builder has exact 192-frame Canvas/WebGL parity and identical exports;
  a fresh skill-only source validates without repairs and renders correctly. Initial
  trial/gate failures are retained. [PR #36](https://github.com/xxibcill/still-shift/pull/36)
  is open and attached; owner review/merge remain. CE11 is complete; CE5 follows.
  [Evidence](./composition-ce10-results.json).

- **CE4a complete (2026-10-05):** `codex/composition-ce4a-completion`, implementation
  `876814f` from CE12 `0987396`. Adapted/native picture passages, story fractional
  shutter clocks and explicit narrative bindings are delivered. Full local checks,
  176 baselines / 36,061 frames, both 69-case family matrices / 14,086 frames and
  mixed 576-frame passages pass correctness. WebGL's 51 strict timing overruns stay
  deferred to CE6-P. CE10 is complete; broader CE7 stays open.
  [Evidence](./composition-ce4a-completion-results.json).

- **CE12 motion linting (`[x]`, 2026-10-05):** complete on
  `codex/composition-ce12`, implementation `a365f26` from delivered CE9 `dee9e7b`.
  Rules, CLI lint and Lab timeline are delivered. Full `pnpm check` and all 176
  frozen baselines / 36,061 frames pass in a clean tracked snapshot. Stillness
  acceptance is 79 frozen comparisons in v013 versus zero in the fresh continuous
  prototype. Corpus lint covers 153 state reports and 23 pixel-only items with
  explicit limits and no unexpected failures; existing craft errors remain visible.
  Prior local work retained; CE6-P and CE9-F1 remain deferred. CE4a and CE10 are complete.
  [Completion record](./composition-engine-plan.md#ce12-completion-record-2026-10-05).
  [PR #34](https://github.com/xxibcill/still-shift/pull/34) is open and mergeable, based on CE9 while PR #32
  awaits merge. Owner review and merge remain pending.

- **PR #32 printer fix (2026-10-04):** re-review of delivered `e81a146` found
  one remaining P2 print/parse length defect and no standards findings.
  Posted the inline finding, added compact canonical output with equivalent
  decimal/exponent spellings, and covered eight length/precision/grammar cases.
  Fast checks pass (1,420 tests), along with expression pixel/seek/repeated and
  baked export checks on both backends and evaluator browser parity. One finding
  commit contains the code, tests and records, followed by one final push.
  Owner review/merge remains pending.
  [Printer fix evidence](./pr-32-printer-fix-results.json).
  [Re-review evidence](./pr-32-rereview-results.json).

- **PR #32 earlier fixes delivered (2026-10-04):** inline review posted on
  `75e46f2`; `c3fc70f`, `e693334` and `e81a146` fixed lazy `if`, distance
  dimensions and auto-orient bake parity. Main `5a6705c` (merged PR #31) was
  integrated separately. Remote head was verified as `e81a146`, mergeable.
  All 176 frozen baseline items / 36,061 frames passed without regeneration.
  [Fix evidence](./pr-32-fix-results.json).
  [Review evidence](./pr-32-review-results.json).

_Last updated 2026-10-05 by Codex for CE12 closeout; prior work retained._

- **PR #32 conflict resolution (2026-10-04):** merged `main` at `3413780` into
  PR head `a0708ba` and pushed merge `05033c8`, retaining CE9 expressions and
  main correctness fixes. GitHub confirms `MERGEABLE` / `CLEAN`.
  Both browser suites remain in `pnpm test`; evaluator is `22`, WebGL is `0.36.1`.
  Fast checks (1,404 unit tests), affected browser/export checks, hardware
  typography and all 176 frozen baselines pass. Review/merge remains pending.
  See [resolution evidence](./pr-32-conflict-resolution-results.json).

- **CE9 expressions and motion behaviours (`[x]`, 2026-10-04):** complete on
  `codex/composition-ce9` (from `codex/composition-ce6-performance` at `6034de3`),
  with all required local verification passing and four logical local commits
  (see the closeout entry). [PR #32](https://github.com/xxibcill/still-shift/pull/32)
  targets `main` and is ready for review. The conflict-resolution merge incorporates
  `main` at `3413780` and was pushed as `05033c8`; local correctness and
  frozen-baseline checks pass. GitHub confirms `MERGEABLE` / `CLEAN`.
  One checklist item, runtime
  re-expression of signals/drivers/periodic motion, moved to follow-up **CE9-F1**
  with a recorded reason. Do not merge PR #30 as part of this work.
- **Documentation delivery (CE6):** `c7afacc` commits `AGENTS.md`, this log,
  `docs/composition-engine-plan.md` and `docs/verification.md` on
  `codex/composition-ce6-performance`. [PR #31](https://github.com/xxibcill/still-shift/pull/31)
  targets `main`; separate conflict-resolution merge `c2b5e39` has been pushed.
  Local audit record `205f413` remains outside PR #31 and this CE9 branch.
- **CE6-P performance (`[d]`, owner approved 2026-10-03):** WebGL's **1.25×**
  render/readback gate and CE6's **2×** speed target are deferred to an
  unscheduled future version. No further tuning or rendering architecture
  experiments until an explicit owner request resumes this work. The 0.35
  matrices retain 116 timing failures (73 commerce, 40 story/components, 3
  typography); all pixel, seek and export checks pass. The original 117
  failing cases are not claimed resolved.
  - `ecf9bc6` (renderer `composition-webgl2-0.36.0`) was committed at the
    owner's request **before** its full family matrices finished. Local CE6
    audit record `205f413` is separate and remains undelivered. It does not
    validate the combined WebGL `0.36.1` tree. This conflict-resolution session
    reruns focused correctness/export checks, not the strict family audits.
  - **Rendering-path decision deferred:** effect-free cases are bounded by the
    GPU-process boundary on pinned SwiftShader. Retain the measurements and
    rejected experiments for the future version.
- **Feature priority:** CE4a and CE6 features remain incomplete. CE12 linting is
  complete; CE10's builder/CLI still needs CE4a feature/parity acceptance. CE5
  shape layers and CE7 time controls are also ready. CE8 needs CE6 features and
  CE9; CE14 needs CE6 features; neither needs CE6-P.
- **Untracked files to leave alone:** `docs/composition-renderer-performance-research-1.md`
  and `-2.md` (intentionally untracked research notes) and
  `docs/pr-30-review-plan.json` (origin unknown; it fails the Prettier check, so
  run `pnpm check`'s steps individually and check formatting of changed files).
- **PR base:** CE4a PR #29 and CE4b PR #30 are merged into `main` (verified
  2026-10-03); target `main`.
- **Toolchain gotchas:** run with the pinned Node 22.23.1
  (`~/.nvm/versions/node/v22.23.1/bin` first on `PATH`). The shell default is Node
  24, whose V8 differs in the last ULP of `**`/`exp`, so CE9 baked fixtures must be
  regenerated on Node 22. Code loaded by the Lab Vite config (`scene-contract`)
  must not use TypeScript constructor parameter properties: Node's strip-only mode
  rejects them and five Lab integration suites fail.

## Entries

### 2026-10-06 — CE6 drop and inner shadow checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** real separable GPU Gaussian shadows, fixed weighted sums, Canvas
  references, signed offsets and explicit inner-shadow exterior coverage.
- **Results:** 36 focused tests plus build/lint/schema/boundaries; 54 native
  cases / 648 frames / 756 seeks are exact. Maximum blur passes 2 cases /
  24 frames / 28 seeks; independent translucent-pixel oracles are exact.
- **Next:** scoped inputs/displacement map/gradient wipe, adjustment history,
  linear-light, complete hardware/hash/export/cost/full-gate acceptance, CE6 PR.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 bulge and ripple checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** actual GPU radial image warps, Canvas references, bounded control
  tables and exact signed sampling coordinates/two-word squared distances.
- **Results:** 43 focused tests plus build/lint/schema/boundaries; 54 cases /
  648 frames / 756 seeks are exact. Arbitrary-precision root and full 8192×8192
  coordinate oracles pass at 65,536 and 131,072 points, respectively.
- **Next:** shadows, scoped inputs/history and linear-light, then complete
  hardware/hash/export/cost/full-gate acceptance and CE6 PR.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 vignette and chromatic checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** real GPU vignette/chromatic kernels and Canvas references, bounded
  animated controls, coverage preservation and exact neutral paths.
- **Results:** 48 focused tests plus build/lint/schema/boundaries; 54 cases /
  648 frames / 756 seeks pass at max delta 1. Independent center/shoulder/edge
  and chromatic channel/padding pixel oracles are exact on both backends.
- **Repaired:** missing GPU dimensions binding; Float32 unit precision;
  generated reference refreshed. Pixel tolerances/frozen baselines unchanged.
- **Next:** remaining distortion/shadows/scoped inputs/history/linear-light,
  then complete hardware/hash/export/cost/full-gate acceptance and CE6 PR.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 seeded native fields checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** actual GPU fractal fill/turbulent sampling, integer seeded fields,
  bounded octaves/evolution, fixed sums and explicit signed quotient correction.
- **Results:** 68 focused tests plus build/lint/schema/boundaries; 54 native
  cases / 648 frames / 756 seeks are exact. Packed fields are exact at 81,920
  points; 65,536 values at each of seven amplitudes have exact quotients.
- **Repaired:** neutral CPU helper returned negative zero; result normalized.
  Complete milestone gate remains pending; no pixel threshold changed.
- **Next:** remaining distortion/stylize/shadows and scoped inputs/history,
  then linear-light and complete hardware/hash/export/cost/full-gate acceptance.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json),
  [field conventions](./composition-effect-plugins.md#seeded-native-fields).

### 2026-10-06 — CE6 transform and corner-pin checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** native GPU/Canvas warps, high-resolution affine controls with exact
  cancellation, float32 homography, final immutable parameter validation/diagnostics.
- **Results:** 143 focused tests plus build/lint/schema/boundaries; 63 native
  cases / 756 frames / 882 seeks are exact. Independent four-color cancellation
  oracle is exact. Complete milestone gate remains pending.
- **Repaired:** new cancellation expectations assumed unquantized controls;
  exact 1080p and native pixel oracles now exercise the documented arithmetic.
- **Next:** remaining distortion/stylize/shadows and scoped inputs, then
  linear-light and complete hardware/hash/export/cost/full-gate acceptance.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json),
  [warp conventions](./composition-effect-plugins.md#native-geometric-warps).

### 2026-10-06 — CE6 sampled blur checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** radial, zoom and reusable lens aperture kernels; real GPU samples,
  Canvas premultiplied reference, fixed sums/quantized controls, neutral/bounds tests.
- **Results:** 62 focused tests plus build/lint/schema/boundaries; 81 native
  cases / 972 frames and 27 maximum-control cases / 324 frames at 64 samples.
  Pixels and 1,512 seeks pass. Complete milestone gate remains pending.
- **Next:** spatial and remaining catalogue effects, scoped inputs/gradient
  wipe, linear-light and complete hardware/hash/export/cost/full-gate acceptance.
  CE8 supplies focus-driven lens controls later.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json),
  [sampling conventions](./composition-effect-plugins.md#native-sampled-blur).

### 2026-10-06 — CE6 native transition checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** linear/radial wipes, venetian blinds and integer-seeded block
  dissolve, with animated coverage, explicit direction/radial/rounding rules.
- **Results:** 76 focused tests plus build/lint/schema/boundaries; 108 native
  cases / 1,296 frames / 1,512 seeks, max delta 1 and minimum PSNR 64.43 dB.
  Sixteen direct coverage oracles pass. Complete milestone gate remains pending.
- **Repaired:** test expected transparent WebGL screen output; direct coverage
  oracle now uses explicit black background. Radial center/full turns are defined.
- **Next:** spatial and remaining catalogue effects, scoped inputs/gradient
  wipe, linear-light and complete hardware/hash/export/cost/full-gate acceptance.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json),
  [transition conventions](./composition-effect-plugins.md#native-transitions).

### 2026-10-06 — CE6 animated curves checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** bounded curves, stable topology, point/component animation,
  drivers/expressions, lossless builder/baking and native inspector graphs;
  GPU control transfer with owned uploads and Canvas piecewise reference.
- **Results:** 246 focused tests plus build/lint/schema/boundaries. Ten color
  effects pass 270 cases / 3,240 frames and 3,780 seeks; max delta 1, minimum
  PSNR 64.97 dB. Exhaustive byte/alpha parity is exact in four curve and six
  posterize cases. Full milestone gate remains pending.
- **Repaired:** validate ordering after all drivers/expressions, including
  layers without expressions; initial type/caller failures are retained.
- **Next:** remaining catalogue/dependencies and linear-light composition,
  then complete hardware/hash/export/cost/full-gate acceptance.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json),
  [effect conventions](./composition-effect-plugins.md).

### 2026-10-06 — CE6 native color correction checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** nine color effects, animated gradients, real GPU kernels and Canvas
  equations with explicit premultiplied-byte reconstruction/quantization.
- **Results:** 150 focused tests plus build/lint/schema/boundaries; 243 native
  cases / 2,916 frames across nine layer variants, max delta 1 and minimum
  PSNR 64.97 dB; 3,402 seeks pass. All 32,895 byte/alpha pairs are exact at six
  posterize counts. Full milestone gate and remaining acceptance are pending.
- **Rejected / repaired:** platform unpremultiplication crossed posterize
  thresholds (delta 10); explicit common byte semantics repaired it. Reciprocal/
  round-even hypotheses and shader/test-helper failures remain recorded.
- **Next:** curves and remaining effects/dependencies, then linear-light and
  complete native/hardware/export/cost/full-gate acceptance.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json),
  [plugin and color conventions](./composition-effect-plugins.md).

### 2026-10-06 — CE6 paired render callback checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** paired descriptor/GPU/Canvas registration, pooled shader stages,
  bounded scratch ownership and transactional output with cleanup diagnostics.
- **Results:** 35 focused tests, build/lint/schema/boundaries and the existing
  WebGL browser gate pass. All 12 custom-plugin frames match Canvas exactly;
  seven random seeks and an independent gray-value oracle pass.
- **Repaired:** standalone browser helper package alias; initial failure retained.
- **Next:** remaining built-in catalogue, layer dependencies and linear-light
  composition, then complete native/hardware/export/cost/full-gate acceptance.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 effect contract checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion` from `817cc9f`.
- **Done:** descriptor-backed registration, animated points, default-preserving
  builder/inspector lanes, checked expansion and effect-version export identity.
- **Results:** 200 focused tests plus build/schema/boundaries/lint; existing
  native effect and WebGL browser checks recorded separately. Full gate pending.
- **Rejected / repaired:** incomplete bounds, object-order version comparison and
  split-point default loss; regressions now cover all three. Initial failed
  fixtures/build attempts remain recorded.
- **Next:** paired GPU/Canvas runtime callbacks and remaining CE6 effect features.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE7 milestone verification complete

- **Agent / branch:** Codex on `codex/composition-ce7`, code `0e48388`.
- **Done:** local time controls, loops/freeze, adaptive sampling, cut-safe exposure,
  native acceptance and source-frame-pair handoff for CE13.
- **Results:** complete local `pnpm check` passes 1,600 unit, 46 runtime,
  139 integration and 14 depth tests, every browser group and all 176 frozen
  baselines / 36,061 frames without regeneration. Current Canvas matrices retain
  their pixel/timing assertions; new native hashes and both-backend exports pass.
- **PR / next:** [PR #40](https://github.com/xxibcill/still-shift/pull/40) is open and attached; start CE6 on its own branch.
- **Records:** [CE7 evidence](./composition-ce7-results.json), including initial
  focused failures, assertion repair, actual hardware and serial cost evidence.

### 2026-10-05 — CE7 native acceptance and serial sample costs

- **Agent / branch:** Codex on `codex/composition-ce7`.
- **Done:** independent clock/pixel oracle, forward/reverse/random seeking,
  separate CE7 stored baselines, actual hardware acceptance and independent
  preview/export encodes for both fixtures/backends.
- **Results:** 96 native frames, 12 hardware comparisons and repeated exports
  pass unchanged thresholds. Existing fixed-exposure oracles remain exact.
  Serial 1080p costs for 1/2/4/8/16/32/64 samples are recorded for both backends.
  Build/lint/schema/boundaries pass; initial cache-report assertion repair retained.
- **Next:** complete local `pnpm check`/frozen CE0, then milestone PR and CE6 branch.
- **Records:** [CE7 evidence](./composition-ce7-results.json).

### 2026-10-05 — CE7 adaptive sampling and controlled exposure cuts

- **Agent / branch:** Codex on `codex/composition-ce7`.
- **Done:** deterministic adaptive shutter cap/reduction, shared sample planning,
  held/stepped/reversed content cuts, cycle boundaries and finite terminal holds.
  Explicit scope overrides ignore inherited object properties.
- **Results:** 266 focused tests, build, lint and generated schema pass. Analytic
  blur extents, phase, nesting, seek order, opt-outs and named instances pass.
- **Next:** native browser/hardware/export acceptance, serial sample costs, then
  complete local gate and milestone PR. No full CE7 completion is claimed.
- **Records:** [CE7 evidence](./composition-ce7-results.json).

### 2026-10-05 — CE7 local clocks and precomp loops

- **Agent / branch:** Codex on `codex/composition-ce7`, from CE5 `edb958a`.
- **Done:** bounded local posterization/holds, signed precomp cycle/pingpong,
  finite loop counts, root-located precision diagnostics and CE13 frame-pair handoff.
  Existing single hold remap keys freeze keyed source; root bindings remain live.
- **Results:** 250 focused unit tests, build, changed-file lint and generated
  schema checks pass. No full gate or CE7 completion is claimed.
- **Next:** integrate exposure cuts/adaptive sampling, then native acceptance,
  serial cost measurements, complete local gate and stacked PR.
- **Records:** [CE7 evidence](./composition-ce7-results.json).

### 2026-10-05 — Complete CE5 native shapes and full local acceptance

- **Agent / branch:** Codex on `codex/composition-ce5`; runtime `4908cbe`.
- **Done:** bounded cubic shape trees, four paints, all nine ordered operators,
  aligned morphs, native ink/brush, bounds/constraints, builder/baking/inspector.
- **Results:** complete local `pnpm check` passes: 1,569 unit, 46 runtime,
  139 integration and 14 depth tests, all browser groups and 176 frozen baselines /
  36,061 frames. New reference/animation baselines and reverse seeks pass unchanged;
  144 legacy connector frames and actual 24-frame CE4a brush conversion are exact.
  All 18 Apple hardware comparisons are exact; independent MP4/transport pairs
  and inspector acceptance pass. Initial failures/repairs remain recorded.
- **PR / next:** [PR #38](https://github.com/xxibcill/still-shift/pull/38) is open and attached; create CE7’s branch. No owner decision
  is pending. Existing CE0 baselines were not regenerated; Actions remain disabled.
- **Records:** [CE5 evidence](./composition-ce5-results.json).

### 2026-10-05 — Remove unused CE5 shape-budget allocation

- **Agent / branch:** Codex on `codex/composition-ce5`.
- **Repaired:** ordinary compositions avoid unused shape-location wrappers;
  native geometry and follow-path diagnostics retain shared accounting/locations.
- **Results:** 126 focused evaluator/expression/shape tests, build and lint pass.
  Serial A/B composition times improve in both paired runs with exact pixels;
  the complete strict Canvas story matrix and required exports pass.
- **Retained failure:** full gate at `8efe1ab` stopped on story-visibility timing
  1.25094× over 1.25×, with exact pixels; unchanged focused rerun passed 1.22145×.
  No threshold, baseline, output arithmetic or output version changed.
- **Next:** checkpoint the measured guard and restart the complete local gate.
- **Records:** [CE5 evidence](./composition-ce5-results.json).

### 2026-10-05 — Repair CE5 hardware native paint preparation

- **Agent / branch:** Codex on `codex/composition-ce5`.
- **Done:** native cubic/nib paints use CPU preparation on hardware previews;
  WebGL texture composition stays on GPU. Added 18 actual-hardware comparisons.
- **Results:** all 18 are pixel-exact on Apple M5 Pro. Stored native baselines,
  144 legacy connector frames, inspector and independent MP4/transport pass;
  1,569 unit tests and static checks pass. Actual CE4a brush connector conversion
  is exact for all 24 forward/reverse frames on both backends.
- **Rejected:** hardware Canvas animation/95 had PSNR 39.82 dB before repair;
  retained failure and superseded isolated full-gate logs. No baseline rewritten.
- **Next:** restart complete local gate, frozen CE0 verification and CE5 PR.
- **Records:** [CE5 evidence](./composition-ce5-results.json).

### 2026-10-05 — Repair CE5 full-gate example inventory

- **Agent / branch:** Codex on `codex/composition-ce5`, after `df3374a`.
- **Repaired:** CE5 adds the ninth native example; the integration inventory and
  generated/user guidance still said eight. Updated all three to nine.
- **Results:** initial full gate passes static checks, 1,569 unit, 46 runtime and
  138 integration tests; the inventory assertion is its sole failure. Targeted
  example validation passes. Full gate must restart from this checkpoint.
- **Records:** [CE5 evidence](./composition-ce5-results.json); initial log retained.

### 2026-10-05 — Verify CE5 native reference, connector and export acceptance

- **Agent / branch:** Codex on `codex/composition-ce5`, after `48ba291`.
- **Done:** 31-cell reference and new CE5 baselines; 96-frame morph/trim/wiggle,
  native inspector edits/save and independent both-backend MP4 checks.
- **Results:** 1,569 unit tests/static checks pass; 32-case / 224-frame probe meets
  unchanged near tier. All 144 legacy connector/nib frames are exact. Full native
  forward/reverse hashes match; independent MP4 and both transports are identical.
- **Repaired:** ink winding mismatch; retained legacy nib arithmetic with bounded
  sampling; export browser boundary now preserves overflow diagnostic locations.
- **Rejected:** initial module-load timeout and failed comparison/test inputs are
  retained. Only new CE5 baselines were written; frozen CE0 baselines unchanged.
- **Next:** full local `pnpm check`, milestone closeout/PR, then CE7 branch.
- **Records:** [CE5 evidence](./composition-ce5-results.json).

### 2026-10-05 — Complete CE5 native authoring checkpoint

- **Agent / branch:** Codex on `codex/composition-ce5`, after `8c868dd`.
- **Done:** nested builder selectors/defaults, native drawOn, expression baking,
  inspector tracks/cubic overlays and a native example. Parent operators now update
  painted child bindings; repeat copies retain nested paint references.
- **Results:** 1,568 unit tests, static checks and the 22-case browser probe pass.
- **Repaired:** optional vector animation omitted its other axis; both defaults now
  survive component authoring. Five native authoring regressions pass.
- **Next:** complete reference fixtures/baselines, animated sequences, independent
  MP4/inspector acceptance and full local gate. CE5 remains in progress.
- **Records:** [CE5 evidence](./composition-ce5-results.json).

### 2026-10-05 — Connect CE5 native shape evaluation and rendering

- **Agent / branch:** Codex on `codex/composition-ce5`, after `822ad9a`.
- **Done:** native shape properties/drivers/expressions, shared evaluation budget,
  constraint bounds/follow-path, Canvas/WebGL shape dispatch, gradients/dashes and
  ink/brush geometry with retained reveal coordinates; availability/versions updated.
- **Results:** all 1,562 unit tests and build/lint/schema/boundaries/format pass.
  Browser: 22 cases / 154 sampled frames meet unchanged near tier (max Δ2,
  minimum PSNR 58.24 dB); connector/nibs and both-backend reverse seeks are exact.
- **Rejected:** exploratory exact cross-backend assertion fails at antialias/gradient
  rounding. Measurements retained; no exact parity repair or full-gate pass claimed.
- **Next:** bake/builder/inspector, complete reference/baselines and MP4 acceptance,
  then full local gate and CE5 PR. Existing CE0 baselines have not been regenerated.
- **Records:** [CE5 evidence](./composition-ce5-results.json).

### 2026-10-05 — Add CE5 typed sampling and paint compilation

- **Agent / branch:** Codex on `codex/composition-ce5`, after `f09c765`.
- **Done:** explicit sampled shape state, upstream bindings/reverse paint order,
  nested paint transforms, repeater paint/geometry copies and conservative bounds.
  Individual trim keeps repeated source IDs attached to their own paint bindings.
- **Results:** 12 compiler/sampling checks and all 1,556 unit tests pass; build,
  lint, boundaries and owned formatting pass. Empty-copy/reference work is bounded.
- **Next:** native evaluator/session budget, both backends and authoring integration;
  shape availability remains gated and full browser/export acceptance is pending.
- **Records:** [CE5 evidence](./composition-ce5-results.json).

### 2026-10-05 — Add CE5 bounded shape operators

- **Agent / branch:** Codex on `codex/composition-ce5`, after `d1d7106`.
- **Done:** trim/source spans, repeater transforms/order/opacity, quantized Boolean
  geometry and offsets, corner rounding and four deterministic deformations.
- **Results:** 17 analytic operator tests and all 1,544 unit tests pass; build,
  boundaries, schema, owned formatting and lint pass after type-import repairs.
- **Choices:** native linear twist falloff, signed open parallel offsets and
  multi-operand XOR are explicit native semantics; AE pixel parity is not claimed.
- **Next:** paint compiler, evaluator/global work budget and native rendering;
  browser/export and full milestone gate have not run for this checkpoint.
- **Records:** [CE5 evidence](./composition-ce5-results.json).

### 2026-10-05 — Add CE5 cubic geometry and morph correspondence

- **Agent / branch:** Codex on `codex/composition-ce5`, after `13669d4`.
- **Done:** exact cubic bounds, bounded flattening, native primitives/corner fillets,
  shared budget API and closed-path vertex/tangent alignment. Rich legacy morphs
  render through native geometry; existing point-only arithmetic is preserved.
- **Results:** build/lint, schema/boundaries and all 1,527 unit tests pass, including
  11 analytic geometry/morph checks. Native evaluator/renderer versions updated.
- **Next:** operators, paint compilation and native frame-budget/render integration,
  then authoring and milestone browser/baseline/export acceptance.
- **Records:** [CE5 evidence](./composition-ce5-results.json).

### 2026-10-05 — Start CE5 with native shape contracts

- **Agent / branch:** Codex on `codex/composition-ce5`, from CE11 `a0c56df` /
  [PR #37](https://github.com/xxibcill/still-shift/pull/37).
- **Done:** typed groups, primitives, paints and operators; bounded 2D animations,
  nested native property locator and pinned Boost-licensed polygon library.
- **Results:** build/lint and all 1,516 unit tests pass, including 40 focused checks;
  generated JSON schema updated. Initial diagnostic expectations/lint repairs retained.
- **Next:** native geometry and rendering, authoring integration and full acceptance.
  Runtime shape layers remain unavailable until the native renderer is connected.
- **Records:** [CE5 evidence](./composition-ce5-results.json).

### 2026-10-05 — Complete CE11 inspector and full local acceptance

- **Agent / branch:** Codex on `codex/composition-ce11`; runtime `5f36268`.
- **Done:** native shared-session preview, layer/property/marker inspection,
  authored and resolved graphs, temporal/spatial/Bézier edits, overlays, lossless
  undo/redo, guarded JSON saves, executable builder-key copies and native draft export.
- **Results:** complete local `pnpm check` passes: 1,510 unit, 46 runtime,
  139 integration and 14 depth tests, all browser groups and 176 frozen baselines /
  36,061 frames. Desktop/phone acceptance and byte-identical saved-source/MP4
  exports pass. Initial failures and repairs remain recorded; no baseline regeneration.
- **PR / next:** [PR #37](https://github.com/xxibcill/still-shift/pull/37) is open and attached; create CE5's branch. Camera frusta and
  waveforms follow native CE8/CE13; runtime motion lowering remains parity-gated.
- **Records:** [CE11 evidence](./composition-ce11-results.json).

### 2026-10-05 — Retain inspector view visibility across motion edits

- **Agent / branch:** Codex on `codex/composition-ce11`, after `57a7e92`.
- **Done:** apply transient hide/solo to staged edit/history previews while keeping
  those flags outside the raw proposal until Apply visibility or Save.
- **Results:** browser regression confirms the original mismatch (hidden layer
  reappeared after curve edits). Complete desktop/phone acceptance passes with
  hide → edit → undo/redo coverage, native MP4 parity, saves, builder copy and watch.
  Build/lint pass. The prior full gate is stopped (143) at the superseded source.
- **Next:** checkpoint this repair and rerun the full isolated local gate before
  publishing CE11. Existing source-ownership and explicit reset/save rules remain.
- **Records:** [CE11 evidence](./composition-ce11-results.json).

### 2026-10-05 — Preserve JSON source permissions on native save

- **Agent / branch:** Codex on `codex/composition-ce11`, after `35ea938`.
- **Done:** restore source permission bits on the temporary JSON file before
  atomic replacement, avoiding process-umask changes to existing permissions.
- **Results:** regression fails before the fix (`0666` becomes `0644`) and all
  four save/API tests pass afterward. Changed lint passes; formatting corrected.
- **Next:** the isolated full check at `35ea938` was stopped during integration
  (exit 143) after reproducing this defect. Restart at the repaired checkpoint;
  no full-check success is claimed. Owner's running Lab remains untouched.
- **Records:** [CE11 evidence](./composition-ce11-results.json).

### 2026-10-05 — CE11 inspector guidance and verification isolation

- **Agent / branch:** Codex on `codex/composition-ce11`, after `46240f5`.
- **Done:** user guide and maintained/generated reference document inspector edits,
  graph clocks, source ownership, visibility saves and native draft exports.
- **Results:** second full check passes 1,510 unit, 46 runtime, 139 integration,
  14 depth tests, story/commerce matrices, then fails the typography module fetch.
  The unchanged focused typography rerun passes all 20 cases / 3,367 frames.
- **Rejected / next:** no successful full-check claim. Snapshot Vite caches were
  shared with the primary checkout; isolate them for the next full check. Their
  involvement is unconfirmed. Preserve both failure and recheck evidence.
- **Records:** [CE11 evidence](./composition-ce11-results.json).

### 2026-10-05 — Repair native imports in the CE11 Vite configuration

- **Agent / branch:** Codex on `codex/composition-ce11`, after `4714cce`.
- **Done:** narrow relative native composition imports preserve Vite bundling; save
  errors use explicit fields compatible with Node strip-only loading.
- **Results:** build, lint and dependency boundaries pass. The first full check
  passed 1,510 unit and 46 runtime tests, then failed integration loading. Retain
  that run and its repaired-suite attempt. Three depth timeouts pass on isolated
  recheck; a sound transition timeout passes its isolated trace. Timeouts unchanged.
- **Next:** all 25 affected integration tests pass; repeat the full local gate before
  the CE11 PR. The primary Python environment and owner changes are preserved.
- **Records:** [CE11 evidence](./composition-ce11-results.json).

### 2026-10-05 — Verify copied builder keys and resolved inspector motion

- **Agent / branch:** Codex on `codex/composition-ce11`, after `f47fda5`.
- **Done:** executable builder key copies, separate resolved/root and authored/local
  graphs with instance FPS, native camera inspection, source bindings and diagnostic
  jumps. Save applies transient visibility; native export includes the accepted view.
  History checks precede preview swap. Automatic local ports avoid session collisions.
- **Results:** 12 focused model/copied-builder tests and four save API tests pass;
  full inspector desktop/phone acceptance and shared/legacy lifecycle checks pass.
  MP4 downloads equal CLI bytes; screenshots and media evidence are retained.
- **Next:** full local CE11 milestone gates, then its stacked PR before CE5.
  Native audio and camera frusta remain with CE13/CE8; route selection is bounded.
- **Records:** [CE11 evidence](./composition-ce11-results.json).

### 2026-10-05 — Connect native inspector edits, overlays and MP4 export

- **Agent / branch:** Codex on `codex/composition-ce11`, after `3f217d3`.
- **Done:** layer timing/badges and view-only visibility, property/marker lanes,
  native value/speed graphs and temporal/spatial/Bezier controls, SVG overlays,
  history/save integration and captured-asset native MP4 draft export.
- **Results:** desktop/390px-phone acceptance passes with relative image assets:
  edit/undo/redo, rejection rollback, graphical Bezier keys, transient visibility,
  overlays, lossless save, backend retention and external conflicts. Downloaded MP4
  exactly matches an independent CLI render; decoded preview mean difference is <3.
  Builder watch regressions, build/lint and boundaries pass. Staged asset loads now
  lock inspector edits; codec-threshold and loading-race repairs are retained.
- **Next:** final inspector/builder-copy review, full local gates, then the milestone
  PR before CE5. Camera frusta/audio remain tracked with native CE8/CE13 integration.
- **Records:** [CE11 evidence](./composition-ce11-results.json).

### 2026-10-05 — Add lossless native edit history and fixed-source saves

- **Agent / branch:** Codex on `codex/composition-ce11`, after `0dae1ac`.
- **Done:** immutable document proposals and bounded undo/redo; native key discovery,
  value/speed sampling and temporal/spatial/Bezier edits; raw source documents/hashes
  and local fixed-input JSON saves with conflict guards and atomic replacement.
- **Results:** eight model tests and three save integration tests pass, plus build,
  changed-file lint and package boundaries. Builder source writes are rejected;
  no-op bytes, untouched fields, permissions and competing-save conflicts are checked.
- **Next:** connect the inspector and accepted edit lifecycle; native draft export
  and desktop/phone preview/save/export acceptance remain.
- **Records:** [CE11 evidence](./composition-ce11-results.json).

### 2026-10-05 — Move composition preview into the shared session

- **Agent / branch:** Codex on `codex/composition-ce11`, after `f436ef5`.
- **Done:** the composition page uses shared transactional loads, playback and
  renderer ownership; native Canvas/WebGL surfaces retain their original context.
  Frame callbacks update diagnostics without rendering a duplicate frame.
- **Results:** build/lint and composition-program, quality and renderer browser
  gates pass. Watch errors preserve frame 17 and pixels, shortened duration clamps
  to 7, backend switching keeps the frame and source/JSON exports remain identical.
- **Next:** native lossless document history, layer/key/graph editing, overlays and
  save/export acceptance. Fixed-input JSON source bytes still need save API support.
- **Records:** [CE11 evidence](./composition-ce11-results.json).

### 2026-10-05 — Start CE11 shared-session renderer support

- **Agent / branch:** Codex on `codex/composition-ce11`, from CE10 `afb4045` /
  [PR #36](https://github.com/xxibcill/still-shift/pull/36).
- **Done:** generic renderer/presentation ownership, optional valid-preview retention,
  frame callbacks, commit result and fieldset export locks in the shared session.
  Preserve legacy session defaults; record the existing Lab tone as an implementation
  default while the optional design question remains unanswered.
- **Results:** build, lint, boundaries and formatting pass. New browser lifecycle
  coverage and all existing shared-session workbench regressions pass.
- **Next:** move the composition page to this session; implement native document
  history, layers, graph editing, overlays and lossless save/export acceptance.
  Real camera-frustum/audio waveform follow-through belongs to CE8/CE13 availability.
- **Records:** [CE11 evidence](./composition-ce11-results.json).

### 2026-10-05 — Complete CE10 typed authoring and CLI

- **Agent / branch:** Codex on `codex/composition-ce10`, from CE4a `869a793`.
- **Done:** typed layers/properties/timelines, pinned assets, native story/text presets,
  fresh TypeScript CLI/watch preview and generated reference/skill. Frequent implementation
  and guidance checkpoints preserve the authored source and runtime contracts.
- **Results:** complete local `pnpm check` passes on the clean runtime checkpoint
  `e501fed`: 1,499 unit, 46 runtime, 134 integration and 14 depth tests, all browser
  groups and 176 frozen baselines / 36,061 frames. No baselines regenerated.
- **Acceptance:** the 197-line builder matches 192 CE4a frames exactly on both
  backends; source/JSON exports are identical. Fresh skill-only authoring has zero
  schema errors, no source repairs and a verified 96-frame render.
- **Retained failures:** full checks exposed render exit-code, aliased asset-path and
  missing-parent identity regressions; focused repairs and the full rerun pass. Initial skill guidance failures
  stay recorded. Owner local changes preserved; Actions remain disabled.
- **PR / next:** [PR #36](https://github.com/xxibcill/still-shift/pull/36) is open and
  attached, stacked on CE4a. Start CE11 on its own branch; no PRs were merged.
- **Evidence:** [CE10 results](./composition-ce10-results.json),
  [skill trials](./composition-ce10-skill-trials.json).

### 2026-10-05 — Preserve CE10 missing-asset watch identity

- **Agent / branch:** Codex on `codex/composition-ce10`, after `acac044`.
- **Failure:** the full path-repair check passed unit/runtime gates, then found an
  existing missing-asset assertion requiring its parent directory's canonical identity.
- **Done:** resolve the logical asset path first; canonicalize its existing parent
  when the file is absent. This keeps missing-file watch recovery stable without
  changing the logical-directory repair for existing files.
- **Results:** all 134 integration tests, build and changed-file lint pass.
  Complete local verification remains before the milestone PR.
- **Records:** [CE10 evidence](./composition-ce10-results.json).

### 2026-10-05 — Repair CE10 logical asset directories

- **Agent / branch:** Codex on `codex/composition-ce10`.
- **Failure:** the second full local check passed 1,499 unit, 46 runtime, 131
  integration and 14 depth tests, all preceding browser groups and the 127-case
  commerce matrix. Its final CLI assertion exposed early path canonicalization:
  `/var`-relative font paths became `/private/private/tmp` and failed with ENOENT.
- **Done:** resolve JSON/legacy assets against the requested directory before
  canonicalizing each file; retain that directory in watch preview and portable
  output. Directory-symlink regressions cover validation, export, watch and bad fonts.
- **Results:** ten focused CLI/preview tests, build, changed-file lint and package
  boundaries pass. The full repair-checkpoint check remains; do not mark CE10 done.
- **Records:** [CE10 evidence](./composition-ce10-results.json).

### 2026-10-05 — Inspect the unchanged fresh CE10 skill trial

- **Agent / branch:** Codex on `codex/composition-ce10`.
- **Done:** render the first-valid Room to Move source without repairs; FFprobe
  verifies 96 frames at 24 fps and 640 × 360. Pinned text uses no system fonts.
- **Inspection:** frame 0 fully covers the square, frame 60 shows the separated gates
  and readable heading, and frame 94 confirms the title faded before the end.
- **Next:** the clean repair checkpoint `c44032b` is running the full local check;
  publish CE10's PR when it passes, then create the CE11 branch.
- **Evidence:** [trial record](./composition-ce10-skill-trials.json),
  [milestone results](./composition-ce10-results.json).

### 2026-10-05 — Restore CE10 render failure exit codes

- **Agent / branch:** Codex on `codex/composition-ce10`.
- **Found:** the full local check passed build/lint and 1,499 unit, 46 runtime,
  130 integration and 14 depth tests, then stopped in the existing WebGL export
  gate because an invalid backend returned exit 1 instead of the required exit 2.
- **Fixed:** preserve render usage/scene exit 2 and file/loader runtime exit 1;
  four focused CLI tests pass. Update the user guide for TypeScript authoring.
- **Next:** repeat the complete local check on the repair checkpoint, inspect the
  fresh skill trial render, then publish the milestone PR before CE11.
- **Evidence:** [CE10 results](./composition-ce10-results.json). Failed trial sources
  stay as ignored `.ts.txt` artifacts so the repository compiler excludes them.

### 2026-10-05 — Verify CE10 skill-only authoring and repair guidance

- **Agent / branch:** Codex on `codex/composition-ce10`.
- **Done:** two isolated agents followed only the compact skill for a new Room to Move
  brief. The initial trial exposed missing timing/clock and stacking guidance; retain
  its eleven source versions and failed first validation. Update those instructions.
- **Results:** a fresh independent trial passes its first completed validation with
  zero schema errors and no source repairs; its JSON export also validates. Both
  initial CLI launches hit sandbox IPC before reaching validation, then ran unchanged.
- **Limits:** deliberate reading holds retain the default frozen-run lint findings.
  Full local checks run on the clean tracked runtime checkpoint; final guidance changes
  are verified separately. Fresh render inspection follows the browser gates.
- **Records:** [trial evidence](./composition-ce10-skill-trials.json),
  [CE10 evidence](./composition-ce10-results.json).

### 2026-10-05 — Generate CE10 authoring reference and skill

- **Agent / branch:** Codex on `codex/composition-ce10`.
- **Done:** generated root/layer contracts, aliases, diagnostics, native built-ins,
  expression grammar, effects/intent registries and limits, plus a compact authoring
  skill. Preserve explanatory reference prose as the generator's maintained input.
  Existing schema generate/check commands now include both authoring artifacts.
- **Results:** build, schema drift check, lint, skill validation and an independent
  write/check/drift regression pass. Generated checks do not overwrite stale files.
- **Open / next:** isolated skill trial is running in a temporary directory; complete
  full local milestone gates and create the CE10 PR before starting CE11.
- **Records:** [CE10 evidence](./composition-ce10-results.json),
  [authoring skill](../skills/compose-with-still-shift/SKILL.md).

### 2026-10-05 — Port CE10 native intent presets

- **Agent / branch:** Codex on `codex/composition-ce10`.
- **Done:** all seven motion and eight text recipes as plain timeline functions;
  share pure intent/text definitions with the existing story renderer. Native signals,
  staged drivers, carriers, decorations, correction/retype/count and qualifier motion
  retain story semantics. Repeated finish is stable and driver call sites are distinct.
- **Results:** all 1,498 unit tests and eight example programs pass; build, lint and
  boundaries pass. The pinned native text preset example renders through the real CLI.
- **Rejected / repaired:** the legacy text bridge's 16 px minimum wrongly rejected
  native 12 px text; use the native size contract. Zod refined objects require safeExtend.
- **Open / next:** generated reference/skill, isolated agent trial, full local gates/PR.
- **Records:** [CE10 evidence](./composition-ce10-results.json).

### 2026-10-05 — Prove CE10 builder examples and Unequal Margins parity

- **Agent / branch:** Codex on `codex/composition-ce10`.
- **Done:** eight typed programs with pinned assets; native 197-line Unequal Margins
  choreography, static illustration helpers and shared pure easing implementation.
- **Results:** 111 focused tests, build, lint and boundaries pass. All 192 frames on
  Canvas and WebGL have zero pixel difference from CE4a; seven backward seeks per
  backend match; TypeScript and JSON produce byte-identical 192-frame MP4s.
- **Rejected / repaired:** the first proof read a Canvas context on WebGL; switched
  to the renderer's public readPixels method. No tier was relaxed.
- **Open / next:** story presets, generated reference/skill, isolated authoring trial,
  full local gates and milestone PR.
- **Records:** [CE10 evidence](./composition-ce10-results.json).

### 2026-10-05 — Deliver CE10 watch preview checkpoint

- **Agent / branch:** Codex on `codex/composition-ce10`.
- **Done:** immutable asset snapshots, imported-module/asset watching and recovery,
  cancellable fresh builds, transactional Lab preview swaps and nested source sites.
- **Results:** all 128 integration tests pass. Browser verification retains frame 17
  and pixels on an invalid rebuild, updates without page reload, clamps to frame 7,
  switches backend and exports byte-identical TypeScript/JSON MP4s (8 frames / 24 fps).
- **Open / next:** presets, generated references/skill, eight examples, Unequal Margins
  pixel/export acceptance, isolated skill trial and full milestone gates/PR.
- **Records:** [CE10 evidence](./composition-ce10-results.json),
  [plan](./composition-engine-plan.md#ce10--typescript-builder-api-and-cli).

### 2026-10-05 — Start CE10 typed authoring API

- **Agent / branch:** Codex on `codex/composition-ce10`, from CE4a `869a793` and PR #35.
- **Done:** promote the native JSON builder, typed layers/properties, timeline algebra,
  expression/instance helpers, bounded source metadata and Node asset registration.
  Native mask/effect/path keys and nested key call sites pass 27 focused tests.
  Fresh-process CLI loading handles helpers/assets and portable exports; 1,491 unit
  tests and 26 CLI regressions pass. Canonical filesystem aliases fix portable paths.
- **Results:** focused builder tests, TypeScript build, lint and package boundaries
  are recorded in [CE10 evidence](./composition-ce10-results.json).
- **Open / next:** remaining source metadata and timeline error locations, presets,
  watch preview, generated reference/examples and milestone acceptance.
- **Records:** [CE10](./composition-engine-plan.md#ce10--typescript-builder-api-and-cli).

### 2026-10-05 — Complete CE4a story and native passage integration

- **Agent / branch:** Codex on `codex/composition-ce4a-completion`, from CE12 `0987396`.
- **Done:** checkpoint commits deliver fractional story shutter clocks, optional
  composition passages, native picture maps, explicit narrative bindings and loader
  isolation. `876814f` repairs SVG/clip image rounding on WebGL `0.36.3`.
- **Results:** full `pnpm check` passes 1,464 unit, 46 runtime, 116 integration,
  14 depth tests and 176 frozen items / 36,061 frames. Both 69-case matrices /
  14,086 frames pass correctness; 14 WebGL cases have repeat MP4 identity. Mixed
  576-frame passages pass both backends. Continuous quality's 14 reports are unchanged.
- **Rejected:** broad integer image blending reduced bitmap precision; retain the
  narrower vector/clip rule. Prior failed/overlaid gate attempts remain in evidence.
- **PR:** [#35](https://github.com/xxibcill/still-shift/pull/35), stacked on CE12.
- **Open / next:** CE10 branch; 51 WebGL timing overruns remain
  CE6-P, broader CE7 stays open. Prior owner documentation changes are retained.
- **Records:** [CE4a completion](./composition-engine-plan.md#ce4a-completion-record-2026-10-05),
  [verification](./composition-ce4a-completion-results.json).

### 2026-10-05 — Complete CE12 motion linting

- **Agent / branch:** Codex on new `codex/composition-ce12` from `dee9e7b`.
- **Scope / done:** `a365f26` delivers rules, CLI lint, timeline and harnesses;
  `65b9451` strengthens timing observations; `a4586fe` fixes Lab port selection.
  Published in [PR #34](https://github.com/xxibcill/still-shift/pull/34); prior work retained.
- **Results:** full `pnpm check` passes (1,451 unit, 46 runtime, 116 integration;
  all browser groups and 176 baselines / 36,061 frames). Stillness is 79 vs zero;
  corpus has 153 state and 23 pixel-only reports with no unexpected failures.
- **Rejected / do not repeat:** snapshot workspace links must stay inside it;
  sleep interruptions and failed attempts are recorded. Timing limits remain unchanged.
- **Open / next:** owner review/merge; CE9 PR #32 is the parent. CE4a gates CE10;
  CE6-P and CE9-F1 remain deferred.
- **Records:** [Completion](./composition-engine-plan.md#ce12-completion-record-2026-10-05),
  [verification](./composition-ce12-verification-results.json),
  [corpus](./composition-ce12-lint-results.json), [stillness](./composition-ce12-stillness-results.json).

### 2026-10-04 — Fix the remaining PR #32 printer finding

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes`, from `e81a146`;
  primary checkout and its existing local work retained.
- **Done:** posted one inline P2 comment; canonical printing retains readable
  output when it fits and uses compact output otherwise, preserving parsed values.
- **Results:** four original regressions fail before the fix; all eight final
  boundary cases pass with the full fast checks (1,420 tests). Expression
  pixels/seeks/repeated and baked MP4s on both backends and evaluator browser
  parity pass; no baselines regenerated or performance experiments performed.
- **Delivery:** one finding per commit; one final push follows the completed fix.
  Owner review/merge remains pending; CE6-P and CE9-F1 remain deferred.
- **Records:** [printer fix evidence](./pr-32-printer-fix-results.json),
  [re-review evidence](./pr-32-rereview-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/32#discussion_r4174572779).

### 2026-10-04 — Fix PR #32 auto-orient bake parity

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes` after `e693334`.
- **Done:** preserve 64-frame boundary position history for retained path
  auto-orient; check output orientations recursively and refuse incompatible
  held-clock or indirect-history bakes. Switch semantics remain intact.
- **Results:** three regressions fail before the fix; all 13 bake tests and
  fast checks (1,412 tests) pass. The new 40-frame browser case is pixel/seek
  exact on both backends; repeated/baked MP4s and evaluator parity also pass.
- **Results (final):** all 176 frozen items / 36,061 frames pass in 270.67 s;
  no baselines regenerated. Formatting, lint, types and whitespace pass.
- **Delivery:** this is the third finding commit, following `c3fc70f` and
  `e693334`; all are delivered together by the authorized final push to PR #32.
  Main `5a6705c` is integrated. Full runtime/integration and hardware checks
  were not rerun; CE6-P and CE9-F1 remain deferred.
- **Records:** [fix evidence](./pr-32-fix-results.json), [review](./pr-32-review-results.json).

### 2026-10-04 — Fix PR #32 distance dimensions

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes` after `c3fc70f`.
- **Done:** two-point `length` rejects mixed vec2/vec3 dimensions with a type
  diagnostic before rendering. Matching vector dimensions remain supported.
- **Results:** both argument-order regressions fail before the fix; syntax and
  expression evaluator suites pass afterward (112 tests).
- **Open / next:** auto-orient bake parity remains; final checks and one push
  follow the third finding commit. No interim push.
- **Records:** [fix evidence](./pr-32-fix-results.json), [review](./pr-32-review-results.json).

### 2026-10-04 — Fix PR #32 lazy conditional

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes` after `f80a52a`.
- **Done:** `if` evaluates its condition and selected branch only; evaluator `23`
  invalidates cached exports built with the previous semantics.
- **Results:** regression fails before the fix; all 33 expression tests pass after.
  Both branch directions skip invalid reads; selected invalid reads still fail.
- **Open / next:** distance dimensions and auto-orient bake parity remain; final
  verification and push follow the third fix. No interim push.
- **Records:** [fix evidence](./pr-32-fix-results.json), [review](./pr-32-review-results.json).

### 2026-10-04 — Integrate main before PR #32 review fixes

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes`, from `75e46f2`.
- **Done:** merged main `5a6705c`; resolved only `docs/dev-log.md`, retaining
  CE9 and PR #31 records. Posted the three inline findings before editing code.
- **Results:** whitespace and changed-document formatting pass; no production
  source changes in this integration slice. Local review checks remain recorded.
- **Open / next:** fix each finding in its own commit and push once at the end.
  CE6-P and CE9-F1 remain deferred; Actions disabled.
- **Records:** [review evidence](./pr-32-review-results.json),
  [inline review](https://github.com/xxibcill/still-shift/pull/32#pullrequestreview-5402128438).

### 2026-10-04 — Resolve PR #32 merge conflicts

- **Agent / branch:** Codex in an isolated checkout of PR head `a0708ba`.
- **Done:** pushed merge `05033c8` with `main` at `3413780`; kept both browser suites,
  advanced evaluator to `22` and WebGL to `0.36.1`, and retained both branches'
  functional changes. Adapter documentation retains the approved CE6-P deferral.
- **Results:** `pnpm check:fast` (1,404 tests), toolchain, evaluator, expressions,
  WebGL, exposure, typography (software/hardware) and WebGL-export checks pass.
  Frozen CE0 checks pass: 176 items / 36,061 frames; no baseline regeneration.
- **Open / next:** GitHub confirms `MERGEABLE` / `CLEAN`; review/merge remains separate.
  Full runtime/integration and strict WebGL family matrices were not rerun.
  Local audit `205f413` remains separate; CE6-P stays deferred; Actions disabled.
- **Records:** [resolution evidence](./pr-32-conflict-resolution-results.json),
  [PR #32](https://github.com/xxibcill/still-shift/pull/32).

### 2026-10-04 — CE9 closeout and local commits

- **Agent / branch:** Codex on `codex/composition-ce9`, continuing the uncommitted
  implementation at `6034de3`.
- **Scope:** finish the three remaining browser groups, record verification and
  commit contract, evaluator/CLI, tests/fixtures and documentation separately.
- **Done:** `b0b619e` — contract/validation; `66412a0` —
  evaluator/bake/CLI; `38d3a66` — tests/fixtures. This documentation and
  evidence commit closes CE9; the three excluded untracked files are unchanged.
- **Results:** the three remaining browser commands pass on Node 22.23.1:
  commerce 127 cases / 28,200 frames / 30 export pairs; typography 20 cases /
  3,367 frames / 10 export pairs; frozen CE0 176 items / 36,061 frames. All 39
  changed/new files pass Prettier after two documentation fixes; `git diff --check`
  passes. The sandbox localhost failure was resolved by the authorized retry.
- **Open / next:** CE9 is complete. Owner approval is needed before pushing or
  opening a PR; CE9-F1 remains a reasoned follow-up. CE12 is ready next. Strict
  0.36 WebGL family audits remain separate CE6 work; CE6-P timing is deferred.
- **Records:** [CE9 completion record](./composition-engine-plan.md#ce9--expressions-and-motion-behaviours),
  [verification results](./composition-ce9-verification-results.json).

### 2026-10-03 — CE9 expressions and motion behaviours

- **Agent / branch:** Claude Code on `codex/composition-ce9` (from `6034de3`; the
  CE6-P deferral docs were already committed in `c7afacc`).
- **Scope:** CE9 checklist and acceptance; no performance tuning (CE6-P deferred).
- **Done (committed in closeout):** expression text → canonical AST (parser with columns,
  printer, 45 registered built-ins, type checker); property-level dependency graph merged with
  drivers, constraints, parents and auto-orient; lazy expression stage in
  `composition-evaluator-20`; eight behaviours; grouped speed tuples and
  `spatialSpeed`; path auto-orient; `comp bake`, `comp normalize`, normalized JSON
  export; reference, user guide and plan record. Acceptance demo:
  `benchmarks/fixtures/composition/ce9/overlap-demo.json` and its bake.
- **Results:** pinned toolchain, schema, boundaries, lint, build, 1,384 unit tests,
  46 runtime tests and all integration suites pass. Browser groups through story
  fixtures pass, including evaluator and expressions: Node/Chromium error
  ≤ 5.7e-14; baked pixels, random seeks and repeated/baked MP4 exports agree.
  The 200-layer evaluator measures 0.435 ms/frame (2 ms budget). The closeout entry
  records the passing commerce, typography, CE0 and changed-file formatting checks.
- **Rejected / do not repeat:** routing drivers/periodic motion through the
  expression evaluator at runtime (would change legacy float order; CE9-F1);
  chained follower springs reading each other (exponential cost; followers read
  the leader with cumulative delay instead); always copying the stage before
  constraints (0.42 → 0.71 ms/frame; now only when expressions or auto-orient read
  stages, 0.435 ms/frame).
- **Open / next:** local delivery is recorded in the closeout entry; owner review
  precedes pushing or a PR. CE9-F1 when CE11 needs lowered motion craft; CE12 next.
- **Records:** [CE9 completion record](./composition-engine-plan.md#ce9--expressions-and-motion-behaviours),
  [decision log](./composition-engine-plan.md#decision-log),
  [expression reference](./composition-reference.md#expressions-ce9).

### 2026-10-04 — Resolve PR #31 against main

- **Agent / branch:** Codex on `codex/pr31-conflict-resolution`, from PR head
  `6034de3`, in an isolated managed worktree.
- **Scope:** merge `main` at `3413780`; the sole conflict was the WebGL renderer
  version. Chose `0.36.1`, preserving both branches' fixes and optimizations.
- **Results:** `pnpm check:fast` (1,286 tests), WebGL, exposure, provider-typography
  and WebGL-export browser checks pass on Node 22.23.1. Formatting and whitespace
  checks pass; no unmerged paths or conflict markers remain.
- **Open / next:** publish the merge to PR #31. Full family matrices, hardware
  and frozen CE0 checks were not rerun; CE6-P remains deferred. Local audit
  commit `205f413` remains separate.
- **Records:** [conflict-resolution evidence](./pr-31-conflict-resolution-results.json),
  [PR #31](https://github.com/xxibcill/still-shift/pull/31).

### 2026-10-03 — Commit documentation and prepare CE6 PR

- **Agent / branch:** Codex on `codex/composition-ce6-performance` from `ecf9bc6`.
- **Scope:** owner-requested commit and PR delivery, retaining the three excluded
  untracked research/review files.
- **Done:** `c7afacc` commits the performance deferral, verification policy and
  development log; pushed the branch and created draft PR #31 against `main`.
- **Results:** pinned toolchain, schema, boundaries, lint, build and all 1,266 unit
  tests pass. Changed-document Prettier and `git diff --check` pass. Full TypeScript
  formatting fails only on excluded `docs/pr-30-review-plan.json`.
- **Open / next:** PR #31 awaits the 0.36 full family correctness evidence;
  deferred performance targets are not claimed passing.
- **Records:** [CE6-P](./composition-engine-plan.md#ce6-p--deferred-webgl-performance-acceptance),
  [performance evidence](./composition-ce6-performance-results.json),
  [PR #31](https://github.com/xxibcill/still-shift/pull/31),
  [merged CE4b PR #30](https://github.com/xxibcill/still-shift/pull/30).

### 2026-10-03 — Uncommitted work inventory

- **Agent / branch:** Codex on `codex/composition-ce6-performance` at `ecf9bc6`.
- **Scope:** answer the owner's working-tree status question.
- **Results:** three tracked documentation files modified, this log untracked,
  and three other untracked notes/review files retained; nothing staged.
- **Open / next:** documentation changes await commit; no commit requested.
- **Records:** [Composition plan](./composition-engine-plan.md),
  [verification policy](./verification.md); research-note exclusions above.

### 2026-10-03 — Owner defers WebGL performance to a future version

- **Agent / branch:** Codex on `codex/composition-ce6-performance` at `ecf9bc6`.
- **Scope:** stop performance acceptance blocking other feature work.
- **Done:** added deferred CE6-P to the tracker, superseded the immediate CE6
  timing requirement, and updated local verification policy. Retained both speed
  targets, strict assertions and historical evidence; all correctness gates stay
  required. CE6's remaining feature catalogue is still incomplete.
- **Results:** changed documents pass Prettier; `git diff --check` passes.
  Documentation-only scope change; no runtime tests rerun. No renderer, benchmark
  assertion, backend default or baseline change.
- **Open / next:** recommend CE9; record pending 0.36 correctness evidence without
  further tuning. Performance resumes only on an explicit owner request.
- **Records:** [Priority](./composition-engine-plan.md#current-version-priority-and-deferred-performance),
  [CE6-P](./composition-engine-plan.md#ce6-p--deferred-webgl-performance-acceptance),
  [verification policy](./verification.md#deferred-webgl-performance).

### 2026-10-03 — CE6 slice 2: bounded radial light and identity composites

- **Agent / branch:** Claude Code on `codex/composition-ce6-performance`.
- **Scope:** compatible effect-work reductions for the open 1.25× requirement.
- **Done:** `ecf9bc6` — radial light shades only its radius bounds and, on a
  freshly cleared opaque screen, reads the cleared bytes from one texel instead
  of snapshotting the screen (device tracks exact solid clears until any draw);
  normal/add identity composites draw only inside the source's conservative
  painted bounds and skip empty sources. Renderer 0.36 (~40 px/frame move by one
  byte toward the exact formula on SwiftShader).
- **Results:** bracketed A/B on the acceptance harness — background light
  1.70–1.81× → 1.21–1.26×, effects studio 1.60–1.73× → 1.21–1.26×, light sweep
  1.79–1.84× → 1.49–1.52×, focus blur 1.30–1.36× → 1.18–1.29×; matte and
  displacement unchanged within noise. Composite clipping is byte-identical on
  all 35 commerce atom fixtures (forward and reverse). New regressions (bounded
  radial light, 120 cases; bounded composites, four native fixtures) pass on
  SwiftShader and Apple M5 Pro Metal and catch deliberate mutations.
  `check:fast` steps, `composition-webgl` and `composition-webgl-blur
--hardware` pass. Full 0.36 matrices were still running at commit time.
- **Rejected / do not repeat:** banding the radial light into scissor strips
  (2–8% of its box, not worth extra passes); treating a single A/B ratio as
  proof when the machine runs other apps — legacy timings swung ±30%, so judge
  only bracketed pairs.
- **Open / next:** record 0.36 matrices in the plan (new dated CE6 section) and
  `docs/composition-ce6-performance-results.json`; the owner decision above.
- **Records:** [Composition plan, CE6](./composition-engine-plan.md#ce6--webgl2-backend-and-effect-registry).

### 2026-10-03 — CE6 research follow-up (diagnostics only)

- **Agent / branch:** Claude Code on `codex/composition-ce6-performance`.
- **Scope:** check the options proposed in the two untracked research notes.
- **Done:** `1edf196` — documented measurements; no renderer change.
- **Results:** timer queries and parallel compile are unavailable on pinned
  SwiftShader; `story-instances` spends 637 ms in `readPixels`, 190 ms in
  uploads and 137 ms in owned-byte copies against a 290 ms budget, so SVG/image
  raster reuse cannot close it.
- **Rejected / do not repeat:** explicit RGBA8 export framebuffer (no
  difference); `copyTexSubImage2D` backdrop copies (RGBA8 copies nothing from an
  `alpha:false` buffer, RGB8 is 2× slower than the blit); PBO + fence readback
  (~17× slower); fixed-function primitive blend (no gain, unsafe at fp16).
- **Records:** [CE6 research follow-up](./composition-engine-plan.md#ce6-performance-research-follow-up-2026-10-03).

### 2026-10-03 — CE6 slice 1: exact effect work

- **Agent / branch:** Claude Code on `codex/composition-ce6-performance` (from
  `da9fcf2`).
- **Done:** `351e498` — grain tile with fixed-function blending, mixed-radix
  specialized box blur, region-bounded particles, bounded light-sweep upload;
  renderer 0.35.
- **Results:** full 0.35 matrices — commerce 127 cases, story/components 48,
  typography 20; 0 pixel or seek failures; 53 MP4 pairs byte-identical; timing
  failures 73 / 40 / 3.
- **Rejected / do not repeat:** per-format framebuffer status caching,
  unspecialized blur regrouping, skipping clears on overwritten scratch
  surfaces, canvas upload variants; the earlier readback scratch-buffer reuse
  (rejected before this branch).
- **Records:** [CE6 slice 1](./composition-engine-plan.md#ce6-performance-slice-1-exact-effect-work-2026-10-03),
  [evidence](./composition-ce6-performance-results.json).

### 2026-10-02 – 2026-10-03 — CE4b verification and composition performance (backfilled)

- **Branches:** `codex/composition-ce4b` and earlier composition branches.
- **Done (summary from git history):** bounded and cached GPU preparation,
  damage-driven redraw and readback, constrained PNG mip sampling, typography
  reuse, CE4b correctness verification (`50b0ef5`), hardware primitive blur
  parity (`cf28529`), and transfer of the CE4b timing requirement to CE6
  (`c53272d`).
- **Records:** [CE4b completion record](./composition-engine-plan.md#ce4b-completion-record-2026-10-03),
  [feasibility record](./composition-ce4b-feasibility.md). Earlier history is
  in the milestone plans and `git log`.
