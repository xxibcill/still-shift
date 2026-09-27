# Reusable components — first principles and expansion plan

- **Date:** 2026-09-27
- **Status:** RC-01–06 implemented together at the owner's request. See the [authoring guide](./reusable-components.md) and [verification record](./review/reusable-components/verification.json).
- **Inspected baseline:** `ddbe8fa`, including commerce AC-01–14, the effects expansion, story authoring E1–E7 and the 35-example commerce gallery.
- **Purpose:** Grow a reusable authoring library for Still Shift's story and commerce work. Prioritize additions that remove repeated authoring work in both contexts.

## 1. What is the smallest useful component?

At an absolute frame, the renderer needs visible objects, their evaluated properties, their relationships and their drawing order. A reusable component should supply one of those responsibilities through explicit inputs.

The smallest useful **visual atom** is an image, text block, path or shape. The smallest useful **motion atom** changes one property over a declared frame interval, for example `fade(target, from, to, start, end)`. Uniform scale deliberately couples two axes to preserve proportions: one responsibility matters more than one numeric field.

The renderer already has these foundations. Splitting a fade into public functions for its start value, end value and interpolation would give authors more things to coordinate without adding useful capability.

| Kind                 | Responsibility                            | Examples                                     | What callers should supply                        |
| -------------------- | ----------------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| Asset                | Supplies source bytes and identity        | Illustration, product cutout, pinned font    | File, hash and relevant dimensions                |
| Visual atom          | Draws one kind of object                  | Image layer, text, path, rectangle           | Content, explicit local geometry and style        |
| Behavior atom        | Changes an owned property over time       | Translate, fade, rotate, path draw           | Target, values, frame window, easing              |
| Relationship         | Derives one result from another object    | Attached path endpoint, height-driven shadow | References, coordinate space and declared offsets |
| Composition operator | Places or schedules reusable instances    | Row, sequence, repeat, stagger               | Instances, bounds, ordering and timing            |
| Preset               | Combines these for a recognizable purpose | Callout, comparison, product introduction    | Content and a few purpose-specific settings       |

An attached callout is `text + path + attachment + optional reveal`. A comparison is `two subjects + layout + labels + coordinated timing`. A price card uses the same text and panel machinery as a historical date card. These are useful presets; each does not need its own rendering primitive.

Implementation should use deep modules: a small interface that hides dependency handling, reference management, validation and deterministic evaluation. The existing renderer and validators remain the execution path.

## 2. What already exists

These are source-inspection findings, not a new verification run. The [gallery catalog](../benchmarks/fixtures/ecommerce-motion/atoms/catalog.json) currently contains **35 examples**, including compositions; it does not contain 35 independent atoms.

| Implemented capability                                                                                                      | Source evidence                                                                                                                                                                                                                                            | Implication for the next queue                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Image, text, path, rectangle and group nodes; crop, fit, clipping, image/text states                                        | [Prepared contracts](../packages/scene-contract/src/prepared.ts), [renderer](../packages/renderer-core/src/illustrated-renderer.ts)                                                                                                                        | Reuse the existing drawing vocabulary. Groups organize other objects.          |
| Product Layer, Text Block, Path, prepared shadow                                                                            | [Product Layer](../packages/renderer-core/src/product-layer.ts), [Text Block](../packages/renderer-core/src/commerce-text.ts), [Path](../packages/renderer-core/src/commerce-path.ts), [release evidence](./ecommerce-atomic-components-implementation.md) | Generalize only the parts needed by a second real caller.                      |
| Float, translate, fade, draw, scale and rotate                                                                              | [Motion helpers](../packages/renderer-core/src/commerce-motion.ts)                                                                                                                                                                                         | Additional entrance names can often be presets over these behaviors.           |
| Fragment merging, dependency checks, track conflict/continuity checks, time windows and sequences                           | [Composition](../packages/renderer-core/src/commerce-composition.ts), [sequence](../packages/renderer-core/src/commerce-sequence.ts)                                                                                                                       | Add safe instances and repetition on top of these mechanisms.                  |
| Product landmarks, moving endpoint attachments, visible bounds, detail crops, fitted text, vertical stacks and alpha mattes | [AC-08–14 evidence](./ecommerce-spatial-components-implementation.md), [geometry](../packages/renderer-core/src/commerce-geometry.ts), [layout](../packages/renderer-core/src/commerce-layout.ts)                                                          | Anchors, scale, mattes, fitting and sequencing are already delivered.          |
| Blur, overshoot, drift, responsive shadow, focus, parallax, highlights, echo, grain, atmosphere and light treatments        | [Effects evidence](./ecommerce-motion-effects-implementation.md)                                                                                                                                                                                           | More effect variants are a lower priority than composing the existing library. |
| Story entrances/exits, moves, text reveals, anchored connectors, path flows and camera motion                               | [Choreography](../packages/renderer-core/src/story-choreography.ts), [story geometry](../packages/renderer-core/src/story-geometry.ts), [flows](../packages/renderer-core/src/story-flows.ts)                                                              | Story reuse should expose existing behavior through authoring helpers.         |
| Cue links, template slots, style profiles, continuity, editor, render cache and portable packages                           | [Story tooling guide](./story-engine-tooling.md)                                                                                                                                                                                                           | Reusable authoring must preserve event identity, diagnostics and packaging.    |

