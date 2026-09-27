# Next atomic batch — motion, state and path travel

- **Date:** 2026-09-27
- **Status:** RC-07–09 implemented together at the owner’s request; see the [guide](./reusable-components.md) and [verification record](./review/reusable-components/behavior-verification.json). Examples remain Experimental.
- **Baseline:** `bde52d6` — RC-01–06, with shared instances, layout, repetition, annotations, values, gallery and export/package verification.
- **Implementation commit:** `28c24cb`. The delivered follow-up is [RC-10–14: visibility, sequences, pins, text fitting and masks](./reusable-components-timing-batch-plan.md).
- **Delivery:** Three bounded behavior modules, five gallery examples in isolated/commerce/story views, two composed proofs, and a portable four-beat story workspace. Existing atoms and renderer are reused.

## 1. First-principles choice

The project can already draw objects, place copies, connect targets and display a number. The next repeated authoring decisions are:

1. **How does this object change its pose or reveal?** Share scale, rotation and draw controls across the two authoring adapters.
2. **Which supplied version is visible at this frame?** Select an authored image or text state at exact cuts.
3. **Where is this object along an authored route?** Place one node using bounded progress along a path.

These responsibilities are useful separately. A product demonstration and a story diagram can combine them without introducing a new rendering primitive for each scene. A before/after card, a route demonstration and a step indicator should remain presets built from these modules.

## 2. What the source already supports

| Existing implementation                                                                                                 | Actual gap                                                                                                                                                                            | Source                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commerce Scale, Rotate and Path Draw; story scale/rotation moves and draw/retract choreography                          | `component-1` ordinary motions only accept x, y and opacity. Shared numeric bindings already support scale and reveal, so these are authoring/interface gaps.                         | [Commerce motion](../packages/renderer-core/src/commerce-motion.ts), [story motion](../packages/scene-contract/src/story-motion.ts), [definitions](../packages/scene-contract/src/components.ts), [value bindings](../packages/scene-contract/src/component-data.ts)            |
| Prepared image/text states and step-key evaluation; story `category_swap` selects a subject and optional caption states | No general shared state schedule. Commerce events deliberately exclude `state`.                                                                                                       | [Prepared nodes](../packages/scene-contract/src/prepared.ts), [story compiler](../packages/renderer-core/src/story-scene.ts), [commerce events](../packages/scene-contract/src/commerce.ts)                                                                                     |
| Polyline length/sampling, legacy node followers and story flow particles                                                | Legacy following adds path x/y and subtracts half the target size. It is not a general transform/camera-aware relationship. Story flows draw particles, not arbitrary prepared nodes. | [Path sampling and followers](../packages/renderer-core/src/prepared-scene.ts), [story flows](../packages/renderer-core/src/story-flows.ts)                                                                                                                                     |
| Shared world matrices, camera projection, inverse transforms, instance remapping and ownership checks                   | A path relationship must combine these through one tested interface instead of copying coordinate logic into callers.                                                                 | [World matrices](../packages/renderer-core/src/commerce-geometry.ts), [annotations](../packages/renderer-core/src/component-annotations.ts), [instancing](../packages/renderer-core/src/component-instances.ts), [ownership](../packages/renderer-core/src/component-values.ts) |
| Commerce time windows and fragment sequences                                                                            | Shared component lifetime is still a separate gap. This batch does not generalize that operator or turn state cuts into visibility clips.                                             | [Commerce sequencing](../packages/renderer-core/src/commerce-sequence.ts)                                                                                                                                                                                                       |

These are local source findings. There is no external library or service dependency in the proposed batch.

## 3. Queue and two consumers

The implemented public helpers are `scaleComponent`, `rotateComponent`, `drawComponent`, `stepComponentState` and `travelComponentPath`. The following table preserves the batch contract.

