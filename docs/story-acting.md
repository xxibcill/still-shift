# Text containers and character acting

These are shared Still Shift features: the scene contract, passage compiler,
Canvas renderer, Lab controls and MP4 exporter use the same data. Existing scenes
without these optional fields retain their behavior.

## Text containers

A text node with a pinned `fontAsset` and measured `textLayout` or `textBox` can
include a `container`. The renderer measures the current text state, wraps it with
padding, and draws the text and container under the same transform and opacity.
For a `textLayout`, the container hugs the measured text; a `textBox` uses its
authored box. Font measurement, padding, border and tail participate in safe-area
validation. Text still needs to fit its authored layout.

```json
{
  "kind": "speech",
  "fill": "#FFF8E7",
  "stroke": "#514638",
  "strokeWidth": 2,
  "padding": 20,
  "radius": 18,
  "tail": { "side": "bottom", "position": 0.3, "length": 28 }
}
```

Kinds are `caption` (rounded panel), `speech` (pointed tail) and `thought`
(scalloped outline and small bubbles). Tails can face any of four sides;
`position` runs from 0 to 1 along that side. Caption panels have no tail.
In `story-passage-2`, `beat.textContainers[nodeId]` overrides a template's
container; `null` removes it. The Lab exposes these options under **Text containers**.
Door numbers and other labels do not acquire containers automatically.

## Prepare a reusable character library

Generate each posture as its own transparent PNG using one identity reference.
Preserve face, costume, proportions, lighting, camera, scale and foot baseline.
Use distinct silhouettes: rest, inspect, knock, receive, thank and walking phases.
Keep moving props separate. Review identity and hand/prop alignment before use.

Register each PNG in the template's normal `assets` collection with dimensions,
relative path and SHA-256 checksum. Then give the image node named states:

```json
{
  "fit": "contain",
  "states": [
    {
      "asset": "actor-rest",
      "pose": "rest",
      "registration": { "anchor": [0.52, 0.97] }
    },
    {
      "asset": "actor-knock",
      "pose": "knock",
      "registration": { "anchor": [0.55, 0.96] }
    }
  ]
}
```

All states on a named character must have unique pose names. Optional
`registration.anchor` specifies a normalized source point, usually the midpoint
between the feet at their baseline. With a crop, coordinates are relative to that
crop. The engine places this point at the node's bottom center, preserving aspect
ratio. Give the node enough width for every silhouette; image content is clipped
to its node box. Registration aligns position, not differently drawn body sizes.
Without registration, existing centered image placement is unchanged.

The Lab's **Download pose generation brief** records the identity reference,
canvas dimensions and required poses. This is a prompt handoff, not an in-app
image-provider call. The included artwork was generated with the built-in
image model; there is no SVG substitute or runtime image-model dependency.

## Link poses to narration or events

In a `story-passage-2` beat:

```json
{
  "poseTracks": {
    "actor": {
      "initial": "rest",
      "changes": [
        {
          "id": "actor-knocks",
          "pose": "knock",
          "anchor": { "type": "cue", "id": "knock" },
          "offset": 0,
          "blendFrames": 0
        },
        {
          "id": "actor-rests",
          "pose": "rest",
          "anchor": { "type": "event", "id": "actor-knocks", "edge": "end" },
          "offset": 16,
          "blendFrames": 0
        }
      ]
    }
  }
}
```

Offsets and blends use frames. Default hard cuts give crisp limited animation;
optional blends last 1–3 frames. Pose events are instantaneous, so their start
and end coincide; a blend changes rendering without changing that event time.
A pose remains selected until the next change. An empty `changes` list sets only
the initial pose. For reusable walking and gesture sequences, use the action
presets below. The engine does not synthesize a skeletal walk or interpolate new
anatomy.

The compiler resolves cue/event dependencies, rejects missing poses, cycles,
out-of-range or colliding changes, and prevents competing state owners. Pose
event IDs can also anchor sound and movement. Moving a narration cue retimes all
its dependents. Do not duplicate pose timing in `bindings` or `timing`.

Use **Character poses** in the Lab to choose poses, cue/event anchors, offsets and
blends, or add/remove changes. Undo/redo and saved plans retain authoring data;
portable workspace export includes every pose asset and registration.

## Reusable actions

Add `actions` to a `story-passage-2` beat. `walk` alternates two supplied poses
while moving to a destination; `knock`, `offer`, `receive` and `react` hold a
selected pose, optionally moving the character. Each action can settle into a
`finishPose`; omit it to keep the last pose. The gesture names describe intent:
they do not automatically draw hands, transfer props or generate audio.

```json
{
  "actions": [
    {
      "id": "walk-home",
      "actor": "actor",
      "kind": "walk",
      "anchor": { "type": "cue", "id": "return" },
      "durationFrames": 48,
      "poses": ["step-a", "step-b"],
      "stepFrames": 8,
      "finishPose": "rest",
      "to": [300, 278]
    },
    {
      "id": "gentle-knock",
      "actor": "actor",
      "kind": "knock",
      "anchor": { "type": "cue", "id": "knock" },
      "durationFrames": 16,
      "pose": "knock",
      "finishPose": "rest"
    }
  ]
}
```

