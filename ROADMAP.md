# Still Shift — Active roadmap

**Updated:** 2026-10-08

**Current engineering:** CE15 in progress; CE14 follows under the approved order.

**Next product proof:** a portable mechanism Short after composition completion.

## Product outcome

Produce explanatory videos programmatically with clear visual explanations, low
manual repair and lower total cost per accepted finished minute. Mix animated
stills, text and graphics with supplied video and audio as the explanation needs.
See the [owner-stated product direction](./docs/product-positioning.md).

The composition engine supports this outcome. New work earns its place by solving
a demonstrated production problem. Feature counts and preset catalogs are not
acceptance criteria for the product.

## Core priorities

- One shared composition contract, deterministic evaluation and reliable export.
- Code-driven authoring, narration-cue timing and mixed image/video/audio delivery.
- Reusable components and recipes that transfer to materially different videos.
- Fast previews, scoped repairs, verified cache reuse and portable saved projects.
- Separate evidence for technical validity, explanation, readability, continuous
  playback and listening.

Use the [user guide](./docs/user-guide.md) for available workflows and the
[composition contribution rules](./docs/composition-contributing.md) for new
rendering capabilities. Existing story, cinematic, commerce and depth inputs
remain supported through their documented adapters.

## Current baseline

Implementation, integration and product acceptance are separate states. Detailed
milestone plans own their acceptance checks, branches and completion evidence.
The [development log](./docs/dev-log.md#current-state) records current engineering
activity; a completed milestone branch does not by itself establish delivery on
`main` or creative acceptance.

| Area                                                     | Recorded state                                                                                                                                           | Source                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Composition foundation, adapters and CE13 media          | Implementation and milestone verification complete; consult the tracker and delivery records for integration status.                                     | [Composition tracker](./docs/composition-engine-plan.md#milestone-tracker)                                                                   |
| CE15 output, caching and parallel rendering              | In progress. Focused checkpoints are recorded; aggregate memory, complete cache/statistics coverage, the speed proof and final acceptance remain open.   | [CE15 delivery plan](./docs/composition-ce15-plan.md)                                                                                        |
| CE14 mesh warp and puppet pins                           | Planned after CE15 in the approved main lane.                                                                                                            | [CE14 scope](./docs/composition-engine-plan.md#ce14--mesh-warp-and-puppet-pins)                                                              |
| CE16 soundtrack                                          | Delivered audio work is reused in CE13; reconcile the stale tracker with its acceptance and integration evidence before composition closeout.            | [CE13 completion](./docs/composition-engine-plan.md#ce13-completion-record-2026-10-07)                                                       |
| Story tooling, reusable components and vertical delivery | Implemented foundations available for production proofs.                                                                                                 | [Story tooling](./docs/story-engine-tooling.md), [components](./docs/reusable-components.md), [vertical plan](./docs/vertical-video-plan.md) |
| Existing cinematic, story and commerce studies           | Retained capabilities and regression evidence. Technical fixtures do not establish product or creative acceptance; commerce formats remain Experimental. | [Archived study status](./docs/archive/roadmap-phase-0-2026-10-08.md)                                                                        |

## Now — finish approved composition work

Follow **CE15 → CE14**, then close out the approved composition baseline. This
revision retains that order and each milestone's acceptance requirements.

1. Complete CE15's remaining implementation, parity, lifecycle and memory checks.
   Prove the required two-minute one-worker/four-worker export comparison with
   identical output and at least 3× speedup under the same measured conditions.
2. Complete CE14 against its existing scope and acceptance checks.
3. Record the integrated baseline, versions, required local gate results and
   remaining limitations. Reconcile CE16's tracker with the delivered evidence.

CE6-P and CE8-L-F retain their recorded deferrals. CE5-X/Q9, CE9-F1 and unscheduled
feature proposals do not become prerequisites by appearing in a planning document.
See the [approved execution sequence](./docs/composition-engine-plan.md#recommended-execution-sequence)
and [composition completion gate](./docs/mechanism-shorts-production-plan.md#composition-completion-gate).

## Next — prove one supported production workflow

The next planned application is explanatory mechanism Shorts, starting with the
customer's tape-hook E01. Implementation starts after the composition completion
gate. The [mechanism production plan](./docs/mechanism-shorts-production-plan.md)
owns detailed requirements and acceptance; this roadmap does not start a
production or publication run.

| Stage   | Product proof                                                                                                                                                   | Detailed scope                                                                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MS0–MS1 | Resolve original inputs and deliver one portable E01 project that can be loaded, edited, saved, reopened, rendered and reviewed through the supported workflow. | [Baseline audit](./docs/mechanism-shorts-production-plan.md#ms0-baseline-and-dependency-audit), [portable E01](./docs/mechanism-shorts-production-plan.md#ms1-supported-bridge-and-portable-e01) |
| MS2     | Transfer packs, rigs, camera/annotation recipes and narration-linked timing across three distinct mechanism families.                                           | [Reusable authoring](./docs/mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring)                                                                                   |
| MS3     | Run the ten-episode pilot and measure authoring effort, repair burden, technical completion and reviewed output quality.                                        | [Production pilot](./docs/mechanism-shorts-production-plan.md#ms3-production-lifecycle-and-ten-episode-pilot)                                                                                    |

Use the supported Three.js preparation bridge for the first solid-object proof,
feeding the existing composition media pipeline. Reuse typography, audio and
export machinery. Native mesh composition requires a demonstrated limitation in
shared depth, transparent interleaving or camera interaction.

The 300-job stress test, explanation-view/native-mesh decision and 30-episode
cohort remain later planned stages behind their existing prerequisites. Evaluate
the pilot before scheduling expansion. Their acceptance checks remain in the
[mechanism tracker](./docs/mechanism-shorts-production-plan.md#milestone-tracker).

## One bounded authoring experiment

Trial explanation rehearsal before polish, focused craft guidance and examples
annotated by explanatory purpose on one approximately 30-second passage. Keep
facts, artwork, narration and visual treatment comparable. Use existing tools
for contextual inspection and a manual project summary.

Allow one preparation session and at most two repair cycles per attempt. Record
authoring time, repairs, render work and available token data; review explanation,
readability, continuous playback, listening and technical validity separately.
Retain practices that improve the result without loss of meaning or quality.
One passage establishes feasibility, not broad productivity claims.

The [authoring study](./docs/veymelo-lessons-for-still-shift.md#a-bounded-first-experiment)
owns the full comparison and evidence requirements. Automate only repeated friction
shown by the trial, using existing lifecycle tooling and its implementation gates.

## Conditional future investment

These ideas have no assigned start date. Schedule a bounded addition only when a
named production proof exposes a need and existing capabilities are inadequate.

| Candidate                                                | Evidence needed before scheduling                                                                                                                                 | Scope reference                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Native solid geometry and advanced materials/shadows     | A required explanation cannot be represented adequately by the bridge or authored assets. Consolidate overlapping 3D proposals under one recorded scope decision. | [Conditional mesh decision](./docs/mechanism-shorts-production-plan.md#ms4b-explanation-views-and-native-mesh-composition)   |
| Procedural deformation beyond CE14                       | A named shot needs controlled bending that existing poses, paths, rigs or pins cannot provide adequately.                                                         | [Deformation proposal](./docs/composition-engine-plan.md#procedural-deformation)                                             |
| Additional recipes, visual templates or commerce formats | Existing treatments cannot express a required explanation; a short proof and materially different reuse justify expansion.                                        | [Visual-template study](./docs/veymelo-video-style-distillation.md), [commerce proof](./docs/commerce-real-product-proof.md) |
| Shape refinements and further renderer performance work  | Located production defects or measured bottlenecks justify a scoped task and its cost; recorded owner decisions govern activation.                                | [Composition tracker](./docs/composition-engine-plan.md#milestone-tracker)                                                   |

## Measures of success

- Accepted explanation and delivery quality across the complete video.
- Active authoring, preparation and repair minutes, including failed attempts.
- Total cost per accepted finished minute, including assets, generation, compute
  and human effort; shared setup and new-family work remain visible.
- First-pass completion and the proportion of complete videos delivered unattended.
- Time to preview and repair, verified reuse and failure/recovery behavior.

Report technical, creative and listening results separately. Treat unavailable
measurements as unavailable. Feature counts, gallery size and token savings are
supporting observations rather than substitutes for finished-video value.

## Archived and removed from active priorities

The owner requested this revision on 2026-10-08. The
[previous Phase 0 roadmap and extensions](./docs/archive/roadmap-phase-0-2026-10-08.md)
are archived with their evidence and unfinished gates. The
[historical implementation plan](./Phase_0_Implementation_Plan.md) retains its
original specifications. The retired corpus remains empty and unfrozen; historical
renders do not establish Phase 0 acceptance. Reopening that experiment requires an
explicit scope decision and representative inputs.

The active roadmap removes the old ten-day schedule, v0.1–v0.14 task ladder,
published S01E01 integration queue, feature-completeness destination, automatic
preset/catalog expansion and parallel planning/review frameworks. Cloud hosting,
HTTP/webhooks, autoscaling, billing/authentication, CDN, collaborative editing,
automatic asset-generation providers and speculative hair/facial/weather effects
are outside active priorities. Existing implementations and regression evidence
remain available; archived proposals are not scheduled commitments.

## Maintenance and verification

Keep this document short. Update the date and current baseline when priorities
change, link detailed evidence, and record superseding scope decisions in the
owning plan. Every proposed addition needs a named production problem, the
smallest useful change, acceptance evidence and a reason to invest now.

Use existing local pnpm commands under [repository instructions](./AGENTS.md).
Documentation-only changes require document checks. Code changes use affected
regressions; run a full `pnpm check` when milestone acceptance requires it, the
owner requests it or broader evidence is invalidated. Explain its reason and
expected cost before starting. Preserve required checks and report focused results
as focused results. GitHub Actions remain prohibited.
