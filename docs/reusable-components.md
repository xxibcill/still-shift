# Shared reusable components

The common authoring layer supplies small visual definitions, motion windows, layout, repetition, anchored annotations, scalar values, exact state cuts and path travel. Commerce and story still compile through their existing scene validators and renderer. The gallery is linked from **Commerce → Components → Shared components** at `/reusable-components.html`.

## Use a definition in either context

```ts
import {
  labeledMarker,
  layoutComponentBoxes,
  repeatComponent,
  addCommerceComponents,
  addStoryComponents,
} from "../packages/renderer-core/src/index.ts";

const marker = labeledMarker({
  text: "Supplied label",
  font, // A pinned PreparedFont record, including its exact hash.
  color: "#233B32",
  accent: "#477D65",
  width: 280,
  height: 110,
  fontSize: 36,
  duration: 18,
});
const boxes = layoutComponentBoxes(
  { x: 112, y: 810, width: 1696, height: 150 },
  [marker.bounds, marker.bounds, marker.bounds],
  { axis: "x", gap: 32, align: "center", distribution: "space-between" },
);
const instances = repeatComponent(scene, marker, {
  ids: ["first", "middle", "last"],
  start: 12,
  stagger: 12,
  offsets: boxes.map(({ x, y }) => [x, y]),
});
const label = instances[1].exports.label;
// Edit the exported node on this instance before adding it to the scene.
instances[1].nodes = instances[1].nodes.map((node) =>
  node.id === label && node.type === "text"
    ? { ...node, text: "An independent edit" }
    : node,
);
const resolved =
  scene.schemaVersion === "commerce-scene-1"
    ? addCommerceComponents(scene, instances)
    : addStoryComponents(scene, instances);
```

`component-1` definitions are strict, serializable data. They contain prepared nodes, exact asset/font dependencies, authored bounds, exported node handles, external aliases, move/fade windows and optional `scene-components-1` relationships. Unknown fields fail. Each instantiation clones its input and prefixes declared local node/value/motion/cue references with `instance__`. Image states retain shared asset references. Exact matching dependencies deduplicate; conflicting declarations fail.

External aliases must be supplied explicitly through `external: { target: exportedHandle }`. All parents and references are validated after composition. Instancing adds no group or transform hierarchy. An offset changes definition roots, including roots attached to external groups, in their parent's coordinate space. Shared dependency IDs are intentionally not renamed.

Bounds describe authored boxes, not animated collision envelopes. Layout consumes width and height, returning placements inside a declared region. It supports either axis, start/center/end cross alignment, and start/center/end/space-between distribution. Gaps are minimum clearances. Oversized content fails instead of shrinking text.

`component-1` retains its original `x`, `y`, and `opacity` motion subset. `component-2` additionally supports uniform `scale` and signed `rotation`. The node's authored pose is its starting value. Windows use absolute integer frames after adding the instance start once; endpoints are inclusive. Values hold before/after a window. Stagger shifts motion, not static visibility: a delayed entrance should author opacity zero and a fade. Scene adapters enforce the existing 200-node, 100-commerce-event and 40-story-move limits and their conflict rules.

Story windows retain names such as `middle__rise` for `indexStoryEvents` and cue retiming. Commerce adapters emit ordinary node/property events. Scene-specific effects, entrances, visibility and evidence policies remain explicit native authoring features.

## Annotations

- `leaderLabel`: measured text and a leader attached to an explicitly authored **group**. Text inherits that group's transform. It never wraps an existing target automatically.
- `boundsHighlight`: an outline or underline around declared local width/height and padding. These are box highlights, not silhouette tracing.
- `rangeBracket`: a four-point path joining two exported targets with authored clearance, ticks and explicit bounds in the consumer's coordinate space.
- `componentData.annotations`: the lower-level relationship for author-supplied routes. Each point identifies a node, a local point, `node` or `source` space, and an optional canvas-pixel offset.

Source points account for image crop/fit and require one image state. Invisible crop points fail. Nested transforms, commerce motion/effects and story camera projection use the same evaluated matrices as drawing. Annotation points are converted back into the path's local space to avoid applying its camera twice.

Protected image IDs use commerce's declared source geometry and existing segment/polygon checks. Validation samples all displayed frames and commerce motion-blur exposure samples; direct seeks validate again. This retains the existing centerline clearance policy, not a stroke-width collision guarantee. Routing is authored. Story has no commerce protected-region metadata. Annotation paths cannot also own native connector/attachment geometry or spatial motion/effects; opacity and reveal remain available.