All timing uses beat-local frames. Actions expose their own start and end events:
anchor a sound cue to `gentle-knock` → `start` to keep it synchronized when the
action or narration cue moves. `offset` defaults to zero. Walking uses linear
travel; optional gesture travel uses cubic easing. Generated pose cuts are crisp.

Actions on the same actor cannot overlap, and manual pose changes cannot fall
inside an action. A finish pose at the exact start of the next action would
create two pose changes at one frame; omit that finish pose. Action end frames
must be inside the beat. Each walk supports at most 40 generated pose changes,
including its finish pose. Keep generated IDs (`-pose-N`, `-settle`, `-move`) out
of manual bindings and timing overrides.

In **Character actions**, select a character, action kind, cue, duration and
poses, then add it. Existing actions expose offsets, destinations and finish
poses. Changes participate in normal undo/redo, preview, save and workspace export.

## Props that follow a hand

Add a named anchor to each character pose that will hold a prop. Like foot
registration, anchor coordinates are normalized relative to the source image or
its crop. The renderer accounts for image fit, foot registration, pose blends,
character movement, scale and rotation.

```json
{
  "asset": "actor-offer",
  "pose": "offer",
  "registration": { "anchor": [0.52, 0.97] },
  "anchors": { "hand": [0.85, 0.32] }
}
```

Then add a prop track to the beat. The prop's `grip` is a normalized point in its
node box. That point follows the named hand anchor. Each hold can include an
`offset: [x, y]` in shared-parent coordinates; it defaults to zero.

```json
{
  "propTracks": {
    "parcel": {
      "grip": [0.5, 0.88],
      "initial": { "actor": "actor", "anchor": "hand" },
      "changes": [
        {
          "id": "parcel-handover",
          "anchor": { "type": "cue", "id": "handover" },
          "hold": { "actor": "neighbor", "anchor": "hand" },
          "transitionFrames": 18
        },
        {
          "id": "parcel-release",
          "anchor": { "type": "cue", "id": "release" },
          "hold": null
        }
      ]
    }
  }
}
```

An `initial: null` prop starts at its authored position. A pickup or handover can
blend to the new hand over `transitionFrames` (default zero, maximum 120).
Both hands must remain valid during a transfer. `hold: null` releases at the
previous frame's contact point; releases have zero transition frames. Seeking
directly to any frame produces the same result as sequential playback.

Attachments own the prop's position for the entire beat. Remove existing prop
movement, pins, travels, position drivers and constraints before adding one;
opacity, rotation and scale animation remain available. This feature follows
position only: it does not inherit hand rotation or calculate occlusion. Use the
scene's normal drawing order. Prop and holder must share the same parent and
camera space; nested prop attachments are unsupported. Missing or clipped hand
anchors, dependency cycles and overlapping transfers fail validation before
rendering.

Use **Held props** to choose initial holders, adjust grip points, and add or edit
cue/event-linked pickups, transfers and releases. Hand anchors are currently
authored in the character's image states; there is no visual anchor-placement
editor yet.

## Example and verification

Load `benchmarks/fixtures/parcel-story/actions/parcel-story.json` in the Passage Lab.
Seven new posture images supplement the original offer/receive states; see
[asset provenance and prompts](../assets/parcel-story/poses-v001/README.md).
The narration remains 36 seconds, 864 frames at 24 fps. Existing narration cues
and SFX timing are preserved; new pose/prop movements follow them.

```sh
pnpm story:passage \
  --plan benchmarks/fixtures/parcel-story/actions/parcel-story.json \
  --narration assets/parcel-story/narration-v001/narration.wav \
  --output-dir benchmarks/results/my-character-acting
```

Tests cover exact pose boundaries, cue and sound retiming, static initial poses,
invalid ownership/timing, container bounds, registration, Lab edits/undo/save,
generation brief download, font-based safe-area validation and relocation of a
workspace containing real pose artwork. Action tests cover walking cadence,
gesture duration, hand tracking through pose changes and blends, moving-hand
transfers, releases, random seeking, ownership conflicts and dependency cycles.
The example is also rendered through the normal MP4 pipeline and inspected at
gesture, handover and walking boundaries.

## Native composition puppet acting

Native `composition-1` image layers can deform one still asset with
`distort.puppet`. This is independent of the existing story-passage pose library:
use poses for large silhouette changes and puppet pins for continuous bends,
squashes and gestures within an asset. The [arm and house demo](../examples/composition/12-puppet-acting/README.md)
contains complete compositions and original static artwork.

Add an effect with equal-length `rest` and `pins` arrays. Coordinates are pixels
in the layer's local coordinate system, before its transform. Each rest pin must
lie within the thresholded alpha silhouette; do not place it in a transparent
hole. Rest positions define material points, so keep them fixed while animating
target pins. Arrays support whole-list keyframes, individual point vector keys,
and separate x/y keys. Keep the number of points constant across keys.