The shared drawing model is stronger than the shared authoring model. `CommerceFragment` includes commerce events and spatial/effect fields; a story scene has one validated recipe plus choreography, connectors, camera and flows. They cannot be merged by copying one JSON shape into the other.

Other concrete constraints:

- `mergeCommerceFragments` rejects duplicate node IDs; callers currently choose unique IDs themselves.
- `stackBoxes` handles explicit vertical heights. It does not provide general alignment or distribution.
- Story `assemble` already supports part offsets; it is not a general operator for repeating complete modules.
- Both modes use integer 24/30 fps clocks, but motion endpoints and visibility/flow endpoints differ. Commerce event `from` is a track initializer; story keyed motion can step at its first key. A shared adapter must preserve these distinctions.
- Commerce effects and mattes have root-target rules. Story camera projection is part of anchor evaluation. An extra grouping wrapper can change behavior.
- Existing path followers and story flow tokens already use path sampling. “Follow path” would be an extension of their authoring coverage, not a newly invented interpolation engine.
- Dynamic numeric text is absent from the inspected authoring contracts. Text states are limited to 12; hundreds of prebuilt counter states would be the wrong extension.

## 3. Rules for adding a reusable component

Add a public interface only when it has two concrete uses with different content or contexts. Prefer existing atoms when they express the behavior clearly. Keep a composition as a preset when it mainly supplies layout and timing defaults.

Every reusable module must declare:

1. **Inputs:** content, assets, style, local geometry and timing, only where relevant. A static layer needs no clock.
2. **Exports:** the node or anchor handles that other modules may target. Callers should not depend on private IDs such as `hero-art`.
3. **Ownership:** which nodes/properties it creates or changes. Two animations writing the same property must be rejected or combined by an explicitly supported rule.
4. **Dependencies:** exact image/font identities and explicit references to external targets. Identical hashes alone do not make differently declared font or asset records interchangeable.
5. **Timing and space:** local versus scene coordinates, frame origin, endpoint convention and before/after behavior.
6. **Failures:** missing targets, invalid bounds, unsupported target renderer features and timeline overflow must produce actionable diagnostics.

An authoring builder should return serializable scene data, references and authored bounds. Runtime drawing and motion use absolute-frame evaluation. Bounds must say whether they describe the authored box, source visible bounds or evaluated geometry; they must not imply an animated collision guarantee.

## 4. Implemented queue

`RC` identifies this project-wide queue. It does not reopen the completed commerce `AC` work or story `E` milestones. All six items below are implemented; the original rationale and acceptance behavior are retained.

