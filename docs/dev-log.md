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

- **CE15 in progress (2026-10-08):** `codex/composition-ce15` from completed CE13
  `aedfc9e`; transparent renderer checkpoint `49e0543` is pushed. Seven explicit
  BT709 output profiles now pass 44 production exports, 14 independent preview
  encodes, native alpha-depth checks, 2 CLI deliveries, 18 dimension cases and 16
  protected failures. PNG8/16 reimport, complete PCM, AAC/Opus clocks and sequence
  completion order pass. Build/lint, 39 focused units/runtime tests, 65 affected
  media/CLI tests and existing WebGL export/native-media browser regressions pass.
  Rejected implicit precision/tag/alpha conversions and H264 CRF18 are retained.
  Surface-store foundation `5b20c86` is pushed. The opt-in renderer integration
  passes 24 four-page cases / 1,248 exact frame comparisons, native byte/float
  transfer and 12 protected failures. Public/CLI parallel export now passes 111
  successful exports, eight native timing cases, 24 live failures and complete
  media/frame/audio parity; all worker counts, old format/legacy suites, 32 focused
  tests and build/lint/boundaries pass. New Canvas isolation and synchronous binary
  XHR remain rejected. Native preparation sources now pass 1,664 exact audit
  frames, 32 production exports / 256 decoded frames, 11 protected failures and 63
  focused tests plus original typography checks. Original-target roots and coverage
  now pass 2,912 exact audit frames, exhaustive byte/float storage, 14 root failures,
  207 production exports / 1,656 decoded frames and 24 live failures. Held outline
  clocks are repaired under strict count checks. Closed native prefixes now pass
  104 audit cases / 5,408 exact frames and 32 production exports / 256 decoded
  frames, with whole original batches and actual once-global native painting.
  Actual submission phase/type spans now pass 57 tests, the complete pixel audit,
  32 prefix exports and ten coverage/nested/original/cached exports. Mixed overhead
  retains its original membership. Complete FFmpeg command CPU and actual timer/
  encoder group reaping now pass 23 focused / 20 CLI tests, 56 baseline-parity
  exports / 448 frames and 24 protected live failures with observed process IDs.
  Shared runtime tints, real variable axes/corrections and both crossfade inputs
  now pass 100 focused / 67 typography tests, 120 audit cases / 6,496 exact frames
  and 64 public exports / 768 decoded frames with actual once-global native counts.
  Canvas ownership and bounded receive now pass 37 admission/cache/exposure,
  90 effect/pool and 67 typography tests; 132 audit cases / 7,248 exact frames,
  including twelve managed cases / 752 frames. Native detachment/pool/body failures
  release actual storage. All 64 public exports / 768 bodies/frames match the prior
  accepted checkpoint; glyph ratio 1.291824× remains under unchanged 1.5×.
  GPU storage admission now passes 54 admission/cache/exposure/depth and 119 focused
  tests; 144 audit cases / 8,000 frames include 24 managed cases / 1,504 comparisons.
  Native byte/float/depth/PNG storage and deletion checks, complete original WebGL,
  17 default depth timelines / 1,530 zero-delta frames and 64 public exports / 768
  prior-checkpoint-exact bodies/frames pass. Verified asset/font/media admission now
  passes 64 admission / 86 affected / 67 typography tests, the complete 144-case /
  8,000-frame audit, 15 native resource failures and all original provider, typography,
  media, illustrated and story commands. Managed cases load assets/fonts inside
  their scopes; borrowed faces, late cleanup and exact public body/frame parity pass.
  Glyph 1.383989× meets unchanged 1.5×. Native capture/upload admission now passes
  70 tests, the complete audit, six native complete-body oracles, twelve failure
  cases, original media/WebGL exports and 64 prior-exact public exports / 768 frames.
  Owned submission/source/root/surface metadata, cache checksums, WebGL keys/
  controls and vector/raster/framebuffer/readback/path/paint-bound/replay/recording
  group/command/mark/snapshot/call-input/controller/wrapper and device/native-surface/
  pool-key/array/pass/row-view/swap/dirty-set/cached-color/clip-intersection, device
  shader-source/program/uniform/diagnostic, paint batch/geometry/shader/uniform/input,
  Gaussian kernel/rescale/box/fallback, managed plan/sum-shader cache, particle/
  Canvas/WebGL region, effect-paint/replace, seven built-ins, depth mesh/texture/
  retained multisample/uniform/draw and PNG source/draw/coordinate metadata pass 456
  focused tests, complete audit, 22 moving/blurred and ten stationary native frames
  and 96 owned RPC snapshots. Actual depth draw layer/motion/asset/state/view/flag/
  binding/placement/function/input/uniform refs pre-admit, stay through consumers,
  then clear/detach. Three original traces/ten new tests, quota/partial/query/pass/
  restore/release/null/retry/unreturned-output cleanup pass. Sampling query payload/
  program/shader/renderer text/diagnostics remain pending. Native probes, WebGL/
  providers, 69 typography tests and 64 exports / 768 prior-exact bodies/frames
  pass; glyph 1.409524× meets unchanged 1.5 maximum.
  Recording/device/pool/shader/paint/provider/graph/font/checksum/pixel-view/ledger/
  Node metadata, production admission, aggregate memory, the actual
  two-minute speed proof and final full gate remain in
  flight. No owner decision blocks CE15 → CE14. CE5-X/Q9 and separate CE6-P remain
  pending. [Plan](./composition-ce15-plan.md),
  [format evidence](./composition-ce15-format-results.json).

