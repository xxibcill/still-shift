# Composition implementation continuation — 2026-10-07

## Mission and rules

Continue the user's unchanged goal through **all approved scheduled milestones** in
`docs/composition-engine-plan.md`: finish **CE4d → CE13 → CE15 → CE14**, auditing and
reusing existing CE16 during CE13. New branch per milestone; commit **and push**
frequent checkpoints; after each complete milestone create a PR and **always
attach it**, then start the next branch and continue. Do not merge PRs unasked.
CE5-X is proposed but Q9 is pending: do not implement or insert it into this order.
CE6-P, CE8-L-F and CE9-F1 remain separate owner work.

The user requested a genuinely fresh chat because the previous one was huge and
lagging. This file replaces the old conversation history. Read current `AGENTS.md`
and the development log before working. Preserve all thresholds, frozen CE0/depth
references, owner edits and existing worktrees. **GitHub Actions are prohibited
and disabled.** Run local pinned pnpm checks. No new subagents unless explicitly
authorized by the user or applicable instructions.

## Checkout and saved checkpoint

- Workspace: `/Users/jjae/Documents/playground/still-shift`.
- Branch: `codex/composition-ce4d`; implementation HEAD before handoff documentation:
  **`1ec5d04e6ddf580b0654c4129345e360a4d4f1aa`**, pushed.
- Subsequent handoff commit changes documentation only. Check actual HEAD.
- CE4d base `17666eb` on `codex/composition-ce4c`.
- No CE4d PR yet. CE4c PR45 is open/attached and is the intended CE4d base:
  https://github.com/xxibcill/still-shift/pull/45 . Do not merge it.
- Earlier completed/open/attached PRs: CE8-L44, CE8#43, CE6#42, CE7#40,
  CE5#38, CE11#37, CE10#36, CE4a#35, CE12#34.
- CE16 existing PR33: https://github.com/xxibcill/still-shift/pull/33 . Reference
  only so far; attach when actually continuing/auditing/integrating it. Do not
  create a duplicate CE16 PR or merge it unasked.

## First action: safely receive the running verification

**Do not launch new verification until this inherited job has settled.** The old
chat will stop implementation after dispatching this new chat; no new gate is
being started during wrap-up.

- Old PTY session **65922**, Node PID **79519** (PPID88610 at handoff).
- Immutable source snapshot **`/private/tmp/still-shift-ce8-check-1ec5d04`**.
- Command: pinned Node `node --import tsx tests/browser/composition-depth-acceptance.ts`.
- Live log **`/private/tmp/ce4d-depth-delivery-1ec5d04.log`**.
- Proof directory:
  `/private/tmp/still-shift-ce8-check-1ec5d04/benchmarks/results/composition-ce4d-depth-verification`.
- Final success writes **`native-acceptance.json`** with reports, costs, inspector
  and hardware data. Existing **`serial-costs.json`** is phase-only and explicitly
  not full acceptance. Absence of the final report is not a pass.
- At handoff all23 serial cost brackets were saved; correctness/export phase had
  passed the fourteen landscape/vertical timelines and was processing fallbacks.
  Consult the live log rather than assuming this partial progress is current.
- If old PTY IDs are inaccessible in a fresh chat, inspect this exact PID/cwd with
  read-only process tools and inspect the log/report. Avoid PID-reuse assumptions.
  Success requires complete final proof; a stopped process with no final report
  and an error log is a failure. Do not kill unrelated browser/export processes.
- The job covers all23 base/extended timelines, six mixed graphs, 29 independent
  encodes/87 production-repeat-raw exports, seeks/CLI relocation, resource/alpha
  corner checks, actual inspector history/save/reload and **90 hardware comparisons**
  (original87 plus three tiny-raster cases). The alpha-edge probe below is not yet
  part of it. Preserve this job's exact source identity in any evidence record.
- CE6-P's second quiet timing hold was explicitly **released**. No further owner
  timing job was scheduled at release. Do not follow stale hold instructions in
  older `/private/tmp` notes.

## CE4d implemented and focused-verified

Current Canvas **1.44.0**, WebGL2 **0.62.0**, image-plane shader **0.3.0**,
depth adapter **0.1.0**, export worker **0.6.6**.

- Six legacy presets compile through native layers/followers with integer-frame
  baking. Family state sampling lives in adapters; public pure evaluation delegates
  to it. Prepared family cores avoid whole-family paint fallback. Q2 freeze guidance
  is already documented in README/user guide/contributing rules and schema comments.