| ID        | Addition and kind                                                      | Reuse / actual new work                                                                                                                                                                                        | Acceptance behavior                                                                                                                                                                                                                                                                |
| --------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-01** | **Safe component instances** — composition infrastructure              | Reuse prepared fields and existing fragment merging. Add instance-local node/event identities, explicit exported handles and typed reference remapping.                                                        | Three instances of one definition coexist with independent edits and timing. Parents, states, event targets and supported relationships resolve correctly; assets/fonts deduplicate under existing identity rules. Missing external references fail.                               |
| **RC-02** | **Shared core authoring in commerce and story** — adapters             | Share an actual common subset: image/text/path/rectangle/group data and selected move/fade behavior. Keep commerce events and story choreography as separate adapters into their current validators.           | The same small definition works in one commerce composition and one existing story template, with the same local geometry and supported motion. Story recipe, cues and evidence constraints remain valid. Unsupported fields are reported rather than dropped.                     |
| **RC-03** | **Align, row and distribute** — layout utilities                       | Extend the existing bounds/stack approach with measured boxes, an axis, alignment, gaps and a containing region.                                                                                               | Lay out two and five objects, a commerce feature row and a story comparison. Oversized content fails clearly. Explicit bounds make placement deterministic after fonts are ready.                                                                                                  |
| **RC-04** | **Repeat and stagger** — composition operators                         | Instantiate a definition multiple times, then apply explicit start offsets through existing timing behavior. Reuse `timeWindow`/sequence semantics in commerce and supported cue/choreography timing in story. | Three feature labels and five story markers use the same operator. All internal references/timing shift once; cue links remain addressable. Overflow, duplicate ownership and expanded node/event limits fail before rendering.                                                    |
| **RC-05** | **Anchored annotation family** — relationship integration plus presets | Reuse existing text, path, bounds and point attachment machinery. Add public presets for a leader label, an outline/underline highlight and a two-endpoint bracket.                                            | One commerce feature annotation and one story annotation follow their authored targets through supported transforms. Route/clearance is authored. Preserve commerce protected-region checks and story camera projection; bounds-based highlights do not claim silhouette accuracy. |
| **RC-06** | **Scalar value with display bindings** — new behavior capability       | Add a bounded, deterministic numeric value over time, bound to a numeric label and a bar/marker. Reuse track interpolation and prepared text/layout.                                                           | A commerce quantity and a story resource amount drive a counter and bar from the same value. Exact endpoints, decreasing/negative/decimal values where declared, fixed formatting and direct/backward seeking agree. Supplied data is preserved.                                   |

Dependencies: RC-01 → RC-02; RC-03 uses existing bounds/layout; RC-04 needs RC-01/02 and can use RC-03; RC-05 uses the shared references and current geometry adapters. RC-06 uses the same authoring, layout and verification paths. The owner requested one integrated implementation rather than separate releases.

### First implementation slice

**Delivered:** `component-1` definitions, typed instance reference remapping, exported handles and native commerce/story adapters. The shared marker has three independently editable instances; its story template exposes middle-label and named-cue parameters. Source settings, resolved scenes and E7 packages retain these edits.

Implement RC-01 and the smallest necessary part of RC-02 together. Use one reusable **labeled marker** definition, constructed from existing image/shape and text nodes. Instantiate it three times with unique handles and independently scheduled existing move/fade behavior.

Use that same definition in two synthetic consumers: a commerce feature scene and a story diagram inside an existing compatible template. Use current assets, pinned fonts and existing supported output formats. Edit the middle instance, move one named cue, export/reload, then package the story fixture with E7. The other instances must remain unchanged.

This is the first release gate. If the common interface requires callers to configure both renderers' internals, narrow the supported subset before adding RC-03–06. Avoid a general-purpose intermediate scene language or a wholesale scene-schema migration.

### First author-facing expansion

**Delivered:** measured layout, repeat/stagger and leader/outline/underline/bracket presets. The existing component gallery links to a shared gallery with commerce, story and isolated views. Explicit target groups support following labels; lower-level source-image anchors preserve crop/fit and protected-region checks.

After that gate, implement RC-03–05. Deliver visible examples of a feature row, staggered markers, a following label, a focus outline and a range bracket. These examples demonstrate reuse of the existing atoms and should appear in the gallery with editable content, timing and instance controls.

### Next genuinely new capability

**Delivered:** bounded numeric values with text/property bindings and explicit formatting. All formatted outputs are measured with the pinned font, values appear in the story event index, and numeric-only motion blur samples changing text rather than treating it as a stationary image.

RC-06 adds a new relationship between data and presentation. Keep its interface explicit: authored numeric endpoints/keys, frame window, interpolation policy, declared numeric range and formatting settings. Begin with linear interpolation by default. Both the bar and number consume the same evaluated value; do not animate them with unrelated timing.

Formatting must specify rounding, decimal precision and separators. Prepare a fixed text box using the pinned font and validate the supported formatted outputs. Reject overflow and invalid values. Do not use arbitrary expressions, mutate text through playback history, or bypass the 12-state limit by generating large state arrays. Any new serialized fields need explicit opt-in/versioning and coverage in preview, export, diagnostics and portable packages.

## 5. Integration decisions

