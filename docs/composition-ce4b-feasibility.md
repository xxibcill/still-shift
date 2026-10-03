# CE4b rendering feasibility

Started **2026-10-03 02:46:52 UTC**. Decision deadline: **05:46:52 UTC**
(three hours). At most two targeted implementation experiments are allowed.
The pending PNG sampler is experiment one. A second experiment must follow
measured evidence. This deadline is for a feasibility decision, not a CE4b
completion promise.

## Starting state

Branch: `codex/composition-ce4b`, based on `codex/composition-ce4`.
HEAD: `e09c5478c78473cdc4c8c28fcf442c922e28cc33`.
Recent accepted slices are bounded provider canvases (`72fbfa4`), bounded
isolated-group repainting (`7ab82af`), and horizontal sine sampling (`e09c547`).
The original completion goal was paused when this phase began; its acceptance
requirements remain in force.

Uncommitted experiment: backend version `composition-webgl2-0.33.0`, PNG byte
classification, a constrained GPU PNG downscale sampler, and native regression
checks. The latest change adds a history-dependent static-placement fallback;
it has not been verified for seek determinism or timing. An initial PNG build
failed an optional-property type check, which is now repaired but not rechecked.

The complete last software audits at version 0.30 passed all pixels and family
exports: commerce **127 cases / 28,200 frames**, typography **20 / 3,367**, and
story components **48 / 9,216**. Respectively **52**, **17**, and **8** cases passed
both pixel and software timing gates. Later targeted checks passed with modest
timing improvements. Version 0.32 fast checks, **1,255 unit tests**, native GPU
checks and **204 export/Lab frames** passed. CE4b is incomplete.

A recoverable copy of the starting tracked diff, untracked files and Git state
is saved under `/private/tmp/ce4b-feasibility-20261003`.

## Decision rules

- Verify actual Apple Metal and pinned SwiftShader renderers using the existing
  browser profiles, and explicitly select the WebGL2 composition backend.
- Compare legacy and composition within each profile using warmed alternating
  paired runs and median timings. Measure preview separately from render plus
  readback. Profile evaluation, preparation, uploads, composition and readback.
- Preserve baselines, pixel tiers and the current **1.25×** software timing gate.
  Hardware results do not replace software acceptance.
- Retain and commit an implementation only after focused correctness and
  repeatable timing improvement beyond noise. Use complete family matrices for
  a selected candidate and final local checks before claiming completion.
- If hardware targets pass, validate the complete hardware matrix. If preview
  is fast but readback is slow, consider hardware preview with pinned software
  exports. If neither experiment gives a credible route, propose a formal scope
  revision separating CE4b visual correctness from CE6 performance work.
- Do not revise acceptance or mark CE4b complete without the user's decision.
  GitHub Actions remain prohibited.

## Measurements and decision

### Verified profiles

Chromium **151.0.7922.34**, Darwin arm64:

- Hardware: `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)`;
  raster fingerprint `sha256:1635aedc2b987dcd5c74dce4b4098aff37754174c33461d6f626c9dcad69e4a9`.
