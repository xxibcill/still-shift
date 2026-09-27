# Next atomic batch — visibility and sequences

- **Date:** 2026-09-27
- **Status:** Planned; implementation has not started.
- **Baseline:** `28c24cb` — RC-07–09, following RC-01–06. See the [authoring guide](./reusable-components.md) and [behavior verification record](./review/reusable-components/behavior-verification.json).
- **Delivery:** RC-10 visibility windows and RC-11 component sequences, four gallery examples across isolated/commerce/story views, and a portable story timing fixture.

## 1. Smallest useful next responsibility

An instance can already change pose, reveal a path, switch supplied states and travel along a route. It cannot yet declare a shared visible lifetime. Starting an instance later shifts its behavior windows; its nodes still exist before that start and hold their endpoint poses afterward.

The next behavior should answer **“is this root visible at this frame?”** A separate composition operator should answer **“where do these complete instances fit in time?”** Keep these as two modules. Visibility is useful without sequencing, and sequencing should hide the work of remapping instances, shifting their timing once and assigning lifetimes.

A product-detail presentation and a phased supply diagram are compositions of existing atoms. They become proof presets for this batch, not additional primitives. More transitions, travel orientations and effect variants can wait.

## 2. Source findings

| Existing source                                                                                                                                                           | What it already does                                                                                                                                                           | Gap this batch closes                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Commerce sequencing](../packages/renderer-core/src/commerce-sequence.ts)                                                                                                 | `timeWindow` gates fragment roots over a half-open span, offsets native events and scopes effects; `sequenceCommerceFragments` lays out clips with an optional explicit start. | These accept commerce fragments. They do not schedule shared component values, state cuts or travel, and story has no equivalent visibility field. |
| [Component instances](../packages/renderer-core/src/component-instances.ts)                                                                                               | Namespaces references/cues and offsets native motions, values, cuts and travel. Repeat/stagger reuses that implementation.                                                     | There is no duration or lifetime. A new scheduler should reuse this timing expansion rather than add another offset pass.                          |
| [Prepared evaluation](../packages/renderer-core/src/prepared-scene.ts) and [commerce spatial validation](../packages/scene-contract/src/commerce-spatial.ts)              | Commerce visibility is a final opacity gate on independent scene roots, with one window per target.                                                                            | Shared definitions and story need an explicit, validated equivalent. A gate must compose with authored opacity.                                    |
| [Story event index](../packages/renderer-core/src/story-event-index.ts)                                                                                                   | Tracks inclusive behavior windows, half-open flows and zero-duration state points separately. Explicit cue links control retiming.                                             | Visibility must retain an exclusive end, including `frameCount`, through indexing, edits and packaging.                                            |
| [Commerce effects renderer](../packages/renderer-core/src/commerce-effects-renderer.ts) and [illustrated renderer](../packages/renderer-core/src/illustrated-renderer.ts) | Exposure clamps to native visibility/state cuts; drawing includes groups, effect layers and independently evaluated story flows.                                               | Shared visibility must suppress the whole root output, including auxiliary drawing, and supply exposure cut boundaries.                            |

These are local source findings. This batch requires no new library, service or rendering backend.

## 3. Queue and two consumers

| ID        | Module / kind                                 | Proposed small interface                                                                                                                                                                                         | Commerce consumer                                                                                                    | Story consumer                                                                                           |
| --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **RC-10** | **Visibility Window** — discrete behavior     | `showComponentDuring({ id, target, window: { start, end, cue? } })` returns a serializable root gate.                                                                                                            | Show a supplied detail inset and its caption only during their presentation span, while the product remains visible. | Show a phase marker and label only during their named narration span, while the diagram remains visible. |
| **RC-11** | **Component Sequence** — composition operator | `sequenceComponents(clock, clips)` returns ordinary resolved instances accepted by both existing adapters. A clip supplies a definition, instance ID, duration and optional start/placement/external references. | Present three independent product-detail instances in order using supplied crops and labels.                         | Present three independent supply phases using the current symbolic route, marker and state behaviors.    |

Names are proposed until implementation; the contracts below are the acceptance criteria. Both consumers use existing assets and pinned fonts. No new product or historical claims are inferred.

### RC-10 contract