- Native bounded `depth-image` contract, builder, pure local evaluation, shared GPU
  pass and graph integration, inspector/history/save/reload are implemented.
  Preserved safety, framing, overscan, edge damping, alpha policy, hashes/dimensions,
  local clocks/remap/precomp/shutter and one camera application. Canvas rejects true
  depth before painting. Optional lighting shades the resulting flat surface.
- Browser prepared wrapper hashes immutable actual bytes, verifies dimensions and
  exposes native composition/provenance; Node `prepareDepthExportComposition`
  exists with focused tests. **Actual public/Node defaults remain unswitched.**
- Frozen legacy drawing is copied into test-only oracles; production must never
  import those. Do not regenerate old CE0/depth references.
- PR43 reviewed source repairs and zipper QA source are integrated; earlier proof
  details live in `docs/composition-ce4d-results.json`.
- Latest shader repair preserves the pinned software shader/indexed mesh; hardware
  UV interpolation uses flat triangle data, pixel centers and 1/16-pixel projected
  vertices, matching measured pinned legacy precision. Tiny collapsed interpolation
  triangles fall back to the native smooth varying, retaining original coverage.
  Source references are linked in the implementation/results. Hardware geometry,
  profiles and acceptance thresholds were not changed.
- On code equivalent to1ec5d04: build/scoped lint and **20 unit/3 files pass**;
  **all23 prepared timelines /2070 forward+2070 reverse frames are exact**;
  **all87 hardware comparisons pass**; 1x1/2x1/4x4 local rasters retain full opaque
  coverage and **three additional hardware checks are exact**.
- Worker startup/private-cache/provenance focused proof on f01a35b: build/lint/pinned
  toolchain, **25 unit/3 files**, **11 integration/3 files** pass. Includes injected
  module exception/HTTP503, rollback/closed browser/retry, upload/probe/decode
  cancellation, publication and pinned renderer enforcement.
- Complete family prepared candidate on **a843cf9** passes **176 items /36061
  forward+36061 reverse frames**, assigned tiers, unchanged CE0 hashes and typography
  ink/container probes. Maxdelta2 with six nonzero cases. Full report retained;
  this is candidate proof, not actual-default/final-gate acceptance.

## Failures and rejected experiments — do not repeat without new evidence

- First full native delivery a843cf9 completed all23 cost brackets (numeric costs
  were not saved), 17 independent encodes/51 production-repeat-raw exports, then
  browser initialization timed out. Root cause remains unconfirmed.
- Second full native delivery **f01a35b** saved all23 serial costs, completed all29
  independent encodes and87 production-repeat-raw exports with byte identity,
  then failed hardware `depth-repeated-precomp-remap/webgl2/frame0`: max44,
  PSNR38.9066008663, SSIM0.9883163625. No final acceptance report. Startup succeeded
  but this does not prove private-cache changes fixed the previous cause.
- CPU source SVG rasterization, explicit bilinear filtering and derivative
  pixel-center correction did not fix hardware. Full analytic triangle reconstruction
  improved hardware but failed frozen software near (frame2delta8). 1/256 rounding
  also failed near; centroid interpolation failed both profiles badly.
- Hardware-only unquantized analytic interpolation still failed. **1/16-pixel
  hardware interpolation with unchanged software** is the verified retained repair.
- Unconditional Canvas `setTransform(getTransform())` transfer was rejected during
  earlier family parity. The retained transfer is only for a settled distinct-state
  transition (`stateFrom` exists, `stateMix` exists, `stateFrom !== state`). It passes
  all176 candidate parity. Do not broaden/revert it casually.

## Confirmed open alpha-edge defect — next code repair, not applied

Private actual-pixel probe:
`/private/tmp/still-shift-ce8-check-1ec5d04/tests/browser/ce4d-alpha-edge-diagnostic.ts`;
output **`/private/tmp/ce4d-alpha-edge-1ec5d04.log`**. Probe job completed; no competing
alpha job remains. Initial8x8 root rejected the minimum16px contract; rerun at16x16
is valid and confirms the defect.

A hash-verified2x2 source has one pure-red column and one transparent column, constant
2x2 gray depth, motion strength0/scale1/roll0/offset0/overscan0, native layer16x16,
background pure green. At filtered edge RGB111,112,0 (sum223), rather than R+G255:
straight RGB is filtered before alpha multiplication, causing a dark fringe.