- Pinned: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`;
  raster fingerprint `sha256:cf238cf2dddb639b7503248b282588056b2a0e559116a0f906acb1cfc1b166ba`.

Both profiles explicitly select the WebGL2 composition backend and compare it
with legacy within that same profile. The six representative cases cover
Commerce Stagger, Story Instances, Story Bracket, Alpha Matte, Editorial
Containers and Highlight Bloom. Each mode warms the entire sequence, then runs
three alternating paired render/readback passes; the reported ratio is their
median. Baseline/candidate/candidate/baseline bookends expose timing drift.

Preview is measured separately without readback: three alternating runs of 60
RAF-paced frames, including render-call CPU time and RAF intervals. These are
headless diagnostics, not a complete Lab interaction test. Stage profiling is
separate from timing acceptance and inserts `gl.finish()` after device calls.
Those call timings do not fully separate queued GPU work from readback. A
second diagnostic forces a one-pixel framebuffer read before the full frame
read, reporting render-call time, queue drain/synchronization and subsequent
readback separately. The barrier includes fixed read/synchronization overhead
and is not a pure shader timer. Evaluation and graph building are measured
independently. The focused pixel comparison checks 11 frames and three reverse seeks.
It does not replace full family acceptance. Its hardware comparison is against
legacy in Metal, not against pinned export; failures of the near diagnostic
alone do not establish failure of the hardware preview perceptual tier.

### Representative results

The software column records baseline ratios; the Metal column records the final
PNG candidate. These warmed diagnostics do not replace the existing cold story
and typography family timing procedures. Values remain compared with **1.25×**.

| Case                  | Pinned baseline render/readback | Final Metal render/readback | Metal preview median call, composition / legacy |
| --------------------- | ------------------------------- | --------------------------- | ----------------------------------------------- |
| moving-stagger        | 3.175–3.291×                    | 2.402–2.512×                | 0.80 / 0.10 ms                                  |
| repeated-instances    | 4.768–4.806×                    | 1.800–1.801×                | 0.90 / 0.10 ms                                  |
| bracket               | 2.758–2.774×                    | 1.455–1.466×                | 0.60 / 0.10 ms                                  |
| mask-matte            | 2.170–2.180×                    | 0.660–0.662×                | 1.40 / 3.60 ms                                  |
| typography-containers | 1.170–1.179×                    | 0.359–0.363×                | 6.40 / 23.00 ms                                 |
| expensive-glow        | 3.026–3.051×                    | 0.438–0.443×                | 0.40 / 12.50 ms                                 |

The final software PNG comparison for moving-stagger is reported below. Metal
baseline/candidate bookends overlap, so a hardware speedup is not established.
Every final sampled seek is stable in both profiles. All software diagnostics
meet near; Metal near diagnostics are looser (maximum differences **2–54**),
which is not a substitute for measuring Metal against pinned export at the
perceptual tier. Simple Metal preview calls are short; typography has longer
tails. RAF/CPU timings alone do not guarantee GPU completion or Lab interaction
quality. Hardware render/readback targets do not all pass, so the complete
hardware acceptance matrix is not triggered by this experiment.

Measured device-call profiles are complemented by the one-pixel barrier below.
The barrier uses matching resource/legacy preparation and complete-sequence
warmup. For **60 sampled frames**, medians are:

| Case                  | Pinned call / queue drain / subsequent read | Metal call / queue drain / subsequent read |
| --------------------- | ------------------------------------------- | ------------------------------------------ |
| moving-stagger        | 70.1 / 85.3 / 65.0 ms                       | 26.4 / 58.8 / 83.9 ms                      |
| repeated-instances    | 83.9 / 167.2 / 84.9 ms                      | 27.1 / 86.1 / 112.2 ms                     |
| bracket               | 57.5 / 74.0 / 61.2 ms                       | 19.2 / 68.0 / 75.7 ms                      |
| mask-matte            | 129.5 / 413.7 / 49.1 ms                     | 30.2 / 62.6 / 65.7 ms                      |
| typography-containers | 203.9 / 150.1 / 50.2 ms                     | 404.0 / 43.1 / 62.8 ms                     |
| expensive-glow        | 88.5 / 2469.5 / 108.3 ms                    | 13.3 / 112.5 / 120.1 ms                    |

Glow's software queue drain (**2,469.5 ms**) is much larger than its subsequent
frame read (**108.3 ms**). This supports prioritizing effect execution rather
than treating the whole measured readback stage as buffer allocation. Evaluation
and graph construction are small in the ordinary cases (roughly **0.5–2 ms per
60 frames**). Typography also has substantial preparation cost; software uploads
and repeated-instance rendering remain separate targets. None of these measurements
provides a credible route to closing every current gate with the two experiments.

Detailed timings, fingerprints, preview intervals, profiles and a reconstructable
harness snapshot are saved in
[composition-ce4b-feasibility-results.json](./composition-ce4b-feasibility-results.json).
To rerun the final diagnostics, materialize `harnessSnapshot`, replace
`{{REPOSITORY_ROOT}}` with the absolute repository directory and `{{HARNESS_ROOT}}`
with a directory under `/private/tmp`, use the retained commit and locked
toolchain, then run from the repository root `node --import tsx run.mts
--profile pinned` or `--profile hardware`. Run profiles alone; do not overlap
benchmarks with builds, tests or another browser profile. Historical rejected
production iterations are recorded as measurements, not reproduced by checking
out the retained implementation.

### Experiment one: constrained PNG sampling

The starting static-placement fallback is rejected: the first Metal run changed
frame-zero bytes after reverse seeks in Commerce Stagger and Highlight Bloom.
The sampler now chooses its path only from current inputs, with explicit
repeat/seek regression checks. Ordinary downscales (mip level zero) are now excluded: unrestricted sampling
slowed Alpha Matte from **2,367–2,369 ms** to **2,477–2,482 ms**. The final rule
uses direct sampling only for eligible mip downscales and skips coordinate
preparation outside current damage. The repeated final Commerce Stagger
comparison takes **620.5 / 623.4 ms**, versus baseline **675.3 / 680.4 ms**, an
approximately **8%** composition-time improvement. Ratios remain
**3.1009× / 3.1613×**, above the unchanged gate. The 11 focused software frames
meet near (max difference **1**, minimum PSNR **97.44 dB**) and reverse seeks
are byte-identical. Fast checks, **1,255 unit tests**, native GPU checks including
**106 synthetic PNG frames**, and **204 export/Lab frames** pass on the final candidate, including the damage-skip refinement. Complete
family audits and final full local verification follow.
The original pending implementation and the rejected iteration remain saved in
`/private/tmp/ce4b-feasibility-20261003`.

### Experiment two: incremental-readback scratch buffer

Selected from the measured profile: temporary region allocation/readback is a
major stage in the software cases. The experiment reuses only the internal
incremental-readback temporary buffer. Publicly returned frame bytes retain
independent ownership. The experiment is **rejected**. Bracket composition medians improve from
**603.5 / 615.5 ms** to **581.7 / 580.2 ms**, but Alpha Matte worsens from
**2,347.8 / 2,334.9 ms** to **2,375.2 / 2,405.3 ms**. Editorial Containers' paired
ratios (**1.1752× / 1.1634×**) overlap baseline drift (**1.1946× / 1.1602×**).
All focused pixels and seeks pass, but the mixed performance result does not
justify retention. No production scratch-buffer change is retained.

### Complete selected-candidate software audits

The original family procedures and **1.25×** gate remain in force. All three
commands use WebGL2 with `--keep-going`, complete every case and required export,
and exit nonzero for timing failures only. No pixel or seek failure is present.

| Family                                  | Cases / frames | Pixels pass | Pixels and timing pass | Export pairs pass |
| --------------------------------------- | -------------- | ----------- | ---------------------- | ----------------- |
| Commerce + commerce/isolated components | 127 / 28,200   | 127         | 53                     | 30                |
| Story/passage components                | 48 / 9,216     | 48          | 8                      | 13                |
| Typography                              | 20 / 3,367     | 20          | 17                     | 10                |

All **63 CE0 reusable-component combinations** are represented by commerce,
isolated, story and passage cases plus their regression variants. Commerce's
fitted-panel failure diagnostics also pass without writing invalid output.
The commerce stagger case measures **2.9730×**, compared with **3.3484×** in the
previous complete 0.30 audit; it still fails the gate. Component State improves
from **1.4953×** to **1.2807×** and also remains a failure. Earlier slices contribute
to changes across the complete audits; the isolated paired PNG experiment is
used for attributing its approximately 8% moving-image improvement.

The full `pnpm check`, including frozen CE0 verification, is the remaining local
check. It is bounded by the feasibility deadline; unfinished verification will
be reported as pending rather than passed.

### Approved scope decision (2026-10-03)

The two experiments do not provide a credible route to completing all existing
performance gates within this phase. Retain the verified PNG mip sampler and
stop further optimization experiments. Keep the established hybrid rendering
policy: hardware preview, with pinned software exports and exact cache identity.
Hardware preview still needs its own complete perceptual-parity/interaction
validation; responsive sampled calls alone are insufficient.

The user approved the following **formal scope revision** on 2026-10-03:

1. CE4b closes adapter/feature coverage, assigned CE0 pixel tiers, evaluated
   state, deterministic seeks, repeated exports and Lab/export agreement, with
   complete local verification. Those requirements and tiers remain unchanged.
2. CE6 owns the outstanding **1.25×** render/readback target and recorded per-case
   performance failures. Preserve the target rather than silently passing slow
   cases. Record separate preview and export budgets by profile, resolution and
   warm/cold method so optimization can target the relevant path.
3. Prioritize expensive effect execution (glow/convolution), repeated-instance
   preparation/uploads and typography preparation from the measured stages.
   Use small measured experiments with correctness gates, followed by complete
   family acceptance for the selected implementation.

The approval changes milestone ownership of the timing requirement only. The
**1.25×** target, all **117 failing cases**, baselines, pixel tiers and existing
benchmark assertions are preserved in CE6. Combined family commands continue to
exit nonzero for these timing failures; this does not indicate a pixel failure.

CE4b is **not complete** while final verification remains open. Complete
selected-candidate GPU family audits have finished. Full local checks are in
progress; hardware preview/export perceptual coverage remains a separate
correctness requirement. Unfinished verification will be reported accurately
at the three-hour feasibility deadline.