```json
{
  "id": "puppet",
  "effect": "distort.puppet",
  "params": {
    "rest": [
      [24, 100],
      [60, 60]
    ],
    "pins": [
      [24, 100],
      {
        "keys": [
          { "frame": 0, "value": [60, 60] },
          { "frame": 24, "value": [70, 45] }
        ]
      }
    ],
    "refinement": 2,
    "starchCenters": [[40, 25]],
    "starch": [[20, 1]],
    "overlapCenters": [[60, 60]],
    "overlap": [[24, 1]]
  }
}
```

There are at most 32 pins and eight regions of each kind. `starch` entries are
`[radius, strength]`: strength is 0–1, full stiffness applies inside half the
radius and falls smoothly to zero at the edge. Later regions blend after earlier
ones; exact pin targets take priority. `overlap` entries are `[radius, depth]`:
the last region containing a source triangle's centroid assigns its draw depth.
Higher depths draw later; equal depths retain original triangle order. This is
local draw ordering, not collision detection, and it does not permit mesh folds.

A pin path such as `actor.effects[puppet].pins[p5].y` accepts a scalar expression
or motion driver; `actor.effects[puppet].pins[p5]` accepts a vector expression.
Expressions read keyed, driven and expression values before constraints. For a
hand attached to a constrained prop, constrain a null helper and use drivers to
copy its solved x/y coordinates to the pin. The [prop-follow example](../examples/composition/12-puppet-acting/prop-follow.json)
shows this together with an elbow expression. Subtract the actor's position only
when helper/actor axes and scale match, as in this example; otherwise author the
helper in the puppet's local coordinate system.

The solver is deterministic rigid moving least squares with authored serial
reduction order. Zero pins preserve the image; one pin translates it; coincident
rest pins and degenerate fits are rejected. Earcut 3.0.2 triangulates exact
thresholded alpha-cell contours, preserving holes and disconnected islands, under
its [ISC licence](./licenses/earcut-3.0.2.txt). Eight fixed serial edge-quality
passes improve thin triangles without moving outline or pin vertices, after pin
insertion and each of 0–3 conforming midpoint refinements. `alphaThreshold` is an
integer byte, 1–255 (default 1). Topology follows the current input alpha, so use a
stable source silhouette and avoid preceding animated alpha-changing effects when
material topology must stay fixed.

The limits are 65,536 boundary edges, 8,192 simplified outline vertices, 32,768
mesh vertices and 65,536 triangles. Rendering admits its geometry and pixel
workspace before allocation. Excessive complexity or raster work produces
`comp-mesh-budget`; a rest pin outside the silhouette produces `comp-mesh-pin`.
A deformation that flips or collapses triangles produces `comp-mesh-flip`: reduce
motion, adjust rest pins, add support pins or revise the source silhouette.
Mesh failures expose structured diagnostics in preview and production exports,
including the stable code, node, frame and authored parameter path. For example,
an invalid rest pin points to `layers.0.effects.0.params.rest.0`; nested artwork
uses its `precomps` definition path and full instance node name. Pin-target solver
failures point to `pins`, and invalid Bezier deformation points to `controls`.
The pinned renderer delivers vertices on a 1/16-pixel grid (at most 1/32 pixel
rounding per axis). The flip guard validates continuous deformation before raster
rounding; faces that collapse or reverse solely during raster delivery are omitted
in stable draw order. Identity meshes retain exact pixel-center sampling. Solver
target positions remain exact. Always sweep the full authored range before export.

For rectangular artwork, `distort.mesh-warp` offers tensor-product Bezier control
grids with 2–8 rows and columns. Supply `columns`, `rows`, layer-local `origin` and
`size`, and row-major normalized `controls` (exactly `rows * columns` points).
The default 2×2 grid is `[[0,0],[1,0],[0,1],[1,1]]`. Animate controls just like pins,
including paths through `controls[p63]`; `subdivisions` sets fixed tessellation
from 1–64 (default 24). Both effects use native WebGL2 textured triangles and a
Canvas affine reference with the same sampling and overlap rules.

For affine 2D mesh layers, the renderer retains the complete transformed source
when it crosses the viewport edge, then clips the delivered result. Invisible,
out-of-range and zero-opacity descendants do not enlarge a group's capture.
The union of complete input and viewport is limited to 8192 pixels per axis and
participates in normal managed pixel admission; extremely distant artwork can
therefore produce a mesh-budget diagnostic.

Effects with layer-space coordinates use the translated capture coordinates.
Scope-space effects keep the original composition viewport and authored stack
order: the engine crops that window (including referenced effect inputs), applies
the effect at the original dimensions and replaces the window, including any
transparent output. Pixels outside the original viewport remain unchanged by a
scope-space effect; a later puppet deformation can move those untreated pixels
onscreen. This preserves established viewport-based vignette, grain and wipe
behavior rather than inventing an infinite extension of those effects. Masks,
mattes, opacity and inherited clipping keep their normal stages.
