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

- **PR #36 base integration in flight (2026-10-06):** isolated managed worktree
  from `6e0d108`; initial CE4a base `91f9c54` is integrated and verified. Both
  log histories and generated reference guidance are retained; provider lint
  fixtures explicitly declare adapter provenance while authored fonts stay strict.
  Fast checks (1,598 unit), 46 runtime, 14 depth, affected integration/browser
  checks and all 176 baselines / 36,061 frames pass, with initial failures retained.
  Final fetch found updated base `ddaf9d2`; integrating its expression/soundtrack
  changes and rerunning affected checks precedes the final push. No owner checkout
  or other PR branch changes. [Evidence](./pr-36-conflict-resolution-results.json).

- **PR #35 current-head fixes verified (2026-10-06):** three inline findings on
  `282b112` are fixed one per commit: native event-anchored sounds require mapped
  markers (`023d33a`), `--prepare-only` validates native beat maps (`d1673b1`), and
  each render writes its current native composition (`e796802`). Fast checks pass
  with 1,538 unit tests; 46 runtime, passage integration, both 576-frame native
  passage backends and Lab authoring checks pass. Full `pnpm check` and baseline
  matrices were not rerun; renderer output is unchanged. One final push delivers the
  fixes; owner review/merge remains pending.
  [Evidence](./pr-35-current-head-fix-results.json).

- **PR #35 follow-up fixes verified (2026-10-05):** all three inline findings on
  `84d7924` are fixed separately: Lab diagnostics (`ea62b7b`), native handoff
  mappings/boundaries (`bff1305`) and first/reinstalled native inspection
  (`cde2c2c`). CE12 base `8c717b3` is integrated and both logs retained. Fast checks
  pass with 1,536 unit tests; 46 runtime, 130 integration, 14 Python and smoke tests
  pass. Both 576-frame passage backends, authoring and native lint browser checks
  pass; all 176 frozen fixtures / 36,061 frames match without regeneration.
  Delivery uses one final push; owner review/merge remains pending. Full browser
  aggregate and deferred CE6-P timing matrices were not rerun. Unrelated CE5 work
  remains in the original checkout. [Evidence](./pr-35-followup-fix-results.json).

- **PR #35 review fixes (2026-10-05):** isolated
  `codex/pr35-review-fixes` from `869a793`. Three findings are posted inline.
  `6ce9993` retains native diagnostics and field/beat/source context; `c9c0971`
  preserves evidence qualifications through states and corrections. WebGL previews
  use two contexts per passage, four during replacement, and release them on
  disposal or preparation failure. Fast, runtime, integration, Python, smoke and
  affected passage checks pass, with one unchanged depth-protocol rerun recorded.
  All 176 frozen baseline items / 36,061 frames match. Delivery uses one commit per
  finding and one push after the final commit; owner review and merge remain pending.
  [Evidence](./pr-35-fix-results.json).

- **PR #36 re-review fixes complete (2026-10-05):** isolated
  `codex/pr36-rereview-fixes` from `f68f135`; three findings posted inline.
  Delayed explicit `from` segments preserve preceding static state; merged outgoing
  key fields retain their authoring calls through nested reuse; asset-schema failures
  retain dependencies and recover through watch. Fast checks pass (1,524 unit),
  46 runtime and 31 affected integration tests pass, with exact 192-frame Canvas/WebGL
  parity, backward seeks and byte-identical exports. Three finding commits, one final
  push; review/merge remain owner decisions. No implementation blocker.
  [Evidence](./pr-36-rereview-fix-results.json).

- **PR #36 review fixes complete (2026-10-05):** `codex/composition-ce10`
  from `afb4045`; all six findings posted inline and repaired in six separate
  finding commits, delivered at `f68f135`. Fast checks pass: 1,515 unit;
  46 runtime, 146 integration and 14 depth tests also pass. Affected watch,
  Canvas/WebGL builder parity, export and typography browser checks pass.
  The native Node error-class failure was repaired in the first finding commit;
  full unrelated browser/baseline suites were not rerun. Owner review/merge
  remains; no implementation blocker. [Evidence](./pr-36-fix-results.json).