## Values and number displays

`scalarDisplay` supplies a label and bar driven by one value. The lower-level `componentData.values` declares an ID, increasing numeric range, `from`, `to`, and a window. `bindings` attaches a value to measured text or a property (`x`, `y`, `scaleX`, `scaleY`, `opacity`, `reveal`). Property outputs map the declared range into explicit output endpoints. The number may decrease, cross zero, or include decimals. No expressions or playback history are used.

Formatting declares decimal precision (0–4), half-away-from-zero rounding or truncation, decimal/group separators, prefix and suffix. Negative zero is suppressed. Endpoints must fit a finite range within ±1 billion; easing must remain bounded. Opacity/reveal outputs stay in [0,1], and scale in (0,4]. Competing tracks, followers, target effects and fitted-text ownership fail.

Numeric labels require a pinned font and fixed `textBox`. Preparation measures every possible formatted output, including fractional commerce samples, and rejects overflow. Up to 10,000 formatted values are supported per label. The renderer does not create text-state arrays or change the existing 12-state limit. Choose precision and range deliberately.

`componentData.schemaVersion: "scene-components-1"` opts scenes into this behavior. Renderer versions are `commerce-canvas-0.17.0` and `story-canvas-0.16.0`; scenes without the field retain their previous versions. Numeric windows appear in story's event index, so passage cue retiming, diagnostics, export and E7 packages share the same data.

## Scale, rotate and draw (RC-07)

Use `component-2` for `scaleComponent(id, node, to, window)` and `rotateComponent(id, node, to, window)`. Add the returned records to `motions`. Scale starts at 1, stays in `(0,4]`, uses bounded easing and owns both axes; commerce expands it to two events within the existing 100-event cap. Rotation starts at the node's authored angle and follows the supplied signed endpoint, including multiple turns. Neither helper wraps the target. Adjacent native segments continue from the preceding endpoint; repeated windows and native writers retain conflict checks.

`drawComponent(id, target, from, to, window)` returns existing v1 value/reveal data. Merge its `values` and `bindings` into the definition's `componentData`. Paths and rectangles support partial draw and retraction in `[0,1]`. One reveal binding owns a target for the entire scene, holding `from` before start and `to` from the inclusive end. Two bindings are rejected, even if their windows are disjoint; use native draw choreography for a multi-segment sequence. Text reveal remains native story choreography.

## Exact state cuts (RC-08)

```ts
const states = [
  stepComponentState({
    id: "detail-states",
    target: "detail",
    initial: 0,
    cuts: [{ id: "detail-change", frame: 72, state: 1 }],
  }),
];
```

Place schedules in `scene-components-2.states`. They select authored image or text states, without interpolation or history. A cut is visible on its exact frame and holds until the next cut. Frames must increase strictly; indices must exist. A schedule supports 40 cuts and a composed scene supports 100 cuts. The existing 12-text-state limit remains unchanged. Every text state is measured with its pinned font and fixed text box before preview/export; every asset and crop is prepared through the existing loader.

Native state tracks, numeric text and fitted text cannot share state ownership. Product source geometry and source-image anchors still require one image state; the product tour uses a separate stateful inset. Commerce exposure is clamped at every cut, including the first frame of the new state.

Cuts appear as named **point events** in `indexStoryEvents`, with equal start/end. `middle__detail-change` can bind to a narration cue with duration zero. Instance starts/staggers shift cuts once. Story editor point controls expose one frame and preserve it when unlinking, undoing, redoing, saving or packaging.

## Path travel (RC-09)

```ts
const travels = [
  travelComponentPath({
    id: "journey",
    target: "marker",
    path: "route",
    from: 0,
    to: 1,
    window: { start: 24, end: 168, easing: "in-out-sine" },
  }),
];
```

Place relationships in `scene-components-2.travels`. Progress measures normalized local arc length on an authored polyline. Reversing the endpoints travels backward; progress holds outside its window. The target's **authored origin** is aligned to the sampled point through path parents, story camera projection and the inverse target-parent transform. The camera is applied once. Independent rotation and scale remain available. Nonuniform path transforms and easing can change screen speed.

