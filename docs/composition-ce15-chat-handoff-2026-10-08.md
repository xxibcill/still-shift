# CE15 continuation — 2026-10-08

Workspace: `/Users/jjae/Documents/playground/still-shift`.
Branch: `codex/composition-ce15`. Continue CE15, then CE14 on a new `codex/` branch.
PRs #47 and #48 remain open and unmerged. Do not merge milestone PRs.

## Recovered work and verification

The old chat `01a11255-348f-7421-b201-392f5cb0e337` was confirmed idle/interrupted
following the user's stop. Process inspection found no CE15 browser, export or test
jobs. No old workers were contacted. The GPU recovery independently matched all 220
source hashes, 21 logs and audit/export artifacts. Local commit `61d7b911` captures
that completed slice and its scoped records.

The subsequent Canvas non-gradient callback slice is completed in the local
checkpoint containing this handoff: actual parent and independent ImageData backing hold through
native consumption; failed native identity cleanup preserves known aliases and
first errors. All old test files, GPU prefix, shaders, wrappers and native render
bodies remain unchanged. Build/lint/boundaries, 999 focused tests across 107 files,
69 typography tests, six actual Chromium ImageData/Canvas probes, 144 audit cases /
8,000 exact frames and 64 exports / 768 exact encoded bodies and decoded frames pass.
Glyph ratio 1.3760683750482494 passes unchanged 1.5. The focused count combines 985
integrated tests with 14 separately run GPU regressions on the same frozen source.

- [Canvas evidence](./composition-ce15-color-canvas-lifetime-results.json)
- [GPU evidence](./composition-ce15-color-gpu-lifetime-results.json)
- [Milestone plan](./composition-ce15-plan.md)
- [Overall results](./composition-ce15-results.json)

These are focused results. No final CE15 full gate or authentic speed proof has passed.

## Current publication blocker

Automatic approval review rejected a combined commit-and-push command because it
could not verify trusted authorization to transfer source/documents to `origin`.
The configured destination is `https://github.com/xxibcill/still-shift.git`.
Local commits are allowed. An asynchronous question asks the user to authorize
pushing `61d7b911` and subsequent CE15/CE14 checkpoints to that repository; no answer
had arrived when this handoff was written. Do not push until it is resolved. Once
approved, push completed checkpoints frequently; preserve the user's answer.

## Isolated verification

Private checkout: `/private/tmp/still-shift-ce15-development-draft1`.
Environment helper: `/private/tmp/ce15_run_env.py` (isolated Python, dependency links,
Vite/config caches). Owner port 5173 and owner caches must stay untouched.
Node 22.23.1, pnpm 10.29.3, Python 3.12.11, FFmpeg 8.0.1 and Chrome 151.0.7922.34.
MacOS sandbox cannot launch Chromium: approved local browser checks require process
access outside the sandbox. Keep the startup failure in the evidence.

Latest scripts and logs use `/private/tmp/ce15-color-canvas-lifetime-*`,
`/private/tmp/ce15_color_canvas_lifetime_*`, typography/export sequence `99`.
The native probe script is preserved in full in the Canvas evidence JSON. No
verification is left running after this slice. Recheck state before reuse.

## Next implementation

1. Gradient controls/uniforms/combined/table/cache/entry/key/backing dependency holds.
2. Backend/input/output/device and borrowed parameter lifetimes. Parameter prototype
   remains private under `/private/tmp/ce15-color-params-prototype`; do not wire it
   into production until retained graph ownership is established. `exposure.ts`
   retains `first.graph.root` across scratch frames.
3. Complete remaining renderer/evaluator/provider/font/bootstrap/control metadata,
   Node/RPC/body/stream/controller ownership and actual production admission.
4. Aggregate application memory <=8 GiB across 1–4 workers plus Node, with separate
   native/RSS measurement. Repair full 8192²/fps1–60/worker acceptance: current
   128-MiB cache caps and `2 * payload` reject valid 256-MiB RGBA8 full-area storage.
   `/private/tmp/ce15-finite-area-cache-plan.md` is a read-only proposal, not evidence.
5. Authentic >=120-second, same-profile/cache, one-vs-four >=3× end-to-end speed proof
   with exact encoded/decoded/audio output. Permanent expanded parallel suite:
   303 successful exports / 2,680 frames plus 24 failures. Preserve all existing
   timing/pixel/audio/Get/native oracles, repeat checks and frozen baselines.
6. Focused review, then mandatory complete local `pnpm check` on the final immutable
   checkpoint. Explain expected cost before starting. Create/attach CE15 PR; no merge.
7. Complete CE14 mesh/puppet scope and full acceptance from the engine plan.

GitHub Actions are prohibited. Preserve unrelated dirty/untracked owner work,
including AGENTS, ROADMAP, non-CE15 plan/log windows and PR32 records. Stage scoped
windows only. CE5-X/Q9 and separate owner planning remain outside this mission.