- **CE10 complete (2026-10-05):** `codex/composition-ce10` from CE4a `869a793`;
  runtime `e501fed`. Typed authoring, CLI/watch, presets, eight examples and generated
  guidance pass the full local check: 1,499 unit, 46 runtime, 134 integration and
  14 depth tests, all browser suites and 176 frozen baselines / 36,061 frames.
  The 197-line builder has exact 192-frame Canvas/WebGL parity and identical exports;
  a fresh skill-only source validates without repairs and renders correctly. Initial
  trial/gate failures are retained. [PR #36](https://github.com/xxibcill/still-shift/pull/36)
  is open and attached; owner review/merge remain. CE11 is next on a new branch.
  [Evidence](./composition-ce10-results.json).

- **CE4a complete (2026-10-05):** `codex/composition-ce4a-completion`, implementation
  `876814f` from CE12 `0987396`. Adapted/native picture passages, story fractional
  shutter clocks and explicit narrative bindings are delivered. Full local checks,
  176 baselines / 36,061 frames, both 69-case family matrices / 14,086 frames and
  mixed 576-frame passages pass correctness. WebGL's 51 strict timing overruns stay
  deferred to CE6-P. CE10 is complete; broader CE7 stays open.
  [Evidence](./composition-ce4a-completion-results.json).

- **PR #34 follow-up fixes verified (2026-10-05):** all three inline findings on
  `a41f687` are repaired one per commit: provider reveal (`99605b4`), collapsed
  precomp paint (`498c771`) and structured lint capacity failures. Fast checks pass
  with 1,509 unit tests; 46 runtime, 15 CLI and native browser checks pass. Corpus
  lint covers 176 items / 36,061 frames with zero unexpected failures; two additional
  reading-time errors are now detected in one existing fixture, with all other
  diagnostics and reference hashes unchanged. One final push delivers the repairs;
  owner review/merge remains pending. Full render/export checks were not rerun.
  [Follow-up evidence](./pr-34-followup-fix-results.json).

- **PR #34 re-review fixes verified (2026-10-05):** all five inline findings on
  `82453d9` are repaired in separate commits: browser diagnostics, effect timing,
  matte dependencies, isolated scale/opacity pulses and clipped coverage. Fast
  checks pass with 1,496 unit tests; 46 runtime tests, 12 CLI tests and the expanded
  native browser suite pass. Corpus lint covers all 176 items / 36,061 frames
  with zero unexpected failures and unchanged reports/reference checksum.
  Delivery uses one final push to `codex/composition-ce12`; owner review/merge
  remains pending. Full render/export checks were not rerun; renderer output,
  versions and frozen baselines are unchanged. Original local work retained.
  [Re-review fix evidence](./pr-34-rereview-fix-results.json).

- **PR #34 review fixes verified (2026-10-05):** all three inline findings posted
  on `0987396` and fixed in separate commits: structured policy diagnostics
  (`b91eb24`), inactive-effect motion (`9eba6a2`), and parent-driven timing with
  instance identity and fractional joins. Fast checks pass with 1,468 unit tests;
  all 11 CLI tests and the expanded CE12 browser suite pass. Corpus lint covers
  all 176 items / 36,061 frames, with zero unexpected failures and identical
  reports/reference checksums. Delivery uses one final push; owner review/merge
  remains pending. No renderer/version or baseline changes; original local work
  retained. [Fix evidence](./pr-34-fix-results.json).

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

_Last updated 2026-10-05 by Codex for PR #35 follow-up fixes; prior work retained._

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

### 2026-10-06 — Verify PR #36 initial CE4a base merge

- **Agent / branch:** Codex in isolated `pr36-ce10-conflicts`, CE10 head `6e0d108`.
- **Done:** merge CE4a `91f9c54`; retain both log histories, maintain base guidance
  in CE10's generator source, and mark the provider lint fixture as adapter output.
  A new CLI test retains rejection of authored unpinned providers.
- **Results:** fast checks (1,598 unit), 46 runtime and 14 depth pass. Initial
  integration passes 161 cases; all 29 affected final cases pass after repair and
  unchanged watch timeout reruns. Builder and native passages retain both backend
  parity, backward seeks and identical exports; all 176 baselines / 36,061 frames pass.
- **Limits:** normal watch-browser startup hits occupied 5173; an identical temporary
  copy with an explicit available port passes. Full `pnpm check` was not rerun.
- **Next:** final fetch found base `ddaf9d2`; integrate it and rerun affected checks
  before pushing. Owner review/merge remain pending; Actions remain disabled.
- **Records:** [resolution evidence](./pr-36-conflict-resolution-results.json).

### 2026-10-06 — Fix PR #35 current-head review findings

- **Agent / branch:** Claude Code on `codex/pr35-audio-binding-fixes` from `282b112`.
- **Scope / done:** three findings posted inline and fixed one per commit. Native
  beats bind event-anchored sounds to native markers instead of inheriting template
  event timing; `story:passage` validates `--composition-beats` before any output,
  including `--prepare-only`; every render writes the native composition it used to
  `scenes/<beat>.composition.json`, including on cache reuse.
- **Results:** `pnpm check:fast` (1,538 unit), 46 runtime, passage integration/CLI,
  both 576-frame native passage backends and Lab authoring checks pass on Node
  22.23.1. Each new regression failed before its fix.
- **Rejected:** Node 24.16 runs fail one unrelated `comp bake` test on the
  unmodified head; verification uses the pinned toolchain.
- **Open / next:** owner review and merge; full gate and baseline matrices not rerun.
- **Records:** [fix evidence](./pr-35-current-head-fix-results.json),
  [review](https://github.com/xxibcill/still-shift/pull/35#pullrequestreview-5418458083).

### 2026-10-05 — Integrate CE12 base and verify PR #35 follow-up fixes

- **Agent / branch:** Codex on `codex/pr35-followup-fixes` after `cde2c2c`.
- **Scope / done:** merge CE12 `8c717b3` and retain the PR #34 and PR #35 records
  when resolving the development-log conflict; no source conflicts occurred.
- **Results:** fast checks (1,536 unit), 46 runtime, 130 integration, 14 Python and
  smoke tests pass. Both 576-frame passage backends, authoring and native lint
  browser checks pass; 176 frozen fixtures / 36,061 frames match. Normal Vite CLI
  native loading passes. Full browser aggregate/timing matrices were not rerun.
- **Delivery:** all three finding commits remain separate, followed by this base
  merge and one final push; owner review/merge remains pending.
- **Records:** [fix evidence](./pr-35-followup-fix-results.json).

### 2026-10-05 — Initialize PR #35 native inspection after preview installation

- **Agent / branch:** Codex on `codex/pr35-followup-fixes` after `bff1305`.
- **Scope:** third follow-up finding, one separate implementation commit.
- **Done:** initialize native layer options/state for first and single beats and
  retain a valid selection through edit, undo and redo preview replacement.
- **Results:** all 17 passage Lab integration cases, TypeScript and targeted ESLint
  pass, including both renderers. Final gates/base integration remain before push.
- **Rejected:** both new cases first reproduced surrogate layer options; browser
  interaction was corrected to open the collapsed inspector before selecting.
- **Open / next:** integrate the CE12 base log, run final checks and push all fixes.
- **Records:** [fix evidence](./pr-35-followup-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/35#discussion_r4183968018).

### 2026-10-05 — Validate PR #35 native handoff subjects and boundary visibility

- **Agent / branch:** Codex on `codex/pr35-followup-fixes` after `ea62b7b`.
- **Scope:** second follow-up finding, one separate implementation commit.
- **Done:** require incoming targets/outgoing sources beyond focus/evidence; check
  native enter/exit visibility through root/precomp paths and instance clocks.
  Retain the passage boundary before transition tails and Node strip-only loading.
- **Results:** 123 focused unit/integration tests, 576-frame Canvas mixed passage,
  Node import compatibility, TypeScript and targeted ESLint pass.
- **Rejected:** all five new tests failed against the prior missing-subject or
  unknown-mapping behavior before implementation.
- **Open / next:** repair initial/reinstalled native inspection, then final gates/push.
- **Records:** [fix evidence](./pr-35-followup-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/35#discussion_r4183968013).

### 2026-10-05 — Preserve PR #35 Lab native diagnostics end to end

- **Agent / branch:** Codex on `codex/pr35-followup-fixes` from `84d7924`.
- **Scope:** first follow-up finding, posted inline before implementation.
- **Done:** retain the structured PassageError contract across Vite module identities
  and HTTP responses; display codes and both source/field locations in Lab.
- **Results:** 19 focused unit/integration tests, TypeScript and targeted ESLint pass.
  The new test verifies the actual bundled API and both invalid fields in Chromium.
- **Rejected:** the initial foreign-constructor test reproduced generic diagnostic
  fallback; approval-service capacity failures executed no setup changes.
- **Open / next:** native handoff targets and initial inspection; one final push.
- **Records:** [fix evidence](./pr-35-followup-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/35#discussion_r4183968004).

### 2026-10-05 — Fix PR #35 WebGL passage context budget

- **Agent / branch:** Codex on `codex/pr35-review-fixes`, after `c9c0971`.
- **Done:** two GPU preview slots serve independent beat picture canvases. Native
  validation remains eager; disposal and failed preparation release GL contexts.
- **Results:** 20 beats and eight overlapping edits preserve pixels and backward
  seeks, peak at four live contexts and end at zero. Fast checks pass 1,470 unit
  tests; 46 runtime, 117 integration, 14 Python, smoke, both mixed 576-frame passage
  backends and authoring checks pass. All 176 frozen items / 36,061 frames match.
- **Initial failures:** fresh-environment depth-protocol timeouts passed on one
  unchanged targeted rerun; helper TypeScript inference was repaired. See evidence.
- **Delivery:** one finding per commit; push all three together after this final
  finding commit. Owner review and merge remain pending.
- **Records:** [fix evidence](./pr-35-fix-results.json).

### 2026-10-05 — Fix PR #35 native evidence text alternatives

- **Agent / branch:** Codex on `codex/pr35-review-fixes`, after `6ce9993`.
- **Done:** mapped evidence states and whole-layer corrections retain the passage
  qualification; span corrections fail explicitly on mapped evidence layers.
- **Results:** six regressions cover matching alternatives, root/precomp states,
  delayed state changes and text replacements. All 18 focused checks, build,
  targeted lint and formatting pass. Initial nested test-fixture repair is recorded.
- **Open / next:** bound WebGL passage contexts, finish local verification and
  push all three finding commits together. Owner merge remains pending.
- **Records:** [fix evidence](./pr-35-fix-results.json).

### 2026-10-05 — Fix PR #35 native composition diagnostics

- **Agent / branch:** Codex on isolated `codex/pr35-review-fixes`, from `869a793`.
- **Done:** posted all three inline findings; loader retains every schema diagnostic
  and adds beat/source context. Lab displays the source filename and field path.
- **Results:** two invalid fields retain both original diagnostics; 12 focused
  unit/integration checks, build, targeted lint and formatting pass.
- **Open / next:** evidence text-state validation and bounded WebGL previews;
  commit each finding separately, then push all three together. Owner merge remains.
- **Records:** [fix evidence](./pr-35-fix-results.json).

### 2026-10-05 — PR #36 re-review fix 3: recover watched invalid assets

- **Agent / branch:** Codex on `codex/pr36-rereview-fixes`; prior fixes `9314879`, `63b6add`.
- **Done:** Asset-schema failures retain the image/font path; initially invalid SVGs
  rebuild automatically after repair. One finding per commit, one final push.
- **Results:** Three tests fail before repair; 29 focused tests and build pass.
  Fast checks pass (1,524 unit), 46 runtime and 31 affected integration tests pass.
  Browser watch retains pixels/frame state; all 192 Canvas/WebGL frames match the
  reference exactly, including backward seeks, with byte-identical exports.
- **Limits:** Watch harness uses an available port because 5173 is occupied. Full
  unrelated integration/browser, depth and frozen-baseline suites were not rerun.
- **Open / next:** Three findings fixed and verified; owner review/merge remain.
  GitHub Actions remain disabled; original checkout and local work retained.
- **Records:** [Evidence](./pr-36-rereview-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/36#discussion_r4183933402).

### 2026-10-05 — PR #36 re-review fix 2: attribute joined outgoing key fields

- **Agent / branch:** Codex on `codex/pr36-rereview-fixes`; prior fix `9314879`.
- **Done:** Add optional field attribution to compact source tracks for merged `out`
  and `spatialOut`; preserve incoming/key-value ownership and nested inheritance.
- **Results:** Four regressions fail before repair; 46 focused tests and build pass.
  Existing six-field metadata and bounded root-layer coverage remain valid.
- **Open / next:** Repair asset-schema watch recovery, then verify and push once.
  GitHub Actions remain disabled; review and merge remain owner decisions.
- **Records:** [Evidence](./pr-36-rereview-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/36#discussion_r4183933400).

### 2026-10-05 — PR #36 re-review fix 1: retain static state before delayed from

- **Agent / branch:** Codex on `codex/pr36-rereview-fixes`, from `f68f135`.
- **Done:** Preserve the static value until the first delayed segment changes to its
  explicit `from` value. Scalar/vector, `by`, fade-in and backward sampling covered.
- **Results:** Three regressions fail before repair; 41 focused tests and build pass.
- **Rejected:** Unconditional frame-zero keys changed equivalent emitted tracks;
  retain a hold only when the authored static value differs from the segment start.
- **Open / next:** Fix joined-key field attribution and invalid-asset watch recovery
  in separate commits, then run final checks and push once. Actions remain disabled.
- **Records:** [Evidence](./pr-36-rereview-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/36#discussion_r4183933394).

### 2026-10-05 — PR #36 fix 6: trace CommonJS program dependencies

- **Agent / branch:** Codex on `codex/composition-ce10`, from `afb4045`.
- **Done:** Synchronous hooks trace CommonJS helpers, transitive JSON and missing
  absolute/relative imports. Focused regressions fail before repair and pass afterward.
- **Results:** Fast checks pass (1,515 unit); 46 runtime, 146 integration and 14 depth
  tests pass. Watch preserves valid pixels and frame state; the 192-frame builder
  matches Canvas/WebGL exactly and exports are byte-identical. Typography passes.
- **Rejected / repaired:** Native Node rejects constructor parameter properties;
  repaired the first finding commit and added a native-load regression. The temporary
  watch harness requires `.mts` outside the module package and a free port because
  another local session uses 5173. Full unrelated browser/baseline suites were not rerun.
- **Open / next:** Six findings fixed in six commits, followed by one final push.
  Owner review/merge remains pending; GitHub Actions remain disabled.
- **Records:** [Fix evidence](./pr-36-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/36#discussion_r4183180673).

### 2026-10-05 — PR #36 fix 5: watch missing TypeScript import candidates

- **Agent / branch:** Codex on `codex/composition-ce10`, from `afb4045`.
- **Done:** Watch missing typescript import candidates; focused regressions fail before repair and pass afterward.
- **Open / next:** 5/6 findings fixed; remaining repairs and final checks precede one final push. Owner review/merge remains pending.
- **Records:** [Fix evidence](./pr-36-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/36#discussion_r4183180672).

### 2026-10-05 — PR #36 fix 4: resolve symbolic precomp anchors

- **Agent / branch:** Codex on `codex/composition-ce10`, from `afb4045`.
- **Done:** Resolve symbolic precomp anchors; focused regressions fail before repair and pass afterward.
- **Open / next:** 4/6 findings fixed; remaining repairs and final checks precede one final push. Owner review/merge remains pending.
- **Records:** [Fix evidence](./pr-36-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/36#discussion_r4183180668).

### 2026-10-05 — PR #36 fix 3: reject repeated auto-ID layer objects

- **Agent / branch:** Codex on `codex/composition-ce10`, from `afb4045`.
- **Done:** Reject repeated auto-id layer objects; focused regressions fail before repair and pass afterward.
- **Open / next:** 3/6 findings fixed; remaining repairs and final checks precede one final push. Owner review/merge remains pending.
- **Records:** [Fix evidence](./pr-36-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/36#discussion_r4183180666).

### 2026-10-05 — PR #36 fix 2: preserve joined animation handles

- **Agent / branch:** Codex on `codex/composition-ce10`, from `afb4045`.
- **Done:** Preserve joined animation handles; focused regressions fail before repair and pass afterward.
- **Open / next:** 2/6 findings fixed; remaining repairs and final checks precede one final push. Owner review/merge remains pending.
- **Records:** [Fix evidence](./pr-36-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/36#discussion_r4183180658).

### 2026-10-05 — PR #36 fix 1: attribute text preset failures to the correct source

- **Agent / branch:** Codex on `codex/composition-ce10`, from `afb4045`.
- **Done:** Attribute text preset failures to the correct source; focused regressions fail before repair and pass afterward.
- **Open / next:** 1/6 findings fixed; remaining repairs and final checks precede one final push. Owner review/merge remains pending.
- **Records:** [Fix evidence](./pr-36-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/36#discussion_r4183180652).

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

### 2026-10-05 — PR #34 structured lint limits and final verification

- **Agent / branch:** Codex on `codex/pr34-followup-fixes`, after `498c771`.
- **Done:** third finding repaired with stable `comp-lint-limit` / `layers` errors
  and early rejection of oversized root timelines, including rendered lint.
- **Results:** original capacity regression failed; all 99 focused quality/CLI
  tests, fast checks (1,509 unit), 46 runtime tests and native browser checks pass.
  CE0 lint covers 176 items / 36,061 frames; zero unexpected failures, two newly
  caught reading-time errors, other diagnostics and reference checksum unchanged.
- **Open / next:** one final push after this third commit; owner review/merge.
  Original checkout retained; no renderer/version or baseline changes.
- **Records:** [Follow-up evidence](./pr-34-followup-fix-results.json).

### 2026-10-05 — PR #34 collapsed precomp sampling

- **Agent / branch:** Codex on `codex/pr34-followup-fixes`, after `99605b4`.
- **Done:** traverse collapsed paint outside source bounds; framing follows painted
  descendants, and unused collapsed backgrounds do not count as motion.
- **Results:** two regressions failed before repair; all 96 focused quality/CLI
  tests, rendered browser checks, TypeScript and ESLint pass. Invalid test interval
  corrected; hidden, clipped, nested and empty content controls pass.
- **Open / next:** structured lint limits, final verification and one final push.
- **Records:** [Follow-up evidence](./pr-34-followup-fix-results.json).

### 2026-10-05 — PR #34 provider reading reveal

- **Agent / branch:** Codex on `codex/pr34-followup-fixes`, from `a41f687`.
- **Done:** posted all three inline findings; reading time now uses provider reveal.
- **Results:** three regression failures before the fix; all 87 focused quality/CLI
  tests, rendered browser checks, TypeScript and ESLint pass.
- **Open / next:** collapsed precomp traversal, structured lint limits and final
  verification; one final push after all three finding commits.
- **Records:** [Follow-up evidence](./pr-34-followup-fix-results.json).

### 2026-10-05 — PR #34 clipped viewport coverage

- **Agent / branch:** Codex on `codex/pr34-review-fixes`, reviewing `82453d9`.
- **Scope / done:** posted the inline finding and repaired clipped viewport coverage.
- **Results:** regression evidence and local checks are recorded below; no renderer
  output/version or frozen-baseline changes.
- **Open / next:** all five repairs and final local verification complete;
  delivery uses one final push, followed by owner review/merge.
- **Records:** [Re-review fix evidence](./pr-34-rereview-fix-results.json).

### 2026-10-05 — PR #34 one-frame scale and opacity pulses

- **Agent / branch:** Codex on `codex/pr34-review-fixes`, reviewing `82453d9`.
- **Scope / done:** posted the inline finding and repaired one-frame scale and opacity pulses.
- **Results:** regression evidence and local checks are recorded below; no renderer
  output/version or frozen-baseline changes.
- **Open / next:** 1 finding repairs, final verification and one final push;
  owner review/merge remains pending.
- **Records:** [Re-review fix evidence](./pr-34-rereview-fix-results.json).

### 2026-10-05 — PR #34 contributing matte motion

- **Agent / branch:** Codex on `codex/pr34-review-fixes`, reviewing `82453d9`.
- **Scope / done:** posted the inline finding and repaired contributing matte motion.
- **Results:** regression evidence and local checks are recorded below; no renderer
  output/version or frozen-baseline changes.
- **Open / next:** 2 finding repairs, final verification and one final push;
  owner review/merge remains pending.
- **Records:** [Re-review fix evidence](./pr-34-rereview-fix-results.json).

### 2026-10-05 — PR #34 active effect tracks

- **Agent / branch:** Codex on `codex/pr34-review-fixes`, reviewing `82453d9`.
- **Scope / done:** posted the inline finding and repaired active effect tracks.
- **Results:** regression evidence and local checks are recorded below; no renderer
  output/version or frozen-baseline changes.
- **Open / next:** 3 finding repairs, final verification and one final push;
  owner review/merge remains pending.
- **Records:** [Re-review fix evidence](./pr-34-rereview-fix-results.json).

### 2026-10-05 — PR #34 pixel-mode diagnostics

- **Agent / branch:** Codex on `codex/pr34-review-fixes`, reviewing `82453d9`.
- **Scope / done:** posted the inline finding and repaired pixel-mode diagnostics.
- **Results:** regression evidence and local checks are recorded below; no renderer
  output/version or frozen-baseline changes.
- **Open / next:** 4 finding repairs, final verification and one final push;
  owner review/merge remains pending.
- **Records:** [Re-review fix evidence](./pr-34-rereview-fix-results.json).

### 2026-10-05 — PR #34 parent-driven timing and final verification

- **Agent / branch:** Codex on `codex/pr34-review-fixes`, from reviewed `0987396`.
- **Done:** final finding fixed by collecting contributing ancestors, preserving
  instance identity, counting shared tracks once and inspecting fractional
  forward/reverse joins. Null opacity stays excluded; group opacity contributes.
- **Results:** six regressions failed before the fix; all 43 quality tests,
  11 CLI tests, fast checks (1,468 unit tests) and expanded CE12 browser checks pass.
  Corpus lint covers 176 items / 36,061 frames with identical reports and no
  unexpected failure. Source checksums are recorded; renderer/baselines unchanged.
- **Open / next:** one final push delivers all three finding commits; owner review
  and merge remain pending. A sandbox Vite-temp write failure passed on retry.
- **Records:** [Fix evidence](./pr-34-fix-results.json),
  [CE12 plan](./composition-engine-plan.md#ce12--motion-linting).

### 2026-10-05 — PR #34 inactive-effect motion evidence

- **Agent / branch:** Codex on `codex/pr34-review-fixes`.
- **Done:** second finding fixed by excluding inactive effects from state signatures
  and velocity inputs, preserving evaluation and rendered output.
- **Results:** all four new regressions failed before the fix; 44 focused tests,
  build, changed-file ESLint and the CE12 browser group now pass, including rendered
  static content with disabled animated effects.
- **Open / next:** parent-driven timing is the final finding; verify then push once.
- **Records:** [Fix evidence](./pr-34-fix-results.json),
  [CE12 plan](./composition-engine-plan.md#ce12--motion-linting).

### 2026-10-05 — PR #34 structured policy diagnostics

- **Agent / branch:** Codex on `codex/pr34-review-fixes`, from PR head `0987396`.
- **Done:** first finding fixed with stable cut, shot and pixel-evidence codes/paths;
  posted all three inline comments on the reviewed PR diff.
- **Results:** nine regressions reproduced the failures; 40 focused tests, build
  and changed-file ESLint pass on Node 22.23.1 / pnpm 10.29.3.
- **Open / next:** fix inactive-effect motion and parent-driven timing, one finding
  per commit, then verify and push once. Original local work retained.
- **Records:** [Fix evidence](./pr-34-fix-results.json),
  [CE12 plan](./composition-engine-plan.md#ce12--motion-linting).

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