Repair candidate: **only for `alphaMode: preserve`**, fetch four sRGB texture texels
(which are returned decoded to linear), premultiply each RGB by alpha, bilerp all
four channels, unpremultiply nonzero-alpha RGB, then existing OETF and output
premultiplication. Preserve the opaque compatibility `texture(source,uv)` path
unchanged. Both software/hardware fragment variants need the preserved-alpha fix.
Private helper **`/private/tmp/ce4d-sample-source.glsl`** contains the relevant
premultiply/unpremultiply candidate; its old all-mode explicit filtering was rejected
as a hardware repair, so adopt only the proven alpha-specific behavior. Do not
claim this is already implemented or verified. Add a real edge-conservation acceptance
assertion (pure red over green R+G=255 ±1, B0,A255 and intermediate coverage) alongside
corner checks; verify both GPU profiles. Bump shader/renderer versions and reverify
all affected software/native/hardware/export evidence. The running1ec5d04 report
will not cover new code or this alpha edge.

## Remaining CE4d completion work

1. Receive and record running1ec5d04 final result truthfully; preserve earlier failures.
2. Fix/test authored preserved-alpha edge; checkpoint/push own code and update log.
3. Full legacy adapter **`tests/browser/composition-legacy-adapter.ts`** without
   subset/smoke: all7 cases ×Canvas/WebGL pixels/seeks, independent/repeat/raw exports,
   relocation and hardware. **Canvas ratio≤1.25** stays required; WebGL costs recorded
   with existing CE6-P deferral. Its timing is interleaved, so run this whole job
   without competing verification/export work.
4. After required migration parity/delivery passes, apply prepared default draft:
   **`/private/tmp/ce4d-default-migration.patch`**, generator
   **`/private/tmp/ce4d-prepare-default-patch.py`**. Re-read/re-generate if source changed.
   This patch is **unapplied**. It turns illustrated/depth public factories into
   prepared shared wrappers, removes old commerce painter and old mask painting,
   wires native Node manifest/export/cache identity (pipeline0.12), keeps historical
   golden shader identity on test oracle, adds actual-default provenance/vertical
   assertions. DELETE obsolete empty commerce-effects-renderer.ts properly.
   All direct depth callers already await. Keep literal historical PreviewScene
   renderer type internally for geometric compatibility; actual manifest/output
   version is native, source version stays truthful in metadata. Do not accidentally
   change frozen golden identities or regenerate old outputs.
5. Verify actual defaults: all23 depth timelines and all176 family items, required
   family matrices/Lab/exports. Draft PR body **`/private/tmp/ce4d-pr-body.md`** is
   stale/pending; rewrite from final measured evidence before use.
6. Fresh zipper690frame/23s CLI acceptance on final code:
   `pnpm --silent still-shift comp lint --input '/Users/jjae/Documents/obsidian/ai-business/YouTube Workflow Experiments/2026-10-06-zipper-final/composition-v004.json' --pixels true --backend webgl2 --policy '/Users/jjae/Documents/obsidian/ai-business/YouTube Workflow Experiments/2026-10-06-zipper-final/lint-policy.json'`.
   Policy maxFrozenFrames60, cuts270/510; keep unchanged; do not edit input/font.
7. Follow updated AGENTS verification-efficiency policy: relevant checks during
   development, then one successful **complete local `pnpm check`** on final code in
   isolated snapshot. No skipped mandatory suites/manual reuse. Fix focused failures
   first. Incomplete gate is not pass. Preserve every frozen baseline/threshold.
8. Truthful plan/results/log completion, CE4d PR against codex/composition-ce4c,
   attach via Codex tool, new CE13 branch and **continue the full loop**.

## Toolchain and private verification setup

Pinned PATH prefix `/Users/jjae/.nvm/versions/node/v22.23.1/bin`; Node22.23.1,
pnpm10.29.3, Python3.12.11, Playwright1.62.1/Chromium1234 (actual151.0.7922.34),
FFmpeg8.0.1. Hardware Apple M5 Pro Metal, export SwiftShader. Vitest config
`vitest.config.ts`; integration maxWorkers2/no file parallelism when appropriate.

**`/private/tmp/ce8-snapshot.py`** archives HEAD into
`/private/tmp/still-shift-ce8-check-<shortHEAD>`, links package dependencies/private
caches and warmed CE11 venv, copies own tracked dirty source while excluding owner
six files. Commit own new source before fresh snapshot. Do not overwrite an existing
snapshot while its job is running. Prefer unique source checkpoint snapshots.
Browser/toolchain/git network commands may require normal reviewed escalation.
No GitHub Actions. Batch independent reads; serial timing has no competing tests.

