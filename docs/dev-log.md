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

- **PR #40 clock review fixes complete (2026-10-07):** isolated
  `codex/pr40-clock-fixes` from reviewed `e907d16`. Both findings are inline;
  echo bake history now uses held/posterized content clocks, and explicit instance
  overrides precede unused loop validation while raw remaps remain intact.
  Evaluator 33 separates changed caches. Seven new regressions fail before their
  repairs; final fast checks pass 1,914 units and all 41 affected integrations pass.
  Native exposure/expression/quality acceptance, 12 hardware comparisons,
  independent/repeated exports and 176 frozen items / 36,061 frames pass unchanged.
  New browser proof rejects incompatible bakes and preserves 144 compatible pixel
  observations exactly. Independent review and final source fingerprint pass.
  Delivery uses two finding commits and one normal push to the existing PR head.
  Owner review/merge remain; no implementation blocker. No complete new full gate,
  serial profile or strict timing matrix is claimed; Actions stay disabled.
  [Evidence](./pr-40-clock-fix-results.json).

- **PR #40 conflict repair verified (2026-10-07):** isolated
  `codex/pr40-conflict-repair` combines CE7 `48fe4cc` with current CE5 `d3093bd`
  without rewriting published history. CE7 clock/cut fixes, upstream scaled
  follow-path, expression, lint, inspector and soundtrack repairs are retained.
  Fresh evaluator 32 / Canvas 1.24.4 / WebGL2 0.38.4 distinguish combined caches.
  Explicit cinematic error report fields repair native Node/Vite loading.
  Final fast checks pass 1,907 units; 46 runtime, 224 integration, 14 depth and
  all 14 affected browser groups pass. All 176 frozen items / 36,061 frames are
  exact, with no asset, threshold or source changes during acceptance.
  The first integration failure and loader repair are retained. Complete combined
  `pnpm check`, serial sample-cost profiling and full timing matrices were not run.
  Existing PR publication uses a normal fast-forward push; owner review/merge remain.
  No implementation blocker or owner decision; GitHub Actions stay disabled.
  [Evidence](./pr-40-conflict-resolution-results.json).

