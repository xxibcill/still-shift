# S01E01 story motion — implementation research

**Researched:** 2026-09-26 · **Status:** research complete. This is the pre-implementation research snapshot; see the [current implementation and rendered proofs](story-motion-implementation.md).

**Recommendation:** build the seven treatments on Still Shift's existing Canvas renderer. Established tools provide useful patterns for staged reveals, attached annotations, discrete replacement and object continuity. The principal work here is authoring meaningful events, preparing clean components and compiling exact frame timing.

This brief supports the [story-motion roadmap](s01e01-story-motion-roadmap.md) and [28-still design study](../prompt-packs/s01e01-motion-design.md). The seven names are our proposed recipes. They are not off-the-shelf effects found in the references.

## Research coverage

We inspected first-party documentation, worked example code, a primary research paper and the current local contracts/compiler/renderer. Each treatment has at least two implementation precedents in the detailed reports below. External demo videos were not played and no new motion was rendered during this research. Statements about suitability for S01E01 are design recommendations, awaiting visual proof.

| Proposed treatment                            | How others implement analogous behavior                                                                       | Recommended S01E01 implementation                                                                                                       | Detailed findings                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Unequal Margins** · `unequal_margins`       | Motion shared layouts preserve identity; Manim's brace updater derives annotations from controlling geometry. | Keep equal-scale household anchors fixed. Move separate pressure/bracket parts into qualitative conditions. Carry the pair into access. | [Comparison/access report](research-story-comparison-access.md#1-unequal-margins)        |
| **Access Constraint** · `access_constraint`   | Adobe separates matte from content and binds path geometry to controls.                                       | Move rigid restriction sides around a continuous route. Keep the store available and the narrowed opening visibly passable.             | [Comparison/access report](research-story-comparison-access.md#2-access-constraint)      |
| **Relationship Build** · `relationship_build` | GSAP progressively draws strokes; Manim staggers groups; Motion Canvas derives dependent properties.          | Reveal token-free relationships at narration cues, transfer emphasis, then regroup with attached endpoints.                             | [Relationship/resolve report](research-story-relationship-resolve.md#relationship-build) |
| **Evidence Boundary** · `evidence_boundary`   | Adobe mattes limit disclosure; Motion Canvas composes sequential and overlapping stages.                      | Disclose supported groups, then expose an explicitly labeled unknown region and the limit of comparison.                                | [Evidence/crisis/swap report](research-story-evidence-crisis-swap.md#evidence-boundary)  |
| **Dated System Break** · `dated_system_break` | Motion Canvas uses named timing events; Remotion gives scenes explicit frame lifetimes.                       | Hold readable crisis context before authored path gaps. Cut to a separate later context with unknown conditions.                        | [Evidence/crisis/swap report](research-story-evidence-crisis-swap.md#dated-system-break) |
| **Category Swap** · `category_swap`           | Adobe Hold interpolation gives discrete changes; Manim distinguishes retained and replaced parts.             | Replace one registered category state in a fixed slot. Surrounding anchors and qualifications persist.                                  | [Evidence/crisis/swap report](research-story-evidence-crisis-swap.md#category-swap)      |
| **Motif Resolve** · `motif_resolve`           | GSAP Flip matches identity across layouts; Manim matching transforms retain recognizable components.          | Move familiar motifs between authored poses, consolidate the conclusion, then isolate land → rent/service.                              | [Relationship/resolve report](research-story-relationship-resolve.md#motif-resolve)      |

The reports include direct source links, observed mechanics, our adaptation, asset requirements, proposed event schedules, code touchpoints and motion-specific checks. No new animation dependency is proposed.

## What should make the episode engaging

The visible question must develop: comparison becomes unequal response; availability becomes constrained access; a store becomes a network of dependencies; an inventory becomes an evidence limit. Each sequence needs a readable starting relationship, an observable change and a held consequence. This is our editorial hypothesis for these stills.

Heer and Robertson's DynaVis study examines animated transitions in statistical graphics. Its results support useful staging in some tasks, while excessive staging performed worse in others. It does not test historical-video audience retention. We therefore borrow restrained staging and continuity, rather than treating more animation as a guarantee of engagement. [Original paper, especially §§6.2–6.3](https://idl.cs.washington.edu/files/2007-AnimatedTransitions-InfoVis.pdf)

For S01E01, inspect movement with the actual narration. A long passage needs developments in composition and meaning; repeated label entrances or a slow zoom cannot supply those developments. Preserve pauses after consequential changes. The detailed proof schedules are experiments, not universal pacing formulas.

## Shared implementation decisions

### 1. Integer frames must be authoritative

The current [prepared v1 contract](../packages/scene-contract/src/prepared.ts) requires integer `durationMs` between 3,000 and 8,000 and a whole derived frame count. The first narrated proof is **646 frames at 24 fps**, or **26,916.666… ms**. Increasing the duration maximum alone cannot represent it. Rounding milliseconds or padding the master edit would change the agreed timing.

Introduce a distinct additive story input with integer `frameCount`, integer event frames and a separate episode offset. Derive seconds/milliseconds for display and adapters. Preserve legacy illustrated v1 behavior. [Cinematic v2](../packages/scene-contract/src/cinematic.ts) has an image-layer-specific shape and inherits duration restrictions; a higher version number does not make it suitable for graphs and text.

Audit the [prepared engine adapter](../packages/animation-engine/src/prepared-animation-engine.ts), CLI/result contracts and [export worker](../tools/export-worker/src/export-worker.ts) together. The worker currently checks strict equality against `durationMs * fps / 1000`; the new route must validate authoritative frame counts without brittle floating-point round trips. Keep exact encoded-frame verification. Four-to-eight-second fixtures can still establish the first motion before the long passage is assembled.

### 2. Compile narration cues into explicit windows

Motion Canvas exposes named time events for voiceover alignment. Our adaptation is a simple cue-to-frame map in authored input, resolved before export; it does not require its editor or generator runtime. [Time Events](https://motioncanvas.io/docs/time-events/)

Use a consistent convention: clip frames are zero-indexed, scene ranges are half-open, and transition start/end keys explicitly state when the destination is reached. Keep an end-boundary sentinel distinct from an actual rendered frame. Specify anticipation, change and reading hold. Do not stretch the legacy seven-second schedule to fill a minute of narration.

Maintain a pure `evaluate(scene, frame)` model. Remotion's frame-derived animation is the relevant precedent for reproducible sampling. Our evaluator should never require previous playback, an accumulated delta or an `onComplete` callback to establish historical context or category state. [Animating properties](https://www.remotion.dev/docs/animating-properties)

### 3. Accumulate tracks and separate continuous from discrete changes

In the current [prepared compiler](../packages/renderer-core/src/prepared-scene.ts), `track()` replaces a node/property's existing key array. Multiple story events therefore need a collector that sorts and validates keys before emitting one track per property. Reject conflicting writes rather than accepting whichever helper ran last.

Reuse clamped smoothstep for moving parts and opacity. Compile category changes to existing step semantics. Require the old category immediately before the switch and the new category at the switch, including backward or random seeks. Do not interpolate image-state indices through unintended intermediate illustrations.

### 4. Preserve identity and connected geometry

Separate semantic IDs from image asset IDs: two households may use the same artwork but represent different roles. Store registered ground/contact anchors and entry/exit poses. Compare continuity in world coordinates, including parent transforms, crop, state and opacity.

The [renderer](../packages/renderer-core/src/illustrated-renderer.ts) can reveal static paths and transform groups. Static path endpoints do not automatically follow independently moving cutouts. Start with fixed connected nodes; move a rigid assembly through its common parent. Add bounded anchor-derived line geometry when M2/M5 regrouping requires it. Evaluate node poses before connector geometry; avoid a general constraint solver or dynamic reparenting.

### 5. Validate the claim carried by the motion

Validation and visual review must agree on each recipe's meaning:

- Unequal Margins uses qualitative conditions, without fabricated reserve ratios.
- Access Constraint keeps the source and connection present. The existing path `gap` operator means severance and is unsuitable for narrowing.
- Relationship Build has optional tokens; paths do not automatically mean transported grain or quantified flow.
- Evidence Boundary makes unknown distinct from absent or zero; classification is authored data, not inferred from opacity.
- Dated System Break requires a genuinely readable context interval before the first break. Merely referencing a date node is insufficient.
- Category Swap preserves the qualification across both states and avoids an invented physical transformation.
- Motif Resolve preserves known identities and introduces no new eviction, punishment or threshold action.

These constraints come from the local episode study. The external libraries establish drawing techniques, not historical claims.

### 6. Keep episode assembly timing explicit

Remotion documents that overlapping transitions shorten combined scene duration. Preserve the locked **11,297-frame** episode with explicit placements; a dissolve must not silently subtract frames. ST-021/022 should use adjacent distinct contexts, with no animation that heals the famine graph into the later period. [Transition duration accounting](https://www.remotion.dev/docs/transitioning)

Still Shift supplies motion clips and handoff metadata. Narration, sequence placement and final captions remain in the episode's Remotion assembly.

## Preparation order and proof requirements

| Slice | Preparation informed by this research                                                                   | Evidence needed before expansion                                                   |
| ----- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| M0    | Frame-authoritative story contract; cue windows; validated track collection; first household/store kit. | Exact-frame load/export path, deterministic seeking and preserved legacy behavior. |
| M1    | Rigid pressure parts and restriction sides; shared paired anchors.                                      | One short illustrated event, then exact 646-frame ST-013/014 narrated proof.       |
| M2    | Token-free reveals; endpoint attachment where nodes regroup.                                            | Readable changing dependencies through ST-006–008, without a static radial board.  |
| M3    | Supported/unknown classifications; clean clipped groups; persistent qualifier.                          | The evidence-limit relationship changes visibly across ST-017/018.                 |
| M4    | Context-readiness interval; authored gaps; separate later entry state.                                  | Date-before-break ordering and a neutral ST-022 context reset.                     |
| M5    | Registered state replacement; named motif poses and boundary continuity.                                | Category switch remains conceptual; closing motifs synthesize prior material.      |
| M6    | Shared lab/export evaluation and exact frame manifests.                                                 | Integrated episode QA, with actual playback/inspection method recorded.            |

Each detailed report specifies targeted edge cases. Across the implementation, check event-boundary frames, random and backward seeks, 24/30 fps, connector attachment, qualifier readability and preview/export agreement. Inspect temporal playback as well as endpoints; collisions, detached paths and misleading event order often occur between the final poses.

## Research completion record

- All seven motions have first-party implementation precedents and proposed Still Shift adaptations.
- The three detailed reports distinguish documented behavior from our proposed staging.
- Existing local source was inspected in the working tree on 2026-09-26; concurrent code changes may require rechecking touchpoints when implementation starts.
- No renderer changes, dependency additions, generated media or episode asset amendments were made for this research.
- Remaining uncertainty is practical: asset preparation quality, narration fit and whether the illustrated movement reads well. The first short M1 proof resolves those questions more directly than additional broad research.
