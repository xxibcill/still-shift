# MS1N implementation and completion record

2026-10-10. **Software complete in recorded stages; human visual/listening and creative acceptance remain pending.** The seven [plan requirements](./mechanism-shorts-production-plan.md#ms1n-native-3d-composition) map to evidence below. [Design](./mechanism-shorts-ms1n-design.md) freezes features/comparison policy; [results](./mechanism-shorts-ms1n-results.json) retain identities, commands and failed/rerun history.

| Plan requirement                              | Implemented scope and observed evidence                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Bounded geometry and import contracts      | Indexed geometry, normals, slots, rigid hierarchy, units, pivots, transforms and identities are bounded. `pure-contract-evaluator-1` / `native-observation-contract-1` cover invalid topology, references, clocks and limits; unsupported input fails.                                                    |
| 2. Shared composition, evaluation and WebGL2  | Shared camera/rig evaluation and graph use explicit screen-label/world-depth bindings. `native-depth-graph-5` passes five families, text/shape crossings, layer order, nested clocks and shutter averaging. Actual observations remain separate from expected graphs.                                     |
| 3. Declared depth, alpha, clipping and clocks | Declared opaque/cutout, clipping, normals, color/alpha and clocks pass 14 actual `native-depth-proof-3` controls and graph5 cases/unsupported negatives. `native-cancellation-proof-1` verifies no publication, six process exits and cleanup.                                                            |
| 4. Material/profile and appearance overlap    | Design maps material/profile and solid-geometry/CE8 overlap. `native-bridge-appearance-comparison-2` passes nine physical-state pairs; image metrics retain material/reflection/shadow/fog differences. CE8-L-F/human appearance remain open.                                                             |
| 5. Authoring, inspection and delivery         | Lab2/preview5 cover edits/save/reload. Portable4 and consumer2 retain their original source identities. Source06 consumer4/companion3 retain their passed scope; source223/archive5 consumer6 and companion4 pass installed refresh, actual two-frame render, package/move and historical closure checks. |
| 6. E01 and independent mixed occlusion proof  | `native-e01-full-proof-3`: 13 stages, two actual 696-frame closures, current mechanics/overlay/layout/audio and nine accepted-body/preview comparisons max 0; movies/rows identical. Graph5 supplies independent mixed occlusion. Bridge4 preserves 696 original plates.                                  |
| 7. Profiling and baseline preservation        | Full3 lifecycle/repeat export: 630.135s/258.093s; managed peak 561,521,298 bytes, separate tree RSS 2,394,439,680/2,728,067,072 bytes; one worker within 8 GiB. Edit/source/cache controls pass. All77 groups,176 frozen items/36,061 frames and actual benchmark complete in stages at helda387.         |

## Source and gate scope

| Evidence                                  | Exact scope / current state                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full3 / bridge4 / appearance2 / hardware1 | Render source `342d09c58e27b5708ef7cc86f19d40559a85394f`; source-ts appearance identity is retained.                                                                                                                                                                                                                          |
| Preview5 and portable4                    | Source `83a5d8c09d32148fc3f0d7f2c569431d77f01587`; portable4 preserves full3 execution/appearance.                                                                                                                                                                                                                            |
| Earlier archive attempt 3                 | Source `06f60e3b99d3118c550fc810f014ee84424ed0d9`; all 27 npm consumer/audit, declaration, export, audio and source-rebuild checks pass. Archive2 remains historical source81 evidence.                                                                                                                                       |
| Earlier archive source audit 3            | All 1,807 members match source06: 670 source / 1,137 emitted files. The independent archive delta records four modified and three added members; all 930 renderer-core members remain exact.                                                                                                                                  |
| Earlier OS-denied installed consumers     | Consumer2 retains source81 and all 18 stages. Current source06 consumer4 passes ten source stages and separate runtime proof; companion3 passes ten stages, including a new two-frame export/moved package and both unchanged historical696 closures.                                                                         |
| Required local completion gate            | Fast16 passes 3,915 units/381 files. Identity/raw-Node and all seven capture checks pass after the test-only repairs. Fullgate1–5 failures remain; archive5, audits4–6 and installed consumer6 pass their scoped checks. All77 groups/176 baselines and actual benchmark complete in recorded stages at test commit a38754ae. |

Earlier archive3 is **3,151,083 bytes**, SHA-256
`366c0a77e662a68012e56ac6295be90df3d6cf9ba1873b2b0510660c82e71963`.
Its retained receipts are `/private/tmp/still-shift-ms1n-package-attempt-3-retained/`
and `/private/tmp/still-shift-ms1n-archive-source-audit-3/`. Archive2 remains a
separate earlier source81 archive; no old render is relabeled as source06.
Full3 is retained at `/private/tmp/still-shift-ms1n-e01-full-proof-3/run.json`;
portable4 at `/private/tmp/still-shift-ms1n-native-package-proof-4/run.json`.

Consumer2's completed receipt is `/private/tmp/still-shift-ms1n-installed-consumer-2/consumer-all.json` (55,389 bytes), SHA-256 `df6eea8e4ec7d40d7842f8f72a1020486fa63f1a6c8e8d54381c97fbfc7a5309`. Fresh installed-js appearance is `sha256:3689af2aec4fb9462bdc1362d6f0c9fda270544351c2b8492c2495c3d3627fc3`. Baseline/edited preparation-through-final-check takes 610.584959s/552.266413542s. The saved +1° FOV changes all 78 actual cameras and accepted body hashes in [0,78); the other 618 remain exact. The independent scoped audit `/private/tmp/mechanism-ms1n-installed-consumer2-render-audit-2.md` passes; its earlier raw-versus-normalized recipe-hash method failure remains retained and established no product fault.

The first ordinary full local gate at docs-only `1949ae2f` passed 3,915 units,
then failed runtime cancellation (169/170); the 75 later groups, benchmark and
176 baselines were not reached. The native route dispatch had moved the initial
abort outside the bridge error boundary. A shared cancellation boundary now covers
both public writers, retains the original cause and staged attempt, leaves ordinary
diagnostics intact, and passes nine entry/stage cancellation, lock and retry cases.
The four-file repair was committed at source06. Committed inventory12 has exactly
the working inventory2 bytes: 2,328 inputs / 117,501,326 bytes, with 2,324 prior
existing inputs unchanged. Focused repair3 and fast13 qualify those same bytes;
archive3 and its affected installed verification now pass. The first repaired
ordinary full gate (fullgate2) stopped at toolchain validation because the private
launcher omitted `uv` from PATH; no test group ran. The corrected ordinary
fullgate3 passes 3,915 units and all 176 runtime tests, then fails five Lab
integration suites before their 29 tests can run; 51 other suites/292 tests pass.
The 74 later groups, benchmark and baselines are not reached. Earlier
archive/consumer/render proofs keep their original source identities.

Companion3's final receipt is
`/private/tmp/still-shift-ms1n-installed-consumer-4/package-repair-proof-3/run.json`
(221,304 bytes), SHA-256
`bf948bd14594a4621315f36b33b79e2fda75ada494d3c7feeb5fc87d7063d876`.
All ten stages pass, including three installed public/direct pre-abort and retry
paths, saved-camera preparation refresh, a new actual two-frame 64×64 export,
nonoverwrite guard, final writer, and verification after original tiny paths
become unavailable. Both copied source81 696-frame closures pass the current
verifier with all copied bytes and the six original E01 inputs unchanged. This
is two newly rendered diagnostic frames, not another 696-frame render or
human acceptance. Companion1/2 private return/path adapter failures remain
failed with literal zero frame counters; their separate product receipts record
valid two-frame exports. Consumer3's offline metadata failure, cache warm and
fresh setup4 are retained without dependency changes.

The Lab failures were reproduced under raw pinned Node22: the new native sink
used a constructor parameter property, then a new appearance-helper import reached
the renderer barrel and its existing browser classes. The repair uses an ordinary
options field (first in the class, preserving prior emission order) and direct
canonicalizer/diagnostic imports. The five affected Lab suites and new raw-Node
regression pass 30 tests; a final field-order check passes the raw-Node test again.
Fast14 passes schema/boundary/format/lint/types and 3,915 units. Working inventory2
binds the three changed inputs: 2,329 files / 117,502,875 bytes. Browser rendering,
Three, geometry and assets remain unchanged. Actual package compilation confirms sink JS is byte-identical to archive3: 23,445 bytes, SHA-256 `55f1a5d45c6bc96c47e70924fe76f07c3e5b91fe9813e771240a0cc38335deca`.
The declaration and pure helper imports differ legitimately; all 930 renderer-core
archive members remain exact. Archive4 fails before any consumer check because
the offline cache lacks TypeScript metadata. Normal npm archive5 then passes
27 checks at committed `223b21ccd38899cef68b95144b8141bcbd5f5eb2`: **3,151,107 bytes**,
SHA-256 `1ae8ae8e7f41b5459cf92e145feebd8e9738068381b6ad42bfa6a4cb9e926997`.
Source audit4 matches all 1,807 members (670 exact committed source / 1,137 current
emitted files). Fresh setup5 fails cache registration under the initial executor
permissions before acceptance; its logs remain. Setup6 succeeds with the required
cache permissions and copies original inputs and historical packages exactly.
Runtimeproof6 and all ten actual OS-denied sourcephase6 stages pass. Companion4
also passes ten stages, including a new two-frame saved-camera export/final check,
final writer, relocation with original tiny paths absent, and current verification
of both unchanged source81 696-frame packages. Its receipt is
`/private/tmp/still-shift-ms1n-installed-consumer-6/package-repair-proof-4/run.json`
(221,821 bytes), SHA-256
`63b799e3e785c766dd0dd06a18973ffc76173cffb3ea2654cfb8b6772e3c7fd2`.
The independent companion review preserves all producer identities and distinguishes
managed memory from parent RSS; process-tree RSS remains unavailable.

Fullgate4 passes the 3,915 units, then fails two of 177 runtime cases because the
copied-helper negative fixture still rewrites the removed renderer barrel import.
Those two cases fail before reaching their missing/duplicate-descriptor assertions;
175 other cases, including the raw-Node regression, pass. Only one of 77 groups
completes, with 75 later groups, benchmark and baselines unreached. The fixture now
rewrites both actual pure-module imports. Four focused checks and fast15 pass.
Commit `893569c09491ea3e92e584665e4d4d1d5b5f340c` changes only that 172-byte runtime
test map; committed inventory14 matches its focused working inputs (2,329 files /
117,503,047 bytes). All packaged production and build inputs remain identical to
source223. Source audit5 independently matches the same archive5 against the new
test commit: all 670 source and 1,137 current emitted members remain exact. Archive5
and consumer6 retain their actual construction/execution source223 identities.
Fullgate5 passes all 3,915 units and 177 runtime cases, then fails the first
capture-lifetime prepare assertion (HTTP500 rather than200); the other320
integration cases pass. Two of77 groups complete;74 later groups, benchmark and
baselines are not reached. The original response body was not retained, and its
cause remains unproven. Both unchanged-source scoped reproductions pass six
prepares; the first private diagnostic fails module transformation before requests.
Read-only review identifies overlapping cache ownership: Vite independently
removes/renames optimizer files beneath the fixture's measured media cache.
The test now gives those resources separate sibling directories and retains
response bodies in its existing prepare assertions, preserving all cases, limits
and budgets. This repairs the demonstrated ownership seam without attributing
the original500 to it. All seven focused checks and fast16 pass. Test-only
commit `a38754aef7562c1b3431e2aca3dab09f77d4a3b2` changes108 selected test bytes;
inventory15 has2,329 inputs/117,503,155 bytes, identical to the verified working
inputs. Audit6 matches the same archive5 against current Git a387 across all
1,807 members. Archive construction and installed execution remain source223.
Ordinary fullgate6 was interrupted after19 completed groups, proved by matched
next-required headers. CLI started without a completion result;57 later groups,
benchmark and176 baselines were not started. Its terminal exit, EOF, total-log
and source-after evidence are absent. The qualified retained-prefix audit and
interruption receipt preserve those limits; an independent read confirms all
2,329 held inputs remain unchanged. The exact58-group suffix from CLI plus
benchmark completed in recorded stages. All58 suffix groups and benchmark have
actual exit0, complete logs and identical held source; the qualified19 original
groups make all77 complete. All176 frozen items/36,061 frames pass in
280.91s. The ordinary benchmark reports 638 actual
samples at 1274.12Hz. The final receipt is `/private/tmp/still-shift-ms1n-required-suffix-1/run.json`;
its read/hash audit is `/private/tmp/mechanism-ms1n-required-suffix-final-audit-1.json`. Earlier failures and the interrupted
aggregate remain retained; no uninterrupted pass or human acceptance is claimed.

## Remaining acceptance and retained limitations

Hardware1 state/anchors match software/Metal with delta 0; its cross-driver pixel diagnostic **fails**, max 135/RMS 2.226. Hardware appearance/full episode remain open. Full3 retains 51 QA warnings/raw severities. Legacy semantic/factual truth, encoded glyph readability, continuous audiovisual/listening review, human creative acceptance and owner readiness remain unassessed. No cross-code/driver shader parity is claimed.

Failed/cancelled full1/2, preview2/4, package1, portable2/3 and archive1 remain retained. Independent full3 audit corrected its RGB/RGBA assumption; exporter evidence stayed unchanged. Final staged software receipts are bound in the results; separate human review remains required. No publication or MS2/MS3 production acceptance is implied.