- Use integer **half-open** windows: visible when `start <= frame < end`. Require `0 <= start < end <= frameCount`. A one-frame window is valid. At fractional exposure samples, use the same comparison without rounding. There is no easing or fade built into the gate.
- Inside the window, preserve evaluated opacity; outside, contribute no pixels. Ordinary fade tracks/value bindings can coexist because the gate limits visibility instead of becoming another opacity writer. Hidden nodes still have deterministic state and geometry for valid dependencies.
- Initially support independent **scene roots**, including authored groups and their descendants. Do not create wrapper groups or add general subtree gating. A definition-local root parented to an external node is not a scene root; reject it with the instance and target identified.
- Allow one shared window per target, with a unique ID/cue. Reject another shared gate or native commerce visibility on the same target. Multiple on/off spans on one target are deferred; authors can use independent instances.
- Root gating must suppress descendants and auxiliary output associated with that root. Inspect story flow drawing, commerce matte sampling and effect/echo compositing explicitly. A hidden root must not leak tokens, highlights or historical echo samples. Unrelated scene-wide effects retain their own scope. If a particular attachment cannot honor the gate, reject that combination before preview instead of silently rendering it.
- Extend the existing commerce exposure cut list with shared gate starts/ends, preserving current clamping and stationary-image optimization behavior. No sample should blend across an appearance/disappearance boundary.
- Keep typed reference remapping and cue namespacing in `instantiateComponent`. Offsets apply once. Initially cap shared gates at 100 per scene; in commerce, native and shared visibility entries together must also remain within 100. Existing node and behavior limits remain unchanged.
- Register visibility as a distinct story event kind with `endExclusive: true`. Preserve this through timing slots, cue links, absolute timing, unlink, undo/redo and source export. The editor should identify the end as exclusive; state cuts remain points and motion endpoints remain inclusive.

### RC-11 contract

- Accept definitions with timing expressed from local frame zero, not already shifted instances. A clip record contains `{ definition, id, duration, start?, offset?, external? }`. `duration` is a positive integer; `start`, when present, is a nonnegative integer.
- Begin a cursor at zero. An omitted start uses the cursor; after every clip set the cursor to that clip's `start + duration`, matching existing commerce sequence semantics. Explicit starts may create gaps or overlaps. Preserve input order for drawing; no automatic crossfade or sorting by start.
- Validate every local timing field before expansion: motion/value/travel inclusive endpoints must be **less than duration**, cuts must lie in `[0, duration)`, and local visibility ends may equal duration. Reject overflow instead of truncating, stretching motion or changing states. Static one-frame clips are valid; positive-duration motion requires enough frames for both endpoints.
- Resolve each clip through the existing instancing module with its chosen start. Shift motions, scalar windows, travel windows, state points and explicit visibility exactly once. Add a full-duration gate to each ungated root. An existing local gate is retained within the clip; never widen it or emit a second writer.
- Require independent instance IDs and namespace generated lifetime cues without collisions with authored cues. Reuse existing assets/fonts dependency identity checks and typed exports. Return the same instance shape the commerce/story adapters already consume.
- Allow explicit references to persistent scene nodes for relationships. Initially reject references to nodes owned by another clip and externally parented roots. Sequencing must not infer dependency ordering or hide external targets. Callers combine relationships requiring wider lifetimes outside the sequence.
- Cap the initial list at 32 clips, then enforce expanded limits: 200 nodes, 100 commerce events, 40 story moves, 40 cuts per state schedule, 100 shared cuts, 32 travellers and the visibility cap. Uniform scale expansion still counts as two commerce events. Report the failing clip/target and actual expanded count.
- Sequence records remain **authoring input**, resolved before compilation. No new runtime playback clock, mutable cursor or general timeline graph is introduced. The scheduler accepts only the common component vocabulary; native commerce effects and story recipes remain scene-level authoring.

For example, two static definitions with durations 24 and 30 and no explicit starts occupy `[0,24)` and `[24,54)`. Their last visible integer frames are 23 and 53. A state cut at local frame 0 of the second definition resolves to frame 24; it is immediately visible when that clip appears.

## 4. Timing edits and serialization

Keep the distinction between authoring and resolved scenes explicit:

- Editing a clip start/duration in gallery settings re-resolves the sequence. Moving a clip shifts all its owned timing; changing its duration recomputes subsequent cursor-based starts but does not rescale internal motions. Invalid changes retain the previous valid preview and disable export.
- Resolved story templates contain ordinary events and visibility windows. Editing a visibility cue changes visibility only. To move an entire demonstration phase, bind its lifetime, motions, travel and state points explicitly to one cue with their local offsets and appropriate durations. Moving that cue then shifts those declared links together. Do not imply that moving a gate automatically moves its contents or other phases.
- In the story proof, give each phase an explicit cue so an edit to the middle phase can be verified without moving its neighbors. Keep gate duration, inclusive motion duration and zero-duration cuts distinct. A one-frame gate uses duration 1; a cut uses duration 0. Existing beat boundaries remain locked.

