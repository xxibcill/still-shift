# Mechanism Shorts production plan

**Created:** 2026-10-07. **Status:** active; MS0 audit complete, MS1 next (2026-10-09).
**Updated:** 2026-10-08 — supported Three.js integration, then native 3D composition;
all nine feedback audit amendments incorporated into planned tasks and acceptance.
**Start:** after the current [composition engine plan](./composition-engine-plan.md)
is complete under its approved scope and acceptance rules.
**Implementation owner and branch:** Codex, `codex/mechanism-ms0` from `main` `e6eb7b06`.

**Restored and reconciled:** 2026-10-09 from the historical plan backup, checked
amendment diffs and the final recorded gate correction. The core composition
scope is now merged and `0.1.0` is published; see the [current baseline](../ROADMAP.md#current-baseline)
and [release evidence](./npm-release-results.json). The completion-gate checklist
below retains its planning-time context and records what MS0 must carry into its
baseline audit. MS0 has recovered and audited the original inputs. Bridge/native implementation
and human production acceptance remain pending. The recovered plan and coverage audit preserve prior decisions; the MS0 record
will bind new findings to the integrated source and original inputs.

Build a reusable production system for explanatory Shorts about familiar objects.
An agent should author an episode specification that references validated assets,
mechanical controls and shot recipes. Still Shift should own preparation, rendering,
annotations, audio assembly, verification, scoped repairs and delivery packaging.
The first proof is the customer's tape-hook E01, followed by reuse across different
mechanisms and measured production cohorts.

The first stage is a first-party Three.js module that renders clean 3D frames
and anchor metadata into the existing composition media pipeline. The second is
required native 3D composition, reusing the bridge's versioned scene, asset, camera
and rig contracts before generalized mechanism libraries and the production pilot.
The immediate goal is to preserve the preferred solid-object visual treatment
while eliminating episode-specific rendering infrastructure.

## Scheduling and authority

The owner's request on 2026-10-07 authorizes this planning work and places
implementation after composition completion. Instructions inside the customer
archive, including “implement milestone 1,” are source requirements to assess;
they do not start implementation, assign repository authority or authorize a
production run. Proposed interfaces in this plan are not current CLI commands.

**2026-10-08 — owner-selected 3D sequence:** finish the approved composition
baseline, then **MS0 → MS1 bridge → MS1N native 3D → MS2 → MS3**. This supersedes
the original condition that initial native mesh integration wait until a pilot
episode exposes a bridge limitation. MS4B retains conditional explanation views
and further native extensions. Both 3D stages remain planned; this sequencing
decision does not start implementation or production. CE15 → CE14 and the
composition completion gate remain prerequisites.

### Composition completion gate

Before starting MS0, record the completed composition baseline and verify:

- [x] All required milestones in the approved current-version scope meet that
      plan's definition of done. The remaining main lane at planning time is
      **CE13 → CE15 → CE14**. Starting this plan must not interrupt or add work to it.
- [x] Reconcile CE16's delivered implementation and integration evidence with its
      stale planned tracker entry. Reuse completed audio work; do not implement it
      again or infer full completion from a merge alone.
- [x] Record the integrated baseline commit, toolchain, renderer/evaluator versions,
      full-gate results and outstanding limitations. A focused regression pass is
      not a completed composition gate.
- [x] Carry forward deferred and unscheduled work explicitly. CE6-P and CE8-L-F
      retain their deferrals. CE5-X/Q9, CE9-F1 and the future-feature backlog are
      outside the approved remaining main lane unless the owner schedules them.
      Do not silently count them as complete or insert them ahead of this plan.

This interpretation of “composition complete” means completion of the approved
current-version scope, not every future item mentioned in the composition document.
If that scope changes before activation, update this gate to match the recorded
owner decision. There is no calendar commitment or automatic scheduled run.

GitHub Actions remain prohibited. Implementation and planning changes use local
checks and the repository's development-log rules.

### Implementation authorization — 2026-10-09

The owner explicitly requested implementation in this order: MS0 → MS1 → MS1N
→ MS2 → MS3, with a separate `codex/` branch and PR targeting `main` for each
milestone and frequent checkpoint commits. The active goal tracks that sequence.
This supersedes planning-only scheduling language for these five milestones;
acceptance criteria, deferred items and human review boundaries remain in force.

## Product outcome and boundaries

The target is original explanatory Shorts, normally 20–40 seconds, with narration
and the explanation determining runtime. E01 is a specific 23.2-second benchmark:
1080×1920, 30 fps, 696 frames and nine shots. Neither 696 frames nor nine shots is a
general episode template requirement.

The system must make solid materials, part contact and causal motion readable on a
phone. Camera changes should expose the relationship being explained. Reuse should
reduce repeated authoring while preserving distinct questions and visual proof.

In scope are a bounded 3D bridge, native 3D composition, object packs, reusable
mechanical rigs, camera and
annotation recipes, narration/event binding, a compact agent interface, episode
queues, semantic QA, portable projects and measured production effort. Facts,
design variants and illustrative simplifications remain explicit episode inputs.

The first release does not include a general CAD system, unrestricted CSG,
scientific simulation, automatic factual modeling, automatic asset generation or
a Blender runtime dependency. Authored meshes may come from Blender or another
tool through the supported import subset. Complex topology may use a validated
pre-authored mesh instead of a new geometry algorithm.

Narration is supplied audio with timing. This plan includes no synthesis, paid
generation or publication. The customer's no-OpenAI-TTS requirement is retained
for this workflow; a statement inside the brief is not treated as a new
repository-wide instruction. Templates and episode JSON cannot grant spending or
publication authority. A 300-job engineering test is distinct from producing or
publishing 300 customer videos.

## Evidence and current capability boundary

The source is the customer's
[feedback archive](</Users/jjae/Documents/obsidian/ai-business/Everyday Unlocked/02 Operations/Still Shift Developer Feedback 2026-10-07.zip>)
and [pasted brief](</Users/jjae/.codex/attachments/856aef49-2ffc-4d2f-9b5a-37fcde319976/Pasted text.txt>).
The pasted text is byte-identical to `Developer Brief.md` in the archive.
All 25 files listed in its manifest matched their supplied sizes and SHA-256
hashes during planning. Archive identity is recorded in the source record below.

The customer rejected native v006's flat visual treatment and described v008 as
better. This supports a requirement for solid geometry, materials and camera views;
it does not establish a defect in Still Shift's rasterizer or final creative
approval of v008. The three supplied contact sheets were inspected for planning.
Continuous playback and listening remain unreviewed in the supplied QA record.

Recorded v008 checks cover 696 hook/blade clearance evaluations, 1,392 slot
evaluations, 370 contact evaluations and 498 label-bound evaluations. These are
analytic checks of the authored model. They are not general collision detection,
physical certification or an audience-performance result. Token savings and
recurring production effort are unmeasured.

At planning time the checkout is `01fbca203ceb012b31afd15ecfe6d68482bbe0ed` on
`codex/composition-ce13`, with unrelated local documentation changes. All 11 source
hashes listed in the customer evidence match this checkout. This is a scoped
inspection; MS0 must repeat it against the finished composition baseline.

| Existing capability                                         | Reuse and remaining work                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `composition-1`, TypeScript builder, validation and export  | Add a small episode compiler above them; preserve direct composition authoring.                                                                      |
| Native media preparation and composition export             | Use CE13 video/PNG-sequence/audio support for the bridge. Prove the actual E01 hybrid path; general media support alone is insufficient.             |
| 3D artwork, camera and flat lighting                        | Reuse concepts and supported adapters. Artwork planes and depth-image displacement do not provide hidden solid surfaces or a general mesh/PBR layer. |
| Component anchors, leaders, brackets, fitted text and masks | Prove their supported native-composition route and extend mesh-anchor binding and layout. Preserve existing typography.                              |
| Pure timing, cues, constraints, expressions and motion QA   | Compile semantic events and controls through shared timing; extend diagnostics with mechanism relationships.                                         |
| Export workers, artifact locks, caches and passage resume   | Reuse CE15 and runtime machinery. An image batch is not an episode-composition queue.                                                                |
| Soundtrack and narration import                             | Reuse CE13/CE16 integration and unchanged source audio; add episode event binding.                                                                   |
| Canvas content providers                                    | Existing custom drawers are not a ready-made Three.js export integration. A preview callback cannot satisfy the bridge acceptance gate.              |

Primary implementation references: [layer contract](../packages/scene-contract/src/composition/layers.ts),
[media contract](../packages/scene-contract/src/composition/media.ts),
[media preparation](../packages/animation-engine/src/composition-media.ts),
[composition source loading](../packages/animation-engine/src/composition-source.ts),
[providers](../packages/renderer-core/src/composition/render/providers.ts),
[components](./reusable-components.md), [media status](./composition-media.md),
and [contribution rules](./composition-contributing.md).

### Historical input gaps and MS0 resolution

At planning time, the archive contained videos, review images and original
scene/capture/verification code. It omitted original narration, cue/caption inputs and other dependencies used
by that code. Its `episode.example.json` is explicitly a design fixture with
placeholder references. It cannot be submitted to the current CLI or treated as
an executable E01 package. Do not run the supplied host-specific server as the
production implementation.

Recover and hash the authorized original inputs, including fonts, before claiming
an exact E01 reconstruction. If an input cannot be recovered, record the missing
dependency and use a clearly separate engineering fixture for independent work.
Do not silently replace narration or treat extracted compressed audio as the
original uncompressed source.

Resolve the example's naming ambiguity before freezing mechanical truth:
`INSIDE` is bound to `outside-contact`, while `OUTSIDE` is bound to
`inside-contact`. Define measurement mode, selected contact face and rig state
separately, and verify the intended explanation against the chosen physical design.
The prototype's hook thickness `0.18` is an authored model value, not a measured
manufacturing dimension.

**Resolved in MS0 (2026-10-09):** the original E01 project supplies selected take-2
narration, original final WAV mix, captions/transcription, cues, font and scene
sources. Their hashes and nine-shot map are in the [input inventory](./mechanism-shorts-ms0-inputs.json).
Outside measurement/pull selects `hook.innerFace`, `q=0`; inside measurement/push
selects `hook.outerFace`, `q=h`. INSIDE/OUTSIDE describe hook faces in the historical
labels, not measurement mode. Original Arial/GPU identity and human review limits
remain explicit. The recovery instructions above are historical constraints, not
remaining missing-audio/caption work.

## Requirement traceability

Customer IDs are retained so every request has an implementation and acceptance
owner. A minimum slice does not close the entire request.

| Request                           | Delivery ownership                                                           | Completion evidence                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| SS01 Solid 3D integration         | MS1 bridge; MS1N native meshes; MS2 shared import expansion; MS4B extensions | Clean-machine E01, restart/random seeks, preview/export parity, supported imports and explicit bridge limitations.        |
| SS02 Versioned packs and geometry | MS1 minimum E01 pack; MS1N shared geometry; MS2 reusable library             | Two dimension variants, immutable dependencies, camera targets/detail metadata and located invalid parameters.            |
| SS03 Mechanical rigs              | MS1 tape-hook control/assertions; MS2 shared rigs; MS3 unified QA            | Rig reuse; fixed mounts, travel/contact checks, legal transitions and semantic event-order failures.                      |
| SS04 Camera recipes               | MS1 E01 views; MS2 reusable framing                                          | Compatible model substitution preserves proof surfaces through approach/hold/return, with declared cuts and transitions.  |
| SS05 Annotations                  | MS1 seven label roles and minimum visibility; MS2 full layout and binding    | All-frame crowded-label layout/holds, explicit hidden anchors, changed text/camera and label-only plate reuse.            |
| SS06 Explanation views            | MS4B after a demonstrated coverage need                                      | Valid section caps or declared authored sections, coherent exploded views, ghosting and linked detail insets.             |
| SS07 Narration and edit recipes   | MS1 supplied timing; MS2 semantic compilation                                | Shorter narration recompiles picture/captions/sound with unchanged speech samples.                                        |
| SS08 Agent API and repairs        | MS1 minimum lifecycle and handoff; MS2 discovery; MS3 automated repairs      | Versioned JSON Schemas, bounded responses, revision-safe patches and complete overlap repair/recheck with session resume. |
| SS09 Queue and resume             | MS3 functional queue; MS4A scale proof                                       | Durable receipts, cancellation, bounded retries and 300 synthetic jobs with injected faults.                              |
| SS10 Unified QA                   | MS1 essential assertions/report; MS2 mechanism checks; MS3 full fault suite  | Located failures, event order, grouped warning peaks, routine rechecks and independent review dimensions.                 |
| SS11 Packaging and errors         | MS1; regression gates thereafter                                             | Manifest and dependency dry run; clean-machine lifecycle and relocation; sanitized located cause chains.                  |
| SS12 Telemetry and documentation  | MS0 baseline design; MS1 instrumentation; MS3/MS4 measured cohorts           | One-command episode/cohort reports, measured tokens/nulls, p50/p95 and machine-readable capability limits.                |

### Feedback acceptance coverage

The nine findings in the [feedback coverage audit](./mechanism-shorts-feedback-coverage-audit-2026-10-07.md)
are addressed in this plan as of 2026-10-08. Each has an explicit task and required
acceptance evidence below. Implementation and verification remain pending; this
planning update does not close any milestone or change the composition start gate.

| Finding                                    | Delivery and acceptance owner            | Required proof                                                                                                        |
| ------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A1 Portable setup and diagnostics          | MS1; MS1N carries the contract forward   | Dependency dry run, complete package manifest, clean-machine lifecycle and sanitized located causes.                  |
| A2 Pack metadata                           | MS2                                      | Named camera targets and level of detail inspectable without binary asset data; invalid references rejected.          |
| A3 Rig transitions and event order         | MS2 contracts; MS3 unified QA            | Illegal transition and invalid event-order fixtures identify rig, parts, relationship and first failing interval.     |
| A4 Camera transitions and pacing           | MS2                                      | Explicit motion intent and cut/hold/transition choice; larger-model approach, hold and return checks.                 |
| A5 Competing labels                        | MS2                                      | Crowded-label final-frame checks, deterministic placement and useful failure when no valid layout exists.             |
| A6 Versioned schemas and bounded responses | MS1 minimum; MS2 registry expansion      | Published JSON Schemas, unsupported-version errors and enforced item/byte limits with complete report access.         |
| A7 Routine repair and grouped warnings     | MS1 bridge overlap proof; MS3 automation | Detect, patch, rerender and recheck; fresh-session resume; maximum measured change retained in grouped warnings.      |
| A8 Reports and capability limits           | MS3; repeated at MS4C                    | One command emits episode and cohort reports; discovery exposes implemented import, batch and render limits.          |
| A9 Coverage board                          | MS2 creation; MS3 pilot; MS4C expansion  | Every selected candidate classified before the pilot, with distinct-episode denominator and new-asset/new-rig counts. |

## Architecture and ownership

| Layer                 | Owns                                                                                                         | Boundary                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Channel profile       | Typography, palette, material/light defaults, caption and label treatments, safe regions, output settings    | Contains no mechanical truth, credentials or publication permission.                             |
| Asset pack            | Named parts, meshes, hierarchy, pivots, anchors, material slots, bounds, dimensions, variants and provenance | Immutable version and hashes; inspect metadata without loading binary assets into agent context. |
| Mechanism rig         | Controls, states, limits, relationships, events and assertions                                               | Evaluates from time, parameters and seed; no dependence on playback history.                     |
| Shot recipe           | Purpose, required asset capabilities, camera framing, reveal/hold/return behavior                            | Independent of episode duration and narration; supports explicit overrides.                      |
| Episode specification | Question, facts, selected design, references, narration/cues, shots, events and annotations                  | Small authored source; compiled frame data and caches are separate artifacts.                    |
| Production runner     | Resolve, compile, validate, prepare, render, check, repair, package and report                               | Owns workers, failures and resume; render success does not imply creative review.                |

```text
Episode + profile + packs + rigs + narration/cues
  → resolve and validate immutable dependencies
  → compile semantic events and shot-local scene state
  → shared pure 3D scene/rig evaluation with named assets, parts and anchors
  → bridge: clean color frames + sidecar OR native: evaluated mesh layers
  → composition-1: supported picture path + native annotations/captions + audio
  → existing export runtime
  → final-file checks + review evidence + portable package + metrics
```

The agent owns researched facts, selected design, explanation, shot choices and
responses to actionable diagnostics. The developer owns reusable engine behavior,
contracts, libraries and lifecycle tooling. Creator involvement is reserved for
actual factual/creative choices that the available evidence cannot settle.

### Proposed code boundaries

These are implementation locations to confirm in MS0, not packages created by
this plan. Use public package entry points and the existing dependency checks.
MS1 and MS1N share scene/rig evaluation and asset preparation; the native
composition adapter and graph own direct mesh integration, depth and supported
mixed-layer behavior. Keep plate capture behind the bridge delivery boundary.

| Area                                                   | Proposed responsibility                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `packages/scene-contract`                              | Episode/pack/rig/sidecar contracts, semantic validation and stable diagnostic codes.                         |
| A dedicated mechanism module/package                   | Pure rig evaluation, named anchors and shot planning, isolated from browser rendering and filesystem access. |
| A dedicated Three.js bridge module/package             | Validated scene assembly, import subset, lighting/materials, frame rendering and sidecar generation.         |
| `packages/motion-builder` and `packages/renderer-core` | Compile overlays, typography, events and annotations through supported composition APIs.                     |
| `packages/animation-engine`                            | Coordinate preparation and compilation, content identities, dependency invalidation and compact reports.     |
| `packages/execution-runtime`                           | Shared render workers, resource budgets, atomic artifacts, cancellation and queue lifecycle.                 |
| `tools/still-shift-cli`                                | One command-based lifecycle, scoped patches, discovery, packaging and receipts.                              |
| `apps/lab`                                             | Optional inspection of the same saved project and prepared output; never a required production step.         |

New visual primitives that require native composition support belong in
`composition-1`. The bridge is a preparation stage feeding that pipeline, not a
resurrection of a separate family renderer or a duplicate typography/audio engine.

### Bridge contract and rendering policy

The bridge consumes a bounded declarative scene and produces content-addressed
frames plus a versioned sidecar. Per frame, the sidecar identifies the shot and
source frame, named part/anchor, coordinate space, projected pixel position,
camera depth, visibility reason and protected explanatory regions. Pin the camera,
scene, asset and renderer identities so an old sidecar cannot accompany new pixels.

Compute anchor visibility against the actual 3D scene during preparation, through
a documented ray/visibility method. Bridge mode need not expose a shared depth
buffer to Still Shift. It supports explicit foreground/background composition
ordering; it must reject requests requiring transparent interleaving or joint
mesh/overlay depth that it cannot provide. An annotation may hide or show an
offscreen indicator according to an explicit policy. It must never silently label
an occluded internal part as visible.

Use canonical right-handed, Y-up coordinates and document transform order, normal
transformation, camera direction and unit conversion. Imported glTF units and
legacy E01's Z-up conceptual coordinates require explicit conversion. Packs record
whether dimensions are measured, sourced or illustrative. An illustrative scale
must not be presented as a physical measurement.

Render clean color without DOM captions or SVG labels. Record linear working
space, exposure, tone mapper, texture color spaces, output transfer and alpha
convention. The proposed first output is canonical sRGB RGBA PNG sequences under
the completed CE13/CE15 contracts. Apply scene tone mapping exactly once and keep
compositing conversions explicit. Test transparent edges over light and dark
backgrounds; prohibit accidental double premultiplication or tone mapping.

Preserve the composition plan's existing export policy: pinned software rendering
and exact repeatability within the same supported environment. The customer's
Metal-rendered v008 is an art-direction reference, not a byte-identical golden for
software rendering. Use declared, calibrated comparison tolerances for that
reference and for hardware previews; preserve exact evaluated state and existing
composition baselines. Do not weaken their thresholds to accommodate the bridge.

MS1 must measure Three.js PBR/shadow rendering under the supported software
profile early. If it is impractical, report actual time, memory and visual evidence
and propose a separately versioned hardware export policy for an owner decision.
Do not silently copy the prototype's Metal launch flags or treat the customer's
cross-GPU tolerance request as overriding repository policy. A future hardware
profile must key caches by device/driver/runtime and cannot mix worker profiles
within an export.

### Episode interface and scoped edits

The supplied design fixture is a starting discussion, not the production schema.
The implementation should resolve versions and hashes for profile, packs, rigs,
recipes, textures, fonts and source audio; support multiple object instances;
record factual references and design variants; and express shot purposes, targets,
events, annotations and overrides by stable IDs.

Use integer output frames and the existing audio sample-clock conventions. Store
planned narration timing separately from measured cues. Semantic events resolve
once into the shared event map used by rig motion, shot boundaries, captions,
annotations and sound. Reject multiple writers for one controlled property unless
an explicit supported composition rule resolves ownership.

Expose capability/version discovery, component-level schema queries, asset search,
metadata inspection, compile, preview, render, check, patch, package and report
operations. Prefer a consistent `episode` command family after checking existing
CLI conventions. Exact names and flags are MS1 deliverables; none are advertised
here as executable. Preserve `comp validate`, `comp export-json`, `comp render`
and `comp lint` as lower-level supported operations.

A patch includes a base revision/hash, stable object/shot/property target and
bounded value. Apply atomically after validation; reject stale revisions without
overwriting current work. Return changed paths, affected shots, cache effects and
located diagnostics, with file paths for large reports. A saved project summary
contains current versions, artifact paths, open findings and the next valid action.
No routine response requires a megabyte of compiled frames or the complete repo.

Publish versioned JSON Schemas for the supported episode and component contracts.
Discovery identifies the schema versions and supported compatibility rules;
unsupported versions fail with the version, source path and useful next action.
MS1 sets documented numeric item/byte limits for discovery, inspection, patch and
diagnostic responses; MS2 applies them to the expanded registry. Large results
return aggregate failure counts, explicit truncation/continuation information and
a path to the complete report or paginated records. Never silently omit failures
or require generated frame data in routine context. Include positive/negative
schema examples and oversized-response fixtures in the owning milestone checks.

### Portable projects and diagnostics

The MS1 package manifest enumerates authored source, asset dependencies, fonts,
timing inputs, pinned runtime identities, content hashes, outputs and reports.
Support a read-only dependency dry run before packaging and after extraction;
report missing dependencies, hash mismatches and unsupported inputs without
rendering, modifying source or writing a package. Required runtime installation
and commands are documented with their pinned versions.

Acceptance uses an isolated clean environment containing only the documented
runtime and delivered package. The original checkout, user caches and hidden
global asset/font paths must be unavailable. Complete load, edit, save/reload,
export and verification, then relocate the package and repeat the relevant checks.
Physical paths and cache relocation must not change semantic identity. MS1N and
later stages preserve this contract for their supported delivery paths.

Structured failures include a stable diagnostic code, sanitized cause chain,
stage, relevant asset or JSON path and useful next command. Omit credentials and
full environment dumps. Verify these fields and sanitization with the existing
bind, font, asset and backend failure fixtures and synthetic sensitive values.

### Cache and lifecycle design

Reuse the completed CE15 infrastructure and split identities by actual dependency.
Do not hash an entire channel profile into every stage when only label styling
changed. Physical cache paths are not semantic identity.

| Stage                        | Identity includes                                                                                    | Example invalidation                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Geometry and imported assets | Source bytes, import options, geometry parameters, topology/toolkit versions                         | Hook thickness or model bytes invalidate dependent meshes and 3D shots.                |
| Clean 3D shots and sidecars  | Resolved geometry, rig/state timing, camera, materials/lights, seed, render profile, output sampling | Camera or contact timing changes rerender the affected shot and its anchors.           |
| Native overlays              | Sidecar, label/caption text, fonts, layout rules, safe/protected regions, overlay timing             | Label text/style changes reuse clean 3D frames.                                        |
| Audio                        | Source bytes, trims, cue-dependent placement, soundtrack/DSP configuration                           | Gain changes reuse picture; cue changes invalidate timing-dependent picture as needed. |
| Final composite and delivery | Exact picture/audio dependencies, encoder and output profile                                         | Composite/encode reruns when any consumed result changes.                              |

Resume only from validated atomic receipts. Do not reuse successful files based
solely on their existence, path or a previous exit code. Use fresh output versions
to preserve earlier deliveries and reject corrupt dependencies before rendering.

The queue records queued, resolving, validating, previewing, rendering, checking,
ready-for-review, reviewed-ready, failed and cancelled states. “Reviewed-ready”
requires explicit review evidence on the current artifact hash. An edit that
changes reviewed content invalidates affected review status. Queue completion
must expose all failed/cancelled items and an honest aggregate outcome.

Choose worker limits from measured memory and throughput, initially conservatively.
Cancellation releases browser/GPU/process resources. Bounded retries apply only to
classified transient failures; invalid schemas, geometry and assets stop that item
without repeated rendering or preventing unrelated jobs from finishing.

### Topic and family coverage

The MS2 implementation owner delivers the topic-to-family coverage board during
family selection, before selecting the ten-episode pilot. The authoring workflow
maintains a row for every proposed episode: stable episode ID, distinct question,
visible causal relationship, factual design variant, required pack and explanation
view, unresolved asset work, and one route—supported pack/rig; new asset with an
existing rig; or new behavior requiring a library extension. Keep question/answer
and scene-pattern overlap visible.

Define support criteria and freeze the selected cohort before measuring coverage:
supported distinct episodes divided by selected distinct episodes. Report both
counts, candidate routing distribution and new-asset/new-rig counts; report an
empty denominator as unavailable. A supported episode's required capabilities
must be validated, not merely named in the board. Recolors and caption/camera
substitutions do not create distinct explanations. MS3 and MS4C update this same
board and disclose any shared episodes or changes to the selection criteria.

Delay planning all 300 customer episodes until family transfer and recurring
effort are measured. The 300-job synthetic engineering test remains separate from
topic coverage and any authorized real production or publication run.

## Milestone tracker

MS0 audit is complete under the owner's implementation request on 2026-10-09. MS1N is the required native 3D stage after
MS1. MS4B remains conditional for explanation views and further native extensions,
with its decision recorded after the pilot. Audit/code completion and product review remain separate evidence.

| ID   | Deliverable                                              | Depends on                                    | Status            | Completion record                                   |
| ---- | -------------------------------------------------------- | --------------------------------------------- | ----------------- | --------------------------------------------------- |
| MS0  | Completed-composition audit and E01 baseline             | Composition completion gate                   | `[x]`             | [MS0 evidence](./mechanism-shorts-ms0-results.json) |
| MS1  | Supported bridge and portable E01                        | MS0                                           | `[ ]`             | Pending                                             |
| MS1N | Native 3D composition using shared scene and assets      | MS1                                           | `[ ]`             | Pending                                             |
| MS2  | Reusable packs, rigs, shots, labels and cue-driven edits | MS1N                                          | `[ ]`             | Pending                                             |
| MS3  | Episode lifecycle and ten-episode pilot                  | MS2                                           | `[ ]`             | Pending                                             |
| MS4A | Queue stress and recovery at 300 jobs                    | MS3                                           | `[ ]`             | Pending                                             |
| MS4B | Required explanation views and native extensions         | MS3 and a recorded coverage need              | `[ ]` conditional | Pending                                             |
| MS4C | Diverse 30-episode cohort and capacity decision          | MS4A; MS4B when required by selected episodes | `[ ]`             | Pending                                             |

### MS0 Baseline and dependency audit

**Outcome:** a reproducible starting point, resolved E01 inputs and a measurable
definition of success. This work starts only after the composition completion gate.

The [2026-10-08 typography disposition](./typography-motion-engine-plan.md#research-disposition-2026-10-08)
supplies detailed current-code findings, estimates, compatibility and acceptance
evidence for the additions below. These merge into the existing overlays, label
holds, portable project and anchor work; they create no separate milestone lane.

- [x] Audit the final CE13/CE15/CE16 media, alpha, caching, worker and audio APIs.
      Replace obsolete assumptions in this plan and identify existing equivalent
      features before adding code.
- [x] Recover E01 inputs; inventory hashes, licensing/provenance, fonts, original
      audio, captions/cues, scene parameters and dependency versions. Resolve the
      contact-state terminology and document model simplifications.
- [x] Extend that inventory with exact-copy font coverage and actual cut/axis
      identity; hashes/loading alone are insufficient. Audit completed typography
      capabilities and identify valid routes for mask, count-fit, Thai and portrait
      probes before classifying any source-audited risk as a rendering defect.
- [x] Freeze a shot/label/event reference from the delivered v008 evidence. Record
      its current creative-review limitations separately from technical results.
- [x] Define a visual rubric: recognizable object, solid side faces, real slots,
      readable blade curvature, bevel highlights, material separation, contact
      shadow, visible causal contact, stable camera framing and readable captions.
- [x] Establish comparable baseline tasks and telemetry collection before claiming
      token or labor savings. Record missing token telemetry as null.
- [x] Select the first package boundaries, resource budgets and proposed import
      subset. Estimate work by milestone after this audit; retain no deadline until
      based on implementation evidence.

**Acceptance and verification:** publish the source/dependency inventory, final
composition checkpoint, reference frame/shot map, baseline measurement protocol,
rubric and unresolved inputs. Verify supplied hashes without executing historical
customer scripts as setup. Missing exact E01 inputs block its reconstruction claim,
not unrelated contract or synthetic-fixture work.

**MS0 audit record (2026-10-09):** [results](./mechanism-shorts-ms0-results.json),
[input inventory](./mechanism-shorts-ms0-inputs.json),
[API audit](./mechanism-shorts-ms0-api-audit.json),
[typography audit](./mechanism-shorts-ms0-typography-audit.json) and
[baseline protocol](./mechanism-shorts-ms0-baseline.md). Audit acceptance and documentation verification are complete; MS0 PR is next.
Historical Arial/GPU identity, public media redistribution and human playback/
listening acceptance remain explicitly limited; no MS1 completion is inferred.

### MS1 Supported bridge and portable E01

**Outcome:** one command-driven project reproduces the required tape-hook treatment,
with native Still Shift overlays and a reusable rendering lifecycle.

Build in reviewable checkpoints: contract and one-frame proof; one complete contact
shot; all nine shots; scoped revision and clean-machine delivery. Include a minimal
versioned E01 pack, slider control and analytic assertions now; generalize in MS2.
Keep geometry, material slots, transforms, units, camera conventions, pure rig
evaluation and anchor IDs independent of plate capture so MS1N can consume them.
Plate files and sidecars are bridge delivery artifacts, not the authoritative 3D
scene. Preserve exact scene/asset identities when switching delivery paths.

- [ ] Implement the first-party Three.js preparation module and shared runtime
      integration. Remove episode-owned HTTP servers, screenshot loops, SVG label
      code and FFmpeg assembly from the authored episode.
- [ ] Reconstruct solid hook/flange geometry with through-slots, curved blade,
      stationary blade-mounted rivets, recognizable housing and contact surfaces.
      Preserve the distinction between geometry, material styling and mechanism state.
- [ ] Prove PBR materials, environment reflections, bevel highlights, contact
      shadows, color/alpha handling and the supported export profile on a short
      representative shot before paying for full renders.
- [ ] Emit clean frames and named anchor/visibility metadata. Compile all seven
      roles—PULL, PUSH, THICKNESS, TRAVEL, INSIDE, OUTSIDE and SLIDES—through native
      typography/shapes, with the actual meaning resolved in MS0. Preserve separate
      captions, no persistent brand/sentence headers, and enlarged-view qualifiers.
- [ ] Add shared exact-copy coverage/cut validation for native overlays, with
      explicit fallback/strict-profile behavior and legacy compatibility. Preserve
      the Plex-only Thai negative and Noto control. Reuse existing font preparation.
- [ ] Declare complete value/unit/qualification groups, intact phrase treatments
      and purposeful reading intervals in the portable authoring/review contract.
      Extend existing CE12 policy without suppressing real opacity/velocity faults
      or changing unannotated defaults. Test faint qualifications and color-only
      emphasis; do not pad or slow narration or add filler motion to pass lint.
- [ ] Reproduce base-36/inline-96 masks before proposing a renderer repair. Add a
      lost-label/leader portrait negative and corrected control to the existing
      anchor tests; verify actual semantic target, transformed endpoint and clearance.
- [ ] Implement load/validate/compile/render/check/save/reload/patch/package using
      supported CLI/API paths and supplied audio. Include compact JSON receipts and
      sanitized cause chains from the first vertical slice.
- [ ] Publish the minimum episode/component JSON Schemas and version discovery.
      Enforce documented item/byte response limits, located unsupported-version
      errors and access to complete reports under the episode interface contract.
- [ ] Deliver the manifest, dependency dry run, runtime installation instructions
      and sanitized error contract defined under portable projects and diagnostics.
- [ ] Deliver a bridge callout-overlap fixture and the supported detection, scoped
      patch, affected-output render and final-file recheck path. Include a compact
      project summary sufficient for a fresh agent session to complete the repair.
- [ ] Detect invalid anchor, stale sidecar, wrong travel, moving rivet and contact
      gap with part/property and first failing interval. Provide an independent
      analytic expectation rather than comparing the evaluator to itself.
- [ ] Instrument stage times, render work and cache receipts immediately so later
      savings claims have a baseline.

**Acceptance:** export all 696 frames with supplied audio at 1080×1920/30 fps from
a saved project in the isolated clean environment defined above, without GUI
setup or episode-specific capture code. Dependency inspection identifies missing
inputs before render and makes no source/package changes. Complete load, edit,
save/reload, export and verification using the delivered manifest and documented
runtime. A restarted process produces the same resolved specification.

A label-only TRAVEL edit changes native overlays while retaining the exact
clean-plate hashes and recording zero additional 3D frame renders. Separately,
detect the seeded callout overlap in final rendered frames, resolve it with one
revision-aware scoped patch, rerender only affected outputs and recheck the final
artifact. Require corrected readable placement, unchanged clean-plate hashes,
zero additional 3D frame renders and a receipt showing affected shots/cache work.
A fresh agent session must complete this path from the compact project summary
without reading the full conversation history.

**Verification:** random, forward and reverse seeks produce the same transforms,
anchors and pinned-environment frames; independent preview capture and repeated
exports meet their assigned tolerances. Verify every frame's critical mechanical
relationships and active label bounds/holds, plus entry/mid/exit and cut-adjacent
final-file images. The seven E01 label holds retain at least 30 fully readable
consecutive frames; text-specific reading checks can require more. Decode the final
audio/video and check duration, frame count, synchronization and terminal samples.
Test alpha edges and single tone mapping on both supported compositing backends.

Inject bind `EPERM`, missing font, incompatible asset and unsupported backend;
each must expose the diagnostic code, sanitized cause chain, stage, relevant asset
or JSON path and useful next command. Confirm credentials and full environments
are absent. Verify missing-input, cancellation, output preservation and relocation
behavior. Exercise supported/unsupported schema versions and oversized responses;
assert numeric response budgets and access to all full-report failures. Complete local required
checks before closing MS1. Record continuous audiovisual review separately; the
first visual proof must be assessed against the customer's rubric before scaling.

**Completion evidence:** runnable documented commands, versioned schemas and
response-budget checks, package manifest and dry-run receipts, isolated clean-setup
record, portable E01 source/dependencies, final MP4, sidecars, reference comparisons,
mechanical assertions, overlap repair/recheck and label-edit cache proof, fresh-session
handoff, sanitized error receipts, stage metrics and review status.

Include the [font/semantic/hold acceptance packet](./typography-motion-engine-plan.md#architectural-decisions-and-implementation-evidence)
with declared reading intervals, policy identity, font/copy evidence and encoded
negative/control states. A successful export or empty `systemFontLayers` is not a
coverage/readability pass. Review the historical CE15 transport/CLI findings
against current source; MS1 cause receipts reuse verified closure or an explicitly
scheduled residual repair, without claiming those findings closed from the merge.

### MS1N Native 3D composition

**Outcome:** bounded solid meshes participate directly in `composition-1` with
shared cameras, depth and native graphics. MS1 remains a supported delivery route;
native integration reuses its scene and asset contracts.

**Depends on:** accepted MS1 bridge and portable E01. Implement this stage before
MS2 generalized packs/rigs and MS3's ten-episode pilot.

- [ ] Audit the bridge contracts and define the supported native subset: bounded
      primitives and/or indexed meshes, normals, material slots, rigid hierarchy,
      units, pivots, transforms, asset hashes and topology/resource limits. Use a
      documented import subset where needed; reject unsupported data explicitly.
- [ ] Extend `composition-1`, pure evaluation, the shared graph and WebGL2 together.
      Reuse camera and rig evaluation across bridge/native paths. Define how a
      projected label stays screen-pinned and how an authored 3D graphic shares
      mesh depth; never infer those roles from draw order alone.
- [ ] Specify opaque depth testing, alpha/cutout and the supported transparency
      subset, camera clipping, normal transforms, color/alpha and motion-blur clocks.
      Verify only declared mixed-layer combinations; unsupported backends and
      transparency cases fail with located diagnostics rather than flattened output.
- [ ] Reuse the established bridge material/profile subset needed by the native
      proof, with explicit capability and appearance checks. Map overlap with solid
      geometry and CE8-L-F in the owning plan. A bridge reflection or shadow does
      not establish full native shading acceptance or complete CE8-L-F.
- [ ] Expose native mesh authoring, camera/material controls and inspection through
      the builder, CLI and Lab. Preserve saved projects, assets, narration, fonts,
      cache identity, scoped edits and clean-location delivery.
- [ ] Deliver a native version of the E01 mechanism proof plus an independent mixed
      mesh/graphic occlusion fixture. Record the supported bridge/native comparison
      policy before implementation. Compare geometry, clocks, anchors and material
      appearance independently; retain differences and unsupported features.
- [ ] Profile representative native scenes under the supported software renderer
      before broad expansion. Record actual timings, memory, source edits and cache
      invalidation; preserve all existing composition baselines.

**Acceptance:** a saved native project shows solid side faces and correct occlusion
from multiple camera angles. Native graphics correctly pass in front of and behind
a mesh in the supported depth mode; projected labels follow the same named anchors
and rig controls as the bridge. Reuse the MS1 assets and facts without duplicate
geometry or per-episode renderer code. Editing a part, camera or label survives
save/reload and the MS1 clean-machine package lifecycle with supplied audio. Preserve
MS1 schema/response and diagnostic contracts. Critical E01 mechanical
relationships and readable label holds retain their MS1 acceptance requirements.

**Verification:** independent geometry/projection/depth cases, invalid topology and
resource limits, material/color/alpha references, forward/reverse/random seeks,
repeat exports, independent preview/export evidence, mixed-layer clipping and
declared transparency cases, software exports and bounded hardware previews. Test
unsupported Canvas/backend diagnostics, missing or changed assets, stale review/cache
identity, cancellation and worker cleanup. Complete the milestone's required local
gate and separately record continuous audiovisual review; renderer success alone
does not close creative acceptance.

**Completion evidence:** native contract and supported-feature matrix, shared
bridge/native scene identity, portable native E01 and occlusion fixtures, commands,
final renders, parity and mechanical reports, performance measurements, located
limitations and review status. General CAD, simulation, flexible-body physics and
arbitrary sectioning are separate work.

### MS2 Reusable mechanism families and authoring

**Outcome:** E01 becomes one consumer of reusable interfaces. Three distinct
mechanism families establish whether the architecture transfers.

- [ ] Create tape-hook slider, cable-tie ratchet/pawl and clothespeg hinge/spring
      packs by extending the accepted MS1/MS1N contracts. Each declares immutable
      IDs, version/hash, parts, hierarchy, units,
      bounds, pivots, anchors, material slots, named camera targets, parameter ranges,
      factual variant, level of detail, compatibility, thumbnail, neutral pose and
      diagnostic views. Declare the supported detail level even when only one exists;
      automatic detail generation is outside this requirement. Metadata inspection
      returns targets/detail and compatibility without mesh or texture bytes.
- [ ] Extend the shared geometry library with bounded rounded boxes, cylinders,
      toruses, extruded profiles with
      holes, swept ribbons, coils and simple bevels. Use validated imported meshes
      where these are insufficient; set topology and memory limits explicitly.
- [ ] Extend the shared importer to the documented glTF/GLB subset: named rigid
      hierarchy, baked transforms,
      normals, UVs, base color, metalness, roughness, normal maps and texture color
      spaces. Validate extensions and local dependencies. Reject unsupported skins,
      morphs, animations, compression or material features unless explicitly added
      with tests; never silently flatten a model's required mechanism behavior.
- [ ] Implement slider hard stops, hinge/lever, deterministic spring return and
      ratchet/pawl controls. These are explanatory animation rigs, not a general
      physics solver. Keep gears, cams and flexible-strip behaviors demand-driven.
- [ ] Derive this tape-hook model's travel from hook thickness. Keep rivets attached
      to the blade and contact relationships valid when the reference frame moves.
      Reject conflicting property writers and out-of-range controls at compile time.
- [ ] Declare legal state transitions, required relationships and mechanism-specific
      event-order assertions. Reject invalid authored transitions; resolve timed
      failures to the rig, parts, relationship and first failing interval. Evaluate
      valid states without dependence on playback history; MS3 integrates these
      results into unified QA.
- [ ] Add recognition, contact approach, macro, aligned comparison, controlled orbit
      and return recipes. Frame actual target bounds using lens/view direction and
      reserved overlay regions. Check near planes and camera intersections; retain
      authored overrides when automatic framing obscures the decisive surface.
      Declare the target relationship and motion intent. Keep cut/hold/transition
      choices independent of the camera recipe; verify endpoints and intermediate
      framing, and distinguish intentional cuts from unintended camera jumps.
- [ ] Support screen-pinned labels with moving leaders, world text and surface
      markings through explicit supported routes. Use deterministic layout candidates
      and tie-breaking, label-to-label exclusions, protected contact regions,
      caption exclusion and safe areas. Resolve competing labels by declared
      deterministic priority while preserving authored locks; return a located
      failure if no valid layout exists.
      Derive temporal stabilization from the timeline or a deterministic prepass so
      hysteresis never makes random seeking depend on prior playback.
- [ ] Add tabs, open callouts, brackets, arrows and restrained highlights with
      explicit hidden/offscreen behavior and authored locks. A true surface marking
      is part of the 3D plate and invalidates it; ordinary label edits do not.
- [ ] Compile semantic contact/release/return events from supplied narration cues
      into all picture, annotation, caption and sound tracks. Reject overfull shots,
      out-of-recording cues and insufficient reading/action time. Do not stretch
      speech or insert filler silence to satisfy a rigid shot template.
- [ ] Expose registry-derived discovery, per-component schema/parameter help,
      small examples, asset metadata and stable revision-aware editing. Publish
      versioned JSON Schemas for the expanded contracts and retain MS1 response
      budgets, complete-report access and unsupported-version diagnostics.
- [ ] Create the topic-to-family coverage board during family selection under the
      coverage contract above. Classify all proposed pilot candidates and record
      support criteria, selected distinct-episode denominator and new-asset/new-rig
      counts before handing the selection to MS3.
- [ ] Expose explicit genuine-weight versus outline treatment and units, retaining
      legacy automatic behavior with resolved-route diagnostics. Reuse MS1 font
      identity; generalize quantity/phrase helpers only where repeated authoring
      friction warrants it.
- [ ] Before adopting count+fit or finer Thai motion, run the scoped reproductions
      in the [typography risk table](./typography-motion-engine-plan.md#scoped-validation-of-source-audited-risks):
      generated two-decimal count values, all six Thai stress strings, independent
      versus intact poses, run boundaries and opt-in tracking versus zero. Record
      negative and positive results before scoping repairs. Existing numeric-binding
      fit rejection and ordinary tracking defaults remain compatible.

The cable-tie fixture may use an explicitly authored exposed teaching variant to
show the pawl. It must identify that variant; generic section-plane/cap support
remains MS4B. This avoids making the first library depend on arbitrary sectioning.

**Acceptance:** instantiate two supported tape-hook dimensions without mesh-code
duplication; invalid dimensions identify the parameter path; changing metal styling
leaves geometry unchanged. Inspect pack camera targets and level of detail without
binary asset data; reject invalid target references with their parameter path.
Reuse a hinge on the clothespeg without E01 topology. Reject a seeded illegal
transition and invalid contact/release ordering with located relationship evidence.
Replace a pack with a larger compatible variant and check approach, contact hold,
transition endpoints/intermediate frames and return without camera-coordinate
rewrites. Keep the decisive surface visible during proof intervals and restore
object recognition on return; declared cuts remain valid.

Change a label and camera in a crowded fixture with multiple simultaneous labels,
captions and a protected contact. Check every final rendered frame for label-to-label
overlap, clipping, jitter and readable holds. Reflow valid cases deterministically;
an impossible layout must fail with the conflicting labels/regions identified.
Forward, reverse and random seeks produce the same layout and valid rig states.
Replace narration with a valid shorter take and recompile all event-driven tracks
without stretching source samples or preserving an unnecessary nine-shot duration.
Deliver the classified coverage board before pilot selection; selected episode
counts and new-asset/new-rig totals must reconcile with its individual rows.

**Verification:** contract/import rejection tests, units/axis/transform references,
geometry and independent rig assertions, conflicts and degenerate cases, seeks and
restart, complete label visibility/layout checks, cue/sample bounds, previews and
repeated final exports for all three families. Seed a moving mount, wrong travel,
contact gap, illegal transition, invalid event order, obscured contact, crowded-label
conflict and jitter-inducing label case. Verify oversized registry/diagnostic
responses stay within published budgets while preserving complete failure access.
Add local verification
groups and complete the milestone gate. Deliver pack and compatibility documentation.

### MS3 Production lifecycle and ten episode pilot

**Outcome:** a reliable episode workflow and measured evidence from ten distinct
explanations, not ten recolors or camera substitutions of E01.

- [ ] Complete durable queue manifests, per-item receipts, dependency-aware caches,
      cancellation, restart, bounded retries and independent item failure handling.
      Reuse the completed CE15 workers and output publication primitives.
- [ ] Complete the unified QA report with separate technical, mechanical, sampled
      visual, continuous-motion and listening results. Each result records method,
      evaluated interval, evidence and artifact identity; unreviewed is not pass.
- [ ] Add custom registered semantic assertions with bounded execution and structured
      results. Distinguish analytic, sampled and continuous collision methods.
      Include the MS2 transition and event-order assertions in the unified report.
      Group inherited motion warnings by controlling rig, event and interval,
      retaining maximum measured change with units, affected child/part references,
      raw details and bad-frame links.
- [ ] Generate phone-size overviews, shot entry/mid/exit images, contact/cut samples,
      useful crops, full-decode/audio reports and compact fresh-session handoffs.
- [ ] Exercise scoped repairs, stale-revision rejection and affected-shot rerendering.
      Prevent a changed asset from retaining a prior reviewed-ready state.
      Run the MS1 overlap detection/patch/render/recheck path automatically without
      GUI interaction or routine creator decisions. Preserve a bounded recovery
      policy and report unresolved factual/creative judgments as exceptions.
- [ ] Run ten distinct episode fixtures across the three validated families, including
      changed narration and camera choices. Supply a question, fact evidence, design
      variant and visual proof for each. Select them from the MS2 coverage board;
      maintain candidate routing, new-asset/new-rig counts and coverage against the
      frozen distinct-episode denominator. Record new-asset and new-behavior work.
- [ ] Repair stale documentation about media and 3D artwork against the completed
      implementation. Generate concise capability references from registries/schema;
      document supported imports, batch scope and preview/export limits, and expose
      those same implemented limits in machine-readable capability discovery.
- [ ] Deliver one documented report command that emits a small episode report and
      cohort summary with p50/p95 durations, first-pass technical success, repeated
      failures and unresolved review counts. Include individual rows, percentile
      method, measurement availability and separate setup versus routine effort.
      Keep response bodies within the published limits and link complete reports.

**Acceptance:** proposed pilot targets are at least 50% lower median routine
authoring tokens against comparable measured baseline tasks, at least 90% first-pass
technical completion, zero per-episode server/capture code, zero GUI setup/recovery,
and zero unresolved mechanical correctness failures in reviewed-ready outputs.
These are targets, not current results. Missing token telemetry leaves the savings
target unverified. Failed attempts and incomplete reviews remain visible.

The seeded overlap must complete detection, one scoped patch, affected-output
render and final-file recheck without GUI use or creator intervention. Retain the
bridge proof of unchanged clean plates and zero new 3D renders; native-path edits
follow their declared dependency/invalidation contract. A fresh session resumes
from the compact summary. Grouped warning peaks must agree with raw evidence.
One report-command invocation emits both report types with the required fields;
missing values remain null, failed attempts stay visible and review counts agree
with current artifact-specific statuses. Capability discovery and generated docs
must agree on import, batch and preview/export limits. Coverage totals reconcile
with the ten selected distinct episode rows and their library-extension work.

**Verification:** seed an intersection, moving mount, clipped text, unreadable hold,
wrong label state, illegal transition, invalid event order, missing audio and export
failure. Each must yield a useful finding
and affected-frame evidence where applicable. Exercise worker interruption, a
corrupt asset, cancelled jobs, stale patches and relocation before the pilot.
Complete local required code gates and report pilot metrics/quality independently.
A technical milestone may record delivered code while pilot product acceptance
remains pending; it cannot mark the pilot target achieved by encode success alone.

### MS4A Queue stress and recovery

**Outcome:** lifecycle correctness and measured capacity at the requested queue size.

- [ ] Assemble a 300-job synthetic manifest from validated fixtures with a mix of
      shared/unique assets and controlled geometry, label, audio and timing edits.
      Label repetitions explicitly and record cold and warm cache runs separately.
- [ ] Kill/restart the runner mid-export, inject a corrupt asset and worker failure,
      and cancel active and queued items. Retain valid completed outputs and classify
      failures without blocking unrelated jobs or accepting partial artifacts.
- [ ] Prove the cache invalidation matrix with plate/overlay/audio work counters.
      Bound disk growth, queues and worker memory; clean up workers and temporary
      files without deleting previous deliveries or valid reusable evidence.
- [ ] Profile representative scenes serially, then measure bounded concurrency
      without competing benchmark workloads. Report actual throughput, tail latency,
      memory/storage peaks and recovery effort; do not assume linear GPU scaling.

**Acceptance and verification:** every job has an honest terminal or resumable
receipt; successful results survive restart unchanged; rejected inputs do not
endlessly retry; repeated outputs meet their pinned-environment parity policy.
Report exact job identities, versions, failure injection points, resource use and
cache validity. This gate proves queue behavior, not 300 original explanations.

### MS4B Explanation views and native mesh composition

**Outcome:** expand explanation views and native 3D capabilities beyond MS1N only
where pilot episodes demonstrate a coverage need. Initial native mesh composition
is delivered by MS1N; this stage does not repeat its foundation.

Record the triggering episode and limitation, then choose the smallest supported
extension. Sectioned assets and explanation views can use either accepted path.
Add native features beyond MS1N only for demonstrated depth, transparency, camera
or geometry requirements outside its supported subset.

- [ ] Add controlled section planes with valid caps for a documented topology subset,
      authored exploded axes with coherent reassembly, ghosting and linked detail
      insets. Preserve part identity and true surface relationships.
- [ ] Reject unsupported cap/topology cases. An uncapped clip is not automatically a
      valid solid section, and a plausible-looking interior is not factual evidence.
- [ ] If further native extensions are justified, extend `composition-1`, evaluation,
      graph and backend capability contracts together. Define depth/transparency,
      camera, motion-blur, color, alpha and unsupported-backend behavior explicitly.
      Keep the MS1/MS1N shared scene evaluation contract across both paths.
- [ ] Map overlapping solid-geometry and CE8-L-F material/shadow work in the
      composition backlog to this delivery. Record any superseding scope decision;
      do not silently mark broad deferred milestones complete because one bridge
      shot has reflections or shadows. CE6-P remains separate performance work.

**Acceptance and verification:** a ratchet or spring relationship hidden by its
housing becomes readable, retains valid section boundaries and returns to assembly
without geometry jumps. Unsupported input fails with part/topology context. Test
section geometry independently, occlusion, all-frame motion, annotations, random
seeks, reloads, software exports and hardware previews. For native extensions,
verify mixed native layers and preserve every existing composition baseline.
If an extension is deferred, record the remaining SS01/SS06 boundary explicitly;
MS1N's initial native support remains a separate required milestone.

### MS4C Thirty episode diversity and capacity decision

**Outcome:** evidence for a sustainable library and recurring production effort.

Select 30 distinct episodes using the MS2/MS3 coverage board, with at least one additional
mechanism family beyond the initial three and enough variation to exercise new
asset onboarding. Pilot episodes may count toward the 30 only if they meet the
same frozen criteria; disclose overlap and rerun measurements when the workflow
changes. Do not fabricate “diversity” by changing captions, color or camera alone.

For every candidate, record whether it uses an existing pack/rig, needs a new
asset with an existing rig, or needs a new behavior. Include the visible causal
relationship, factual variant, required explanation view and unresolved work.
Track question/answer and scene-pattern overlap. Review distinctness and mechanical
truth separately from throughput.

**Acceptance and verification:** repeat the MS3 report-command contract for this
cohort, reconcile coverage/routing and new-asset/new-rig counts with the board, and
report individual episode rows, p50/p95 effort,
first-pass completion, repair burden, review completion and library transfer rates
at matched quality/resolution. Account for all setup and family development work
in the 300-episode cost model. A high new-behavior rate or unresolved creative review
prevents a claim of routine low-cost capacity. Use observed results to decide the
next library investment and feasible cadence; actual large production/publication
remains a separate scope decision.

## Measurement and review rules

Record model/provider identity, actual input/output and cached-input tokens where
available, billable cost, tool calls, stage durations, retries, render work, cache
hits, active creator minutes and review findings. Null means unavailable; no
estimated token count may be presented as observed. Separate shared setup,
family/asset onboarding and routine episode work, including failed attempts.
Record render worker time separately from critical-path wall time; do not sum
overlapping stages into elapsed duration. Report p50/p95 routine tokens and wall
time with raw rows and availability, alongside the report-command acceptance
fields. Retain failed/retried work and separate unattended compute from active
creator minutes.

Pair baseline and reusable tasks at comparable mechanism complexity, quality,
resolution, narration and deliverable completeness. Disclose learning effects and
model/provider changes. Define first-pass technical success before the cohort as
completion of the first submitted job without a repair, retry or manual recovery;
retain transient and authored-error breakdowns. Successful encoding alone is not
the metric. With ten observations, p95 is a coarse tail indicator; publish the rows
and percentile method alongside the aggregate.

For projections, let N be episode count, B measured mean baseline routine tokens,
R measured mean reusable routine tokens, S shared setup tokens and F total
family/asset onboarding tokens for the selected cohort:

```text
baseline total = N × B
system total = S + F + N × R
fraction saved = 1 − system total / baseline total
break-even count = ceil((S + F) / (B − R)), only when B > R
```

Use totals/means for cohort costs and medians for the pilot's routine-effort target.
Model F against actual family coverage; it need not stay constant as N grows.
If B ≤ R, do not claim a recurring token advantage. Include generation, compute,
storage and human effort separately from tokens. The archive's 73.33% scenario is
illustrative arithmetic, not a forecast. No engineering target implies audience
growth, retention, revenue or platform eligibility.

Every QA dimension has its own pass/fail/not-reviewed/not-applicable state and
evidence method. The selected design's facts, mechanical relationships, sampled
images, continuous motion and listening require the appropriate evidence. Preserve
unresolved judgments instead of collapsing them into a green export badge.

## Verification and completion rules

Future code milestones follow [AGENTS.md](../AGENTS.md) and the
[verification guide](./verification.md):

1. Read the development log and current source before starting; record owner,
   branch, starting commit and the milestone's planned acceptance matrix.
2. During development, run relevant existing focused unit, integration/runtime and
   browser checks. Register meaningful new groups in local pnpm verification tiers.
   Small checkpoint commits do not require another full repository gate.
3. Before expensive verification, confirm pinned tools, isolated Vite optimizer and
   configuration caches, Python setup, browser startup and relevant imports. Keep
   caches isolated from an active owner checkout.
4. Each implementation milestone retains its required complete `pnpm check` gate.
   When milestone acceptance requires a full gate, complete focused regressions
   and implementation review first, then aim for one successful complete
   `pnpm check` on the final code checkpoint. Before starting, explain the concrete
   reason and expected cost. Scoped follow-up/PR repairs default to affected
   checks; run a full gate only for required milestone acceptance, an explicit
   user request or changes that invalidate broader verification evidence.
   Preserve required suites, pixel/timing thresholds, repeated exports and frozen
   baselines. Retest repairs appropriately; rerun the full gate when code changes
   invalidate its evidence. Never report an incomplete/nonzero gate as passed.
5. Keep performance measurement separate from competing correctness workloads.
   Benchmark the selected resource limits; do not redesign the test harness as
   incidental feature work or interrupt a valid running full gate.
6. Record failures and rejected approaches, exact commands, code/toolchain/profile
   identity, output hashes and limitations in a milestone results file. Use proposed
   paths `docs/mechanism-shorts-ms*-results.json` and isolated ignored result folders.
7. Update current capability docs, examples, this tracker and the development log
   after code changes. Complete portable lifecycle and independent review evidence
   before claiming the corresponding product acceptance gate passed.

Code completion, visual/creative acceptance and permission to publish are separate.
Routine repairs and command-only recovery should proceed within an authorized
implementation milestone; unresolved factual/creative decisions or changes to
established render policy receive a concrete evidence-backed decision request.

## Risks and decisions to resolve during implementation

| Risk or unresolved choice                                   | Resolution point and evidence                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Missing original E01 dependencies                           | MS0 inventory; recover authorized inputs or identify precisely which reconstruction check is blocked.                  |
| Ambiguous contact labels and conceptual dimensions          | MS0 factual/design mapping; keep measurement mode and contact face distinct.                                           |
| PBR/shadows too expensive under pinned software rendering   | MS1 representative-shot benchmark; optimize within scope or present a measured, separately versioned profile proposal. |
| Profile or camera changes invalidate too much work          | MS1 cache counters, MS2 dependency tests and MS4A workload mix.                                                        |
| Bridge occlusion cannot support a selected explanation      | Explicit bridge error or authored ordering; use accepted MS1N support, then MS4B only for further demonstrated needs.  |
| Label hysteresis conflicts with random-seek determinism     | MS2 deterministic timeline prepass or time-derived layout; forward/reverse/random equivalence tests.                   |
| Asset import or procedural parameters create false geometry | Strict supported subset, bounded geometry and independent assertions; factual provenance remains separate.             |
| Library generalization is driven by one object              | Three distinct families in MS2, ten episodes in MS3, and a broader 30-episode cohort.                                  |
| Token telemetry or creative review is unavailable           | Preserve null/not-reviewed; continue measurable work but do not claim the corresponding target passed.                 |
| Large-scale throughput hides authoring/review bottlenecks   | Report active creator time, new-asset/new-behavior work and critical-path wall time alongside render throughput.       |

## Source record

The original archive remains the customer evidence of record. Preserve its bytes;
future implementation should capture the dependency inventory and relevant source
identities in its own results rather than treating this host's absolute paths as a
portable project.

- Archive SHA-256:
  `3421233df90efff5bf658444b5743888e28e46e37bdb4859f937c79532f557f4`.
- Developer Brief / pasted text SHA-256:
  `7e8977a1f90dd2c3ae03db3fb634459723976fd708618e894b0864b776a55ab1`.
- v008 MP4 SHA-256:
  `ca8bf292cf4dc7f4c5ede598cc1c2e5908177cda12474bef98fb387a778039b1`.
- Requirements: archive `Developer Brief.md`, `backlog.csv`, `Scale Model.md`,
  `episode.example.json` and `episode.schema.json`.
- Evidence limits: `Evidence.md`, `evidence/QA-v008.md`, `evidence/checks-v008.json`,
  `evidence/Still-Shift-episode-notes.md`, `verification.json` and source receipts.
- Rendering reference: `evidence/original-source/`, v006/v008 MP4s and three timeline
  images. Original code was read as evidence, not executed or adopted as production.
- Planning verification: archive manifest identities and 11 inspected source hashes
  match; three supplied contact sheets inspected. No implementation, new episode
  rendering, full audiovisual review, paid generation or publication was performed.

**Implementation order:** MS0 → MS1 bridge → MS1N native 3D → MS2 → MS3, then
conditional explanation extensions and capacity stages under the tracker.

**Current next action (2026-10-09):** open the verified MS0 PR, then build MS1's shared-contract/one-frame and one-contact-shot proof
before complete portable E01 and scoped label-repair acceptance.
