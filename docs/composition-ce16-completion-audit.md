# CE16 completion audit — 2026-10-05

CE16 is technically complete (`[x]`) on isolated `codex/composition-ce16`, from
`dee9e7b`. Full local `pnpm check` passed on committed implementation `974dfdf`,
including 42 browser groups and all 176 frozen baseline items / 36,061 frames,
without regeneration. The owner authorized automated browser verification for this
completion pass on 2026-10-04; routine production stays command/API/file-based.
The earlier unapproved browser-policy breach remains recorded below.

The full gate passed 1,436 unit, 46 runtime, 125 integration and 14 Python depth
tests, plus schema, package boundaries, format, lint, build, toolchain and browser
checks. The real CE16 browser group passed again within that gate: all 384,000
stereo float32 samples/channel decoded exactly, editor edits persisted through
shared APIs, playback/seek/clear worked, and full/range passage mux audio matched
independently encoded canonical renders. AAC itself is not claimed lossless.
A final command-only recheck independently confirmed current source hashes,
exact reload/relocation PCM, unchanged narration and unaffected stems.

The worktree was clean and frozen during the full run. These closing documentation
updates are the only subsequent changes. No listening, human audiovisual QA or
visible GUI inspection was performed. Local opt-in runtime packaging is documented;
redistributing GPL/transitive backend binaries remains a future owner decision.

## Requirement evidence

