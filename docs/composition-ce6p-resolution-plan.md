# CE6-P resolution plan after research

Date: 2026-10-06. Evidence snapshot: `633138b`, runtime `7a797a9` / WebGL 0.40.0.
Status: owner-approved renderer 0.42.0 retains the tested echo correction and
particle candidate. Targeted correctness and quiet-window cost measurements are
complete; the full local gate passes retained renderer 0.42.0. Native 2× and
unchanged strict family audits remain open. The fresh-owned-read candidate is
rejected on both profiles; no compatible closure mechanism is selected. CE6-P
remains incomplete. The initial research snapshot is retained below;
see the [execution record](#execution-record-2026-10-06) for new work.

## Recommendation

Use one bounded diagnosis stage to establish whether the current contract has a
credible route to acceptance, then select an implementation from measured costs.
Do not start another sequence of small optimizations followed by full audits.
The useful new directions are eliminating demonstrably redundant raster/upload
work and reducing exact compositing work without changing its byte arithmetic.
The native count-one target is the first feasibility gate because shutter
accumulation improvements cannot affect it.

The [primary-source research](./composition-ce6p-resolution-research.md) explains
the browser mechanisms, concrete source seams and rejected alternatives.
This document defines the order, required evidence and stopping decisions.
It does not claim that all targets are attainable under the present constraints.

## What must be resolved

The [strict audit](./composition-ce6p-family-audit.json) retains 195 cases, 119
timing misses and four echo pixel-tier gaps. All original 117 timing failures
remain open. The two additional misses are `commerce/atom-rotate` and
`typography/editorial/numeric`; a matched whole-family A/B has not established
them as candidate regressions.

Family timing passes when composition WebGL render plus complete owned RGBA
readback is at most 1.25 times legacy Canvas render plus `getImageData`.
For current cost `W`, reference cost `L`, and ratio `r = W/L`, the budget is
`1.25L`, the required saving is `W - 1.25L`, and the required fractional reduction
is `1 - 1.25/r`. The native 1080p target is separate: WebGL must cost at most
half the composition Canvas backend on the preserved native workload/method.

Of the 119 current timing misses, 12 have ratios in `(1.25, 1.5]`, 18 in
`(1.5, 2]`, and 89 exceed 2. The last group needs more than 37.5% lower total
cost. Small wins cannot close most of this ledger.

| Representative case                       | WebGL/legacy | Current WebGL ms/frame | Allowed ms/frame | Required reduction |
| ----------------------------------------- | -----------: | ---------------------: | ---------------: | -----------------: |
| `component/story-stagger`                 |        5.601 |                  6.616 |            1.477 |              77.7% |
| `component/story-instances`               |        5.007 |                  5.978 |            1.492 |              75.0% |
| `commerce/atom-particles`                 |        5.285 |                  7.265 |            1.718 |              76.3% |
| `commerce/atom-glow`                      |        2.125 |                 31.186 |           18.341 |              41.2% |
| `typography/editorial/appearance-uniform` |        1.589 |                  8.134 |            6.399 |              21.3% |
| `typography/editorial/numeric`            |        1.252 |                  6.399 |            6.391 |             0.124% |

These are calculations from retained results, not new measurements. Story and
typography use their recorded timeline totals divided by frame count. Commerce
uses the pass with the median ratio and divides by that pass's timed frame count,
including repeated cycles. Rounded table values do not replace raw acceptance.
The borderline numeric case merits matched confirmation, not an invented fix.

## Stage 1: prove the budget and locate avoidable work

Prepare a single diagnostic report covering the following questions. These were
future steps at the initial research snapshot; the execution record distinguishes
completed structural checks from pending cost attribution. Use an
explicitly coordinated quiet window before timing; the previous window was
released. Keep all source/helper hashes, browser flags and profile fingerprints.

### A. Can count-one fit its unchanged budget?

The selected native fixture is one moving 400×300 solid at opacity 0.6 on a
1920×1080 output. The retained bounded brackets record mean session medians of
1.50 ms pinned WebGL and 1.95 ms hardware WebGL against 0.85 ms Canvas. Their
descriptive 2× budget is 0.425 ms: approximately 71.7% and 78.2% reductions.
Use the complete [bracket records](./composition-ce6p-exposure-brackets.json),
including all controls and variability; these summary numbers are not universal
lower bounds. Passing this fixture would not establish the broad native target.

Count one bypasses accumulation in `render/exposure.ts` and `render/webgl2.ts`.
The public frame is 8,294,400 bytes with independent caller ownership.
`WebglReadback` already caches pixels and reads changed regions, but returns a
complete independent array. Further exposure-sum work cannot close count one.

In a separate attribution run, measure preparation, uploads, exact paint/copies,
queue completion, region readback and final owned-byte copy for this exact
fixture. Document instrumentation overhead; readback can absorb prior queued
work, so its wall time is not pure transfer time. A small forced read barrier is
an attribution probe with its own cost, not a replacement acceptance method.
Do not subtract unsynchronized RAF submission time from export time.

**Go/no-go:** identify enough compatible, removable work to plausibly bridge the
whole gap. If the observed residual after an optimistic saving estimate remains
above the budget, do not implement that candidate as a closure solution. An
observed transport/copy floor can stop this plan on this environment; it does
not prove that every possible implementation is mathematically impossible.

### B. Which cache misses and paint boundaries are actually redundant?

Inspect `component/story-instances`, `component/story-stagger`,
`commerce/atom-particles`, `commerce/atom-glow` and
`typography/editorial/appearance-uniform` as the initial representative set.
Add a failing fixture only when its actual operations expose a different path.
Selection by an effect's name alone is insufficient.

Capture counts and bytes per frame for raster preparation, uploads, cache hits
and invalidations, ordered paint groups, backdrop copies, effect passes and
dirty-region coverage. Include first-use and warmed behavior. Trace source and
placement identities to distinguish animation-driven misses from avoidable
eviction. Keep this instrumentation outside final acceptance timings.

| Candidate, in investigation order                                 | Exact code seam and causal hypothesis                                                                                                                                                                                   | Evidence required before implementation                                                                                                                                                                                         | Stop condition                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Retain multiple reusable image placements                         | `webgl-images.ts` keeps one raster per `content.sources`, although its visual key includes placement, opacity, clips and transforms. Stable placements sharing sources may evict each other.                            | Prove repeated identical full keys are evicted within the same workload; count reusable bytes and prep/upload cost; verify which fixtures enter this path.                                                                      | Keys change every frame, source identities differ, working set exceeds the bounded cache, or avoidable cost is too small. |
| Extend scheduling across compatible paint groups                  | `webgl-vectors.ts` splits overlapping operations to preserve rounding; `webgl-paint.ts` already batches up to 15 prepared sources. Some boundaries may admit a larger ordered shader batch using one backdrop snapshot. | Identify actual cross-call boundaries with no intervening effect/mask/read dependency; preserve every source's original order and integer rounding; estimate removed snapshots/passes after accounting for larger covered area. | Existing batching already covers the work, sampled backdrop semantics differ, or added sampling/area cancels the saving.  |
| Bound a whole isolated scope while preserving logical coordinates | `backend.ts` creates scope-sized surfaces; `webgl2.ts` places, masks and composites them. Explicit storage bounds and origins may reduce raster/upload/effect work throughout an isolate.                               | Derive finite support and unchanged device-space sampling origins, including blur halos and inverted mattes; count removed executed pixels, not just saved allocation bytes; account for cache keys and feedback.               | Unknown/global support, equivalent raster work still required, or savings confined to an already-small final composite.   |
| Tighten a demonstrated expensive effect region                    | `webgl-damage.ts` falls back to unknown bounds for effects; device/effect paths may process large surfaces.                                                                                                             | Demonstrate a costly operation with provably smaller support and derive bounds including blur halo, displacement reach, transforms and matte dependencies. Compare with already retained bounded effects.                       | Support is global/unknown or saved pixels cannot bridge a material part of the gap. Do not repeat rejected blur formulas. |

The cache candidate is a source-level hypothesis, not a measured cache bug or a
promise to solve story instances. A changing matrix/opacity legitimately changes
its exact raster. Reusing a transformed texture can change Canvas sampling and
must not be substituted silently. Any retained cache needs full identity,
bounded memory, proper resource lifetime and deterministic seek invalidation.

Static inspection already limits this hypothesis: `story-instances` has separate
`states` arrays for `house-art-a` and `house-art-b`, passed through as separate
`sources` identities. Its camera changes both position and zoom across the
timeline. Sharing the same asset name does not prove cache-key collision, and
the changing device-space raster is not eligible for simple stable-placement
reuse. Do not implement the cache proposal to solve this fixture without
different evidence. See the [fixture](../benchmarks/fixtures/reusable-components/story-instances.json)
and [adapter](../packages/renderer-core/src/composition/adapters/prepared.ts).

The broader paint-scheduling candidate offers a more systemic mechanism but has
higher proof cost. Rounded source-over is not associative: flattening a stack
first, dropping an intermediate rounding step or replacing primitive blending
with ordinary fixed-function blending is not equivalent. No new CPU/GPU
composition hybrid is within this plan.

Historical story-instances attribution recorded 189.9 ms upload and 136.5 ms
owned copy over 192 frames against a 290.1 ms total budget. This explains why
optimizing only one stage is insufficient; it is not a fresh attribution of
0.40.0 or a proof that all upload costs are unavoidable. Refresh only the stage
evidence needed to select a candidate, not another broad benchmark campaign.

**Output of Stage 1:** one cost table for each distinct path, a complete mapping
of the 119 failing IDs to observed paths, the candidate's maximum plausible
saving, residual cost and an explicit proceed/stop decision. Preserve the
original 117 IDs individually. Do not promise closure from a representative
case: representatives only select work; the full audit decides acceptance.
The research already includes all 119 per-case numerical budgets. Dynamic
attribution must add actual hot-path evidence rather than inferring it from names.

## Stage 2: diagnose the four echo gaps separately

All four fail the unchanged `near` tier: maximum channel difference must be ≤2
and PSNR ≥50. Recorded differences are 4–5 despite adequate PSNR. The preserved
CE7 and current renderer have identical bytes across 2,500 fixture-scoped checks.
With the legacy reference fixed, preserving those failing bytes exactly cannot
also make them satisfy the tier.

Trace one failing and neighboring passing frame per case, plus zero-decay as a
control, against legacy, composition Canvas, preserved CE7 WebGL and current
WebGL. Suitable retained frames are base echo 22/21, returning-matte 69/72,
image-active-stack 10/20 and overlap-echo-matte 15/17 (failure/control).
Save first error coordinates and values; trace historical sample times, pose
revisions, opacity and operation order, then inspect history/current paint,
effects, matte, final composite and individual shutter samples.

Primitive-versus-image rounding and intermediate surface boundaries are the
leading source hypotheses. History selection remains an alternative until
traced. The base echo fails without matte/glow/shutter complications, so begin
with its common path. Transparent Canvas public bytes and raw WebGL texture
bytes use different alpha representations; compare equivalent views rather
than treating repremultiplied Canvas readback as an exact internal-byte oracle.

Reduce the first proven divergent operation to a small arithmetic or history
oracle before proposing a correction. Apply a semantic fix at the narrowest
demonstrated seam; do not change a global blend formula based on final images.

**Compatibility decision before retaining a correction:** explicitly permit a
versioned correction to these known failing CE7 outputs, while preserving the
legacy references, tiers and unrelated exact outputs. Until that scope is
authorized, the four gaps remain open. This plan makes the conflict reviewable;
it does not revise compatibility or regenerate any baseline.

## Stage 3: implementation and verification only after diagnosis

Select the strongest candidate supported by Stage 1. Before editing production,
record its eligible paths, byte-equivalence argument, expected saving range,
memory bounds, fallback and rejection criterion. If no candidate can plausibly
close a required budget, stop and present that evidence instead of cycling
through more optimizations. A useful partial gain must be described as partial.

1. Implement one causal change, with focused correctness checks for its actual
   failure modes. Prove ordered rounding, fractional transforms, alpha,
   cache invalidation, reverse/random seeks and independent readback ownership
   where affected. Both pinned and hardware profiles must preserve output.
2. Measure only affected representatives first, using serial
   baseline/candidate/candidate/baseline sessions, immutable workload/helper
   sources and unchanged public render/readback boundaries. Retain failed and
   contaminated attempts. Reject overlap; do not silently retry until favorable.
   Do not call differences overlapping session variability a demonstrated gain.
3. If the causal prediction fails, reject that candidate. Revisit it only with
   new evidence explaining the failed prediction. Do not compensate by changing
   GPU flags, backend, readback ownership, resolution, tiers or acceptance.
4. After a justified candidate passes focused review and checks, run the required
   full local gate on final code and the unchanged strict commerce,
   story/component and typography WebGL audits, including their exports.
   All verification stays local; GitHub Actions remain prohibited.

## Completion and stopping rules

Milestone completion requires every original timing failure to close under its
unchanged method, no additional strict timing failures, all pixel/state/seek
tiers passing, independent and repeated exports passing, hardware agreement and
the native 1080p 2× requirement demonstrated on the required workloads. Preserve
the complete failure ledger and raw evidence. Delivering a PR or improving a
selected exposure case does not satisfy these conditions.

Do not repeat PBO/fence readback, explicit framebuffer/no-preserve variants,
scratch-array reuse, skipped clears, generic upload variants, unspecialized blur
or unsafe fixed-function primitive blending without new causal evidence. The
research report documents why each lacks a supported route here. Draft pixel
local storage extensions are a conditional research branch, not an assumed
capability or part of the first implementation plan.

If the budget gate rules out the supported candidates, the next deliverable is
a concrete architectural decision with costs and compatibility consequences.
Possible future changes to the synchronous readback API, export pipeline,
backend policy or target scope require explicit owner authorization. They are
not silently included in this compatible optimization lane. Keep CE6-P open
when the constraints prevent closure.

## Execution record (2026-10-06)

The owner asked to follow the plan until significant progress. Untimed operation
traces exposed a specific particle bottleneck: dozens of disjoint neighborhoods
were uploaded, copied and painted separately despite sharing one Canvas raster.
This supports a bounded work-reduction candidate; it does not establish enough
elapsed saving to close the particle budget or the broader milestone.

[Raw progress evidence](./composition-ce6p-disjoint-paints-results.json) retains
renderer/input/helper hashes, immutable baseline and candidate frame hashes,
browser fingerprints, helper source versions, counts, logs and failed attempts.
The candidate is local, uncommitted WebGL 0.41.0; PR #41 still contains the
previously verified 0.40.0 slice.

### Diagnosis and selection

- Native count-one submits one raster upload, one backdrop copy and one paint
  pass on selected frames. No shutter accumulation work is present. Cost
  attribution and a credible route to its unchanged 2× budget remain pending.
- Story stagger/instances already have only four to seven paint passes on the
  sampled frames. Providers have distinct source identities and changing
  transforms; stable-placement eviction was not demonstrated. Combining large,
  separated regions could increase work. No cache change was selected.
- Glow executes an already bounded threshold/blur/composite chain. The trace
  does not support repeating previously rejected generic blur or crop changes.
- Particles issue 48–50 paint passes on sampled frames, mostly tiny disjoint
  neighborhoods. This is the strongest observed redundant call boundary.
  Stage budgets and observed GPU hot paths for all 119 cases remain pending.

The selected mechanism copies the existing Canvas neighborhoods, unscaled at
integer coordinates, into a small atlas. One atlas upload and one float-layout
upload feed a single instanced draw. Every covered pixel uses the original
integer primitive source-over recurrence against either the exact known clear
or one backdrop snapshot. Disjoint coverage permits sharing a backdrop without
removing an intermediate blend at an overlapping pixel. The particle raster,
public owned readback, effect order and acceptance thresholds remain unchanged.

Eligibility is limited to screen targets with at least eight disjoint integer
rectangles. Small, overlapping, offscreen, oversized and unsupported float paths
retain the original implementation. Atlas plus descriptors have a 128 MiB GPU
cap and texture-dimension/row limits; the Canvas atlas uses another atlas-sized
allocation, and any backdrop is bounded by the active region. Acquired resources
are released on allocation or draw failures.

The expected saving is fewer uploads, framebuffer copies and paint submissions.
There is no defensible milliseconds saving range until quiet-window attribution.
This candidate is explicitly partial and subject to the Stage 3 elapsed bracket
rejection rule; it is not a closure solution for native count-one or all families.

### Verified progress

| Particle frame | Paint passes, baseline → candidate | Upload calls | Backdrop copies |
| -------------- | ---------------------------------: | -----------: | --------------: |
| 0              |                             49 → 3 |       49 → 4 |          49 → 2 |
| 24             |                             50 → 3 |       49 → 3 |          50 → 2 |
| 96             |                             48 → 3 |       46 → 2 |          48 → 2 |
| 239            |                             49 → 3 |       48 → 3 |          49 → 2 |

These are untimed structural counts. Instrumented per-pass pixel fields describe
surface/scissor bounds and overstate instanced coverage; they are not an executed
fragment measurement. About 94% fewer paint passes does not imply 94% less time.

- Each profile preserves all 720 forward frames across base particles,
  environment-stack and environment-reversed, plus 780 reverse/random/repeated
  seek checks. Comparisons use immutable `633138b` browser dependencies and
  independently owned full RGBA reads. Candidate and baseline hashes match
  exactly within pinned SwiftShader and Apple Metal separately.
- Both profiles pass 24 arithmetic/packing/clipping oracle cases and ten existing
  particle parameter/dimension checks. The final helper also checks missing
  float capability, small/overlap/offscreen fallbacks and all three GPU allocation
  failure boundaries. Two independent review axes have no remaining findings.
- Hardware and pinned whole-frame hashes differ on the preserved renderer too.
  Twelve candidate samples pass the existing hardware `perceptual` policy
  (minimum PSNR 58.369 dB, minimum SSIM 0.999783, maximum channel delta 12).
  No cross-profile exact/near claim is made.
- `pnpm build`, `pnpm lint:ts`, schema/boundary checks, 1,600 unit tests and the
  complete existing `pnpm test:browser:composition-webgl` suite pass. The stacked
  particle fixture exports 240 frames twice to byte-identical MP4s; relocated
  assets and overwrite protection pass. This is focused verification, not a
  new full `pnpm check` or complete family audit.

### Pending timing and acceptance

Other chats had concurrent builds/tests/renders. Automatic approval review
rejected further cross-chat quiet-window coordination because trusted explicit
user authorization to message those chats was absent. Approval questions remain
pending. No elapsed performance or acceptance measurement was started, and no
119-case failure was declared closed. Untimed structural and correctness work
continued without stopping other chats.

Next, reserve an authorized quiet window, complete native count-one cost
attribution, and run immutable serial baseline/candidate/candidate/baseline
particle brackets with the original public render/readback boundaries. Reject
the candidate if the cost prediction does not hold. A justified candidate still
needs focused strict timing/pixel/state/seek/export checks, the required full
local gate and complete unchanged family audits. The four inherited echo gaps
still require an explicit compatibility decision before retaining a correction.

### Echo diagnosis and concrete proposal

The owner subsequently requested continuing until CE6-P is complete. The next
bounded diagnostic identified the echo arithmetic error and prepared a
[three-file correction patch](./composition-ce6p-echo-fix-proposal.patch).
Production echo sources remain unchanged while compatibility approval is pending.
[Raw evidence](./composition-ce6p-echo-diagnosis-results.json) retains stage traces,
source versions, proposal text and hashes, full-timeline hashes, failed attempts,
compiler/review results and sampled hardware metrics.

At base echo frame 22, the legacy offscreen history's alpha sequence is
4 → 15 → 44 → 117 → 121. The preserved GPU primitive recurrence produces
4 → 14 → 43 → 116 → 120, with cumulative RGB drift. Composition Canvas matches
legacy exactly. Replacing the primitive recurrence only for prepared images
stacked inside the transparent echo scope removes this divergence. The isolated
arithmetic prototype makes frames 21 and 22 exact, and all four failing timelines
meet the unchanged near tier after correction.

The narrowed proposal marks image content within echo history/current operations,
including nested content, while excluding matte operations. The marker participates
in existing content and isolate keys. It selects the existing explicit rounded
bitmap shader recurrence; ordinary fixed-function blending is not substituted.
No ambient backend state or acceptance/reference change is introduced.

- The four previously failing pinned cases pass 960 forward frames and 1,040
  reverse/random/repeated seeks. Base echo becomes exact; returning-matte,
  image-active-stack and overlap-echo-matte have maximum delta two.
- Zero-decay and echo-disabled controls also pass their 480 frames and 520 seeks.
  All 240 echo-disabled frames preserve the original GPU bytes within each
  profile. The original project TypeScript configuration passes with only the
  three proposal files overridden in compiler memory.
- All 12 selected pinned/hardware comparisons meet the unchanged perceptual
  guarantee: minimum finite PSNR 53.665 dB, minimum SSIM 0.999562 and maximum
  channel delta 40. Hardware differs from legacy Canvas on the byte-preserved
  disabled control too; no hardware-to-legacy near or cross-profile exact claim
  is made. Full profile timelines and seeks are retained separately.
- Initial runner review found fingerprint validation and cleanup-error retention
  gaps; both were repaired. Sampling review corrected its method label and
  rejection of empty selections. The first sampled attempt incorrectly sought
  unsampled hashes and was retained as a harness failure. None of these attempts
  establishes elapsed timing or final milestone acceptance.

The patch is a reviewable compatibility proposal. Applying and retaining a
versioned production correction still requires the pending explicit decision
per Stage 2. Passing a prototype does not close the four acceptance gaps on the
delivered renderer.

### Failure routing and prepared cost measurements

The [routing record](./composition-ce6p-route-map-results.json) maps all 119
current timing misses and retains all original 117 IDs using the actual adapter
variant generators, compiled compositions, evaluated states and graphs at up to
four selected frames. Among those sampled graphs, 106 cases include image draws,
83 include story rectangle providers and 78 include commerce text providers.
Only three include rising particles. These overlapping counts describe graph
routing, not measured GPU hot paths or an elapsed cost attribution.

The particle elapsed runner has immutable browser sources, separate actual host
compiler/helper hashes, exact supplied-payload hashes, the unchanged paired timing
helper and complete public render/readback boundaries. It rejects startup
contention, accumulates overlap evidence and retains failed/cleanup attempts.
Both renderer versions pass untimed smoke checks; an intentionally missing
fixture verifies failed-attempt retention. Both independent review axes are clear.

A separate native count-one runner preserves the CE7 fixture and frame window,
with repeated matched instrumented/uninstrumented traversals, an explicitly
costed 1×1 queue barrier and cached/standalone owned-byte-copy controls. Nested
stage timers are inclusive and cannot be added. Its byte smoke check passes;
elapsed execution remains pending. Its repeated setup frame is a warmup, not a
cold-initialization measurement.

Automatic approval review again rejected messaging other chats to hold workloads:
the instruction to continue CE6-P did not authorize directing those chats. The
explicit messaging and echo-compatibility questions remain pending. Other local
verification continues, so no elapsed session was started. Native feasibility
and serial particle brackets are the next measured decisions; further production
optimization and full audits wait for that evidence. No timing failure is closed.

### Active completion goal and GPU operation coverage

The owner explicitly requested an active goal to continue until CE6-P is
complete. The goal uses the unchanged completion requirements above, including
all original 117 timing misses, no additional strict misses, native 1080p 2×,
pixel/state/seek tiers, exports, hardware agreement and the final local gate.
The goal is now blocked after those pending conditions persist across three
consecutive goal turns. Its objective and acceptance remain unchanged; activation
does not resolve the echo compatibility decision or authorize messages to other chats.

Untimed GPU operation tracing extends the graph routing map across all 119
current failures and all 117 originals, at 476 selected frames. It runs immutable
`633138b` / WebGL 0.40.0 browser sources with actual adapter-generated payloads
whose composition hashes match the prior routing record. Preparation fingerprints
328 compiler/helper/input dependencies and verifies them after compilation.
The final runner records fixture and image-asset hashes before and after rendering,
shader bodies, conservative submission bounds, independently owned pixel hashes
and the browser environment. Concurrent verification is recorded and allowed
for these structural counts. No elapsed timings are captured.
An independent repeated run produces exactly the same counts and owned pixel
hashes at all 476 selected frames.

Known-clear backdrop copies occur in 100 cases, with 311 such copies among 1,956
copies over these selected frames. They cover 44,331,166 of 117,365,554 copied
pixels. The native count-one trace also identifies its single backdrop copy as
covering the exact known clear color. Replacing an eligible copied backdrop with
the existing tracked byte color is a concrete copy-removal hypothesis for cost
attribution; no new production implementation is selected before that budget
gate. Counts and pixel area do not predict elapsed saving or whole-timeline
eligibility, and they do not establish a route to closing all 119 failures.

An offline scope check finds 25 known-clear copies across eight cases with no
known-clear single-paint call in those frames: four commerce variants and all
four typography failures. A branch confined to `WebglPaint.draw` therefore
cannot cover those copies; batched paint needs its own costed path. Positive
same-frame counts do not identify a copy's caller. This narrows the mechanism's
scope without selecting an implementation or predicting elapsed saving.

Both review axes found evidence-retention gaps in the initial diagnostic. Early
selection failures, preparation dependency hashes and cache-cleanup failures are
now retained; focused re-review has no remaining findings. An invalid selection
fails before browser launch with zero completed cases and a retained error.
Its first attempt lacks an early runner fingerprint; that historical limitation
is retained, and the final rejection records a verified fingerprint. The final
full trace retains its exact source snapshot from before this reporting-only repair.
The [routing evidence](./composition-ce6p-route-map-results.json) retains the
actual trace, sources, summaries, smoke and failed attempts. Native elapsed
attribution and immutable particle brackets still await a quiet host. Observing
a natural quiet interval is allowed; it must not be described as a coordinated
or reserved window. Echo retention still awaits its explicit compatibility decision.
The native timing guard was exercised against the busy host and refused before
browser launch, retaining five competing workloads and zero measured cases.
This verifies its protective refusal and supplies no elapsed cost or budget.

### Blocked audit (2026-10-06)

The first two goal turns completed the repeated 119-case GPU trace and the
single/batched paint scope analysis while verifying the live competing gate.
The third turn revalidated the same unanswered compatibility and messaging
questions and the active `pnpm check` process (`26190`), now on the frozen-baseline
worker (`65038`). No CE6-P elapsed run was started. The next meaningful production
step requires the Stage 1 cost gate; echo retention requires the Stage 2 decision.
More equivalent untimed traces would not supply those missing requirements.

The three-turn blocker audit is satisfied, and the goal tool reports **blocked**.
This is an input/host-state impasse with the full objective preserved. The scoped
particle candidate and echo proposal remain reviewable; no final full gate,
strict acceptance closure or milestone completion is claimed. The
[progress evidence](./composition-ce6p-disjoint-paints-results.json) retains the
live process observation, audit and unchanged production echo hashes.

To resume the prepared echo work, explicitly authorize the tested versioned
correction while preserving legacy references, tiers and unrelated exact outputs.
For timings, a verified natural quiet interval or explicit authorization to
coordinate the named main/PR42 chats is needed. Earlier automatic approval review
rejected those messages for missing trusted direct user authorization; no retry
was made during these goal turns. Neither condition changes acceptance.

### Owner-authorized resumption — 2026-10-06

The owner explicitly approved both the tested echo correction with a renderer
version bump and quiet-window messages to “Implement composition engine plan”
and “Review PR#42”, and resumed CE6-P until complete. The three production files
were checked against the proposal parent and proposed SHA-256 values before
retention, then formatted; renderer 0.42.0 includes this scoped correction and
the previously reviewed disjoint particle candidate. Legacy references, tiers
and workload methods remain unchanged. Initial `pnpm build` passes.

Both named chats acknowledged the hold. PR #42 completed its existing local
gate; the observer then verified three continuous quiet minutes. Production
correctness, seeks, exports and selected profile agreement pass. The measured
window is complete; no strict timing closure or full acceptance is claimed.
The goal tool records the earlier blocked audit; direct owner resumption permits
work on the same unchanged objective without replacing or shrinking it.

### Retained echo correctness — 2026-10-06

Renderer 0.42.0 passes the six targeted pinned timelines: 1,440 forward frames
and 1,560 reverse/random/repeated seeks. The four inherited failing cases pass
960 frames and 1,040 seeks under the original near tier: base echo is exact,
and the other three have maximum delta two. Zero decay passes, and every one
of the 240 echo-disabled frames preserves 633138b bytes. Ending source/asset
fingerprints and the actual browser renderer version are verified.

Hardware passes all 1,560 seeks and preserves its disabled control bytes.
Hardware-versus-legacy near failures are retained with exit one, including the
unchanged disabled control; required direct pinned/hardware perceptual agreement
passes all 12 prescribed sampled frame pairs (minimum PSNR 53.665 dB, SSIM
0.999562). This is sampled agreement, not a complete hardware family audit.
Four corrected variants each export two byte-identical 240-frame MP4s with
relocated assets, overwrite protection and actual browser version checks.
Their incidental export elapsed metrics are excluded from performance claims.
TypeScript compilation, lint, all 1,600 unit tests and the full WebGL suite pass.
The first suite invocation used shell Node 24; a separate required Node 22 run
also passes. Both are retained with their actual toolchains.

Both review axes are clear after provenance/error-retention repairs. The first
full echo runner lacked final asset/source checks and actual runtime assertions;
repaired complete runs pass those guards. An intentional invalid-baseline startup
attempt retains a failing exit and zero cases. References and tiers are unchanged.
[Targeted production evidence](./composition-ce6p-echo-diagnosis-results.json)
does not replace unchanged strict audits or the final full local gate.

Five original Stage 1 representatives now have actual adapter/legacy payloads
and an untimed browser preflight: particles, glow, story instances, story stagger
and typography uniform appearance. Preparation preserves original composition
hashes and verifies compiler/helper/input fingerprints. An initial preparer
naming collision and denied sandbox font-server startup are retained before the
repaired preparation. Cost probes use six alternating uninstrumented/instrumented
legacy/WebGL orders, explicit barrier probes, nested inclusive upload/paint/read
costs, per-backend pixel hashes and whole-session competing-workload rejection.
The representative elapsed sessions are retained below, including the initial
hardware byte-stability failure and the repaired complete warmup. All original
performance requirements stay open.

### Quiet-window cost decisions — 2026-10-06

Both native attribution sessions and all eight paired particle B/C/C/B sessions
finish without detected competing verification. The native diagnostic Canvas
half-budgets are 0.615 ms pinned and 0.460 ms hardware; even removing all measured
render and barrier time leaves owned reads of 0.720 and 0.780 ms. Known-clear
paint/copy removal alone therefore fails its Stage 1 budget gate. These selected
observations are not universal lower bounds; a further candidate must also
reduce transport or independent-byte return costs under the existing contract.

Pinned base particles improve 1.355× against stable baseline bookends, but both
candidate ratios remain about 3.9× legacy against the 1.25× requirement. Pinned
environment bookends drift 25–27%, so their gain magnitudes are not stable claims.
Hardware base and environment contrasts are 2.170× and 1.776–1.857×; hardware
environment candidates are within 1.25× in this controlled experiment only.
No original strict pinned failure is closed by these selected measurements.

The five family probes now preserve the existing complete untimed forward warmup.
Both warmed profiles pass per-backend byte stability. The initial hardware run
failed a legacy glow hash check; its error and reporting limitations are retained.
Chromium's adaptive Canvas readback behavior is a plausible conditioning cause,
not a confirmed diagnosis. Instrumented stage times are nested and cannot be
added; these probes do not replace complete family acceptance traversals.

[Cost evidence](./composition-ce6p-cost-results.json) retains raw report hashes,
actual runtime/source fingerprints, failed attempts, controls and drift limits.
The hold was released to “Implement composition engine plan”. Release delivery
to “Review PR#42” failed because that chat had been archived; it has no continuing
active timing hold. No other chat was messaged. Full local verification and
research into a costed ownership/readback mechanism continue.

### Cache identity gate and owned output proposal — 2026-10-06

The reviewed untimed full forward/reverse trace covers 2,030 frame comparisons
across all five selected originals; every traced SHA matches an uninstrumented
same-source preview, with unchanged input/asset/source guards. Post-call cache
inspection distinguishes previously retained keys from repeated unretained
attempts. The initial same-frame counter confused equal numeric frames across
forward and reverse visits; the final trace uses unique visit identities and
finds zero repeated retained-key misses within one visit. Both versions are
retained in the [cost evidence](./composition-ce6p-cost-results.json).

Story instances/stagger and typography uniform have no repeated full-key misses
in their forward traversals; larger placement caches lack a demonstrated reuse
mechanism there. Each commerce product-image revisits 121 previously retained
full states, but preparation alone is too small for its total performance gap.
This narrows the cache hypothesis without predicting all-family behavior.

[Owned-output research](./composition-ce6p-owned-output-research.md) supports one
isolated four-mode native feasibility diagnostic: baseline, known-clear paint,
fresh independent output, and both mechanisms. A fresh exact-clear output may
avoid the cached snapshot's full copy but still allocates and fills 8.294 MB;
V8's existing slice already uses a native bulk copy, so a speedup is unproven.
The combined mechanism has a tight cost budget and must be measured before
production retention. Its first byte/ownership preflight covers only the fixed
native fixture. General eligibility, fallback/background and cache-transition
proofs remain required before any production implementation. The current 0.42.0
full local gate is running; no simultaneous elapsed diagnostic is allowed.

The isolated proposal passes both profiles: 129 deterministic baseline visits,
387 exact overlay comparisons and 387 old-buffer mutation/repeated-read checks
per profile. Preflight helper/node sources are retained with matching raw hashes.
Subsequent timing-only repairs move hashing after each traversal, retain partial
metrics without byte arrays, include allocate-plus-fill/slice controls and
distinguish requested work from actual elapsed start. Reviews are clear. Timing
still waits for the full local gate and quiet host; the proposed reconstruction
is not retained in production and its general eligibility remains unproven.

The main chat acknowledged a second authorized hold for this prepared comparison.
Its already-running family candidate and native depth jobs finish normally; no
new verification starts there. This branch's full local 0.42.0 gate also finishes
first. A read-only observer samples the verification-process predicate every
five seconds and requires three quiet minutes before dispatching the two native
profiles serially. Each diagnostic independently rejects detected startup or
session overlap. Source fingerprints remain fixed; no other workload is stopped.

### Source follow-ups while the full gate runs — 2026-10-06

The [owned-output research](./composition-ce6p-owned-output-research.md) now
resolves the pinned V8 typed-copy constructor and pinned Skia simple-solid
raster chain. A constructor's no-initialization request is real, but upstream
allocator evidence suggests that an 8.294 MB direct-mapped allocation can already
avoid a separate zeroing pass. That is no-go for assuming a full-frame physical
write saving. The exact pinned Skia sources support separate byte premultiplication
and 24.8 rectangle coverage; the actual prepared bytes, shipped overrides and
hardware raster route still need proof. No direct-solid candidate is selected.

Eleven small broader controls of the existing known-clear/fresh-read overlays
are prepared and independently reviewed, with untimed forward/reverse/selected
seeks, full byte comparisons, mutation/reread and later-render ownership checks.
They are **not yet run**. Each preview remains in its mode; changing root
backgrounds, same-owner fresh-to-cached transitions and full family coverage
remain pending. The armed native cost diagnostic is unchanged.

A [conditional blur scheduling seam](./composition-ce6p-resolution-research.md#conditional-exact-blur-scheduling-seam-2026-10-06)
is documented and reviewed as a future source hypothesis: fuse the final float
box-sum materialization with its existing integer divide, preserving the RGBA8
axis boundary. No implementation or timing is selected before the native budget
decision and an attributable saving bound. The full local gate continues on
unchanged renderer 0.42.0; these research/proof preparations claim no closure.

### Pre-run Canvas-reference guard repair — 2026-10-06

Before any elapsed session, review found that the prepared native gate compared
its timed Canvas frames with hashes seeded only from the production WebGL
preview. Hardware Canvas may legitimately differ under the existing pixel
policy; this cost guard would otherwise conflate reference determinism with
cross-backend exact equality. Only the owned waiting Python observer was stopped
(PID 85201). Its full observation record, cancellation reason and source snapshots
remain retained. No full local gate or other chat process was controlled.

The repaired diagnostic seeds separate Canvas frame hashes from its first
measured traversal and requires every later Canvas traversal to preserve them.
The three WebGL overlays still require exact production WebGL baseline bytes.
Any Canvas backend instability remains a retained failure. This repair changes
no acceptance threshold, renderer, flags, workload, warm/measured frame window
or policy. Repaired dispatch/report filenames distinguish the attempts. A
same-mechanism attribution helper is also prepared (not executed) in case the
combined result misses: ordinary/instrumented and one-pixel barrier traversals
would separate queued preparation from the remaining owned-output cost.

### Retained renderer 0.42.0 full local gate — 2026-10-06

`pnpm check` exits zero with verified Node 22.23.1 and pnpm 10.29.3: 1,600 unit,
46 runtime, 139 integration, 14 depth, every browser group, and 176 unchanged
frozen baselines / 36,061 frames. Runtime sources were not changed during this
run; the completion hashes are retained in the cost/echo records, and echo
sources still match their earlier guarded production proof. The complete ignored
log is retained by SHA-256. Subsequent documentation receives a targeted format
check. The full gate verifies this retained slice; it does not replace strict
WebGL timing acceptance or establish CE6-P completion.

### Native owned-output decision — 2026-10-06

Both repaired serial profile diagnostics exit zero with Node 22.23.1, unchanged
host/helper/runtime/lockfile hashes and no detected competing verification. The
observer records three continuous quiet minutes after the final documentation
formatter finished. Full fixed-native preflight preserves 129 deterministic
baseline visits, 387 overlay frame comparisons and 387 caller-mutation/reread
checks per profile. Timed GPU hashes remain exact; Canvas's independently seeded
frame hashes remain stable. Diagnostic completion does **not** mean timing
acceptance passes. All raw samples, outliers, sources, logs and hashes are retained
in the [cost record](./composition-ce6p-cost-results.json).

Render-mode values are descriptive means of eight alternating cycle medians,
each using the preserved five measured frames. Standalone allocation-control
values average four cycle medians, each from 60 complete operations. Neither
summary replaces the acceptance method:

| Mode/control                         | Pinned ms | Hardware ms |
| ------------------------------------ | --------: | ----------: |
| Matched Canvas                       |    0.7875 |      0.7500 |
| Required half-Canvas                 |   0.39375 |      0.3750 |
| Production WebGL baseline            |    1.4500 |      1.5000 |
| Known-clear paint only               |    1.2750 |      1.4500 |
| Fresh owned read only                |    2.0625 |      1.9250 |
| Both mechanisms                      |    1.7875 |      1.8125 |
| Standalone complete allocate + slice |    0.5000 |      0.5250 |
| Standalone complete allocate + fill  |    0.8500 |      0.9250 |

**Reject the fresh-owned-read candidate.** It regresses total cost on both
profiles. Its allocation-inclusive fill control alone exceeds the measured
native budget by 2.159× / 2.467×, even granting every other operation for free.
Known-clear paint alone also misses. The prepared broader eligibility proof and
same-mechanism attribution remain unexecuted because they cannot rescue this
failed budget argument. No production 0.43 change or direct-solid timing loop
follows. These observations stop this candidate; they are not a universal
physical memory floor or proof that every conceivable compatible design fails.

The second quiet slice was released to **Implement composition engine plan**
after both diagnostics finished. PR42 had already archived before the first
release delivery; it was not unarchived. No other chat was messaged.

### Architectural decision boundary

The retained echo correction and particle gain form a verified, reviewable
0.42.0 slice. CE6-P still requires the original 117 timing failures, no additional
strict misses, unchanged complete pixel/state/seek/export/hardware acceptance,
and native 2×. The full strict 195-case WebGL audit has not been repeated on
0.42.0; its existing failure ledger remains open. A partial PR or a passing
correctness gate is not completion.

The current compatible plan has no selected closure mechanism. Preserve its
contract by default; another compatible candidate needs **new causal evidence**
that removes enough actual work, rather than another copy spelling, a shader
that leaves the disproven owned-output cost intact, or another favorable sample.
The CPU/GPU source investigations describe correctness hypotheses, not a
measured solution.

A different workstream could design GPU-resident preview and a separately
asynchronous export/readback interface. That changes synchronous frame delivery
and the measured boundary; it would need explicit owner authorization and its
own reference, seek, ownership, color and deterministic-export acceptance. It
cannot silently satisfy the existing CE6-P timing requirement. Revising the
native or family performance criteria is a separate explicit owner decision,
not part of the approved echo fix or quiet-window coordination. None of those
contract/backend/policy/criterion changes has been made.
