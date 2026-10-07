# Composition continuation — 2026-10-07

## Current authority

This record supersedes the old handoff and unapplied-draft instructions. CE4d
implementation and all acceptance gates are complete. Do not reapply old default,
alpha, shadow, cache, Lab or golden patches. Complete evidence, including failed
attempts, is in [CE4d results](./composition-ce4d-results.json).

- Workspace `/Users/jjae/Documents/playground/still-shift`.
- CE4d branch `codex/composition-ce4d`, base CE4c `17666eb` / PR45; completion
  evidence checkpoint `9f60447` pushed. [PR #47](https://github.com/xxibcill/still-shift/pull/47)
  is open and attached against CE4c. No PR was merged.
- Verified source `ae2e1f0`; final source behavior includes production defaults
  `db0a4ca`, cache `75c0828`, Lab `69469a8`, waits `e8a70d9`, golden `3747d16`.
- Complete pinned local `pnpm check` passed in 11705.18 seconds: all 61 test
  commands, 2,005 unit / 46 runtime / 143 integration / 14 Python tests, all browser
  gates, all 176 actual defaults and 176 frozen items / 36,061 frames. Four Canvas
  family matrices pass strict 1.25× timing; 141 prior visual files remain exact.
- Full gate session51023 is closed. The CE4d job is terminal. Private
  immutable source `/private/tmp/still-shift-ce8-check-ae2e1f0`, log
  `/private/tmp/ce4d-full-check-ae2e1f0.log`; collected report is embedded in results.
- Canvas 1.44.0, WebGL2 0.65.0, image-plane shader 0.4.0, depth adapter 0.1.0,
  pipeline 0.13.0; source family/Three painters retired. Frozen oracles are test-only.
- Node22.23.1 / pnpm10.29.3 / Python3.12.11 / Playwright1.62.1 / Chromium1234
  (151.0.7922.34) / FFmpeg8.0.1; darwin-arm64 MacM5Pro, SwiftShader profile.

## Mission

CE4d PR #47 is published and attached. **Continue CE13 → CE15 → CE14** on new
milestone branches. Commit and push frequent scoped
checkpoints; create and attach each complete milestone PR. Do not merge PRs.
Audit/reuse existing CE16 PR33 (merged, head `65f2ebe4`) during CE13; attach that existing PR when continuing
its implementation. Historical CE16 evidence is not integrated CE13 proof.
CE5-X/Q9 is pending and must not be inserted. CE6-P/CE8-L-F/CE9-F1 are separate.
No owner decision blocks this sequence. No subagents are authorized.

## Preserve owner work and verification rules

GitHub Actions are prohibited and disabled. Run required local pnpm gates. Read
AGENTS.md and the development log at session start. Keep thresholds, timing policy,
frozen CE0/depth bytes and export/lifecycle checks. Finish focused verification
before one complete final gate per milestone; never manually skip mandatory suites.
Do not interrupt an already-running valid gate or redesign the test harness.

Owner dirty files: AGENTS.md, ROADMAP.md, composition-engine-plan.md, dev-log.md,
pr-32-fix-results.json and pr-32-printer-fix-results.json. Owner untracked records
include composition-ce9-pr-draft, both renderer-performance research files,
pr-30-review-plan, pr-31-review-results and both worktree-cleanup audit/results.
Preserve those, unrelated worktrees and ports. Stage only own scoped changes in
the shared dirty plan/log using base-to-own index patches, never whole-stage them.
The owner Q7 depth planning section and Q5/Q6/Q9 decisions are separate dirty work.

## Read-only future preparation

CE13 has integrated merged CE16 source on `codex/composition-ce13` from `adf6cea`.
PR33 is attached. Fresh pinned focused checks pass 88 soundtrack / 46 runtime /
40 passage-CLI tests and real browser decoding/full-range mux; the failed alias
and temporary lock-format attempts remain in [CE13 results](./composition-ce13-results.json).
CE13 contract/source-clock/graph/builder checks now pass all 2,060 unit tests /
204 files plus static checks (`41c7b98`). Actual video provenance/CFR/color/rotation
checks are pushed as `fc23442`. Actual SDR conversion and atomic bounded frame cache
are pushed as `ac9f68c`. Bounded native readiness/shared graph dependencies now pass
2,077 units, 46 runtime / 13 media regressions, static checks and real native/CE7/CE8
browser proofs (`7f42571`). Source preparation and actual video/sequence production
picture exports are pushed as `9aca1ae` and pass both backends with animated still/
lower third; repeated, independent and raw/PNG MP4s match (Canvas1.45/WebGL0.66).
Native Lab/CLI inspector edits, preparation/seek/playback readiness, saved reload and
draft exports are pushed as `917e92c` with real browser proof and authoring regressions.
Continuous audio scope/dependency clocks now pass all 2,089 units / 208 files, static
checks and existing CE7 picture acceptance (evaluator52, `e4f27a2`). Actual streamed
48 kHz PCM preparation/cache passes 25 source/cache/probe tests and static checks.
Bounded continuous mix and actual waveform metadata now pass 60 focused checks /
all 2,094 units / static checks, including byte-identical CE16 reference WAVs and
491,578 / 524,288 PCM bytes with 16 reusable page evictions. A singleton terminal
repair uses Q16 PCM arithmetic and evaluator53. Actual audio loading and transactional
AAC mux now pass 91 runtime/media checks, all 2,094 units and static checks. Four
matching-audio sequence/video × Canvas/WebGL cases preserve 12,000 stereo master samples;
12 production MP4s repeat/independent/raw-PNG match, with exact48k track clocks and
independent AAC sample equality. Post-mux failure/cancellation leaves no artifacts.
Audio playback/waveform presentation, whole-passage mixing and final acceptance remain pending;
no final CE13 gate has run.
CE15 and CE14 remain in flight.
Private notes contain exact source
seams and primary references: `/private/tmp/ce13-authority-map-2026-10-07.md`,
`ce13-design-decision-candidates-2026-10-07.md`,
`composition-remaining-preimplementation-notes.md`,
`composition-remaining-primary-research.md`. They are candidates, not evidence.
CE13 must resolve rational clocks, actual SDR color conversion, bounded CPU/GPU
resources, asynchronous readiness, last-sample audio clocks, whole-project protected
narration, processed/source waveforms and native-beat PCM into passage mixing.
CE16 source paths and opt-in GPL backend boundaries are in the authority map.
CE15 retains actual >=3× two-minute 4-worker speedup and all format/alpha decode-back
checks. CE14 needs deterministic alpha topology, pin/constraint solver and both
backend/flip-free demo acceptance. Do not weaken or substitute these gates.