Travel owns x/y. Competing tracks, values, followers and target effects fail. Routes cannot be native connectors, source-attached paths, annotations or depend on any traveller through their ancestors. Parent/relationship dependencies are checked before evaluation, including height-shadow source relationships. Zero-length routes, missing references and singular inverse transforms fail; repeated adjacent points are supported. Target-parent scale tracks must be positive and use bounded easing. The composed scene supports at most 32 travellers. Route reveal and traveller visibility are independent; no implicit loop or concealment is added.

## Version compatibility

Both definition readers remain strict. Existing `component-1` and `scene-components-1` fixtures serialize unchanged. New definitions use `component-2` and resolved state/travel data uses `scene-components-2`, with `states` and `travels` alongside annotations/values/bindings. New runtime/cache versions are `commerce-canvas-0.18.0` and `story-canvas-0.17.0`; v1 and scenes without component data keep their previous versions. The gallery likewise retains `reusable-demo-1` settings and uses `reusable-demo-2` for new examples. Absolute timing in `story-passage-2` accepts equal start/end for point events; retiming still rejects zero-duration motion windows. The duration-only `story-passage-1` reader remains unchanged.

## Gallery and fixtures

The shared gallery has thirteen editable examples in both contexts and an isolated view. Isolation uses the commerce renderer, retains declared annotation targets and their children, and removes the surrounding composition. Controls cover context, 24/30 fps, copy, instance count, spacing, stagger, middle timing, numeric endpoints and precision, scale/rotation, draw endpoints, cut frames and forward/reverse travel. Invalid updates keep the last valid canvas and disable export until corrected. Settings reload recreates the resolved scene; source ZIPs contain the resolved scene, settings and exact source files. Both contexts export through `PreparedAnimationEngine`.

```sh
pnpm components:prepare
pnpm lab
pnpm test:browser:reusable-components
pnpm test:browser:reusable-package
pnpm test:browser:reusable-behavior-package
pnpm story:package \
  --plan benchmarks/fixtures/reusable-components/story-components.passage.json \
  --output-dir /tmp/shared-components-package
```

Fixtures live in `benchmarks/fixtures/reusable-components`. The passage combines markers, a following label and a value display; the marker template exposes `middleLabel` and `middleRise` slots. These are synthetic engineering examples, not historical claims or production registrations. `story-behaviors.passage.json` adds transform, state, travel and supply-route beats; the supply template exposes a point timing slot and a journey window, and synchronizes image/caption cuts through one cue. The product tour and symbolic supply-route composition reuse supplied assets. Existing commerce examples remain experimental. RC-01–06 results remain in the [baseline record](./review/reusable-components/verification.json); RC-07–09 results are recorded separately in the [behavior verification record](./review/reusable-components/behavior-verification.json).

## Visibility and sequences (RC-10–11)

Use `component-3` definitions with `scene-components-3` data for the new relationships. Version 3 includes all earlier state/travel/value behavior and adds `visibility`, `pins`, `textFits` and `masks`. Strict version 1/2 readers and their fixtures remain unchanged. Opt-in renderer versions are `commerce-canvas-0.19.0` and `story-canvas-0.18.0`.

`showComponentDuring({ id, target, window: { start, end, cue? } })` returns a visibility record for an independent scene root. Add it to `componentData.visibility`. Visibility is **half-open**: `[start,end)`, with a one-frame window allowed and `end` allowed to equal `frameCount`. Authored opacity remains active inside the gate; the root and its complete output are absent outside it. Gates do not inherit source visibility through a relationship. There is one gate per root, with a combined native/shared cap of 100 in commerce.

```ts
const instances = sequenceComponents(clock, [
  { definition: detail, id: "first", start: 12, duration: 48 },
  { definition: detail, id: "second", duration: 48, offset: [550, 0] },
  {
    definition: detail,
    id: "third",
    start: 120,
    duration: 48,
    offset: [1100, 0],
  },
]);
const scene = addStoryComponents(storyScene, instances);
```

`sequenceComponents` accepts local definitions and returns ordinary instances for either adapter. It shifts every local motion, value, cut, travel and gate once, and supplies a full-duration gate to each ungated root. Existing local gates keep their narrower spans. An omitted start follows the preceding clip's end; an explicit start can create a gap or overlap. Input order remains drawing order. The list is limited to 32 clips, with all existing expanded scene limits still enforced.