- **PR #40 review fixes complete (2026-10-06):** `codex/composition-ce7` from
  `817cc9f`, with one commit per finding. Boundary correction `4c7266a` aligns
  cuts with the actual floored clock; outgoing-state visibility uses the reachable
  frame or baked index. All 50 focused tests and independent review pass.
  Full local `pnpm check` passes 1,605 unit, 46 runtime, 139 integration, 14 depth,
  every required browser suite and 176 unchanged frozen baselines / 36,061 frames.
  Both findings are inline comments on [PR #40](https://github.com/xxibcill/still-shift/pull/40).
  Owner review/merge remain; no implementation blocker or owner decision is pending.
  [Evidence](./pr-40-fix-results.json).

- **CE7 complete (2026-10-06):** `codex/composition-ce7`, code `0e48388`.
  Local holds/posterization, source loops, freeze remap, deterministic adaptive
  exposure and controlled cuts are delivered. Full `pnpm check` passes 1,600 unit,
  46 runtime, 139 integration, 14 depth, all browser groups and 176 frozen baselines
  / 36,061 frames. Native pixels/seeks/stored hashes, 12 hardware comparisons,
  independent/repeated exports and serial seven-count 1080p costs pass/are recorded.
  CE13 decode integration remains its conditional handoff. [PR #40](https://github.com/xxibcill/still-shift/pull/40) is open
  and attached; CE6 starts on a new branch. No owner decision is pending.
  [Evidence](./composition-ce7-results.json).

- **PR #38 follow-path review fix complete (2026-10-06):** isolated
  `codex/pr38-follow-path-fix` from `eb17b1f`. The P2 finding is posted inline;
  cubic contours now transform into world coordinates before flattening, fixing
  14.64-pixel drift under source-layer or ancestor scaling. Two regressions cover
  all quadrants, tangent orientation, reverse seeks and input immutability.
  Fast checks pass 1,871 unit tests; native shape hashes, independent exports,
  inspector and 18 exact hardware comparisons pass. Node/browser evaluator
  parity passes. Fixtures, frozen baselines and tolerances are unchanged.
  Delivery uses one finding commit and one final normal push to the existing PR.
  Owner review/merge remain; no blocker or pending owner decision. No full
  `pnpm check` or CE0 rerun; Actions remain disabled.
  [Evidence](./pr-38-follow-path-fix-results.json).

- **PR #38 main conflicts resolved (2026-10-06):** isolated
  `codex/pr38-main-conflicts` combines CE5 `3d0da6a` with main `bdf8f6a`.
  Native shape review fixes, main expression/lint/inspector fixes and soundtrack
  integration are retained. All 56 test groups and both development histories
  survive; combined evaluation uses version 30. Fast checks pass 1,869 unit tests;
  46 runtime, 65 affected integration, 14 depth and ten browser groups pass.
  Native shape hashes, 300 exact cap comparisons, 18 exact hardware comparisons,
  independent exports and both 576-frame native passages pass unchanged policy.
  No full `pnpm check` or frozen CE0 rerun; no visual baseline is regenerated.
  Owner review/merge remain; no blocker. Actions remain disabled.
  [Evidence](./pr-38-main-conflict-resolution-results.json).

- **PR #38 review fixes complete (2026-10-06):** isolated
  `codex/pr38-shape-review-fixes` from `2b1c6e5`. Both P2 findings are posted
  inline and repaired in separate commits. Smooth zig-zag retains cubic handles;
  square caps receive conservative bounds for culling and raster preparation.
  Fast checks pass 1,623 unit tests; all 65 focused shape tests and 300 exact
  direct-Canvas pixel comparisons pass. Native hashes/seeks, independent exports,
  inspector and 18 exact hardware comparisons pass. Independent standards/spec
  review finds no new defects. Only reference cell 13 changes for smooth zig-zag;
  fixture sources, animation/core and frozen CE0 baselines stay unchanged.
  Delivery uses two finding commits and one final normal push to the existing PR.
  Owner review/merge remain; no blocker. Full `pnpm check` was not rerun and
  GitHub Actions remain disabled. [Fix evidence](./pr-38-fix-results.json).

- **PR #38 base integration verified (2026-10-06):** CE11 `00d5fba` is merged
  into CE5 in an isolated managed worktree without rewriting shared history.
  CE5 native shapes and the CE11/CE10 review fixes are retained; narrow save
  imports preserve native Vite config loading. Final fast checks pass 1,618 unit
  tests; 46 runtime, 47 focused composition integration and 14 depth tests pass.
  Inspector, shapes/hardware/MP4, sessions, builder/watch/export, evaluator and
  typography acceptance pass, as do 176 frozen items / 36,061 frames unchanged.
  Full `pnpm check` was not rerun; initial failures remain recorded. Owner review
  and merge remain pending. No implementation blocker or owner checkout changes;
  GitHub Actions remain disabled. [Resolution evidence](./pr-38-conflict-resolution-results.json).

- **CE5 complete (2026-10-05):** `codex/composition-ce5`, runtime `4908cbe`.
  Native shapes, authoring/baking/inspector, reference/animation/MP4 acceptance and
  complete `pnpm check` pass: 1,569 unit, 46 runtime, 139 integration, 14 depth,
  all browser groups and 176 frozen baselines / 36,061 frames. Native stored hashes
  and reverse seeks pass; legacy connectors, actual CE4a brush conversion and all
  18 Apple hardware comparisons are exact. Failed attempts/repairs are retained.
  [PR #38](https://github.com/xxibcill/still-shift/pull/38) is open and attached; CE7 is now complete.
  No owner decision is pending. [Evidence](./composition-ce5-results.json).

- **PR #37 inspector repairs complete (2026-10-06):** isolated
  `codex/pr37-inspector-fixes` from reviewed `12bfc1d`; all three findings are
  posted inline. R13 numeric Apply focus (`6f992bc`) and R14 asynchronous handle
  focus (`22308f5`) and R15 distinct top-level/precomp scope identity are fixed.
  Fast checks pass 1,805 unit tests; 31 affected integration, 46 runtime and four
  browser groups pass, including desktop/phone edits, captured MP4 parity and the
  new focus/scope regressions. Independent standards/spec review found no new issues.
  A missing isolated CLI dependency link and new regression fixture/parser
  assumptions were repaired; production thresholds and baselines stay unchanged.
  Three separate finding commits are delivered with one normal final push.
  No implementation blocker; owner review/merge remain separate. Full gate/depth/
  frozen baselines were not rerun or regenerated. Actions stay disabled.
  [Evidence](./pr-37-inspector-fix-results.json).

- **PR #37 main conflicts resolved (2026-10-06):** isolated managed worktree
  from CE11 `7fac583`, integrating main `54782d7` without rewriting history.
  Inspector/draft/asset ownership and advisory lint are retained; soundtrack,
  inspector and session test groups and both development histories are preserved.
  Fast checks pass 1,803 unit tests; 46 runtime, 60 affected integration and six
  browser groups pass. Final affected schema/format/lint/build checks pass after
  the watch-error guard. Native builder pixels/exports and retained-draft MP4 pass.
  Generated-reference drift and a missing isolated soundtrack runtime were repaired;
  the unchanged soundtrack retry passes exact PCM and passage export acceptance.
  Full `pnpm check` and frozen baselines were not rerun or regenerated. Owner
  review/merge remain; no implementation blocker. Actions remain disabled.
  [Evidence](./pr-37-main-conflict-resolution-results.json).

- **PR #37 final review fixes complete (2026-10-06):** isolated
  `codex/pr37-review-fixes` from `00d5fba`; R11 and R12 are posted inline.
  Layer/visibility controls retain keyboard focus; dirty drafts retain captured
  asset bytes across watch changes, edits, history, renderer switching and MP4
  export. Failed/replaced loads and disconnected owners release their leases.
  Fast checks pass 1,563 unit tests; 29 affected integration, 46 runtime and four
  browser groups pass. Independent standards/spec review found no new defects.
  Two finding commits were delivered at `7fac583` to `codex/composition-ce11`.
  Owner review/merge remain; no owner checkout changes, full gate rerun or baseline
  regeneration. CE10 advanced to `515dfe0` during this slice; its fixes and
  current main are now integrated by the conflict-resolution session above.
  GitHub Actions remain disabled.
  [Evidence](./pr-37-retained-draft-fix-results.json).

- **PR #37 base merge verified (2026-10-06):** isolated managed worktree
  from CE11 `4946e9d`, integrating current CE10 `6e0d108` without rewriting
  history. Both log histories and milestone/review behavior are preserved;
  a narrow save-diagnostics import restores native Vite configuration loading.
  Fast checks pass 1,559 unit tests; 46 runtime, 14 depth and seven affected
  browser groups pass, including exact 192-frame builder pixels and exports.
  The corrected integration aggregate has 156 passes and one watch timeout;
  all 13 tests in that file pass on unchanged standalone retry. Full `pnpm check`
  and frozen baselines were not rerun. Delivered as `00d5fba`; current main
  integration is recorded above. Owner review/merge remain pending. No blocker or
  owner checkout changes; Actions remain disabled.
  [Merge evidence](./pr-37-merge-results.json).

- **PR #37 follow-up fixes complete (2026-10-05):** reviewed `9b2247e` on
  `codex/composition-ce11`. Three additional P2 findings are posted inline.
  R8 selector focus, R9 neighboring smoothing and R10 fixture-export ownership
  are fixed in three separate finding commits. `check:fast` passes 1,534 unit tests;
  20 focused integration and 46 runtime tests pass, along with inspector desktop/phone/
  MP4, shared/legacy session and builder watch/export checks. Independent standards/spec
  review found no incomplete fixes or new defects. One final normal push delivers all
  three commits; owner review/merge remain. Full `pnpm check` was not rerun and baselines
  were not regenerated. Primary CE5 work is untouched; GitHub Actions remain disabled.
  [Follow-up evidence](./pr-37-followup-fix-results.json).

- **PR #37 review fixes complete (2026-10-05):** on `codex/composition-ce11`,
  reviewed `a0c56df`. Seven inline findings are fixed in seven separate commits;
  delivery is one final push. `check:fast` passes 1,514 unit tests; 18 focused
  integration and 46 runtime tests pass, along with inspector desktop/phone/MP4
  acceptance, native/legacy sessions and program watch/export checks. Independent
  standards/spec re-review found no new defects. Owner review/merge remain;
  no full `pnpm check` rerun or baseline regeneration is claimed. No Actions.
  [Fix evidence](./pr-37-fix-results.json).

- **CE11 complete (2026-10-05):** `codex/composition-ce11`, runtime `5f36268`.
  Native inspector, graph/handle edits, overlays, lossless history, guarded source
  saves and captured-asset exports pass desktop/phone and builder/watch acceptance.
  Full `pnpm check` passes: 1,510 unit, 46 runtime, 139 integration and 14 depth
  tests, all browser suites and 176 frozen baselines / 36,061 frames. Initial failures
  and repairs are retained. [PR #37](https://github.com/xxibcill/still-shift/pull/37) is open and attached; begin CE5 on a new branch. Native camera
  frusta and audio waveforms follow CE8/CE13. [Evidence](./composition-ce11-results.json).

- **PR #36 current-head fixes verified (2026-10-06):** isolated
  `codex/pr36-current-review-fixes` from `8be5fc7`; three findings posted inline.
  Exact style source paths (`1e97b29`), asset-read recovery (`e374d05`) and explicit
  anchor precedence are fixed one per commit. All 69 builder unit and 52 affected
  integration tests pass, with build, schema/guidance, boundaries, lint and formatting.
  Canvas/WebGL retain exact 192-frame parity, backward seeks and identical exports;
  browser watch retains pixels/frames and repairs edits without reloading.
  Delivery uses one final push. Full gate and unrelated baseline matrices were not
  rerun; owner review/merge remain pending. Actions remain disabled. No blocker.
  [Evidence](./pr-36-current-head-fix-results.json).

- **PR #36 conflict resolution verified (2026-10-06):** isolated CE10 worktree
  from `6e0d108`; initial merge `f39813f` integrates `91f9c54`, then refreshed
  base `ddaf9d2` adds current CE12/main expression, lint and soundtrack changes.
  Both histories, authoring/soundtrack APIs and test groups are retained. Watch
  previews keep valid pixels/frames and advisory lint; generated guidance and
  provider-fixture provenance remain current. Fast checks pass 1,740 unit tests,
  with 46 runtime, all 208 integration and 14 depth tests. Affected browser and
  hardware checks and all 176 baselines / 36,061 frames pass without regeneration.
  Full `pnpm check` was not rerun; occupied-port harness and earlier failures are
  recorded. Owner review/merge remain; Actions remain disabled. No blocker.
  [Evidence](./pr-36-conflict-resolution-results.json).

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
  is open and attached; owner review/merge remain. CE11 is complete; CE5 follows.
  [Evidence](./composition-ce10-results.json).

- **CE4a complete (2026-10-05):** `codex/composition-ce4a-completion`, implementation
  `876814f` from CE12 `0987396`. Adapted/native picture passages, story fractional
  shutter clocks and explicit narrative bindings are delivered. Full local checks,
  176 baselines / 36,061 frames, both 69-case family matrices / 14,086 frames and
  mixed 576-frame passages pass correctness. WebGL's 51 strict timing overruns stay
  deferred to CE6-P. CE10 is complete; broader CE7 stays open.
  [Evidence](./composition-ce4a-completion-results.json).

- **PR #34 lint fixes verified (2026-10-06):** three P2 findings on `f870fce`
  are posted inline and repaired one per commit: separated vector timing
  (`ea08b39`), shared velocity-budget accounting (`342115f`) and evaluated
  stagger onset including shot/cut boundaries. Fast checks pass 1,663 unit
  tests; 46 runtime, 16 CLI, browser quality and four targeted Node/Chromium
  comparisons pass. Corpus lint covers 176 items / 36,061 frames with zero
  unexpected failures; one false co-start warning is removed, with all other
  reports and baseline checksums unchanged. Delivery uses one final push;
  owner review/merge remains pending. Full `pnpm check` was not rerun.
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
  Prior local work retained; CE6-P and CE9-F1 remain deferred. CE4a and CE10 are complete.
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

_Last updated 2026-10-07 by Codex for PR #40 conflict repair; both histories retained._

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

### 2026-10-07 — PR #40 explicit loop overrides and final acceptance

- **Agent / branch:** Codex on `codex/pr40-clock-fixes` after first fix `3afebc9`.
- **Scope:** Second inline finding; lazy instance overrides retain raw remaps and source clamps.
- **Done:** Three red regressions repaired; evaluator identity advances to 33.
- **Results:** 101 focused tests, full fast gate / 1,914 units, 41 integrations,
  native exposure/expression/quality and 176 frozen items / 36,061 frames pass.
  Twelve hardware comparisons and repeated/independent exports retain all assertions.
  Held/posterized compatible pixels are exact across 144 observations; incompatible
  history is rejected. Both independent reviews and the code fingerprint pass.
- **Rejected / do not repeat:** Optional bare-native config loading hits an existing
  ElevenLabs parameter property; configured Vite loading passes. No unrelated repair.
- **Open / next:** One finding per commit and one final normal push; owner review/merge remain.
  Full `pnpm check`, Python/depth, serial profiles and strict timing matrices were not rerun.
- **Records:** [Fix evidence](./pr-40-clock-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/40#discussion_r4203762768).

### 2026-10-07 — PR #40 echo bake content-clock repair

- **Agent / branch:** Codex on `codex/pr40-clock-fixes` from `e907d16`.
- **Scope:** First of two inline clock-integration findings on PR #40.
- **Done:** Use the evaluator's content clock and owning FPS for historical blur dependencies.
- **Results:** Four regressions fail before repair; 98 focused tests, build, changed-file
  lint and package boundaries pass after it. Compatible echo graphs stay exact.
- **Open / next:** Fix explicit loop overrides separately, then final focused acceptance
  and one normal push to the existing PR. No full gate or baseline regeneration claimed.
- **Records:** [Fix evidence](./pr-40-clock-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/40#discussion_r4203762759).

### 2026-10-07 — Resolve PR #40 against current CE5

- **Agent / branch:** Codex on isolated `codex/pr40-conflict-repair`, from `48fe4cc`.
- **Done:** merge CE5 `d3093bd`; preserve both log histories, CE7 controls/cut fixes
  and upstream shape/expression/lint/inspector/soundtrack repairs; assign fresh cache
  identities and explicit cinematic error fields for native Node/Vite loading.
- **Results:** final fast checks pass 1,907 units; 46 runtime, 224 integration,
  14 depth and all 14 affected browser groups pass. All 176 frozen items / 36,061
  frames remain exact. CE7 hashes, analytic pixels, 12 hardware comparisons and
  repeated/independent/raw exports pass with unchanged source fingerprint.
- **Retained failure:** five Lab suites could not load externalized cinematic
  parameter properties; 35 existing regressions and the final aggregate pass after repair.
- **Open / next:** owner review/merge; normal publication targets existing PR #40.
  No full `pnpm check`, new cost profile or full timing-matrix run is claimed. Actions remain disabled.
- **Records:** [resolution evidence](./pr-40-conflict-resolution-results.json),
  [PR #40](https://github.com/xxibcill/still-shift/pull/40).

### 2026-10-06 — PR #40 reachable outgoing-state visibility correction

- **Agent / branch:** Codex on `codex/composition-ce7`, after `4c7266a`.
- **Done:** outgoing-state suppression samples the reachable posterized clock or
  baked index. Both findings have separate fixes and published inline PR comments.
- **Results:** all five new regressions failed before repair; 50 focused tests and
  independent review pass. Full `pnpm check` passes 1,605 unit, 46 runtime,
  139 integration, 14 depth, every required browser suite and 176 frozen baselines
  / 36,061 frames. Final-code native hashes, hardware and repeated exports pass.
- **Rejected / do not repeat:** cold Python worker imports caused three protocol
  timeouts on the first gate; warmed imports fixed the environment. The complete
  retry passed with unchanged default timeouts, thresholds and baselines.
- **Open / next:** owner review/merge. GitHub Actions remain disabled.
- **Records:** [fix evidence](./pr-40-fix-results.json).

### 2026-10-06 — PR #40 posterized cut boundary correction

- **Agent / branch:** Codex on `codex/composition-ce7`, from `817cc9f`.
- **Done:** posted both findings as inline PR comments; corrected cut inversion
  against the actual floored clock and bumped evaluator/backend identities.
- **Results:** three new regressions failed before repair; all 48 focused tests,
  build, changed-file lint and package boundaries now pass. Pinned toolchain passes
  with separate optimizer caches and a copied Python environment.
- **Open / next:** fix outgoing-state suppression in its own commit, then run final
  affected verification and push both commits together. No full gate claimed yet.
- **Records:** [fix evidence](./pr-40-fix-results.json),
  [PR review](https://github.com/xxibcill/still-shift/pull/40#pullrequestreview-5423806559).

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

### 2026-10-06 — Repair PR #38 scaled follow-path contours

- **Agent / branch:** Codex on isolated `codex/pr38-follow-path-fix`, from `eb17b1f`.
- **Done:** post the sole P2 finding inline; transform cubics before world-arc-length
  flattening using shared geometry budgets; advance evaluator and renderer identities.
- **Results:** both layer/ancestor-scale regressions fail before repair and pass after.
  Final fast checks pass 1,871 unit tests; native hashes/seeks, independent MP4/raw/PNG
  exports, inspector and 18 exact hardware comparisons pass. Evaluator Node/browser
  parity passes five fixtures × nine frames with numeric error below 6e-14.
- **Next:** one finding commit and one final normal push to PR #38; owner review/merge
  remain. No full gate/CE0 rerun, baseline regeneration or tolerance change. No blocker.
  Owner checkout changes are preserved; GitHub Actions remain disabled.
- **Records:** [Fix evidence](./pr-38-follow-path-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/38#discussion_r4193023747).

### 2026-10-06 — Resolve PR #38 against main

- **Agent / branch:** Codex in isolated `pr38-conflicts`, from CE5 `3d0da6a`.
- **Done:** merge main `bdf8f6a`; retain shape and soundtrack test aggregates,
  assign evaluator version 30 and preserve both development histories.
  Main expression, lint, inspector scope/focus and soundtrack fixes survive.
- **Results:** fast checks: 1,869 unit; 46 runtime, 65 affected integration,
  14 depth and ten browser groups pass. Shape hashes, 300 exact cap comparisons,
  18 exact hardware comparisons, independent exports and both 576-frame passages pass.
  Code and fixture fingerprints are unchanged throughout acceptance.
- **Next:** normal push to existing PR #38; owner review/merge remain. Full gate
  and frozen CE0 were not rerun; no baseline/tolerance changes. Actions stay disabled.
  Owner checkout edits remain untouched; isolated verification evidence is preserved.
- **Records:** [Main conflict evidence](./pr-38-main-conflict-resolution-results.json).

### 2026-10-06 — Repair PR #38 square-cap bounds and close both findings

- **Agent / branch:** Codex on isolated `codex/pr38-shape-review-fixes`.
- **Done:** retain square-cap tangent/normal coverage alongside miter coverage;
  add solid/gradient bounds, edge-culling and independent pixel regressions.
  Prior finding commit `335ff23` repairs smooth zig-zag; this is the second finding commit.
- **Results:** fast checks pass 1,623 unit tests; 65 focused shape tests and 300
  exact direct-Canvas comparisons cover both backends, all viewport edges, joins,
  color changes and reverse seeks. Final native hashes, exports, inspector and 18
  exact hardware comparisons pass. Independent standards/spec review is clear.
- **Retained failures:** pre-fix tests reproduce clipping/culling; initial browser
  oracles needed actual gradient paint and normal miter-limit coverage. Corrected
  test assumptions preserve exact pixels and low-limit geometry coverage.
- **Next:** deliver both finding commits with one normal push to PR #38; owner
  review/merge remain. No full `pnpm check` rerun or additional baseline regeneration.
  Primary checkout changes are untouched; GitHub Actions remain disabled.
- **Records:** [Fix evidence](./pr-38-fix-results.json), [inline review](https://github.com/xxibcill/still-shift/pull/38#pullrequestreview-5424533811).

### 2026-10-06 — Repair PR #38 smooth zig-zag sampling

- **Agent / branch:** Codex on isolated `codex/pr38-shape-review-fixes`, from `2b1c6e5`.
- **Done:** posted both review findings inline; preserve smooth zig-zag mode without
  overwriting animated polystar counts; add regressions and bump output identities.
- **Results:** fast checks pass all 1,620 unit tests; 62 focused shape tests and native shape acceptance pass,
  including inspector, independent/repeated transports and 18 exact hardware comparisons.
  Previous corner hashes reproduce exactly; every corrected reference pixel stays in
  cell 13. Source fixtures, animation/core and frozen CE0 baselines are unchanged.
- **Retained failure:** initial fast check linted a temporary review probe; moved
  probes outside the disposable verification snapshot. Production code was unaffected.
- **Next:** finish square-cap bounds in its own commit, then push both commits once.
  Full `pnpm check` was not rerun; GitHub Actions remain disabled.
- **Records:** [Fix evidence](./pr-38-fix-results.json), [inline review](https://github.com/xxibcill/still-shift/pull/38#pullrequestreview-5424533811).

### 2026-10-06 — Resolve CE5 PR #38 against the advancing CE11 base

- **Agent / branch:** Codex in isolated `pr38-ce5-conflicts`, targeting `codex/composition-ce5`.
- **Done:** first merge `f615017` integrates CE11 `4946e9d`; a second merge
  integrates advanced `00d5fba`. Both sides' log histories and feature fixes survive.
  Equivalent save imports resolve to the public lock entrypoint and narrow diagnostics.
- **Results:** final fast checks (1,618 unit), 46 runtime, 47 focused integration,
  14 depth, affected browser acceptance and all 176 frozen items / 36,061 frames pass.
  Native hashes, reverse seeks, 18 hardware comparisons and both-backend exports pass.
- **Retained failure:** initial integration config loading failed; broad save imports
  were narrowed. A temporary unrelated constructor probe was reverted. No full
  `pnpm check` rerun or baseline regeneration is claimed; Actions remain disabled.
- **Next:** owner review and merge of the existing PR; delivery uses a normal push.
- **Records:** [Resolution evidence](./pr-38-conflict-resolution-results.json),
  [CE5 acceptance](./composition-ce5-results.json), [CE11/CE10 merge evidence](./pr-37-merge-results.json).

### 2026-10-06 — PR #37 R15: Separate top-level and precomp scope identity

- **Agent / branch:** Codex on isolated `codex/pr37-inspector-fixes`, after R14 `22308f5`.
- **Done:** distinguish top-level scope from every authored precomp ID in keys,
  selection, markers, instance routes and overlays; preserve the unselected source
  layer when a nested root-named definition is edited and saved.
- **Results:** validated regression fails on `12bfc1d` and passes after repair;
  fast checks: 1,805 unit, 31 affected integration, 46 runtime and four browser
  groups pass. Inspector phone/desktop, captured MP4 parity and new focus/scope checks pass.
- **Repairs:** correct new fixture fps/snippet parsing and restore missing isolated
  CLI dependency links. Independent standards/spec review found no new issues.
- **Next:** one normal final push delivers all three finding commits. Owner
  review/merge remain; full gate/depth/baselines were not rerun. No Actions.
- **Records:** [Repair evidence](./pr-37-inspector-fix-results.json).

### 2026-10-06 — PR #37 R14: Respect focus moved during Bezier edits

- **Agent / branch:** Codex on isolated `codex/pr37-inspector-fixes`, after R13 `6f992bc`.
- **Done:** guard asynchronous SVG handle focus with original control and history
  ownership; preserve repeated arrow edits while respecting focus moved elsewhere.
- **Results:** paused-asset checkbox-focus assertion fails before repair and passes
  afterward; R13 focus checks remain passing. Build and affected lint pass.
- **Next:** R15 scope identity in its own commit, affected final checks, one push.
  Full gate/depth/baselines were not rerun. Owner checkout untouched; no Actions.
- **Records:** [Repair evidence](./pr-37-inspector-fix-results.json).

### 2026-10-06 — PR #37 R13: Preserve numeric Apply keyboard focus

- **Agent / branch:** Codex on isolated `codex/pr37-inspector-fixes` from `12bfc1d`.
- **Done:** post all three findings inline; restore graph Apply button focus
  after acceptance/rejection while respecting changed focus and source ownership.
- **Results:** new browser regression fails before repair and passes afterward;
  temporal/Bezier/spatial controls, repeated activation, rejection and moved-focus
  guards pass. Build, affected lint and pinned toolchain preflight pass.
- **Next:** R14 and R15 in separate commits, affected final checks, one final push.
  Full gate/depth/baselines were not rerun. Owner checkout untouched; no Actions.
- **Records:** [Repair evidence](./pr-37-inspector-fix-results.json).

### 2026-10-06 — Resolve PR #37 against main

- **Agent / branch:** Codex in isolated `pr37-conflicts`, from CE11 `7fac583`.
- **Done:** merge main `54782d7`; retain native inspector/draft/asset ownership,
  integrate advisory lint, preserve both test aggregates and development histories.
- **Results:** fast checks: 1,803 unit; 46 runtime, 60 affected integration and six
  browser groups pass. Final affected static checks pass after the watch-error guard.
  Builder 192-frame pixels/exports, inspector phone/desktop/MP4 and retained assets pass.
- **Repair:** generated-reference source drift and missing isolated soundtrack
  runtime are repaired; unchanged soundtrack retry passes exact PCM and passage mux.
- **Next:** normal push to PR #37; owner review/merge remain. Full gate and frozen
  baselines were not rerun or regenerated; Actions remain disabled. Owner checkout untouched.
- **Records:** [Conflict evidence](./pr-37-main-conflict-resolution-results.json).

### 2026-10-06 — PR #37 R12: Retain dirty-draft asset snapshots

- **Agent / branch:** Codex on isolated `codex/pr37-review-fixes`, after R11 `516422d`.
- **Done:** connection-owned captured assets survive recent-revision eviction;
  failed/replaced drafts and socket closure retire bounded leases. Native edits,
  history, renderer changes and export keep the accepted draft's original bytes.
- **Results:** fast checks: 1,563 unit; 29 affected integration, 46 runtime and four
  browser groups pass, including byte-identical retained-asset MP4 and cleanup.
  Independent standards/spec review found no new substantive findings.
- **Verification repair:** startup can reach revision 2; the new regression now
  captures its accepted revision instead of assuming 1. Combined acceptance passes.
- **Next:** one final normal push delivers both finding commits. CE10 advanced to
  `515dfe0`; integrating its new base conflicts is separate pending work. Owner
  review/merge remain. Full gate/depth/baselines not rerun; owner checkout untouched.
  No Actions.
- **Records:** [Repair evidence](./pr-37-retained-draft-fix-results.json).

### 2026-10-06 — PR #37 R11: Retain layer-control keyboard focus

- **Agent / branch:** Codex on isolated `codex/pr37-review-fixes` from `00d5fba`.
- **Done:** posted both findings inline; restore layer selection and visibility
  focus after staged acceptance/rejection without stealing another control's focus.
- **Results:** new regression fails before the repair; TypeScript and complete
  inspector desktop/phone/watch/save/MP4 acceptance pass with the new focus checks.
- **Next:** R12 in a separate commit, affected final checks, then one normal push.
  Owner checkout remains untouched; full gate/baselines were not rerun. No Actions.
- **Records:** [Repair evidence](./pr-37-retained-draft-fix-results.json).

### 2026-10-06 — Resolve PR #37 against current CE10

- **Agent / branch:** Codex in an isolated managed CE11 worktree from `4946e9d`.
- **Scope:** merge CE10 `6e0d108`, preserve both milestones and review fixes.
- **Done:** retain both conflicted log sections and narrow the save-diagnostics
  import that made the Lab config load an unrelated unsupported TypeScript class.
- **Results:** 1,559 unit, 46 runtime, 14 depth and seven browser groups pass.
  Corrected integration: 156 passes and one timeout; all 13 affected-file tests
  pass on unchanged retry. Original setup failures and Python warmup are recorded.
  Full `pnpm check` and frozen baselines were not rerun; no aggregate pass is claimed.
- **Delivery:** recheck current base/head, then commit and normally push only
  PR #37; GitHub mergeability is checked after delivery. Review/merge remain owner decisions.
- **Records:** [Merge evidence](./pr-37-merge-results.json),
  [CE11 acceptance](./composition-ce11-results.json).

### 2026-10-06 — Repair PR #36 current-head review findings

- **Agent / branch:** Codex on isolated `codex/pr36-current-review-fixes`, from `8be5fc7`.
- **Done:** post three inline findings; fix exact style call sites (`1e97b29`),
  successful image/font read recovery (`e374d05`) and explicit-anchor precedence.
- **Results:** regressions fail before their fixes; 69 builder unit and 52 affected
  integration tests pass, with build, generated schema/guidance, boundaries and lint.
  All 192 frames match exactly on Canvas/WebGL, including backward seeks; program/JSON
  exports are identical. Real watch retention, frame clamps and repairs pass.
- **Rejected / harness:** invalid style-ID assumptions and mixed generic test types
  are corrected. Watch verification uses unchanged assertions with an available port.
- **Open / next:** three finding commits, one final push; review/merge remain owner
  decisions. Full gate and unrelated baseline matrices not rerun; Actions disabled.
- **Records:** [fix evidence](./pr-36-current-head-fix-results.json),
  [PR #36](https://github.com/xxibcill/still-shift/pull/36).

### 2026-10-06 — Resolve PR #36 against the refreshed CE4a base

- **Agent / branch:** Codex in isolated `pr36-ce10-conflicts`, for `codex/composition-ce10`.
- **Done:** after verified merge `f39813f`, integrate refreshed base `ddaf9d2`.
  Retain authoring and soundtrack APIs/commands/tests, all log entries and maintained
  generator guidance. Combine transactional watch previews with advisory lint,
  clearing stale findings; a browser regression retains playback, frame and read-only state.
- **Results:** fast checks (1,740 unit), 46 runtime, all 208 integration, 14 depth,
  soundtrack Python and affected browser checks pass. Builder has exact 192-frame
  Canvas/WebGL parity and identical exports; both 576-frame native passages cover
  saved-audio mux/cache reuse. Hardware typography and all 176 frozen items /
  36,061 frames pass without regeneration. Final remote base still `ddaf9d2`.
- **Limits / next:** full `pnpm check`, standalone soundtrack-editor UI and deferred
  performance matrices were not rerun. Watch-browser assertions use an identical
  temporary copy with an available port; earlier failed attempts remain recorded.
  Normal push targets only the existing PR head; owner review/merge remain pending.
  GitHub Actions remain disabled; owner's checkout and other heads are untouched.
- **Records:** [resolution evidence](./pr-36-conflict-resolution-results.json),
  [PR #36](https://github.com/xxibcill/still-shift/pull/36).

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

### 2026-10-06 — Resolve PR #35 against current CE12

- **Agent / branch:** Codex in managed `pr35-ce4a-conflicts`, from PR head `91f9c54`.
- **Done:** merge the current remote CE12 base without rewriting history; retain
  both APIs, cache identities, pnpm test groups, guides and development histories.
- **Regression:** saved soundtracks preserve all native composition picture frames
  and reuse their picture clips on Canvas and WebGL while supplying audio.
- **Results:** 1,680 unit, 46 runtime and 14 depth checks pass. Frozen baselines
  match all 176 fixtures / 36,061 frames. The initial integration run has 174
  passes and two timeouts; failed cases pass on unchanged serial reruns, as do
  affected browser checks. Initial failures and log hashes are retained. Full `pnpm check` and deferred timing matrices were not rerun.
- **Delivery / next:** one merge commit to the existing head after checking both
  remote branches; verify GitHub mergeability after push. Owner review/merge
  remains pending; other checkouts are untouched.
- **Records:** [resolution evidence](./pr-35-conflict-resolution-results.json),
  [PR #35](https://github.com/xxibcill/still-shift/pull/35).

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

### 2026-10-05 — PR #37 R10: Guard fixture export asset reads

- **Agent / branch:** Codex on `codex/composition-ce11`; R8/R9 are `7d9f76c` /
  `290af0c`.
- **Done:** acquired export ownership before reading registered fixture assets
  and released it after staging/rendering failures as well as successful exports.
- **Results:** the paused-read race fails before the fix; 20 focused integration,
  1,534 unit and 46 runtime tests pass with static gates and all four selected browser
  groups. Both review axes found no new defects; the test import lint error is repaired.
- **Next:** one normal push after this third finding commit; owner review/merge remain.
- **Records:** [follow-up evidence](./pr-37-followup-fix-results.json).

### 2026-10-05 — PR #37 R9: Preserve neighboring Bézier motion

- **Agent / branch:** Codex on `codex/composition-ce11`; R8 is `7d9f76c`.
- **Done:** retained native smooth velocities on untouched neighboring segments
  when Bézier replaces the selected segment's smoothing; reference updated.
- **Results:** 20 new scalar/vector/color/spatial/signal regressions fail before
  the fix; all 35 curve/history tests, TypeScript and inspector acceptance pass.
- **Next:** R10 in its own commit, then final local checks and one push.
- **Records:** [follow-up evidence](./pr-37-followup-fix-results.json).

### 2026-10-05 — PR #37 R8: Preserve graph-selector focus

- **Agent / branch:** Codex on `codex/composition-ce11` from `9b2247e`.
- **Done:** posted all three follow-up inline findings; restored focus after key
  and resolved-instance selection rebuilds their native graph controls.
- **Results:** new focus regression fails before the fix; full inspector browser
  acceptance passes after it, including repeated selections and existing MP4 parity.
- **Next:** R9 and R10 in separate commits, then final local checks and one push.
- **Records:** [follow-up evidence](./pr-37-followup-fix-results.json).

### 2026-10-05 — PR #37 R7: Share curve sampling and speed calculation

- **Agent / branch:** Codex on `codex/composition-ce11`.
- **Done:** Share uniform curve sampling and clipped finite-difference speed calculation across authored and resolved graphs while retaining each callers sampling bounds.
- **Results:** All 15 focused curve/history tests pass, including exact authored/resolved agreement, linear boundary speeds, zero-duration ranges and the 512 sample cap. Final check:fast passes 1514 unit tests; 18 focused integration and 46 runtime tests pass; all four selected browser groups pass.
- **Next:** One final push; owner review and merge remain.
- **Records:** [Fix evidence](./pr-37-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/37#discussion_r4183168177).

### 2026-10-05 — PR #37 R6: Discover separated constraint-reference channels

- **Agent / branch:** Codex on `codex/composition-ce11`.
- **Done:** Discover separated x/y channels through one native vector-track path, including constraintReference, with scalar lanes, resolved graphs, edits and code copies.
- **Results:** Red: valid separated constraintReference returned no tracks. Green: all 10 key tests and inspector acceptance pass, including native reference path sampling, handle edits, code copy and history. TypeScript build passes.
- **Next:** R7.
- **Records:** [Fix evidence](./pr-37-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/37#discussion_r4183168168).

### 2026-10-05 — PR #37 R5: Clear stale copied code when selecting path keys

- **Agent / branch:** Codex on `codex/composition-ce11`.
- **Done:** Reset copy state on every graph selection, populate native path-key snippets before the numeric-graph early return, and disable copying when the source has no tracks.
- **Results:** Red: selecting masks[cutout].path retained transform.position code. Green: inspector acceptance passes path snippet selection and empty-source copy disabling alongside editing, watch, phone and MP4 parity checks.
- **Next:** R6, R7.
- **Records:** [Fix evidence](./pr-37-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/37#discussion_r4183168163).

### 2026-10-05 — PR #37 R4: Preserve the opposite side when editing a handle

- **Agent / branch:** Codex on `codex/composition-ce11`.
- **Done:** Keep shared smooth settings when replacing one temporal handle so the opposite segment retains its native motion.
- **Results:** Red: both smooth encodings changed untouched incoming values (frame 5: 2.5 to 5). Green: 13 curve/history tests pass with exact incoming/outgoing preservation, edited-side changes and undo/redo round trips.
- **Next:** R5, R6, R7.
- **Records:** [Fix evidence](./pr-37-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/37#discussion_r4183168155).

### 2026-10-05 — PR #37 R3: Preserve structured validation diagnostics

- **Agent / branch:** Codex on `codex/composition-ce11`.
- **Done:** Retain native validation and font diagnostics through the shared passage-diagnostics error model; save and both export APIs return JSON envelopes, and the Lab displays their property paths.
- **Results:** Red: save flattened two native range errors into one generic filename diagnostic. Green: all 7 save/API tests pass; invalid documents return the exact native diagnostics from save and both export endpoints. TypeScript build passes.
- **Next:** R4, R5, R6, R7.
- **Records:** [Fix evidence](./pr-37-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/37#discussion_r4183168142).

### 2026-10-05 — PR #37 R2: Restore focus after keyboard handle edits

- **Agent / branch:** Codex on `codex/composition-ce11`.
- **Done:** Restore the selected SVG handle focus after accepted keyboard edits; pointer edits retain their existing behavior.
- **Results:** Red: the repeated-keyboard browser test lost focus after its first adjustment. Green: inspector acceptance passes with consecutive horizontal and Shift vertical edits, undo, save, phone layout and native MP4 parity.
- **Next:** R3, R4, R5, R6, R7.
- **Records:** [Fix evidence](./pr-37-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/37#discussion_r4183168138).

### 2026-10-05 — PR #37 R1: Serialize saves across preview sessions

- **Agent / branch:** Codex on `codex/composition-ce11`.
- **Done:** Guard canonical JSON sources with the existing cross-process artifact lock across conflict checks and atomic replacement.
- **Results:** Red: helper saves both succeeded and independent preview returned 422. Green: all 6 save tests pass, including independent previews, repeated helper races and separate Node processes.
- **Next:** R2, R3, R4, R5, R6, R7.
- **Records:** [Fix evidence](./pr-37-fix-results.json), [inline finding](https://github.com/xxibcill/still-shift/pull/37#discussion_r4183168129).

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