| ID        | Module / kind                                                 | Small interface and ownership                                                                                                      | Commerce consumer                                                                   | Story consumer                                             | Completion behavior                                                                                                                                                    |
| --------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-07** | Shared **Scale, Rotate and Draw** helpers — behavior adapters | Target handle, endpoint, frame window and easing. Uniform scale owns both axes; rotation owns rotation; draw progress owns reveal. | Emphasize a supplied product detail and draw its leader.                            | Emphasize a diagram subject and draw a relationship.       | Same definition has the same sampled pose/reveal in both adapters, including delayed starts and adjacent segments. Unsupported targets and conflicting ownership fail. |
| **RC-08** | **State Step** — discrete behavior                            | Target, explicit initial state, ordered `{id, frame, state}` cuts. Owns state selection on one image or text node.                 | Switch a detail inset between supplied crops and synchronize its supplied captions. | Switch a supplied symbolic subject/caption at a named cue. | Exact state on the cut frame, arbitrary/backward seeking, independent instance edits, pinned text measurement and exposure without blending across the cut.            |
| **RC-09** | **Path Travel** — spatial relationship                        | Target, path handle, from/to progress, window and easing. Owns target x/y and aligns its authored origin to the path point.        | Move a focus marker along an explicitly drawn feature route.                        | Move one resource marker along a supply route.             | Nested transforms and story cameras are applied exactly once. Reverse travel, endpoint holds, fractional commerce samples and dependency errors are deterministic.     |

Both consumers are implemented **engineering fixtures** using existing assets and pinned fonts. Their supplied crops and symbolic captions demonstrate behavior, with no commercial benefits or historical claims inferred.

### RC-07 contract

- Reuse native commerce events and story moves for scale/rotation. Keep uniform scale in `(0, 4]`, with initial scale 1 for this first interface; rotation starts from the authored node rotation. Angles follow their supplied signed values, with no inferred shortest turn.
- Reuse RC-06 value/reveal bindings for shared draw progress where they already express the operation. Support paths and rectangles with explicit `from`/`to` in `[0, 1]`, including partial drawing and retraction. Text reveals retain their existing story-specific policies.
- A window holds its initial value before `start` and its endpoint from `end` onward. Preserve inclusive endpoints, adjacent-segment continuity and native conflict checks. Do not create multiple whole-timeline value bindings to simulate sequential segments on the same property; combine a supported schedule or reject it clearly.
- Preserve the authored origin and instance hierarchy. Uniform scale must not stretch product images or insert wrapper groups. Named cues must remain addressable after repeat/stagger and template packaging.
- Test expansion counts: one uniform scale operation may produce two commerce events. Existing node/event/move limits remain authoritative.

### RC-08 contract

- A cut selects an integer index in existing authored states. Before the first cut, use the explicit initial state; at a cut, use its new state; after the last, hold it. No crossfade, interpolation, state generation or playback history.
- Require strictly increasing integer frames inside the scene. Reject duplicate frames, missing states and duplicate writers. Keep the existing 12-text-state limit; do not rewrite legacy image-state contracts. Initially cap a shared schedule at 40 cuts and a scene at 100 shared cuts, including repeated instances.
- Prepare every referenced image/crop and measure all authored text states with the pinned font before enabling preview/export. Preserve asset hashes and exact supplied captions. Numeric text and State Step cannot both own the same label.
- Reject a shared state schedule on a node whose native story recipe already owns `state`. Preserve `category_swap` as-is. Synchronize independent image/text schedules by named cue bindings, not a new global state machine.
- Register cuts as **point events** in the story event index. Retiming a point must not invent a positive-duration window. Instance time offsets apply once; point IDs namespace independently.
- Treat shared state cuts as commerce exposure boundaries so the first frame of a new state cannot average the previous state. Include them in the existing cut/clamping and stationary-image optimization decisions.
- Existing source-image anchors/product geometry require one image state. Reject incompatible combinations rather than silently reusing geometry from the wrong state. Use a separate stateful detail inset in the commerce proof.

### RC-09 contract

- Start with one node travelling along a fixed authored polyline. The path's points do not change, but its own transform and ancestor transforms may animate. Resolve the sampled point through the existing world/camera matrix and into the target's parent/camera space, then align the target's authored origin.
- Progress stays in `[0, 1]` and measures normalized arc length in the path's local coordinates. Reverse progress is supported; values hold outside the window. Easing and nonuniform path transforms may change screen-space speed; do not promise constant pixel speed.
- The relationship owns x/y. Independent authored rotation and scale remain allowed; tangent orientation is deferred. Reject competing motion/value/follower ownership instead of adding offsets implicitly.
- Validate the spatial dependency graph before evaluating a frame. Reject target/path identity, cycles through parents or relationships, zero-length paths, and transforms that cannot be inverted. Reuse the existing treatment of repeated adjacent points.
- Initially reject paths driven by native connectors, RC-05 annotations or another path-travel dependency. Following dynamically rebuilt geometry needs a separate dependency/evaluation design. Do not replace the legacy follower or looping flow behavior.
- Route visibility and traveller visibility remain separately authored. There is no implicit loop, automatic obstacle avoidance, routing or concealment behind unrevealed path portions. Initially cap shared travellers at 32 per scene.