- **Shared data first:** use existing prepared-node/asset/font types for the common visual subset. Extract existing implementation when two adapters need it; avoid copying a commerce implementation into a story-specific twin.
- **Typed remapping:** rewrite declared references, not arbitrary strings in JSON. Distinguish instance-local references, shared dependencies and explicitly supplied external targets. Preserve legacy IDs for callers not opting into instancing.
- **No implicit parenting:** namespacing an instance must not insert a root group. This would break root-only effects/mattes and could change inherited transforms or opacity.
- **Small motion subset:** first support authored starting poses and ordinary move/fade windows. Validate delayed starts and adjacent segments against each engine's evaluator before promising broader conversion. Draw, scale, rotation, effects and visibility expand only with explicit compatibility checks.
- **Per-mode capabilities:** reuse current coordinate evaluation; retain story camera projection and commerce crop/fit/effect offsets. Shared anchors must identify node-local versus source-image coordinates. Existing commerce mattes/effects are not automatically available in story scenes.
- **Text preparation:** both domains have pinned-font paths, but commerce `textBox`/fitting and story `textLayout`/safe-area validation are distinct. Keep their policies explicit; share only the preparation behavior proven equivalent.
- **Timing:** integer frames stay authoritative. Preserve each existing inclusive or half-open endpoint contract. Repetition must report expanded limits, including the current 200-node/100-commerce-event/40-story-move limits, rather than silently truncating or raising them.
- **Serialization:** save resolved output using existing scene/workspace mechanisms first. Introduce a versioned editable component-definition format only when the first two consumers and the gallery need it. E7 currently packages story plans/templates, not an arbitrary component registry.
- **Style and content:** consume explicit settings and existing style/template policies. Presets may provide replaceable defaults. They must not infer claims, rewrite copy or invent data.

## 6. Acceptance and verification for each delivered item

Each item needs one isolated example and two real composition contexts; at least one story and one commerce consumer for anything advertised as shared. Record what is shared and what still needs a mode-specific adapter.

Verify the public interface with meaningful behavior checks:

- Changing one instance cannot alter another; dependency and external-target errors identify the instance and field.
- Geometry and expected state match at declared endpoints and sampled intermediate frames, including supported nested transforms.
- Direct, random and backward seeking agree. Validate exact starts, ends and visibility cuts at 24 and 30 fps; use fractional samples where the target renderer's existing exposure path requires them.
- Invalid edits preserve the previous valid Lab preview. Save/reload and exported inputs reproduce the same resolved scene.
- Preview and encoded output pass the existing parity thresholds. Lossy MP4 parity is distinct from byte equality.
- Prior fixtures retain their behavior. Record actual tests, commands and artifacts before marking an item complete.

Add examples to the existing gallery incrementally, labeling **atom**, **relationship**, **operator** or **preset**. A higher example count is not itself a completion measure. Existing commerce examples/formats retain their recorded Experimental status; engineering checks do not grant creative acceptance.

## 7. Deferred candidates and scope

Generic discrete state switching is worth revisiting after RC-06: authored states and the story category-swap recipe already exist, while commerce's ordinary event contract does not expose state switching. General node travel along a path should likewise extend the existing follower/flow machinery when two concrete consumers need it. Both require explicit endpoint, ownership and coordinate policies.

Additional blur/glow variants, scene-specific named entrances, new render backends, arbitrary story aspect ratios, automatic diagram routing, general constraint solving, subtree morphing and physical simulation are outside this queue. They do not need to be prerequisites for reusable instances and annotations.

**Implementation evidence:** [guide and reproducible commands](./reusable-components.md), [verification record](./review/reusable-components/verification.json), [unit behavior checks](../tests/unit/reusable-components.test.ts), [gallery/export checks](../tests/browser/reusable-components.ts), [fractional text exposure check](../tests/browser/reusable-component-pixels.ts), [portable package integration](../tests/integration/reusable-component-workspace.test.ts) and [fresh relocated render comparison](../tests/browser/reusable-component-package.ts). Eight examples run in isolation and in both composition contexts. Engineering verification does not grant creative or production acceptance.

**Next action:** follow the [RC-07–09 next atomic batch plan](./reusable-components-next-atomic-batch-plan.md): shared scale/rotate/draw controls, exact state changes and bounded path travel. It specifies a product-detail and a story-route consumer to establish reuse. This queue is planned; it does not reopen the completed RC-01–06 scope.