Reserve strict `component-3` and `scene-components-3` readers for the shared gate field, retaining v1/v2 readers and fixtures unchanged. Expand instancing/merging checks that currently branch specifically on v2 so newer versions retain state and travel data. Opt-in runtime semantics require new commerce/story renderer versions and render-cache identities; old scenes keep their versions.

Use `reusable-demo-3` for new timing examples and settings. Save editable sequence settings plus resolved scenes through the current settings/source ZIP paths. Story templates and E7 packages carry resolved v3 data and existing explicit cue bindings; they do not need a separate component registry or sequence interpreter. Unknown fields/versions must fail rather than be dropped.

## 5. Implementation order and deliverables

1. **RC-10:** add the gate contract, typed remapping, pure evaluation, draw/exposure integration and story event indexing together. Deliver the isolated visibility example and both composition contexts before adding scheduling.
2. **RC-11:** add one sequence module over existing instancing. Prove local validation, complete timing offsets, root gate generation, dependency merging and limit diagnostics through its public interface.
3. **Compose four examples:** `visibility`, `sequence`, `detail-sequence` and `supply-sequence`, each available in isolated/commerce/story views. The last two are presets over RC-01–11. Include adjacent clips, a deliberate gap and an explicit overlap in the examples/checks; retain all existing 39 gallery/context examples.
4. **Authoring proof:** expose clip start/duration and supplied text controls in the gallery, with settings/source/MP4 round trips. Add a story template with three phase cues and a passage that packages it through E7. Verify middle-phase edits, unlink and undo/redo.
5. **Record completion:** update the guide and queue with actual measured results in a separate timing verification record. Preserve the RC-01–06 and RC-07–09 records and experimental status.

Likely implementation sites are the component contracts, `component-instances`, a focused visibility module, a sequence module, the shared evaluator/render paths and story event index. Reuse commerce sequencing rules, but preserve the existing commerce fragment interface and its native effect scoping. Avoid copying validators or exposing a public generic timeline walker.

## 6. Release gates

| Area              | Required evidence                                                                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visibility        | Independently expected pixels immediately before/on/after both edges; one-frame windows; end at `frameCount`; nested group descendants; authored fades within a gate; persistent external targets unchanged.                  |
| Timing            | 24/30 fps; direct/random/backward seeks; fractional commerce samples and motion blur; adjacent/gapped/overlapping clips; first/last local cuts; values and travel shifted once; no implicit duration rescaling.               |
| Auxiliary drawing | Root disappearance suppresses flow/effect output and respected matte alpha; exposure and echo cannot leak across gate edges; unsupported combinations fail before rendering. Existing commerce visibility stays unchanged.    |
| Independence      | Three instances; change only the middle label and retime its explicit phase cue. The other instances retain their data and pixels. Cursor-following behavior is separately verified when editing sequence settings.           |
| Errors and limits | Duplicate IDs/cues/gates, missing/external parents, references across clips, local and scene overflow, native visibility conflicts, expanded counts and all legacy ownership checks.                                          |
| Authoring/files   | Invalid edits preserve valid pixels; v1/v2/v3 settings reload; source ZIP round trip; story half-open event edits through cue links, unlink, undo/redo; unchanged existing fixture files.                                     |
| Rendering/package | Preview versus fresh encoded output using current parity thresholds at gate edges and overlaps. Relocate the E7 package and freshly render with zero source cache reuse; compare all decoded frames and cache identities.     |
| Regression        | Affected unit/integration suites, build, lint, schema/toolchain/format checks and story/commerce/shared gallery browser suites. Run standalone browser suites sequentially to avoid the observed local Vite cache contention. |

No new test counts or parity results are claimed by this plan. The committed RC-07–09 record is the starting evidence, not verification of these proposed behaviors.

## 7. Deferred

Multiple visibility spans per target, arbitrary subtree gates, clip trimming/time stretching, loops, reverse playback, nested timelines, automatic phase dragging, crossfades, dynamic travel routes, tangent orientation, automatic routing/layout, physical simulation, new aspect ratios and new backends are outside this batch. Native commerce effects are not automatically converted into shared definitions. Engineering completion does not change creative or production acceptance.
