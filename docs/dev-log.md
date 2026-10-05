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

- **CE10 in progress (2026-10-05):** `codex/composition-ce10` from CE4a `869a793`.
  Typed authoring, native mask/effect/path keys and inherited key call sites
  and fresh TypeScript CLI/watch preview are delivered. All 128 integration tests
  pass; browser watch preserves valid frames/pixels and TypeScript/JSON MP4 identity.
  Presets, reference/examples and milestone acceptance remain open.
  [Evidence](./composition-ce10-results.json).

- **CE4a complete (2026-10-05):** `codex/composition-ce4a-completion`, implementation
  `876814f` from CE12 `0987396`. Adapted/native picture passages, story fractional
  shutter clocks and explicit narrative bindings are delivered. Full local checks,
  176 baselines / 36,061 frames, both 69-case family matrices / 14,086 frames and
  mixed 576-frame passages pass correctness. WebGL's 51 strict timing overruns stay
  deferred to CE6-P. CE10 is next after the milestone PR; broader CE7 stays open.
  [Evidence](./composition-ce4a-completion-results.json).

- **CE12 motion linting (`[x]`, 2026-10-05):** complete on
  `codex/composition-ce12`, implementation `a365f26` from delivered CE9 `dee9e7b`.
  Rules, CLI lint and Lab timeline are delivered. Full `pnpm check` and all 176
  frozen baselines / 36,061 frames pass in a clean tracked snapshot. Stillness
  acceptance is 79 frozen comparisons in v013 versus zero in the fresh continuous
  prototype. Corpus lint covers 153 state reports and 23 pixel-only items with
  explicit limits and no unexpected failures; existing craft errors remain visible.
  Prior local work retained; CE6-P and CE9-F1 remain deferred. CE10 still needs CE4a.
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
