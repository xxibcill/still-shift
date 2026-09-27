# Shared reusable components

The common authoring layer supplies small visual definitions, move/fade windows, layout, repetition, anchored annotations and scalar values. Commerce and story still compile through their existing scene validators and renderer. The gallery is linked from **Commerce → Components → Shared components** at `/reusable-components.html`.

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

The shared motion subset is `x`, `y`, and `opacity`. The node's authored pose is its starting value. Windows use absolute integer frames after adding the instance start once; endpoints are inclusive. Values hold before/after a window. Stagger shifts motion, not static visibility: a delayed entrance should author opacity zero and a fade. Scene adapters enforce the existing 200-node, 100-commerce-event and 40-story-move limits and their conflict rules.

Story windows retain names such as `middle__rise` for `indexStoryEvents` and cue retiming. Commerce adapters emit ordinary node/property events. Scene-specific effects, entrances, draw/scale behaviors, visibility and evidence policies remain explicit native authoring features.

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

## Gallery and fixtures

The shared gallery has eight editable examples in both contexts and an isolated view. Isolation uses the commerce renderer, retains declared annotation targets and their children, and removes the surrounding composition. Controls cover context, 24/30 fps, copy, instance count, spacing, stagger, middle timing, numeric endpoints and precision. Invalid updates keep the last valid canvas and disable export until corrected. Settings reload recreates the resolved scene; source ZIPs contain the resolved scene, settings and exact source files. Both contexts export through `PreparedAnimationEngine`.

```sh
pnpm components:prepare
pnpm lab
pnpm test:browser:reusable-components
pnpm test:browser:reusable-package
pnpm story:package \
  --plan benchmarks/fixtures/reusable-components/story-components.passage.json \
  --output-dir /tmp/shared-components-package
```

Fixtures live in `benchmarks/fixtures/reusable-components`. The passage combines markers, a following label and a value display; the marker template exposes `middleLabel` and `middleRise` slots. These are synthetic engineering examples, not historical claims or production registrations. Existing commerce examples remain experimental. Deferred work from the expansion plan—generic state switching, general path following, automatic routing and physics—is outside RC-01–06. Recorded engineering results are in the [verification record](./review/reusable-components/verification.json).
