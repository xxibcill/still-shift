# Story motion roadmap — S01E01

**Updated:** 2026-09-26
**Project milestone:** v0.13 · **Status:** all seven recipes implemented; episode integration in progress
**Consumer:** History Offstage S01E01, followed by other prepared illustrated episodes
**Design:** [28-still motion study](../prompt-packs/s01e01-motion-design.md) · [source/timing ledger](../prompt-packs/s01e01-motion-source-ledger.json)

**Research:** [Implementation precedents for all seven treatments](s01e01-story-motion-research.md), completed 2026-09-26. Documentation and worked examples inspected; rendered fixture proofs are now available in the implementation record.

## Outcome

Deliver seven reusable story-motion treatments in Still Shift and a verified handoff for animating S01E01. Each treatment must change a visible relationship, preserve the meaning of the narration, and end in a readable composition.

Start with **Unequal Margins → Access Constraint**, using ST-013/014 as the first editorial target. A short illustrated proof establishes the motion; the approximately 27-second narrated sequence establishes whether the two treatments work together. A symbolic sketch or successful export alone does not establish creative quality.

This extension now has seven executable recipes, shared frame timing, prepared fixtures, lab cue controls and verified CLI exports. See the [implementation record and seven-preview gallery](story-motion-implementation.md). The existing cinematic work remains independently tracked under v0.12; completing every camera variation is not a dependency. Episode-derived proofs do not reinstate retired images into the Phase 0 benchmark corpus or satisfy its release gates.

## Visual art direction — implemented

The owner finds the motion useful and requested more aesthetic graphics on 2026-09-26. The [visual critique and redesign plan](story-motion-visual-redesign.md) identifies mixed illustration styles, repeated slide layouts, undersized text and inconsistent symbol meanings. The implemented pass applies the existing Layered Chronicle identity to all seven treatments. See the [visual implementation and QA record](story-motion-visual-implementation.md).

- [x] Inspect the current frames, compare them with the channel style bible and document a scene-by-scene visual plan.
- [x] V1: board all seven compositions and finish representative style frames.
- [x] V2–V3: prepare a coherent reusable art kit, pinned typography and shared visual components; prove one short preview.
- [x] V4–V5: apply the system to all seven, render a new gallery and inspect phone frames, semantic continuity and automated playback. Frame/sample judgment and playback automation are recorded separately.
- [~] V6: the 646-frame ST-013/014 local narrated candidate is rendered with the revised kit. Remaining episode passages and protected-timeline integration are pending.

This is an art and composition pass within v0.13. All seven revised compositions are rendered and inspected. Final creative acceptance and full episode integration remain pending.

## Motion quality pass — local implementation delivered

The [implementation report](motion-quality-implementation.md) records the local
ending and authoring-feedback work from the [plan](motion-quality-improvement-plan.md).
The user rejected v011 crowding. v012 restores a differentiated type scale and
illustration space; small-player readability remains open. Relationship Build
and Motif Resolve retain 2.25 and 2.33 second holds. The seven-scene gallery
includes three before/after comparisons.

The refreshed ST-013/014 proof and new four-composition ST-006–008 candidate
preserve their 646/1507-frame timing. Prior independent frame reviews and current
technical checks are recorded; they do not replace user creative acceptance.
Continuous audiovisual review and external episode integration
remain open; M1–M6 are not treated as completed episode milestones.

## Seven implemented treatments

Names and IDs below are implemented recipe values in the new `story-scene-1` prepared input, exported through `animate-scene`. Share existing drawing and event machinery; do not create seven renderers or duplicate older recipes merely to rename them. Retain existing recipe IDs and their output behavior.

| Treatment / ID                                | Reuse                                           | Recipe behavior                                                                                                         | First S01E01 application         |
| --------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Unequal Margins** · `unequal_margins`       | `comparison_build`                              | Shared baseline and stable paired anchors; qualitative condition changes without scaling reserve bars                   | ST-013, then ST-008/024/026      |
| **Access Constraint** · `access_constraint`   | `access_pressure`                               | A restriction visibly narrows around an open connection; no mandatory travelling token or total blockage                | ST-014                           |
| **Relationship Build** · `relationship_build` | `resource_flow`                                 | Narration-timed relationship groups, optional token-free paths, emphasis transfer and regrouping around a stable anchor | ST-006, then ST-009/010/016/025  |
| **Evidence Boundary** · `evidence_boundary`   | Existing groups, paths and text                 | Supported categories assemble; unknowns remain visibly separate; composition exposes limits of inference                | ST-017/018, then ST-019/020      |
| **Dated System Break** · `dated_system_break` | `crisis_fracture`                               | Readable date/context precedes ordered fractures; a later context begins with an explicit reset                         | ST-021/022                       |
| **Category Swap** · `category_swap`           | Existing authored image states, groups and text | Replace one conceptual category/package with another while its surrounding relationship persists                        | ST-015 and selected ST-009 beats |
| **Motif Resolve** · `motif_resolve`           | Shared anchor, path and group machinery         | Return familiar objects, reorganize them around the conclusion, then isolate the outgoing relationship                  | ST-023/025–028                   |

