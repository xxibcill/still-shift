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

- **PR #34 fixes in progress (2026-10-06):** three P2 findings on `f870fce`
  are posted inline. Separated vector timing is repaired with 108 focused tests
  passing; shared velocity-budget accounting and evaluated stagger starts remain
  pending. Work runs in an isolated managed worktree; one commit per finding
  and one final push are requested. No owner decision is pending.
  [Evidence](./pr-34-20261006-fix-results.json).

- **PR #34 conflict resolution (2026-10-05):** integrates `main` at `3581855`
  into CE12 head `afa9be0`. Retains motion linting, soundtrack exports/commands,
  newer expression/bake repairs and both development histories. Five conflicts
  resolved; fast checks (1,651 unit), 46 runtime and 169 integration tests pass,
  plus the repaired fallback on a targeted rerun (1 test). All 14 depth tests
  and affected browser quality/expression checks pass. Owner review/merge
  remains pending; full `pnpm check` was not rerun. [Evidence](./pr-34-conflict-resolution-results.json).

- **PR #34 additional fixes verified (2026-10-05):** all five findings on
  `7525540` are posted inline and repaired one per commit: group paint modifiers
  (`5d3f0d3`), signed scale (`88927ad`), property easing weights (`f7d90a2`),
  evaluated track motion (`d6af44e`) and unavailable nested coverage. Fast checks
  (1,544 unit), 46 runtime, 16 CLI and browser quality checks pass. Corpus lint
  covers 176 items / 36,061 frames with zero unexpected failures; group paint
  corrects frozen-state findings in two fixtures, with frozen pixels and baseline
  hashes unchanged. Delivered at `afa9be0`; the base-branch conflicts are resolved above.
  Owner review/merge remains pending. Full render/export
  checks were not rerun. [Evidence](./pr-34-additional-fix-results.json).