## 4. Integration and serialization

Keep the public interface small: definitions plus exported handles and explicit dependencies. Instancing remaps typed references, not arbitrary JSON strings. Scheduling operators must shift all new windows/cuts exactly once and reject overflow after expansion.

Reserve `component-2` for newly serialized motion/state/travel authoring and `scene-components-2` for new resolved relationships. Preserve strict readers for version 1 and leave old fixtures unchanged. Draw helpers that only emit existing v1 value/reveal data can keep that version. New fields must never be silently dropped. New runtime semantics require an opt-in renderer version and render-cache identity coverage.

The main implementation locations are the component contracts, instance adapters and shared evaluator, with native compiler/event-index changes where needed. Add focused `component-state` and `component-travel` modules if they hide real shared implementation. Extract coordinate/dependency logic when both annotations and travel use it; avoid a second competing matrix evaluator.

Expose the new controls in the existing shared gallery. Add settings round trips, resolved source ZIPs and MP4 export; include the new state/travel data in a story template and E7 package. Keep the previous valid preview after invalid changes. Preserve undo/redo and named timing when the resulting template is edited in the story workspace.

## 5. Execution order and release gates

1. **RC-07 first:** an isolated scale/rotate/draw study and both composition contexts. Verify baseline and endpoint equivalence before widening the definition contract. This is the smallest useful first commit.
2. **RC-08:** implement step selection, point-cue indexing, ownership and exposure cuts together. Deliver the detail-inset and story-symbol proofs, including caption preparation.
3. **RC-09:** implement path travel only after the two consumers have explicit paths and target origins. Verify parent/camera conversion independently before gallery integration.
4. **Compose the proofs:** a **Product detail tour** and a **Supply-route change**. Each combines RC-07–09 with existing instances, annotations and values. This is integration work, not a fourth new atom.
5. **Record and release:** update the guide, scope/status table and verification record with actual commands/results. A higher example count alone is not completion.

For every module, require an isolated example and both composition consumers. Test three repeated instances, edit only the middle one and retime its named event; unrelated instances must retain their data and pixels. Include these checks:

| Area                 | Required evidence                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time and state       | 24/30 fps; before/start/end/after samples; immediately before/on/after each state cut; zero-frame cuts where supported; direct, random and backward seeks; fractional commerce samples and motion blur.    |
| Coordinates          | Explicit origins, nested parents, rotating/scaling path parents, screen-locked versus camera-projected story nodes, reversed progress, singular transforms and cycles.                                     |
| Ownership and limits | Native recipe/track conflicts, numeric/state conflicts, reference/cue collisions, source-geometry restrictions, repeat expansion and unchanged scene limits.                                               |
| Rendering            | Independent pixel references for state cuts/exposure and transformed path positions; preview/encoded parity using current thresholds, with actual comparisons recorded.                                    |
| Authoring and files  | Invalid edits preserve valid pixels; settings/source reload reproduces output; story template parameters/cues survive edit/undo/redo; relocated packages retain cache identity and freshly decoded frames. |
| Regression           | Existing RC-01–06 fixtures and legacy story/commerce behavior remain unchanged; run the affected unit/integration/browser suites, build, lint, schema and formatting checks.                               |

The [RC-01–06 record](./review/reusable-components/verification.json) remains the baseline. The [RC-07–09 record](./review/reusable-components/behavior-verification.json) contains the commands and measured results for this implementation.

## 6. Deferred from this batch

Shared visibility clips/sequence composition, tangent orientation, dynamically rebuilt travel paths, crossfades between states, general state machines, automatic layout/routing, physics, new rendering backends and aspect ratios remain separate work. Additional blur/glow variants have lower reuse value than closing the authoring gaps above. Existing examples remain Experimental; production or creative acceptance is a separate decision.