Existing `chronicle_reveal` and suitable Cinematic Parallax variations support place/tableau shots. They are not additional deliverables in this seven-treatment scope. Walking, feeding, unseen poses and full character animation remain outside these recipes.

## Delivery order

| Milestone | Scope                                                            | Reviewable result                                                                                    | Dependency                  | Status |
| --------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------- | ------ |
| M0        | Minimal event timing, source preparation and continuity contract | One valid prepared scene and a small reusable asset kit                                              | Existing illustrated engine | `[~]`  |
| M1        | Unequal Margins + Access Constraint                              | One short illustrated preview, then ST-013/014 narrated proof                                        | M0                          | `[~]`  |
| M2        | Relationship Build                                               | Token-free resource mechanism and ST-006–008 sequence                                                | M1                          | `[~]`  |
| M3        | Evidence Boundary                                                | ST-017/018 evidence-limit sequence                                                                   | M2                          | `[~]`  |
| M4        | Dated System Break                                               | ST-021/022 crisis and context-reset sequence                                                         | M3                          | `[~]`  |
| M5        | Category Swap + Motif Resolve                                    | Substitution proof and a coherent closing sequence                                                   | M2–M4                       | `[~]`  |
| M6        | Lab/CLI completion, episode handoff and full-sequence QA         | Seven reusable treatments; S01E01 integration package and reviewed candidate under episode authority | M1–M5                       | `[~]`  |

At the user’s request, the engine portions and then the visual redesign of all seven recipes were implemented together on 2026-09-26. M0–M6 remain episode-delivery slices, not calendar promises. M1 now has a local narrated graphic candidate; selected-source episode integration and the other complete narrated sequences remain pending. After M1, record actual preparation and iteration effort before estimating the remaining work. Do not delay the first preview for a general timeline editor, batch authoring UI or large asset-generation campaign.

## M0 — prepare only what the first proof needs

- [x] Recheck the current S01E01 production record and the source/timing ledger before touching episode derivatives. Separate already approved treatments from the specific proposed changes.
- [x] Prepare two household silhouettes, a store, fixed common ground and editable restriction/relationship elements. Preserve source lineage, hashes and originals. Use existing reusable artwork for engine fixtures where suitable.
- [x] Add the smallest additive event contract required by M1: explicit event frame windows, anticipation/change/hold intervals, semantic roles, stable object IDs, anchors and entry/exit state.
- [x] Make integer `frameCount` authoritative for the new story input. Preserve legacy v1/v2 behavior; current integer milliseconds and the eight-second cap cannot represent the exact 646-frame narrated proof. Audit engine/result/export adapters and remove floating-point duration round trips from the new route's frame validation.
- [x] Evaluate every state from absolute frame index. Keep clip-local frames separate from the episode timeline offset. Retain existing default schedules when no new events are supplied.
- [x] Collect and validate all event keys before emitting each property track. The existing helper overwrites previous keys; new multi-event scenes must reject conflicts and distinguish step changes from interpolated motion.
- [x] Reject unknown roles, missing assets, invalid state references, out-of-range event frames and conflicting transitions before export. Select a compatible schema/version approach without silently changing old scenes.
- [x] Give the first new recipes the same preview/export evaluator and existing `animate-scene` entry point. Expose only enough lab control to preview and scrub the proof.

**Exit:** one prepared scene renders and seeks deterministically; original illustrated recipes still resolve unchanged. Record exactly which derivative treatments are executable and which are staged proposals. A pending protected-shot amendment must not block independent engine/fixture work.

## M1 — prove the comparison and consequence

**Target:** ST-013/014, master frames **4748–5393**, 646 frames at 24 fps, **26.917 seconds**. Boundary timings are fixed; internal beats are conformed to the existing narration.

- [x] Implement `unequal_margins`: common season/baseline, matched household scale, a named strain, and qualitatively different responses. No fabricated stock ratios.
- [x] Implement `access_constraint`: source remains available, both connections remain, one corridor visibly narrows. Keep the path open and omit food-unit traffic.
- [x] Reuse the household anchors when moving from comparison into access. Define the outgoing/incoming scene state so the edit does not reset the explanation.
- [x] Make **one 4–8-second illustrated preview** of the clearest event. Inspect it for meaning, movement and composition before extending it.
- [x] Assemble the full 26.917-second local narrated graphic candidate using the existing corrected narration timing. Where a new source reset/crop/mask treatment is needed, stage that exact change against current episode authority before applying it.
- [x] Inspect motion intervals, the ST-013/014 boundary, a phone-size view and the final consequence. Use targeted tests for the new event semantics and preview/export frames around transitions.

