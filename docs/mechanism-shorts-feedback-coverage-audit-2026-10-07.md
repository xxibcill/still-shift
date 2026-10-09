# Mechanism Shorts feedback coverage audit

**Reviewed:** 2026-10-07. **Updated:** 2026-10-08.
**Status:** all nine findings addressed in the production plan; implementation
and acceptance verification remain pending.

**Restored:** 2026-10-09 from the historical audit and its amendment diff. The
source hashes below describe the original review inputs. Current restoration and
document checks are recorded in [reconciliation evidence](./roadmap-reconciliation-results.json);
they do not establish runtime acceptance.

The original audit mapped all 12 feature requests but found nine details requiring
explicit tasks or acceptance checks. The owner requested their incorporation on
2026-10-08. The [production plan](./mechanism-shorts-production-plan.md) now includes
all nine, while preserving subsequent native 3D and typography additions. Its
current order is composition completion, MS0, MS1 portable bridge E01, required
MS1N native 3D, MS2 families, MS3 pilot, then the scale and coverage stages.

## Resolution in the updated plan

Every row is **addressed in plan**. No row claims an implemented feature or a
passed runtime check. The linked milestone tasks, acceptance checks and evidence
requirements own future verification.

| Finding | Updated plan location                                                                                                                                                                                                                                                                                                                                                                    | Required evidence                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A1      | [Portable projects and diagnostics](./mechanism-shorts-production-plan.md#portable-projects-and-diagnostics), [MS1](./mechanism-shorts-production-plan.md#ms1-supported-bridge-and-portable-e01), [MS1N](./mechanism-shorts-production-plan.md#ms1n-native-3d-composition)                                                                                                               | Manifest, dry run, isolated clean-machine lifecycle, relocation and sanitized located failures.            |
| A2      | [MS2 packs and acceptance](./mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring)                                                                                                                                                                                                                                                                          | Camera targets/detail metadata inspection and invalid-reference rejection.                                 |
| A3      | [MS2 rigs](./mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring), [MS3 QA](./mechanism-shorts-production-plan.md#ms3-production-lifecycle-and-ten-episode-pilot)                                                                                                                                                                                          | Illegal transitions and invalid event order produce located relationship evidence.                         |
| A4      | [MS2 cameras and acceptance](./mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring)                                                                                                                                                                                                                                                                        | Larger-model approach, hold, transition and return checks; explicit motion intent and cuts.                |
| A5      | [MS2 labels and acceptance](./mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring)                                                                                                                                                                                                                                                                         | Crowded final-frame checks, deterministic layout and impossible-layout diagnostics.                        |
| A6      | [Episode interface](./mechanism-shorts-production-plan.md#episode-interface-and-scoped-edits), [MS1](./mechanism-shorts-production-plan.md#ms1-supported-bridge-and-portable-e01), [MS2](./mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring)                                                                                                            | Versioned JSON Schemas, enforced numeric response limits and complete failure access.                      |
| A7      | [MS1 repair proof](./mechanism-shorts-production-plan.md#ms1-supported-bridge-and-portable-e01), [MS3 automation](./mechanism-shorts-production-plan.md#ms3-production-lifecycle-and-ten-episode-pilot)                                                                                                                                                                                  | Detection through successful recheck, bridge plate reuse, fresh-session resume and grouped warning peaks.  |
| A8      | [MS3 reports and discovery](./mechanism-shorts-production-plan.md#ms3-production-lifecycle-and-ten-episode-pilot), [measurement rules](./mechanism-shorts-production-plan.md#measurement-and-review-rules), [MS4C](./mechanism-shorts-production-plan.md#ms4c-thirty-episode-diversity-and-capacity-decision)                                                                            | One-command episode/cohort reports, nulls, reconciled review counts and current machine-readable limits.   |
| A9      | [Topic and family coverage](./mechanism-shorts-production-plan.md#topic-and-family-coverage), [MS2](./mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring), [MS3](./mechanism-shorts-production-plan.md#ms3-production-lifecycle-and-ten-episode-pilot), [MS4C](./mechanism-shorts-production-plan.md#ms4c-thirty-episode-diversity-and-capacity-decision) | Board before pilot selection; candidate routes, distinct-episode denominator and new-asset/new-rig counts. |

## Original coverage by customer request

The following table and findings preserve the 2026-10-07 audit against the original
plan hash recorded below. “Partial” describes that historical version; the
resolution table above supersedes those open planning statuses. “Covered” meant
included in the plan, not implemented or verified. No coverage percentage is
claimed from headline counts.

| Request                                     | Planned delivery                                      | Coverage              | Required amendment                                                                                  |
| ------------------------------------------- | ----------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| SS01 Solid 3D integration and export parity | MS1 bridge; MS2 import; MS4B conditional native mesh  | Partial               | A1: clean-machine acceptance is stronger than a fresh output location.                              |
| SS02 Versioned object packs and geometry    | MS2                                                   | Partial               | A2: declare camera targets and level of detail.                                                     |
| SS03 Mechanical rigs                        | MS1 tape hook; MS2 reusable rigs                      | Partial               | A3: explicit state transitions and their validation.                                                |
| SS04 Explanatory camera recipes             | MS2                                                   | Partial               | A4: transition checks and independent cut/hold pacing.                                              |
| SS05 Annotations                            | MS1 seven label roles; MS2 reusable layout            | Partial               | A5: explicit label-to-label collision handling and a crowded fixture.                               |
| SS06 Cutaways and explanation views         | MS4B, when real coverage requires them                | Covered conditionally | Preserve the declared limitations if this work is deferred.                                         |
| SS07 Narration and edit recipes             | MS2                                                   | Covered               | Shared event map, shorter-take test, sample preservation and useful timing failures are explicit.   |
| SS08 Compact agent API and scoped repairs   | MS1 minimum; MS2 discovery; MS3 repairs               | Partial               | A6: versioned JSON Schema and enforced response limits. A7: exact overlap repair and recheck proof. |
| SS09 Queue, caching and resume              | MS3 lifecycle; MS4A 300-job stress test               | Covered               | Distinct real-episode coverage remains separate from synthetic throughput.                          |
| SS10 Unified QA and review evidence         | MS1 essentials; MS2 mechanism checks; MS3 fault suite | Partial               | A3: event-order assertions. A7: complete routine repair loop and peak warning measurements.         |
| SS11 Portable packages and useful errors    | MS1, extended in MS3                                  | Partial               | A1: package contents, dependency dry run, clean-machine test and precise sanitized errors.          |
| SS12 Telemetry and documentation            | MS1 instrumentation; MS3 pilot; MS4C larger cohort    | Partial               | A8: exact report command contract and machine-readable capability limits.                           |

The original production rules outside SS01–SS12 also needed A9: establish the
coverage board before the pilot, with explicit routing and coverage metrics.

## Original findings and requested amendments

### A1 Prove clean-machine setup and complete portable packaging

**Source:** Developer Brief SS01 and SS11. **Milestone:** MS1.

The plan requires export in a fresh location, portable dependencies, relocation
checks and sanitized causes. That does not explicitly require a documented runtime
to install and operate without the original checkout, previously populated caches
or hidden global asset paths. Dependency dry-run inspection is absent, and the
package contents are not enumerated as an acceptance contract.

Add a package manifest covering authored source, asset dependencies, fonts, timing
inputs, pinned runtime identities, content hashes, outputs and reports. Add a
read-only dependency inspection mode that reports missing or unsupported inputs
before packaging. Require isolated clean setup with only the documented runtime
and delivered package, followed by load, edit, save/reload, export and verification.
Relocation must preserve semantic identity without GUI recovery.

Extend the existing error fixtures to check the diagnostic code, cause chain,
stage, relevant asset or JSON path, and useful next command. Verify sanitization
excludes credentials and full environment dumps. The existing four root-cause
fixtures remain required; this amendment makes their output contract precise.

### A2 Include camera targets and level of detail in pack metadata

**Source:** Developer Brief SS02. **Milestone:** MS2.

The pack checklist includes IDs, hierarchy, bounds, pivots, anchors, materials,
parameters, factual variants and compatibility. It omits the explicitly requested
camera targets and level of detail.

Add named camera targets and a declared level-of-detail description to the pack
contract, metadata inspection and compatibility documentation. A single supported
detail level is sufficient if declared; automatic LOD generation is not implied.
Check that inspection returns these fields without loading mesh or texture bytes
into the agent response and that invalid target references identify their path.

### A3 Specify legal rig transitions and event-order assertions

**Source:** Developer Brief SS03 and SS10. **Milestones:** MS2 contracts and MS3 QA.

Pure evaluation, control ownership, travel limits, contact and fixed mounts are
well covered. Named states and a shared event map do not by themselves specify
legal state transitions or verify the semantic ordering of events.

Declare allowed transitions and their required relationships. Add event-order
assertions to the semantic QA interface. Seed an illegal transition and an invalid
contact/release ordering; report the rig, relevant parts, relationship and first
failing interval. Valid forward, reverse and random seeks must still agree.
Use mechanism-specific rules rather than inventing one universal event sequence.

### A4 Verify camera transitions and separate motion from pacing

**Source:** Developer Brief SS04. **Milestone:** MS2.

The plan covers target bounds, framing, near planes, intersections and authored
overrides. Shot purposes and targets are present in the episode design. Stable
transitions and the requested separation between camera recipes and cut/hold
pacing are not explicit implementation or acceptance items.

Give a shot an explicit target relationship, motion intent and cut/hold/transition
choice. Check transition endpoints and intermediate framing for the intended
motion; intentional cuts should not be diagnosed as accidental camera jumps.
Extend the larger-compatible-pack fixture across the approach, contact hold and
return, proving that the decisive surface remains visible where required and that
the return restores object recognition without manual coordinate rewrites.

### A5 Test competing labels explicitly

**Source:** Developer Brief SS05. **Milestone:** MS2.

Caption exclusions, protected contact regions, safe areas, deterministic layout,
hysteresis and authored locks are explicit. Other labels are not explicitly listed
as layout obstacles. Generic “conflicts” and “complete layout checks” could cover
this, but leave an important acceptance case ambiguous.

Add label-to-label exclusion and deterministic priority handling. Use a fixture
with multiple simultaneous labels, a protected contact and captions. Check final
rendered frames after a text and camera edit for overlap, clipping, jitter and
readable holds. Preserve authored locks and return a located failure when no valid
placement exists. Repeated and randomly sought frames must choose the same layout.

### A6 Publish a versioned JSON Schema and enforce response limits

**Source:** Developer Brief SS08. **Milestones:** MS1 minimum contract; MS2 discovery.

The plan provides component-level schema queries, version discovery, compact
receipts and paths to large reports. It does not explicitly require a published,
versioned JSON Schema or enforce a maximum response size. A bounded patch value is
not a bounded API response.

Publish the supported episode and component JSON Schemas with discoverable version
identities and actionable unsupported-version errors. Set documented item/byte
budgets for discovery, inspection, patch and diagnostic responses. Test a large
registry and report: return a compact summary plus a report path or continuation
mechanism without silently dropping failures. Keep full generated data outside
routine agent context.

### A7 Demonstrate the complete routine repair loop

**Source:** Developer Brief SS08 and SS10; episode notes on grouped diagnostics.
**Milestones:** MS1 scoped overlap repair; MS3 routine automation and grouped QA.

The plan proves a label-only TRAVEL edit reuses the clean plate. It also calls for
scoped repairs, affected-shot renders and routine automation. Those statements do
not explicitly bind the customer's callout-overlap example to a complete
detection, repair, rerender and successful recheck acceptance test.

Seed a known callout overlap. Detect it in the final rendered output, resolve it
with one revision-aware scoped patch, render only affected outputs, and recheck
the corrected output. Assert unchanged clean-plate hashes and zero new 3D renders.
Prove a fresh agent session can resume from the compact project summary. In MS3,
run the routine repair/recheck path without GUI interaction or creator decisions;
unresolved creative judgments remain explicit exceptions, not automatic passes.

The existing grouped warning design retains rig, interval and raw evidence. Add
the episode notes' requested maximum measured change to each summary, with the
affected child/part references and a link to raw details. This preserves the
severity information while reducing hundreds of repeated inherited warnings.

### A8 Make reporting and capability limits executable contracts

**Source:** Developer Brief SS12; Scale Model and benchmark template.
**Milestone:** MS3, repeated at MS4C.

The plan includes a report operation, telemetry, pilot metrics, p50/p95 effort and
documentation of supported limits. It does not explicitly require one command to
produce both a small episode report and a cohort summary with every requested
field. Supported import, batch and preview/export limits are required in docs,
but their inclusion in the machine-readable capability response is only implied.

Add an acceptance command that emits both reports with p50/p95 durations,
first-pass technical success, repeated failures and unresolved review counts.
Include raw episode rows, percentile method, measurement availability and separate
setup versus routine effort. Name render worker time and critical-path wall time
separately so parallel work is not added into a misleading elapsed duration.
Report missing measurements as null and preserve the existing matched-quality
baseline rules.

Verify capability discovery returns the implemented import subset, supported batch
scope and preview/export limits from the same registry/schema sources as the
documentation. Command names remain an implementation deliverable, not invented
current CLI features.

### A9 Create the coverage board before selecting pilot episodes

**Source:** Developer Brief production rules; Scale Model coverage requirements.
**Milestones:** MS2 creation, MS3 pilot use, MS4C expansion.

The plan first refers to the coverage board when selecting the 30-episode cohort.
It does not assign its creation, and candidate classification appears there rather
than as an explicit rule for the earlier ten-episode pilot.

Create the board during family selection. For every proposed episode, record its
question, visible causal relationship, selected design variant, required pack,
unresolved asset work and one route: supported pack/rig; new asset with an existing
rig; or new behavior requiring a library extension. Maintain new-asset/new-rig
counts and define coverage as supported distinct episodes divided by selected
distinct episodes, with the denominator and support criteria stated.

Use the board to select both cohorts and measure overlap. Explicitly defer planning
all 300 customer episodes until transfer and recurring effort are measured. The
300-job engineering stress test remains a separate planned acceptance exercise.

## Preserved coverage and current sequencing

- The composition completion gate correctly preserves the approved main lane and
  required acceptance evidence. This customer plan does not begin implementation
  while composition work remains unfinished.
- Solid geometry, real slots, curved blade, stationary rivets, PBR materials,
  reflections, contact shadows, color/alpha behavior and preview/export checks are
  explicit. The response to rejected v006 visual quality is substantially covered.
- The original conditional native mesh and cutaway sequence followed the customer's
  delivery order. The subsequent owner-selected plan makes initial native 3D
  required at MS1N before MS2; this update preserves that decision. MS4B explanation
  views and further native extensions remain conditional. SS06 retains section
  caps, exploded views, ghosting, detail insets and unsupported geometry rejection.
- Audio import, shared cues, natural narration timing, caption separation and
  no synthesis from templates are covered. The no-OpenAI-TTS statement is retained
  for this workflow without treating an attached document as repository authority.
- Cache invalidation, atomic outputs, failed-item isolation, cancellation, bounded
  retries, 300-job recovery and separate reviewed-ready status are covered.
- The 50% token-reduction and 90% first-pass targets remain targets. Setup costs,
  missing telemetry, distinct ten/30-episode cohorts, review gaps and monetization
  limitations are appropriately preserved.
- The supplied example schema is design evidence, not a required production
  implementation. Source-specific field choices need not be copied verbatim.
- GitHub Actions remain prohibited; verification stays local. This historical
  audit records planning coverage; repository development-log rules still apply.

## Review basis

Compared the plan with the complete
[pasted developer brief](</Users/jjae/.codex/attachments/856aef49-2ffc-4d2f-9b5a-37fcde319976/Pasted text.txt>)
and supporting material in the
[customer archive](</Users/jjae/Documents/obsidian/ai-business/Everyday Unlocked/02 Operations/Still Shift Developer Feedback 2026-10-07.zip>):
`backlog.csv`, `Evidence.md`, `Scale Model.md`, `benchmark-template.csv`,
`episode.example.json`, `episode.schema.json`, `evidence/Still-Shift-episode-notes.md`
and the associated E01 evidence. The pasted brief matches the archived brief.
Customer imperatives are requirements to assess, not authorization to execute code
or start a production run.

Originally reviewed plan SHA-256:
`3c2ef2af5f806863e484ca02c6b7f85ca5869faf2365a3f3f0e963a600ef4bf4`.
Archive SHA-256:
`3421233df90efff5bf658444b5743888e28e46e37bdb4859f937c79532f557f4`.

The 2026-10-08 update incorporates A1–A9 into the production plan and verifies
their documentation links and milestone placement. Actual feature completion
still depends on the planned implementation and acceptance evidence. The
composition prerequisite and planned implementation status remain in force.