- **CE13 complete; PR #48 delivered (2026-10-07):** `codex/composition-ce13`
  from CE4d `adf6cea`, verified `01fbca2`. Audited merged CE16 PR #33 is integrated.
  Native CFR video/sequences/audio, bounded SDR/PCM resources, waveforms/playback,
  matching exports and complete passage masters are delivered. Both backends pass
  96 exact reverse seeks / 480 playback observations with zero source-frame offset.
  Preview/export share verified FFmpeg frames; WebCodecs remains unadopted without
  equivalent parity proof. Complete pinned local `pnpm check` passes in 12825.81s:
  all 63 mandatory commands, 2,103 unit / 46 runtime / 247 integration / 14 depth tests,
  176 actual defaults and 176 frozen items / 36,061 frames; all four Canvas matrices
  pass unchanged 1.25× policy. All 141 prior visual files and tracked snapshot bytes
  remain exact. Three failed gates, the interrupted third attempt and loader/readiness repairs are retained.
  Canvas 1.45 / WebGL2 0.66 / evaluator 53 / mixer 2 / export 0.6.7 remain current.
  [PR #48](https://github.com/xxibcill/still-shift/pull/48) is open and attached against CE4d PR #47.
  Continue CE15 → CE14 on new branches. No gate remains active. CE5-X/Q9 and
  separate CE6-P remain pending. [Evidence](./composition-ce13-results.json).

- **CE4d complete (2026-10-07):**
  `codex/composition-ce4d` from CE4c `17666eb`. Native production defaults and old
  painter retirement are complete. Its closeout used Canvas 1.44 / WebGL2 0.65 /
  image-plane shader 0.4 / depth adapter 0.1 / pipeline 0.13. Immutable `ae2e1f0` passes
  complete pinned local `pnpm check` in 11705.18 seconds: 2,005 unit / 46 runtime /
  143 integration / 14 Python tests, all 61 required commands, all browser gates,
  all 176 actual family defaults and 176 frozen items / 36,061 frames. Four Canvas
  family matrices pass their unchanged 1.25× policy; all 141 prior visual files
  remain exact. Independent/repeated/raw exports, depth/legacy delivery, hardware,
  Lab pending seeks, cache relocation and fresh zipper QA pass. Both prior failed
  gates and rejected diagnostics remain in the [evidence](./composition-ce4d-results.json).
  [PR #47](https://github.com/xxibcill/still-shift/pull/47) is open and attached against CE4c.
  CE13 and its CE16 integration are complete; continue CE15 → CE14.
  CE5-X/Q9 remains pending; CE6-P retains WebGL timing work. No verification job
  remains active and no owner decision blocks the approved order.
  [Continuation](./composition-continuation-handoff-2026-10-07.md).

- **CE4c complete (2026-10-06):** `codex/composition-ce4c` from
  CE8-L `e1bd4bc`; final runtime `37cc07a`, verified snapshot `e1fb3e3`.
  Native camera framing, depth planes, Gaussian focus, decoded-alpha safety and
  shared effects pass all 46 backend cases / 5,520 forward and reverse frames,
  46 independent preview encodes, 138 production exports, 138 actual hardware
  comparisons and real inspector edits/undo/reload. Complete pinned `pnpm check`
  passes 1,938 unit / 46 runtime / 140 integration / 14 depth tests, all required
  browser groups and all 176 frozen CE0 items / 36,061 frames. The four Canvas
  family matrices pass the unchanged pixel and 1.25 timing policies; all tracked
  visual references remain unchanged. Earlier failures and diagnostics remain in
  the [evidence](./composition-ce4c-results.json). WebGL speed targets remain CE6-P.
  [PR #45](https://github.com/xxibcill/still-shift/pull/45) is open and attached against CE8-L.
  CE4d is complete in open/attached PR #47; CE13 follows.
  Separate cross-chat coordination authorization remains pending.

- **CE8-L complete (2026-10-06):** `codex/composition-ce8-lighting` from CE8
  `9d8f33a`; final code `d72ba2c`, verified checkpoint `3820c1c`. Bounded ambient,
  point and spot lighting, scoped pure evaluation, linear GPU shading, cache/Canvas
  preflight, builder and inspector controls are delivered. Complete pinned local
  `pnpm check` passes 1,889 unit / 46 runtime / 139 integration / 14 depth tests,
  all required browser groups, 176 frozen CE0 items / 36,061 frames and unchanged
  Canvas family matrices. All 141 committed visual files remain exact; 46 lighting
  files are new and all 95 preexisting files are unchanged. Native correctness,
  alpha, seeks, repeat/independent exports, hardware and real inspector pass.
  Serial 1080p costs are recorded. Earlier oracle/inspector failures and the first full-gate timing failure remain
  in the evidence. Serial profiles passed; the complete gate was rerun from the
  start under unchanged assertions. No source output or tolerance was changed.
  [PR #44](https://github.com/xxibcill/still-shift/pull/44) is open and attached against CE8.
  CE6-P/CE8-L-F
  remain separate future work. No owner decision is pending.
  [Evidence](./composition-ce8-lighting-results.json).

- **CE8 complete (2026-10-06):** `codex/composition-ce8` from CE6 `2f1a99c`,
  final code `16262ec`. Scoped cameras, XYZ transforms, projective planes,
  stable depth, focus blur, actual coverage and real inspector frusta are delivered.
  Full pinned `pnpm check` passes 1,841 unit / 46 runtime / 139 integration /
  14 depth tests, all required browser groups and 176 frozen baselines / 36,061
  frames. Full Canvas family matrices pass unchanged pixel/timing policy.
  Final-code native correctness, exports, seeking and hardware checks pass;
  serial 1080p costs are refreshed. Earlier failures remain in the evidence.
  [PR #43](https://github.com/xxibcill/still-shift/pull/43) is open and attached against CE6; CE8-L follows.
  CE6-P targets remain separate.
  No owner decision is pending. [Evidence](./composition-ce8-results.json).

- **CE6 complete (2026-10-06):** `codex/composition-ce6-completion` from
  CE7 `817cc9f`; runtime `4cd8a8d`, final code/test checkpoint `f11a7b7`.
  All 39 native effects, GPU filtering, scoped inputs/history and optional linear
  blending are delivered. Complete `pnpm check` passes 1,712 unit, 46 runtime,
  139 integration, 14 depth tests, all browser groups and 176 frozen baselines /
  36,061 frames; all three full Canvas family matrices pass unchanged policy.
  Native software/hash/seek/independent and repeated exports pass; 36 hardware
  comparisons pass their perceptual policy, and all 78 serial 1080p costs are recorded.
  [PR #42](https://github.com/xxibcill/still-shift/pull/42) is open and attached against CE7; CE8 follows on a new branch.
  CE6-P targets remain separate; no owner decision is pending.
  [Evidence](./composition-ce6-completion-results.json).

- **Verification quiet window released (2026-10-06):** CE6-P's timed brackets,
  unchanged strict family audits, required exports and CE7 byte comparisons are
  terminal. Explicit release at 01:24 UTC permits planned CE8 verification.
  No checkout, policy or frozen baseline is changed by this coordination.

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
  frusta are complete in CE8; audio waveforms follow CE13. [Evidence](./composition-ce11-results.json).

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

_Last updated 2026-10-06 by Codex for CE4c closeout; prior work retained._

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

### 2026-10-08 — CE15 actual depth draw metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `6db615c`.
- **Done:** pre-admit actual layer/motion/asset/state/view/flag/binding/placement/
  function/input/uniform data, retain through consumers, clear/detach afterward;
  preserve borrowed input, original native order and first-null/retry.
- **Results:** build/lint/boundaries, 456 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.409524× meets unchanged 1.5 maximum.
- **Verification:** ten new tests/three whole original prepared-program traces,
  partial query/flag/binding/pass/restoration/release/null/retry, snapshot detachment
  and unreturned-output cleanup. Type/lint failures retained. No full gate.
- **Next:** class/caller, sampling query payload, depth program/shader/renderer text/
  diagnostics, effects/provider/graph/font/common/registry/ledger/Node, CE15, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [depth draw evidence](./composition-ce15-depth-draw-metadata-results.json).

### 2026-10-08 — CE15 actual depth uniform cache data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `e937529`.
- **Done:** pre-admit actual location/entry Maps/header and native/name/entry/slot
  references; retain through cache/scratch, clear on retirement; preserve original
  native identity/query order/null hits and constructor/query/insert/null/retry.
- **Results:** build/lint/boundaries, 446 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.425466× meets unchanged 1.5 maximum.
- **Verification:** ten new tests/original six lookup sequence, pre-native quota,
  scope-exit/allocator-first/foreign guard and earlier-header constructor cleanup.
  Focused texture/MSAA quotas include actual new header; pixel checks unchanged.
- **Next:** sampling query payload, class/caller, depth program/renderer text/draw,
  effects/provider/graph/font/common/registry/ledger/Node, CE15 final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [uniform evidence](./composition-ce15-depth-uniform-metadata-results.json).

### 2026-10-08 — CE15 actual retained depth multisample controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `311c4cf`.
- **Done:** pre-admit actual multisample record/native controls, retain through
  scratch/reuse, clear actual native/dimension/allocator refs on resize/disposal;
  preserve native order, MSAA pixels, source-first-null, partial/null/retry.
- **Results:** build/lint/boundaries, 436 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.426357× meets unchanged 1.5 maximum.
- **Verification:** eleven new tests/one whole original 20-call trace; record quota,
  native partial/storage/status/resize/null/retry, scope-exit/allocator-first native
  once-only release, early color retirement and foreign guard. No full gate.
- **Next:** sampling query backing/Array.from payload, class/caller, depth program/
  locations/renderer text/draw, effects/provider/graph/font/common/ledger/Node, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [multisample evidence](./composition-ce15-depth-multisample-metadata-results.json).

### 2026-10-08 — CE15 actual depth texture cache data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `0b9fc54`.
- **Done:** pre-admit actual texture cache Maps/state, template key/entry/slots/
  native references; retain through original cache, clear on retirement; preserve
  64-entry/128 MiB budgets, upload flags, LRU/native identity and original null/retry.
- **Results:** build/lint/boundaries, 425 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.392188× meets unchanged 1.5 maximum.
- **Verification:** fourteen new tests/one whole original 24-call trace; cache/
  byte-budget eviction, partial insert/upload/null/retry, scope-exit/allocator-first
  native once-only release and foreign guard. Two fixture type failures retained.
- **Next:** class/caller factories, dedicated depth program/locations/renderer
  text/multisample/draw state, effects/provider/graph/font/common/ledger/Node, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [depth texture evidence](./composition-ce15-depth-texture-metadata-results.json).

### 2026-10-08 — CE15 actual PNG draw and coordinate data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `960a433`.
- **Done:** pre-admit actual placement/input/uniform/vector data and retained
  coordinate record/native/view; clear actual references after consumers/disposal,
  preserve whole uploads, borrowed input, resize/reuse and original null/retry.
- **Results:** build/lint/boundaries, 411 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.328205× meets unchanged 1.5 maximum.
- **Verification:** eleven new tests/three whole original traces; real native
  texture/backing once in both disposal orders, scope-exit detach, partial/null/
  resize/retry, setup/pass cleanup and foreign guard. No full gate.
- **Next:** class/caller factories, dedicated depth/controller/cache/state,
  effects/provider/graph/font/common helper/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [PNG draw evidence](./composition-ce15-png-draw-metadata-results.json).

### 2026-10-08 — CE15 actual PNG source cache data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `3a90483`.
- **Done:** pre-admit actual source cache Maps/Set/header, tuple/JSON key text,
  entry slots/edge/native refs; retain through original cache/consumers, clear on
  retirement; preserve LRU/reject policy, borrowed input and original null/retry.
- **Results:** build/lint/boundaries, 400 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.376184× meets unchanged 1.5 maximum.
- **Verification:** sixteen new tests/two whole original traces; 1024-entry reject/
  source byte/LRU eviction, border detachment, partial/null/retry, constructor and
  actual device/allocator-first once-only release; foreign cache guard. No full gate.
- **Next:** PNG draw/placement/coordinate controls, dedicated depth/controller/cache/
  state, provider/graph/font/common helper/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [PNG source evidence](./composition-ce15-png-source-metadata-results.json).

### 2026-10-08 — CE15 actual depth mesh data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `cc42056`.
- **Done:** pre-admit actual grid/set/triangle/view controls and returned records;
  retain through original copies/native upload, clear refs, release partial backing
  storage and preserve original null/retry and borrowed input data.
- **Results:** build/lint/boundaries, 384 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.432392× meets unchanged 1.5 maximum.
- **Verification:** nine new tests/four complete original buffer hashes; quota/
  consumer/null/partial/retry/scratch/allocator. Typed-spy/scratch API repaired.
  Second-pixel fixture metadata 8→4096 preserves original 200000-pixel failure.
  Glyph 1.52× failure retained; only affected timing retried at unchanged threshold.
- **Next:** dedicated depth program/controller/cache/state, PNG/controllers/plugins/
  provider/graph/font/common helper/registry/ledger/Node, production/full CE15, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [mesh evidence](./composition-ce15-depth-grid-metadata-results.json).

### 2026-10-08 — CE15 actual built-in effect data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `dd4ec7b`.
- **Done:** pre-admit radial/particle/grain/sweep/directional/sine/glow arrays,
  records/text/matrices/points/gradient/callback/native references; hold through
  original consumers, clear owned data, preserve borrowed values and null/retry.
- **Results:** build/lint/boundaries, 375 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.395534× meets unchanged 1.5 maximum.
- **Verification:** thirteen new tests/fifteen whole original traces; producer/
  matrix quotas/lifetimes/sine detachment/grain/glow/partial/null/retry. Strict
  fixture type/double-spy failures retained; policies unchanged; no full gate.
- **Next:** plugin/effect controllers/images/depth/provider/graph/font/checksum/
  common helper/registry/ledger/Node, production/full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [built-in evidence](./composition-ce15-builtins-metadata-results.json).

### 2026-10-08 — CE15 actual effect paint and replace data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `ebeb0f7`.
- **Done:** pre-admit paint default shader, fresh input/uniform/upload-bound data
  and native references; replace output/default controls; preserve original native
  consumers, borrowed values, undefined defaults, arity and null cleanup/retry.
- **Results:** build/lint/boundaries, 362 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.400636× meets unchanged 1.5 maximum.
- **Verification:** eleven new tests/four whole original traces; quotas/lifetimes/
  native partial/secondary/null/retry. Private test path omission repaired; first
  attempt retained as incomplete. No acceptance policy changed; no full gate.
- **Next:** caller effects/images/depth/controllers/provider/graph/font/common
  helper/registry/ledger/Node, production/full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [effect-paint evidence](./composition-ce15-effect-paint-metadata-results.json).

### 2026-10-08 — CE15 actual particle and region data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `6c2f611`.
- **Done:** pre-admit actual seeded particle arrays/objects/setup and Canvas/
  WebGL region/union/splice/list/native references; hold through original consumers,
  clear and preserve original random/getter/draw/native/null cleanup behavior.
- **Results:** build/lint/boundaries, 351 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.468647× meets unchanged 1.5 maximum.
- **Verification:** thirteen new tests, six original geometry/Canvas traces and
  three whole WebGL traces; quotas/getters/lifetimes/merge/null/retry/cleanup.
  Unused test bindings repaired and failed attempt retained; no policy changes.
- **Next:** caller CSS/effect data and remaining effects/image/depth/controller/
  provider/graph/font/common helper/registry/ledger/Node, production/full CE15, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [particle evidence](./composition-ce15-particles-metadata-results.json).

### 2026-10-08 — CE15 actual Gaussian fallback data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `6a9e0ce`.
- **Done:** pre-admit actual fallback weight part/flat-map arrays, Float32 view,
  generated shader/vectors/uniforms/inputs/native references; hold through original
  consumers, clear and release every native intermediate, preserve original null.
- **Results:** build/lint/boundaries, 338 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.430645× meets unchanged 1.5 maximum.
- **Verification:** nine new tests; complete sigma 2/16 original traces and Float32
  bytes, actual copy/view lifetimes, pre-producer quotas, partial/constructor/pass/
  first-null/all-owner cleanup/retry and early/unmanaged behavior. No policy changes.
- **Next:** remaining effects/image/depth/controller/provider/graph/font and common
  helper/registry/ledger/Node admission, production/speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [fallback evidence](./composition-ce15-gaussian-fallback-metadata-results.json).

### 2026-10-08 — CE15 actual managed box/shader caches

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `544abbf`.
- **Done:** pre-admit actual managed cache Maps/slots, plan predecessors/views/
  selected returned steps and specialized shader key/text/arrays. Retain original
  cache data across scratch; clear at original device/preview or helper allocator
  disposal and protect fill/late insert/null.
- **Results:** build/lint/boundaries, 329 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, prior native traces/probes,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.418941× meets unchanged 1.5 maximum.
- **Verification:** sixteen new tests; original 5768 steps through length 1500,
  all 27 complete shader bodies, quota/lifetime/allocator/reuse/null/retry/cleanup.
  Receiver/record types/tie fixture repaired; rejected allocator-only native cache
  lifetime retained, original preview/device cleanup repaired and independently checked.
- **Next:** common bootstrap/registry/ledger controls and remaining effect/image/
  depth/controller/provider/graph/font/Node admission, speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [cache evidence](./composition-ce15-box-cache-metadata-results.json).

### 2026-10-08 — CE15 actual box-blur pass data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `c744384`.
- **Done:** pre-admit actual box-blur geometry/vector/uniform/input/reference data;
  hold through original consumers, clear afterward and visit every native owner
  despite first failure, preserving original null and successful native/math order.
- **Results:** build/lint/boundaries, 313 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, prior native frames/probes,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.419672× meets unchanged 1.5 maximum.
- **Verification:** eight new regressions, two original full native-call hashes,
  pre-producer quotas, lifetimes, getter/partial/pass/null/all-owner cleanup/retry.
  Type/precision fixtures repaired; glyph timing 1.52× retained, affected rerun
  passes unchanged 1.5× policy.
- **Next:** global box-plan/sum-shader caches and remaining effect/image/depth/
  controller/helper/runtime/Node controls, production/speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [box evidence](./composition-ce15-box-metadata-results.json).

### 2026-10-08 — CE15 actual Gaussian kernel/rescale data

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `ae1cbf9`.
- **Done:** pre-admit actual Gaussian kernel/length/scale arrays and rescale
  vectors/uniforms/inputs/native reference lists; clear after original consumers,
  retain original numerical/shader/native order and protect null/all-owner cleanup.
- **Results:** build/lint/boundaries, 305 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, prior native frames/probes,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.433007× meets unchanged 1.5 maximum.
- **Verification:** nine new and seven existing blur/box tests; original full
  kernel hashes and rescale native trace, pre-producer quotas, actual lifetimes,
  NaN/empty/unmanaged/null/secondary cleanup/retry pass without threshold changes.
- **Next:** remaining box-plan/global shader/effect/image/depth/controller/helper/
  runtime/Node controls, production/aggregate admission, speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [blur evidence](./composition-ce15-blur-metadata-results.json).

### 2026-10-08 — CE15 actual paint batch/input controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `201449e`.
- **Done:** pre-admit actual filter/batch/geometry/shader/uniform/input data,
  hold through original consumers, then clear generated references; preserve
  original shader hashes, numeric/native ordering and borrowed parts/rectangles.
- **Results:** build/lint/boundaries, 289 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, prior native frames/probes,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.430645× meets unchanged 1.5 maximum.
- **Verification:** nine regressions cover original full shader hashes/15+1
  batches, pre-factory denial, actual array lifetimes, numeric/blend/screen/empty
  paths and original null/secondary cleanup/getter/output/retry behavior.
- **Next:** remaining effect/other shader/cache/controller/helper/runtime/Node
  controls, production/aggregate admission, actual speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [paint evidence](./composition-ce15-paint-metadata-results.json).

### 2026-10-08 — CE15 actual device shader/program controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `f02068d`.
- **Done:** pre-admit actual device shader text/native controls/uniform Map/cache
  and diagnostic Error lifetime; preserve original successful text/native/cache
  behavior, clean incomplete actual handles and preserve original null/retry.
- **Results:** build/lint/boundaries, 280 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, prior native frames/snapshots,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.446429× meets unchanged 1.5 maximum.
- **Verification:** 13 regressions plus real four-frame/64-byte shader oracle,
  two protected native compile failures, no denied log query, original cache reuse
  and both disposal orders. Pixel fixtures permit 128KiB shader metadata; original
  pixel/native-byte and explicit metadata-denial checks stay. Failed attempts kept.
- **Next:** remaining paint/other shader/helper/runtime/Node controls, production/
  aggregate admission, actual speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [shader/program evidence](./composition-ce15-program-metadata-results.json).

### 2026-10-08 — CE15 actual frame clip-intersection controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `fc7999a`.
- **Done:** admit actual frame holder/Set and original clip boxes before getters/
  math; retain through original consumers/scratch, then clear at frame reset or
  final disposal. Borrowed aliases and original null/getter/native behavior stay.
- **Results:** build/lint/boundaries, 267 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native frames/snapshots,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.430669× meets unchanged 1.5 maximum.
- **Verification:** seven regressions cover pre-getter quota, aliases/order,
  actual distinct boxes, empty/null rollback and scratch/frame/scope/allocator
  lifetime; compile1 lint finding repaired and compile2 accepted.
- **Next:** remaining shader/helper/runtime/Node controls, production/aggregate
  admission, actual speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [clip evidence](./composition-ce15-clip-metadata-results.json).

### 2026-10-08 — CE15 actual cached screen-clear color controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `4f74360`.
- **Done:** admit original working color arrays/result, retain actual cached color/
  region across scratch, clear actual references at invalidation/disposal/failure;
  preserve original native/numeric/predicate/callback order and wrapper names.
- **Results:** build/lint/boundaries, 260 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native frames/snapshots,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.417886× meets unchanged 1.5 maximum.
- **Verification:** exact original bytes/predicate, actual working/prior/cached
  reference cleanup, quota/null retry, scratch/scope/allocator and failed native
  callback lifetimes pass; original empty wrapper name asserted permanently.
- **Next:** remaining device/shader/helper/runtime/Node controls, production/
  aggregate admission, actual speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [cached-color evidence](./composition-ce15-solid-metadata-results.json).

### 2026-10-08 — CE15 original dirty-screen Set capacity

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `d4a41d9`.
- **Done:** admit dirty Set capacity before original adds, reuse maximum live slots
  through native resolution, preserve original order and correct partial Surface
  rollback while removing actual failed references.
- **Results:** build/lint/boundaries, 254 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native frames/snapshots,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.460133× meets unchanged 1.5 maximum.
- **Repair:** first build caught missing local declaration; complete declaration/
  cleanup and fifth late-registration regression precede passing compile2. Failed
  attempt retained. Original null failures/native cleanup/retry and slot reuse pass.
- **Next:** remaining device/shader/helper/runtime/Node controls, production/
  aggregate admission, actual speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [dirty-set evidence](./composition-ce15-dirty-metadata-results.json).

### 2026-10-08 — CE15 GPU readback row views and swap tuples

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `c648f28`.
- **Done:** admit actual original subarray views and native-handle tuple arrays
  before producers, retain through original consumers, then clear references;
  preserve native pixels/read/assignment/cleanup order and prior backing owners.
- **Results:** build/lint/boundaries, 249 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native frames/snapshots,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.424242× meets unchanged 1.5 maximum.
- **Verification:** protected quota precedes subarray/handle getters; exact top-down/
  native bytes, pixel peak, null failures/retry and actual exchanged cleanup pass.
- **Next:** remaining device/shader/helper/runtime/Node controls, production/
  aggregate admission, actual speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [view/swap evidence](./composition-ce15-device-views-metadata-results.json).

### 2026-10-08 — CE15 original GPU pass temporaries

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `6edb907`.
- **Done:** admit original pass input Set/sampler temporaries and actual uniform
  tuples/outer arrays before production, retain through native GPU consumers,
  then clear actual references while preserving borrowed inputs and native order.
- **Results:** build/lint/boundaries, 243 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native frames/snapshots,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.384375× meets unchanged 1.5 maximum.
- **Verification:** original getter executes once; actual Set/tuple arrays stay live
  through native draw, then clear. Null getter/draw/scissor/completion checks pass.
- **Next:** remaining device/shader/helper/runtime/Node controls, production/
  aggregate admission, actual speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [pass evidence](./composition-ce15-pass-metadata-results.json).

### 2026-10-08 — CE15 original GPU pool keys and arrays

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `6ccd94c`.
- **Done:** admit original key template, canonical entry/array and maximum actual
  live slots before producers; retain across scratch/native reuse, clear actual
  key/list references at disposal. Original sixteen-surface/pixel-byte caps stay.
- **Results:** build/lint/boundaries, 238 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native frames/snapshots,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.427885× meets unchanged 1.5 maximum.
- **Verification:** protected slot denial precedes push and preserves owners/retry;
  canonical key/list/capacity stays stable on reuse; scope/allocator cleanup passes.
- **Next:** shader/program/dirty/solid/clip/pass/read/swap metadata, helper and
  remaining runtime/Node controls, production/aggregate admission, speed/gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [pool evidence](./composition-ce15-pool-metadata-results.json).

### 2026-10-08 — CE15 WebGL device and native surface controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `0b73555`.
- **Done:** admit actual device containers/context-options/VAO and Surface/framebuffer
  controls before producers; retain across scratch and native pool reuse and clear actual owners
  after scope/allocator exit. Native cleanup visits all handles over null failures.
- **Results:** build/lint/boundaries, 232 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native frames/snapshots,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.384365× meets unchanged 1.5 maximum.
- **Review repair:** protect incomplete texture/framebuffer cleanup so secondary
  destructor failure cannot hide original null or prevent framebuffer release;
  tenth regression; first native audit then caught scratch-owned controls deleting
  retained texture. Explicitly retain device/Surface controls, add eleventh scratch
  regression and pass compile3/native2. Failed audit retained.
- **Next:** dynamic pool/shader/dirty/solid/clip/pass/read/swap metadata, helper and
  remaining runtime/Node controls, production/aggregate admission, speed/gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [device evidence](./composition-ce15-device-metadata-results.json).

### 2026-10-08 — CE15 recording controller and method wrappers

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `3d94d35`.
- **Done:** admit selected Proxy/handler/controller closures and each original fresh
  method wrapper; retain capacity through disposal. Late controller failure unwinds
  prior native save/path/bounds/groups/state while preserving original errors.
- **Results:** build/lint/boundaries, 221 focused / 69 typography tests; final full
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native frames/snapshots,
  original WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.424679× meets unchanged 1.5 maximum.
- **Repair:** first native snapshot fixture omitted its new failed-call wrapper
  from prior-owner baseline; capture actual wrapper before baseline, then retain
  original pixel-quota/native failure checks. Failed attempt retained.
- **Next:** query/helper and remaining runtime/Node controls, production/aggregate
  admission, speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [controller evidence](./composition-ce15-recording-controls-metadata-results.json).

### 2026-10-08 — CE15 method call-input admission

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `3158c32`.
- **Done:** admit actual copied dense call arrays before Array.from and method-name
  conversion, retain through original consumers, then clear and release in finally.
- **Results:** build/lint/boundaries, 215 focused / 69 typography tests; full 144-case
  audit / 8,000 comparisons, 96 RPC snapshots, native frames/snapshots, original
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass. Glyph
  1.413681× meets unchanged 1.5 maximum.
- **Repair:** document local rest-parameter lint exception and remove unused fixture
  import before final compile3. Original detached/nonconstructible/query/native
  behavior and original null failures pass; earlier failed attempts retained.
- **Next:** wrapper/Proxy/controller/helper/query-result and remaining runtime/Node
  controls, production/aggregate admission, speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [call-input evidence](./composition-ce15-call-arguments-metadata-results.json).

### 2026-10-08 — CE15 recording command/mark/snapshot metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `082e38a`.
- **Done:** admit actual command/mark/painted/snapshot controls and original clones,
  retain through consumers, clear owned references and release captured native Canvas.
- **Results:** build/lint/boundaries, 210 focused / 69 typography tests; native 3,072
  exact RGBA bytes, two real snapshots, scope/allocator cleanup and one quota failure;
  144 audit cases / 8,000 comparisons, 96 RPC snapshots, 22 moving/blurred and ten
  stationary native frames, WebGL/providers and 64 prior-exact exports / 768 bodies/
  frames pass. Glyph 1.416804× meets unchanged 1.5 maximum.
- **Repair:** first run's updated result quota allowed production; restored the
  intended one-byte denial before final checks. Original clone/native order stays.
- **Next:** Proxy/rest-call/wrapper/controller/common helper and remaining runtime/
  Node controls, production/aggregate admission, speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [recording evidence](./composition-ce15-recording-metadata-results.json).

### 2026-10-08 — CE15 recording-group result metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `ce72950`.
- **Done:** admit original group arrays/rows/selected Sets/union/shadow data before
  producers, retain through replay/upload and clear every actual result at disposal.
- **Results:** build/lint/boundaries, 202 focused / 69 typography tests; 144 audit
  cases / 8,000 comparisons, 96 RPC snapshots, 22 moving/blurred and ten stationary
  native frames; WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.495784× meets unchanged 1.5; six meaningful group regressions pass.
- **Repairs:** removed unused copied fixture type/counter after first lint failure;
  shared shadow Set/bounds, original group/native order and null failures remain.
- **Next:** recording commands/marks/arguments/clones/Proxy/snapshots and remaining
  runtime/Node controls, production/aggregate admission, speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [group evidence](./composition-ce15-groups-metadata-results.json).

### 2026-10-08 — CE15 retained paint bounds and replay matrices

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `13482c9`.
- **Done:** admit actual paint geometry/result rectangles, filter copies and replay
  matrices before producers, retain through consumers and clear actual references.
- **Results:** build/lint/boundaries, 196 focused / 69 typography tests; 144 audit
  cases / 8,000 comparisons, 96 RPC snapshots, 22 moving/blurred and ten stationary
  native frames; WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.486755× meets unchanged 1.5; eight new metadata/native-consumer tests pass.
- **Review:** original text/filter/shadow/matrix/callbacks remain; affected checks
  reran after actual unmanaged Set cleanup. Recording/group/clone controls pending.
- **Next:** remaining recording/device/pool/shader/paint/provider/graph/font/helper/
  ledger/Node controls, production/aggregate admission, speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [paint-bound evidence](./composition-ce15-paint-bounds-metadata-results.json).

### 2026-10-08 — CE15 path geometry metadata and recording setup cleanup

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `970ab69`.
- **Done:** admit actual path state, original tuples/native matrix/point/bounds
  consumers and release path/existing raster scratch after recording setup failure.
- **Results:** build/lint/boundaries, 188 focused / 69 typography tests; 144 audit
  cases / 8,000 comparisons, 96 RPC snapshots, 22 moving/blurred and ten stationary
  native frames; WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.417476× meets unchanged 1.5. Seven path/cleanup regressions pass.
- **Repairs:** first compile found closure narrowing and missing fixture transforms;
  repaired before final checks. Original native math/callback/partial order remains.
- **Next:** remaining recording/device/pool/shader/paint/provider/graph/font/helper/
  ledger/Node controls, production/aggregate admission, speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [path evidence](./composition-ce15-path-metadata-results.json).

### 2026-10-08 — CE15 readback pending bounds and row metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `7ab58ce`.
- **Done:** admit actual state, clamped/pending rectangles and temporary native row
  views; retain through consumers, detach cached pixels after scope exit/disposal.
- **Results:** build/lint/boundaries, 181 focused / 69 typography tests; 144 audit
  cases / 8,000 comparisons, 96 RPC snapshots, 22 moving/blurred and ten stationary
  native frames, original WebGL/providers and 64 prior-exact exports / 768 bodies/
  frames pass. Glyph 1.455446× meets unchanged 1.5. First focused/native runs pass.
- **Review:** preserve full/null update precedence, native row placement, pixel
  quotas/cache policy; six new metadata admission/failure/lifetime cases pass.
- **Next:** remaining recording/device/pool/shader/paint/provider/graph/font/helper/
  ledger/Node controls, production/aggregate admission, speed/full CE15 gate/PR, CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [readback evidence](./composition-ce15-readback-metadata-results.json).

### 2026-10-08 — CE15 framebuffer bounds/color/transform metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `3f27971`.
- **Done:** admitted weak-map/rectangle controls, replacement/surface/final cleanup,
  original color/transform arrays and temporary native read-view consumers.
- **Results:** build/lint/boundaries, 175 focused / 69 typography tests; complete
  144-case / 8,000-comparison audit, 22 moving/blurred and ten stationary native
  frames, 96 actual RPC snapshots and original WebGL/provider checks pass. All 64
  exports / 768 bodies/frames match prior output; glyph 1.421648× meets unchanged 1.5.
- **Review:** preserve weak keys, native color/math/row placement and original null
  failures; replaced entries do not accumulate, allocator-first cleanup passes.
- **Next:** recording/device/pool/shader/paint/provider/graph/font/pixel-view/ledger/
  Node metadata, production/aggregate admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [framebuffer metadata evidence](./composition-ce15-webgl-bounds-metadata-results.json).

### 2026-10-08 — CE15 vector extent/region geometry ownership

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `90b1339`.
- **Done:** concrete pre-admission of original extent/region/batching producers;
  actual bounds-consumer lifetime, reference cleanup and frame scratch ownership.
- **Results:** build/lint/boundaries, 169 focused / 69 typography tests; complete
  144-case / 8,000-comparison audit, 22 moving/blurred and ten stationary native
  frames, 96 actual RPC snapshots and original WebGL/provider checks pass. All 64
  exports / 768 bodies/frames match prior output; glyph 1.443902× meets unchanged 1.5.
- **Review:** audited original factory counts/merged indices/overlap slices; original
  native math, region/draw operators and independent retained part bounds pass.
- **Next:** recording/replay and other WebGL controls, provider/graph/font/ledger/
  Node metadata, production/aggregate admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [geometry metadata evidence](./composition-ce15-vector-geometry-metadata-results.json).

### 2026-10-08 — CE15 actual raster parts and paint-call metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `03184b5`.
- **Done:** admitted actual part arrays/records and independent bounds before GPU
  production; retained owners, original argument tuples and recording surface copies.
- **Results:** build/lint/boundaries, 165 focused / 69 typography tests; complete
  144-case / 8,000-comparison audit, 22 moving/blurred and ten stationary native
  frames, 96 actual RPC snapshots and original WebGL/provider checks pass. All 64
  exports / 768 bodies/frames match prior output; glyph 1.421648× meets unchanged 1.5.
- **Review:** preserved native dimensions/offsets/pixels/order; container denial after
  scratch creation and pre-GPU growth denial release actual surfaces/metadata.
- **Next:** vector extent/region/recording, provider/graph/font/ledger/Node metadata,
  production/aggregate admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [raster-part metadata evidence](./composition-ce15-vector-parts-metadata-results.json).

### 2026-10-08 — CE15 vector-cache keys and controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `5e5f115`.
- **Done:** original native vector ID/signature inputs/output owners; Map/Raster
  admission, actual retained Map key, duplicate release and full error cleanup.
- **Results:** build/lint/boundaries, 161 focused / 69 typography tests; complete
  144-case / 8,000-comparison audit, 22 moving/blurred and ten stationary native
  frames, 96 real RPC snapshots and original WebGL/provider checks pass. All 64
  exports / 768 bodies/frames match prior output; glyph 1.405493× meets unchanged 1.5.
- **Review:** repaired fixture transforms and moved byte accounting after Map
  admission. Native cache policy, painting/order/overlap remain unchanged.
- **Next:** vector geometry/parts/recording, provider/graph/font/ledger/Node metadata,
  production/aggregate admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [vector key/control evidence](./composition-ce15-vector-key-metadata-results.json).

### 2026-10-08 — CE15 WebGL damage metadata and actual clip lifetime

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `e2659ca`.
- **Done:** pre-admitted original bounds/copies; retained header/layer/frame keys;
  dirty-region ownership through actual clip consumption and reset/final cleanup.
- **Results:** build/lint/boundaries, 152 focused / 69 typography tests; complete
  144-case / 8,000-comparison audit, 22 moving/blurred and ten stationary native
  frames, 96 real RPC snapshots and original WebGL/provider checks pass. All 64
  exports / 768 bodies/frames match prior output; glyph 1.417335× meets unchanged 1.5.
- **Review:** native map-spy typing and conservative definition-history test
  assumption repaired; quota/null/borrowed geometry and consumer lifetime pass.
- **Next:** vector/provider/graph/font/ledger/Node metadata, production/aggregate
  admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [damage metadata evidence](./composition-ce15-damage-metadata-results.json).

### 2026-10-08 — CE15 retained frame keys and cache control

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `22654d6`.
- **Done:** original owned frame/comparison keys, retained replacement/invalidation,
  192-byte cache control and actual preview/allocator disposal.
- **Results:** build/lint/boundaries, 137 focused / 69 typography tests; complete
  144-case / 8,000-comparison audit, 22 moving/blurred native frames, ten stationary
  native frames and 96 real RPC snapshots pass. WebGL has four exact stationary
  reuses; disposal leaves zero storage. All 64 exports / 768 bodies/frames match
  prior output; glyph 1.483363× meets unchanged 1.5 maximum.
- **Review:** repaired fixture transform opacity typing; retained first unchanged
  glyph-timing failure and reran only that command in isolation before exports.
- **Next:** damage/vector/provider/graph/font/ledger/Node metadata, production/
  aggregate admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [frame-key metadata evidence](./composition-ce15-frame-key-metadata-results.json).

### 2026-10-08 — CE15 WebGL definition/isolate metadata and LRU lifetime

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `32c8edb`.
- **Done:** owned definition entries, original isolate IDs/signatures/Maps/entries,
  retained keys and LRU copies through eviction; reusable flush and final close.
- **Results:** build/lint/boundaries, 130 focused / 69 typography tests; complete
  144-case / 8,000-frame audit, 22 native submission frames, 96 managed RPC snapshots
  and original WebGL/provider/typography checks pass. All 64 exports / 768 bodies/
  frames match prior output; glyph 1.429766× meets unchanged 1.5 maximum.
- **Review:** preserved between-frame flush, repaired LRU-copy lifetime, exact types
  and lint before final verification; intermediate and failed evidence retained.
- **Next:** other frame/damage/vector/provider/graph/font/ledger/Node metadata,
  production/aggregate admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [WebGL metadata evidence](./composition-ce15-webgl-key-metadata-results.json).

### 2026-10-08 — CE15 native cache pixel checksum metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `9d7cea9`.
- **Done:** owned native digest/hex/result capacity through comparison or publish
  acknowledgement, with borrowed input ownership and original operators preserved.
- **Results:** build/lint/boundaries, 118 focused / 69 typography tests; complete
  144-case / 8,000-frame audit, protected checksum/abort checks, 96 managed RPC
  snapshots and original WebGL/provider/typography checks pass. All 64 exports /
  768 bodies/frames match prior output; glyph 1.389886× meets unchanged 1.5 maximum.
- **Review:** expanded intermediate capacity to 4 KiB; repaired unused fixture
  snapshot accumulation with unchanged 8 KiB budget/errors, retaining the failed audit.
- **Next:** other checksum/provider/WebGL/graph/font/ledger/Node metadata, production/
  aggregate admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [checksum metadata evidence](./composition-ce15-checksum-metadata-results.json).

### 2026-10-08 — CE15 independent-surface metadata and native RPC lifetime

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `c37f797`.
- **Done:** owned original candidate keys/hashes, Maps/counters/entries, traversal
  Sets/input arrays, seed controls/graph containers and independent snapshots.
- **Results:** build/lint/boundaries, 114 focused / 69 typography tests; complete
  144-case / 8,000-frame audit, 96 owned surface RPC snapshots and original WebGL/
  provider/typography checks pass. All 64 exports / 768 bodies/frames match the
  prior checkpoint; glyph 1.343124× meets unchanged 1.5 maximum.
- **Next:** provider/WebGL/graph/font/checksum/ledger/Node metadata, production/
  aggregate admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [surface metadata evidence](./composition-ce15-surface-metadata-results.json).

### 2026-10-08 — CE15 retained root metadata and RPC lifetime

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `e121eef`.
- **Done:** owned original root role/path/signature hashes and retained Map/counter/
  operation/entry/pixel-envelope/snapshot capacity, with duplicate/error cleanup.
- **Results:** build/lint/boundaries, 110 focused / 69 typography tests; complete
  144-case / 8,000-frame audit, 96 owned root RPC snapshots and original WebGL/
  provider/typography checks pass. All 64 exports / 768 bodies/frames match the
  prior checkpoint; glyph 1.393665× meets unchanged 1.5 maximum.
- **Next:** Surface/provider/graph/font/checksum/ledger/Node metadata, production/
  aggregate admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [root metadata evidence](./composition-ce15-root-metadata-results.json).

### 2026-10-08 — CE15 retained source metadata and RPC acknowledgement

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `741e976`.
- **Done:** owned canonical keys/SHA/normalization, source Map/Set/request/entry/
  counter/snapshot capacity and real RPC acknowledgement. Repaired preparation
  phase cleanup when source state is disposed, preserving original null failures.
- **Results:** build/lint/boundaries, 99 focused / 69 typography tests; complete
  144-case / 8,000-frame audit, 96 managed RPC returns, original WebGL/provider/
  typography checks and 64 exports / 768 prior-exact bodies/frames pass. Glyph
  1.467095× meets unchanged 1.5 maximum.
- **Next:** remaining cache/graph/font/checksum/ledger/Node metadata, actual
  production/aggregate admission, speed/full CE15 gate/PR and all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [source metadata evidence](./composition-ce15-source-metadata-results.json).

### 2026-10-08 — CE15 retained submission metadata and native RPC lifetime

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `35b905a`.
- **Done:** admitted key/member/row/Map/stack/snapshot capacity; retained/duplicate
  keys, construction/error cleanup and independent snapshot lifetime. Repaired
  actual unreleased WebGL 300x150 measurement Canvas.
- **Results:** build/lint/boundaries and 90 focused / 67 typography tests; complete
  144-case / 8,000-frame audit, 22 new native frames with real RPC acknowledgement,
  original WebGL/provider/typography checks and 64 public exports / 768 prior-exact
  complete bodies/frames pass. Glyph 1.439058× meets unchanged 1.5 maximum.
- **Next:** remaining metadata/ledger control/Node and actual production admission,
  aggregate/area/workers, speed/full CE15 gate/PR and all CE14. No aggregate memory,
  speed or full gate acceptance is claimed.
- **Records:** [plan](./composition-ce15-plan.md),
  [submission metadata evidence](./composition-ce15-statistics-memory-results.json).

### 2026-10-08 — CE15 owned metadata serialization foundation

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `08911d8`.
- **Done:** pre-emission UTF16 output admission, admitted original shallow sorting,
  native boxed coercion, retained text ownership and nested/error cleanup.
- **Results:** build/lint/boundaries and 78 focused tests, including eight metadata
  cases, pass. Native output, callback counts, quota denial and null errors pass.
- **Limits / next:** ordinary records are covered; arbitrary Proxy traps/private VM
  allocations are not. Cache/graph/font/Node integration and actual production
  admission, aggregate/area/workers, speed/full CE15 gate/PR and all CE14 remain.
- **Records:** [plan](./composition-ce15-plan.md),
  [metadata foundation evidence](./composition-ce15-metadata-foundation-results.json).

### 2026-10-08 — CE15 native capture/upload ownership checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `6fa605e`.
- **Done:** native raw/encoded admission, exact capture kernels and frame scratch
  through complete upload acknowledgement; failed/late producer cleanup.
- **Results:** build/lint/boundaries and 70 admission/frame-lifetime tests; all
  144 audit cases / 8,000 exact frames, including 24 managed cases / 1,504 frames.
  Six original-native capture/body oracles and twelve protected failure cases pass.
  Complete original media/WebGL export commands and all 64 public exports / 768
  prior-exact complete PNG bodies and decoded frames pass.
- **Next:** Node and metadata admission; production allocator, aggregate/area/worker
  proof, authentic two-minute speed, CE15 gate/PR and all CE14. Production scope is
  still disabled; no full gate or speed acceptance claimed.
- **Records:** [plan](./composition-ce15-plan.md),
  [capture admission evidence](./composition-ce15-capture-memory-results.json).

### 2026-10-08 — CE15 verified asset/font/media ownership checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `9761d68`.
- **Done:** verified body/Blob/image/font/bitmap admission, nested-load rollback,
  late native completion cleanup, borrowed font preservation and temporary probe release.
- **Results:** build/lint/boundaries, 64 admission / 86 affected / 67 typography tests;
  144 audit cases / 8,000 exact frames, including 24 asset/font-managed cases / 1,504
  frames. Native resource lifetimes and 15 protected failures pass. Original provider,
  typography, media, illustrated and story commands pass; glyph 1.383989× ≤ 1.5×.
  All 64 public exports / 768 complete bodies and frames match the prior checkpoint.
- **Next:** capture/upload, Node and metadata admission; production allocator,
  aggregate/area/worker proof, authentic two-minute speed, CE15 gate/PR and all CE14.
  Production admission remains disabled; no full gate or speed acceptance claimed.
- **Records:** [plan](./composition-ce15-plan.md),
  [resource admission evidence](./composition-ce15-resource-memory-results.json).

### 2026-10-08 — CE15 GPU storage admission checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `ef1a9bd`.
- **Done:** native texture/buffer/MSAA storage admission, explicit deletion/pool
  ownership, byte/float readbacks and retained PNG coordinates; partial-failure cleanup.
- **Results:** build/lint/boundaries, 54 admission/cache/exposure/depth and 119 focused
  units; 144 audit cases / 8,000 exact frames, including 24 managed cases / 1,504
  frames. Actual native byte/float/depth/PNG/pool/failure lifetime checks pass. Complete
  original WebGL and 17 default depth timelines / 1,530 zero-delta frames pass.
  All 64 public exports / 768 complete bodies and frames match the prior checkpoint.
- **Next:** asset/font, capture/upload, Node and metadata admission; actual production
  allocator, aggregate/area/worker proof, two-minute speed, CE15 gate/PR and all CE14.
  Production allocator still disabled; no full gate or speed acceptance claimed.
- **Records:** [plan](./composition-ce15-plan.md),
  [GPU admission evidence](./composition-ce15-gpu-memory-results.json).

### 2026-10-08 — CE15 Canvas storage and bounded receive checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `4ee356e`.
- **Done:** explicit Canvas/source/root/pool/exposure owners and native backing
  destruction; failed-attempt cleanup; pre-admitted 64 KiB BYOB receive blocks.
- **Results:** build/lint/boundaries, 37 admission/cache/exposure, 90 effect/pool and
  67 typography tests; 132 audit cases / 7,248 exact frames, including 12 managed
  cases / 752 frames. Native detach/pool/body/failure checks pass. All 64 public
  exports / 768 complete bodies and frames match the prior accepted checkpoint.
  Original provider/typography gates pass; glyph 1.291824× ≤ unchanged 1.5×.
- **Next:** production allocator remains disabled until GPU/assets/capture/Node and
  metadata admission are complete. Area/worker, two-minute speed, final CE15 gate/PR
  and all CE14 remain pending. Full gate not run.
- **Records:** [plan](./composition-ce15-plan.md),
  [Canvas admission evidence](./composition-ce15-canvas-memory-results.json).

### 2026-10-07 — CE15 managed allocation foundation checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `bffaf8a`.
- **Done:** pre-allocation pixel/metadata leases, explicit scratch/retained and
  constructor ownership; backing aliases; native Canvas backing admission/release.
- **Results:** build/lint/boundaries and nine ownership tests pass. Native browser
  passes 1,024 exact channels, rejection before the setter and actual Canvas cleanup;
  permanent surface audit remains 120 cases / 6,496 exact frames.
- **Scope / next:** primitives are not yet wired into production rendering.
  Complete actual allocation/metadata coverage and full area/worker matrix;
  two-minute speed, final CE15 gates/PR and all CE14 remain pending. Full gate not run.
- **Records:** [plan](./composition-ce15-plan.md),
  [memory foundation evidence](./composition-ce15-memory-foundation-results.json).

### 2026-10-07 — CE15 runtime glyph tint and broader preparation checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `101fb91`.
- **Done:** exact shared native tints before parent leases; real variable Thai
  glyphs, corrections and both native/provider state-crossfade inputs.
- **Results:** build/lint/boundaries, 100 focused / 67 typography tests;
  120 audit cases / 6,496 exact frames and 64 public exports / 768 decoded frames
  preserve complete bodies and actual once-global glyph/outline/tint painting.
  Original provider/typography gates pass; glyph ratio 1.394895× ≤ unchanged 1.5×.
- **Rejected:** partial authored motion and missing crossfade catalog entry did not
  satisfy new fixture checks. Extend real motion/register cases; strict reruns pass.
- **Next:** complete aggregate pixel/metadata limits, area/worker matrix, real
  two-minute speed, final CE15 gates/PR and all CE14. Full gate not run.
- **Records:** [plan](./composition-ce15-plan.md),
  [tint/source evidence](./composition-ce15-tint-results.json).

### 2026-10-07 — CE15 complete FFmpeg command CPU checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `2422641`.
- **Done:** complete FFmpeg child user/system CPU with truthful resolution; actual
  export-owned timer/encoder process-group termination and reaping.
- **Results:** build/lint/boundaries, 23 focused tests and 20 CLI tests pass;
  56 original-baseline exports / 448 decoded frames and 24 protected live failures
  preserve complete media/audio parity and verify actual timer/encoder exit.
- **Rejected:** already-exited groups must accept ESRCH. Incorrect CLI runner and
  sandbox listener failure are retained; proper local-browser CLI rerun passed.
- **Next:** runtime tints/axes/corrections, aggregate pixel/metadata admission,
  real two-minute speed, final CE15 gates/PR and all CE14. Full gate not run.
- **Records:** [plan](./composition-ce15-plan.md),
  [CPU/lifecycle evidence](./composition-ce15-cpu-results.json).

### 2026-10-07 — CE15 actual submission statistics checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `014c228`.
- **Done:** measured graph/operation/native-content/cache-copy spans, exact batch
  membership, nested exclusive phase/type totals and actual ms per output frame.
  FFmpeg's existing transcode CPU scope is explicit; whole-process scope is pending.
- **Results:** build/lint/boundaries, 57 focused tests and 104 audit cases / 5,408
  exact frames; 32 prefix exports / 256 frames plus ten coverage/nested/original/
  cached exports / 80 frames pass with exact measured manifest aggregation.
- **Rejected:** a consumer does not have a preparation paint span; audit actual
  global ownership instead of inventing consumer painting. Full audit rerun passed.
- **Next:** whole FFmpeg process CPU, remaining tints/axes/corrections, complete
  aggregate pixel/metadata limits, real two-minute speed, final CE15 gates/PR and CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [statistics evidence](./composition-ce15-statistics-results.json).

### 2026-10-07 — CE15 closed native prefix checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `0bc813d`.
- **Done:** exact root prefixes at whole original vector/solid batch boundaries;
  full root preparation reuses prepared prefixes. Actual evaluated closure keys
  guard providers, parents, changing backdrops and late visibility phases.
- **Results:** 104 browser cases / 5,408 exact frames, including 48 prefix cases;
  actual native painting is once global at eligible boundaries. Build/lint/boundaries,
  53 focused tests and 32 production exports / 256 decoded frames pass.
- **Next:** remaining tint/axis/correction audit, aggregate pixel/metadata limits,
  per-layer statistics, real two-minute speed proof, whole parallel/final CE15 gate/PR,
  then all CE14. Mixed native batches keep their existing grouping.
- **Records:** [plan](./composition-ce15-plan.md),
  [prefix evidence](./composition-ce15-prefix-results.json).

### 2026-10-07 — CE15 original-target root checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `cf1139a`.
- **Done:** exact native root/coverage pixels, visibility phases, held typography
  gates and actual root paint/restore/copy/fallback counters; native boundaries stay intact.
- **Results:** 56 browser cases / 2,912 exact frames, 393,216 byte + 256 float pixels,
  14 protected root cases; full parallel command passes 207 exports / 1,656 decoded
  frames and 24 live failures. Build/lint/boundaries, 45 graph/readback and 67
  typography tests plus original provider/typography fixtures pass.
- **Rejected:** fixed outline endpoints advanced their clock and triggered seven
  fallbacks; preserve strict count checks, fix actual gate semantics and rerun fully.
- **Next:** closed prefixes/direct/tints, broader source audit, aggregate limits,
  per-layer timing, actual two-minute speed proof, full CE15 gate/PR, then all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [root evidence](./composition-ce15-root-results.json).

### 2026-10-07 — CE15 native preparation source checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `94fc857`.
- **Done:** shared original native glyph/outline/coverage pixels, exact font/raster
  identities, source ownership/timing counters and unpainted bounds discovery.
- **Results:** 1,664 exact browser frame comparisons; 32 production exports / 256
  decoded frames preserve complete PNG bodies; 11 protected source failures pass.
  Build/lint/boundaries, 63 focused tests, provider placements and eight typography
  fixtures pass; glyph timing remains inside its unchanged 1.5× policy.
- **Rejected:** count audit exposed 51 redundant bounds-only glyph paints; production
  now measures identical bounds without painting. Failed fixtures remain recorded.
- **Next:** root/direct/prefix and tint audit, broader axis/correction coverage, complete
  allocation/timing, actual two-minute speed proof, full CE15 gate/PR, then all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [preparation evidence](./composition-ce15-source-results.json).

### 2026-10-07 — CE15 production parallel worker checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `8ae2aa7`.
- **Done:** public/CLI worker/cache options, independent pinned browsers, immutable
  export scope and one bounded absolute-order encoder pipe with actual work metrics.
- **Results:** mandatory browser check passes in 181.14s: 111 successful exports,
  eight native timing cases, 24 protected live failures and complete media/frame/audio
  parity; 32 focused tests, build/lint/boundaries and old format/legacy exports pass.
- **Rejected:** early-source guard wording mismatch was a test error; its original
  production rejection is preserved. Sandbox/compile/probe attempts remain recorded.
- **Next:** complete static/preparation paint audit, aggregate limits, per-layer timing,
  actual two-minute speed proof, full CE15 gate/PR, then all CE14. No speed claim yet.
- **Records:** [plan](./composition-ce15-plan.md),
  [parallel evidence](./composition-ce15-parallel-results.json).

### 2026-10-07 — CE15 bounded ordered-pipe foundation

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `89c5744`.
- **Done:** one-frame chunk ownership and streaming absolute-order delivery,
  with one pending body per worker and original-error cancellation.
- **Results:** 12 runtime cases plus build/lint/boundaries pass. Deferred destroy
  errors in the first attempt are retained and repaired; no failed gate is called passed.
- **Next:** production browser/store wiring and scope capture, total memory limits,
  actual parallel parity/statistics/speed proof, full CE15 gate/PR, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [parallel evidence](./composition-ce15-parallel-results.json).

### 2026-10-07 — CE15 independent surface integration

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `5b20c86`.
- **Done:** asynchronous dependency preparation, native surface transfer and
  authenticated disk-backed sharing through the opt-in preview cache.
- **Results:** 24 cases / 1,248 exact frame comparisons across four pages; each
  static independent surface paints once globally. Float storage and 12 protected
  failures pass, plus build/lint/boundaries, 32 units and affected browser regressions.
- **Scope:** direct compositing boundaries remain exact. Public export wiring,
  built-in preparation paint audit and full static/aggregate acceptance are pending.
- **Next:** bounded ordered workers and production scope capture/statistics;
  complete cache/size/speed proof and final gate, CE15 PR, then all CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [surface evidence](./composition-ce15-surface-results.json).

### 2026-10-07 — CE15 bounded surface-store foundation

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `62ec321`.
- **Done:** export-owned immutable surface store, bounded file/chunk reservations,
  verified raw byte/float32 data, producer leases and original-error cancellation.
- **Results:** build/lint/boundaries and 10 runtime cases pass; four real renderer
  processes share one prototype paint with exact bytes and overlapping work.
- **Rejected:** added Canvas isolation changes pixels by up to two levels;
  synchronous binary document XHR throws. Use asynchronous preparation.
- **Next:** actual renderer integration, complete global static paint proof,
  aggregate memory, parallel delivery/statistics and 120-second 3× proof; final gate,
  CE15 PR and CE14. No full milestone acceptance is claimed.
- **Records:** [plan](./composition-ce15-plan.md),
  [cache evidence](./composition-ce15-cache-results.json).

### 2026-10-07 — CE15 explicit output profiles checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from `49e0543`.
- **Done:** seven BT709 profiles, preserved native alpha, PCM companions,
  source revalidation and protected completion publication; CLI format/transport.
- **Results:** 44 production / 14 independent preview encodes, 18 dimension cases,
  16 failure cases, 39 focused and 65 affected tests; legacy browser regressions pass.
  All existing thresholds remain unchanged; no CE15 full gate has run.
- **Rejected:** implicit precision expansion, tag-only reimport, scaled alpha and
  explicit H264 CRF18; corrected source-alpha extraction and CRF16 pass.
- **Next:** aggregate memory limits, global static cache, parallel workers,
  statistics and actual 120-second 3× speed proof, then full gate/PR and CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [format evidence](./composition-ce15-format-results.json).

### 2026-10-07 — CE15 transparent renderer checkpoint

- **Agent / branch:** Codex on `codex/composition-ce15` from CE13 `aedfc9e`.
- **Done:** opt-in Canvas/WebGL alpha roots; exact full and incremental transparent
  drawing-buffer reads; original opaque and offscreen paths retained.
- **Results:** 38 actual alpha cases, 32,895 valid channel/alpha pairs and 256
  zero-alpha pairs match independent PNG decoding exactly. Static checks, 19 units
  and the complete original WebGL suite pass in the isolated pinned checkout.
- **Retained diagnostics:** mathematical rounding failed actual PNG bytes;
  normalized float32 matches every valid pair. Failed checks are recorded.
- **Next:** all first Q4 formats together, then remaining formats, global caching,
  bounded parallel export and final full gate. CE15 remains incomplete; CE14 follows.
- **Records:** [plan](./composition-ce15-plan.md),
  [results](./composition-ce15-results.json).

### 2026-10-07 — CE13 complete native media acceptance

- **Agent / branch:** Codex on `codex/composition-ce13`, verified `01fbca2`.
- **Done:** native CFR video/sequences/audio, actual SDR/PCM preparation, bounded
  browser resources, Lab waveforms/playback and full passage audio integration.
- **Results:** complete pinned local `pnpm check` passes in 12825.81s, all 63
  commands, 2,103/46/247/14 tests, 176 actual defaults/frozen items and four strict
  Canvas matrices. Numbered video/audio proof passes 96 reverse seeks and 480
  playback observations with zero source-frame offset. Frozen bytes remain exact.
- **Retained attempts:** three failed gates, the interrupted third attempt and
  loader/readiness diagnostics remain in results; no acceptance waiver.
- **Delivery / next:** [PR #48](https://github.com/xxibcill/still-shift/pull/48) is open and attached against CE4d;
  continue CE15 → CE14. CE5-X/Q9 and CE6-P pending.
- **Records:** [results](./composition-ce13-results.json),
  [plan](./composition-engine-plan.md#ce13-completion-record-2026-10-07).

### 2026-10-07 — CE13 synchronous still preview repair

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed `dd2627b`.
- **Done:** still-only readiness returns synchronously; native media retains its
  async preparation, coverage and stale-seek guards. Both actual backends test readiness.
- **Results:** build/boundaries/style, actual H03 immediate/backward capture, complete
  native-media/session suites and 21 Commerce fixtures / 126 parity frames / 21
  exact backward seeks pass, with existing source/export/authoring/layout checks.
- **Failed gate:** `dd2627b` exited1 after 940.46s; static checks and 26 mandatory
  commands passed, including 2,103 units / 46 runtime / 247 integration / 14 depth.
  An always-async no-media hook delayed presentation until after synchronous capture.
- **Next:** fresh immutable complete local gate and CE13 PR, then CE15 → CE14.
  No tolerance, frozen byte, media guard or output version changed.
- **Records:** [both failed gates and focused repair](./composition-ce13-results.json).

### 2026-10-07 — CE13 native-loader repair after first gate

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed `b88f196`.
- **Done:** PCM verifier fields and narrow Lab/runtime imports preserve Node native
  config loading; evaluator53 identity is pure and retains existing re-exports.
  The local runner now checks the exact optional `bin/python` executable.
- **Results:** native startup, build, boundaries/style and all 114 affected tests /
  12 files pass, including all 25 previously skipped Lab cases and saved/native DSP.
- **Failed gate:** complete `b88f196` attempt exited1 after 204.39s. Static checks,
  2,103 units / 46 runtime passed; integration exposed a directory-as-executable
  runner mistake and unsupported parameter-property loading. Browser gates were not reached.
- **Rejected:** focused repair is not complete acceptance; no checks, timeouts,
  frozen visuals, PCM laws or output versions changed.
- **Next:** fresh immutable full local gate and CE13 PR, then CE15 → CE14.
- **Records:** [complete failed log and repair proof](./composition-ce13-results.json).

### 2026-10-07 — CE13 combined media preview acceptance

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed passage `8536def`.
- **Done:** the real authoring proof now combines 24 numbered FFV1 source frames,
  reverse remap, animated still, lower third and matching 96,000-sample stereo PCM.
  Preview retains the verified FFmpeg decoder path shared with export; WebCodecs is
  unadopted because no equivalent source/color/alpha parity proof exists here.
- **Results:** complete mandatory native-media browser suite, build and focused style
  checks pass. Both backends pass 96 exact reverse seeks and 480 actual playback
  observations with zero source-frame offset; existing audio presentation allows one
  frame. Exact PCM, history/save/reload, draft export and watch recovery remain passing.
- **Rejected:** fixture z-order/easing, WebGL readback and pre-invalidation picture
  assumptions corrected; retained-picture comparison now measures the audio-stop boundary.
- **Next:** immutable complete local CE13 gate and PR, then CE15 → CE14.
- **Records:** [decoder policy](./composition-media.md), [evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 complete native passage PCM

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed bindings `522b219`.
- **Done:** complete verified beat masters mix before crop, with outgoing tails,
  exact global/native narration replacement and bounded disk paging. Saved CE16
  narration retains track filters, ducking and master limiting through private stems.
  Native beat/cache, delivery AAC clocks, transactional guards and build identity pass.
- **Results:** 72 relevant tests / 7 files, all static checks and both complete native
  passage browser suites pass. Whole/range/repeat PCM, independent AAC/reference DSP,
  last samples, active cancellation and disabled/out-of-range provenance are exact.
  Default exports pass with optional Python unavailable; assembly reserves 327,684 PCM bytes.
- **Rejected:** negative-zero oracle and source/output filename fixture errors repaired;
  no renderer/evaluator/mixer law, frozen visual or acceptance tolerance changed.
- **Next:** combined video/audio preview proof, decoder decision, immutable full CE13
  gate and PR. Continue CE15 → CE14; broad/full gates were not replaced by this slice.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 native passage original bindings

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed playback `edda35b`.
- **Done:** native beat references retain original video/sequence/audio and manifest
  paths; source authorization checks manifests and all real PNGs before preparation.
  Cache/abort options propagate; decoder/watcher share contract padding-width support.
- **Results:** 35 relevant source/cache/preview/authorizer/native-passage checks / 5
  files and all static checks pass, including six new actual-media cases. Embedded
  video/PCM binding, `%010d` decode/watch repair and early cancellation pass.
  Source JSON, pixel/sample laws and decoder versions are unchanged.
- **Next:** whole-passage PCM, matching-audio transaction/production proof and final
  CE13 gate. Broad units/runtime/full gate were not repeated for this path slice.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 verified audio playback and waveform authoring

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed loader/mux `b9de1c5`.
- **Done:** verified bounded PCM preview, shared CE16 rendered-buffer scheduling,
  candidate-owned audio clocks/lifecycle, source/processed/mix lanes and gain/pan keys.
- **Results:** 2,101 units / 209 files, 46 runtime, 53 media/authoring checks and
  static checks pass. Complete native-media and preview-session browser suites pass.
  All 96,000 stereo AudioBuffer samples and an offline seek through distinct last
  samples are exact; real A/V difference stays within one frame through two seconds.
  Full final interval, edit/undo/redo/save/reload, byte-identical draft export and
  changed-source cancellation/restoration pass. Stale audio retires exactly once.
- **Rejected:** hardcoded saved revision2 (rebuild returned3); test verifies returned
  revision/source now. Callback, temporary-recipe and uv-cache failures are recorded.
- **Next:** whole-passage native PCM/path routing and remaining/full CE13 acceptance.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 native audio loader and transactional mux

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed mix `e3c8065`.
- **Done:** actual audio loader/master capture, canonical mapping/evaluator pinning,
  shared PCM verification and AAC mux inside the existing publication transaction.
- **Results:** 91 runtime/media checks / 14 files, all 2,094 units / 208 files and
  static checks pass. Four real sequence/video × Canvas/WebGL cases preserve all
  12,000 stereo master samples; 12 production MP4s match repeated, independent and
  raw/PNG encodes. AAC track counts are exact and independent decoded samples match.
- **Transaction:** actual post-mux cancellation and validation rejection leave no
  MP4, sidecars or stages. Absent/stale/tampered master rejects before artifacts.
- **Versions:** evaluator 53 / audio mixer 2 / export worker 0.6.7; decoder 1.
- **Next:** verified audio playback/waveform lanes, whole-passage audio/path routing,
  remaining production acceptance and complete final local gate.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 bounded PCM mix and actual waveforms

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed PCM cache `8161bd7`.
- **Done:** complete streamed stereo PCM master, source-page pool, shared clock/controls,
  CE16 Float32 laws and bounded actual source/processed/mix waveform capture.
- **Results:** 60 focused checks / 6 files, all 2,094 units / 208 files and static
  checks pass. Both CE16 reference WAVs are byte-identical. Actual 96,000-sample page
  pool uses 491,578 / 524,288 working bytes, 24 loads and 16 buffer-reusing evictions.
- **Repairs:** an actual singleton pingpong proof exposed a one-sample terminal error;
  audio loops now use Q16 PCM arithmetic, with five fps regressions and evaluator 53.
  The race fixture now edits bytes in place instead of truncating the source.
- **Next:** audio loader/preview, waveform lanes, transactional export mux, native
  whole-passage PCM, matching-audio production acceptance and complete final gate.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 streamed native PCM preparation

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed audio clocks `e4f27a2`.
- **Done:** actual mono/stereo stream probe, streamed 48 kHz Float32 decode, finite/count
  validation and atomic cache publication share the existing picture lock/disk accounting.
  PCM memory is reserved before allocation and source/cache hashes verify on every hit.
- **Results:** 25 focused source/cache/probe tests / 4 files and static checks pass.
  Exact mono/stereo source bits, resampling, relocation, tamper, simultaneous misses,
  cumulative picture/audio budget and actively writing decoder cancellation pass.
- **Review:** completed the storage extraction rename and added a late cancellation
  guard plus unconditional lock release. No failed gate or frozen reference change.
- **Next:** bounded mixing/waveforms, audio loader/preview/export, native passage audio,
  matching-audio production acceptance and the complete final local gate.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 continuous native audio clocks

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed authoring `917e92c`.
- **Done:** shared audio/dependency traversal and continuous 48 kHz nested clocks,
  full-duration cycles/PCM pingpong, visibility/routes and output-sample guards.
  Protected voice and ancestors reject baked sample clocks; evaluator 52.
- **Results:** all 2,089 unit tests / 208 files and static checks pass. Exact source
  boundaries and last nested samples pass at 24/25/30/50/60 fps. Existing CE7 picture
  baselines, independent/repeated/raw exports and hardware policy remain exact/pass.
- **Repairs:** fixture size and stale WebGL 0.65 batch digest expectation repaired;
  independent calculation proves the intentional 0.66 identity change only.
- **Next:** actual bounded PCM decode/mix, audio loader/preview/export, waveform lanes,
  native passage audio, then matching-audio and final full acceptance.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 native authoring readiness and drafts

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed source/export `9aca1ae`.
- **Done:** native CLI/Lab preparation and captured frame routes, asynchronous seek/
  first-frame/playback guards, stale cancellation, native draft export and sequence
  pattern/manifest portability. Originals stay on disk and reverify pinned bytes.
- **Results:** a real inspector remap edit prepares a new original; undo/redo,
  save/reload, backend switch, playback and fixture preview preserve exact pixels.
  Draft MP4 matches direct render. Changed originals reject; restoration recovers.
- **Regressions:** 48 focused units / 23 CLI-preview-save tests and static checks pass;
  existing session, Lab, builder watch and inspector/export browser suites pass.
- **Repairs:** hold/locator fixture errors and canonical manifest alias failure remain
  in evidence. Native PCM/waveforms, passage audio and final full acceptance are next.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 native production picture export

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed readiness `7f42571`.
- **Done:** exact source preparation, immutable frame manifests and original/resource
  path separation; export awaits native readiness. Canvas 1.45 / WebGL2 0.66.
- **Results:** actual video and sequence with animated still/lower third export on
  both backends. Repeated MP4, independent preview encode and raw/PNG transport are
  byte-identical in all four cases. Source/cache/probe/examples: 18 tests / 4 files;
  build and static checks pass. Build fixture repairs remain in the evidence.
- **Next:** Lab/CLI preview and draft integration, continuous PCM/waveforms and native
  passage audio, then full production acceptance and the final local gate.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 bounded native frame readiness

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed cache `ac9f68c`.
- **Done:** shared exposure/history/matte/effect/coverage frame dependencies, validated
  prepared manifests, bounded bitmap LRU/streams, stale seek/disposal guards and native
  GPU cache with actual texture deletion. Native draw requires async preparation.
- **Results:** 2,077 unit / 46 runtime / 13 media integration tests and static checks pass.
  Real Canvas/WebGL alpha and color proofs pass; scaled/history frames match exactly,
  held-frame seek hashes match, CPU/GPU budgets reject and disposal returns to zero.
- **Regressions:** existing CE7/CE8 browser acceptance, repeats, independent exports,
  hardware and frozen baselines pass. New fixture/build failures remain in evidence.
- **Next:** source/export/Lab hookup, continuous PCM/waveforms and native passage audio,
  then complete production/full acceptance. No CE13 full gate yet.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 actual color conversion and frame cache

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed probe `fc23442`.
- **Done:** original-frame FFmpeg preparation, 16-bit transfer/range conversion into
  truthful sRGB RGBA8 PNGs; pinned sequence originals and color authority; bounded,
  locked, atomic cache with relocation reuse, source/tamper verification and cancellation.
- **Results:** 23 focused tests / 4 files and all static checks pass. Burnt-in frame
  numbers at 30000/1001 and independent RGB/YUV/alpha ramps pass; sequence pixels are exact.
- **Rejected:** optional-property build and unused-variable lint failures are repaired;
  sandbox lock-helper denial required the authorized isolated test environment.
- **Next:** exact exposure/history resource sets, bounded CPU/GPU browser readiness,
  native PCM/waveforms and production/full acceptance. No CE13 full gate yet.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 actual source provenance and CFR probe

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed clocks `41c7b98`.
- **Done:** streaming hashes, original integer PTS and exact rational CFR proof;
  actual dimensions/color/coverage and authored metadata checks; rotation, VFR and
  non-square pixels reject before preparation.
- **Results:** 12 focused tests / 2 files and build/schema/boundaries/lint/format pass.
  Real FFmpeg fixtures cover longer container audio, VFR, rotation, limits and hashes.
- **Rejected:** missing synthetic frame color tags were fixed in the fixture;
  unknown-color rejection stays. Initial test-table build failure is also recorded.
- **Next:** actual SDR conversion, atomic bounded frame cache and browser readiness,
  then continuous native PCM/waveforms and production acceptance. Full gate pending.
- **Records:** [media guide](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 native media contract and evaluated source clocks

- **Agent / branch:** Codex on `codex/composition-ce13` after pushed integration `3fd8584`.
- **Scope:** pinned rational video/sequence/audio descriptors, trims, clocks and builders.
- **Done:** source-second media remap is derived after drivers/expressions; Q32 frame
  pairs enter picture identity. Audio gain/pan and Q16 positions are sampled, audio
  has no picture geometry, and complete narration rejects changed clocks/cropped windows.
- **Results:** schema/boundaries/build/lint/format and all 2,060 unit tests / 204 files
  pass. Initial optional-default build failure and stale builder expectation remain recorded.
- **Open / next:** actual FFmpeg/color/cache preparation, continuous nested PCM clocks,
  browser readiness and waveform/export/passage acceptance; full milestone gate pending.
- **Records:** [media contract](./composition-media.md), [CE13 evidence](./composition-ce13-results.json).

### 2026-10-07 — CE13 begins with merged CE16 audit and shared integration

- **Agent / branch:** Codex on `codex/composition-ce13` from CE4d `adf6cea`.
- **Scope:** reuse CE16's merged soundtrack authority before implementing native media.
- **Done:** imported `65f2ebe4` soundtrack modules and reconciled six shared interfaces;
  retained native passage composition/backend options and retired production Three.
- **Results:** pinned startup/build/schema/lint/format, 88 soundtrack / 46 runtime /
  40 passage-CLI tests and real browser/full-range mux pass. CE13 native acceptance
  and full gate remain pending. Missing test alias and temporary lock formatting
  failures are retained in the evidence.
- **Open / next:** commit/push this integrated slice, then implement deterministic native video, sequences, protected audio and real waveforms.
- **Records:** [CE13](./composition-engine-plan.md#ce13--video-image-sequence-and-audio-layers),
  [evidence](./composition-ce13-results.json), [CE16 PR #33](https://github.com/xxibcill/still-shift/pull/33).

### 2026-10-07 — CE4d complete local gate and native-default closeout

- **Agent / branch:** Codex on `codex/composition-ce4d`, verified `ae2e1f0`.
- **Done:** native family/depth defaults, shared-graph painter consolidation and
  truthful Lab/cache provenance complete; every existing acceptance gate is retained.
- **Results:** full pinned local `pnpm check` passes in 11705.18 seconds, all
  61 test commands, 2,005/46/143/14 tests, all 176 defaults/frozen items and all
  four strict Canvas matrices. All 141 prior visual files remain exact.
- **Rejected / do not repeat:** both earlier failed full gates remain recorded;
  never claim focused checks replace the full gate or reapply superseded drafts.
- **Delivery / next:** [PR #47](https://github.com/xxibcill/still-shift/pull/47) is open and attached;
  CE13 → CE15 → CE14 with CE16 reuse.
  WebGL speed remains CE6-P; CE5-X/Q9 pending. Actions remain disabled.
- **Records:** [results](./composition-ce4d-results.json),
  [plan](./composition-engine-plan.md#ce4d-completion-record-2026-10-07).

### 2026-10-07 — CE4d native golden identity and parity pass

- **Agent / branch:** Codex on `codex/composition-ce4d`, repair `3747d16`.
- **Results:** focused golden parity passes all five scenes / 15 frozen samples /
  30 PNG/JPEG transport comparisons and original motion checks. Every actual Lab scene
  reports the native renderer; frozen reference identity remains unchanged. Pinned
  startup/fingerprint, Python imports, format, scoped lint and build pass.
- **Next:** complete `pnpm check` from the beginning on the new isolated checkpoint;
  preserve both prior failed gates. Then CE4d PR and approved milestone continuation.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d golden renderer metadata migration repair

- **Agent / branch:** Codex on `codex/composition-ce4d`, from `4a8ba90`.
- **Failure:** second full gate passes 2,005 unit / 46 runtime / 143 integration /
  14 Python tests and depth, vertical and export browser suites. Golden pixel/motion
  and transport checks pass, then old renderer metadata equality fails (332.26 seconds).
- **Repair:** assert native Lab renderer identity and frozen legacy reference identity
  separately; every stored sample, threshold and transport assertion is unchanged.
- **Next:** focused golden regression and full gate from the start on a fresh checkpoint.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d repaired Depth Lab acceptance passes

- **Agent / branch:** Codex on `codex/composition-ce4d`, runtime `69469a8`, harness `e8a70d9`.
- **Results:** complete depth-motion suite passes original far/near/drift, comparison/hold,
  crop/fallback/edge and stale-selection/gallery assertions. A real delayed decode confirms
  a seek during preparation survives the staged native refresh. Both affected Lab session
  suites pass. No motion, pixel or timing threshold changed.
- **Next:** complete `pnpm check` from the start on a fresh private checkpoint; the first
  failed gate remains recorded. Then CE4d PR/attachment and all remaining approved milestones.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d full gate finds asynchronous Depth Lab handoff

- **Agent / branch:** Codex on `codex/composition-ce4d` after `8ce662a`.
- **Full gate:** stopped after 217.48 seconds at the Depth Lab motion check; 2,005 unit,
  46 runtime, 143 integration and 14 Python depth tests passed first. This gate failed.
- **Diagnostic:** waiting for committed parameters preserves all motion assertions and
  passes: far marker 10.5 px, near marker 17.5 px. The old test observed pending refresh.
- **Repair:** explicit updating/readiness state, latest seek at commit, first-frame staging
  before active replacement, stale-load error protection and truthful native Lab version.
  A real delayed-decode regression seeks during preparation; no threshold changes.
  Its first focused run passes motion/pending seeks, then finds the same stale-read
  assumption in comparison/hold tests; those now wait for committed readiness.
- **Open / next:** focused Depth Lab/Lab sessions, then a complete local gate rerun and
  milestone PR/attachment. The approved CE13 → CE15 → CE14 order remains unchanged.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d complete public-default focused acceptance passes

- **Agent / branch:** Codex on `codex/composition-ce4d`, runtime `75c0828`.
- **Results:** all 176 actual family defaults pass 36,061 forward and reverse frames,
  assigned pixel tiers, text probes and every unchanged CE0 hash. Explicit public depth
  defaults pass all 23 timelines / 2,070 frames exactly. Strict CLI cache relocation,
  checksums/repeat exports and actual vertical export pass after the portability repair.
  Pinned toolchain, schema, boundaries, format, lint and build pass. All 141 prior visual
  files remain exact; no threshold or frozen reference changed.
- **Next:** one complete local `pnpm check` on the final isolated checkpoint, completion
  PR/attachment, then CE13 → CE15 → CE14 with CE16 audit/reuse. CE5-X/Q9 remains pending.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d public defaults pass and cache manifest portability is repaired

- **Agent / branch:** Codex on `codex/composition-ce4d` after `0de5294`.
- **Results:** explicit public-depth defaults pass all 23 timelines / 2,070 forward and reverse
  frames exactly. Actual vertical Node export, both Lab session checks, public export worker,
  42 units and 11 integration tests pass. Fresh 690-frame zipper pixel QA passes the unchanged
  policy; 2,172 authored warnings remain, with no validation or frozen-motion errors.
- **Correction:** earlier depth logs described as defaults actually covered direct native layers;
  explicit `--default` proof is recorded separately.
- **Repair:** strict CLI alternate-cache equality exposed absolute native asset paths. Content-based
  document references now bind separately to verified physical files; pipeline 0.13 invalidates
  prior cache identity. Eight focused tests, scoped format/lint and build pass.
- **Open / next:** relocated-cache CLI/export rerun, remaining 176-item family acceptance and full
  local gate; CE4d PR, then CE13 → CE15 → CE14 with CE16 audit/reuse.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d frozen-oracle dependency is made explicit

- **Agent / branch:** Codex on `codex/composition-ce4d` after `db0a4ca`.
- **Results:** 42 focused unit tests and 11 startup/cancellation/publication integration tests pass.
  Actual-default browser acceptance stopped before pixels: test-only Three resolution had relied
  on the retired production import.
- **Done:** pinned Three 0.186.0 and its types move to root test development dependencies;
  renderer production dependencies no longer include Three. Lock package/snapshot maps and
  all versions/integrities are unchanged. Build passes.
- **Open / next:** rerun actual-default browser acceptance, required family/Lab/export matrices,
  zipper QA and full local gate; then CE4d PR and remaining approved milestones.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d native delivery passes and production defaults are consolidated

- **Agent / branch:** Codex on `codex/composition-ce4d` after `7359189`.
- **Prerequisite proof:** immutable `5bcba60` native delivery passes 29 timelines, 29 independent
  encodes, 87 byte-identical production/repeat/raw exports, 23 cost brackets, inspector/resource
  checks and 90 hardware comparisons. Both GPU alpha edges conserve coverage exactly.
- **Done:** public family/depth factories now use the prepared shared composition backends;
  duplicate Three/family/commerce/mask frame painters are retired. Node exports and manifests
  carry native composition/provenance; pipeline 0.12 and renderer/adapter/shader enter cache identity.
  Historical references remain on test-only oracles.
- **Results:** build/scoped ESLint pass; default-route focused checks and milestone acceptance are pending.
- **Open / next:** actual-default depth/family/Lab/export checks, zipper QA and complete local gate;
  create/attach CE4d PR, then continue CE13 → CE15 → CE14 with CE16 audit/reuse.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d complete legacy delivery passes after shadow repair

- **Agent / branch:** Codex on `codex/composition-ce4d`; pushed code checkpoint `5bcba60`.
- **Results:** all 7 fixtures on both backends pass 2,352 forward and 2,352 reverse frames;
  14 independent preview encodes match 42 production/repeat/raw exports. Relocation,
  overwrite protection and all 66 hardware comparisons pass unchanged policies.
  Canvas's worst median ratio is 1.1822 (limit 1.25); WebGL costs retain the CE6-P deferral.
- **Depth preflight:** pinned tools and renderer/export imports pass. Both GPU alpha edges conserve
  coverage exactly. All 23 prepared timelines pass 2,070 exact forward/reverse frozen comparisons.
- **Open / next:** complete native depth delivery is running serially on the same immutable snapshot;
  defaults and the final complete local gate remain pending. Then PR/CE13 → CE15 → CE14.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d separate shadow/source paint repair checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d` from `93845ba`.
- **Scope:** serial legacy delivery reached Crisis Fracture frame41 with delta3 at one shadow/stroke pixel.
- **Done:** known unfiltered/unclipped Canvas shadows and source coverage reach the shared GPU
  backdrop as separate paints. Unbounded source extents and absolute/reset transforms are retained.
  WebGL2 is 0.65.0. Critical smoke/hardware frames and a pinned direct-Canvas regression are added.
- **Results:** build/scoped ESLint and39 unit tests pass. All7 legacy fixtures pass2,352 forward
  and2,352 reverse frames on both backends, unchanged delta2 maximum. All12 hardware regression
  comparisons pass the unchanged perceptual policy (minPSNR45.7339/SSIM0.998534).
- **Rejected:** flattened bitmap blending fixes frame41 but breaks six other frames; software
  vector preparation does not fix frame41. A pinned near assertion was too strict for a hardware
  diagnostic; hardware policy remains unchanged. Complete delivery is still pending.
- **Open / next:** serial legacy/native delivery, default consolidation and final local gate; then PR/CE13.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d overlapping PNG rounding repair checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d` from `fbaa6a8`.
- **Scope:** complete legacy delivery exposed WebGL Comparison Build failures on frames30–34.
- **Done:** verified PNG images use bitmap source-over rounding; vector primitive rounding is preserved.
  WebGL2 is 0.64.0. Focused smoke includes the actual failing frames.
- **Results:** checkpoint `fe5b8a6` passes toolchain/build/scoped ESLint,39 unit tests and alpha
  on both GPU profiles. All7 WebGL smoke fixtures /40 forward+40 reverse frames pass, including
  the five failing frames. Diagnostic frame32 improves from delta3 /396 pixels above2 to delta1.
  Complete serial delivery is running; the unchanged near tier remains delta2.
- **Failed / do not repeat:** the complete 4b99cad legacy gate failed; later depth delivery did not run.
  All23 prepared depth timelines had passed exact forward/reverse parity before that failure.
- **Open / next:** focused/full legacy parity, native delivery, defaults and final full gate; then PR/CE13.
- **Records:** [results](./composition-ce4d-results.json).

### 2026-10-07 — CE4d preserved-alpha filtering checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d` from `d72bab0`.
- **Scope:** repair the confirmed authored depth-image alpha fringe from the fresh-chat handoff.
- **Done:** both GPU fragments filter preserved-alpha linear texels in premultiplied form;
  opaque compatibility sampling remains unchanged. Version identities are advanced.
- **Results:** checkpoint `4b99cad` passes toolchain, build, scoped ESLint and 20 unit tests.
  SwiftShader and Apple M5 Pro each pass all 128 filtered edge pixels with exact R+G conservation
  and repeat identity; the fringe pixel improves from RGB111,112,0 to143,112,0. Full delivery is running.
- **Open / next:** focused alpha proof, affected native delivery and legacy delivery, default migration,
  actual-route acceptance, final local gate and CE4d PR; then CE13 → CE15 → CE14.
- **Records:** [results](./composition-ce4d-results.json), [handoff](./composition-continuation-handoff-2026-10-07.md).

### 2026-10-07 — Composition work handed to a fresh chat

- **Agent / branch:** Codex on `codex/composition-ce4d`; code `1ec5d04` pushed.
- **Scope:** User requested a fresh chat because this one is large and lagging.
- **State:** Verified hardware repair is checkpointed. Existing full native depth
  job completed during wrap-up: all29 encodes/87 exports and90 hardware checks
  pass; the full proof is saved. No verification job remains active.
  Confirmed preserved-alpha edge darkening is recorded but unrepaired.
- **Next:** New chat reads the completed proof, fixes alpha,
  closes CE4d, then continues CE13 → CE15 → CE14 and audits/reuses CE16.
- **Records:** [Saved handoff](./composition-continuation-handoff-2026-10-07.md),
  [measured evidence](./composition-ce4d-results.json). Owner edits are preserved.

### 2026-10-07 — CE4d hardware depth interpolation checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d` after `bcc1c8b`.
- **Done:** Hardware UVs use pinned 1/16-pixel subpixel precision; the software
  shader/mesh stay unchanged. WebGL2 0.62.0 / image-plane shader 0.3.0.
- **Results:** Build/lint/20 unit tests pass; all 23 timelines / 2,070 forward and
  reverse frames stay exact. All 87 hardware comparisons pass the unchanged
  policy. Three tiny rasters retain full coverage and exact hardware parity.
- **Next:** Fresh full native delivery, legacy timing/delivery, default switch and
  complete milestone gate. Earlier failed/rejected diagnostics remain recorded.
- **Records:** [Full measured evidence](./composition-ce4d-results.json).

### 2026-10-07 — CE4d complete depth delivery reaches hardware failure

- **Agent / branch:** Codex on `codex/composition-ce4d`, verified code `f01a35b`.
- **Results:** All 23 serial cost brackets are saved; 29 independent encodes and
  87 production/repeat/raw exports agree byte-for-byte. Hardware repeated-precomp
  frame 0 fails the unchanged perceptual policy; final acceptance is incomplete.
- **Rejected:** Source rasterization/filter/derivative alternatives do not fix it.
  Full triangle reconstruction, rounded reconstruction and centroid interpolation
  fail frozen software parity. No production shader change retained.
- **Next:** Verify hardware-only interpolation, then finish migration and full gate.
- **Records:** [Full costs, failure and diagnostics](./composition-ce4d-results.json).

### 2026-10-06 — CE4d startup and provenance focused acceptance passes

- **Agent / branch:** Codex on `codex/composition-ce4d`; verified snapshot `f01a35b`.
- **Results:** build/scoped lint/toolchain, 25 unit checks and 11 integration checks
  pass. HTTP 503/module failures report diagnostics, close the browser, roll back
  output and permit retry; cancellation/publication/pinned-renderer checks pass.
  All 23 prepared depth timelines match exactly in 2,070 forward/reverse frames,
  including requested-auto/actual source and depth hash provenance.
- **Open / next:** retry complete serial depth delivery, then legacy timing/exports,
  actual defaults and final full gate before the CE4d PR. Earlier failed delivery
  remains recorded; its cause is still unconfirmed.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d resumes after timing release

- **Agent / branch:** Codex on `codex/composition-ce4d` (from `7883d19`).
- **Done:** CE6-P explicitly released its second timing hold. Scoped formatting
  completed for startup diagnostics, native provenance and delivery regressions.
- **Results:** complete candidate family evidence remains passed on `a843cf9`.
  New focused startup/cancellation/provenance verification is starting; the old
  failed depth delivery attempt remains incomplete and its cause unconfirmed.
- **Open / next:** verify focused changes, retry depth/legacy delivery and timing,
  apply default migration, then complete actual routes/full gate and milestone PR.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d covers HTTP startup failures

- **Agent / branch:** Codex on `codex/composition-ce4d` (from `1732208`).
- **Done:** export startup diagnostics also capture HTTP error responses and console
  errors. Injected HTTP 503 and throwing-module cases require cleanup and retry.
- **Results:** `git diff --check` passes; all new verification remains held for
  CE6-P. Complete candidate parity stays passed; production defaults stay unchanged.
- **Open / next:** verify startup regressions and delivery after timing release.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d complete family candidate parity passes

- **Agent / branch:** Codex on `codex/composition-ce4d`; verified snapshot `a843cf9`.
- **Results:** the existing all-176 candidate exited zero: 36,061 forward frames
  and 36,061 reverse seeks pass assigned tiers, with every old CE0 hash unchanged.
  Maximum channel delta is 2; typography ink/container probes pass.
- **Done:** retained the complete report in milestone evidence; the startup failure
  regression preserves normal navigation timing while shortening its injected wait.
- **Open / next:** no root verification remains active. CE6-P timing hold continues;
  startup/depth delivery, actual defaults, timing/export matrices and full gate remain.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d retains delivery failure evidence

- **Agent / branch:** Codex on `codex/composition-ce4d` (from `e39f99b`).
- **Done:** added an injected browser-module failure regression requiring captured
  diagnostics, artifact rollback, closed browser and successful retry. Depth
  acceptance now saves serial costs before delivery and logs the export transport.
- **Results:** `git diff --check` passes. New tests and formatting are unrun during
  CE6-P's owner-authorized timing hold; the existing all-176 candidate continues.
- **Open / next:** after release, verify startup cleanup and complete depth delivery,
  family defaults and the full local gate before the CE4d PR.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d stages startup diagnostics during a second timing hold

- **Agent / branch:** Codex on `codex/composition-ce4d` (from `a843cf9`).
- **Done:** staged export-worker 0.6.6 private Vite cache cleanup/startup error
  reporting and inspectable prepared depth request/asset provenance. These changes
  are **unformatted and unverified** during CE6-P's next owner-authorized hold.
- **Results:** existing depth delivery job completed 23 serial cost brackets and
  17 timelines / 51 production-repeat-raw exports plus 17 independent encodes,
  then hit a 30-second export-browser startup timeout. No final report was written;
  the cause is unconfirmed. This is an incomplete acceptance attempt.
- **Open / next:** valid all-176 family candidate continues on `a843cf9`; no new
  pnpm/Node/test/browser/export work starts during the hold. After release, verify
  staged changes and retry affected delivery work, then finish defaults/full gate/PR.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d repairs distinct-state image crossfade parity

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** shared Canvas drawing preserves the active matrix transfer for distinct
  image crossfades (Canvas 1.44.0). Supply-ramps now matches exactly in all 192
  forward/reverse frames. Acceptance failures name the item; subset reports use
  distinct filenames. Depth acceptance records all 23 cost brackets serially
  before its independent export/correctness phase; build and scoped lint pass.
- **Results:** 60 focused tests/build/lint pass; all five motion-craft fixtures
  (698 frames) match exactly, and eight typography fixtures (1,309 frames) plus
  every text-node ink/container probe pass the unchanged near tier (delta <=2).
- **Rejected:** transferring all image states changed settled frame 2 (delta 14);
  restrict transfer to distinct-state crossfades. Original fixtures stay frozen.
- **Open / next:** full all-176 candidate parity, depth export/hardware/cost
  acceptance, actual defaults, final gate and CE4d PR; scheduled milestone loop
  continues afterward.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d depth parity and integration repair checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** separately captured/repeated six extra old-depth cases; all 23 prepared
  native wrapper timelines match exactly in 2,070 forward/reverse frames. Fixed
  depth capability propagation in spatial shutter preflight (WebGL2 0.61.0),
  browser fixture imports and inspector reload revisions. Lab activation awaits
  private candidate canvases and rejects superseded loads safely.
- **Results:** 31 focused regressions/build/lint and actual depth-motion Lab checks
  pass. Six mixed graphs pass 144 forward/reverse frames (delta at most 2), four
  resource rejection cases and real inspector edit/undo/redo/save/reload pass.
- **Rejected / open:** all-family candidate stopped at supply-ramps frame 36
  (delta 13, near tier unchanged). Defaults remain old; trace and repair this
  mismatch, finish exports/hardware/costs, then migrate and run the full gate.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d resumes parity verification after timing release

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** formatted and verified the native depth export preparation and manifest
  checkpoint `187e131`; isolated family acceptance Vite caches and cleaned up
  independent FFmpeg encoding failures before rejection.
- **Results:** 41 focused tests in four files, build, scoped lint, schema check and
  package boundaries pass. CE6-P explicitly released its quiet timing hold.
- **Open / next:** capture the separate six-case old-depth extension, verify prepared
  wrappers and all family parity, then switch defaults and run the full CE4d gate.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d quiet-window implementation checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** unwired Node depth export preparation verifies actual file hashes and
  dimensions and preserves requested/resolved provenance. Legacy manifests accept
  native picture data with matching canvas/fps/frame-count checks. Added pending
  regressions, serial old/native/old depth cost brackets and stronger real inspector
  rejection/history assertions; the depth inspector opens directly in WebGL2.
- **Results:** these latest edits are **unverified**. All pnpm/Node/test/browser/
  export verification and formatting remain held for CE6-P's owner-authorized
  timing window. Previous checkpoint results remain bound to `5e3f517`.
- **Open / next:** format and run focused checks after release, then independent
  depth/family parity, actual defaults, zipper pixels, full gate and CE4d PR.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d integrates zipper QA and prepares default wrappers

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** integrated source/tests/reference notes from zipper QA `9b1b41a`,
  retaining newer CE4d records. Pixel lint accepts an explicit backend and reports
  the renderer; visible receiver signatures include scoped effective lighting.
  Added thin prepared family/depth wrappers and actual-depth-default checks.
- **Results:** 74 focused quality/lighting unit checks and the new CLI backend
  option regression pass; build, lint, schema and boundaries pass. A broader CLI
  file attempt passed seven tests but the existing font-alias browser setup hit
  sandbox `listen EPERM`; the complete file remains for the final full gate.
- **Open / next:** hold heavy runs for CE6-P; then verify parity, production zipper
  WebGL pixel lint, default migration and full gate. Historical QA proof is bound
  to its original versions, not the integrated branch.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d diagnostic preparation and mandatory gate coverage

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** preserved ink/container typography diagnostics through shared native
  text and local providers; added independent probe pixels to the family acceptance
  suite. Asset loading moved unchanged into adapter preparation. Depth, legacy
  adapter and all-family actual-default acceptance are mandatory in `pnpm test`.
- **Results:** 62 focused text/provider regressions, build, scoped lint and package
  boundaries pass. New browser coverage is implemented but unrun during CE6-P's
  quiet window; default migration and full gate remain pending.
- **Open / next:** finish required parity, migrate all default entry points and
  deliver the milestone. [Evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d adapter-owned sampling and depth delivery checks

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** moved unchanged family state sampling to adapter preparation; public
  observer delegates without family dispatch. Added a full depth acceptance runner
  for independent/repeat/raw exports, CLI relocation, hardware, alpha policy,
  actual resource failures and inspector edits. Verified-byte preview preparation
  hashes source assets and decodes the exact hashed bytes before rendering.
- **Results:** 132 focused recipe/adapter regressions, build, lint and dependency
  boundaries pass. Production defaults remain unchanged; acceptance runners are
  implemented but unrun while the CE6-P quiet timing window is active.
- **Open / next:** complete parity verification, migrate defaults, run the full
  local gate and deliver CE4d. [Evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d mixed depth and inspector checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** depth/image-plane key value controls and real edit/history/save/reload
  acceptance. Added six mixed graphs with independent old-depth raster references
  for local clocks, parenting, masks/mattes/effects, repeated/remapped precomps,
  shutter samples, cameras and opt-in lighting.
- **Results:** focused mixed-graph state test, build and scoped lint pass. Browser
  acceptance is implemented but unrun during CE6-P's quiet timing window.
- **Rejected:** 90 image sources exceed the unchanged 32-source limit; use a
  test-only local-raster provider and a bounded 24-source native lighting reference.
- **Open / next:** run GPU/inspector/export acceptance when released, finish default
  consolidation and the complete gate. [Evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d extended depth and vocabulary checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** preserved the old Three renderer as an independent test-only oracle.
  Added six reference cases for all auto choices, protected vertical framing,
  transparent input and prepared depth at half source resolution. Original 17
  reference rows/files remain unchanged. Q2 schema comments and contributor/format
  guidance freeze family visual vocabulary and the entire legacy illustrated schema.
- **Results:** 18 focused depth state tests, build, scoped lint and schema check pass.
  Additional reference capture, GPU pixels, integration/export/default migration
  and complete gate are pending; competing timed PR42 verification remains active.
- **Open / next:** capture separate extended references when quiet, finish shared
  graph/inspector/export acceptance and switch defaults after parity passes.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d reconciles spatial review fixes

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** integrated source/tests from PR43 fixes `e16d962`, `c36c686`, `c0c8f5d`:
  inherited projected blur, ancestor-group required coverage and XY inspector
  tangents. Advanced current evaluator/backend/export versions without rollback.
- **Results:** 43 focused regressions, build and scoped lint pass. Upstream browser
  checks are included in the required camera group; final-code browser/full gate
  remain pending. No upstream owner documentation or worktree is changed.
- **Open / next:** remaining depth acceptance, independent all-family migration
  proof and default consolidation; new timing waits for PR42's active full gate.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d preparation and independent oracle checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** compiled-scene adapter cores retain measured/edited layouts. A test-only
  copy of the old renderer, effects, masks and observer preserves the independent
  CE0 oracle; family matrices use it after production defaults migrate. Added an
  all-176 native-versus-frozen and reverse-seek/default acceptance suite.
- **Results:** 85 focused unit tests, build, scoped lint and boundaries pass. Legacy
  seven-fixture smoke passes both backends / 70 forward and reverse frames at the
  unchanged near tier. Full timelines/exports/hardware and the new suite are unrun.
- **Open / next:** defer timing/browser acceptance while PR42's timed full gate runs;
  finish remaining depth acceptance and default migration before the final gate/PR.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d legacy adapter checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** all six legacy presets compile to native layers and local primitive
  providers; followers use native constraints and inspectable progress signals.
  CLI composition export accepts the frozen legacy format.
- **Results:** 15 focused unit tests and build pass, including every fixture frame,
  provider state, inherited transforms/opacity, supported fps/duration extremes
  and follower anchor/parent compatibility. Final depth checkpoint recheck passes
  all 17 cases / 1,530 forward/reverse frames with zero pixel delta.
- **Rejected:** uncompressed progress exceeded the existing signal key limit;
  remove only unchanged hold values. Legacy rejects mismatched follower parents.
- **Open / next:** legacy pixel/export/hardware acceptance, then default migration
  and remaining depth integration acceptance before the complete gate and PR.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d flat/depth adapter checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** verified prepared assets compile to native depth or flat image layers;
  deterministic auto choice is shared with preparation. Native image-plane controls
  preserve linear filtering/reveals, local clocks and explicit alpha policy.
  Resource budgets and shader/asset cache identities are checked before painting.
- **Results:** 158 focused unit tests, build and scoped lint pass. All 17 adapter
  timelines match old pixels exactly across 1,530 forward/reverse frames; final
  checkpoint recheck follows added budget/cache metadata. No defaults switched yet.
- **Open / next:** additional depth acceptance, six legacy presets and production
  family renderer consolidation, then complete milestone gate and PR.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d depth pixels exact

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** shared-device native depth output matches all seven captured depth
  cases exactly: 630 forward and 630 reverse frames, channel delta 0.
- **Repair:** preserve original mesh/MSAA orientation through resolve, then flip
  texel rows. Initial frame-9 delta 4 is retained in evidence; no thresholds or
  references changed. The isolated focused browser and build pass.
- **Open / next:** native flat-image compatibility, preset adapter and full family
  consolidation; exports, hardware, integration/costs and full gate remain pending.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d native depth checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4d`.
- **Done:** 17 old-depth cases captured; 1,530 forward/reverse frames and all stored
  hashes/state records pass independent repeat, with 51 sample PNGs preserved.
  Native contract, local evaluation, paths, builder, inspector tracks and shared
  device depth draw are implemented; no nested Three renderer is used.
- **Results:** 151 focused unit tests, build and scoped lint pass. Native browser
  parity, remaining adapters/default consolidation and full acceptance are pending.
- **Rejected / do not repeat:** JSON signed-zero state mismatch corrected without
  pixel changes; invalid test expression/self-driver payloads corrected.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4d reference capture begins

- **Agent / branch:** Codex on `codex/composition-ce4d`, from CE4c `17666eb`.
- **Scope:** legacy/depth adapters and renderer consolidation, after attached
  [PR #45](https://github.com/xxibcill/still-shift/pull/45).
- **Done:** independent old-depth capture harness and source/depth fixtures for
  17 landscape/vertical, flat, fallback and discontinuity cases.
- **Results:** TypeScript build passes. Browser capture and native integration
  remain pending; the old renderer and frozen CE0 references are unchanged.
- **Open / next:** capture references before replacing depth drawing, then native
  contract/evaluation/shared WebGL integration and family consolidation.
- **Records:** [CE4d evidence](./composition-ce4d-results.json).

### 2026-10-06 — CE4c complete verification checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, runtime `37cc07a`.
- **Results:** complete pinned `pnpm check` on `e1fb3e3` exits 0: 1,938 unit,
  46 runtime, 140 integration and 14 depth tests; all required browser groups;
  176 frozen items / 36,061 frames with unchanged references. Final cinematic
  acceptance passes 46 cases / 5,520 forward/reverse frames, 46 independent encodes,
  138 production exports, 138 hardware comparisons and the real inspector.
  All four full Canvas matrices retain the existing 1.25 timing limit.
- **Open / next:** create and attach the stacked CE4c PR, then CE4d on its own
  branch. Deferred WebGL speed work remains CE6-P. No source or thresholds changed
  during the final gate. Earlier failed attempts remain recorded.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c complete native acceptance checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, runtime `37cc07a`.
- **Results:** required native suite passes 46 backend cases / 5,520 forward and
  reverse frames, delta2, 46 independent encodes, 138 production exports, 138
  hardware comparisons and real inspector edits/undo/reload. Canvas timing max
  1.087 passes the unchanged 1.25 limit; WebGL timing remains assigned to CE6-P.
  Hardware minimum PSNR 48.111 / SSIM 0.998063 passes unchanged policy.
- **Open / next:** complete `pnpm check` is in typography, with frozen-baseline
  closure still pending. No code or reference changes during the gate.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c full family matrix checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, full snapshot `e1fb3e3`.
- **Results:** complete Story Canvas 69 cases / 14,086 frames (max ratio 1.175)
  and Commerce Canvas 127 / 28,200 (max ratio 1.190, delta1) pass the unchanged
  pixel and 1.25 timing limits. No source or reference changes during this gate.
- **Open / next:** full cinematic acceptance, typography and frozen-baseline
  closure remain pending. The complete `pnpm check` is still in progress.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c final gate non-browser checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, full snapshot `e1fb3e3`.
- **Results:** pinned preflight, 1,938 unit / 46 runtime / 140 integration / 14
  depth tests pass. All 1,857 tracked snapshot files match the committed tree.
  The unchanged preview-watch recovery test and repaired cinematic CLI assertion
  pass in the complete integration group.
- **Open / next:** the full browser chain remains in flight; timed matrices,
  final native cinematic acceptance and frozen-baseline closure are still pending.
  No source, threshold or reference was changed during this gate.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c full correctness diagnostic checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, final runtime `37cc07a`.
- **Results:** prior checkpoint `640c8c5` completes 44 cases / 5,328 forward and
  reverse frames, delta2, 44 independent encodes / 132 production exports, 132
  hardware comparisons and real inspector with exit 0. Final close-focus behavior
  already passes both full focus variants. Final pinned preflight also passes.
- **Open / next:** full `pnpm check` includes the required timed 46-case cinematic
  matrix. Timing was omitted only from the private diagnostic; required source
  assertions, frozen references and pixel policy remain unchanged.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c complete focus correctness checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, focus code `37cc07a`.
- **Results:** ordinary and close-gap focus pass both backends: 384 complete
  forward/reverse frames, delta1, four independent encodes / 12 production exports,
  repeat/PNG/raw identity, 12 actual hardware comparisons and the real inspector.
  Hardware minimum PSNR55.35 / SSIM0.99956; eight comparisons are exact.
- **Open / next:** all 46 final-code cases with unchanged timing assertions and
  complete pinned `pnpm check`. Timing was omitted from this diagnostic while
  independent exports/measurements remain active; no milestone completion claim.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c bounded close-focus compatibility checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, regressions `5335756`.
- **Done:** normalize artistic focus coordinates only for valid recipes exceeding
  the unchanged native aperture budget; physical geometry stays unchanged.
- **Results:** 37 focused tests/build/schema/lint pass. Three new close-gap cases
  reproduce all 288 states with <=0.000001px blur error and unchanged projection.
- **Rejected:** the previous mapping failed all three valid cases at aperture1000;
  camera limits and parity tolerances remain unchanged. Add the close-gap fixture
  to required rendered/export/hardware acceptance (46 cases / 5,520 frames).
- **Open / next:** new-case rendered checks, final native acceptance and pinned
  gate; the ongoing prior-code correctness diagnostic retains its original scope.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c camera and lighting regression checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, CLI `640c8c5`.
- **Results:** native camera and lighting commands finish with exit 0: stored
  hashes, exports and inspectors pass, with 36 / 45 hardware comparisons. The
  four preview-watch tests pass with their unchanged 5000ms timeout; 14 depth tests
  pass. Earlier integration ended at 138 / 140 passing tests, with the CLI repair
  and isolated watch verification now complete.
- **Open / next:** full native timelines/exports are running as an untimed
  diagnostic; required performance acceptance and complete pinned gate remain.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c hardware and CLI checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, fixture `9c2a97d`.
- **Done:** CLI assertions locate the unique camera independently of paint order.
- **Results:** all seven CLI integration tests/build/lint pass; 132 actual Metal
  comparisons pass (67 exact, minimum PSNR48.11/SSIM0.99806) and real inspector
  edits/history/save/reload/backend switches pass. Pinned unit/runtime pass.
- **Rejected:** stale CLI array-position assertion and a localhost-restricted
  invocation. The broader preview-watch test timed out at its unchanged 5000ms;
  an isolated rerun and complete gate remain pending.
- **Open / next:** full native software/export/timing acceptance, complete gate and
  preview-watch verification. Concurrent independent suites remain active.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c native control fixture checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, order `44588fe`.
- **Done:** share the native inspector framing/focus example with contract coverage.
- **Results:** 132 contract tests and all 1,935 unit tests / 195 files pass;
  build and focused lint pass. Frozen CE1 and CE0 fixtures remain unchanged.
- **Rejected:** full preflight stopped at one field-inventory assertion after
  1,934 passing tests; runtime/depth were not reached. New controls now have a
  dedicated CE4c fixture instead of modifying the old every-field document.
- **Open / next:** full native acceptance and pinned local gate; browser timing
  remains queued behind active independent suites and coordination permission.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c effect ordering and exposure checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, alpha `6fdb243`.
- **Done:** native paint-order conversion and shutter sampling of adjustments.
- **Results:** all 15 fixtures plus seven effect variants pass sampled forward and
  reverse pixels (44 cases / 220 frames, delta1); real temporal editing, frustum,
  undo/redo, save/reload and backend switch pass. 26 focused tests/build/lint pass.
- **Rejected:** grain-before-art (delta8), central-frame-only grain during exposure
  (delta4), and an inspector fixture requesting unsupported spatial xy tangents.
  Repairs retain the schema and pixel policies.
- **Open / next:** full native acceptance and complete pinned local gate; independent
  reviews are active, so timings remain queued. Coordination permission is pending.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c persisted alpha safety checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, raster fix `c3f85ec`.
- **Done:** persisted background alpha/native coverage and semantic reveal checks;
  all six shared-effect variants and real framing editor/save/reload acceptance.
- **Results:** 26 focused tests, build/lint and schema generation pass. The new
  browser checks and final full gate remain pending. Initial narrowing build
  failure is repaired and retained in the evidence.
- **Open / next:** native smoke/full matrix and complete local verification.
  Independent review gates are active; timed checks are queued. Automatic review
  rejected a coordination follow-up; explicit user authorization is pending.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c source raster consistency checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, raster `f7b1302`.
- **Done:** natural-size image caches follow destination CPU/default raster modes.
- **Results:** 11 focused tests/build pass; six actual hardware samples pass.
  The complete focus run before the fix passes both software timelines, seeks,
  timing and independent/repeated/raw exports, but hardware middle-frame SSIM
  is 0.98918. The scoped fix makes that frame exact without changing policy.
- **Open / next:** persisted asset alpha safety, final full native matrix and local gate.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c affine raster and acceptance checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, adapter `48c9a70`.
- **Done:** direct affine natural-size images with preserved spatial preflight,
  matte/focus semantics and bounded Gaussian overscan; full native acceptance harness.
- **Results:** 58 focused tests, build/lint pass. Initial all-fixture sampled smoke
  is exact (150 frames); final focus cleanup stays near (10 frames, delta1).
  The first double-resampling pixel failure (delta88) remains recorded.
- **Open / next:** full forward/reverse pixels, unchanged Canvas timing, streamed
  independent/repeated/raw exports, hardware and complete local gate; no PR yet.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c camera/plane adapter checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, framing `c5a3816`.
- **Done:** native camera/plane compiler, explicit Gaussian/artistic focus,
  existing safety rules on evaluated native geometry, shared shutter/effects and CLI JSON.
- **Results:** all 15 fixtures / 2,160 frames pass state parity; 132 focused unit
  tests, seven CLI integrations and build pass. Earlier fixture/roundoff/harness
  failures are recorded. Browser parity harness is authored; acceptance is pending.
- **Open / next:** rendered pixels/timing, repeats, independent export agreement,
  hardware and complete local gate before CE4c PR delivery.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE4c native framing checkpoint

- **Agent / branch:** Codex on `codex/composition-ce4c`, from CE8-L `e1bd4bc`.
- **Done:** bounded xy camera offset, shared point/plane/frustum geometry,
  local-clock property/expression evaluation and inspector key discovery.
- **Results:** 91 focused tests / 11 files and build pass; schema/reference generated.
  Strict xy rejection and the corrected timing fixture are recorded in evidence.
- **Open / next:** cinematic adapter, focus/coverage/framing and all-frame parity,
  native acceptance and full local gate; no completion or PR claimed yet.
- **Records:** [CE4c evidence](./composition-ce4c-results.json).

### 2026-10-06 — CE8-L complete local gate

- **Agent / branch:** Codex on `codex/composition-ce8-lighting`, code `d72ba2c`,
  verified checkpoint `3820c1c`.
- **Done:** every lighting checklist and native/full local acceptance passes.
  Schema/reference/authoring/inspector, cache/Canvas failure retention and independent
  pixels/alpha/exports/hardware are delivered with new-only lighting baselines.
- **Results:** full `pnpm check` terminal zero: 1,889 unit / 46 runtime / 139
  integration / 14 depth, every required browser group, all 176 frozen items /
  36,061 frames and unchanged Canvas family pixel/timing policy. All 141 visual
  files remain exact. Serial costs and earlier failures, including the first full-gate timing failure,
  are recorded. A complete rerun from the start passes unchanged assertions.
- **Open / next:** create/attach the milestone PR, then CE4c on a new branch.
  CE6-P and advanced lighting remain separate; no owner decision is pending.
- **Records:** [Lighting evidence](./composition-ce8-lighting-results.json).

### 2026-10-06 — CE8-L full-gate timing diagnosis

- **Agent / branch:** Codex on `codex/composition-ce8-lighting`, checkpoint `3820c1c`.
- **Results:** full gate passed unit/runtime/integration/depth, native lighting and
  preceding browser groups, then stopped at passage-components instances: timing
  1.312 exceeds 1.25. All 60 completed story cases pass pixel assertions.
- **Diagnosis:** serial focused CE8/CE8-L profiles pass at 1.217/1.154, exact pixels;
  paired readback totals vary. No lighting work enters this nonspatial scope.
- **Rejected:** do not relax timing, regenerate baselines, skip suites or report the
  failed full gate as passed. No production change is justified by these profiles.
- **Open / next:** rerun the complete gate from the start; PR remains pending.
- **Records:** [Failed attempt and profiles](./composition-ce8-lighting-results.json).

### 2026-10-06 — CE8-L native acceptance and serial-cost checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8-lighting`, final code `d72ba2c`.
- **Done:** all native pixels/alpha/seeks, repeated/independent exports, hardware,
  Canvas failure retention, legacy identity and actual inspector acceptance pass.
  Commit only the new lighting baselines; all 95 existing visual files remain exact.
- **Results:** 480 forward / 480 reverse / 135 seek frames; 416 transparent frames
  with zero alpha delta; 45 production / 15 independent exports; hardware 43 exact
  and two near. Serial 1080p medians for 1,4,8 lights / four receivers are
  49.5/51.4/52.0 ms at one sample and 224.4/215.2/242.1 ms at four samples.
- **Open / next:** complete local `pnpm check`, then create and attach the milestone
  PR and continue CE4c on a new branch. No baseline/timing policy is relaxed.
- **Records:** [Lighting evidence](./composition-ce8-lighting-results.json).

### 2026-10-06 — CE8-L inspector acceptance correction

- **Agent / branch:** Codex on `codex/composition-ce8-lighting`.
- **Done:** observe edited key values through undo/redo instead of waiting for a
  source-file revision during local draft edits; document the lighting workflow.
- **Results:** all 1,889 unit tests / 192 files and TypeScript lint pass on `1d89a2f`.
  Focused real inspector edit, undo, redo and save passes without page errors.
- **Rejected:** the native group's inspector wait timed out after all 13 fixture,
  legacy identity, Canvas failure and hardware checks completed. It waited for
  revision3, but source revision changes only on saving. Production was unchanged.
- **Open / next:** rerun the complete lighting group, record serial costs and then
  run the complete local gate. No legacy baseline or tolerance is changed.
- **Records:** [Lighting evidence](./composition-ce8-lighting-results.json).

### 2026-10-06 — CE8-L alpha and oracle checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8-lighting`.
- **Done:** corrected the independent preview oracle's opaque output assumption;
  added all-frame transparent-target alpha checks, implicit-unlit adapter identity,
  and precomp-scope/camera-independence regressions.
- **Results:** permitted integration rerun on `07165bc` passes 139 tests / 39 files;
  15 focused lighting integration tests and build pass.
- **Rejected:** first native ambient comparison failed (delta46); test oracle
  expected transparent final pixels despite CE3's black flattening. Shader was
  confirmed correct with pinned debug pixels. No baseline or tolerance changed.
- **Open / next:** execute new RGBA/helper checks, complete native acceptance and
  serial costs, then run the complete local gate before the milestone PR.
- **Records:** [Lighting evidence](./composition-ce8-lighting-results.json).

### 2026-10-06 — CE8-L authoring and native acceptance checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8-lighting`.
- **Done:** 13 pinned native scenes, independent lighting oracle, required runner,
  builder receiving, inspector light key/source controls and generated reference.
- **Results:** pinned ambient/point/spot smoke passes on `8e9b0e3`; build, 34 focused
  tests and all 132 contract/reference tests pass. Integration requires a permitted
  isolated rerun after sandbox listen/browser EPERM; no full pass is claimed.
- **Next:** all-frame/export/hardware/inspector acceptance, serial costs, full gate.
- **Records:** [CE8-L evidence](./composition-ce8-lighting-results.json).

### 2026-10-06 — CE8-L GPU graph and backend checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8-lighting`.
- **Done:** receiver-relative WebGL shading before local effects/masks; light-aware
  cache identity; all-graph and shutter preflight rejects required Canvas lighting.
- **Results:** build and 55 focused tests pass. New fixture-draft contract errors
  were repaired before acceptance; pinned GPU pixel/export checks remain pending.
- **Next:** native fixtures, independent pixel references, authoring and inspector.
- **Records:** [CE8-L evidence](./composition-ce8-lighting-results.json).

### 2026-10-06 — CE8-L contract and pure model checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8-lighting`, from CE8 `9d8f33a`.
- **Done:** bounded light controls and receiver validation, XYZ property paths,
  scoped light state and two-sided linear diffuse reference model.
- **Results:** build passes; 24 focused model/property/optical tests pass after
  correcting a floating-point oracle assertion. Empty-light identity stays exact.
- **Next:** WebGL shading before effects, cache identity and Canvas preflight;
  native acceptance, full local verification and the milestone PR follow.
- **Records:** [CE8-L evidence](./composition-ce8-lighting-results.json).

### 2026-10-06 — CE8 camera milestone complete

- **Agent / branch:** Codex on `codex/composition-ce8`, final code `16262ec`.
- **Done:** native camera/XYZ/plane/coverage/inspector capability; compiled ordinary
  scope fast paths retain implicit-reference writers and exposure preflight.
- **Results:** complete gate passes 1,841 units, 46 runtime, 139 integration,
  14 depth tests, every browser group and 176 frozen baselines / 36,061 frames.
  Full Canvas matrices, native oracles/hashes/seeks/exports/hardware pass unchanged
  policies; final-code serial 1080p costs refreshed without competing workloads.
- **Limits:** Canvas affine-only; flat precomps and 2D constraints; CPU raster
  boundaries and non-real-time high-plane costs documented. CE6-P remains separate.
- **Next:** [PR #43](https://github.com/xxibcill/still-shift/pull/43) is open and attached; CE8-L and remaining approved milestones follow.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 ordinary-scope hot-path checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after `3b277d5`.
- **Failure:** second full gate passed unit/runtime/integration/depth and preceding
  browser groups, then calibration-pan pixels passed but timing was 1.285× > 1.25.
  Remaining family matrices and frozen-baseline stages did not execute.
- **Repair:** compiled spatial/reference-writer inventories avoid repeated scans;
  root binding IDs avoid allocation. Existing writer windows/axes are retained.
- **Focused result:** pinned isolated calibration passes at 1.227×, delta one;
  146 focused units and build pass. Timing variability remains documented.
- **Next:** repeat complete gate on committed code; milestone PR remains pending.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 final-gate example inventory repair

- **Agent / branch:** Codex on `codex/composition-ce8`, after `3665326`.
- **Failure:** full gate passed 1,840 units and 46 runtime tests, then stopped
  at one stale integration inventory: nine expected examples, ten present.
  Other 138 integration tests passed; later suites did not execute.
- **Repair / focused result:** strict inventory now requires ten; all ten
  programs compile and validate pinned assets in the focused integration test.
  Runtime code and complete native acceptance/cost evidence are unchanged.
- **Next:** complete final-code gate repeat; no incomplete pass claimed.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 native acceptance checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, final code `5effcf3`.
- **Results:** complete native acceptance with profile exits zero: 384 forward,
  384 reverse frames / 108 seeks, exact stored hashes and independent oracles;
  36 production/repeat/raw exports and 12 independent preview MP4s identical.
  All eight expected failures, inspector checks and 36 actual hardware comparisons
  pass; maximum channel delta one. Six serial 1080p cost cases recorded.
- **Limits:** costs range 12.3 ms (one plane / one sample) to 2,556.3 ms (64 / four),
  without a real-time claim. CE6-P remains separate; no frozen regeneration.
- **Next:** full pinned final-code local gate, milestone PR, then CE8-L.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 native baseline and cost fixture checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after `23ba343`.
- **Done:** new CE8-only baseline (384 hashes / 36 PNGs); corrected the optional
  one-sample cost fixture to use disabled blur with schema-valid configuration.
  Actual one/four exposure counts are asserted. Four native PNGs inspected.
- **Results:** committed repaired native correctness/export/inspector/hardware
  checks pass. Optional cost phase then rejected samples=1; failure retained.
  No complete command or final gate pass is claimed yet.
- **Next:** complete native profile repeat, final gate, milestone PR then CE8-L.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 hardware raster checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after `f9385cc`.
- **Done:** native Canvas 3D references and GPU affine bitmap coverage use pinned
  CPU raster preparation. Ordinary 2D selection is unchanged; true perspective
  and GPU composition remain GPU operations. Sampling/raster domains documented.
- **Results:** all 1,840 units pass. First native run passed all frames/seeks and
  36 production/repeat/raw plus 12 independent exports, then failed hardware
  Canvas affine PSNR 39.84 against unchanged 40. Repaired hardware: all 36
  comparisons pass, maximum channel delta one.
- **Next:** committed-source native repeat/cost, full gate, CE8 PR then CE8-L.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 focused verification checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after `a73841f`.
- **Done:** format/generated schema/reference/skill and type/test repairs;
  corrected camera-facing columns, native affine bitmap coverage and projective
  quantizer boundary handling, preserving legacy placement and pixel tolerances.
- **Results:** pinned toolchain, schema, build, lint and boundaries pass;
  139 affected units and 384 native browser frames pass. Independent affine,
  perspective/checker/clipping pixels are exact; eight expected failures and
  real inspector tangent/frustum/undo/save checks pass.
- **Rejected:** initial build/unit/inventory and raster/precision failures retained
  in evidence. Initial all-unit run: 1,839 pass / one inventory failure, repaired.
- **Next:** repaired all-unit run; native hardware/exports/cost; full final gate and PR.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 camera basis checkpoint and verification release

- **Agent / branch:** Codex on `codex/composition-ce8`, after `6e28b42`.
- **Repair:** singular camera world transforms fail before POI fallback;
  scale/roll analytic cases and basis semantics are authored.
- **Coordination:** CE6-P explicitly released the reserved quiet window at
  01:24 UTC after its timing/audit/export/provenance workload became terminal.
- **Verification:** no CE8 check run yet; pinned isolated focused checks start now.
- **Next:** repair focused findings, native acceptance, full gate and milestone PR.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 derived optics source review checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after `0779c31`.
- **Repair:** derived focal/zoom reads include primary optic and film expression
  dependencies; validation rejects implicit optical feedback. Primary focal
  expressions settle before film writes, including motion-selected modes.
- **Authored:** reverse-order/driver/cycle regressions; surface callback optional
  typing and camera-switch fixture field names corrected by source review.
- **Verification:** unexecuted; coordinated CE6-P quiet window remains active.
- **Next:** focused checks, native acceptance and the complete local gate.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 builder and inspector source checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after `a2c302e`.
- **Repair:** camera constructors retain the scope-based default rather than the
  2D origin. XYZ static setters and z tracks preserve ordinary 2D tuples.
- **Authored:** native camera example, guidance source/notes and real inspector
  checks for POI edits, world frustum corners, undo/redo and source saving.
- **Verification:** unexecuted during CE6-P quiet window; schema/reference/skill
  generation remains pending. Lighting availability remains CE8-L.
- **Next:** focused repair, native acceptance and complete local gate after release.
- **Records:** [CE8 evidence](./composition-ce8-results.json),
  [camera example](../examples/composition/10-native-camera.ts).

### 2026-10-06 — CE8 native acceptance source checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after `2e26ae4`.
- **Authored:** ten native scenes, pinned checker/alpha-hole/font resources,
  independent ray/plane and affine references, all-frame seek/hash checks,
  hardware comparisons, repeated/raw/independent exports and coverage failures.
  The native browser group joins the local gate; serial 1080p costs are opt-in.
- **Verification:** none run, no baseline generated; CE6-P quiet window remains
  active. Source fixtures and test code do not constitute acceptance evidence.
- **Next:** focused repair, real inspector flow, native acceptance and full gate.
- **Records:** [CE8 evidence](./composition-ce8-results.json),
  [native scene guide](../benchmarks/fixtures/composition/ce8/README.md).

### 2026-10-06 — CE8 projected group mask checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after `1bf1b93`.
- **Scope:** local mask bounds/support project through the actual group plane;
  inversion/combination follows projection. Surface/backend preflight, analytic
  coverage cases and camera POI tangent editing are authored.
- **Verification:** unexecuted; CE6-P quiet window remains active. Git reported
  background auto packing at the previous commit; process inspection at 00:57 UTC
  found none remaining. Further Git calls disable automatic packing per command.
- **Next:** independent native acceptance and focused/full checks after release.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 mirror and typed integration review checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after inspection `c17af4d`.
- **Review repair:** camera-facing orientation uses an absolute-scale parent basis,
  retaining authored mirror axes in the artwork plane; an explicit regression is
  authored. Capture frames omit absent optional state and graph summaries include
  the new operation; the old unavailable-3D case now tests 2D-constraint rejection.
- **Verification:** source review only; no formatter/build/test/matrix/export ran.
  The CE6-P quiet window remains active.
- **Next:** projective group masks and independent native acceptance after release.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 projected inspection and focus overscan checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after native activation `93b92b2`.
- **Authored:** actual homographic anchors/paths/tangents and nested inspection;
  camera inset from evaluated world-space near/focus corners; projected quality
  bounds, scale, velocity and signatures, with owning-scope coverage semantics.
- **Review repair:** focus uses bounded screen overscan before lens blur and crop,
  preserving offscreen artwork; required coverage checks actual shutter samples.
- **Verification:** analytic/track/allocation cases are authored but unexecuted.
  The CE6-P quiet window still holds builds, formatters, tests, matrices and exports.
- **Next:** focused checks after release, then independent native acceptance/full gate.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 native activation and coverage checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after projective path `c95eb8e`.
- **Authored:** native validation/activation, deterministic 3D path orientation and
  camera-writer rules; actual required-layer alpha across active scope frames,
  optional warning policy and preflight of all spatial exposure samples.
- **Authoring:** xyz/orientation/POI/optics tracks and dimensional tangent edits;
  native integration/shake/order/validation cases are authored but unexecuted.
- **Limits:** constraints retain their explicit 2D geometry and reject spatial
  target/reference ancestry; light availability remains CE8-L.
- **Verification:** no formatter/build/test/matrix/export ran; CE6-P holds the lane.
- **Next:** genuine projective inspector/quality geometry, focused checks after release.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 projective rendering checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after stable order `20f6dd9`.
- **Authored:** camera-facing orientation retaining anchors/linear geometry; bounded
  local artwork → GPU homography → focus lens blur → scope matte/composite path,
  projective clips and named inputs; nested capability checks precede target writes.
- **Review:** unbounded local effect domains and focus support are explicit;
  perspective collapse/echo/cross-plane coordinate limits have structured errors.
- **Verification:** analytic and transactional cases are authored but unexecuted.
  Builds, formatters, tests, matrices and exports remain held for CE6-P.
- **Next:** native validation, genuine camera/plane inspection and coverage acceptance.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 stable 3D order checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after scoped camera `62c04fa`.
- **Authored:** stable camera-depth ordering within drawable 3D runs, retaining
  authored ties, 2D barriers and group ownership; anchor depth survives empty bounds.
- **Verification:** ordering regressions are authored but unexecuted. No formatter,
  build, test, browser matrix or export ran during the active CE6-P quiet window.
- **Next:** billboard orientation and projective rendering, coverage and inspection.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 scoped camera/projection checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after evaluated state `50ac556`.
- **Authored:** active scoped camera selection after world transforms, native
  orientation/parent-space POI, local defaults and legacy story-jolt camera input;
  actual homography/bounds/depth/focus state and world-space frustum corners.
- **Review:** one-node geometry must omit the default POI; camera selection reuses
  the scope map. Independent switch/solo/parent/scope/jolt/focus cases are authored.
- **Verification:** no test, formatter, build, browser matrix or export has run;
  the CE6-P quiet window remains active. Native availability is still gated.
- **Next:** billboard orientation, ordered projective graph/backend, real camera
  inspection and coverage; focused verification after release before acceptance.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 evaluated spatial state checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after sampling `179d903`.
- **Authored:** actual xyz values/property writes, sealed camera/POI/orientation
  copies, primary optic refresh, spatial-scope parent world matrices and structured
  optical/world diagnostics; evaluator source version 45. Ordinary 2D scopes
  retain their affine path; native camera/3D availability remains gated.
- **Verification:** component/copy/optical refresh cases are authored but unrun;
  the CE6-P reservation still holds builds, formatters, tests, matrices and exports.
- **Next:** scope camera projection and shared graph/backend integration, followed
  by focused checks after release before claiming any slice verified.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 shared camera sampling checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after expression/path `e7221a4`.
- **Authored:** shared xyz/camera defaults and keyed sampling, one/two-node/POI
  selection, focal/film conversion, optical range/clip-order checks and explicit
  ambiguous-control rejection. Camera sampling uses the supplied layer clock.
- **Verification:** exact-default/fractional/optics cases are authored but unrun;
  builds, formatters, tests, browser matrices and exports remain held for CE6-P.
- **Next:** evaluated state/parent matrices/scope cameras, then shared projective
  rendering; verify all authored slices when the release arrives.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 spatial expression/path checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, after sampler `0f83ff2`.
- **Authored:** xyz own-key curves/loop offsets/full-distance roving; implicit-z
  scale defaults; typed camera optics/POI and spatial transform/reference paths.
  Existing 2D expression roving arithmetic is unchanged.
- **Verification:** independent interpolation/loop/roving/path cases are authored
  but unexecuted; the CE6-P quiet window still holds all verification workloads.
- **Next:** connect evaluated spatial/camera values, parent world matrices and
  scope camera selection; verify authored slices after the release message.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 xyz sampling checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`; preceding checkpoint `88dd444`.
- **Authored:** opt-in static/grouped/separated xyz sampling, three-dimensional
  spatial arc lengths/speed handles, and explicit implicit-z/cache defaults.
  The existing 2D sampler and its arithmetic are unchanged.
- **Verification:** analytic fractional/reverse/shared-cache cases are authored;
  no test, formatter or build ran during the coordinated CE6-P quiet window.
- **Next:** focused verification after release; integrate xyz property reads,
  expressions/baking and scope camera evaluation before projective rendering.
- **Records:** [CE8 evidence](./composition-ce8-results.json).

### 2026-10-06 — CE8 camera contract and analytic geometry checkpoint

- **Agent / branch:** Codex on `codex/composition-ce8`, from CE6 `2f1a99c`.
- **Authored:** bounded camera optics, parent-space POI and required coverage;
  pure 4x4 transforms, camera bases, inverse homography, near/far polygon clipping
  and capped lens circle of confusion; independent hand-computed test cases.
- **Verification:** not run or formatted yet; preserve the coordinated CE6-P
  machine reservation until its release. No runtime availability is claimed.
- **Next:** verify this slice after release, then xyz sampling/property paths and
  evaluator/graph/backend integration. CE8-L follows CE8 as approved.
- **Records:** [CE8 evidence](./composition-ce8-results.json), [CE6 PR #42](https://github.com/xxibcill/still-shift/pull/42).

### 2026-10-06 — CE6 complete local verification

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** complete 39-effect catalogue and all audit/acceptance slices; runtime
  `4cd8a8d`, final code/test checkpoint `f11a7b7`, frequent checkpoints pushed.
- **Results:** full `pnpm check`: 1,712 unit / 46 runtime / 139 integration /
  14 depth tests, all browser groups and 176 frozen baselines / 36,061 frames.
  All full Canvas family matrices pass unchanged pixel/timing assertions.
- **Acceptance:** native hashes/seeks and independent/repeated exports pass;
  36 actual hardware comparisons pass perceptual policy; 78 serial costs recorded.
- **Retained:** two early full-gate failures and repairs; WebGL speed targets
  remain deferred to CE6-P, with no threshold or frozen-baseline changes.
- **Next:** [PR #42](https://github.com/xxibcill/still-shift/pull/42) is open and attached; begin CE8 and the remaining approved sequence.
  Further verification waits for the coordinated CE6-P quiet-window release.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 blur-alias contract expectation repair

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Result:** full gate at `86a7143` passed formatting/lint/build and 1,711 unit
  tests, then stopped on the old unavailable-blur expectation. The native alias
  requires one declared primitive effect and correctly reports a property error.
- **Repaired / verified:** update that contract assertion; all 1,712 unit tests
  in 165 files pass. No renderer, threshold or frozen baseline changed.
- **Next:** the complete full gate on the repaired checkpoint, CE6 PR and CE8.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 full-gate formatting repair

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Result:** full `pnpm check` at `46cc000` stopped at formatting before test
  suites ran. Wrapped the earlier unknown-effect contract assertion with Prettier;
  renderer semantics, thresholds and frozen baselines are unchanged.
- **Next:** complete-snapshot format preflight and the full command on the repaired
  checkpoint, then CE6 PR and CE8. Native/export/hardware/cost proof remains valid.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 native catalogue acceptance checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** six 32-frame native scenes cover all 39 effects; new stored hashes/
  PNGs and permanent seeking/export/hardware checks; serial per-effect costs.
- **Results:** build/lint/schema/boundaries and stored-fixture coverage unit pass.
  384 forward hashes, 384 reverse checks and 132 seeks meet software delta 1.
  All 24 production PNG/raw MP4 outputs and 12 independent preview encodes agree;
  36 actual Apple GPU comparisons meet the unchanged perceptual policy (max
  delta 47, minimum PSNR 53.39/SSIM .99916). Frozen baselines are unchanged.
- **Costs:** 78 serial 1080p backend rows record cold/warm costs; SwiftShader warm
  medians range 12.5–180.6 ms. CE6-P speed acceptance stays deferred.
- **Next:** final complete `pnpm check`, CE6 PR, CE8 branch and remaining milestones.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 GPU Gaussian and feather checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** mapped-sigma clamp and progressive GPU Gaussian rescaling replace
  oversized-feather image readback/Canvas filtering; source geometry retains
  prefilter opacity and lower-sigma image arithmetic stays unchanged.
- **Results:** 11 focused tests, build/lint/schema/boundaries; 84 native renders/
  seeks across radii 136–1,000 and even/odd dimensions meet delta 2/PSNR 53.
  All 18 extreme-scale feathers are exact; 68 prior WebGL cases still pass.
- **Rejected:** triangular prefix convolution and clamping alone failed modern
  raster rescale parity; removed. No threshold or frozen baseline changed.
- **Next:** native hardware/hash/export/serial-cost acceptance, complete CE6 gate/
  PR, then remaining milestones in plan order. This is not a full `pnpm check`.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 captured history and path audit checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** captured input/matte groups and precomps retain adjustment echo when
  their caller is absent at earlier frames. Primitive blur aliases bind real
  declared effects through drivers and expressions; native path errors are current.
- **Results:** 119 focused tests, build/lint/schema/boundaries; 24 exact independent
  native captures and previous 17 input / 54 adjustment cases and clock/pixel oracles
  pass. No threshold or frozen baseline changed; this is not a full `pnpm check`.
- **Next:** GPU high-sigma/feather repair, final hardware/hash/export/serial-cost
  proof, complete CE6 gate/PR, then remaining milestones in plan order.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 optional linear-light checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** all layer blend modes, adjustment/exposure linear interpolation,
  bounded GPU transfer controls, unbatched layer boundaries and cache invalidation.
- **Results:** all 1,700 unit tests plus build/lint/schema/boundaries; 180 native
  cases / 2,160 frames / 2,520 seeks meet delta 2/PSNR 50. All 559,215 byte-pair/
  mode cases meet delta 1; 20 independent pixels/exposure and six cache switches
  pass. 28 affine offscreen blur cases / 336 frames / 392 seeks are exact.
- **Repaired:** undersized unit fixture and stale unavailable-zoom assertion;
  no threshold or frozen baseline changed. This is not a complete `pnpm check`.
- **Next:** final feature/fallback/source-history audit, hardware/hash/export/
  serial costs and complete CE6 full gate/PR, then CE8.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 adjustment backdrop history checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** scoped upstream history, bounded replay, adjustment primitive blur,
  historical glyph preparation/cleanup and GPU offscreen blur input padding.
- **Results:** 54 focused tests and build/lint/schema/boundaries; 54 native
  cases / 648 frames / 756 seeks meet delta 2/PSNR 50. Independent echo pixels
  are exact; six animated offscreen precomp cases / 72 frames / 84 seeks are exact.
- **Repaired:** initial snapshot links and oracle anchor; offscreen blur clipped
  input before filtering (delta 21), repaired with finite GPU capture padding.
  No threshold or frozen baseline changed.
- **Next:** linear-light, broader affine regressions and complete CE6 acceptance/PR.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 native map/wipe checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** GPU/Canvas displacement and gradient wipe use owned scoped maps;
  gradient-ramp 1.1.0 uses canonical projection and geometry/color controls.
- **Results:** 80 focused tests and build/lint/schema/boundaries; 54 cases /
  648 frames / 756 seeks, maximum delta 1. All 114,688 gradient ranks and
  393,216 signed quotients per backend are exact. Staged map bytes and
  independent displacement/wipe pixels pass; 27 gradient cases also pass.
- **Repaired / rejected:** one-byte gradient mismatch amplified by displacement;
  fixed projection precision collapsed long gradients. Adaptive precision fixes
  both, with no threshold or frozen baseline changes.
- **Next:** adjustment history, linear-light and complete CE6 acceptance/PR.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

### 2026-10-06 — CE6 scoped layer input checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6-completion`.
- **Done:** named input slots, paired owned snapshots, matching scoped clocks,
  mask/effect/matte capture, combined cycles, bounded depth/work and cleanup.
- **Results:** 162 focused tests plus build/lint/schema/boundaries; nine owner
  and eight source variants / 204 frames / 238 seeks are exact. Hidden masked
  sources remain hidden normally; six remapped scope clock oracles pass exactly.
- **Repaired:** test API assumptions; initially unwired clock helper was caught
  by lint and included in the final native run. No threshold/baseline changed.
- **Next:** map/wipe kernels, adjustment history, linear-light, complete
  hardware/hash/export/cost/full-gate acceptance and CE6 PR.
- **Records:** [CE6 evidence](./composition-ce6-completion-results.json).

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