**Exit:** the viewer can follow “same season → unequal margins → available grain does not ensure equal access.” The main event is visible without depending on a changing sidebar. No duplicated baked paths, detached cutouts or quantitative implications remain. Record the actual temporal inspection method and unresolved compromises.

**Revision rule:** if the proof still feels like a slide presentation, revise staging, continuity or the event itself before building more presets. Faster fades and more camera travel are not sufficient evidence of improvement.

## M2 — build the resource mechanism

**Target:** ST-006–008, frames **1940–3446**, **62.792 seconds**, assembled from narration-sized beats.

- [x] Implement `relationship_build` using optional token-free branches and grouped event timings. Preserve the original token-based `resource_flow` behavior.
- [x] Maintain the store as the anchor while dependencies appear and change emphasis. Keep at most three independently moving focal elements and avoid revealing the complete system at once.
- [x] Keep static connected nodes for the initial reveal; use grouped subjects and anchor-derived connectors. Existing short studies exercise endpoint motion; the narrated passage keeps the store fixed.
- [x] Connect the store illustration to the household-margin comparison already proved in M1.
- [x] Use a separate qualitative loss condition; keep the grain level fixed. Do not animate a measured draining bin, price scale or universal hunger countdown.
- [~] Short relationship studies and the complete 1507-frame narrated candidate are rendered. Four distinct compositions, boundary frames and phone-size labels passed sampled review; continuous audiovisual pacing remains open. See the [beat sheet](s01e01-resource-passage-beats.md).

**Exit:** the sequence develops from grain to other dependencies to unequal household vulnerability. It is not a single radial board stretched over a minute. Validate relationship roles/timing and check any existing flow behavior touched by shared changes.

## M3 — make evidence limits a visual event

**Target:** ST-017/018, frames **6229–7578**, **56.250 seconds**. ST-018 alone is 34.125 seconds and needs several distinct compositions.

- [x] Implement `evidence_boundary` with supported categories, unknown fields, a persistent qualifier and an explicit incomplete state.
- [ ] Stage three developments: what the study supports; which exact details are unavailable; why this cannot furnish the composite household's pantry.
- [ ] Introduce Lene's date and exceptional wealth before the inventory composition. Use broad category labels rather than asserting that every drawn object is a recovered item.
- [ ] Preview the boundary event, then inspect the full passage for reading time and meaningful changes in hierarchy.

**Exit:** uncertainty is clearly differentiated from zero/absence, and the evidence frame never appears to certify invented items, quantities, values or quotations. A still, legible conclusion is allowed; repeated label entrances do not alone complete this milestone.

## M4 — separate crisis from the later local scene

**Target:** ST-021/022, frames **8514–9572**, **44.125 seconds**.

- [x] Implement `dated_system_break` with a context-visible interval before the first fracture and authored ordered breaks.
- [ ] Animate separate stressed relationships as narration names them; preserve stable node identity and avoid implying measured causal weights or an exact historical cascade.
- [ ] End the crisis on a readable system-wide composition.
- [ ] Reset explicitly into Walsham 1327–29 and its unknown local conditions. The broken famine network must not heal into the new scene.
- [ ] Preview one fracture/reset event; inspect the full narrated transition. Test date-before-break ordering and exact context boundaries.

**Exit:** the crisis belongs visibly to 1315–17, while the later scene remains neutral and uncertain. A new date caption on an otherwise continuously recovering network fails this criterion.

## M5 — add substitution and resolve the recurring motifs

- [~] Implement `category_swap` using registered category states and stable surrounding anchors. For ST-015, use the qualified Hinderclay comparison without inventing grain species, quantities or a Walsham meal. Use conceptual substitution rather than organic morphing.
- [~] Implement `motif_resolve` using objects/anchors introduced earlier. Group the factors as spoken, resolve the household/resources/claims relationship and isolate land → rent/service.
- [ ] Apply the closing treatment to ST-023–028, frames **9573–11296**, **71.833 seconds**, using varied internal scenes and the existing short closing hold.
- [ ] Preserve qualifier visibility, the final threshold illustration and available end-screen space. No new punishment or eviction event is introduced.
- [ ] Inspect one short preview per new behavior, then the concluding sequence. Reuse the M1 household kit and M2 system kit instead of generating another visual language.

**Exit:** category changes remain conceptually legible, and the conclusion develops familiar visual relationships. It must not repeat the entire resource-network reveal or introduce new visual claims at the end.