## Owner work — do not reset, whole-stage or overwrite

Dirty6: `AGENTS.md`, `ROADMAP.md`, `docs/composition-engine-plan.md`,
`docs/dev-log.md`, `docs/pr-32-fix-results.json`, `docs/pr-32-printer-fix-results.json`.
Untracked7: composition-ce9-pr-draft.md, composition-renderer-performance-research-1.md,
-2.md, pr-30-review-plan.json, pr-31-review-results.json,
worktree-cleanup-audit-2026-10-04.json, worktree-cleanup-results-2026-10-04.json.
Owner ports5173/5174 and other worktrees remain live; preserve them.
Owner CE5-X plan commit **e39f99b** is included/pushed; remaining owner plan edits
are unstaged. Preserve pending Q9 and current updated AGENTS instructions.

For own log/plan edits use a scoped indexed patch from `git show HEAD:path` → own
transformation; apply same transformation to the owner-dirty working file, then
`git apply --cached` only own diff. Never whole-stage those owner files. Prior
checkpoint Python scripts under `/private/tmp/ce4d-*` show this pattern; do not
reapply already-applied checkpoint patches. New docs handoff/evidence may be staged
explicitly. Check cached diff before every commit.

Separate cross-chat outbound messaging authorization remains pending: automatic
review previously rejected an unauthorized coordination message. Incoming owner
release was received; no further messaging is needed. Fresh-chat creation was
explicitly requested by the user through the wrap-up handoff.

## Future milestones: read before implementing, not already delivered

Private research/preparation:
`/private/tmp/composition-remaining-preimplementation-notes.md`,
`/private/tmp/composition-remaining-primary-research.md`,
`/private/tmp/ce16-existing-pr-notes.txt`. Older hold lines are stale.

- **CE13:** probe actual CFR PTS/rational rate/duration; reject/explicitly convert VFR;
  FFmpeg immutable frame cache keyed by actual source hash, mapping, size, pixel/color
  format/version. Explicit sequence pattern/count/rate/per-frame hash manifest.
  Bounded async frame preparation outside pure eval/draw (do not stuff thousands
  of image assets beyond500/metadata65536 limits). Enumerate remap/precomp/shutter/
  blend/echo needs. Configurable duration/resolution/cache bounds. Native gain/pan/
  fades/remap and real decoded waveforms. Narration interval authority must reject
  nonidentity stretch/remap including inherited clocks; never pad/slow/stretch
  narration. Full-container silence outside fixed narration is allowed. Synthetic
  burned-in/sync/VFR/cache/color/bounds tests required.
- **CE16:** existing owner worktree e7f3175 / PR33 adds60files~8686lines; audit
  completion-audit/verification-results/backend-proof before source integration.
  Historical full1436/46/125/14/42groups/all176 on974dfdf is not fresh integrated
  proof. DawDreamer0.9/NumPy2.3.3/SciPy1.16.2/Python3.12.11 opt-in GPL not bundled;
  redistribution pending. No default backend adoption from mere research. Routine
  production CLI/API/file only; preserve prior explicit one-time headless browser
  authorization/history. Whole-project narration/routes/fades authority before crop.
- **CE15:** first ProRes4444/PNG8+16/H264/HEVC10BT709 together, then422HQ/VP9alpha;
  proper transfer conversion, actual PNG metadata and decode-back, honest RGBA8
  compositor precision in16-bit containers. zscale absent in pinned FFmpeg;
  verify usable primary APIs. Four independent bounded browser producers feeding
  **one ordered encoder** avoids GOP differences. Real2min≥3×4vs1 identicalbytes;
  no artificial delay/work. Cancel/await all workers, transactional publication,
  cache stats and CPU/GPU time distinctions. Preserve final baseline/profile rules.
- **CE14:** animated2×2..8×8 Bezier grid; alpha outline including holes/islands/
  interior pins, verified triangulator/license; deterministic rigidMLS orARAP,
  starch/overlap/pin expressions; GPU textures and triangle-affine Canvas reference.
  Pin-only arm/house demos, range-specific no flips and repeat exports. MLS primary
  https://people.engr.tamu.edu/schaefer/research/mls.pdf . No solver is implemented.
