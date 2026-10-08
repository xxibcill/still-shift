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

- **CE14 in progress (2026-10-09):** new `codex/composition-ce14` branch starts
  from completed, pushed CE15 `efa42f42`. Animated controls, mesh contracts and deterministic
  geometry and alpha topology are implemented; focused tests and static checks
  pass. Both backends, demo and final acceptance remain in flight. No blocker or owner
  decision is pending. [CE14 plan](./composition-ce14-plan.md).

- **CE15 complete (2026-10-09):** PR #49 checkpoint `ae1a05bb` passes the complete
  pinned local `pnpm check` in 13928.03 seconds. Production code `21817411` has a real
  two-minute benchmark that reaches **3.408×** with identical encoded/frame/audio output.
  All delivery formats, statistics, caching, bounded worker/result admission and
  area requirements are implemented. The 48-case maximum-area matrix, final area
  smoke checks, native/parallel cleanup and frozen baselines pass. PR review/merge
  is the owner's next step; CE14 is the next authorized milestone on a separate branch.
  [Completion evidence](./composition-ce15-completion-results.json).

- **PR #48 third review repairs verified (2026-10-08):** both P2 findings
  posted inline on `1dae23c8` are fixed. Cache identity includes OS/architecture
  (`2fb40127`); audio traversal avoids unrelated visual layout while preserving
  actual dependencies and picture constraints (evaluator 56). Fast checks pass
  2,616 units; 83 affected integrations and native media/Canvas/WebGL passage
  browsers pass. All 176 frozen items / 36,061 frames match. Each finding has its
  own commit, delivered in one normal push; owner review/merge is next. No full
  repository gate is run or claimed. Owner CE15 checkout is untouched.
  [Third review evidence](./pr-48-third-review-fix-results.json).

