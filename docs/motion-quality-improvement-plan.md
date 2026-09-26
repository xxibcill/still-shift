# Motion quality improvement plan

**Date:** 2026-09-26 · **Status:** hierarchy correction delivered after user rejection of v011; readability/creative and audiovisual acceptance remain open

The [implementation report](motion-quality-implementation.md) records the seven-scene gallery, before/after comparison, two narrated candidates, authoring diagnostics, independent frame review and verification results. This document retains the intended sequence and acceptance criteria; external episode integration and unavailable audiovisual assessment are not marked complete.

Improve how clearly viewers understand each animated explanation, how satisfying its arrival feels, and how well the sequence supports narration. This plan implements the findings of the [motion principles audit](motion-principles-audit.md) within the active v0.13 Story Motion work.

The first deliverable is a before/after comparison of Evidence Boundary, Relationship Build, and Motif Resolve. After those improvements are demonstrated, apply the relevant changes across the seven-scene library and the existing narrated proof, then complete the next narrated passage in the [episode roadmap](s01e01-story-motion-roadmap.md).

## Decisions and constraints

- Use the existing Layered Chronicle illustration family, fonts, palette, event compiler, renderer, and export path.
- Let one idea lead each beat. Supporting movements may overlap when they reinforce that idea.
- Preserve exact category cuts, historical context resets, attached connectors, fixed stock silhouettes, open access, and evidence qualifiers.
- Treat hold durations and motion intensity as editorial choices. Numerical targets below are review starting points, with explicit reasons for exceptions.
- Keep existing episode frame boundaries and narration authoritative. The local ST-013/014 proof remains 646 frames at 24 fps, with its cut at local frame 334/master frame 5082.
- Produce new versioned review artifacts. Recheck current episode authority before applying derivatives to the external episode assembly; local fixture improvements can proceed independently.
- Current scope is Story Motion quality and its reusable authoring checks. Broader cinematic and commerce adoption follows evidence from this pass. Full S01E01 delivery continues under the existing M1–M6 roadmap.

## Delivery sequence

| Step                              | Concrete change                                                                       | Reviewable output                                                                  | Completion check                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1. Readability and composition    | Promote essential qualifications and simplify dense frames                            | Before/after Evidence Boundary still and short preview at full size and phone size | Main idea and evidence limits are readable at the intended displayed width                    |
| 2. Timing and focal hierarchy     | Refine Relationship Build's late regroup and Motif Resolve's closing beat             | Two before/after motion comparisons with measured holds                            | Final relationship has deliberate quiet time and the eye follows the intended order           |
| 3. Narrated sequence and sound    | Recheck ST-013/014, then stage ST-006–008 as narration-sized developments             | Updated 26.917-second proof and a 62.792-second relationship passage candidate     | Clear visual argument, meaningful changes in energy, preserved timing, intelligible narration |
| 4. Authoring feedback             | Add advisory checks for short holds, small essential text, and competing focal groups | Shared diagnostics in the lab and a render-side quality report                     | Known problem cases are flagged; deliberate supporting overlap remains valid                  |
| 5. Final verification and handoff | Inspect all seven treatments, conformed proofs, and technical behavior                | Versioned gallery, evidence report, and updated roadmap                            | Visual findings resolved or explained; relevant technical checks pass                         |

Steps 1–2 establish the first visible improvement. Step 3 tests it in context. Step 4 uses those decisions to prevent regressions. Step 5 closes the pass without implying that every remaining episode milestone is complete.

## 1. Make important text readable at its actual viewing size

Start with Evidence Boundary because its qualifications carry the meaning of the scene. Design the held composition before adjusting its entrances.

Work:

- Classify the title, primary labels, evidence limits, dates, and incidental text. Essential qualifiers must remain readable independently of the headline.
- Promote “Not a recovered pantry,” the unknown details, and the inventory qualification. Adjust columns, illustration size, and line breaks together; retain the supported/unknown/composite distinction.
- Shorten copy only when its historical meaning is preserved. If the composition remains too dense, distribute the explanation across narration-sized beats.
- Review the other six treatments for the same issue, including the dated reset and category comparison. Apply shared text-role choices through the existing design helpers where useful.
- Inspect a 390 px-wide video and the narrower actual player width inside the phone gallery. A 390 px viewport with gutters does not contain a 390 px-wide video.

Revision after user feedback: do not use this target to enlarge all text uniformly. Preserve hierarchy, whitespace and illustration balance; reopen readability review when these conflict.