Checklist numbers follow the order in the [CE16 plan](./composition-engine-plan.md#ce16--programmable-soundtrack-project-and-timeline).
Detailed versions, measurements, commands and decoded comparisons remain in
[verification results](./composition-ce16-verification-results.json).

| Requirement                                         | Result and evidence                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1: existing 60-second fixture                      | Passed: narration, BGM and two SFX, source hashes and end-exclusive trims in `benchmarks/fixtures/composition/ce16/`.                                                                                                                                                                                                                                                                                             |
| A2: command setup, pinned dependencies and licenses | Passed: hash-locked Python 3.12.11 / DawDreamer 0.9.0 / NumPy 2.3.3 / SciPy 1.16.2; license and native component audit in [backend proof](./composition-ce16-backend-proof.md). Local opt-in runtime; binary distribution decision pending.                                                                                                                                                                       |
| A3: placement, envelopes, DSP, routing and stems    | Passed: seven aligned float32 stereo files per run, each 2,880,000 samples/channel at 48 kHz; unity bus/master reconstruction exact.                                                                                                                                                                                                                                                                              |
| A4: latency and tails                               | Passed for supported causal high/low-pass processors: 512-sample blocks, impulse onset zero; peak displacement and tail measured separately. Unsupported nonzero onset latency rejected.                                                                                                                                                                                                                          |
| A5: fresh-process reload                            | Passed: every decoded output exact, zero differing samples.                                                                                                                                                                                                                                                                                                                                                       |
| A6: edited cue and unaffected layers                | Passed: +4,800-sample move / -3 dB gain; four unrelated stems exact; expected cue, SFX bus and master changes retained.                                                                                                                                                                                                                                                                                           |
| A7: measurement                                     | Passed: setup/render/reload/edit wall time, output sizes and memory recorded. Worker wall time excludes calibration; lifetime worker peak includes calibration and excludes FFmpeg child memory. No speed advantage claimed.                                                                                                                                                                                      |
| A8: comparisons and failure evidence                | Passed: retained initial/reloaded/edited/relocated files under ignored `benchmarks/results/composition-ce16/integration-final`; decoded source narration and mix reconstruction exact.                                                                                                                                                                                                                            |
| B1: bounded versioned contract                      | Implemented: strict `soundtrack-project-1`, semantic references, acyclic routing, sample/resource bounds and generated schema. Unit tests reject invalid structures.                                                                                                                                                                                                                                              |
| B2: legacy adapter and anchors                      | Implemented: explicit opt-in adapter preserves legacy plans; original anchors retained. Missing/duplicate beat, cue and event identities fail; retiming leaves authored trims fixed.                                                                                                                                                                                                                              |
| B3: structured worker and recovery                  | Implemented/tested: JSON stdout, bounded stderr, stable errors, missing runtime/checksum/short source, cancellation, timeout and safe retry.                                                                                                                                                                                                                                                                      |
| B4: CLI and shared persisted edits                  | Implemented/tested: inspect/validate/edit/retime/render/package; gain, mute/solo, move/trim, automation, undo/redo; atomic saves and concurrent revision protection. HTTP edits use the same authority.                                                                                                                                                                                                           |
| B5: delivery and cache identity                     | Implemented/tested: FFmpeg/ffprobe, explicit conversion/normalization/taps/tails/ranges; identity includes project, source, backend, DSP and runtime. Full schedule evaluated before range crop.                                                                                                                                                                                                                  |
| B6: narration-aware ducking                         | Implemented/tested: raw narration detector, explicit BGM targets; sample-exact lookahead/attack/hold/release boundaries and pauses. Narration and SFX remain unchanged.                                                                                                                                                                                                                                           |
| B7: optional layer timeline                         | Implemented: pinned package evaluation recorded; vanilla read-only projection plus shared edit controls. Overlaps and held automation steps modeled. No drag controls or visual GUI inspection claimed.                                                                                                                                                                                                           |
| B8: saved revision preview/export                   | Implemented/tested with rendered full mix: HTTP bytes/hash exact, stale snapshots rejected, shared-clock offsets and immutable/cancellable attachments checked using a Web Audio harness. Real browser decoding now matches all 384,000 stereo float32 samples/channel exactly; native playback/seek/clear and saved revision attachment pass. Listening remains unperformed. No native browser DSP path adopted. |
| B9: passage integration                             | Implemented/tested: audio adapter full/range PCM and revision guard, legacy audio regressions. Real full 192-frame and range 24-frame picture/mux exports pass. Each delivery decode matches independent canonical render/encoding; full-state range PCM exact.                                                                                                                                                   |
| B10: documentation                                  | Implemented: [soundtrack guide](./soundtrack-project.md), audio/reference/user guides, verification guide, plan, development log and evidence.                                                                                                                                                                                                                                                                    |

## Completion-audit fixes

- Pending checksum/decode work cannot reattach a cleared or superseded preview;
  project attachments are validated snapshots. Stale HTTP errors cannot replace
  current status. Playback checks its frame and uses the shared sample conversion.
- Held automation displays steps and extends endpoint values to clip boundaries.
  The display projection never changes saved automation points.
- Duplicate beat IDs are rejected rather than taking the first match.
- The CLI example now includes the required revision. Output-size evidence is
  generated by the verifier, and its memory/time scope is stated precisely.
- An attempted 41 fps preview test was invalid for the existing passage contract;
  it was replaced with the supported 30 fps case. No passage frame-rate expansion.

The focused test group passes 35 tests in five files, including six preview harness
cases. The harness verifies scheduling and lifecycle behavior; it is not evidence
of native browser decoding or audible quality.

## Browser-policy correction

The earlier `test:integration:command` selector excluded only direct Playwright
imports. That was insufficient: suites such as `motion-craft-focal` launched a
headless browser through child-process scripts, and other renderer suites used
browser libraries indirectly. Earlier broad runs therefore violated the zero
browser-driving requirement. Their passing results are retained as historical
evidence and are not called compliant command-only verification.

The selector now uses three explicitly audited audio-only integration entry points:
`soundtrack`, `soundtrack-api` and `passage-audio`. None invokes picture rendering.
The runtime group uses mocked render dependencies where applicable. No CUA,
desktop automation or visible GUI inspection was used; the earlier indirect
headless-browser use still prevents a truthful claim of zero browser driving
throughout the session. The owner subsequently authorized headless-browser verification
for this checking pass only; routine command-only verification retains the corrected
selection.
No GitHub Actions were added or enabled; source assets and primary checkout/CE12
work remain untouched.

## Definition of done audit

| Plan item                               | Status                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: checklist accounted for              | Passed: all A/B items accounted for; supported controls and unperformed human review stated above.                                                |
| 2: acceptance and verification recorded | Passed: command/audio lifecycle, real browser preview/editor and full/range picture/mux verification recorded. Human creative review unperformed. |
| 3: full `pnpm check`                    | Passed locally on `974dfdf`; exit 0. Full command and log checksum retained in evidence.                                                          |
| 4: CE0 rendered baselines               | Passed: 176 items / 36,061 frames in 286.8 seconds on pinned SwiftShader; tracked references unchanged from base, no regeneration.                |
| 5: reference/user documentation         | Updated with contract fields, diagnostics, commands and owner-facing controls.                                                                    |
| 6: output versions                      | New schema `soundtrack-project-1`, worker `soundtrack-worker-1`, DSP `soundtrack-dsp-1`; legacy output behavior preserved.                        |
| 7: tracker `[x]` and evidence           | Passed: owner, isolated branch, `[x]` and linked completion evidence recorded.                                                                    |

The owner's one-time verification exception resolved the policy conflict; all
required technical gates now pass. The earlier browser-policy breach stays recorded
separately. No listening or human audiovisual acceptance is implied by these checks.