- **CE13 complete (2026-10-07):** original acceptance at `01fbca2` passes the
  complete local `pnpm check` in 12825.81 seconds, all 63 required commands,
  2,103 unit / 46 runtime / 247 integration / 14 depth tests, 176 defaults and
  176 frozen items / 36,061 frames. Native picture/PCM, waveforms/playback and
  complete passage masters are delivered; exact reverse-seek/export evidence
  remains in [CE13 results](./composition-ce13-results.json).
  [PR #48](https://github.com/xxibcill/still-shift/pull/48) targets `main`.

- **Prerequisites integrated:** CE4d PR #47 and earlier reviewed feature PRs are
  merged into `main`. PR #47 review repairs and frozen/default verification are
  recorded in [follow-up evidence](./pr-47-followup-fix-results.json).
  The approved CE5-X scope retains its audit stop/Q9 owner decisions; CE6-P
  remains owner-paused and deferred, with acceptance incomplete.

- **Continuation:** CE15 implementation and acceptance are complete; the owner's
  separate checkout is preserved. CE14 is active on its separate branch. GitHub Actions
  remain disabled; all verification is local.

## Entries

### 2026-10-09 — CE14 alpha-outline topology

- **Agent / branch:** Codex on `codex/composition-ce14`, after `cfc89aed`.
- **Done:** exact alpha-cell contours, holes/islands, pinned ISC Earcut dependency,
  pin insertion and fixed conforming refinement with explicit geometry limits.
- **Results:** 29 focused tests pass, including all 512 binary 3×3 masks checked
  against independent coverage/area; TypeScript, lint and boundaries pass.
- **Next:** Canvas/WebGL mesh rendering, memory admission, visual and export proof.
- **Records:** [CE14 plan](./composition-ce14-plan.md), [licence](./licenses/earcut-3.0.2.txt).

### 2026-10-09 — CE14 deterministic mesh geometry

- **Agent / branch:** Codex on `codex/composition-ce14`, after `c66defee`.
- **Done:** native Bezier/puppet contracts, rigid MLS, starch-region geometry,
  stable overlap sorting and triangle flip/collapse detection.
- **Results:** 58 focused tests, TypeScript, lint, schema and boundaries pass.
  All 49 rectangular control-grid dimensions are exercised.
- **Next:** alpha topology and both textured-mesh backends; visual/export and
  complete milestone acceptance remain pending.
- **Records:** [CE14 plan](./composition-ce14-plan.md), [evidence](./composition-ce14-results.json).

### 2026-10-09 — CE14 animated point controls

- **Agent / branch:** Codex on `codex/composition-ce14`, from completed CE15 `efa42f42`.
- **Done:** bounded animated point collections with indexed expressions, baking,
  builder paths and Lab key tracks; existing color-curve semantics are preserved.
- **Results:** 177 focused authoring tests, TypeScript, changed-file lint, schema
  freshness and package boundaries pass.
- **Next:** deterministic rigid MLS, alpha-outline meshes, Bezier controls,
  starch/overlap and both renderers. Full milestone acceptance remains pending.
- **Records:** [CE14 plan](./composition-ce14-plan.md).

### 2026-10-09 — CE15 completed acceptance

- **Agent / branch:** Codex on `codex/ce15-completion`; final gate `ae1a05bb`; production `21817411`.
- **Results:** complete local `pnpm check` passes in 13928.03 seconds;
  two-minute one/four-worker proof passes at **3.408×** with exact output.
- **Done:** all CE15 implementation, review repairs and required final acceptance.
- **Next:** PR #49 remains open; complete CE14 on a separate branch, with meaningful commits and pushes. No merge or scheduling.
- **Records:** [completion evidence](./composition-ce15-completion-results.json),
  [plan](./composition-ce15-plan.md).

### 2026-10-09 — CE15 preview recovery test budget

- **Agent / branch:** Codex on `codex/ce15-completion`, following `6868dfea`.
- **Done:** allow setup around the existing six-second missing-dependency recovery
  assertion; its previous five-second outer test budget could cancel it early.
- **Results:** all 17 preview integrations and changed-file lint pass. No
  production code or recovery timing requirement changed.
- **Next:** complete the full local gate, then continue CE14 on a new branch.
- **Record:** [completion evidence](./composition-ce15-completion-results.json).

### 2026-10-09 — CE15 native diagnostic browser regression

- **Agent / branch:** Codex on `codex/ce15-completion`, following `21817411`.
- **Done:** assert original native diagnostics and actual retained bytes in the
  browser helper; test depth initialization under a normal 128 KiB metadata quota.
- **Results:** typecheck, helper lint and complete surface browser suite pass.
  Production code is unchanged after the 3.408× exact-output speed proof.
- **Next:** complete the required local gate, then CE14 on a separate branch.
- **Record:** [completion evidence](./composition-ce15-completion-results.json).

### 2026-10-09 — CE15 native driver text admission repair

- **Agent / branch:** Codex on `codex/ce15-completion`, following `b2d7a6a1`.
- **Done:** charge actual native-returned renderer/log text and application Error
  capacity, replacing impossible maximum-V8-string reservations.
- **Results:** 44 focused tests, build/lint, vertical/general exports and 30 golden
  comparisons, complete depth acceptance and all 176 frozen baseline items
  (36,061 frames) pass. Independent review found no remaining concrete blocker.
- **Rejected:** increasing worker quotas to accommodate theoretical 1–2 GiB
  diagnostic strings; native production and application retention are distinct.
- **Next:** final CE15 gate/commit/push, then a new CE14 branch, as requested.
- **Record:** [completion evidence](./composition-ce15-completion-results.json).

### 2026-10-09 — CE15 native Lab loader compatibility

- **Agent / branch:** Codex on `codex/ce15-completion`, following `54b8053c`.
- **Done:** replace Node-incompatible parameter properties with explicit fields;
  narrow allocator/context imports; correct two obsolete 13-fps rejection tests.
- **Results:** actual bundled Vite config import, 71 focused tests, all 314
  integrations, eight memory exports and expanded parallel/24 live failures pass.
- **Preflight lesson:** import the bundled Lab configuration with native Node;
  a TSX-only import hides the unsupported-syntax path. No loader workaround used.
- **Open / next:** repeat speed acceptance and complete the required full local
  gate on the repaired immutable checkpoint. No complete gate claimed yet.
- **Record:** [completion evidence](./composition-ce15-completion-results.json).

### 2026-10-09 — CE15 gate frame-rate assertion repair

- **Scope:** update the old evaluator test for the accepted integer 1–60 fps range.
- **Results:** 219 affected tests pass. Full gate attempt at `24378343` stopped
  after 3,554 unit passes on this obsolete assertion; no complete gate claimed.
- **Evidence:** final production code passed the 3.437× exact-output speed proof.
  Only this test and records change; production/benchmark code remains unchanged.
- **Next:** restart complete local `pnpm check` on the corrected checkpoint.
- **Record:** [completion evidence](./composition-ce15-completion-results.json).

### 2026-10-09 — CE15 maximum-area and speed acceptance; final reference repairs

- **Agent / branch:** Codex on `codex/ce15-completion`, following `adfb9592`.
- **Done:** property-level reference caching, constant overwrite and implicit
  dependency handling; memoized analysis and shared-track protection.
- **Results:** 21 units and 72 dependency exports pass. The preceding format,
  expanded parallel/24 live failures and legacy WebGL regressions pass. All 48
  maximum-area cases and a 3.470× exact-output two-minute proof pass at `adfb9592`.
- **Open / next:** repeat speed acceptance on this final code checkpoint and run
  the complete pinned local `pnpm check`. No full gate is claimed yet.
- **Records:** [plan](./composition-ce15-plan.md),
  [completion evidence](./composition-ce15-completion-results.json).

### 2026-10-08 — CE15 area, frame-rate and result-transfer checkpoint

- **Agent / branch:** Codex on `codex/ce15-completion`, following `18eae703`.
- **Done:** bounded large-area scheduling/cache transport, integer1–60fps/PCM
  boundaries, dependency-aware native prefixes and admitted chunked result RPC.
- **Results:**311 focused tests and static checks pass;36 cache-dependency,
  105 full format/rate and8 result-memory exports preserve exact worker output.
  Four full-area Canvas cases pass. A48-case attempt passed36 before an interim
  import edit interrupted it; an immutable complete rerun is still required.
- **Rejected:** large ArrayBuffer fetch crashed Chromium; native Blob data-pipe
  transport passes. Encoder frame cutoff lost fractional-rate audio; bounded
  input EOF preserves every sample. No pixel/native thresholds were loosened.
- **Next:** full-area matrix, isolated120-second speed proof, full local gate.
- **Records:** [Completion evidence](./composition-ce15-completion-results.json).

### 2026-10-08 — CE15 production worker memory lifecycle

- **Done:** activate managed admission in real exports; partition worker capacity,
  retain RPC result owners through acknowledgement and require complete retirement.
  Report declared worker peaks separately from measured process RSS and Node allowance.
- **Verified:** 21 focused tests, build/lint/boundaries, eight actual cached/uncached
  one/four-worker Canvas/WebGL exports, 28 format cases and legacy WebGL regressions.
- **Repair:** parallel acceptance reached browser-close and observed ECONNRESET
  before the expected Playwright diagnostic. The test now requires the intended
  browser's actual disconnected event and accepts either transport; all cleanup
  and process-reaping assertions remain. The expanded rerun passes all format,
  native/source/tint/root/prefix parity cases and all 24 live failures.
- **Remaining:** complete metadata/Node admission, full-area scheduling and caches,
  authentic speed acceptance and final local gate. No whole-memory or CE15 completion claim.
- **Record:** [Completion evidence](./composition-ce15-completion-results.json).

### 2026-10-08 — CE15 ordinary export statistics

- **Done:** collect and publish composition statistics for ordinary exports, with
  per-output-frame exclusive submission times, explicit cache state/hit semantics
  and detailed worker snapshots. Parallel and ordinary exports share aggregation.
- **Verification:** 12 focused tests, build/lint/boundaries, all 28 format cases
  and legacy WebGL export regressions pass. Existing byte/pixel/audio oracles hold.
  Installed current frozen-lockfile dependencies after old snapshot lacked clipper2-ts.
- **Next:** production memory admission, complete caching/area coverage, speed proof
  and final immutable local gate. This is focused evidence, not CE15 acceptance.
- **Record:** [Completion evidence](./composition-ce15-completion-results.json).

### 2026-10-08 — PR #49 merge-conflict resolution

- **Agent / branch:** Codex; isolated `pr49-conflicts` worktree from `8faae4be`.
- **Scope:** merge main `118927de` into PR #49 while preserving CE15 and reviewed upstream behavior.
- **Done:** reconciled 14 conflict files, retained both test-command sets and histories;
  combined reusable previews, rendered coverage, native bitmap upload, GPU instancing,
  exact exposure bounds and managed lifetimes. Isolated export-test Vite caches;
  asynchronous cinematic coverage now awaits shared preparation sources.
- **Results:** 3,524 units; 102 focused tests; 144 surface cases / 8,000 frames;
  complete WebGL, 38 alpha cases, 28 output exports and the parallel matrix pass.
  Final cached-cinematic pixels/rejections and four public exports pass both backends.
  Frozen subset 4 items / 792 frames and 336 affected default frames pass. No full
  repository gate was run; frozen visuals/tolerances remain unchanged from main.
- **Rejected:** stale optimizer imports, an invalidated borrowed clear-color array,
  changed ordinary shader admission and a readonly test fixture were repaired. The
  unchanged gradient-table timeout passes in the quiet final unit run; its limit stays intact.
- **Open / next:** PR #49 remains open for the remaining CE15 milestone work.
  CE15 acceptance remains pending; GitHub Actions stay disabled.
- **Records:** [conflict-resolution results](./pr-49-conflict-resolution-results.json).

### 2026-10-08 — CE15 Canvas parent and native image lifetime

- **Agent / branch:** Codex on `codex/composition-ce15`, after recovered `61d7b911`.
- **Done:** hold actual Canvas parent and image backing through native consumers;
  recover failed native identity, preserve known aliases and first cleanup/null error.
- **Results:** build/lint/boundaries, 999 focused / 69 typography tests, six genuine
  native probes, 144 audit cases / 8,000 frames and 64 prior-exact exports / 768
  bodies/frames pass. Glyph 1.376068× meets unchanged 1.5; no final gate or speed proof.
- **Repairs:** corrected an unverified draft rounding expectation to original 127;
  retained sandbox startup and browser callback-shim failures. Prior tests unchanged.
- **Next:** gradient/backend/retained-graph and broader admission, aggregate/area/speed
  acceptance, full CE15 gate/PR, then CE14. GitHub push awaits explicit approval.
- **Records:** [Canvas lifetime evidence](./composition-ce15-color-canvas-lifetime-results.json),
  [plan](./composition-ce15-plan.md).

### 2026-10-08 — CE15 GPU parent and child lifetime

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `f848b9a1`.
- **Recovery:** fresh chat independently matched all 220 source fingerprints,
  21 logs and audit/export result hashes after the old chat stopped.
- **Done:** pre-hold actual GPU parent and independent entries/filter/uniform/curve
  owners; attempt all child settlers before parent while preserving first null.
- **Review:** repair failed native curve identity cleanup and the prior kernel
  disposal ledger expectation; preserve known backing
  and detach actual fresh backing. Prior native bodies and GPU units remain exact.
- **Results:** build/lint/boundaries, 986 focused / 69 typography tests,
  complete 144-case audit / 8,000 comparisons and 64 prior-exact exports / 768
  bodies/frames pass. Glyph 1.319629×; full gate and speed remain pending.
- **Next:** gradient/Canvas/backend and params/retained-graph lifetime, bootstrap/
  Node/production/aggregate ownership and final gates, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [GPU lifetime evidence](./composition-ce15-color-gpu-lifetime-results.json).

### 2026-10-08 — CE15 common metadata factory lifetime

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `c2473c23`.
- **Done:** hold actual ownership/charge through factory/adoption/registry handoff;
  protect known active/retiring aliases and preserve first failure during cleanup.
- **Results:** build/lint/boundaries, 972 focused / 69 typography tests, 144-case audit /
  8,000 comparisons, 96 RPC snapshots and 64 prior-exact exports / 768 bodies/frames
  pass. Glyph 1.423015×; full gate and speed proof remain pending.
- **Evidence:** 15 new regressions, all 957 prior tests and byte-exact ten old helper
  tests pass. Private 48/3 passes; original-source RED 11/25 has its earlier hash caveat.
- **Limits / next:** failed replaced registry intrinsics and unregistered foreign
  aliases remain pending; implement callback parent and independent child holds,
  params/retained-graph/bootstrap/Node ownership, production/aggregate/final gates.
- **Records:** [plan](./composition-ce15-plan.md),
  [metadata evidence](./composition-ce15-metadata-factory-lifetime-results.json).

### 2026-10-08 — CE15 fixed color-kernel metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `a93a020c`.
- **Done:** pre-admit actual kernel products, scoped cache and independent shader/
  state; reject stale invocation and preserve replacement during old-cache retirement.
- **Results:** build/lint/boundaries, 957 focused / 69 typography tests,
  complete 144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.392962×.
- **Verification:** 23 new units / all 934 prior tests; ten original full
  shader/constructor oracles and all ten embedded prior color oracles remain exact.
- **Review:** repair retired cache/state publication and direct retiring-cache reuse;
  retain build/lint/harness-read failures and repair them without changing oracles.
  Keep original callback quota with admitted real filler and all prior thresholds.
- **Next:** common metadata factory and native dependency holds, key-list/bootstrap/
  Node ownership, production/aggregate/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [kernel evidence](./composition-ce15-color-kernel-metadata-results.json).

### 2026-10-08 — CE15 allocation identity and registration failures

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `25b0e494`.
- **Done:** hold producer handoff, retire fresh backing after identity/adoption
  failure, roll back actual partial records and reject already-retired outputs.
- **Results:** build/lint/boundaries, 934 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.395620×.
- **Verification:** 22 new units, all 912 prior tests and 67 targeted checks; ten
  genuine native cuts / 160 exact channels / 10240 protected prior Canvas channels,
  held admission, original first null/Get sequence and detached actual backing pass.
- **Review:** reject successful initializer's retired handle and skip recovery
  after completed adoption; preserve all existing oracles and thresholds.
- **Next:** kernel/ownKeys/control/Node preproducer ownership and unsupported
  identity contracts, production/aggregate/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [allocation cleanup evidence](./composition-ce15-allocation-failure-results.json).

### 2026-10-08 — CE15 common memory and native retirement

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `b2352574`.
- **Done:** retain actual admission/ownership/records through cleanup and pending
  native initialization; destroy once, clear actual refs and preserve first null.
- **Results:** build/lint/boundaries, 912 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.415644×.
- **Verification:** nineteen new tests; all 893 prior tests and unchanged late
  registration protection pass. Preserve lint failure, deliberate three-case red
  repro and 908/909 failure; deferred producer lifetime fixes the latter. Final 4 passes.
- **Timing:** first glyph run 1.56× fails; unchanged-source retry meets 1.5 maximum.
- **Next:** generic allocate/identity/adopt cleanup, kernel/ownKeys/common/Node
  preproducer ownership, production/aggregate/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [retirement evidence](./composition-ce15-memory-retirement-results.json).

### 2026-10-08 — CE15 selected Canvas color metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `8c3b694f`.
- **Done:** own callback/partial source/reused pixel/gradient arrays and native image
  backing through publication, then retire actual samples/image/control refs.
- **Results:** build/lint/boundaries, 893 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.425039×.
- **Verification:** twelve new tests / 23 original complete Canvas traces, 464
  parameter and 18 input cuts, partial/gradient/image/quota/adoption/native/null/retry.
- **Repaired:** private original oracle initialization; preserve original argument
  order, native pixel/getter oracles and all thresholds. Focused attempt 1 passes.
- **Next:** ownKeys capacity, kernel/registry/class/common/Node ownership,
  production/aggregate/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [Canvas color evidence](./composition-ce15-color-canvas-metadata-results.json).

### 2026-10-08 — CE15 selected GPU color metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `4328a6ac`.
- **Done:** own callback and dynamically admitted original tuples/filter/uniform/
  gradient spread, actual native input tuple and reused curve work/backing.
- **Results:** build/lint/boundaries, 881 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.394345×.
- **Verification:** ten new tests / 23 whole original GPU records, seven original
  enumeration cases, 84 getter cuts, quota/adoption/native/cleanup/retry.
- **Rejected / repaired:** actual extra descriptor reads and fixture declaration/
  premature secondary injection/cache-disposal mock; all attempts retained.
- **Next:** arbitrary ownKeys capacity, Canvas/kernel/store ownership, common/Node,
  production/aggregate/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [GPU color evidence](./composition-ce15-color-gpu-metadata-results.json).

### 2026-10-08 — CE15 actual standalone color-pixel metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `a7aa2a22`.
- **Done:** admit actual producer/slice/mapper/borrowed refs/intermediate and partial
  RGBA; retain independent result and retire at GPU curve/Canvas pixel consumers.
- **Results:** build/lint/boundaries, 871 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.414894×.
- **Verification:** nine new tests / 92 original outputs/getter traces, 462 getter
  cuts / 15 paths, math/quota/actual refs/lifetime/adoption/cleanup/retry/caller/
  native consumers; all 854 prior plus eight original curve tests rerun.
- **Rejected / repaired:** attempt 1 prior table-oracle timeout (870 pass), system
  workload observed/cause unknown; buffer only SHA observer calls preserving exact
  original hash input and timeout. Attempt 2 passes; original thresholds unchanged.
- **Next:** outer color callback/store ownership, arbitrary methods/species/common/
  Node, aggregate/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [color pixel evidence](./composition-ce15-color-pixel-metadata-results.json).

### 2026-10-08 — CE15 actual gradient-table cache/key/view metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `d0b79911`.
- **Done:** admit actual producer/tuple/key/Map/entry/view/backing, captured cache
  retirement and insertion/eviction rollback preserving original native read order.
- **Results:** build/lint/boundaries, 854 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.440780×.
- **Verification:** ten new tests / 16 whole original table/getter hashes, quota/
  actual refs/lifetime/getter-math/adoption/Map pre/post-mutation/eviction/cleanup/
  retry/native JSON; all 844 prior including 46 full native color cases rerun.
- **Rejected / repaired:** preparation brace; observer counter/typing and unused
  failure/retry hash overhead. Attempt 4 passes; review adds post-mutation rollback,
  expanded check passes attempt 6. Original data/timeouts/thresholds unchanged.
- **Next:** color callback/store ownership, arbitrary borrowed factories/common/
  Node, aggregate/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [gradient table evidence](./composition-ce15-gradient-table-metadata-results.json).

### 2026-10-08 — CE15 actual standalone gradient-uniform metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `7e5d176c`.
- **Done:** admit actual producer/partial uniform record/three vectors and independent
  result; retain shared vectors through GPU pass and retire on controls cleanup null.
- **Results:** build/lint/boundaries, 844 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.304455×.
- **Verification:** nine new tests / eight original uniform/getter tables/six floors,
  four full native GPU upload/getter hashes, quota/actual refs/lifetime/getter-math/
  adoption/cleanup/retry/caller; all 835 prior including 46 full native color cases.
- **Rejected / repaired:** attempt 1 fixture proxy typing; attempt 2 hash input omits
  original getter sequence (843 pass); fixed comparison only. Attempt 3 passes.
- **Next:** gradient table/cache and color callback ownership, arbitrary borrowed
  factories/common/Node, aggregate/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [gradient uniforms evidence](./composition-ce15-gradient-uniforms-metadata-results.json).

### 2026-10-08 — CE15 actual standalone gradient-control metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `66e7a22c`.
- **Done:** admit actual producer/borrowed endpoints/partial controls and independent
  result; retire at GPU uniform and Canvas publication consumers, or outside scope.
- **Results:** build/lint/boundaries, 835 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.439883×.
- **Verification:** nine new tests / eight original controls/uniform tables, 40 ranks,
  46 full native traces/uploads/pixels, quota/actual refs/lifetime/getter-math/adoption/
  cleanup/retry/caller; all 810 prior and 16 original color/gradient tests rerun.
- **Rejected / repaired:** attempt 1 native fixture typing; isolated harness/endpoint
  observer before tests. Attempt 2 JSON loses original negative zeros (828 pass);
  four expected signs restored from original. Attempt 3 passes; formulas unchanged.
- **Next:** gradient uniforms/tables/cache and color callback ownership, arbitrary
  borrowed factories/common/Node, aggregate/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [gradient controls evidence](./composition-ce15-gradient-controls-metadata-results.json).

### 2026-10-08 — CE15 actual standalone native noise-color metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `5330322a`.
- **Done:** admit actual map producer/receiver/handler/arguments and native length-
  sized result before factories; retain actual result outside scope until consumer.
- **Results:** build/lint/boundaries, 810 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.410120×.
- **Verification:** eleven new tests / 22 original complete color/getter/has/sparse/
  length rows, quota/actual refs/lifetime/getter-clamp/adoption/cleanup/retry/caller/
  native coercion/admission hook/custom-map bound; all 799 prior tests rerun.
- **Rejected / repaired:** test-only const lint in attempt 1; recursive Vitest proxy
  observer in attempt 2 (809 pass). Boolean identity repair; attempt 3 passes.
- **Next:** arbitrary map/species intermediate contracts, other effects/cache/class/
  provider/graph/font/common/registry/ledger/Node, aggregate/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [noise color evidence](./composition-ce15-noise-color-metadata-results.json).

### 2026-10-08 — CE15 actual standalone noise-field metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `78f4c557`.
- **Done:** admit actual producer and original octave plane closures before factories,
  hold through scalar consumer, drop each plane after its octave and retire phase.
- **Results:** build/lint/boundaries, 799 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.407681×.
- **Verification:** eight new tests / 60 original field value/getter/math-count rows,
  quota/default seed/actual producer-plane refs/all getter cuts/math/adoption/cleanup/
  retry/caller; all 791 prior tests rerun unchanged. Second attempt passes.
- **Rejected / repaired:** first attempt builds; lint rejects throw from finally.
  First error now propagates after cleanup, retaining original math and plane behavior.
- **Next:** color helper, other effects/cache/class/depth sampling/provider/graph/
  font/common/registry/ledger/Node, aggregate memory/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [noise field evidence](./composition-ce15-noise-field-metadata-results.json).

### 2026-10-08 — CE15 actual standalone noise-uniform metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `2eec9562`.
- **Done:** admit actual temporary producer/partial record-vectors and independent
  uniform result; retain both vectors under captured ownership outside scope.
- **Results:** build/lint/boundaries, 791 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.368082×.
- **Verification:** eight new tests / six independent complete uniform/getter tables,
  quota/actual partial vectors/producer/lifetime/all getter cuts/adoption/cleanup/
  retry/caller; all 783 prior tests rerun. First attempt passes. Two prior tests
  release new owned uniforms after unchanged frozen assertions.
- **Next:** field/color helpers, other effects/cache/class/depth sampling/provider/
  graph/font/common/registry/ledger/Node, aggregate memory/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [noise uniform evidence](./composition-ce15-noise-uniforms-metadata-results.json).

### 2026-10-08 — CE15 actual standalone noise-controls metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `998ed11c`.
- **Done:** admit actual temporary producer/partial controls and independent result
  before factories; retain captured allocator ownership outside scope until consumer.
- **Results:** build/lint/boundaries, 783 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.470339×.
- **Verification:** eight new tests / six complete original controls/uniform tables,
  30 field values/exact getters/quota/actual partial refs/lifetime/adoption/cleanup/
  retry/caller; all 775 prior tests rerun. First attempt passes. Two prior tests
  release new owned controls and retain the same frozen expected values.
- **Next:** uniform/field/color helpers, other effects/cache/class/depth sampling,
  provider/graph/font/common/registry/ledger/Node, aggregate memory/speed/final gate,
  then CE14. Production admission remains pending.
- **Records:** [plan](./composition-ce15-plan.md),
  [noise controls evidence](./composition-ce15-noise-controls-metadata-results.json).

### 2026-10-08 — CE15 actual noise Canvas callback metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `e40ac9e2`.
- **Done:** admit actual controls/views/sample/RGB-color maps/octave plane/sampling/
  native work before factories; clear original plane and pixel arrays/callbacks at
  consumers, retain views through publication and retire both original backings.
- **Results:** build/lint/boundaries, 775 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.458716×.
- **Verification:** thirteen new tests / 38 complete original rows and 16 getter
  sequences, quota/actual partial-consumer refs/math/map/field/sampling/native/
  adoption/cleanup null/retry; all 762 prior tests rerun. First attempt passes.
- **Next:** standalone noise helpers, color/transition/cache/class/depth sampling,
  provider/graph/font/common/registry/ledger/Node, aggregate memory/speed/final gate,
  then CE14. Selected premultiply repair does not complete common allocation cleanup.
- **Records:** [plan](./composition-ce15-plan.md),
  [noise Canvas evidence](./composition-ce15-noise-canvas-metadata-results.json).

### 2026-10-08 — CE15 actual noise GPU callback metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `b019c1de`.
- **Done:** admit actual controls/three uniform records/seed-z vectors/full shader/
  input/native refs before factories, retain through pass and clear actual refs.
  Preserve amount/getter/key order and zero neutral paths; borrowed colors intact.
- **Results:** build/lint/boundaries, 762 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.415045×.
- **Verification:** nine new tests / 38 complete original control/uniform/field/
  color/native rows and 16 callback getter sequences, quota/actual partial-consumer
  refs/math/native/adoption/cleanup null/retry. All 748 prior plus five original
  noise tests rerun; type failure retained, focused attempt 2 passes.
- **Next:** noise Canvas/default helpers, color/transition/cache/class/depth sampling,
  provider/graph/font/common/registry/ledger/Node, aggregate memory/speed/final gate,
  then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [noise GPU evidence](./composition-ce15-noise-gpu-metadata-results.json).

### 2026-10-08 — CE15 actual standalone chromatic offset result

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `5827df1e`.
- **Done:** admit actual 272-byte result before original getters/math/array factory;
  keep owned outside scope and while another scope is active until consumer cleanup.
  Caller-admitted routes add no result lease; original inactive values stay exact.
- **Results:** build/lint/boundaries, 748 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.422721×.
- **Verification:** seven new tests / five original values/positive-zero/getter
  sequences, quota/actual reservation/captured allocator/lifetime/null/adoption/
  cleanup/retry/caller. All 741 prior tests rerun; type failure retained, attempt 2
  passes.
- **Next:** noise/color/transition/cache/class/depth sampling, provider/graph/font/
  common/registry/ledger/Node, aggregate memory/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [offset result evidence](./composition-ce15-stylize-offset-metadata-results.json).

### 2026-10-08 — CE15 actual stylize Canvas callback metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `ea482f03`.
- **Done:** admit actual offset/neutral/readback/view/sample/RGB/map/index/native
  work before factories; retain through publication, clear actual pixel arrays and
  callbacks. Both original stores retire even after first error; guarded native
  detach cleanup still clears refs and preserves first null.
- **Results:** build/lint/boundaries, 741 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.357456×.
- **Verification:** twelve new tests / 16 original native traces/full pixels,
  quotas/actual partial-consumer refs/math/getter/native/adoption/cleanup null/retry.
  All 729 prior tests rerun. Earlier pass and type failure retained; attempt 3 passes.
- **Next:** standalone offset, noise/color/transition/cache/class/depth sampling,
  provider/graph/font/common/registry/ledger/Node, aggregate memory/speed/final gate,
  then CE14. Selected premultiply guard does not complete common allocator cleanup.
- **Records:** [plan](./composition-ce15-plan.md),
  [stylize Canvas evidence](./composition-ce15-stylize-canvas-metadata-results.json).

### 2026-10-08 — CE15 actual stylize GPU callback metadata

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `bb8a9dc7`.
- **Done:** admit actual offset/predicate/uniform/dimension/shader/input tuple before
  factories; retain through native pass, clear actual owned arrays/records/refs.
  Original amount getter, zero vignette and neutral chromatic behavior stay exact.
- **Results:** build/lint/boundaries, 729 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.410180×.
- **Verification:** nine new tests / 16 original GPU/Canvas native traces/full
  pixels, quota/actual refs/math/getter/partial uniform/native/adoption/cleanup null
  and retry; all 720 prior tests rerun. Type failure retained; attempt 2 passes.
- **Next:** stylize Canvas/default offset, noise/color/transition/cache/class/depth
  sampling, provider/graph/font/common/registry/ledger/Node, aggregate memory/speed/
  final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [stylize GPU evidence](./composition-ce15-stylize-gpu-metadata-results.json).

### 2026-10-08 — CE15 actual late standalone warp point results

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `a5538ce3`.
- **Done:** admit actual late outputs before original producers under mapping's
  captured allocator, keep outside scope and independent of mapping cleanup; clear
  actual outputs/empty controls. Original caller route adds no per-point lease.
- **Results:** build/lint/boundaries, 720 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.369987×.
- **Verification:** ten new tests / 105 original points/signed zeros/three undefined
  points, quotas/captured owners/math/lifetime/null/adoption/retry/caller. Prior exact
  assertions unchanged; type failure retained, focused attempt 2 passes. Glyph
  1.57× displayed failure retained; affected unchanged-code repeat passes.
- **Next:** stylize/noise/color/transition/cache/class/depth sampling, provider/graph/
  font/common/registry/ledger/Node, aggregate memory/speed/final gate, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [warp point evidence](./composition-ce15-warp-points-metadata-results.json).

### 2026-10-08 — CE15 actual standalone warp mapping result

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `628e5934`.
- **Done:** pre-admit actual mapping/matrix/vector/uniform/shader/closure controls,
  hold outside scope through consumers, clear actual partial/result roots and refs.
  Caller-admitted route unchanged; later independent point results remain pending.
- **Results:** build/lint/boundaries, 710 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.382429×.
- **Verification:** nine new tests / 21 whole original mappings/getter sequences,
  18 signed zeros, quotas/actual roots/partial/null/adoption/retry/lifetime/caller.
  Interrupted harness and observer failure retained; focused attempt 3 passes.
- **Next:** later warp point results, other effects/cache/class/depth sampling,
  provider/graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [warp mapping evidence](./composition-ce15-warp-mapping-metadata-results.json).

### 2026-10-08 — CE15 actual standalone radial encoded view

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `dbe4e0c4`.
- **Done:** admit actual returned view before original producer; retain actual view/
  original backing outside scope until consumer cleanup. Capture partial view;
  detach actual unadopted radial backing after pixel-adoption failure.
- **Results:** build/lint/boundaries, 701 focused tests / 80 files, complete 144-case
  audit / 8,000 comparisons, 96 RPC snapshots, native probes, original WebGL and 64
  prior-exact exports / 768 bodies/frames pass. After owner browser workload ended,
  69 source typography unit tests/providers/eight fixtures pass on unchanged code;
  glyph 1.417742× meets unchanged 1.5. Prior failure remains retained.
- **Verification:** ten new tests / 21 whole original encoded hashes/getter sequences,
  quotas/actual refs/transfer/lifetime/null/adoption/all cleanup/retry/caller. Attempts
  1/2 failures retained; focused attempt 3 and affected typography repeat pass.
  Final milestone full gate remains pending.
- **Next:** standalone warp mapping/point, other effects/cache/class/depth sampling,
  provider/graph/font/common/registry/ledger/Node, full CE15/CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [radial encoded-view evidence](./composition-ce15-radial-bytes-metadata-results.json).

### 2026-10-08 — CE15 actual standalone radial control result

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `3ca8a09c`.
- **Done:** pre-admit temporary tracker and actual result/factor store/view/vectors,
  transfer refs to returned owner outside scope, retire actual partial or final
  stores/vectors/record; caller-admitted GPU/Canvas growth adds no standalone lease.
- **Results:** build/lint/boundaries, 691 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph fixture failed at a
  displayed 1.52× versus 1.5; repeat pending after observed external owner browser
  workload. This implementation checkpoint has incomplete browser acceptance.
- **Verification:** eight new tests / 21 original full factor hashes/vectors/getter
  sequences, quotas/actual owners/transfer/null/adoption/all cleanup/retry. Attempt 1
  TypeScript cast failure retained; focused attempt 2 passes. Failed timing retained,
  affected repeat and aggregate/final gates pending.
- **Next:** standalone table/warp mapping, other effects/cache/class/depth sampling,
  provider/graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [radial control evidence](./composition-ce15-radial-controls-metadata-results.json).

### 2026-10-08 — CE15 actual standalone radial point result

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `8da15083`.
- **Done:** pre-admit actual point result, retain outside render scope through
  explicit/scratch/allocator cleanup; clear actual adoption-failure/result arrays.
  Preserve original borrowed control getters and caller route without extra leases.
- **Results:** build/lint/boundaries, 683 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.413165×.
- **Verification:** seven new tests / 105 original values/kinds/getter sequences,
  two NaNs, quotas/owner/math/lifetime/null/adoption/retry/caller cleanup. Attempt 1
  accepted. Aggregate integration and final full gate remain pending.
- **Next:** standalone radial controls/table and warp mapping/other effects/cache/
  class/depth sampling, provider/graph/font/common/registry/ledger/Node, CE15/CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [radial point evidence](./composition-ce15-radial-point-metadata-results.json).

### 2026-10-08 — CE15 actual radial Canvas factor work

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `11b39625`.
- **Done:** pre-admit/grow actual factor/view/vector/controller/readback/premultiply/
  point/sample/index/native work, capture partial views and each point consumer,
  retire three backings and clear actual arrays/refs after publication or failure.
- **Results:** build/lint/boundaries, 676 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.461759×.
- **Verification:** nine new tests / seven full native/pixel oracles, quota/refs/
  point consumers/partial/native/adoption/null/all cleanup/retry. Attempt 1 accepted.
  Standalone results, aggregate integration and final full gate remain pending.
- **Next:** standalone controls/point/table helpers/other effects/cache/class/depth
  sampling, provider/graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [radial Canvas evidence](./composition-ce15-radial-canvas-metadata-results.json).

### 2026-10-08 — CE15 actual radial GPU factor work

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `a4f870f`.
- **Done:** pre-admit header, grow by exact factor bytes before constructor, capture
  partial factors/vectors/controller/table/shader/input/uniform/native refs, keep
  through upload/pass then retire actual stores and clear refs despite cleanup failure.
- **Results:** build/lint/boundaries, 667 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.247944×.
- **Verification:** nine new tests / 21 whole factor/table hashes / 14 full native
  traces, quotas/refs/partial/native/adoption/null/all cleanup/retry, 8192 controls.
  Original NaN/type fixture failures retained; final attempt 3 accepted. Full-size
  export/aggregate and full gate remain pending.
- **Next:** radial Canvas/standalone helpers/other effects/cache/class/depth sampling,
  provider/graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [radial GPU evidence](./composition-ce15-radial-gpu-metadata-results.json).

### 2026-10-08 — CE15 actual warp Canvas mapping work

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `a142f3c`.
- **Done:** pre-admit actual mapping/view/sample/index/native controls, capture
  unreturned premultiply view, keep each actual point through pixel consumption then
  clear, visit both stores and clear actual arrays/records/refs after publication/failure.
- **Results:** build/lint/boundaries, 658 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.390805×.
- **Verification:** ten new tests / seven whole original Canvas traces/pixels,
  quotas/refs/pixel cuts/four point consumers/partial/native/adoption/null/all
  cleanup/retry. Initial unused fixture import retained; final attempt 2 accepted.
  No full gate; standalone mapping/common/aggregate integration still pending.
- **Next:** standalone mapping/helpers/other effects/cache/class/depth sampling,
  provider/graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [warp Canvas evidence](./composition-ce15-warp-canvas-metadata-results.json).

### 2026-10-08 — CE15 actual warp GPU mapping work

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `dd1e1e4`.
- **Done:** pre-admit actual matrices/vectors/keys/borrowed-point root, mapping/
  uniform records, producers/closures/shader/input/native refs; keep through pass
  then clear actual containers/refs, including partial affine uniform production.
- **Results:** build/lint/boundaries, 648 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.382883×.
- **Verification:** eight new tests / 21 full mapping tables / 18 signed zeros /
  14 complete native traces, quota/refs/partial/native/adoption/null/cleanup/retry.
  Initial fixture decimal lint failures retained; final attempt 3 accepted. No full gate.
- **Next:** Canvas/standalone mapping/helpers/other effects/cache/class/depth
  sampling, provider/graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [warp GPU evidence](./composition-ce15-warp-gpu-metadata-results.json).

### 2026-10-08 — CE15 actual standalone map-channel work

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `2459e68`.
- **Done:** pre-admit actual standalone controller/straight closure, retain through
  original consumers, clear refs and retire temporary capacity; preserve original
  alpha no-op and single borrowed alpha read. Canvas adds no per-pixel lease.
- **Results:** build/lint/boundaries, 640 focused / 69 typography tests, full
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.408163×.
- **Verification:** seven new tests / 40 full saved scalar/getter oracles, actual
  ownership, quota/no-op, producer/adoption/null/secondary/successful cleanup/retry.
  Initial lint/fixture failures retained; final attempt 4 accepted. No full gate.
- **Next:** other helpers/effects/cache/class/depth sampling, provider/graph/font/
  common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [channel evidence](./composition-ce15-map-channel-metadata-results.json).

### 2026-10-08 — CE15 actual map-effect Canvas work

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `762c41a`.
- **Done:** pre-admit actual neutral/readback/premultiply/view/vector/channel/index/
  native refs; capture unreturned producers, reuse per-pixel controls, visit four
  backing retirements and clear actual arrays/refs after publication/failure.
- **Results:** build/lint/boundaries, 633 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.500000×.
- **Verification:** twelve new tests / 11 full original Canvas traces/pixels,
  quotas, actual four stores/views, partial premultiply, channel/sampling/readback/
  adoption/native/publication/null/secondary/all cleanup/retry. Transparent-pixel
  test observer repaired, four-view expectation kept; attempt 2 accepted. Initial
  1.52× glyph timing failure retained; affected rerun uses unchanged protocol. No full gate.
- **Next:** standalone helpers/other effects/cache/class/depth sampling, provider/
  graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [map Canvas evidence](./composition-ce15-map-canvas-metadata-results.json).

### 2026-10-08 — CE15 actual map-effect GPU work

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `501f75a`.
- **Done:** pre-admit actual neutral/amount-map/uniform/shader/input/native refs;
  keep through original consumer/early return, clear actual arrays/records and drop
  callbacks/text/native refs after success/failure without changing borrowed inputs.
- **Results:** build/lint/boundaries, 621 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.361355×.
- **Verification:** eight new tests / 22 whole original GPU/Canvas native traces,
  shader lengths/hashes/pixels, quota/neutral/actual refs/producer/layer/native/
  adoption/null/secondary cleanup/retry. Initial extra segment assertion error
  retained, attempt 2 accepted with consumed suffix/full frozen hashes; no full gate.
- **Next:** map Canvas/helpers/other effects/cache/class/depth sampling, provider/
  graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [map GPU evidence](./composition-ce15-map-gpu-metadata-results.json).

### 2026-10-08 — CE15 actual standalone transform results

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `3c50927`.
- **Done:** admit actual outer/child tap arrays and working refs before factories;
  transfer result out of temporary refs, hold through consumers, clear actual root/
  vectors at release/scratch/allocator and retire partial producers/adoption/failure.
- **Results:** build/lint/boundaries, 613 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.422481×.
- **Verification:** nine new tests / 36 full original tables / 230 signed zeros,
  actual root/child ownership, neutral/max/count quotas, producer/adoption/null/
  secondary cleanup/retry and outside-scope/scratch/allocator lifetime. All prior
  24 native GPU/Canvas traces pass. Getter fixture build failure retained; attempt 2
  accepted; no full gate.
- **Next:** other sampling/effect/cache/class/depth sampling, provider/graph/font/
  common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [transform result evidence](./composition-ce15-transform-results-metadata-results.json).

### 2026-10-08 — CE15 actual sampled-blur Canvas work

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `0289f89`.
- **Done:** pre-admit actual tap/readback/view/sample/sums/map/producer/native refs;
  reuse sampling control, clear each pixel's actual temporary arrays after writes;
  visit both backing retirements and drop actual refs after publication/failure.
- **Results:** build/lint/boundaries, 604 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.434383×.
- **Verification:** twelve new tests / 12 whole original Canvas traces/pixels,
  actual refs/detachment, single work/two pixel admissions, quota/producer/readback/
  sampling/normalization/map/adoption/native/publication/null/cleanup/retry. Prior
  transform/GPU/default sampler/shadow oracles pass. Attempt 1 accepted; no full gate.
- **Next:** standalone transforms/other sampling/effect/cache/class/depth sampling,
  provider/graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [sampled Canvas evidence](./composition-ce15-sampled-canvas-metadata-results.json).

### 2026-10-08 — CE15 actual sampled-blur GPU work

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `cc68e4e`.
- **Done:** admit actual tap/shape/producer/shader/map/row/key/pair/group/uniform/
  native refs before factories; keep through pass, clear actual partial/completed
  arrays/records and drop text/function/native refs after success or first failure.
- **Results:** build/lint/boundaries, 592 focused / 69 typography tests, complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.401351×.
- **Verification:** nine new tests; 36 original full tables / 230 signed zeros and
  24 whole native traces. Actual values/refs through consumers, pre-producer quotas,
  partial math/slice/shader/null/adoption/native/cleanup/retry checked. Initial two
  fixture failures retained; attempt 3 accepted. No full gate.
- **Next:** sampled Canvas/standalone transforms/other sampling/effect/cache/class/
  depth sampling, provider/graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [sampled GPU evidence](./composition-ce15-sampled-gpu-metadata-results.json).

### 2026-10-08 — CE15 actual default sampler results

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `02ee590`.
- **Done:** admit default sampling array/working controls before factories; shrink
  actual result after original interpolation, retain through consumers and retire
  partial/completed arrays after producer/adoption/shrink failure. Supplied outputs
  keep original route without per-pixel leases; other caller admission pending.
- **Results:** build/lint/boundaries, 583 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.361893×.
- **Verification:** eight new tests / 80 original full outputs, pre-math quotas,
  actual consumer closure/capacity, null/adoption/shrink/secondary cleanup/retry,
  outside-scope lifetime, scratch/allocator cleanup and borrowed output/bytes.
  Launcher omission retained as incomplete attempt 1; complete attempt 2 accepted.
- **Next:** caller/transform/effect/cache/class/depth sampling factories, provider/
  graph/font/common/registry/ledger/Node, full CE15, then CE14. No full gate yet.
- **Records:** [plan](./composition-ce15-plan.md),
  [default sampler evidence](./composition-ce15-sampler-default-metadata-results.json).

### 2026-10-08 — CE15 actual standalone shadow helper results

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `ddd0651`.
- **Done:** admit actual composite work/result arrays and blur view/controllers
  before factories; retain returned results through consumers, retire actual partial
  outputs after failure and clear/detach on release. Canvas reuses existing controls.
- **Results:** build/lint/boundaries, 575 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, native probes, WebGL/providers
  and 64 prior-exact exports / 768 bodies/frames pass. Glyph 1.395023×.
- **Verification:** ten new tests, 32 composite / 16 blur original full outputs,
  pre-producer quotas, partial producer/adoption null, secondary cleanup, retry,
  actual outside-scope results, scratch/allocator retirement and borrowed data.
  Initial lint failure retained, second attempt accepted. No full gate.
- **Next:** default sampler/effect/cache/class/caller/sampling factories, provider/
  graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [standalone shadow evidence](./composition-ce15-shadow-helpers-metadata-results.json).

### 2026-10-08 — CE15 actual Canvas shadow working controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `7e22ec9`.
- **Done:** pre-admit actual readback/view/vector/sample/blur-producer/per-pixel/
  native refs; reuse pixel ref slots, capture unreturned blur outputs before loops,
  visit five backing/kernel retirements and clear actual refs after consumers.
- **Results:** build/lint/boundaries, 545 main + 20 sampler tests / 69 typography;
  complete 144-case audit / 8,000 comparisons, 96 RPC snapshots, original native
  probes, WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.434650× meets unchanged 1.5 maximum.
- **Verification:** twelve new tests; two whole native traces / 32 original pixel
  cases, actual refs/closure/consumer arrays, partial quota/readback/sampling/blur/
  publication/null/retry and all backing cleanup. Five other sampler suites pass.
  No full gate; standalone/default helper, cache/registry/factory admission pending.
- **Next:** helpers/effect/cache/class/caller/sampling factories, provider/graph/font/
  common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [Canvas shadow evidence](./composition-ce15-shadow-canvas-metadata-results.json).

### 2026-10-08 — CE15 actual GPU shadow working controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `9459a4f`.
- **Done:** pre-admit actual offset/shader/tuple/direction/input/uniform/view/native
  refs, hold through consumers, clear controls and retire actual upload backing/
  Gaussian result after passes; preserve primary failures and retry.
- **Results:** build/lint/boundaries, 533 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.429870× meets unchanged 1.5 maximum.
- **Verification:** eleven new tests; two whole original GPU traces, actual refs/
  views/consumer arrays, quotas, each native producer/upload/pass null, retry and
  first/secondary retirement errors. Prior Gaussian/Canvas traces rerun. No full gate.
- **Next:** Canvas shadow/effect/cache/class/caller/sampling factories, provider/
  graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [GPU shadow evidence](./composition-ce15-shadow-gpu-metadata-results.json).

### 2026-10-08 — CE15 actual shadow Gaussian kernel containers

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `695a815`.
- **Done:** pre-admit actual floating/shape/callback and returned weight/result
  containers, preserve original Gaussian math, clear partial refs, hold actual
  result through GPU/Canvas consumers then retire it in finally.
- **Results:** build/lint/boundaries, 522 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.387597× meets unchanged 1.5 maximum.
- **Verification:** ten new plus three original shadow tests; seven complete
  original kernel results / four native GPU/Canvas traces; quotas, actual refs,
  partial/factory/math/publication/null/retry and scope/scratch consumer retirement.
  No full gate or threshold changes; other shadow/kernel/cache factories pending.
- **Next:** shadow/effect/cache/class/caller/sampling factories, provider/graph/font/
  common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [shadow kernel evidence](./composition-ce15-shadow-kernel-metadata-results.json).

### 2026-10-08 — CE15 actual GPU/Canvas effect callback controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `6bbf7eb`.
- **Done:** pre-admit actual callback controller/Set/Map/context/functions, COPY
  input/dimension/fallback/snapshot arrays; hold through consumers, visit all native
  retirement, preserve primary null, clean partial insertion and drop actual refs.
- **Results:** build/lint/boundaries, 509 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.216981× meets unchanged 1.5 maximum.
- **Verification:** thirteen new and eleven existing plugin tests; two whole
  original GPU/Canvas native traces, pre-factory quota, actual refs/consumer arrays,
  native/callback/publication/cleanup/null/retry, Set/Map insertion and 32-surface cap.
  No full gate or threshold changes; global/kernel/error factories remain pending.
- **Next:** kernel/cache/class/caller/sampling factories, provider/graph/font/common/
  registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [effect control evidence](./composition-ce15-effect-controls-metadata-results.json).

### 2026-10-08 — CE15 actual depth initialization and native controls

- **Agent / branch:** Codex on `codex/composition-ce15` from pushed `83e99b8`.
- **Done:** pre-admit actual shader/tuple/grid/view work and retained native
  program/VAO/buffer controls; visit all captured cleanup, preserve first null,
  drop actual refs, retain across scratch/scope and avoid duplicate native deletes.
- **Results:** build/lint/boundaries, 485 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.435714× meets unchanged 1.5 maximum.
- **Verification:** seventeen new tests/two complete original initialization traces;
  quotas, partial/native/CPU cleanup, null/retry, retained refs, scope/allocator-first
  and independently retired buffers. Attempt 3 omitted text suite and is unaccepted;
  final attempt 4 includes every prior suite. No full gate or threshold changes.
- **Next:** class/caller factories, sampling query payload, effects/provider/graph/
  font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [depth native evidence](./composition-ce15-depth-native-metadata-results.json).

### 2026-10-08 — CE15 actual depth renderer and diagnostic text

- **Agent / branch:** Codex on `codex/composition-ce15`; renderer base `7773c8b`,
  owner documentation commit `633aba3` preserved.
- **Done:** pre-admit actual extension/probe/RegExp/renderer DOMString and native
  log/Error-message producers; retain actual propagated Error until allocator
  cleanup, preserve original predicates/fallback messages/native order/null/retry.
- **Results:** build/lint/boundaries, 468 focused / 69 typography tests; complete
  144-case audit / 8,000 comparisons, 96 RPC snapshots, original native probes,
  WebGL/providers and 64 prior-exact exports / 768 bodies/frames pass.
  Glyph 1.416013× meets unchanged 1.5 maximum.
- **Verification:** twelve new tests/two whole initialization traces, actual Error
  ownership and scope-exit/null/retry. Depth fixture metadata admits pinned text
  ceiling; original pixels/native sizes/source-root/PNG quotas unchanged. No full gate.
- **Next:** class/caller/program/shader/native controls, sampling query payload,
  effects/provider/graph/font/common/registry/ledger/Node, full CE15, then CE14.
- **Records:** [plan](./composition-ce15-plan.md),
  [depth text evidence](./composition-ce15-depth-text-metadata-results.json).

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

### 2026-10-08 — PR #48 third review findings and scoped repairs

- **Agent / branch:** Codex on isolated `codex/pr48-third-review-fixes`, from `1dae23c8`.
- **Scope:** both P2 findings posted inline before repairs; one commit per finding,
  one final normal push.
- **Done:** `2fb40127` partitions all native caches by OS/architecture; the audio
  repair skips unrelated visual layout, retains actual dependencies and picture
  placement, and advances evaluator identity to 56.
- **Results:** fast checks pass 2,616 units; 83 affected integrations and native
  media plus Canvas/WebGL passage browsers pass; 176 frozen items / 36,061 frames
  match. Independent review finds no issues.
- **Rejected:** corrected text-anchor/driver test fixtures and retained the existing
  gain clamp. No pixel threshold, numerical tolerance or frozen reference changed.
- **Delivery / next:** separate finding commits and one final normal push; owner
  review/merge follows. No full repository gate is run or claimed.
- **Records:** [third review evidence](./pr-48-third-review-fix-results.json),
  [PR #48](https://github.com/xxibcill/still-shift/pull/48).

### 2026-10-08 — PR #48 second review findings and scoped repairs

- **Agent / branch:** Codex on isolated `codex/pr48-second-review-fixes`, from `63766426`.
- **Scope:** both findings posted inline before repairs; one commit per finding,
  one final normal push.
- **Done:** bounded sequence authorization `0a4e975c`; audio visibility uses exact
  PCM coordinates while raw property/picture clocks stay unchanged. Evaluator 55
  invalidates previously prepared incorrect masters; audio has its own final commit.
- **Results:** both padded API failures and whole-master sample loss reproduced.
  Final fast checks pass 2,599 units; 80 affected integrations and native media/
  authoring/export/session browsers pass, including independently decoded padded
  exports and all 40,000 stereo samples of the boundary master. Final review passes.
- **Rejected:** corrected the export fixture's pixel placement, preserved signedzero
  quantizer laws with exact numeric assertions, and used a valid far-out clock
  expression in the defensive regression. No tolerance or baseline was changed.
- **Delivery / next:** two finding commits, one final normal push; owner review/merge.
  No full repository gate is run or claimed; owner CE15 checkout is untouched.
- **Records:** [second review evidence](./pr-48-second-review-fix-results.json),
  [PR #48](https://github.com/xxibcill/still-shift/pull/48).

### 2026-10-08 — PR #48 inline findings and scoped repairs

- **Agent / branch:** Codex on isolated `codex/pr48-conflict-resolution`, from `d62a7a4d`.
- **Scope:** two posted inline findings; one finding per commit, one final normal push.
- **Done:** capture lifetime `d0ce169c` adds ownership/release, bounded pending/live
  resources, cancellation guards and disconnect cleanup. The following finding commit
  shares visual/PCM/mix lock cleanup and adds the real-lock fault regression.
- **Results:** pre-fix URL expiry and lingering-lock failures reproduced; CLI preview
  integrations, 5 fixture / 34 cache integrations and 2,566 units pass. Native
  browser/export/session checks pass, including uncached and reverse seek retention.
- **Rejected:** initial fast build found an implicit array type in the new CLI regression;
  added the explicit capture-array type. A formatting scan overlapped with temporary
  fixture API test files; rerun sequentially after cleanup, never format generated fixtures.
- **Delivery / next:** one finding per commit, one final normal push; owner review/merge.
  No full `pnpm check` was run or claimed; no verification job remains active.
- **Records:** [repair evidence](./pr-48-review-fix-results.json),
  [PR #48](https://github.com/xxibcill/still-shift/pull/48).

### 2026-10-08 — PR #48 conflicts resolved and independently reviewed

- **Agent / branch:** Codex on isolated `codex/pr48-conflict-resolution`, from `aedfc9eb`.
- **Done:** merged `main` at `e249a5da`; combined all 23 conflicts, preserved native
  media/audio and reviewed renderer/authoring/soundtrack behavior. Native draft
  preparation keeps per-draft leases; cinematic alpha checks await source frames.
- **Results:** pinned toolchain/build/lint/schema, 2,560 units / 46 runtime /
  179 affected integration checks and 14 Python tests pass across focused runs.
  Two integration expectations were repaired and rerun. Affected media/passage/
  renderer/timeline browsers, 336 selected native default frames and all 176 frozen
  items / 36,061 frames pass without regeneration.
- **Rejected:** initial build exposed duplicate CLI/Vitest imports, an invalid new
  image fixture and an unsafe async UI narrowing; repaired before regression checks.
- **Review:** one reproduced P2: active native capture URLs expire after newer
  prepares; native caller-mutation candidate is suppressed by the immutable contract.
- **Scope correction:** interrupted the over-scoped full 15-fixture cinematic export
  matrix after about 14 minutes; it is not passed. Existing exact coverage/reveal
  helpers and 2 affected defaults pass; full default inventory is not rerun.
- **Delivery / next:** merge `471582f5`, test repairs `749452d2` and final evidence
  delivered through a normal push to PR #48; owner follow-up on the single P2
  capture-lifetime finding. No verification job remains active.
  No full `pnpm check` was run or claimed; owner CE15 checkout is untouched.
- **Records:** [resolution evidence](./pr-48-conflict-resolution-results.json),
  [PR #48](https://github.com/xxibcill/still-shift/pull/48).

### 2026-10-08 — PR #47 bitmap repair and follow-up closeout

- **Agent / branch:** Codex on isolated `codex/pr47-second-review-fixes`.
- **Done:** normalized same/cross-realm ImageBitmap image/depth uploads through
  temporary Canvas2D surfaces; released scratch storage and advanced cache identity.
  All three posted findings have separate commits and one final normal push.
- **Results:** 144 exact bitmap comparisons on pinned software and M5 Pro hardware;
  36 independent mixed-color alpha cases match. Final fast checks pass 2,498 units;
  affected browsers/exports, all 176 family defaults and 176 frozen items pass.
  Final probe guards have 36 exact comparisons after inventory/export checkpoints.
- **Rejected:** direct bitmap uploads failed orientation/alpha checks; evidence JSON
  formatting briefly stopped the final fast check, then formatting and rerun passed.
- **Open / next:** owner review/merge; CE6-P WebGL timing remains deferred.
  No full `pnpm check` run or complete repository gate is claimed; owner files untouched.
- **Records:** [evidence](./pr-47-followup-fix-results.json),
  [PR #47](https://github.com/xxibcill/still-shift/pull/47).

### 2026-10-08 — PR #47 legacy compatibility repair

- **Agent / branch:** Codex on isolated `codex/pr47-second-review-fixes`.
- **Done:** compacted reachable states, pruned unused assets, bound long image/font
  IDs through source ordinals and preserved deep clips/followers in collapsed scopes.
  Collision-safe payload IDs and copied ink/container probes preserve diagnostics.
- **Results:** 53 final focused units / 36 exact probe comparisons; final fast checks
  pass all 2,498 units. Complete affected delivery passes 26 backend cases / 3,552
  forward and reverse frames, 26 independent encodes / 78 production-repeat-raw
  exports and 102 hardware comparisons. Worst Canvas median ratio 1.1839 stays
  below 1.25. All 176 family defaults and frozen items / 36,061 frames pass.
- **Rejected:** initial source-budget/pose/metadata corners and final aliased probes
  failed; regressions now pass. Full inventory/export checks preceded the probe-only
  amendment; final focused probes and fast checks verify it. No full `pnpm check` run.
- **Next:** bitmap repair is complete in the following slice; owner review/merge follows delivery.
- **Records:** [evidence](./pr-47-followup-fix-results.json).

### 2026-10-08 — PR #47 follow-up review repairs

- **Agent / branch:** Codex on isolated `codex/pr47-second-review-fixes`, from `787ded34`.
- **Scope:** three posted inline findings; one finding per commit, one final push.
- **Done:** posted the three code comments; cached window text/provider preparation
  and coverage before playback, released temporary backends, advanced cache versions.
- **Results:** pinned toolchain/build, 103 affected units and two long-timeline browser
  fixtures pass; boundary playback repeats no preparation and pixels remain exact.
  Other repairs and final focused verification remain in flight.
- **Next:** finish each repair and focused verification, then push all three commits once.
- **Records:** [evidence](./pr-47-followup-fix-results.json),
  [inline review](https://github.com/xxibcill/still-shift/pull/47#pullrequestreview-5453536103).

### 2026-10-08 — PR #47 review repairs

- **Agent / branch:** Codex on isolated `codex/pr47-review-fixes`, from `ed4034c`.
- **Scope:** six posted inline review findings, one finding per commit, one final push.
- **Done:** bounded boxed/container text; GPU image-plane preflight; actual local
  quality clocks; Lab source ownership and pending seeks; own follower bindings;
  long story/commerce timelines split into bounded native windows with global clocks.
- **Results:** 2,487 units / 46 runtime / 65 affected integrations pass, as do
  affected browsers, selected long-scene raw/seek/disposal checks and complete
  boxed-text delivery. All 176 defaults and frozen items / 36,061 frames pass.
  Canvas maximum 1.0532× is below unchanged 1.25×; no full repository gate was run.
- **Rejected / do not repeat:** initial fast check exposed the expected changed
  batch identity hash; corrected that snapshot only. Frozen visual files are exact.
- **Open / next:** owner review/merge of PR #47; delivery uses one final normal push.
- **Records:** [repair evidence](./pr-47-fix-results.json),
  [inline review](https://github.com/xxibcill/still-shift/pull/47#pullrequestreview-5452665143).

### 2026-10-08 — Resolve PR #47 conflicts with main

- **Agent / branch:** Codex on `codex/pr47-conflict-resolution` from `adf6cea`.
- **Scope:** merge `main` at `8cc7b14f` into native CE4d; preserve both parents.
- **Done:** commit containing this entry resolves 17 conflicts, repairs duplicate
  test imports from auto-merge, advances merged cache identities and their fixture.
- **Results:** fast checks pass 2,457 units; 46 runtime / 79 affected integrations /
  14 depth tests, affected browsers and complete native depth/legacy delivery pass.
  All 176 defaults and 176 frozen items / 36,061 frames pass unchanged references.
  Both histories and 62 mandatory commands remain; independent merge review is clear.
- **Rejected / retained:** failed build and stale identity fixture are recorded;
  unchanged Canvas 1.25× policy passes, WebGL timing remains CE6-P deferred.
- **Next:** owner review/merge. No new full `pnpm check` is claimed; owner CE15
  checkout is untouched and GitHub Actions remain disabled.
- **Records:** [evidence](./pr-47-conflict-resolution-results.json),
  [PR #47](https://github.com/xxibcill/still-shift/pull/47).

### 2026-10-08 — Resolve PR #46 conflicts with main

- **Agent / branch:** Codex in isolated `pr46-conflict-resolution`, original PR
  head `eda7aeb8`, integrated main `1f6fe812`.
- **Done:** retain main's complete runtime and newer version identities, preserve
  CE5-X approval/audit stop/Q9 and both parent log histories; correct current E51 prose.
- **Results:** pinned toolchain/native browser startup, all 2,400 unit tests, build,
  schema, lint and boundaries pass. Main code/tests/assets/config are exact; all
  144 visual files / 433 fixtures remain exact. Independent merge audit has no findings.
- **Scope:** unit command retained its built-in directory filter and ran all units;
  no full `pnpm check`, browser/export, frozen render or timing gate was rerun.
- **Next:** owner review/merge of PR #46. Original CE5-X scope, connector contract,
  A1 baseline and remaining sequence decisions remain open.
- **Records:** [Resolution](./pr-46-conflict-resolution-results.json),
  [original audit](./composition-ce5x-results.json), [PR #46](https://github.com/xxibcill/still-shift/pull/46).

### 2026-10-08 — PR #45 focus-crossfade repair and final verification

- **Agent / branch:** Codex on `codex/pr45-reveal-focus-fixes` after rendered reveal repair `c91d717`.
- **Scope:** second inline P2 finding; one finding per commit and one final push.
- **Done:** preserve local overscan before Gaussian focus for active image crossfades; retain direct drawing at settled/zero-focus boundaries. Add graph and decoded-PNG regressions, document the behavior and bump backend identities.
- **Results:** three new unit cases and the pixel regression fail on reviewed source (maximum delta 146); all 20 repaired crossfade comparisons are exact and both-backend repeated exports match the projected reference. Final fast checks pass 2,400 units; eight affected integrations, all 46 cinematic diagnostics, camera/WebGL export/exposure checks and all 176 frozen items / 36,061 hashes pass. Reveal checks pass 45 cases per backend; 42 invalid exports publish nothing, 20 valid repeat pairs and ten controls are byte-identical. Final independent Standards/Spec reviews have no findings.
- **Rejected / do not repeat:** a final edge review caught artificial transparency inside the viewport; corrected neighbor interpolation remains in the first finding's commit. Editing that module interrupted the first frozen run after 34 matches; only the complete 305.68-second rerun on unchanged final source counts. No baseline regeneration, full `pnpm check` or timing matrix.
- **Open / next:** one final normal push delivers both repair commits together; owner review/merge remain. Actions stay disabled.
- **Records:** [repair evidence](./pr-45-reveal-focus-fix-results.json), [PR #45](https://github.com/xxibcill/still-shift/pull/45).

### 2026-10-08 — PR #45 rendered semantic reveal-alpha repair

- **Agent / branch:** Codex on `codex/pr45-reveal-focus-fixes` from reviewed `8ee9088`.
- **Scope:** first of two inline P2 findings; one finding per commit, one final push.
- **Done:** measure rendered subject and combined occluder alpha at actual shutter states, preserve held clocks/shared ancestor isolation and node/frame diagnostics, and reject suppressed matte sources. Add decoded-PNG controls, document the rule and bump backend identities.
- **Results:** three new unit regressions fail on reviewed source; all 58 focused units, TypeScript, focused lint/format and boundaries pass. Both backends pass 45 reveal cases; 42 invalid exports publish nothing, 20 valid repeat pairs and ten independent control exports are byte-identical. In-viewport edge samples pass while offscreen queries fail. Independent Standards and Spec reviews have no remaining findings.
- **Rejected / do not repeat:** the first smooth-wall shutter fixture used the wrong key interpolation; corrected held-wall red confirms the defect. The temporary export runner’s initial control property was wrong; supplemental exports verify all controls. Keep caches and Python environment isolated.
- **Open / next:** separate focus-crossfade repair, final scoped browser/export/frozen checks, then one normal push. No full `pnpm check` or timing matrix; Actions remain disabled.
- **Records:** [repair evidence](./pr-45-reveal-focus-fix-results.json), [PR #45](https://github.com/xxibcill/still-shift/pull/45).

### 2026-10-08 — PR #45 rendered background-alpha repair and final verification

- **Agent / branch:** Codex on `codex/pr45-alpha-fixes` after reveal repair `737b0cc`.
- **Scope:** second inline P2 finding; one finding per commit and one final push.
- **Done:** validate isolated rendered background alpha at actual exposure states, preserve mandatory cinematic errors, and reject direct/ancestor matte-source suppression. Add both-backend mask, matte, group, shutter and sibling-concealment regressions; document the native coverage rule and bump renderer/export identities.
- **Results:** final fast checks pass 2,390 units; 46 cinematic diagnostics and 176 frozen items / 36,061 hashes pass unchanged. Valid/retained PNG previews stay exact; 22 invalid opacity/alpha exports publish nothing. Eight affected integrations, camera, WebGL exports and exposure checks pass. Final Standards and Spec audits have no findings.
- **Rejected / do not repeat:** an early frozen run stopped at a missing browser initializer after 40 matching items while work was in flight; it is not counted as passed. Final module/profile preflight and complete sequential frozen run pass on an unchanged source fingerprint. No baseline regeneration, full `pnpm check` or timing matrix.
- **Open / next:** final normal push delivers both repairs together; owner review/merge remain. Actions stay disabled.
- **Records:** [alpha repair evidence](./pr-45-alpha-fix-results.json), [PR #45](https://github.com/xxibcill/still-shift/pull/45).

### 2026-10-08 — PR #45 persisted reveal-opacity repair

- **Agent / branch:** Codex on `codex/pr45-alpha-fixes` from reviewed `76fb71b`.
- **Scope:** first of two new inline alpha-validation findings; one finding per commit.
- **Done:** preserve full evaluated subject/occluder opacity and diagnostic node/frame after native reload; add static, keyed and inherited regressions and document the retained source rule.
- **Results:** three new regressions fail on reviewed source; 41 focused tests, TypeScript and focused lint pass. Actual decoded-PNG Canvas/WebGL previews and four export attempts reject invalid opacity; valid retained previews stay exact. Independent Standards and Spec reviews have no findings.
- **Rejected / do not repeat:** group fixtures require `size`; use the isolated worktree's caches and environment, with approved commands for sandbox-restricted startup.
- **Open / next:** rendered background-alpha repair; then affected browser/export/frozen checks and one final push. No full `pnpm check` is claimed; Actions remain disabled.
- **Records:** [alpha repair evidence](./pr-45-alpha-fix-results.json), [PR #45](https://github.com/xxibcill/still-shift/pull/45).

### 2026-10-08 — PR #45 shutter coverage repair and final verification

- **Agent / branch:** Codex on `codex/pr45-conflict-review` (from `a99be1f`).
- **Scope:** second inline P2 finding, one repair per commit and one final push.
- **Done:** validate declared background coverage using actual mixed exposure states;
  retain held-layer clocks, shutter cuts, opacity, focus padding and integer reveal semantics.
- **Results:** five regressions fail on original code; all 38 focused units pass after repair.
  Decoded-PNG previews and protected export failures pass on both backends. Final fast
  checks pass 2,385 units; eight affected integrations, camera/cinematic smoke/export/exposure
  suites and all 176 frozen items / 36,061 frames pass. No baselines regenerated.
- **Rejected / do not repeat:** no new full `pnpm check` or family timing matrix for scoped fixes.
- **Open / next:** both repairs use one final normal push; owner review/merge remain.
- **Records:** [repair evidence](./pr-45-fix-results.json),
  [inline findings and disposition](./pr-45-review-results.json).

### 2026-10-08 — PR #45 local primitive-blur repair

- **Agent / branch:** Codex on isolated `codex/pr45-conflict-review` from `3545055`.
- **Done:** post both findings inline; keep positive own/inherited/collapsed
  primitive blur on its local surface before projection. Zero/disabled blur keeps
  the direct image path. Canvas/WebGL/export identities are 1.42.2 / 0.57.2 / 0.6.7.
- **Results:** four original-code unit failures and a real-pixel delta of 82 are
  reproduced before repair. After repair, 35 focused units and all 36 actual
  Canvas/WebGL pairs pass exactly across uniform/nonuniform/rotated placement.
  Pinned toolchain/imports, focused formatting and lint pass.
- **Open / next:** coverage repair, final focused verification and a single final
  push remain. This commit repairs only the first finding. No full gate or Actions.
- **Records:** [Repair evidence](./pr-45-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/45#discussion_r4211449039).

### 2026-10-08 — PR #45 main conflict integration and independent review

- **Agent / branch:** Codex on isolated `codex/pr45-conflict-review` from `17666eb`.
- **Done:** merge `1b3f98f` combines nine conflicts with `main` at `50cbf633`;
  keep settled optics, shared XYZ/view-offset tracks, clipping/echo rounding,
  both development histories and all 59 mandatory commands. Combined evaluator /
  Canvas / WebGL / export identities are 51 / 1.42.1 / 0.57.1 / 0.6.6.
- **Results:** 2,371 units, 46 runtime, eight affected integrations and scoped
  cinematic/camera/lighting/export/exposure/inspector checks pass. All 176 frozen
  items / 36,061 frames and main baseline bytes match without regeneration.
- **Review / next:** two independently reproduced P2 findings remain open:
  affine primitive-blur scaling and integer-only persisted shutter coverage.
  Verified merge/evidence are pushed; GitHub confirms mergeable. Owner review/merge
  remain. No full gate or CE6-P
  acceptance is claimed; owner checkout is untouched and Actions remain disabled.
- **Records:** [Merge evidence](./pr-45-conflict-resolution-results.json),
  [independent review](./pr-45-review-results.json).

### 2026-10-08 — PR #44 receiving-toggle focus repair and final verification

- **Agent / branch:** Codex on isolated `codex/pr44-conflict-review` after `009ae7d`.
- **Done:** give Receive light a stable control identity and reuse guarded focus
  restoration; keep this finding separate from the XYZ dependency commit.
- **Results:** the original-code keyboard regression fails; repeated Space/Enter,
  rejected edits and deliberately moved focus pass after repair. Final fast checks
  pass 2,322 units; native lighting, inspector and WebGL exports pass. All 176 frozen
  items / 36,061 frames and the final source fingerprint remain unchanged.
- **Review / next:** independent Standards and Spec audits report no remaining
  findings. Push both repair commits together after this commit; owner review/merge
  remain. No full repository gate, performance rerun or Actions.
- **Records:** [Repair evidence](./pr-44-fix-results.json),
  [finding](https://github.com/xxibcill/still-shift/pull/44#discussion_r4210916490).

### 2026-10-08 — PR #44 implicit XYZ light dependency repair

- **Agent / branch:** Codex on isolated `codex/pr44-conflict-review` from `5b233c8`.
- **Done:** post both findings inline; include implicit lights in shared anchor
  dependency discovery and advance evaluator cache identity to 50.
- **Results:** six new unit failures and native pixel parity fail before repair;
  75 focused tests, build/lint and six native cases pass afterward. All 240 preview
  draws match explicit XYZ controls; 24 production/control/repeat/raw exports
  cover 192 frames and are byte-identical within each case.
- **Open / next:** commit this finding, repair keyboard focus in a separate commit,
  finish scoped verification and push both together. No full gate rerun or Actions.
- **Records:** [Repair evidence](./pr-44-fix-results.json),
  [finding](https://github.com/xxibcill/still-shift/pull/44#discussion_r4210916475).

### 2026-10-08 — Resolve and review PR #44 against merged CE8

- **Agent / branch:** Codex in isolated managed `pr44-review`, from `e1bd4bc`.
- **Done:** merge `548b5c7` combines eight conflicts with `main` at `e97dacbc`;
  `3640c69` preserves light-key editing under main's null root scopes.
  Lighting, camera/XYZ, effect/exposure, soundtrack and both histories are retained.
- **Results:** fast checks (2,313 unit), 112 focused regressions, 46 runtime and
  all eleven example programs pass. Native lighting/camera/export/hardware and
  real inspector pass; all 176 frozen items / 36,061 frames match unchanged references.
- **Review / next:** one Standards usability P2 and one Spec P2 remain open:
  receiving-toggle focus and implicit XYZ light Z reference dependencies.
  Normal push delivers the conflict resolution; owner repair/merge remain.
  No full `pnpm check` or performance gate rerun; owner checkout is untouched.
- **Records:** [resolution](./pr-44-conflict-resolution-results.json),
  [review](./pr-44-review-results.json).

### 2026-10-08 — PR #43 null-guide repair and final verification

- **Agent / branch:** Codex on isolated `codex/pr43-followup-fixes`, from `9b53db3`.
- **Done:** project spatial null guides from their evaluated world transform and
  owning camera; complete the fourth finding-specific repair commit.
- **Results:** five original-code regressions fail before repair; 49 related tests
  pass afterward, and 28 Canvas/WebGL guide comparisons/reverse seeks are exact.
  Complete pinned local `pnpm check` passes 2,265 units, 46 runtime, 224 integration,
  14 depth tests, all required browser groups and 176 frozen items / 36,061 frames.
  Full Canvas family pixel/timing policy and the source fingerprint remain intact.
- **Review:** independent Standards and Spec reviews have no findings.
- **Next:** owner review/merge of PR #43; all four repairs use one final normal
  push. CE6-P remains separate and Actions stay disabled.
- **Records:** [repair evidence](./pr-43-followup-fix-results.json) and
  [plan follow-up](./composition-engine-plan.md#pr-43-review-follow-up-2026-10-08).

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
  All 23 prepared depth timelines had passed exact forward/reverse parity before that failure.
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

### 2026-10-07 — PR #43 follow-up review repairs

- **Agent / branch:** Codex on isolated `codex/pr43-followup-fixes`, from `9b53db3`.
- **Scope:** four posted P2 findings, each repaired in a separate commit.
- **Done:** preserve XYZ smooth spatial velocities across adjacent Bézier edits;
  validate secondary camera optics after their expression/motion writers settle.
  Accept machine-roundoff affine effect coordinates while rejecting real perspective.
  Project spatial null guides through their own scope's camera and world transform.
- **Results:** original-code regressions fail for all four findings; focused groups
  pass 51 / 86 / 32 / 49 tests. All 28 Canvas/WebGL coordinate comparisons and
  reverse seeks are exact. Independent Standards and Spec reviews have no findings.
- **Attempts:** corrected signal/anchor fixtures and browser preview frames;
  controls require visible effect paint. Detailed attempts remain in the evidence.
- **Next:** finish full local verification and one final normal push. Frozen
  references, thresholds and all 57 required commands remain; Actions stay disabled.
- **Records:** [review/fix evidence](./pr-43-followup-fix-results.json).

### 2026-10-07 — PR #43 main conflict integration

- **Agent / branch:** Codex on isolated PR head `c0c8f5d`, integrating `main` `f1cc8fe0`.
- **Done:** retain cameras/XYZ/ancestor coverage with all upstream renderer,
  clocks, shape, builder, inspector, quality and soundtrack fixes; advance caches.
- **Results:** fast checks pass 2,247 units; 46 runtime / 224 integration tests,
  native camera acceptance, nine affected browser groups and 176 frozen baselines /
  36,061 frames pass. Fifteen new integration regressions retain Z tracks/dependencies,
  roving, projected scale/reflections and orientation timing. Source fingerprint stays exact.
- **Attempts:** initial formatting stop and late orientation finding are retained;
  final complete fast checks reran after repairs. No full `pnpm check` is claimed.
- **Next:** owner review/merge of the updated existing PR branch.
  CE6-P performance stays deferred and Actions disabled.
- **Records:** [resolution evidence](./pr-43-conflict-resolution-results.json).

### 2026-10-07 — PR #42 hidden-source echo history repair

- **Agent / branch:** Codex on isolated `codex/pr42-followup-fixes`, after `6e33664`.
- **Scope:** second inline P2 finding; preserve the captured source's own echo.
- **Done:** apply scoped capture visibility to historical source paints and group
  descendants while retaining in/out points; separate corrected renderer caches.
- **Results:** ten regressions fail before repair; 59 focused tests pass afterward.
  Final fast gate passes 2,093 units; 40 exact backend cases / 160 renders, catalogue,
  hardware/export/exposure checks and 176 frozen items / 36,061 frames pass.
  Independent Standards and Spec review have no findings; full gate was not rerun.
- **Next:** one normal push delivers both finding commits; owner review/merge remain.
- **Records:** [review/fix evidence](./pr-42-followup-fix-results.json).

### 2026-10-07 — PR #42 normalized plugin registration repair

- **Agent / branch:** Codex on isolated `codex/pr42-followup-fixes`, from `b2f2048`.
- **Scope:** first of two posted P2 findings; retain the contract-owned descriptor.
- **Done:** renderer input snapshots follow the immutable normalized registration.
- **Results:** both new regressions fail before repair and pass afterward; all 30
  focused plugin/input/contract tests, build and focused lint pass.
- **Next:** the separate echo repair and final evidence are recorded above;
  both finding commits share one final normal push. Owner review/merge remain.
- **Records:** [review/fix evidence](./pr-42-followup-fix-results.json).

### 2026-10-07 — PR #42 main conflict resolution

- **Agent / branch:** Codex on isolated PR head `f000d8d` from
  `codex/composition-ce6-completion`; merge `main` at `3a5f2ff9`.
- **Done:** retain both native effect/linear-light paths and upstream exposure,
  disjoint paints, shape/clock/builder/inspector and soundtrack repairs.
  Fresh evaluator/Canvas/WebGL identities separate combined caches.
- **Results:** fast checks pass 2,077 units; all 224 integration tests and ten
  focused browser groups pass. Native catalogue seeks, independent/repeated exports,
  hardware comparisons and all 176 frozen items / 36,061 frames pass.
  All 196 prior entries and 56 required test commands remain; assets match parents.
- **Next:** owner review/merge of PR #42. No new full gate or
  CE6-P performance acceptance is claimed. Primary CE15 edits remain untouched.
- **Records:** [conflict evidence](./pr-42-conflict-resolution-results.json).

### 2026-10-07 — PR #41 immutable benchmark sources repair

- **Agent / branch:** Codex on isolated `codex/pr41-benchmark-fixes`, after `81238bb`.
- **Scope:** second inline P2 finding; immutable shared runtime and source provenance.
- **Done:** freeze repository browser modules, retain all shared source/manifest hashes,
  preserve selected historical sources and reject/retain drift or setup/timing failures.
- **Results:** all 24 focused regressions, lint/build and independent review axes pass.
  Pinned loader smoke passes 852 exposure and 24 exact particle cases plus both renderer
  versions. Retain the original shallow-source failures, canonical-path repair and two
  missing-report failures. Final fast gate passes 1,960 units / 160 files; the initial
  test type-import lint failure and its repair are retained in the evidence.
- **Open / next:** two finding commits and one final normal push; owner review/merge.
  No renderer changes, timing measurements, strict audit or full gate; CE6-P stays deferred.
- **Records:** [review/fix evidence](./pr-41-benchmark-fix-results.json).

### 2026-10-07 — PR #41 benchmark workload guard repair

- **Agent / branch:** Codex on isolated `codex/pr41-benchmark-fixes`, from `4e3c32b`.
- **Scope:** first of two posted inline P2 findings; direct composition workloads.
- **Done:** extract the process classifier, detect direct Node/tsx composition commands
  and ignore only the current PID while retaining package-manager/test detection.
- **Results:** five tests fail before repair; all 13 focused regressions, lint and build pass.
- **Open / next:** freeze shared sources for finding two, verify, commit separately and
  perform one final normal push to PR #41. CE6-P timing work remains deferred.
- **Records:** [review/fix evidence](./pr-41-benchmark-fix-results.json).

### 2026-10-07 — PR #41 merge conflict resolution

- **Agent / branch:** Codex in isolated `pr41-conflict`, from PR head `e5f4992`.
- **Scope:** merge current `main` (`fb785772`) into the existing PR without rewriting history.
- **Done:** retain both development-log histories and PR echo/particle/exposure changes;
  preserve upstream CE7 clock/state fixes and use WebGL 0.42.1 for combined caches.
- **Results:** pinned toolchain/browser and fast gate pass; 1,936 units / 66 integrations,
  WebGL correctness, 852 exposure cases per GPU profile, native clock/state checks,
  12 hardware comparisons and four production export cases pass. Frozen assets stay exact.
  Initial fast check stopped on merged-log formatting, repaired with Prettier.
- **Open / next:** owner review/merge on PR #41; CE6-P remains deferred/incomplete.
  No new full repository gate, strict audit or performance acceptance is claimed.
- **Records:** [conflict-resolution evidence](./pr-41-conflict-resolution-results.json).

### 2026-10-07 — CE6-P paused and deferred again

- **Owner decision:** “let's just pause here and defer it to future version again”.
- **Status:** completion goal paused; CE6-P is deferred, not complete. No future version
  number or restart date is assigned. Resume only on an explicit owner request.
- **Retained:** reviewed 0.42.0 / `d4ecdf8` in [PR #41](https://github.com/xxibcill/still-shift/pull/41),
  passing local/targeted correctness and all measured gains, failures and rejected experiments.
- **Open:** original 117/current 119 timing misses, native 2× and the full strict audit on 0.42.0.
  Requirements remain unchanged; the proposed architecture prototype is not approved.
- **Verification:** documentation formatting/diff checks only; no further performance work.
- **Records:** [deferral](./composition-ce6p-plan.md#owner-deferral--2026-10-07),
  [resolution record](./composition-ce6p-resolution-plan.md#owner-deferral--2026-10-07).

### 2026-10-07 — CE6-P feasibility assessment

- **Scope:** owner asked whether the unchanged target justifies further work after three days.
- **Evidence:** native production is 1.450/1.500 ms against matched 0.39375/0.375 ms
  budgets, requiring roughly 73–75% less total time. Standalone allocate+slice
  costs 0.500/0.525 ms; this is an observed control, not a universal lower bound.
- **Assessment:** the complete unchanged target is unlikely under the current approach;
  no compatible closure mechanism or original strict timing failure closure is demonstrated.
- **Recommendation / owner decision:** retain reviewed 0.42.0 and avoid an unbounded tuning loop.
  A separately authorized architecture prototype needs an early feasibility gate and may
  improve preview throughput without proving the original synchronous timing requirement.
- **Verification:** reviewed retained evidence; no benchmark or acceptance rerun.
- **Records:** [native decision](./composition-ce6p-resolution-plan.md#native-owned-output-decision--2026-10-06),
  [cost evidence](./composition-ce6p-cost-results.json).

### 2026-10-07 — CE6-P 0.42.0 reviewed delivery

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`, from `633138b`.
- **Done:** retained the approved echo bitmap-rounding correction, disjoint-particle GPU paint
  and renderer version 0.42.0 for [PR #41](https://github.com/xxibcill/still-shift/pull/41).
- **Validation:** the complete local gate passes; both review axes are clear after evidence fixes.
  Targeted echo timelines, seeks, exports and sampled hardware agreement pass.
- **Rejected:** the fixed-native owned-output experiment preserves bytes but regresses;
  its complete allocation control alone exceeds the unchanged native budget.
- **Open / next:** CE6-P is incomplete. Original 117 timing misses, no new misses, native 2×,
  and the complete strict 195-case WebGL audit on 0.42.0 remain open. Both timing holds ended.
  No compatible closure mechanism is selected; architecture/acceptance changes need an owner decision.
- **Records:** [execution and decision](./composition-ce6p-resolution-plan.md#native-owned-output-decision--2026-10-06),
  [cost evidence](./composition-ce6p-cost-results.json), [echo proof](./composition-ce6p-echo-diagnosis-results.json).

### 2026-10-07 — PR #40 unreachable posterized-state cuts

- **Agent / branch:** Codex on `codex/pr40-posterized-cut-fix` from `824a627`.
- **Scope:** One inline P2 finding; preserve motion blur when posterization skips temporary states.
- **Done:** Reachable discrete-state comparison with conservative precision handling;
  evaluator/backend versions and unit/both-backend pixel regressions updated.
- **Results:** 246 focused tests and both independent reviews pass. Full local
  `pnpm check` passes 1,921 unit, 46 runtime, 224 integration, 14 depth and all browser
  groups; 112 new pixel comparisons and 176 frozen items / 36,061 frames are exact.
  Final source fingerprint is unchanged; first gate failure and environment repair retained.
- **Rejected / do not repeat:** Comparing a theoretical prior grid without proving it
  brackets the authored switch loses real cuts under extreme stretch.
- **Open / next:** Owner review/merge; delivery uses one finding commit and one final normal push.
- **Records:** [Fix evidence](./pr-40-posterized-cut-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/40#discussion_r4204819931).

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

### 2026-10-07 — PR #39 quality-independent radius-zero shadows

- **Agent / branch:** Codex on isolated `codex/pr39-zero-radius-fix`, from `cf38a439`.
- **Finding:** [P2 radius-zero quality changes](https://github.com/xxibcill/still-shift/pull/39#discussion_r4204571866)
  reproduced one-byte changes in both the CPU reference and pinned software shader.
- **Done:** share effective sample selection between CPU and shader construction;
  point emitters use one center sample and retain the authored sample-count option.
- **Results:** new regression failed before repair; 15 analytic tests, toolchain,
  build, schema, boundaries and focused lint/format pass. Complete prototype GPU
  verification retains all 96 frozen poses, seek/repeat/hardware, maximum-input
  and conditioned-shear checks. Radius-zero RGBA/PNG are exact across qualities
  within each profile and independent software repeats; frozen references are unchanged.
- **Delivery:** one finding commit and one final normal push to the existing PR branch.
- **Open / next:** owner review/merge; full repository/native/export acceptance,
  production precision and owner quality/budget choices remain deferred. Actions stay disabled.
- **Records:** [fix evidence](./pr-39-zero-radius-fix-results.json).

### 2026-10-07 — PR #39 conservative shadow-plane conditioning margin

- **Agent / branch:** Codex on isolated `codex/pr39-conditioning-fix`, from `0a11372`.
- **Finding:** [P2 inaccurate accepted shears](https://github.com/xxibcill/still-shift/pull/39#discussion_r4203797977)
  reproduced 155-byte pinned / 140-byte hardware errors; an interior pixel differs by 30 bytes.
- **Done:** raise the shared float32 Gram margin to `1e-2`, reject the reported
  nonzero-determinant shear and retain five supported near-limit/full-resolution controls.
- **Results:** regression failed before repair; 14 analytic tests, pinned toolchain,
  build, schema, boundaries and focused lint/format pass. All 96 frozen poses,
  288 seek draws, 96 independent repeats, 12 hardware probes and maximum inputs
  remain exact. Supported-shear controls pass all three profiles within one byte.
- **Delivery:** one finding commit and one final normal push to the existing PR branch.
- **Open / next:** owner review/merge; full repository/native/export acceptance,
  production precision and owner quality/budget choices remain deferred. Actions stay disabled.
- **Records:** [fix evidence](./pr-39-conditioning-margin-fix-results.json).

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

### 2026-10-06 — CE6-P resumed; echo correction and measured cost gate

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`, from `633138b`.
- **Scope:** approved versioned echo fix and messages to both named chats.
- **Done:** renderer 0.42.0 targeted frames/seeks, four identical MP4 pairs and profile samples pass.
- **Results:** full local `pnpm check` passes 1,600 units, 46 runtime, 139 integration, 14 depth,
  all browser groups and 176 frozen baselines / 36,061 frames; references remain unchanged.
- **Costs:** eight quiet particle sessions show selected gains; all pinned ratios still exceed 1.25×.
- **Rejected:** combined fresh-read/known-clear candidate regresses on both profiles; full allocate+fill
  alone exceeds the native budget. No broader proof or direct-solid timing follows.
- **Open / next:** native 2×, original 117/all strict family misses; no compatible closure mechanism
  selected. Both quiet slices released. Contract or acceptance changes require an owner decision.
  Source research resolves CPU Skia / possible Graphite; prepared bytes remain unverified.
- **Records:** [costs](./composition-ce6p-cost-results.json), [echo](./composition-ce6p-echo-diagnosis-results.json),
  [execution](./composition-ce6p-resolution-plan.md#quiet-window-cost-decisions--2026-10-06),
  [source research](./composition-ce6p-owned-output-research.md).

### 2026-10-06 — CE6-P goal activated; all failure GPU operations traced

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible` from `633138b`.
- **Done:** active unchanged completion goal; baseline GPU traces cover all 119
  failures / 117 originals at 476 frames, with exact repeated counts and pixels.
- **Results:** known-clear copies in 100 cases (311/1,956 calls; 44.33M/117.37M
  pixels). Twenty-five copies in eight cases require scope beyond single paint,
  including all four typography failures. No elapsed saving or closure claim.
  Fingerprints, failed attempts and cleanup are retained; formatting/diff checks
  pass. The competing check advanced from cinematic to typography; its live
  replacement worker is verified. Native guard refuses contention before launch.
- **Open / next:** quiet-host native costs, particle brackets, echo compatibility
  decision, original strict audits and final local `pnpm check`. The goal is
  blocked after the same conditions persist for three turns; acceptance stays open.
  Owner requested detail; current host contention was revalidated. No approval
  or goal-resume instruction was received during that explanation.
- **Records:** [execution record](./composition-ce6p-resolution-plan.md#active-completion-goal-and-gpu-operation-coverage),
  [operation evidence](./composition-ce6p-route-map-results.json).

### 2026-10-06 — CE6-P echo cause isolated; acceptance work remains blocked

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible` from `633138b`.
- **Done:** diagnosed cumulative primitive rounding in transparent echo image
  history; prepared a scoped correction patch without retaining production changes.
  Four failing cases pass 960 frames / 1,040 seeks in the isolated pinned proposal;
  controls pass and preserve unrelated bytes. Type check and 12 perceptual hardware
  samples pass. All 119 timing misses have actual selected-frame graph mappings.
- **Verification:** reviewed particle/native runners pass untimed preflight;
  failed-attempt retention is exercised. Sampling/harness review errors are repaired
  and retained. No elapsed timing, new full gate or milestone closure is claimed.
- **Open / next:** explicit echo compatibility and cross-chat messaging approvals
  remain pending; automatic approval review rejected coordination again. Other
  workloads continue. Complete native attribution and particle A/B, then unchanged
  strict audits and full local gate if the budget evidence supports proceeding.
- **Records:** [execution plan](./composition-ce6p-resolution-plan.md#echo-diagnosis-and-concrete-proposal),
  [echo evidence](./composition-ce6p-echo-diagnosis-results.json),
  [routing evidence](./composition-ce6p-route-map-results.json).

### 2026-10-06 — CE6-P disjoint particle candidate verified for correctness

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`, from `633138b`.
- **Scope:** follow the resolution plan to significant bounded progress.
- **Done:** pack disjoint particle neighborhoods and draw one exact instanced
  paint; add capability/resource fallbacks and focused byte/fault oracles.
- **Results:** selected paint passes 48–50 → 3; 720 frames plus 780 seeks per GPU
  profile match immutable 0.40.0; 1,600 unit tests, full WebGL correctness and
  repeated 240-frame stacked MP4 export pass. No elapsed speedup measured.
- **Repairs:** both review findings fixed; ignored historical `.ts` diagnostic
  moved to `.mts` after type-check failure. Hardware/pinned byte drift is inherited;
  twelve samples pass the existing perceptual tier.
- **Open / next:** quiet-window messaging approval, count-one attribution, valid
  A/B and strict/full gates; 119 timing misses/four echo gaps remain unclosed.
- **Records:** [execution plan](./composition-ce6p-resolution-plan.md#execution-record-2026-10-06),
  [raw progress evidence](./composition-ce6p-disjoint-paints-results.json).

### 2026-10-06 — CE6-P research before further experiments

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`, from `633138b`.
- **Scope:** research solutions and define a bounded resolution plan before more trials.
- **Done:** primary-source research, source-path review, retained timing budget
  calculations and independent plan review; runtime and acceptance remain unchanged.
- **Results:** 89 of 119 timing misses need more than 37.5% lower total cost;
  native count-one needs about 72% pinned / 78% hardware on retained summaries.
  A possible image-cache conflict is not established for story-instances.
- **Rejected / do not repeat:** existing PBO/FBO/scratch/upload experiments remain
  rejected; generic cache/batching advice lacks a demonstrated route to closure.
- **Open / next:** one bounded feasibility/attribution stage before implementation;
  explicit compatibility scope before an echo-byte correction. No workloads ran.
- **Records:** [research](./composition-ce6p-resolution-research.md),
  [resolution plan](./composition-ce6p-resolution-plan.md).

### 2026-10-06 — CE6-P strict audit and preserved-renderer proof

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`; runtime `7a797a9`.
- **Done:** unchanged strict matrices traverse 195 cases / 40,783 frames; all 53
  repeated MP4 pairs, relocation, overwrite protection and negative fit/font checks pass.
- **Failures:** all original 117 timing failures remain, plus atom-rotate and
  editorial/numeric. Four echo cases exceed their existing tier; all failing exits retained.
- **Provenance:** CE7 reproduces the four gaps. All 2,500 forward/reverse/random/
  repeated-read comparisons are byte-identical, including multi-sample echo/matte.
- **Delivery:** measured candidate retained; existing full gate/reviews remain valid.
  Main quiet window released at 01:24:27 UTC; Actions verified disabled.
  PR #41 is available for review; original performance targets and inherited gaps remain open.
- **Records:** [family audit and diagnostic source](./composition-ce6p-family-audit.json),
  [brackets](./composition-ce6p-exposure-brackets.json), [plan](./composition-ce6p-plan.md).

### 2026-10-06 — CE6-P measured candidate retained

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`, from `702bcf4`.
- **Results:** four complete valid brackets retained. Bounded pinned export improves
  2.676–3.962× at 2–64 samples over fusion alone; high-count RAF diagnostics improve.
  Hardware confirmation retains the original outlier and establishes no broad gain.
- **Selection:** retain exact compatible candidate for pinned benefits; renderer
  stays `7a797a9`, with existing reviews/focused/full-gate proof unchanged.
- **Next:** unchanged strict WebGL family audits with exports in the reserved window,
  then preserved-CE7 comparison of four echo-related pixel failures, final PR
  evidence and machine release. Provenance is pending. All six invalid attempts remain;
  original 117 cases and native/family acceptance targets stay open.
- **Records:** [raw brackets/analysis](./composition-ce6p-exposure-brackets.json),
  [evidence](./composition-ce6p-performance-results.json), [plan](./composition-ce6p-plan.md).

### 2026-10-06 — CE6-P quiet-window coordination authorized

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`, from `56adc86`.
- **Owner authorization:** approved main-chat coordination. Request sent; main
  acknowledged it will finish its current gate normally, then hold verification.
  Its full gate now passed and is terminal; the quiet window is available.
- **State / next:** handoff received; running remaining verification in the reserved window.
  Preserve valid fusion data and all six invalid attempts; run remaining bounded
  pinned/hardware brackets and strict family audits serially, then release machine.
  Existing renderer checks remain passed; PR #41 and CE6-P targets stay open.
- **Records:** [plan](./composition-ce6p-plan.md),
  [evidence](./composition-ce6p-performance-results.json).

### 2026-10-06 — CE6-P remaining performance verification blocked

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`, from `69a3e21`.
- **Rejected:** sixth invalid attempt: remaining-only retry `9449` completes its
  baseline, then main radial/warp/stylize/noise unit checks contaminate the candidate.
  The bracket is rejected and retained; session terminal exit 1, hardware unstarted.
- **State:** no retry/family workload queued. Recurring contention persists across
  at least three consecutive goal turns; unaffected checks and draft delivery done.
- **Owner / next:** provide a quiet verification window or authorize coordination
  with the main chat (original scope allows read-only checks). Preserve valid fusion
  data; complete bounded pinned/hardware brackets and strict family audits with exports.
  PR #41 stays draft; all original 117 failures and targets remain open.
- **Records:** [plan](./composition-ce6p-plan.md),
  [evidence and blocker audit](./composition-ce6p-performance-results.json).

### 2026-10-06 — CE6-P first valid independent timing bracket

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`, from `ae6db18`.
- **Results:** fusion-only pinned baseline/candidate/candidate/baseline complete
  with no detected contention. Two-sample export improves 15.85 → 14.25 ms
  (1.112×); higher-count gains overlap timing variability. No broad preview claim.
- **Rejected:** bounded first baseline overlapped main stylize unit tests;
  fifth invalid attempt retained; launcher `3547` terminal exit 1.
- **Next:** preserve valid fusion data; retry only remaining bounded/hardware
  comparisons and strict WebGL family audits after a reserved quiet window.
  Session `9449` is now terminal with a sixth invalid bracket.
  Draft PR #41 stays draft; original 117 failures and targets remain open.
- **Records:** [raw bracket and analysis](./composition-ce6p-exposure-brackets.json),
  [evidence](./composition-ce6p-performance-results.json), [plan](./composition-ce6p-plan.md).

### 2026-10-06 — CE6-P draft review delivery

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`, from `905feff`.
- **Done:** pushed and attached [draft PR #41](https://github.com/xxibcill/still-shift/pull/41),
  based on delivered CE7 `817cc9f`; verified Actions remain disabled.
- **Results:** passed exactness/focused/full-gate checks are reviewable. No valid
  timing bracket yet; main verification repeatedly reset the ten-minute wait.
  Verified waiting launcher `66431` idle, stopped it (exit 143), and replaced it
  with session `3547` using two idle minutes and unchanged timing/rejection methods.
  That session is now terminal after a valid fusion bracket and rejected bounded run.
- **Next:** complete the remaining independent A/B,
  strict WebGL family audits and measured candidate selection precede PR readiness.
  All original 117 failures and existing performance targets remain open.
- **Records:** [plan](./composition-ce6p-plan.md),
  [evidence](./composition-ce6p-performance-results.json).

### 2026-10-06 — CE6-P exposure fusion candidate checkpoint

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible`.
- **Done:** final shutter addition/average fusion, bounded GPU snapshots/sums,
  independent byte-average and
  retained-original GPU regressions, isolated serial A/B harness and preview budgets.
- **Results:** pinned toolchain/import preflight, TypeScript build and changed-file
  lint pass; 852 exactness cases pass on pinned SwiftShader and Apple Metal.
  Focused WebGL/exposure/export suites pass, including 12 hardware comparisons;
  complete `pnpm check` passes all suites and 176 frozen baselines / 36,061 frames.
  Four timing attempts were rejected by overlap detection and retained.
- **Rejected draft:** dividing signed exposure differences before adding the
  background can move half-byte ties; restore the integer numerator before division.
- **Retained attempt:** sandbox offline install lacked a package; normal locked
  install succeeded. No acceptance or baseline was changed.
- **Review:** both axes clean after repair. Rounded clear metadata could differ
  from GPU bytes; bounded accumulation now requires exact clear channels and has
  189 fractional-clear regressions. Fixed launch cleanup, old anchor, cold budgets
  and workload guard. Measurement review also repaired mixed-revision bounds
  loading and added workload fingerprints. Runtime stays fixed during the gate.
  Invalid timings are retained; Actions remain disabled.
- **Next:** corrected serial A/B is queued after a ten-minute quiet window;
  strict WebGL family matrices and measured candidate selection follow;
  draft PR #41 is now published.
- **Records:** [slice plan](./composition-ce6p-plan.md),
  [retained evidence](./composition-ce6p-performance-results.json).

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

### 2026-10-06 — PR #39 float32 Gram conditioning fix

- **Agent / checkout:** Codex on `codex/pr39-gram-fix` from PR head `a521818`.
- **Finding:** [P2 shader UV division](https://github.com/xxibcill/still-shift/pull/39#discussion_r4192154579)
  reproduced 253-byte software / 255-byte hardware errors on a small-coordinate plane.
- **Done:** reject float32-ill-conditioned bases in shared preflight and guard shader
  input construction. Regression reproduced before the fix; one focused fix commit.
- **Results:** all 12 analytic tests, pinned toolchain and focused static checks pass.
  All 96 frozen poses, 288 seek draws, 96 independent repeats, 12 hardware probes
  and maximum-input checks remain byte exact; frozen references are unchanged.
- **Rejected:** cross-product UV solve still differed by 127 bytes at thin-plane
  boundaries; reverted it rather than changing the oracle or frozen references.
- **Open / next:** full repository/native/real-export acceptance was not run;
  CE8/CE8-L integration and owner policy/budget decisions remain pending.
- **Records:** [fix evidence](./pr-39-gram-fix-results.json).

### 2026-10-06 — PR #39 receiver self-entry preflight fix

- **Agent / checkout:** Codex in an isolated PR #39 worktree from `344cb8e`.
- **Finding:** posted the P2 preflight mismatch as an
  [inline review comment](https://github.com/xxibcill/still-shift/pull/39#discussion_r4191535608).
- **Done:** allow one caster with the receiver's scoped identity; keep input
  validation and duplicate-caster rejection. Regression covers shared/copied self
  entries, other caster visibility and duplicate self entries through preflight.
- **Results:** regression reproduced first; all 11 analytic tests and focused
  toolchain/static gates pass. All 96 frozen poses, 288 seek draws, 96 independent
  repeats, 12 hardware probes and maximum-input checks remain byte exact.
- **Limits:** full repository/native/real-export gate not run for this isolated
  prototype correction; production integration remains pending. Actions stay disabled.
- **Delivery:** one focused fix commit for PR #39; no merge.
- **Records:** [review-fix evidence](./pr-39-self-entry-fix-results.json).

### 2026-10-06 — CE8-L-F bounded cast-shadow preparation

- **Agent / branch:** Codex on `codex/composition-ce8lf-prototype`, CE7 `0e48388`.
- **Done:** `20210b8` specifies the candidate/CPU oracle; `f04f593` delivers the
  independent shader, frozen alpha fixtures, reviewed gallery and evidence.
- **Results:** 9 analytic tests; 96 frozen poses, 288 seek draws, 96 independent
  PNG repeats and 12 actual hardware comparisons exact, plus maximum-input checks.
  Toolchain/static gates pass. Full repository/native/real-export acceptance was
  not run for this isolated preparation. Actions remain disabled.
- **Limits:** four-sample lobes and 16-sample bands retained; no production
  quality/performance claim. CE8/CE8-L, owner policy/budgets and integration remain.
- **Delivery:** [draft PR #39](https://github.com/xxibcill/still-shift/pull/39) is open
  and attached; primary checkout untouched. No merge performed.
- **Records:** [specification](./composition-ce8lf-cast-shadow-spec.md),
  [evidence](./composition-ce8lf-results.json), [gallery](./composition-ce8lf-gallery.png).

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

### 2026-10-06 — PR #42 premultiplied transition coverage

- **Agent / branch:** Codex on `codex/pr42-review-fixes` after `ebb9bbf`.
- **Done:** multiply stored premultiplied transition RGBA consistently with GPU;
  bump the four effect versions to 1.0.1 and Canvas renderer to 1.40.0.
- **Results:** four composed-map cases / 32 browser frames are exact (previous
  maximum delta 255); focused checks and independent implementation reviews pass.
- **Final gate:** full local `pnpm check` at `db35017` passes 1,717 unit, 46 runtime,
  139 integration, 14 depth tests, all required browser groups and 176 frozen baselines /
  36,061 frames. All three full Canvas family matrices and native CE6 acceptance pass.
- **Retained:** original reference files and thresholds; a separate versioned corrected
  Canvas oracle. Earlier stopped/failed gates and original/fixed timing controls are
  recorded; the successful gate's calibration-pan ratio is 1.0998 against 1.25.
- **Next:** owner review and merge. Final evidence belongs to this third finding commit.
- **Records:** [PR #42 fix evidence](./pr-42-fix-results.json).

### 2026-10-06 — PR #42 nested input failure cleanup

- **Agent / branch:** Codex on `codex/pr42-review-fixes`; text fix `8618bee`.
- **Done:** release owned precomp destinations if initialization or rendering fails;
  keep caller-owned surfaces and propagate the original failure.
- **Results:** 38 focused unit tests and build/lint pass; six repeated failures leave
  zero live surfaces. Initial test placement was offscreen and is repaired in the fixture.
- **Next:** transition coverage in its own commit, final verification, then one push.
- **Records:** [PR #42 fix evidence](./pr-42-fix-results.json).

### 2026-10-06 — PR #42 hidden animated text input fix

- **Agent / branch:** Codex on `codex/pr42-review-fixes` from `2f1a99c`.
- **Done:** posted all three findings inline; collect glyph clocks for scoped effect
  inputs even without echo, preserving inactive-window and unused-source behavior.
- **Results:** eight focused unit tests, build/lint and 24 pinned-browser frames pass;
  hidden text/group/remapped precomp inputs exactly match visible source controls.
- **Next:** one commit each for nested failure cleanup and transition coverage;
  complete final local verification, then push the three commits together.
- **Records:** [PR #42 fix evidence](./pr-42-fix-results.json).

### 2026-10-06 — PR #43 ancestor-group coverage fix

- **Agent / branch:** Codex on `codex/pr43-fixes`, after XY fix `c36c686`.
- **Done:** required alpha retains ancestor masks, mattes, effects and echo;
  unrelated siblings cannot hide holes, and captured source groups remain intact.
- **Results:** 35 focused units and 72 coverage cases pass. Final full pinned
  `pnpm check` passes 1,851 unit / 46 runtime / 139 integration / 14 depth,
  every required browser suite and all 176 frozen baselines / 36,061 frames.
- **Rejected / repaired:** current-child visibility prematurely bypassed ancestor
  echo; out-point/zero-opacity regressions now pass. Initial full gate stopped on
  a copied Python CLI's stale shebang; isolated environment repair and full rerun pass.
- **Open / next:** owner review/merge of PR #43. One finding per commit;
  push after the final commit. Baselines unchanged; GitHub Actions verified disabled.
- **Records:** [Fix evidence](./pr-43-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/43#discussion_r4192759936).

### 2026-10-06 — PR #43 XY spatial tangent fix

- **Agent / branch:** Codex on `codex/pr43-fixes`, after blur fix `e16d962`.
- **Done:** authored XY keys retain two-component tangents on cameras and 3D
  artwork; valid XYZ editing stays three-dimensional.
- **Results:** 14 focused units and all three real XY inspector edit/undo/redo/save
  flows pass; build and changed-file lint pass. Original key values stay XY.
- **Open / next:** ancestor-group required coverage, final local verification and
  one push remain. GitHub Actions stay disabled.
- **Records:** [Fix evidence](./pr-43-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/43#discussion_r4192759928).

### 2026-10-06 — PR #43 inherited projected blur fix

- **Agent / branch:** Codex on `codex/pr43-fixes` from CE8 `9d8f33a`.
- **Done:** shared positive primitive-blur inheritance expands actual local
  projection support; collapsed affine precomps preserve outer-scope painting.
  Evaluator/Canvas/WebGL/export identities identify the changed pixels.
- **Results:** 20 focused units and 24 exact identity-camera pixel comparisons;
  pinned toolchain/imports, build and changed-file lint pass. Baselines unchanged.
- **Open / next:** fix XY tangent editing and ancestor-group coverage separately;
  final local verification and one push remain. GitHub Actions stay disabled.
- **Records:** [Fix evidence](./pr-43-fix-results.json),
  [inline finding](https://github.com/xxibcill/still-shift/pull/43#discussion_r4192759920).

### 2026-10-06 — CE5-X prerequisites and provider audit stop

- **Agent / branch:** Codex on isolated `codex/composition-ce5x`, from CE4c `17666eb`.
- **Done:** plan `e39f99b` and review fixes `335ff23`, `3d0da6a`, `d3093bd`
  cherry-picked with CE4c functionality retained; record scoped owner approval/Q9.
- **Results:** pinned toolchain, Python imports and 67 focused shape tests pass;
  native shape baselines/seeks/exports/inspector, 144 legacy connector frames and
  18 exact hardware comparisons pass.
  Audit: 265 cases, 132 affected, 268 named path/flow provider layers before migration;
  71 affected CE0 items / 14,916 frames. Final inventory has zero audit errors.
- **Retained failures:** initial isolated dependency imports and fitted-panel audit
  preparation failed; repaired and retained in evidence. No full `pnpm check` run.
- **Open / next:** owner stop triggered for additional component motion providers,
  source-image attachments and four/five-vertex annotations; runtime migration stops.
  Resolve scope/contract first. A1 and remaining sequence decisions stay open.
- **PR:** [Draft #46](https://github.com/xxibcill/still-shift/pull/46) targets CE4c;
  audit checkpoint `f793fc0`, no auto-merge. Active CE4d checkout remains untouched.
- **Records:** [CE5-X audit](./composition-ce5x-results.json), [plan](./composition-engine-plan.md#ce5-x--shape-fidelity-connectors-and-expressive-strokes).

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

### 2026-10-05 — CE6-P parallel optimization lane resumed

- **Agent / branch:** Codex on `codex/composition-ce6p-compatible` from `0e48388`.
- **Scope:** measured compatible WebGL optimizations; independent of CE6 catalogue work.
- **Done:** active goal set, retained profiles/rejected experiments reviewed, dedicated
  branch and local locked dependency/Python environments prepared.
- **Results:** no candidate or performance target is claimed verified yet.
- **Next:** byte-level exposure fusion regression, then serial A/B without competing
  workloads; focused family acceptance and final full local gate before PR.
- **Records:** [slice plan](./composition-ce6p-plan.md).

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