Starting target: essential secondary copy should aim for at least 14 displayed pixels at the selected phone viewing width. At a full 390 px video width, that requires about 69 px on a 1920 px canvas; narrower players require larger source type. Use actual rendered reading comfort and composition to choose final sizes. This target is an internal design heuristic, not an accessibility certification.

**Deliverable:** one revised Evidence Boundary hold and preview first, followed by the relevant seven-scene typography changes. Include full-resolution and actual-size phone comparisons; record the display width used.

**Acceptance:** essential qualifications can be read without zoom at that width; labels do not collide with illustrations or paths; known, unknown, and composite remain distinguishable without color; no essential information is removed to achieve the target.

**Likely files:** `scripts/story-motion/scenes.ts`, `scripts/story-motion/design.ts`, generated story fixtures, and the gallery capture/review workflow. Use `/typeset` and `/arrange` during implementation.

## 2. Give the ending a clear arrival and a useful hold

| Treatment          | Current behavior                                                                   | First experiment                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relationship Build | Final regroup and restored emphasis end at frame 166, leaving 1.08 s fully settled | Compare the current version with a version that removes the small late positional regroup. Restore the final emphasis earlier and preserve the line → destination → settle order. |
| Motif Resolve      | Outgoing arrow finishes at frame 154, leaving 1.58 s fully settled                 | Finish the initial grouping earlier, allow a brief quiet interval, then draw the land → rent/service connection and hold.                                                         |

For the eight-second studies, test approximately 2–3 seconds of fully settled composition. Finishing by frame 144 yields 2 seconds; finishing by frame 132 yields 2.5 seconds. Select the timing by comparing the complete beat, not by optimizing the number alone. Earlier visible labels also contribute reading time.

Work:

- State the leading subject and the purpose of each movement before retiming it.
- Remove a movement when its explanatory purpose is unclear. Keep distinct easing for strokes, arrivals, pressure, and fractures.
- Use the existing staggered endings as restrained follow-through. Add anticipation only where preparation makes an action easier to understand.
- Review whether simultaneous elements support one focal idea, especially during Motif Resolve's grouping. Reduce movement or change emphasis when attention splits.
- Preserve the other treatments' useful stillness and exact cuts. Category Swap's long quiet result does not need extra motion to fill time.

**Deliverable:** synchronized before/after clips, endpoint frames, and a short timing table for the two changed studies. Reuse the existing comparison workflow; make its comparison text describe this pass accurately.

**Acceptance:** no detached connectors or altered semantic relationships; a clearly identified ending; no unexplained late movement; recorded settled-tail duration; normal-speed temporal review alongside frame inspection. Recorded automation must remain distinct from perceptual review.

**Likely files:** `scripts/story-motion/scenes.ts`, generated fixtures, and `scripts/story-motion/gallery.ts` for accurate comparison labels. Use `/animate`, followed by a focused `/critique`.

## 3. Prove rhythm and sound in narrated passages

First refresh the existing ST-013/014 proof with the applicable readability changes. Its fixed 646-frame structure and shared households provide a small continuity check. Verify the current narration source/hash and the spoken cue onsets before rendering.

Next develop ST-006–008, master frames 1940–3446, 1507 frames at 24 fps / 62.792 seconds, as the next local episode candidate under M2. Build from the current source/timing ledger and episode authority. Preview each genuinely new behavior briefly before producing the whole passage.

Create a compact beat sheet using existing frame conventions:

| Field                                   | Purpose                                                               |
| --------------------------------------- | --------------------------------------------------------------------- |
| Local and master frame interval         | Keeps editorial timing exact                                          |
| Spoken idea and cue                     | Connects the change to narration                                      |
| Leading subject and supporting elements | States where attention should go                                      |
| Prepare, change, settle, hold           | Makes breathing room explicit; phases may be omitted when unnecessary |
| Relative energy and strongest moment    | Creates contrast across the passage                                   |
| Entry and exit anchors                  | Preserves recognizable objects through edits                          |
| Required qualifier                      | Protects historical meaning                                           |
| Audio choice and reason                 | Records narration alone or a purposeful accent                        |

Stage the relationship passage as a sequence of explanations—grain, other dependencies, then household vulnerability—following the actual narration. Vary subject scale and arrangement as the argument develops. Choose camera movement or another shot treatment only when it improves a specific beat.

Review the passage visually without sound, then as a combined sound/visual sequence. If listening or continuous playback cannot actually be assessed, record that limitation and leave that acceptance item open. A playback-to-ended check cannot substitute for it.

