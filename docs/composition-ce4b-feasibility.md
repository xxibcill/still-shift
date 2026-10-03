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

### Decision

Pending; acceptance has not changed.
