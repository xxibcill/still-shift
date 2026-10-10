# Still Shift — Active roadmap

**Updated:** 2026-10-09

**Current engineering:** core composition milestones are merged through CE14/CE15
on `main` `bd0197cd`; local production release preparation is recorded.

**Next product proof:** a portable mechanism Short after its missing authoritative
plan and source inputs are restored. The retired corpus is no longer a release requirement.

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
| Composition foundation, adapters and CE13 media          | Core implementation and milestone verification are complete and merged; the release candidate is main bd0197cd.                                          | [Composition tracker](./docs/composition-engine-plan.md#milestone-tracker)                                                                   |
| CE15 output, caching and parallel rendering              | Complete and merged in PR #49; review repairs are integrated on main. The recorded production benchmark reaches 3.408× with identical output.            | [CE15 delivery plan](./docs/composition-ce15-plan.md)                                                                                        |
| CE14 mesh warp and puppet pins                           | Complete and merged in PR #50 with stack, scale, collapse and diagnostic review repairs.                                                                 | [CE14 scope](./docs/composition-engine-plan.md#ce14--mesh-warp-and-puppet-pins)                                                              |
| CE16 soundtrack                                          | Technically complete and merged in PR #33; local opt-in runtime prepared. Human listening and public backend distribution are separate decisions.        | [CE13 completion](./docs/composition-engine-plan.md#ce13-completion-record-2026-10-07)                                                       |
| Story tooling, reusable components and vertical delivery | Implemented foundations available for production proofs.                                                                                                 | [Story tooling](./docs/story-engine-tooling.md), [components](./docs/reusable-components.md), [vertical plan](./docs/vertical-video-plan.md) |
| Existing cinematic, story and commerce studies           | Retained capabilities and regression evidence. Technical fixtures do not establish product or creative acceptance; commerce formats remain Experimental. | [Archived study status](./docs/archive/roadmap-phase-0-2026-10-08.md)                                                                        |

## Now — prepare the npm composition release

CE15 and CE14 completed the approved main implementation lane. The
[npm release plan](./docs/npm-release-plan.md) records the current target: one
`still-shift` package, GPL-3.0-only and a separately installed soundtrack runtime.
The package is technically verified; the [release results](./docs/npm-release-results.json)
record staged software completion, 26 passing final package checks and the
resolved catalog ownership decision. `still-shift@0.1.0` is published as `latest`;
the downloaded npm archive exactly matches the tested release.

1. The owner discarded the retired corpus requirement on 2026-10-09.
   `pnpm check:all` now runs the complete software check and benchmark. Retain
   the archived experiment and its standalone check as historical evidence.
2. Local software verification and clean installed-archive checks are complete
   in stages. The results retain the exact archive checksum and all failed runs
   and reruns; no acceptance threshold was changed.
3. The owner confirmed catalog authorship for GPL-3.0-only distribution and
   published the verified archive. Public registry metadata and archive identity
   are recorded in the release results.

Real-project inputs and visual/listening review remain part of the separate
production workflow proof below.

CE6-P and CE8-L-F retain their recorded deferrals. CE5-X/Q9, CE9-F1 and unscheduled
feature proposals do not become prerequisites by appearing in a planning document.
See the [approved execution sequence](./docs/composition-engine-plan.md#recommended-execution-sequence)
and [npm release procedure](./docs/npm-release-plan.md#local-release-procedure).

## Next — prove one supported production workflow

The next planned application is explanatory mechanism Shorts, starting with the
customer's tape-hook E01. Its named detailed production plan is absent from this
checkout. Restore that authority and its project inputs before claiming the
workflow is ready or starting its production proof. The stage descriptions below
are retained roadmap scope, not a replacement approved implementation plan.
See the [missing-records audit](./docs/production-release-preparation.md#missing-production-proof-records).

| Stage   | Product proof                                                                                                                                                   | Detailed scope                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| MS0–MS1 | Resolve original inputs and deliver one portable E01 project that can be loaded, edited, saved, reopened, rendered and reviewed through the supported workflow. | Baseline audit (source record unavailable), portable E01 (source record unavailable) |
| MS2     | Transfer packs, rigs, camera/annotation recipes and narration-linked timing across three distinct mechanism families.                                           | Reusable authoring (source record unavailable)                                       |
| MS3     | Run the ten-episode pilot and measure authoring effort, repair burden, technical completion and reviewed output quality.                                        | Production pilot (source record unavailable)                                         |

The planned Three.js preparation bridge would feed rendered media for the first
solid-object proof into the existing composition media pipeline. Reuse typography, audio and
export machinery. Native mesh composition requires a demonstrated limitation in
shared depth, transparent interleaving or camera interaction.

The 300-job stress test, explanation-view/native-mesh decision and 30-episode
cohort remain later planned stages behind their existing prerequisites. Evaluate
the pilot before scheduling expansion. Their acceptance checks remain in the
mechanism tracker (source record unavailable).

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

The named authoring-study record is also unavailable in this checkout; restore
its full comparison and evidence requirements before starting the experiment. Automate only repeated friction
shown by the trial, using existing lifecycle tooling and its implementation gates.

## Conditional future investment

These ideas have no assigned start date. Schedule a bounded addition only when a
named production proof exposes a need and existing capabilities are inadequate.

| Candidate                                                | Evidence needed before scheduling                                                                                                                                 | Scope reference                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Native solid geometry and advanced materials/shadows     | A required explanation cannot be represented adequately by the bridge or authored assets. Consolidate overlapping 3D proposals under one recorded scope decision. | Conditional mesh decision (source record unavailable)                                                      |
| Procedural deformation beyond CE14                       | A named shot needs controlled bending that existing poses, paths, rigs or pins cannot provide adequately.                                                         | [Deformation proposal](./docs/composition-engine-plan.md#procedural-deformation)                           |
| Additional recipes, visual templates or commerce formats | Existing treatments cannot express a required explanation; a short proof and materially different reuse justify expansion.                                        | Visual-template study (source record unavailable), [commerce proof](./docs/commerce-real-product-proof.md) |
| Shape refinements and further renderer performance work  | Located production defects or measured bottlenecks justify a scoped task and its cost; recorded owner decisions govern activation.                                | [Composition tracker](./docs/composition-engine-plan.md#milestone-tracker)                                 |

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
