# CE16 completion audit — 2026-10-04

CE16's feature implementation is present on isolated `codex/composition-ce16`,
from `dee9e7b`. It remains `[~]`: full repository checks and frozen rendered
baselines lack closure evidence, and the owner decision requested for the conflict
with zero browser driving has not arrived. This audit does not waive those gates.

## Requirement evidence

Checklist numbers follow the order in the [CE16 plan](./composition-engine-plan.md#ce16--programmable-soundtrack-project-and-timeline).
Detailed versions, measurements, commands and decoded comparisons remain in
[verification results](./composition-ce16-verification-results.json).

| Requirement                                         | Result and evidence                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1: existing 60-second fixture                      | Passed: narration, BGM and two SFX, source hashes and end-exclusive trims in `benchmarks/fixtures/composition/ce16/`.                                                                                                                                                                   |
| A2: command setup, pinned dependencies and licenses | Passed: hash-locked Python 3.12.11 / DawDreamer 0.9.0 / NumPy 2.3.3 / SciPy 1.16.2; license and native component audit in [backend proof](./composition-ce16-backend-proof.md). Local opt-in runtime; binary distribution decision pending.                                             |
| A3: placement, envelopes, DSP, routing and stems    | Passed: seven aligned float32 stereo files per run, each 2,880,000 samples/channel at 48 kHz; unity bus/master reconstruction exact.                                                                                                                                                    |
| A4: latency and tails                               | Passed for supported causal high/low-pass processors: 512-sample blocks, impulse onset zero; peak displacement and tail measured separately. Unsupported nonzero onset latency rejected.                                                                                                |
| A5: fresh-process reload                            | Passed: every decoded output exact, zero differing samples.                                                                                                                                                                                                                             |
| A6: edited cue and unaffected layers                | Passed: +4,800-sample move / -3 dB gain; four unrelated stems exact; expected cue, SFX bus and master changes retained.                                                                                                                                                                 |
| A7: measurement                                     | Passed: setup/render/reload/edit wall time, output sizes and memory recorded. Worker wall time excludes calibration; lifetime worker peak includes calibration and excludes FFmpeg child memory. No speed advantage claimed.                                                            |
| A8: comparisons and failure evidence                | Passed: retained initial/reloaded/edited/relocated files under ignored `benchmarks/results/composition-ce16/integration-final`; decoded source narration and mix reconstruction exact.                                                                                                  |
| B1: bounded versioned contract                      | Implemented: strict `soundtrack-project-1`, semantic references, acyclic routing, sample/resource bounds and generated schema. Unit tests reject invalid structures.                                                                                                                    |
| B2: legacy adapter and anchors                      | Implemented: explicit opt-in adapter preserves legacy plans; original anchors retained. Missing/duplicate beat, cue and event identities fail; retiming leaves authored trims fixed.                                                                                                    |
| B3: structured worker and recovery                  | Implemented/tested: JSON stdout, bounded stderr, stable errors, missing runtime/checksum/short source, cancellation, timeout and safe retry.                                                                                                                                            |
| B4: CLI and shared persisted edits                  | Implemented/tested: inspect/validate/edit/retime/render/package; gain, mute/solo, move/trim, automation, undo/redo; atomic saves and concurrent revision protection. HTTP edits use the same authority.                                                                                 |
| B5: delivery and cache identity                     | Implemented/tested: FFmpeg/ffprobe, explicit conversion/normalization/taps/tails/ranges; identity includes project, source, backend, DSP and runtime. Full schedule evaluated before range crop.                                                                                        |
| B6: narration-aware ducking                         | Implemented/tested: raw narration detector, explicit BGM targets; sample-exact lookahead/attack/hold/release boundaries and pauses. Narration and SFX remain unchanged.                                                                                                                 |
| B7: optional layer timeline                         | Implemented: pinned package evaluation recorded; vanilla read-only projection plus shared edit controls. Overlaps and held automation steps modeled. No drag controls or visual GUI inspection claimed.                                                                                 |
| B8: saved revision preview/export                   | Implemented/tested with rendered full mix: HTTP bytes/hash exact, stale snapshots rejected, shared-clock offsets and immutable/cancellable attachments checked using a Web Audio harness. Actual browser decode/playback and listening unperformed. No native browser DSP path adopted. |
| B9: passage integration                             | Implemented/tested: audio adapter full/range PCM and revision guard, legacy audio regressions. Picture/mux export code is connected but a complete visual export was not run under the browser restriction.                                                                             |
| B10: documentation                                  | Implemented: [soundtrack guide](./soundtrack-project.md), audio/reference/user guides, verification guide, plan, development log and evidence.                                                                                                                                          |

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
throughout the session. Subsequent verification follows the corrected selection.
No GitHub Actions were added or enabled; source assets and primary checkout/CE12
work remain untouched.

## Definition of done audit

| Plan item                               | Status                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1: checklist accounted for              | Feature checklist ticked; supported scope and unperformed GUI/visual export evidence stated above.                         |
| 2: acceptance and verification recorded | Scoped command/audio acceptance passed. Actual listening/audiovisual QA unperformed and not claimed.                       |
| 3: full `pnpm check`                    | Pending. The corrected audio tier does not satisfy the full browser-containing command.                                    |
| 4: CE0 rendered baselines               | Pending. Inventory/provenance/timing tests pass; no full pixel baseline rerun or regeneration.                             |
| 5: reference/user documentation         | Updated with contract fields, diagnostics, commands and owner-facing controls.                                             |
| 6: output versions                      | New schema `soundtrack-project-1`, worker `soundtrack-worker-1`, DSP `soundtrack-dsp-1`; legacy output behavior preserved. |
| 7: tracker `[x]` and evidence           | Pending until the owner resolves the incompatible browser closure requirements. Tracker remains `[~]`.                     |

The outstanding owner choice is to authorize a CE16-specific command-only closure
exception or keep the milestone open until browser verification is authorized.
Silence does not approve an exception. The earlier browser-policy breach is recorded
separately and cannot be undone by changing the selector.