## M6 — make it usable and integrate S01E01

### Still Shift deliverables

- [x] A **Story Motion** lab collection with seven clear labels, compatible prepared scenes, playback/scrubbing and the relevant event controls. Display missing preparation requirements before export.
- [x] Documented prepared-scene examples through the existing `animate-scene` CLI. Preset names, resolved events, actual treatment/fallback and source references remain inspectable.
- [x] Shared rendering and timing behavior across lab and export. Old v1/v2 scenes remain readable; new semantics use explicit compatibility rules.
- [ ] A reusable kit and targeted alternate input for each distinct contract behavior. Reuse real episode applications to demonstrate reuse; no mandatory second full composition or lengthy reel for every preset.
- [ ] Targeted 24/30 fps, seeking, event-boundary, compatibility and preview/export checks. Run broader existing checks once for the integrated change, or earlier when a concrete regression risk requires them.
- [ ] Record preparation/repair effort, asset reuse, render time and any actual generation cost separately. Unknown cost stays unknown.

### Episode handoff

- [ ] Produce a shot manifest for all 28 still IDs: selected source, treatment, event windows, clip-local and master frames, entry/exit anchors, labels/qualifiers, result and fallback.
- [ ] Keep the episode's **11,297 frames at 24 fps (7:50.7083)** and corrected narration. Preserve the already generated opening and accepted hero assets; reconcile their exact integration treatment with the current episode record.
- [ ] Preserve explicit scene placements when adding transitions. Overlapping transitions must not silently shorten the master timeline; verify actual encoded frame counts against the handoff manifest.
- [ ] Keep narration, final sequencing and final captions in the History Offstage Remotion assembly. Still Shift supplies compatible prepared motion clips and metadata; it does not take over the full episode editor.
- [ ] Compare the exact proposed changes with existing selected-image approvals. Complete available preparation before grouping any genuinely required treatment decisions. Do not revive approvals already recorded or mistake an old proposal's stale status for current authority.
- [ ] Run independent editorial review of the integrated sequence and fix substantive visual/semantic issues. State whether review used playback, sampled motion intervals or only frames; successful encoding is not creative acceptance.
- [ ] Present one finished episode candidate through the episode workflow after its required QA. Human creative/release acceptance and Phase 0 acceptance remain separate decisions.

**Exit:** all seven recipes are reusable in Still Shift and every S01E01 shot has a concrete, timing-correct integration treatment. The episode milestone is complete only when its actual integration and QA are complete; a set of standalone demos is an intermediate result.

## Working rules

1. **One preview before expansion.** A 4–8-second event proof comes before a long narrated render. A proof may need longer when context is essential; do not compress the final episode narration to fit a demo duration.
2. **Reuse before new capability.** Share groups, paths, image states, anchors, renderer and export. Add code only for a distinct needed behavior. No routine research campaign, new source kit or full regression sweep for every variation.
3. **AI owns preparation and checks.** Do not hand the user a mask-drawing or frame-rating task. Milestone checks are internal work, not seven new human approval gates.
4. **Keep art and meaning together.** Inspect masks at full size and compositions at phone size. Remove baked connector residue, preserve grounded contact, and keep required text editable.
5. **Make differences consequential.** Camera movement or caption changes alone cannot satisfy a mechanism preset. A held composition can be the correct end state after the visible change.
6. **Do not infer semantic structure from a PNG.** These recipes consume prepared roles/assets. Automatic segmentation, inpainting, arbitrary action synthesis, a general timeline editor and cloud infrastructure are outside this roadmap.

## Tracking and completion evidence

v0.13 is the active version. v0.12 cinematic iteration is deferred with its existing implementation retained. All seven engine recipes and eight-second fixtures are available; the actual episode sequences and final editorial QA remain pending.

For each milestone, record its status, scene/input version, source hashes, preview or sequence location, actual temporal inspection method, targeted checks, defects/repairs and measured effort in a short implementation note linked here. Do not label any preset shipped until a rendered event exists.

| Completion evidence                      | Current state                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 28-source design study and timing ledger | Available; design evidence only                                                                   |
| Seven-treatment implementation research  | Complete; [sources and decisions](s01e01-story-motion-research.md)                                |
| Symbolic access-motion sketch            | Available; concept explanation only                                                               |
| M0–M6 implementation/previews            | Seven redesigned previews and local narrated ST-013/014 candidate delivered; full episode pending |
| Independent integrated editorial review  | Pending narrated episode assembly                                                                 |
| Finished S01E01 candidate                | Pending integration and episode QA                                                                |
| Phase 0 corpus and release decision      | Unchanged; outside this milestone                                                                 |
