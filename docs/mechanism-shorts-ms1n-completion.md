# MS1N implementation and completion record

2026-10-10. **Implementation complete; final software checks pending. The milestone is not complete.** The seven [plan requirements](./mechanism-shorts-production-plan.md#ms1n-native-3d-composition) map to evidence below. [Design](./mechanism-shorts-ms1n-design.md) freezes features/comparison policy; [results](./mechanism-shorts-ms1n-results.json) retain identities, commands and failed/rerun history.

| Plan requirement                              | Implemented scope and observed evidence                                                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Bounded geometry and import contracts      | Indexed geometry, normals, slots, rigid hierarchy, units, pivots, transforms and identities are bounded. `pure-contract-evaluator-1` / `native-observation-contract-1` cover invalid topology, references, clocks and limits; unsupported input fails.                   |
| 2. Shared composition, evaluation and WebGL2  | Shared camera/rig evaluation and graph use explicit screen-label/world-depth bindings. `native-depth-graph-5` passes five families, text/shape crossings, layer order, nested clocks and shutter averaging. Actual observations remain separate from expected graphs.    |
| 3. Declared depth, alpha, clipping and clocks | Declared opaque/cutout, clipping, normals, color/alpha and clocks pass 14 actual `native-depth-proof-3` controls and graph5 cases/unsupported negatives. `native-cancellation-proof-1` verifies no publication, six process exits and cleanup.                           |
| 4. Material/profile and appearance overlap    | Design maps material/profile and solid-geometry/CE8 overlap. `native-bridge-appearance-comparison-2` passes nine physical-state pairs; image metrics retain material/reflection/shadow/fog differences. CE8-L-F/human appearance remain open.                            |
| 5. Authoring, inspection and delivery         | `native-inspection-tests-1`, `native-lab-browser-2`, `native-e01-preview-proof-5`: edits/save/reload. `native-package-confinement-integration-2`, `native-portable-package-proof-4`: saved camera, paths/move. Consumer2 passes all 18 installed stages.                 |
| 6. E01 and independent mixed occlusion proof  | `native-e01-full-proof-3`: 13 stages, two actual 696-frame closures, current mechanics/overlay/layout/audio and nine accepted-body/preview comparisons max 0; movies/rows identical. Graph5 supplies independent mixed occlusion. Bridge4 preserves 696 original plates. |
| 7. Profiling and baseline preservation        | Full3 lifecycle/repeat export: 630.135s/258.093s; managed peak 561,521,298 bytes, separate tree RSS 2,394,439,680/2,728,067,072 bytes; one worker within 8 GiB. Edit/source/cache controls pass. Final 77 groups/176 frozen baselines pending.                           |

## Source and gate scope

| Evidence                                  | Exact scope / current state                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full3 / bridge4 / appearance2 / hardware1 | Render source `342d09c58e27b5708ef7cc86f19d40559a85394f`; source-ts appearance identity is retained.                                                  |
| Preview5 and portable4                    | Source `83a5d8c09d32148fc3f0d7f2c569431d77f01587`; portable4 preserves full3 execution/appearance.                                                    |
| Archive attempt 2                         | Source `81a8e344443702d13ac3ab0d8072352345e457be`; all 26 clean install/declaration/export/audio/source-rebuild checks pass.                          |
| Archive source audit 2                    | All 1,804 members match: 669 reviewed source / 1,135 current emitted-runtime files. Byte audit does not establish compiler correctness.               |
| Fresh OS-denied installed consumer 2      | 18 stages pass: two 696-frame checks/two moved 16-file deliveries; original inputs/observations preserved. Consumer1 PATH/`ffprobe` failure retained. |
| Required local completion gate            | `check-fast-13`: 3,915 units/381 files and schema/boundary/format/lint/build pass; focused repair3 passes 30 tests. Full77/176 remains pending.       |

Archive2, verified before the cancellation repair, is **3,150,449 bytes**, SHA-256
`f41679b1f7c327d2966c992ab27c6173be4fa0acc9fee3fbee2ed47c993dfb64`.
Retained receipts: `/private/tmp/still-shift-ms1n-package-attempt-2-retained/{retention.json,package-verification.json,still-shift-0.1.0.tgz}` and `/private/tmp/still-shift-ms1n-archive-source-audit-2/{summary.json,members.json}`. Full3 is retained at `/private/tmp/still-shift-ms1n-e01-full-proof-3/run.json`; portable4 at `/private/tmp/still-shift-ms1n-native-package-proof-4/run.json`.

Consumer2's completed receipt is `/private/tmp/still-shift-ms1n-installed-consumer-2/consumer-all.json` (55,389 bytes), SHA-256 `df6eea8e4ec7d40d7842f8f72a1020486fa63f1a6c8e8d54381c97fbfc7a5309`. Fresh installed-js appearance is `sha256:3689af2aec4fb9462bdc1362d6f0c9fda270544351c2b8492c2495c3d3627fc3`. Baseline/edited preparation-through-final-check takes 610.584959s/552.266413542s. The saved +1° FOV changes all 78 actual cameras and accepted body hashes in [0,78); the other 618 remain exact. The independent scoped audit `/private/tmp/mechanism-ms1n-installed-consumer2-render-audit-2.md` passes; its earlier raw-versus-normalized recipe-hash method failure remains retained and established no product fault.

The first ordinary full local gate at docs-only `1949ae2f` passed 3,915 units,
then failed runtime cancellation (169/170); the 75 later groups, benchmark and
176 baselines were not reached. The native route dispatch had moved the initial
abort outside the bridge error boundary. A shared cancellation boundary now covers
both public writers, retains the original cause and staged attempt, leaves ordinary
diagnostics intact, and passes nine entry/stage cancellation, lock and retry cases.
The four-file repair is bound to working inventory2 (2,328 inputs; 117,501,326 bytes),
with 2,324 existing inputs unchanged. Focused repair3 and fast13 qualify these dirty
bytes; the repaired archive, fresh installed proof and full gate are still pending.
Earlier archive/consumer/render proofs keep their original source identities.

## Remaining acceptance and retained limitations

Hardware1 state/anchors match software/Metal with delta 0; its cross-driver pixel diagnostic **fails**, max 135/RMS 2.226. Hardware appearance/full episode remain open. Full3 retains 51 QA warnings/raw severities. Legacy semantic/factual truth, encoded glyph readability, continuous audiovisual/listening review, human creative acceptance and owner readiness remain unassessed. No cross-code/driver shader parity is claimed.

Failed/cancelled full1/2, preview2/4, package1, portable2/3 and archive1 remain retained. Independent full3 audit corrected its RGB/RGBA assumption; exporter evidence stayed unchanged. Final full-gate receipts and separate human review remain required. No publication or MS2/MS3 production acceptance is implied.