- **PR #34 review fixes verified (2026-10-05):** all four inline findings on
  `8c717b3` are repaired one per commit: held-sample velocity artifacts
  (`059f04a`), shared fractional join searches (`c81eafc`), advisory Lab lint
  failures (`04ac50a`) and clipped framing bounds. Corpus velocity findings fall
  from 1,031 held-sample artifacts to 0; all other corpus results are unchanged.
  Fast checks (1,518 unit), 46 runtime, 15 CLI and the browser quality suite pass
  on Node 22.23.1. The earlier development-log conflict is resolved by the current
  main integration recorded above. Owner review/merge
  pending. [Review evidence](./pr-34-review-fix-results.json).

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
  Prior local work retained; CE6-P and CE9-F1 remain deferred. CE10 still needs CE4a.
  [Completion record](./composition-engine-plan.md#ce12-completion-record-2026-10-05).
  [PR #34](https://github.com/xxibcill/still-shift/pull/34) now targets `main`;
  dependency PR #32 merged at `b32dcfa` and is integrated here. Owner review and merge remain pending.

- **PR #33 soundtrack improvement rounds (2026-10-05):** Claude Code on
  `claude/ce16-sfx-improvements`, merged into `main` via PR #33 at `3581855`. `pnpm check:soundtrack` and
  the owner-authorized one-time `pnpm test:browser:soundtrack` run pass on Node
  22.23.1. Owner listening remains pending.
- **Owner listening pending:** the owner will listen using
  [the listening checklist](./soundtrack-listening-checklist.md). Variants A–D
  are pre-rendered in ignored `benchmarks/results/listening/`. Record pass/fail
  here.
- **Owner decision — GPL runtime (2026-10-05):** DawDreamer stays local and
  opt-in; nothing bundled. **Remind the owner before any contribution,
  publishing or distribution**, then choose GPLv3 compliance or replacing
  DawDreamer (filters only now). See the soundtrack guide's licensing section.

- **PR #33 bounded-memory render (2026-10-05):** Claude Code on
  `claude/ce16-sfx-improvements` from `7f1f4dd`. `0fc092f` makes 10-minute
  projects fit the 1.5 GB estimate (two nested bus levels with filters and
  ducking); outputs byte-identical. `pnpm check:soundtrack` passes on Node
  22.23.1. Pushed to PR #33; owner review/merge remains. Resolves the former
  duration-bound owner decision.
- **PR #33 decode performance (2026-10-05):** shared streamed decode passes and
  parallel probes/decodes/hashing (`77a759e`) are pushed (`7f1f4dd`).
- **PR #33 fade curves (2026-10-05):** optional per-fade `equal-power` curves
  as `soundtrack-dsp-5` (`e1d6c49`) and Lab curve selects (`d73d624`) are
  pushed to PR #33 (`e20b6a6`). Absent/linear curves are bit-identical.

- **PR #33 cue/asset/fade edits (2026-10-05):** `add-clip`, `remove-clip`,
  `fade`, `add-asset` and `remove-asset` (`d6fa38b`) plus Lab fade fields and
  Remove clip (`e4194a6`) are pushed to PR #33 (`c41c58b`). No PCM change.

- **PR #33 clip pan (2026-10-05):** Claude Code on `claude/ce16-sfx-improvements`.
  Headroom report and Lab field guard are pushed to PR #33 (`2cddbb2`). Optional
  `clips[].pan` uses a unity-centre constant-power law after the ducking detector
  tap (`soundtrack-dsp-4`); projects without pan are bit-identical. Lab clip form
  edits pan. `pnpm check:soundtrack` passes on Node 22.23.1. Pushed to PR #33
  (`633412f`); owner review/merge remains. Browser suites and listening not run.
  Looping and a master limiter remain out of contract scope.

- **PR #33 follow-up fixes (2026-10-05):** both P2 findings posted inline
  and fixed on isolated `codex/pr33-followup-fixes` from `0dc2782`. `579553a`
  gates ducking hold on detected activity (`soundtrack-dsp-3`); the second finding
  slice rejects case-colliding/reserved stem IDs in active and history states.
  All 63 focused tests and `pnpm check:soundtrack` pass: 1,513 unit, 46 runtime,
  37 command-only audio integration and 14 depth tests, plus static/Python gates.
  Delivery uses two finding commits and one final push; owner review/merge remains.
  Browser workflow/baseline suites and listening were not rerun. The separate
  toolchain check launched headless Chromium only to verify its version.
  Original checkout retained; reused depth environment binding restored.
  [Evidence](./pr-33-followup-fix-results.json).

- **PR #33 conflict resolution (2026-10-05):** isolated checkout from `039c1d5`
  integrates `main` at `b32dcfa`. Only `docs/dev-log.md` conflicted; both CE16
  and CE9 records are retained. Local `pnpm check:soundtrack` passes:
  1,505 unit, 46 runtime, 34 audio integration and 14 depth tests, plus
  static/Python gates. Merge delivered to `codex/composition-ce16`; owner
  review/merge remains. Browser groups and baselines were not rerun.
  [Evidence](./pr-33-conflict-resolution-results.json).

- **PR #33 second review fixes (2026-10-05):** Codex on isolated
  `codex/pr33-review-fixes` from `b6cc3cd`. All three inline findings fixed:
  bounded UTF-8 project serialization, coordinated preview publication/pruning
  and exact backend sample duration. `pnpm check:soundtrack` passes on the pinned
  toolchain: 1,438 unit, 46 runtime, 34 command-only audio integration and 14 depth
  tests, plus schema/boundaries/format/lint/types and soundtrack Python checks.
  Three finding commits; owner review/merge pending. Full browser groups and frozen
  baselines were not rerun for these fixes; earlier CE16 evidence stays historical.
  [Fix results](./pr-33-review-fix-results.json).

- **PR #33 review fixes (2026-10-05):** Claude Code pushed per-request undo,
  anchor-preserving moves, no-op retime, worker decode reuse, Lab render pruning
  and pre-fader ducking (`soundtrack-dsp-2`) onto `codex/composition-ce16`.
  Full `pnpm check` passes on Node 22.23.1 (commerce-adapter timing gate
  needed a rerun under lower machine load). Owner review/merge pending.

- **CE16 isolated implementation (`[x]`, 2026-10-05):** Codex on
  `codex/composition-ce16`, worktree
  `/Users/jjae/.codex/worktrees/composition-ce16/still-shift`, from `dee9e7b`.
  Backend lifecycle, shared project/CLI/API, worker, ducking, optional timeline
  and passage integration technically complete. Full local `pnpm check` passes:
  1,436 unit / 46 runtime / 125 integration / 14 depth; 42 browser groups.
  All 176 frozen baseline items / 36,061 frames pass without regeneration.
  Native float32 decoding exact; editor, playback and full/range mux verified.
  Final current source hashes and reload/relocation/unaffected stems/narration exact.
  Owner allowed automated browser checks for this completion pass only; routine
  production stays command/API/file-based. Earlier browser-policy breach retained.
  No technical closure blockers. Human listening/AV QA unperformed; future backend
  binary distribution needs a packaging decision. No dependency binaries bundled.
  Original checkout and parallel CE12 work untouched.
  [PR #33](https://github.com/xxibcill/still-shift/pull/33) now targets `main`. Dependency
  [PR #32](https://github.com/xxibcill/still-shift/pull/32) merged at `b32dcfa`;
  its follow-up fixes are integrated here. Owner review/merge is pending.
  [Completion audit](./composition-ce16-completion-audit.md),
  [CE16 scope](./composition-engine-plan.md#ce16--programmable-soundtrack-project-and-timeline).

- **PR #32 second follow-up fixes (2026-10-05):** all four P2 findings are posted
  inline and fixed in four finding slices: timed primitive blur (`6876407`),
  normalized AST bounds (`4f7d8be`), periodic reference dependencies (`32e31ac`),
  and separate-axis constant speed (final finding commit, evaluator `25`). Fast
  checks pass 1,487 unit tests, runtime 46 and integration 111. Both expression
  browser backends, repeated/baked exports, evaluator parity and all 176 frozen
  items / 36,061 frames pass without regeneration. Delivery uses four finding
  commits and one final push to PR #32; merged into `main` at `b32dcfa`.
  CE6-P and CE9-F1 remain deferred. [Evidence](./pr-32-second-followup-fix-results.json).

- **PR #32 follow-up fixes (2026-10-05):** both P2 findings are posted inline.
  Implicit anchor/reference reads, cycle validation and nested echo bake parity
  are fixed. Five anchor and 17 bake regressions pass with all fast checks
  (1,442 tests); runtime/integration, both expression browser backends, evaluator
  parity and all 176 frozen items / 36,061 frames pass without regeneration.
  Delivery uses two finding commits and one final push to PR #32, now
  merged into `main` at `b32dcfa`; CE6-P and CE9-F1 remain deferred.
  [Follow-up fix evidence](./pr-32-followup-fix-results.json).

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

_Last updated 2026-10-05 by Codex for PR #34 conflict resolution; both histories retained._

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
  merged into `main` at `b32dcfa` on 2026-10-05. The conflict-resolution merge incorporates
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

### 2026-10-06 — PR #34 lint review repairs

- **Agent / branch:** Codex on `codex/pr34-lint-review-fixes` from `f870fce`.
- **Scope:** separated vector timing, velocity probe capacity and evaluated co-start.
- **Done:** all three findings posted inline; separated component reads and property votes repaired.
- **Results:** 108 focused tests pass; final verification and the remaining two repairs are pending.
- **Rejected / do not repeat:** off-canvas anchor test control corrected before red/green evidence.
- **Open / next:** complete the other two fixes, verify locally, then push all three commits once. Owner review/merge remains pending.
- **Records:** [Evidence](./pr-34-20261006-fix-results.json), [PR #34](https://github.com/xxibcill/still-shift/pull/34).

### 2026-10-05 — Resolve PR #34 against main

- **Agent / branch:** Codex in an isolated checkout from CE12 `afa9be0`.
- **Done:** integrates `main` at `3581855`; keeps motion linting and soundtrack
  exports/commands, newer expression/bake fixes and both development histories.
  Five conflicted files are resolved without changing implementation behavior.
- **Results:** fast checks (1,651 unit), 46 runtime, 169 integration,
  the focused fallback rerun (1 test), 14 depth and browser quality/expression
  checks pass on the pinned toolchain. Soundtrack Python lint, imports and command/history retention pass.
- **Setup repair:** shared Python launcher pointed to a removed checkout. The
  isolated environment now has its own launcher; the failed fallback test passes
  on targeted rerun. Shared environment unchanged.
- **Limits / next:** full `pnpm check`, unrelated browser matrices and frozen CE0
  were not rerun. One merge push resolves PR conflicts; owner review/merge remains.
  Original working checkouts retained; GitHub Actions remains disabled.
- **Records:** [Conflict evidence](./pr-34-conflict-resolution-results.json),
  [PR #34](https://github.com/xxibcill/still-shift/pull/34).

### 2026-10-05 — PR #34 unavailable nested coverage and final verification

- **Agent / branch:** Codex on `codex/composition-ce12`, after `d6af44e`.
- **Done:** declared nested coverage now reports precisely the frames missing after host expiration or before activation; nonexistent declarations retain their own diagnostic. Five inline findings each have one commit, followed by one final push.
- **Results:** six coverage regressions failed before repair. Final fast checks (1,544 unit), 46 runtime, 16 CLI and native browser checks pass; corpus lint covers 176 items / 36,061 frames with zero unexpected failures. Group paint removes false state freezes in two fixtures; frozen pixels and baseline checksum are unchanged.
- **Rejected / do not repeat:** sandboxed runtime checks cannot run `ps`; outside-sandbox reruns pass. Concurrent corpus/browser checks hit one browser startup timeout; isolated corpus rerun passes. No harness or pixel threshold changes.
- **Open / next:** owner review/merge and the existing base-branch `docs/dev-log.md` conflict. Full `pnpm check` render/export groups were not rerun.
- **Records:** [Additional repair evidence](./pr-34-additional-fix-results.json); [CE12 repair record](./composition-engine-plan.md#ce12-pr-34-additional-lint-repairs-2026-10-05).

### 2026-10-05 — PR #34 evaluated track motion

- **Agent / branch:** Codex on `codex/composition-ce12`, after `f7d90a2`.
- **Done:** timing lint compares each final evaluated property, so overridden rotation/effect keys cannot borrow unrelated motion.
- **Results:** two regressions failed before repair with identical visible state across 90 frames; 127 focused quality/CLI tests, build and changed-file ESLint pass. A moving vector component remains counted.
- **Open / next:** nested coverage, final checks and one final push.
- **Records:** [Additional repair evidence](./pr-34-additional-fix-results.json).

### 2026-10-05 — PR #34 easing weights

- **Agent / branch:** Codex on `codex/composition-ce12`, after `88927ad`.
- **Done:** each moving property contributes one easing vote, split across its distinct profiles. Redundant keys do not skew the share.
- **Results:** two regressions failed before repair; 124 focused quality/CLI tests, build and changed-file ESLint pass. Minority key density no longer hides a genuine property majority.
- **Open / next:** overridden tracks, nested coverage and final verification; one final push.
- **Records:** [Additional repair evidence](./pr-34-additional-fix-results.json).

### 2026-10-05 — PR #34 signed scale pops

- **Agent / branch:** Codex on `codex/composition-ce12`, after `5d3f0d3`.
- **Done:** signed scale survives null-parent and precomp inheritance, so abrupt reflections produce scale-pop findings.
- **Results:** five regressions failed before repair; 121 focused quality/CLI tests, build and changed-file ESLint pass. Rotations, declared cuts and canceled reflections stay exempt. Final review found rotated-axis cancellation; an effective linear-matrix guard and eighth scale regression correct it in the same finding commit.
- **Open / next:** easing weights, overridden tracks, nested coverage and final verification; one final push.
- **Records:** [Additional repair evidence](./pr-34-additional-fix-results.json).

### 2026-10-05 — PR #34 group paint modifiers

- **Agent / branch:** Codex on `codex/composition-ce12`, from `7525540`.
- **Done:** posted five inline findings; group effects now contribute to state, timing and velocity when their descendants paint.
- **Results:** two new regressions failed before repair; 114 focused quality/CLI tests, build, changed-file ESLint and browser quality pass. Hidden/offscreen/empty groups and collapsed surfaces remain excluded.
- **Open / next:** four remaining finding commits, final checks and one push. The existing base-branch documentation conflict remains pending.
- **Records:** [Additional repair evidence](./pr-34-additional-fix-results.json).

### 2026-10-05 — PR #34 review fixes: velocity samples, join cost, Lab, framing

- **Agent / branch:** Claude Code on `codex/composition-ce12` (from `8c717b3`).
- **Done:** `059f04a` measures join velocities a step away from the join, so
  per-frame held keys are frame samples (held motion listed as unmeasured);
  `c81eafc` shares fractional join searches per clock and charges them to the lint
  budget; `04ac50a` keeps Lab previews working when lint fails; the final commit
  frames clipped content by its painted region.
- **Results:** each regression failed before its repair. Corpus velocity findings
  1,031 -> 0 (median ratio ~5,600 = 1/(2 x step) showed they were artifacts);
  80 stretched siblings lint in 2.9 s instead of 31.4 s. Fast checks (1,518 unit),
  46 runtime, 15 CLI, browser quality and corpus lint pass; full `pnpm check` not run.
- **Rejected / do not repeat:** integer-frame velocity differencing for held tracks
  flags ordinary easing curvature at the 0.02 ratio; anchoring joins on one side of
  the bisection bracket fails for reversed clocks.
- **Open / next:** resolve the `docs/dev-log.md` conflict with the moved CE9 base;
  speed changes inside held (baked) motion are not measured by velocity lint.
- **Records:** [Review evidence](./pr-34-review-fix-results.json), review on PR #34.

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

### 2026-10-05 — PR #33 master limiter, browser check and owner decisions

- **Agent / branch:** Claude Code on `claude/ce16-sfx-improvements` from `2945649`.
- **Owner decisions:** 1b opt-in master limiter; 2 owner listens; 3a one
  automated browser run authorized; 4a runtime stays local-only, remind before
  contributing/distributing.
- **Done:** `3b84f31` optional `master.limiter` (ceiling −24…0 dBFS, lookahead
  ≤ 4,800, release ≤ 480,000 samples) on the mix after master gain; vectorized
  forward-min attack + running-min release; gain exactly 1 out of reach;
  `soundtrack-dsp-6`; `limiter` edit. `f5edcea` Lab limiter editor. `def0e1e`
  browser workflow drives all new authoring controls. Listening checklist and
  licensing note added.
- **Results:** limiter integration test: ceiling held, out-of-reach samples and
  stems bit-identical, linear release rate, report accurate, removal restores
  the mix. No-limiter projects byte-identical (200 randomized). Fully limited
  10-minute mix: 0.94 s. Browser run passed (new controls plus exact native
  PCM, playback/seek/clear, passage full/range mux with the limiter); first
  attempt failed on a test locator (a select's accessible name includes its
  option), fixed and rerun within the same authorization. Real episode: hot mix
  +4.59 dBFS / 6,419 overs → −1.00 dBFS / 0 overs, 5.59 dB max reduction.
- **Not run:** listening (owner), frozen baselines.

### 2026-10-05 — PR #33 tiling, Lab mix controls and exact memory estimate

- **Agent / branch:** Claude Code on `claude/ce16-sfx-improvements` from `01fbb1b`.
- **Done:** `5738b0a` `tile` edit: crossfaded copies `<id>-2…` up to `endSample`
  (equal-power joins, ≤ half-clip crossfade, last copy trimmed); no contract
  change. `f246429` Lab track output/filters controls, ducking JSON editor,
  add track/bus (unit-tested request builders); moved Remove clip out of
  `#clip-edit` because the browser workflow's `#clip-edit button` locator had
  become ambiguous under Playwright strict mode. `acb00c0` memory estimate now
  simulates the render's depth-first live buffers instead of charging every
  accumulator on a path.
- **Results:** tiled-bed join gains match the equal-power formula in a render
  test. Exact estimate vs measured macOS `phys_footprint` (default allocator):
  margins 0.24–0.26 GB on adversarial graphs at the budget edge (stacked five
  live buffers, filtered first inputs, empty buses, eight-bus chain) and larger
  on common shapes; 3 nested buses + filters + ducking at 10 minutes now fit
  (1.13 GB estimate, 0.88 GB measured; previously rejected at 1.60 GB).
  `pnpm check:soundtrack`: 1,525 unit, 46 runtime, 47 audio integration,
  14 depth; Python lint/format.
- **Rejected / do not repeat:** reusing the narration mix for the ducking
  detector — duplicate pass measured at ~0.04 s shaping + ~0.15 s decode of a
  2 s 10-minute render, about the cost of a spill/read-back. Making no-op edits
  skip saving — the existing unit test pins "every accepted request saves once";
  left as designed (Lab controls send no no-op requests).
- **Not run:** browser suites, baselines, listening.

### 2026-10-05 — PR #33 authoring completeness, parity guard and render speed

- **Agent / branch:** Claude Code on `claude/ce16-sfx-improvements` from `287cff9`.
- **Done:** `8d0c428` adds `add-track`, `remove-track`, `add-bus`, `remove-bus`,
  `route`, `processors` and `ducking` edits (contract track/bus/processor/ducking
  schemas extracted; generated JSON Schema unchanged). `a62cef7`: the lifecycle
  verifier recorded a hard-coded `soundtrack-dsp-2`; it now records the rendered
  version. `a21fc0f`: Lab draws fade shapes and adds cues (optionally registering
  a source) via a unit-tested request builder and an HTTP-level test.
  `b19059a`: `soundtrack edit --operations -` reads stdin (8 MB bound).
  `968c589`: checked-in routing parity script vs DawDreamer's AddProcessor
  (62 cases incl. normal and subnormal double-rounding midpoints) runs in the
  integration suite; unfused add, missing tie fix and missing subnormal
  candidates each fail it. `74c5abd`: outputs hashed while written; TwoSum tie
  work only on possible ties (fused adds 6.0 → 0.9 s on a 10-minute 16-track
  render; total ~30 → 25 s).
- **Results:** byte-identical to the original single-graph worker on 400 more
  randomized projects. Real-media `pnpm soundtrack:verify` into a fresh /tmp
  results path: reload, unaffected stems, relocation, narration exact (committed
  CE16 evidence file restored afterwards, not rewritten). `pnpm check:soundtrack`:
  1,523 unit, 46 runtime, 46 audio integration, 14 depth; Python lint/format.
- **Not run:** browser suites, baselines, listening; Lab UI is type/lint/model
  tested only.
- **Remaining, low value:** the memory estimate counts every accumulator on a
  bus path (exact DFS simulation would admit depth-3 + filters + ducking at 10
  minutes); WAV writing of many large stems is bounded by page faults; no Lab
  forms for tracks/buses/filters/ducking (CLI/API edits cover them).

### 2026-10-05 — PR #33 bounded-memory soundtrack render

- **Agent / branch:** Claude Code on `claude/ce16-sfx-improvements` from `7f1f4dd`.
- **Problem:** the estimate `duration × 8 × (nodes × 4 + 8) ≤ 1.5 GB` capped
  projects at 89–244 s despite the documented 10 minutes, and real use was
  worse: 10-minute renders peaked at 2.2 GiB (1 track) to 6.1 GiB (4 filtered
  tracks, bus, ducking). One DawDreamer graph held an input copy and recording per
  node; clip envelopes, ducking and WAV writes made full-length temporaries.
- **Done:** `0fc092f`. DawDreamer renders only filter chains, one track at a time
  before routing, spilled to the stage and memory-mapped back. NumPy routing
  reproduces DawDreamer 0.9.0 / JUCE exactly: applyGain then fused
  `addWithMultiply` (single rounding; emulated via float64 TwoSum with the
  midpoint case resolved), gains within an ulp of 1 as unity, subnormals kept.
  Depth-first routing, chunked clip shaping, direct FFmpeg streaming for long
  clips, interval-based ducking, streaming WAV writer, one cross-track decode
  plan with a fixed 64 MB budget. New shared estimate (contract + worker):
  depth + 1 (or 3 for a filter render), +0.5 ducking, + 328 MB. Guide updated
  in `c662e68`.
- **Results:** byte-identical outputs vs the previous worker on 800 randomized
  projects (incl. 200 with a forced 5,000-frame decode budget) and the CE16
  fixture. An unfused-add mutant differs on 8 of 40 seeds; an out-of-order error
  mutant fails the decode test. 10-minute macOS `phys_footprint`: 0.25–0.94 GiB,
  all below the estimate. Stress: 16 reused assets 2.2 → 1.5 s; fixture
  unchanged. `pnpm check:soundtrack`: 1,520 unit, 46 runtime, 43 audio
  integration (new: TS/Python estimate parity, a 10-minute ducked/filtered/bussed
  render), 14 depth; Python lint/format pass.
- **Rejected / do not repeat:** relying on `MallocLargeCache=0` (undocumented
  libmalloc knob) to hide macOS large-block retention; a decode budget scaled to
  a quarter project buffer (starved short projects: stress 2.2 → 7.2 s);
  per-track decode plans (lost cross-track sharing).
- **Changed semantics:** tracks render one at a time (ducking detector, filtered
  tracks, then routing order); errors are first-in-authored-order within a track.
  Filtered tracks need temporary stage disk (230 MB each at 10 minutes).
  `STILL_SHIFT_SOUNDTRACK_DECODE_FRAMES` may only lower the decode budget (tests).
- **Not run:** browser suites, baselines and listening (PCM unchanged).

### 2026-10-05 — PR #33 shared and parallel soundtrack decoding

- **Agent / branch:** Claude Code on `claude/ce16-sfx-improvements` from `e20b6a6`.
- **Profile first:** the 60 s CE16 fixture renders in 0.6 s (decode 0.09 s), so
  realistic projects were not decode-bound. A 120 s, 4-track, 128-cue stress
  project cut from 10-minute 44.1 kHz WAV/MP3 sources spent ~18 of ~20 s
  decoding: a reused asset whose covering span exceeded the cache fell back to
  per-clip decodes, each resampling the source from its start.
- **Done:** `77a759e` streams one FFmpeg pass per reused asset, keeping only its
  clips' samples (budget now bounds retained samples, not the covering span).
  A deterministic decode plan runs on up to eight threads, at most four
  project-length buffers ahead; probes and source hashing are parallel too.
  Clips are consumed in authored order; errors surface at the first affected
  clip in authored order.
- **Results:** byte-identical outputs versus the previous worker on the fixture
  (7 files) and both stress projects (5 files each). Stress: 19.6 → 2.1 s
  (16 reused assets) and 24.7 → 4.7 s (100 assets); fixture 0.56 → 0.44 s on a
  15-core Mac. Peak RSS at most +91 MiB. The reuse test now covers streamed,
  over-budget and corrupt-source paths; a mutation resolving decode jobs
  newest-first fails it. `pnpm check:soundtrack`: 1,519 unit, 46 runtime,
  41 audio integration, 14 depth; Python lint/format pass.
- **Not run:** browser suites, baselines and listening (PCM unchanged).
- **Open / next:** the duration-bound owner decision above. Remaining ideas:
  Lab fade drawing and Lab clip adding.

### 2026-10-05 — PR #33 equal-power fade curves

- **Agent / branch:** Claude Code on `claude/ce16-sfx-improvements` from `c41c58b`
  (cue/asset/fade edits pushed to PR #33 first, at the owner's request).
- **Done:** `e1d6c49` adds optional `clips[].fadeInCurve`/`fadeOutCurve`:
  `linear` (absent default) or `equal-power`, `sin(r·π/2)` over the linear ramp
  `r`, −3 dB at the midpoint. Gain is pinned to exactly 1 where `r = 1`, so it
  never depends on platform sine rounding. `fade` edits set curves; `linear`
  removes the field. JSON Schema regenerated; `soundtrack-dsp-5`. `d73d624` adds
  Lab curve selects.
- **Results:** a new integration test checks quarter-sine sample gains at both
  fades, exact unity between them, per-fade independence and bit-identical
  absent vs explicit `linear` PCM. It fails on a worker that bumps only its
  version string. `pnpm check:soundtrack`: 1,519 unit, 46 runtime, 41 audio
  integration, 14 depth; Python lint/format pass.
- **Not run:** browser suites, baselines and listening; Lab change is
  type/lint-checked only.
- **Open / next:** the Lab timeline does not draw fade shapes. Per-clip decoding
  still resamples each source from its start; looping and a master limiter
  remain out of contract scope.

### 2026-10-05 — PR #33 cue, asset and fade edit operations

- **Agent / branch:** Claude Code on `claude/ce16-sfx-improvements` from `204053f`.
- **Done:** `d6fa38b` adds `add-clip` (complete contract clip, appended so
  existing summation order and PCM are unchanged), `remove-clip`, `fade`,
  `add-asset` and `remove-asset` (`asset-in-use` while referenced). File-based
  saves hash added sources relative to the project JSON; a stated mismatched
  hash, missing or oversized source fails before saving. `e4194a6` adds Lab
  fade fields and a Remove clip button. Previously these needed hand-edited JSON
  outside the revision lock.
- **Results:** two unit tests (one-request undo, append order, 16 error codes;
  a wrong-code mutation fails) and one integration test (relative hashing,
  rejected saves leave bytes intact, the added cue renders at −6 dB and its
  removal restores the effect stem exactly). `pnpm check:soundtrack`: 1,518 unit,
  46 runtime, 40 audio integration, 14 depth; Python lint/format pass. Runtime
  borrowed read-only from the Codex CE16 worktree via
  `STILL_SHIFT_SOUNDTRACK_PYTHON`.
- **Not run:** browser workflow suites (owner authorization covered only the
  CE16 completion pass), baselines and listening. Lab form changes are
  type/lint-checked only.
- **Open / next:** push to PR #33 when the owner approves. Adding clips from the
  Lab, equal-power fade curves, looping and a master limiter remain out of scope.

### 2026-10-05 — PR #33 clip-level pan

- **Agent / branch:** Claude Code on `claude/ce16-sfx-improvements` from `2cddbb2`.
- **Done:** optional `clips[].pan` in [-1, 1]. The left/right gains are
  `√2·cos/sin((pan + 1)·π/4)`: unity at centre, +3 dB on the panned side and exact
  silence on the other at hard pan. The ducking detector taps before pan. Adds a
  `pan` edit operation (`0` removes the field), a Lab pan field and clip label,
  regenerated JSON Schema and the `soundtrack-dsp-4` version.
- **Results:** a new integration test checks that explicit centre is bit-identical
  to absent pan (all stems, mix, duck envelope), that panning narration leaves the
  duck envelope unchanged, that hard left gives exact right silence and √2 on the
  left, and that intermediate gains follow the law. It fails on the previous worker,
  including after bumping only its version string. `pnpm check:soundtrack`:
  1,516 unit, 46 runtime, 39 audio integration, 14 depth; Python lint/format pass.
- **Not run:** browser workflow suites, baselines and listening.
- **Open / next:** pushed to PR #33 as `633412f`; owner review/merge remains.
  Looping and a master limiter are not in `soundtrack-project-1`.

### 2026-10-05 — PR #33 mix headroom report and Lab number-field guard

- **Agent / branch:** Claude Code on `claude/ce16-sfx-improvements` from `3317633`.
- **Scope:** improvement pass on the CE16 soundtrack engine after review rounds.
- **Done:** the worker reports `peakDbfs` (`null` when silent) and
  `samplesAboveFullScale` per output, measured on the cropped PCM it writes;
  the manifest schema requires both. The Lab shows the mix peak and an over warning,
  and rejects empty/invalid number fields that `Number("")` silently saved as
  0 dB or sample 0.
- **Results:** the new integration test compares reported values with decoded file
  samples (+6 dB master: exactly 1 over; muted stem: `null`) and fails on the
  previous worker with a schema error. 2 new unit tests. `pnpm check:soundtrack` on
  Node 22.23.1: 1,515 unit, 46 runtime, 38 audio integration, 14 depth; Python
  lint/format pass.
- **Rejected / do not repeat:** running the gate on Node 24.16.0 fails the CE9
  bake test by 1 ULP. This toolchain mismatch is not a regression; use the pinned
  22.23.1.
- **Not changed:** fade-out ends at `1/fadeOutSamples` before the clip's exclusive
  end, matching half-open fade-in semantics; this is not a defect. Browser workflow
  suites, baselines and listening were not run.
- **Open / next:** owner approval to push to PR #33. Owner decision pending on
  whether clip pan, looping or a master limiter belong in a later contract
  version; `soundtrack-project-1` has none of them.

### 2026-10-05 — PR #33 portable stem filename fix and verification

- **Agent / branch:** Codex on `codex/pr33-followup-fixes`; ducking fix `579553a`.
- **Done:** reject case-insensitive track/bus filename collisions and reserved
  names before rendering, including persisted undo/redo; preserve distinct names.
- **Results:** eight regressions fail before repair; all 63 focused tests pass
  afterward. Full `pnpm check:soundtrack`: 1,513 unit, 46 runtime, 37 audio
  integration and 14 depth tests; static/Python checks pass.
- **Limits:** no browser workflow/baseline suites or listening. Separate toolchain
  check launched headless Chromium for version verification only. Shared Python
  editable-package binding restored to the primary checkout after verification.
- **Delivery:** second finding commit, then push both fixes together to PR #33.
  GitHub Actions remain prohibited; owner review/merge remains pending.
- **Records:** [fix evidence and inline comments](./pr-33-followup-fix-results.json).

### 2026-10-05 — PR #33 ducking hold fix

- **Agent / branch:** Codex on `codex/pr33-followup-fixes` from `0dc2782`.
- **Done:** posted both findings inline; hold begins only after detector activity.
  Worker and render identity advance to `soundtrack-dsp-3`; guide updated.
- **Results:** silent and delayed-speech long-hold regressions fail before repair;
  all 22 soundtrack lifecycle tests pass after repair. Browser/listening not run.
- **Next:** fix stem case collisions in the second finding commit, verify locally,
  then push both commits together. GitHub Actions remain prohibited.
- **Records:** [fix evidence](./pr-33-followup-fix-results.json).

### 2026-10-05 — Resolve PR #33 against merged CE9

- **Agent / branch:** Codex on isolated PR #33 checkout, from `039c1d5`.
- **Scope:** merge `main` at `b32dcfa` after dependency PR #32 merged.
- **Done:** retain both branches' development records; source and tests merge
  automatically, preserving CE16 review fixes and CE9 follow-up fixes.
- **Results:** pinned toolchain and `pnpm check:soundtrack` pass: 1,505 unit,
  46 runtime, 34 audio integration and 14 depth tests, plus static/Python gates.
  All 48 branch entry titles retained; Actions disabled. Browser/baseline groups
  were not rerun. Formatting and whitespace checks pass.
- **Delivery / next:** merge pushed to PR #33; owner review/merge pending.
- **Records:** [conflict-resolution evidence](./pr-33-conflict-resolution-results.json).

### 2026-10-05 — Preserve PR #33 exact backend sample counts

- **Agent / branch:** Codex on `codex/pr33-review-fixes`, after `f35f1b7`.
- **Scope:** P2 inline finding: converting 110,400 samples to seconds rendered one short.
- **Done:** round seconds upward by one representable step at the pinned DawDreamer
  boundary; retain the exact output-length check and unchanged narration placement.
- **Results:** three new duration cases fail before the fix; all seven new duration
  regressions pass, including 1/511/512/513/48,005/110,400 samples, original narration
  and exact full/range stems with DSP. Final `pnpm check:soundtrack` passes:
  1,438 unit / 46 runtime / 34 audio integration / 14 depth, plus all static/Python gates.
- **Delivery:** one commit per finding (`077443e`, `f35f1b7`, this slice), published
  together after the final checks. No Actions, source-media changes or GUI checks.
- **Open / limits:** owner review/merge pending; full browser/baseline matrix and
  creative listening/AV QA not rerun. Earlier completion records remain historical.
- **Records:** [review/fix evidence](./pr-33-review-fix-results.json).

### 2026-10-05 — Coordinate PR #33 preview publication

- **Agent / branch:** Codex on `codex/pr33-review-fixes`, after `077443e`.
- **Scope:** P2 inline finding: concurrent renders could prune each other's outputs.
- **Done:** queue render publication/pruning and Lab edits per real project path;
  use the existing artifact lock across independent Lab instances. Register the
  new command-only concurrency suite in the local soundtrack verification tiers.
- **Results:** both race regressions fail before the fix; all eight mocked-worker
  concurrency and real-worker HTTP API tests pass, including edit invalidation,
  failure recovery, independent-server exclusion and stale preview rejection.
  TypeScript build and focused lint pass.
- **Open / next:** repair backend duration rounding, run final local checks and
  push the three finding commits together. No browser checks or Actions.
- **Records:** [review/fix evidence](./pr-33-review-fix-results.json).

### 2026-10-05 — Bound PR #33 saved project bytes

- **Agent / branch:** Codex on `codex/pr33-review-fixes`, from `b6cc3cd`.
- **Scope:** P1 inline finding: successful edits could exceed the reader's 8 MB limit.
- **Done:** share UTF-8 serialization bounds across atomic saves, packages and
  rendered snapshots; oversized edits leave the original bytes and revision intact.
- **Results:** regression failed before the fix; all 13 soundtrack lifecycle tests
  pass after it, including reload, undo/redo, relocation, cancellation and PCM checks.
- **Open / next:** fix concurrent preview pruning and backend duration rounding,
  then run the final local gate and push the three finding commits together.
- **Records:** [review/fix evidence](./pr-33-review-fix-results.json).

### 2026-10-05 — PR #33 review: SFX edit transactions, decode reuse, Lab pruning

- **Agent / branch:** Claude Code on `claude/ce16-sfx-improvements`, from PR #33
  head `e7f3175`; pushed to `codex/composition-ce16` at the owner's request.
- **Scope:** review-driven fixes to the CE16 soundtrack engine and Lab API.
- **Done:** one edit request is one undo entry, and only its final state is
  validated (no-op requests add no history). An anchored `move` keeps its anchor
  point and derives `offsetSamples`; conflicting or unanchored offsets fail with
  `anchor-conflict`, and the Lab offset field is read-only. `retime` saves only
  when an anchor moved (it no longer fails with `edit-schema` when none did).
  The worker probes each asset once and decodes a reused asset's span once
  within one project-length buffer, else per clip. Lab renders are grouped per
  project; a render keeps only the newest, a Lab edit removes all, and a pruned
  preview answers `revision-conflict`.
- **Results:** on Node 22.23.1: toolchain, schema, boundaries, format, lint,
  build and ruff pass; 1,438 unit, 46 runtime, 127 integration and 14 depth
  tests pass. `test:browser:soundtrack` passes (owner-approved run; its single
  400 console line also appears on unmodified `e7f3175`). A 124-clip SFX
  project rendered bit-identically on all 7 outputs, with worker time cut from
  4.3 s to 0.56 s; CE16 fixture mix hash unchanged. A slicing mutation fails
  the new reuse test. The other 41 browser groups and baselines were not run.
- **Rejected / do not repeat:** Node 24 fails the CE9 bake test by one ULP and
  depth tests time out without `uv sync`; both are environment, not regressions.
- **Ducking (owner chose option B):** the detector is now a pre-fader
  sidechain, hearing narration clip gain/fades/automation but not track
  gain/mute/solo/DSP; DSP version `soundtrack-dsp-2`. CE16 fixture outputs stay
  bit-identical (unity narration clip); render identities change with the
  version. Recorded CE16 evidence JSON still describes the `dsp-1` runs.
- **Full `pnpm check` on `6ed279e` (Node 22.23.1):** all 47 test steps pass,
  including all browser groups and 176 frozen baseline items / 36,061 frames.
  `composition-commerce-adapter` missed its 1.25× timing gate twice on
  `commerce/atom-text` (1.26×, 1.29×; pixels exact) while another session loaded
  the machine; the untouched `e7f3175` passed at 1.16×, and the branch then
  passed the whole group at 1.19× (worst item 1.22×). Treat as load noise.
- **Open / next:** PR #33 review/merge still pending after PR #32.
- **Records:** [soundtrack guide](./soundtrack-project.md),
  [PR #33](https://github.com/xxibcill/still-shift/pull/33).

### 2026-10-05 — Publish isolated CE16 as PR #33

- **Agent / branch:** Codex on `codex/composition-ce16`, after `361dfe1`.
- **Done:** published and attached [PR #33](https://github.com/xxibcill/still-shift/pull/33).
- **Base:** `codex/composition-ce9` at `dee9e7b`; stacking excludes CE9 changes
  from this PR. Merge [#32](https://github.com/xxibcill/still-shift/pull/32) first,
  then retarget CE16 to `main`. Primary checkout and CE12 work remain untouched.
- **Verification:** retained full local gate and all 176 frozen baselines pass;
  no implementation changes for publication. Repository Actions confirmed disabled.
- **Open / next:** owner review/merge pending; existing technical/creative limits
  remain in the [completion audit](./composition-ce16-completion-audit.md).

### 2026-10-05 — Complete isolated CE16 technical verification

- **Agent / branch:** Codex on isolated `codex/composition-ce16`, from `dee9e7b`.
- **Done:** `6e0e74d` fixes narrow module loading and adds real browser verification;
  `974dfdf` strengthens current source checks. Closing records mark CE16 `[x]`.
- **Results:** full local `pnpm check` exit 0 on frozen `974dfdf`: 1,436 unit,
  46 runtime, 125 integration, 14 depth tests and 42 browser groups. All 176 frozen
  baselines / 36,061 frames pass without regeneration; native stereo decode exact,
  editor/playback/full/range mux pass. Final source/PCM recheck also passes.
- **Rejected / do not repeat:** broad command-only import filtering admitted
  browsers; use the explicit audio allowlist. Retained loader/alias/test-fixture
  failures are resolved; unchanged timeout cases also pass in the final full gate.
- **Open / limits:** no technical blockers; listening/human AV QA unperformed.
  Future binary distribution needs packaging review. Owner browser exception was
  for this completion pass only; production requires no GUI. No Actions or CE12 edits.
- **Records:** [audit](./composition-ce16-completion-audit.md),
  [results](./composition-ce16-verification-results.json), [guide](./soundtrack-project.md).

### 2026-10-05 — Fix PR #32 separate-axis constant speed

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes`, after `32e31ac`.
- **Done:** build constant-speed paths from independently eased axis samples,
  preserve motion offsets and native joint-path arithmetic, cache by source/fps,
  and bound spring sampling work. Evaluator version is `25`; a new browser
  fixture covers separate-axis source/baked pixel and seek parity.
- **Results:** 13 new expression cases pass, including a dense spring reference
  at three frame rates. Fast checks pass 1,487 unit tests; runtime 46 and
  integration 111 pass. Both expression browser backends, repeated/baked exports
  and Node/browser evaluator parity pass. All 176 frozen items / 36,061 frames
  pass without regeneration.
- **Rejected:** fixed 128 samples per interval alias spring oscillations;
  128/256 per natural period miss the 0.05 px reference tolerance. Use 512 per
  period and report a clear error above the 512,001-point bound.
- **Delivery:** four finding commits and one final push to PR #32. Owner
  review/merge remains pending; deferred performance/runtime work stays deferred.
- **Records:** [Second follow-up evidence](./pr-32-second-followup-fix-results.json).

### 2026-10-05 — Fix PR #32 periodic reference dependencies

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes`, after `4f7d8be`.
- **Done:** use root-clock periodic windows and exact reference axes in echoed
  dependency traversal; retain anchors for delayed/lagged and temporal reads.
  Historical vector samples constrain only read components, preserving other axes
  when ordinary samples arrive later under reversed clocks.
- **Results:** all 53 bake/component-history tests pass. Three original cases and
  two component-history acceptance cases failed before their fixes; 19 new cases
  cover periodic windows, temporal readers and required-axis conflicts.
- **Open / next:** combined correctness checks, the separate-axis roving finding
  commit and one final push after all four commits.
- **Records:** [Second follow-up evidence](./pr-32-second-followup-fix-results.json).

### 2026-10-05 — Fix PR #32 normalized AST bounds

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes`, after `6876407`.
- **Done:** accept the serialized depth of parser-valid ASTs while retaining the
  500-node source bound, 64 KiB payload limit and generic JSON/metadata depth 64.
- **Results:** four new cases failed before the fix; all nine normalization cases
  and the affected bounds/syntax/expression files pass (174 tests). CLI output
  for 40/250 terms revalidates and evaluates correctly. Independent review passes.
- **Open / next:** periodic reference writers and separate-axis roving, combined
  local correctness gates and one final push after all four finding commits.
- **Records:** [evidence](./pr-32-second-followup-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/32#discussion_r4181734013).

### 2026-10-05 — Fix PR #32 timed primitive-blur history

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes`, from `c4f7c8d`.
- **Done:** posted all four findings inline; select the active blur at the historical
  scope/layer clock and include inherited blur outside a nearer override's window.
- **Results:** two regressions failed before the fix; all 34 bake tests pass,
  including forward/reversed covering-window cases that must still bake exactly.
- **Open / next:** normalized AST bounds, periodic references and separate-axis
  roving; combined local correctness checks, then one final push after four commits.
- **Records:** [evidence](./pr-32-second-followup-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/32#discussion_r4181734002).

### 2026-10-05 — Fix PR #32 nested echo bake clocks

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes`, after `5aeb64e`.
- **Done:** sample render echo clocks and contributing property dependencies;
  preserve compatible keys and refuse conflicting/fractional history with
  `comp-bake-time`. Cover primitive blur and active unchanged-source revisions.
- **Results:** 17 new bake cases; fast checks pass (1,442 tests), runtime 46 and
  integration 111 tests pass. Both browser backends pass pixels/seeks/repeated and
  baked MP4 parity; all 176 frozen items / 36,061 frames pass without regeneration.
- **Rejected / do not repeat:** sampling all sibling properties over-rejected
  compatible bakes; raw effect exclusion missed primitive blur/revision reads;
  collecting overridden group blur also over-rejected. Regressions cover each.
- **Delivery / next:** two finding commits, one final push to PR #32, then owner
  review/merge. Full test pipeline and strict hardware matrices were not run.
- **Records:** [follow-up fix evidence](./pr-32-followup-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/32#discussion_r4181138611).

### 2026-10-05 — Fix PR #32 implicit anchor/reference dependencies

- **Agent / branch:** Codex on isolated `codex/pr32-review-fixes`, from `dee9e7b`.
- **Done:** posted both inline findings; resolve inherited reference axes through
  anchor expressions and reject their self/indirect cycles before evaluation.
- **Results:** three regressions failed before the fix. Five final cases cover
  property/tree reads, order/seeks, authored/partial references, motion writers and
  nested instances; all fast checks pass (1,425 tests). A one-key signal fixture
  failed the existing schema and was corrected to two keys before rerunning.
- **Open / next:** nested echo bake parity, then combined browser/runtime/baseline
  correctness checks and one final push. CE6-P and CE9-F1 remain deferred.
- **Records:** [follow-up fix evidence](./pr-32-followup-fix-results.json),
  [inline review](https://github.com/xxibcill/still-shift/pull/32#pullrequestreview-5410494179).

### 2026-10-04 — Verify CE16 under the owner’s one-time browser exception

- **Agent / branch:** Codex on isolated `codex/composition-ce16`, after `07bf912`.
- **Authorization:** owner explicitly allowed automated browser verification for
  this checking pass. Routine production remains command/API/file-based.
- **Done:** narrow soundtrack module entry fixes strip-only Vite loading; new
  local browser group covers shared edits, exact 384,000-sample stereo native decode,
  playback/seek/clear and 192-frame/full + 24-frame/range passage mux audio.
- **Results:** focused browser checks, all 35 audio tests and Python checks pass.
  Full gate passes 1,436 unit, 46 runtime, 125 integration and 14 depth tests so far.
- **In flight:** remaining full `pnpm check` browser groups and frozen CE0 baselines.
- **Failures:** retained loader/alias failures, fixture corrections and one visual
  timeouts. Both timed-out cases pass unchanged alone. Verifier now independently
  checks current original/packaged whole-file hashes; all match. Final gate runs
  serially on frozen files, with no parallel edits or tests.
- **Constraints:** no GitHub Actions, provider calls, purchases, source changes or
  primary checkout/CE12 edits. Earlier headless-browser breach stays recorded.
- **Records:** [CE16 audit](./composition-ce16-completion-audit.md),
  [results](./composition-ce16-verification-results.json).

### 2026-10-04 — Audit CE16 completion and correct browser verification selection

- **Agent / branch:** Codex on isolated `codex/composition-ce16`, after `733b24d`.
- **Done:** `31764f4` guards cleared/superseded preview attachments and immutable snapshots;
  model held automation steps; reject duplicate beat anchors; correct CLI example
  and generated measurement evidence. Added six preview harness regressions.
- **Results:** corrected tier passes 1,436 unit, 46 runtime, 19 audio integration
  and 14 depth tests; focused group 35; retained 60-second decoded lifecycle exact.
- **Rejected / repaired:** direct Playwright-import filtering missed indirect
  headless-browser launches. Earlier broad checks violated zero browser driving;
  retained honestly, replaced with three audited audio-only suites. No CUA used.
- **Open / next:** closure blocked after three consecutive impasse audits; owner
  resolution of full check/rendered baseline conflict remains pending; `[~]`.
  Listening/AV QA and binary distribution decision unperformed/pending.
- **Records:** [requirement audit](./composition-ce16-completion-audit.md),
  [evidence](./composition-ce16-verification-results.json).

### 2026-10-04 — Continue CE16 into the shared project and passage integration

- **Agent / branch:** Codex on isolated `codex/composition-ce16`, after `0ad92e9`.
- **Done:** `15b02eb` commits the shared project contract, atomic revision
  edits/history, bounded worker, CLI lifecycle, explicit BGM ducking, optional
  layer view and passage adapter. Worktree is clean after the documentation record.
- **Results:** full 60-second CLI reload/portable relocation exact; narration and
  unrelated edited stems unchanged; mix reconstructed exactly. Local model/PCM/API
  checks preserve legacy passage audio. 1,428 unit, 46 runtime, 94 command integration and 14 depth tests pass;
  focused final audio/API group passes 27 tests.
- **Rejected / repaired:** boundary check found undeclared `zod`; declared exact
  existing version. Formatting of generated evidence/lockfile corrected. Final review fixed
  soundtrack gallery mode and revision drift during picture export.
- **Open / next:** owner closure decision requested; full `pnpm check`/browser
  baselines unperformed under CE16's
  browser-driving prohibition, so milestone remains `[~]`. Distribution packaging
  decision pending; listening, audiovisual QA and GUI inspection unperformed.
- **Records:** [guide](./soundtrack-project.md),
  [milestone](./composition-engine-plan.md#ce16--programmable-soundtrack-project-and-timeline),
  [technical evidence](./composition-ce16-verification-results.json).

### 2026-10-04 — Isolate CE16 and verify its backend lifecycle

- **Agent / branch:** Codex on `codex/composition-ce16`, from delivered CE9 `dee9e7b`.
- **Scope:** owner requested isolated CE16 implementation, alongside separate CE12 work.
- **Done:** created and attached managed worktree; reused development dependencies;
  started isolated pinned DawDreamer environment setup.
- **Results:** seven 60-second mix/stem/bus outputs per run, exact fresh-process
  reload and unaffected-stem comparisons; narration source PCM exact. Gain/move
  edits and checksum rejection verified; built-in DSP onset delay is zero.
  Fast checks pass (1,420 tests); Python lint/format checks pass.
- **Environment:** initial fast run failed on six files because the dependency
  symlink lacked package-local `three`; isolated offline install resolves it.
  Full runtime/browser/baseline groups were not rerun.
- **Open / next:** CE16-B integration and packaging remain pending. No listening
  or audiovisual QA performed. Zero Computer Use; raw assets preserved.
- **Records:** [CE16](./composition-engine-plan.md#ce16--programmable-soundtrack-project-and-timeline),
  [backend proof evidence](./composition-ce16-verification-results.json).

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