Begin with the existing narration. Where an accent has a clear role, compare it with narration alone; keep only useful accents from assets with recorded provenance. Check speech intelligibility, synchronization, clipping, and continuity through cuts. Audio assembly stays at the sequence level and ultimately in the episode's existing Remotion workflow.

**Deliverable:** refreshed ST-013/014 candidate, a beat sheet and ST-006–008 local candidate, and an editorial review identifying the strongest moment, its preparation, and its aftermath.

**Acceptance:** correct decoded frame counts and boundaries; actual cue alignment; stable recurring identities; readable qualifiers; no unsupported quantities or causal weights; useful quiet and expressive intervals; documented audiovisual assessment. Record preparation time and repair effort to inform later estimates.

**Likely files:** `scripts/story-motion/proof.ts`, `scripts/render-story-proof.ts`, the source/timing ledger, and a small passage-specific authoring/assembly helper if the existing proof script cannot express the second passage cleanly. Use `/critique`; retain the existing episode handoff responsibilities.

## 4. Make the principles visible during authoring

Add a small, read-only motion-quality analyzer after the visual decisions above. Keep semantic validity in the scene contract and editorial advice separate. Existing valid inputs remain exportable.

Proposed seam: `packages/renderer-core/src/story-quality.ts`, consuming the compiled story scene and optional review policy. Both the lab and render scripts call the same function. The policy identifies essential text, focal groups, intended display width, preferred final hold, and documented exceptions. Use optional review metadata or a sidecar first; introduce a scene-schema addition only if persistence through scene download requires it.

Initial checks:

1. **Short final hold:** report the exact settled tail and compare it with the scene's chosen target. Default to a 2-second advisory target for these studies. Keep “settled time” separate from total reading time.
2. **Small essential text:** calculate displayed text size from authored size, relevant transforms, and actual target display width. Only flagged essential roles generate this warning.
3. **Competing focal events:** identify overlapping primary focal groups. Count a line, its arriving destination, and its label as one authored group when they support one idea. Do not count x/y tracks or child nodes as independent subjects.

Suppress false alarms from no-op tracks, invisible content, and double-counted parent/child motion. Flag overlaps as review candidates, not automatic failures. Exceptions should name the scene/interval and the reason rather than disabling the check globally. Keep exact cuts valid.

Each diagnostic includes a stable code, affected nodes/groups, relevant frame interval, measured value, and a short suggestion. Initially show these beside the lab timing controls and write a versioned `quality-report.json` beside rendered outputs. Keep editorial warnings out of export exit codes and avoid changing existing animation-result JSON contracts for this first pass.

**Acceptance:** the audit's deliberately simultaneous branches and near-zero hold are reported when the appropriate review policy is present; valid staged overlap is accepted; 24/30 fps measurements use seconds correctly; diagnostics are deterministic and do not change pixels or scene timing.

**Likely files:** new shared analyzer, `apps/lab/src/story-controls.ts`, `scripts/render-story-demos.ts`, focused unit tests, and one lab/browser integration check. Use `/harden`.

## 5. Verify the complete pass and update the handoff

Produce one fresh versioned gallery for all seven treatments after the changed examples are satisfactory. Include start, event, and final frames; phone captures at the recorded widths; timing metrics; and comparison links. Keep evidence qualifiers visible during de-emphasis.

Run relevant story/unit tests, the story preview/export and seek suite, and build/lint checks for modified code. Check frame boundaries around category cuts, context reset, and the narration proof. Run broader illustrated/cinematic checks once if shared renderer behavior changes; a layout-only pass does not require repeated unrelated regressions. Use visual comparison for typography and composition instead of implementation-mirroring tests.

The final report must distinguish:

- Measured technical results and decoded media properties.
- Sampled-frame judgments.
- Actual temporal/audiovisual review, including its method and limits.
- Remaining episode integration and creative acceptance.

**Completion:** the two readability/timing findings are resolved or have evidence-backed exceptions; the two coverage gaps have concrete new sequence-review evidence and authoring feedback; all seven library treatments retain their semantic contracts; targeted technical checks pass. Any unavailable audiovisual assessment remains explicitly outstanding.

Use `/polish` after composition and timing are settled, then rerun the seven-principle audit. Update the v0.13 roadmap with actual outcomes and links, not projected completion.

## First implementation slice

The recommended first slice is Steps 1–2: Evidence Boundary at actual phone size, then the two ending comparisons. It produces a small, visible result using current assets and renderer capabilities. Use its observed iteration effort to estimate the narrated sequence work; no calendar commitment is assumed by this plan.