Inclusive behavior endpoints and state cuts must be less than the clip duration; exclusive gate ends may equal it. Too-short clips fail rather than trim or stretch animation. A definition root cannot be parented to an external node, and clips cannot reference one another's owned nodes. Relationships to persistent scene targets remain explicit.

Story gates appear as named events with **end exclusive** in the editor. Moving a gate changes visibility only. To move an entire phase, explicitly bind its gates, motions, values, travel and state cuts to one phase cue, using their local offsets and durations. The supply-phase template demonstrates this, including point cuts with duration zero. Editing gallery clip settings instead re-runs the sequence builder and recalculates following implicit starts.

## Anchor pins (RC-12)

```ts
const pin = pinComponent({
  id: "badge-pin",
  target: "badge",
  anchor: { node: "detail", point: [220, 30], offset: [24, 0] },
});
```

Add the record to `componentData.pins`. It aligns the target's authored origin to the evaluated anchor, converting through the existing world/camera and target-parent transforms once. `space: "node"` is the default; `space: "source"` supports a single-state image with existing crop/fit checks. The offset is in canvas pixels.

Pins own x/y while retaining the target's independent scale, rotation and opacity. Native position motion, travel, followers and effect motion on the target conflict. Parent, pin, travel and effect dependency cycles fail before rendering, as do noninvertible target-parent transforms. A hidden source still has a position; add a gate to the badge if it should disappear too. Pins have no separate timing event and are capped at 32 per scene.

## Fitted text (RC-13)

Add `fitComponentText({ target: "caption", minSize: 32, maxSize: 54 })` to `componentData.textFits`. The node supplies a pinned font, fixed `textBox`, exact text and optional states. After fonts/styles load, the shared preparation chooses the largest integer size that fits **all** supplied states. The same size is used at every frame; source data, node boxes and panels stay unchanged.

Bounds must be integers in `[16,180]`. Text that cannot fit at the minimum fails before preview/export. There is no copy rewriting, truncation or automatic panel resizing. The initial interface supports up to 32 fits and rejects numeric text, duplicate native/shared fits and native story `textLayout` on the same target. Shared state cuts work with fitted text. The gallery's diagnostic disclosure reports resolved sizes. Passage validation uses the same fitting preparation as preview/export.

## Alpha masks (RC-14)

Add `maskComponent({ target: "detail", mask: "aperture", invert: false })` to `componentData.masks`. Both are independent roots. The mask supplies raw alpha in canvas space and is hidden as a visible layer; its RGB color does not affect the result. Normal mode multiplies target alpha by mask alpha; inversion uses `1 - maskAlpha`. A hidden normal mask conceals its target; a hidden inverted mask leaves an otherwise visible target uncovered.

Mask sources can be authored images, rectangles, paths or groups of these. Ordinary transform, opacity, reveal, state and visibility behaviors still apply. Text, generated routes, flows, effects and further mattes in the mask subtree are rejected. The target's complete root output, including supported story flows or commerce effects, is masked before scene compositing. Native commerce keeps its existing after-effects order. Shared masks reuse two scratch surfaces in story rather than allocating one per target.

There is one mask per target, with no self-masking or chains. Shared/native masks together are limited to 16 in commerce; story supports 16 shared masks. Camera policies on each root remain independent. Mask/target gates and state cuts participate in commerce exposure clamping.

## Timing batch examples and packages

The gallery adds `visibility`, `sequence`, `pin`, `text-fit`, `mask`, `detail-sequence` and `supply-sequence`, in all three contexts. It now has 20 examples / 60 context combinations. The two compositions demonstrate all five modules with supplied images and captions. The sequence is editable through first-frame, duration and middle-delay controls; pin offsets, fit bounds and mask inversion have their own controls. Invalid edits preserve the last valid preview and disable export.

`story-timing.passage.json` combines visibility, fitting and a three-phase supply template. Every phase explicitly links its lifetime and internal behaviors to its own cue. Settings, resolved source ZIPs and E7 packages retain v3 data and exact dependencies.

```sh
pnpm components:prepare
node --import tsx tests/browser/reusable-components.ts --timing-only
pnpm test:browser:reusable-timing-package
```

The [RC-10–14 contract](./reusable-components-timing-batch-plan.md) records scope and acceptance criteria; the [verification record](./review/reusable-components/timing-verification.json) contains measured results. Tangent orientation, rebuilt routes, crossfades, routing, numeric fitting, arbitrary subtree masks and physics remain deferred. Examples remain Experimental.
