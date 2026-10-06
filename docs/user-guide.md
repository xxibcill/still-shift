# Still Shift user guide

Turn still images, prepared illustration layers, text and graphics into repeatable
MP4 animations. Start with the outcome you want below, preview an example in the
local Lab, then adapt its inputs.

This guide describes the implementation in this checkout, reviewed on **2026-09-27**.
**Available** means implemented; **Experimental** means you can try it but the
complete treatment is not registered as Production; **Reference only** means a
catalog idea has no renderer. Plans and research notes describe additional ideas,
not necessarily features you can use today.

**Jump to:** [choose a workflow](#choose-a-workflow) · [start the lab](#start-the-lab) ·
[image animation](#animate-one-image) · [cinematic scenes](#cinematic-scenes) ·
[storytelling](#storytelling) · [vertical video](#vertical-video) · [commerce](#commerce) ·
[reusable components](#reusable-components) · [batch](#batch-animation) ·
[compositions](#evaluate-and-render-programmable-compositions) ·
[outputs](#save-export-and-share) · [help](#when-something-does-not-work) ·
[ask an AI](#ask-an-ai-about-still-shift)

## Choose a workflow

| I want to…                                                   | Use                                | What I need                                                     | Where to start                                                                   |
| ------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Add a gentle push or drift to one image                      | Single-image animation             | One still image                                                 | [Image CLI](#animate-one-image)                                                  |
| Hold an illustration or reveal a comparison                  | Flat editorial presets             | A still composed for the chosen reveal                          | [Editorial presets](#animate-one-image)                                          |
| Move through a doorway, reveal a subject or shift focus      | Cinematic Parallax                 | Prepared foreground, subject and background layers              | [Cinematic gallery](http://127.0.0.1:4173/illustrated.html?collection=cinematic) |
| Explain comparisons, relationships or change                 | Story Motion                       | Prepared scene, supplied art/text and cue timing                | [Story gallery](http://127.0.0.1:4173/illustrated.html?collection=story)         |
| Coordinate several beats with narration                      | Passage workbench                  | A passage plan, templates and optional matching narration       | [Passage workbench](http://127.0.0.1:4173/passage.html)                          |
| Make a product hero, callouts or a short ad                  | Commerce treatments — Experimental | Product photo/cutout, copy and source information               | [Commerce workbench](http://127.0.0.1:4173/commerce.html)                        |
| Explore product motion, light, blur or detail windows        | Commerce components and effects    | Supplied product assets; demos are included                     | [Commerce components](http://127.0.0.1:4173/commerce-components.html)            |
| Add moving labels, counters, routes, masks or timed sections | Shared reusable components         | Start with a demo; custom compositions use scene/component data | [Shared gallery](http://127.0.0.1:4173/reusable-components.html)                 |
| Animate many independent images                              | Image batch                        | A JSONL list of images and animation settings                   | [Batch command](#batch-animation)                                                |

Still Shift currently supplies local authoring, preview and rendering tools. It
does not automatically turn a script into a finished episode, generate new video
with an AI model, cut out products, or invent missing illustration layers.

## Evaluate and render programmable compositions

Choose `composition-1` JSON or the TypeScript builder for custom layers, effects,
constraints and cameras. Story and commerce formats remain useful for recipe and
component authoring; cinematic inputs retain their camera recipes. These family
formats have a frozen visual vocabulary, and `illustrated-scene-1` is frozen
entirely. New visual features belong in `composition-1`; story recipes, actions,
presets and passages may grow when they compile to existing composition features.
See the [contribution rules](./composition-contributing.md).

The `composition-1` format supports pure frame and property evaluation in Node
and browsers through `evaluateComp` and `evaluateProperty` from
`@still-shift/renderer-core`. Use it to inspect animated transforms, visibility,
colours, native shape contents, masks, constraints and precomp timing before rendering. Fractional frame
times and seeking backwards produce deterministic state.

For a closed Bézier morph, set `firstVertex` on each keyed value to align matching
vertices and their incoming/outgoing tangents. All keys need equal vertex counts;
open paths use 0 or omit the field. Existing scene `pathMorphs` keep `points` and
can also provide `closed`, `inTangents`, `outTangents` and `firstVertex` on each key.

Native `shape` layers contain ordered `contents`: groups with their own transforms,
rectangles, ellipses, stars/polygons and open or closed cubic paths. Add fills,
strokes or linear/radial gradient paints after the paths they paint. Geometry
operators run in authored order; paints run from bottom to top. A repeater before
a paint makes compound geometry; one below a paint repeats the painted result,
including its local gradient. Use `order: "below"` (the native default) or `"above"`
for overlapping copies. Fractional copies fade the final copy.

Animate native fields by ID, including nested routes such as
`shape.contents[group].contents[path].path`, `shape.contents[rect].size.x` and
`shape.contents[gradient].stops[accent].color`. Shape coordinates and transforms
are 2D. Ink and brush are native stroke styles; trims keep their source coordinates
and brush identity. Brush `pinch`, `pinchAt` and `pinchWidth` control its width
profile. Plain strokes support caps, joins and dash offsets; nib strokes also
support dash reveals in original stroke coordinates.

Trim start/end use 0–1 and offset uses degrees. Closed paths wrap; open paths clamp.
`simultaneous` trims each contour; `individual` uses their combined ordered arc
length. Merge subtracts underlying operands from the topmost operand; intersection
uses every operand and native `exclude` folds XOR. Polygon operations quantize to
1/1024 local unit and accept at most 1,024 total input vertices. Closed positive
offsets expand contours; open offsets create a signed parallel path, with positive
amounts following the left normal. They keep open topology.

Wiggle depends only on its seed, source ID and layer-local time. Zigzag ridges use
arc length within each original cubic. Positive pucker pulls vertices toward their
mean while moving controls outward. Native twist uses linear radial falloff:
`angle * (1 - distance / maxRadius)`, with the outer radius fixed. These documented
native choices do not claim unmeasured After Effects pixel equivalence.

Generated geometry shares a 262,144-point work budget and 4,096-path work budget
across nested instances and historical reads within one evaluation. Cubics flatten
at 0.25 local unit tolerance and depth 12. Excess work or invalid coordinates reports
a diagnostic and fails export. Follow-path constraints use the source shape's first
compiled contour, measured in world arc length; empty sources report a diagnostic.

Set `motionBlur.adaptive: true` to reduce shutter samples for simple moving native
artwork. `samples` remains the upper cap. Selection uses screen motion, including
nested host transforms, and remains repeatable when seeking backwards. Complex
content retains the configured count; static content has zero blur. The default
fixed sampling stays unchanged.

To step keyed content, set `posterizeFps: 12` on a layer or precomp host. The rate
uses local seconds at the owning scope's FPS, after start/stretch. To hold keyed
content at a fractional local frame, set `holdFrame: 7.5`; this takes precedence.
Builder authors use `.with({ posterizeFps: 12 })` or `.with({ holdFrame: 7.5 })`.
Visibility and parent clocks remain live. Root-bound expression `frame` also
remains live; `value` reads the stepped/held keyed input.

Precomp `loop: "cycle"` or `"pingpong"` wraps its final source remap. Omit
`loopCount` for signed unlimited loops, or set an integer count to hold the
terminal frame after that many periods. Each reused instance has its own clock.
Freeze keyed source content with a single hold key in `timeRemap`. Native
video/sequence `frameBlending` is reserved for CE13 media decoding; it does not
enable media rendering yet. See the [reference](./composition-reference.md) for
units, bounds and the distinction between local and global procedural clocks.

To render a composition to MP4:

```bash
pnpm --silent still-shift comp render --input composition.json --output out.mp4
```

Asset paths are relative to the composition file and every asset's SHA-256 is
checked. The command prints a result with the renderer and evaluator versions, the
output checksum and timing metrics, and writes `out.mp4.scene.json` and
`out.mp4.result.json` beside the video. Precomps, blend modes, track mattes, masks,
adjustment layers and typography text render today, along with the delivered native
effect catalogue and shutter motion blur. Native shapes are available; 3D layers arrive in later
milestones. Transparent backgrounds show black in MP4.

To try the CE4a story adapter, compile
the Access Constraint fixture and render the resulting composition:

```bash
pnpm --silent still-shift comp export-json --scene benchmarks/fixtures/story-motion-continuous/access-constraint.json --output access.composition.json
pnpm --silent still-shift comp render --input access.composition.json --output access.mp4
```

`export-json` rebases asset paths to the saved file and refuses to overwrite an
existing output. Without `--output`, it prints composition JSON with paths relative
to the source story file. The adapter currently supports images, clipped groups,
plain text, rectangles, attached paths, flows and the 2D story camera, with integer-frame motion baked
from the recipe. Reusable story components also support measured and numeric text,
text containers and state ramps, annotations, travel, pins, visibility and alpha masks.
Each resolved component passage beat can compile through the same adapter. Unsupported features produce `comp-adapter-unsupported`; see
[content providers](./composition-reference.md#content-providers-ce4a) for limits.
CE4a is complete; existing story workflows keep their current renderer.

The CE4b commerce adapter uses the same commands:

```bash
pnpm --silent still-shift comp export-json --scene benchmarks/fixtures/ecommerce-motion/h01-landscape.json --output hero.composition.json
pnpm --silent still-shift comp render --input hero.composition.json --output hero.mp4
```

This slice supports prepared product imagery, groups, simple shapes, attached paths,
component annotations, alpha masks and mattes,
pinned measured text, text fitting, formatted numeric labels and integer-frame
commerce/component motion, including text state crossfades, caption containers
and text animation. Text fitting selects one size for all text states;
JSON export measures pinned fonts before resizing fitted backing panels. The adapters
also support pixel effects, motion blur, rich typography, spatial paths and morphs,
and animated blur, stroke and trim. See the [commerce adapter reference](./composition-reference.md#commerce-adapter-ce4b)
for provider details and input limits. CE4b is complete under the approved milestone
split; CE6-P retains the unchanged 1.25× render/readback timing target, deferred
to a future version.

### Legacy illustrated compatibility

The six legacy illustrated presets also compile to composition JSON. Their
millisecond motion is sampled at integer frames, and travelling tokens use native
follow-path constraints with editable progress signals:

```bash
pnpm --silent still-shift comp export-json --scene benchmarks/fixtures/history-offstage-v2/resource-flow.json --output resource.composition.json
pnpm --silent still-shift comp render --input resource.composition.json --output resource.mp4
```

### Prepared depth-image layers

A native `depth-image` layer references a verified source image and a prepared
`r8-unorm` depth asset with explicit dimensions. Its bounded local `motion.scale`,
`motion.strength`, `motion.offset` and `motion.roll` can use keys, expressions or
drivers. Add graphic/text layers above it, or use the existing masks, effects,
parenting, precomps and cameras. Depth preparation and inference happen before
rendering. The layer defaults to unlit; explicitly 3D receiving layers can opt
into flat-surface lighting.

```bash
pnpm --silent still-shift comp render --input benchmarks/fixtures/composition/ce4d/native-depth.json --output depth-layer.mp4 --backend webgl2
```

Use WebGL2 for depth displacement and linear-light flat preset compatibility.
An unsupported backend reports `comp-feature-backend`. Native authored depth
layers preserve source alpha when composited; prepared legacy preset compatibility
uses its explicit opaque policy. Source and depth hashes, resolved settings and
renderer versions participate in cache identity. The TypeScript builder's
`depthImage(id, sourceAsset, depthAsset, options)` registers both prepared assets.

Single-image CLI manifests capture content-based prepared asset references, so
moving the depth cache preserves scene identity. The result's `assetPaths` locates
the normalized source and depth files used for that execution.

### Native vector shapes

Use `shape.native(id, { contents })` for cubic paths, rectangles, ellipses and
polystars, four paint types and nine path operators. The
[native shape example](../examples/composition/09-native-shapes.ts) draws a brush
connector and animates a gradient star. `presets.drawOn` appends a trim operator
that also reaches paths inside painted groups. Animate nested fields by their
stable IDs, for example `contents[diagram].contents[line].path` or
`contents[paint].stops[edge].color`. The inspector exposes their keys and outlines;
`comp bake` supports their expressions and separated vector axes.

Paths use local coordinates. Supply a numeric anchor for native shapes when you
need a particular pivot; their contents do not have one declared rectangular size.
`shape.rect` retains the simple solid-layer convenience API. Native shape details,
operator order, geometry limits and polygon-library licence are in the
[generated reference](./composition-reference.md).

### Flat lighting for 2.5D artwork

Use [the flat lighting example](../examples/composition/11-flat-lighting.ts) for
ambient tint, point illumination or a spotlight with a soft cone. Add a `light`
layer with `lightType: "ambient"`, `"point"` or `"spot"`; opt a 3D image, solid,
text, shape or flattened precomp into shading with `receivesLight: true` or the
builder's `.receiveLight()`. Existing artwork and adapter output default to unlit.

Lighting uses WebGL2. Choose **WebGL2** in the composition preview's backend
control, or append `&backend=webgl2` to the program preview URL. Render the example
with:

```sh
pnpm --silent still-shift comp render --input examples/composition/11-flat-lighting.ts --output flat-lighting.mp4 --backend webgl2
```

In the inspector, **Receive light** toggles a 3D artwork layer's source setting.
Select a light's key lane and edit **Light key value** for intensity, color or XYZ
motion; edits support undo, redo and saving JSON. Point/spot range and falloff use
world pixels, spotlight cone angles are full angles in degrees, and local +Z is
the spot's forward axis. Each composition or precomp scope allows up to eight
lights and keeps its own illumination. An opted-in precomp receives parent lights
as one flattened plane after its internal scope renders.

These lights shade a single, two-sided flat surface in linear RGB and preserve its
alpha. They do not infer depth or surface detail from artwork. Source masks and
effects follow shading; camera depth of field follows projection. See the
[composition reference](./composition-reference.md) for bounds and property paths.

### Expressions and behaviours

A composition can describe relationships and procedural motion instead of keys. An
expression is short text stored under a property path; behaviours are one-line
motion-design intents that compile to expressions:

```json
{
  "expressions": {
    "shadow.transform.position": {
      "source": "ref('hero.transform.position') + [12, 18]"
    }
  },
  "behaviours": [
    {
      "type": "follow-through",
      "leader": "hero.transform.position",
      "followers": ["trail-1", "trail-2"]
    },
    { "type": "squash-stretch", "layer": "hero" }
  ]
}
```

Expressions are checked when the composition loads. Errors give the JSON path and
the character column. They cannot run arbitrary code and read only seeded random
values, so previews, seeks and exports stay reproducible. The
[expression reference](./composition-reference.md#expressions-ce9) lists the grammar,
built-ins (`wiggle`, `loopOut`, `spring`, `valueAtTime`, …) and behaviours
(follow-through, inertial bounce, squash and stretch, anticipation, auto-orient,
constant speed, camera shake and stagger). The
[overlap demo](../benchmarks/fixtures/composition/ce9/overlap-demo.json) has three
layers following a keyed leader without keys of their own.

To inspect the expression results as keys, or to hand the composition to a tool that
cannot evaluate expressions:

```bash
pnpm --silent still-shift comp bake --input composition.json --output baked.json
```

The baked file renders the same pixels at every frame. `comp normalize` adds each
expression's canonical AST, which `export-json --normalized true` also writes.

For the Lab preview, run `pnpm lab` and open
[`/composition.html`](http://127.0.0.1:4173/composition.html): play or scrub the
fixtures in `benchmarks/fixtures/composition/` and read their warnings. On a normal
browser with a graphics card the preview is labelled approximate; the exported MP4 is
always exact. The fixture browser reports `comp-text-system-font` for unpinned text;
authored JSON and TypeScript CLI inputs require a real pinned font asset.

See the [composition reference](./composition-reference.md#rendering-a-composition)
for the rendering rules and [Lab inspector](./composition-reference.md#lab-composition-inspector-ce11)
for editing controls and source ownership.

### Inspect and tune a composition in Lab

Open the URL from `comp preview --input composition.json --watch`, or browse
fixtures at `/composition.html`. Select a layer to see its timing, parent, blend,
matte and effect badges, then select a key lane. **All root properties** includes
composition controls and signals. The authored graph shows values and speeds in
local key frames; **Resolved motion in root frames** includes native expressions,
drivers, constraints and the selected precomp instance's clock.

Edit temporal ease/speed or spatial tangents numerically. Segment Bézier handles
also support dragging and keyboard arrows (Shift changes the vertical coordinate).
Applying Bézier replaces that segment's temporal handles and smoothing. Valid edits
update the picture and enter undo/redo history; rejected edits retain the last valid
picture. Discrete, path and 2D camera tracks expose their native data without
unsupported temporal handle controls.

Hide/solo controls change the preview. **Apply visibility** commits them to the
draft, **Reset view** restores the draft's visibility, and saving includes current
view visibility. **Export MP4** renders the visible draft with captured asset bytes.
Bounds/anchors, motion paths/tangents and safe-area overlays stay outside exports.
Click a located diagnostic to seek to its root frame.

**Save JSON source** writes only the fixed JSON input. It preserves native fields,
metadata and source asset paths; external edits retain your dirty draft and require
**Reload source** before saving. Reload discards the draft. Fixture previews instead
offer **Download edited JSON**; keep the file beside its original source so relative
asset paths resolve. TypeScript previews offer temporary tuning and **Copy edited
keys**. Paste the emitted timeline into the owning builder layer, respecting its
local clock; a source reload replaces that temporary draft. Lab never writes the
TypeScript program.

### Author a composition in TypeScript

Import typed layers, properties and timelines from `@still-shift/motion`, and export
the composition as the program's default export. The CLI accepts `.ts`, `.mts`,
`.cts` and native `.json` inputs. Start with the nine small programs in
[`examples/composition`](../examples/composition), or the
[197-line Unequal Margins program](../examples/composition/unequal-margins/program.ts).

```sh
pnpm --silent still-shift comp validate --input examples/composition/01-timeline.ts
pnpm --silent still-shift comp preview --input examples/composition/01-timeline.ts --watch
pnpm --silent still-shift comp export-json --input examples/composition/01-timeline.ts --output timeline.json
pnpm --silent still-shift comp render --input timeline.json --output timeline.mp4
```

Open the URL printed by `preview`. Changes to imported helpers, data and image/font
files rebuild without a page reload. A failed rebuild retains the last valid picture
and scrub position, with located diagnostics; a shorter valid composition clamps the
current frame. Builder previews show their provenance; source files are read-only,
while [inspector tuning](#inspect-and-tune-a-composition-in-lab) can produce edited
keys to paste back into the program.

Node asset helpers in `@still-shift/motion/node` compute hashes and intrinsic sizes
from real files. Use `relativeTo: import.meta.url` for paths relative to the program,
and `fontAsset` for pinned text. The first added layer paints in front. Layer timing
uses native `inPoint`/`outPoint` visibility gates and a `startFrame`/`stretch` local
clock; timeline durations are frames, or `seconds()` rounded with `Math.round` at the
composition fps. Conflicting writes to a property produce located errors.

`lint`, `bake` and `normalize` accept the same program inputs. JSON export rebases
asset paths and refuses to overwrite an existing output. Render usage/invalid-scene
errors exit 2; input-reading or execution failures exit 1. See the
[generated authoring reference](./composition-reference.md) and the compact
[composition authoring skill](../skills/compose-with-still-shift/SKILL.md) for API
examples, property selectors, motion/text presets and current feature limits.

### Check composition motion before delivery

```sh
pnpm --silent still-shift comp lint --input composition.json
pnpm --silent still-shift comp lint --input composition.json --pixels true
```

The report flags frozen motion, abrupt velocity changes, repetitive easing,
simultaneous starts, insufficient text reading time, framing problems and scale/
opacity pops. Errors exit 1; warnings remain advisory. The first command checks
state without rendering. `--pixels true` measures every frame with the pinned
renderer and reports visible pixel motion separately. Read the report's limitations
when pixels or text bounds are unmeasured.

In the Lab composition page, findings appear as frame ranges and timeline markers.
Click a finding to seek to it, or choose **Check rendered motion** to add pixel
measurements. A policy file can adjust thresholds, reading budgets by text role,
shot boundaries, severity and intentional cuts; see the
[motion lint reference](./composition-reference.md#motion-linting-ce12).

## Start the Lab

Follow the [installation instructions](../README.md#install) and the versions in
[toolchain.json](../toolchain.json). Preview needs the JavaScript dependencies;
MP4 export also needs the installed Playwright Chromium and FFmpeg/ffprobe. The
single-image depth workflow uses the Python worker and downloads its pinned model
weights on the first real preparation.

Run commands from the repository root:

```sh
pnpm lab
```

Open [the Lab](http://127.0.0.1:4173/), or a direct screen link in the table above.
The server uses `127.0.0.1:4173`; it must be running for these links to work.
Prepared story, cinematic and component examples let you explore without running
depth inference. The image Lab's corpus gallery needs separately supplied corpus
images; an incomplete corpus does not prevent trying the prepared examples.

**A first hands-on example:** open the shared gallery, choose **Counter and bar**,
change its numeric endpoints, and apply the changes. Scrub the frame slider to
inspect the animation, switch between Commerce and Story context, then export an
MP4 or save the source bundle. The isolated context shows the component without
its surrounding composition.

## Animate one image

Use this route when you have a single flattened image:

```sh
pnpm --silent still-shift animate \
  --input ./path/to/still.png \
  --output ./benchmarks/results/my-still-v001.mp4 \
  --duration 5 --fps 30 \
  --preset slow_push --intensity standard --seed 1842
```

Replace the input path with your own image and choose a new output filename.
This writes an H.264 MP4 and a scene manifest; the terminal prints a JSON result.

| Preset             | Visible behavior                                                                           | Best suited to                                            |
| ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `auto`             | Deterministically selects one of the three depth presets using the image checksum and seed | A repeatable first pass                                   |
| `slow_push`        | Gentle depth-based push                                                                    | One clear focal subject                                   |
| `horizontal_drift` | Sideways depth-based movement                                                              | A composition with room at the sides                      |
| `cinematic_float`  | Combined gentle depth motion                                                               | A restrained floating camera feel                         |
| `locked_hold`      | A completely still frame                                                                   | Detailed evidence, text or narration needing reading time |
| `story_settle`     | Small opening push, then a hold                                                            | One brief entrance emphasis                               |
| `panel_reveal`     | Left-to-right reveal, then a hold                                                          | An illustration authored for that reading order           |
| `comparison_step`  | Left panel holds; right panel appears later                                                | A balanced comparison divided at the center               |

The four editorial presets use flat 2D and skip depth inference. They do not
identify panels or separate objects automatically.

**Controls:** 3–8 seconds resolving to whole frames, landscape 1920×1080 by
default or vertical 1080×1920 with `--format vertical`, both at 30 fps,
`subtle`, `standard` or `strong` intensity, and an unsigned 32-bit seed. `auto`
does not select editorial presets. Depth safety checks may reduce motion or
produce a valid 2D fallback; inspect the result's status and warnings.

To inspect depth separately, run `pnpm depth:prepare -- --input path/to/still.png`,
then load the returned `source.png` and `depth.png` with **Load local pair** on
the image Lab. See the [CLI reference](../tools/still-shift-cli/README.md) and
[depth preparation guide](../services/depth-worker/README.md).

## Cinematic scenes

These moves use authored image planes, crops and subject geometry. Start from
the [cinematic gallery](http://127.0.0.1:4173/illustrated.html?collection=cinematic)
to choose a variation, strength and duration, then play or scrub.

| Variation         | What it does                                                    |
| ----------------- | --------------------------------------------------------------- |
| Layered Parallax  | Sweeps across separated planes while keeping a subject anchored |
| Threshold Push    | Moves forward through a foreground opening                      |
| Lateral Track     | Travels sideways with visible subject drift                     |
| Foreground Reveal | Clears an obstruction, then holds the revealed subject          |
| Rising Vista      | Rises above foreground cover to expose the wider landscape      |
| Curved Approach   | Follows a bowed forward path around foreground edges            |
| Detail to World   | Pulls back from a detail into its surrounding space             |
| Focus Handoff     | Transfers sharpness between foreground and subject              |

Create a four-second preview from a supplied fixture:

```sh
pnpm cinematic:preview \
  --scene benchmarks/fixtures/cinematic-illustrated/ci-02-lateral-track.json \
  --duration 4 --strength dramatic \
  --output benchmarks/results/my-track-v001.mp4
```

This produces the MP4, input/result metadata and an adjacent `.mp4.html` review
page. Strength choices are `dramatic`, `standard` and `restrained`, which differ
from the single-image intensity names. The scene declares 24 or 30 fps; cinematic
clips span 3–8 seconds. Coverage, framing, plane separation and source resolution
checks can reject unsafe camera settings.

For custom assets, follow the [cinematic preparation guide](cinematic-parallax-implementation.md)
and [source-image prompt pack](../prompt-packs/cinematic-illustrated-still-animation-prompt-pack.md).
The [fixture catalog](../benchmarks/fixtures/cinematic-illustrated/catalog.json)
lists the actual available scenes. These variations are prepared scenes, not
additional names for `animate --preset`.

## Storytelling

### Choose a narrative recipe

The [Story Motion gallery](http://127.0.0.1:4173/illustrated.html?collection=story)
supports playback, scrubbing and narration-cue timing adjustments.

| Recipe                                    | Use it to…                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Unequal Margins (`unequal_margins`)       | Compare different pressures or reserves using matched subjects              |
| Access Constraint (`access_constraint`)   | Show a restriction around an otherwise continuous route                     |
| Relationship Build (`relationship_build`) | Introduce connections and destinations in narration order                   |
| Evidence Boundary (`evidence_boundary`)   | Separate supported material, unknowns and a composite reference             |
| Dated System Break (`dated_system_break`) | Establish a dated system and show its connections breaking                  |
| Category Swap (`category_swap`)           | Switch supplied image states on one exact frame                             |
| Motif Resolve (`motif_resolve`)           | Reposition recurring motifs and focus attention on an outgoing relationship |

Render a prepared recipe with:

```sh
pnpm still-shift animate-scene \
  --scene benchmarks/fixtures/story-motion/relationship-build.json \
  --output benchmarks/results/my-relationship-v001.mp4
```

Story scenes use explicit integer frame counts at 24 or 30 fps; the image CLI's
3–8 second cap does not apply. Use the [recipe guide](story-motion-implementation.md)
for required nodes, assets, text, qualifications and cue rules.

The earlier [illustrated collection](http://127.0.0.1:4173/illustrated.html?collection=illustrated)
also provides six prepared studies: `chronicle_reveal`, `resource_flow`,
`access_pressure`, `comparison_build`, `pose_prop_change` and `crisis_fracture`.
These accept supplied layers, paths and alternate states through `animate-scene`;
they retain the 3–8 second limit. See the [six-study guide](history-offstage-motion-implementation.md).

### Build a passage

A **beat** is one planned visual idea. A **cue** is a named frame, often tied to
narration. A **passage** combines beats, templates and cues into a longer sequence.

The [passage workbench](http://127.0.0.1:4173/passage.html) lets you:

- Inspect beat, cue, event and camera tracks with a shared playhead.
- Adjust cue-relative or event-relative timing, template parameters and styles.
- Declare subject/camera continuity with cuts, carry or resets.
- Undo/redo edits and inspect bounds, origins, safe areas and diagnostics.
- Load optional matching narration; import/export plans and local workspace JSON.

Start with `benchmarks/fixtures/story-authoring/linked-comparison.json` or
`linked-network.json`. When importing JSON with relative paths, set **Import base
directory** to its containing directory relative to the repository root.

For a complete illustrated example, choose **30-second illustrated sequence** in
the workbench. It combines a detail reveal, an action with a registered before/after
state, and a consequence shot. See the [reuse guide](illustrated-sequence.md) for
artwork slots, cue retiming and export commands. Narration-paced and linked sound
versions are also available. Use **Sound cues** to bind effects to narration cues
or visual events, adjust gain/fades, and save the plan. See the
[sound guide](passage-audio.md) for preview, audio assets, mixing and export modes.
For generated effects, set `ELEVENLABS_API_KEY` on the server and open **Sound cues
→ Generate sound with ElevenLabs**. This optional generator saves reusable audio
and prompt metadata; importing existing WAV/MP3 files needs no provider account.
The same feature is available through `pnpm still-shift sfx generate --help`.

To pace a passage from recorded speech, open **Narration cues → Import narration
timing**. Select WAV/MP3 plus word JSON or SRT, preview changes, then apply them.
Match existing phrases to move linked animation and sounds, or add transcript
cues for new links. The import is undoable and cues remain editable. See the
[timing import guide](narration-timing.md) and the workbench's **imported narration
timing** example for a new 36-second story. Beat lengths stay authored; this step
does not transcribe audio or generate a voice.

Open **Text containers** to give measured text a caption panel, speech balloon or
thought cloud. Set its padding, fill, border and tail; it follows the text's
movement and fades. Open **Character poses** on a template with named image states
to choose an initial pose and add changes anchored to cues or event edges. Changing
a cue retimes its poses and linked sounds together. These edits support undo/redo,
Save plan and portable workspaces.

Use **Character actions** for reusable walk, knock, offer, receive and react
sequences. Choose their poses, duration and cue; sounds can follow each action's
start or end. **Held props** attaches a prop's grip to a named hand anchor, with
editable pickups, transfers and releases. Hand anchor coordinates are authored
in the template's pose states. Remove competing prop movement before attaching it.

The workbench's **character actions, held props and narrated timing** example
demonstrates these features. For another character, generate
transparent posture images from one identity reference, then register them as
named template states. **Download pose generation brief** supplies reusable image
instructions; generation itself is external to the Lab. See the
[container and pose guide](story-acting.md) for the asset contract and commands.

Prepare a plan before rendering it:

```sh
pnpm story:passage \
  --plan benchmarks/fixtures/story-authoring/linked-comparison.json \
  --output-dir benchmarks/results/my-passage-prepared-v001 --prepare-only

pnpm story:passage \
  --plan benchmarks/fixtures/story-authoring/linked-comparison.json \
  --output-dir benchmarks/results/my-passage-render-v001 --silent
```

Choose exactly one of `--prepare-only`, `--silent` or `--narration <file>`.
Narration must match the plan's checksum and cover its source interval. Rendering
produces `passage.mp4`, a review page and reports. You can render `--beat <id>` or
a half-open range such as `--start-frame 180 --end-frame 204`. Verified beat renders
are cached; `--resume` continues an interrupted render with the same request.
Changed plans need a fresh output directory and can still reuse matching beats.

`--format vertical` resolves each beat from its template's `formats.vertical`
override before rendering. If any template lacks a vertical variant, preparation
stops with a diagnostic. The narration, cues and frame count remain shared with
the landscape cut.

Linked authoring is available, including explicit handoffs. The broader continuous
storytelling rollout remains an opt-in engine/prototype; do not assume every
recipe or episode has been converted. See [passage authoring](story-beat-planning.md),
[engine/workbench details](story-engine-tooling.md) and the
[continuous prototype status](story-motion-continuous-implementation.md).

## Vertical video

Use `--format vertical` for a 1080×1920 output. The default remains 1920×1080,
and each render uses one format throughout. The image Lab has a format selector;
its guide toggle shows authored safe areas and the landscape frame's footprint.
In vertical image mode, **Auto** estimates focus from depth; switch to manual
X/Y focus when the depth map has no discrete subject.
The illustrated gallery selects authored vertical variants and can reframe
cinematic scenes when their artwork has enough coverage. The passage workbench
uses authored story overrides.

For a single image, a depth preset can estimate a focal point from its depth
texture. Supply a normalized `--focus x,y` when you know the subject position;
`0,0` is the upper left and `1,1` the lower right. Flat presets and source-only
vertical previews require an explicit focus because they have no depth estimate:

```sh
pnpm --silent still-shift animate \
  --input ./stills/subject.png \
  --output ./outputs/subject-vertical.mp4 \
  --format vertical --focus 0.55,0.42 \
  --preset slow_push
```

`animate-scene --format vertical` and `cinematic:preview --format vertical`
select a catalog-declared variant when available. A cinematic scene without one
uses automatic reframe and either produces a resolved 9:16 scene or reports the
specific coverage or source-resolution problem. Standalone illustrated scenes
need an authored vertical variant. A standalone story scene can include
`formats.vertical` for direct CLI resolution. The commands never stretch a
landscape scene. For a story passage, add vertical overrides to the relevant
templates and run:

```sh
pnpm story:passage \
  --plan ./path/to/passage.json \
  --output-dir ./outputs/passage-vertical \
  --format vertical --silent

pnpm still-shift passage lint \
  --plan ./path/to/passage.json --format vertical
```

The [safe-zone research](vertical-safe-zones-research.md) found no published
fixed rectangle for organic Shorts. The approved default has no numeric organic
Shorts overlay zones; authors can declare zones for a scene, inspect the Lab guides, and fix
coverage, crop or text diagnostics before using a render.

The [vertical review gallery](review/vertical-video/README.md) shows decoded
1080×1920 frames from all five render families. The
[dual-format story plan](../benchmarks/fixtures/story-authoring/vertical/linked-network.json)
and [illustrated portrait variant](../benchmarks/fixtures/history-offstage-v2/vertical/chronicle-reveal.json)
are runnable examples.

## Commerce

### Make a product clip

The [Commerce workbench](http://127.0.0.1:4173/commerce.html) browses 40 format ideas
and eight recipes. **Three formats and one recipe render today; all complete
treatments are Experimental.** Other entries remain Reference only.

| Selection      | Implemented treatment                                                 | Required inputs                                     |
| -------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| H03            | Product hero, headline entrance and held CTA                          | Photo or cutout, supplied copy and sources          |
| H01            | Product slide and settle, headline and CTA                            | Prepared transparent cutout, copy and sources       |
| H04            | Two animated callouts and CTA                                         | Cutout, two image targets, callout copy and sources |
| A01            | Hook, two-callout body and CTA close                                  | The combined H01/H04 inputs                         |
| A01 `floating` | Intact product hovering above a stationary palm, without overlay copy | Separate product cutout and palm-up background      |

H01/H03/H04/A01 support landscape 1920×1080, portrait 1080×1920, square
1080×1080 and feed 1080×1350 (4:5), at 24 or 30 fps. The named Palm-up Product
Float v1.0 example is scoped to A01 `floating` in the feed profile. Commerce
duration uses frame counts and is not capped at eight seconds.

Choose a renderable entry, supply the image and copy, set shape/duration/fps and
the protected product-label region, then **Update preview**. Review it with
playback or scrubbing before **Export MP4** or **Save source bundle**. H04 and
the callout form of A01 also need two callout targets. A cutout declaration does
not remove a background. Long copy or invalid geometry can block export.

The CLI offers the same prepared-scene route:

```sh
pnpm still-shift prepare-commerce \
  --brief benchmarks/fixtures/ecommerce-motion/h03-landscape.brief.json \
  --output benchmarks/results/my-product-v001.json

pnpm still-shift animate-scene \
  --scene benchmarks/results/my-product-v001.json \
  --output benchmarks/results/my-product-v001.mp4
```

Use the [commerce guide](ecommerce-motion-implementation.md) for upload limits,
brief fields, multiple headline beats and timing overrides. The
[capability registry](../catalogs/ecommerce-motion/capabilities.json) is the
source of truth for renderability and Production registrations.

### Explore product components and effects

The [commerce component gallery](http://127.0.0.1:4173/commerce-components.html)
provides editable examples, MP4 export and source bundles. Atomic components are
available for use; gallery compositions and effects remain Experimental.

| Group                   | Available building blocks and examples                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Visuals                 | Product layer, background, product shadow, panel, text block, path + draw                                         |
| Basic motion            | Float, translate, fade, uniform scale and in-plane rotation                                                       |
| Geometry and layout     | Product anchors, following callouts, detail windows, measured layout, alpha mattes and sequences                  |
| Motion effects          | Motion blur, directional blur, overshoot + settle, drift + rock and echo trails                                   |
| Depth and focus effects | Responsive shadow, focus handoff and layered parallax                                                             |
| Surface and atmosphere  | Material highlight, highlight bloom, film grain, particles, moving studio light and background-graphic distortion |
| Compositions            | Studio Float, Product Introduction, Visible-detail Callout and Composed Studio                                    |

Effect examples expose enabled/disabled comparisons and relevant strength, sample
or seed controls. High blur sample counts cost more to preview and render. Product
rotation is 2D; a parallax effect does not create unseen product surfaces or a 3D
turntable. See [atomic components](ecommerce-atomic-components-implementation.md),
[effects](ecommerce-motion-effects-implementation.md) and
[spatial tools](ecommerce-spatial-components-implementation.md).

## Reusable components

The [shared gallery](http://127.0.0.1:4173/reusable-components.html) contains **20
editable examples**, each viewable in Commerce, Story or isolated context. These
demonstrate components that can be reused in authored scenes; the gallery is not
a general drag-and-drop scene editor.

| Need                                                   | Example names in the gallery                                 |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| Repeat and arrange elements                            | Independent markers; Measured feature row; Staggered markers |
| Direct attention with labels and lines                 | Following label; Focus outline; Underline; Range bracket     |
| Animate a quantity                                     | Counter and bar                                              |
| Transform or reveal something                          | Scale, turn and draw                                         |
| Change supplied images and captions at a precise frame | Exact state cuts                                             |
| Move a marker along a supplied path                    | Follow a route                                               |
| Show a detail or a symbolic relationship               | Product detail tour; Supply-route change                     |
| Control when components exist                          | Visible for a moment; One detail after another               |
| Keep a badge attached to a moving point                | An attached badge                                            |
| Keep multiple captions inside one box                  | Words that fit                                               |
| Reveal an image through a moving shape                 | Through an aperture                                          |
| Combine timing, labels, fitting and masks              | Three detail moments; Three supply phases                    |

Choose an example and context, change its visible controls, apply, then play or
scrub. Save settings for a later gallery session, save a source ZIP for the
resolved scene and assets, or export MP4. An invalid update keeps the last valid
canvas but disables export until corrected.

Custom reuse is available through the shared component API: independent instances,
layout/stagger, attached annotations, scalar values, transforms/draw, exact state
cuts, path travel, visibility/sequencing, anchor pins, fitted text and alpha masks.
See the [component authoring reference](reusable-components.md) for code examples,
versioned contracts and limits. Story passage fixtures for these behaviors live
in `benchmarks/fixtures/reusable-components/`.

## Batch animation

Batch processes independent flattened images using the single-image presets.
It does not accept prepared scene JSON or passage plans.

Create `shots.jsonl` with one object per line; image paths are relative to this file:

```jsonl
{"id":"shot-001","inputPath":"./stills/first.png","durationMs":5000,"preset":"slow_push","intensity":"standard","seed":1842}
{"id":"shot-002","inputPath":"./stills/second.png","durationMs":3000,"preset":"locked_hold"}
{"id":"shot-003","inputPath":"./stills/third.png","durationMs":3000,"preset":"locked_hold","focus":[0.5,0.5],"formats":["landscape","vertical"]}
```

```sh
pnpm still-shift batch \
  --manifest ./shots.jsonl \
  --output-dir ./benchmarks/results/my-batch-v001 --concurrency 2
```

Concurrency is 1 or 2. Completed items with matching requests and verified files
can be reused on retry. **Exit code 0 means every item was processed, not that
every item succeeded:** read `batch-summary.json` and `batch-results.jsonl` for
failures. Changed requests and conflicting outputs require inspection; the batch
does not silently overwrite them. See [batch details](../tools/still-shift-cli/README.md#unattended-batch).
Use `--format vertical` as the batch default, `"format":"vertical"` on one
item, or `"formats":["landscape","vertical"]` to render both. A dual-format
item writes separate `-landscape` and `-vertical` outputs. Include `focus` for
flat vertical presets.

## Save, export and share

| Output                     | What it preserves                                                                                    | Use it for                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| MP4                        | Rendered video                                                                                       | Editing into a larger video or reviewing playback                     |
| Scene/result JSON          | Resolved scene, checksums, warnings and render details; exact sidecars depend on the command         | Reproduction and diagnosis                                            |
| Commerce/shared source ZIP | Prepared scene and exact dependencies; brief or gallery settings where applicable                    | Moving a renderable source example between checkouts                  |
| Passage **Save plan**      | Current source plan with resolved local references                                                   | CLI preparation/rendering or packaging                                |
| Passage **Save workspace** | Local editing JSON with loaded template definitions                                                  | Reopening edits on the same filesystem; assets/fonts are not embedded |
| Portable passage package   | Plan, templates, images, fonts, sound assets and optional narration, plus `workspace.json` checksums | Moving a complete set of passage inputs                               |

To package a passage into a new directory:

```sh
pnpm story:package \
  --plan benchmarks/fixtures/story-authoring/linked-comparison.json \
  --output-dir benchmarks/results/my-portable-passage-v001
```

Copy the whole directory. Render by passing its `workspace.json` to
`story:passage --plan`; it still needs the Still Shift toolchain. For narrated
plans, supply the matching `--narration <file>` when packaging and explicitly
select the packaged audio when rendering. A package must be inside the checkout
for the Lab to serve it; the CLI can read it elsewhere.

The illustrated/cinematic gallery previews scenes; use the CLI for export. The
passage workbench saves edits; use `story:passage` for MP4 rendering. Commerce and
shared-component galleries have their own MP4 export buttons.

Ordinary exports preserve existing files. Use a fresh output name/directory for
each revision; passage `--resume` and verified batch retries are the explicit
continuation paths. The `*:prepare` fixture-generation scripts can rewrite demo
fixtures and are maintenance tools, not required startup steps.

## When something does not work

| Symptom                                          | Next step                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| A Lab link will not open                         | Run `pnpm lab` and check the terminal; port 4173 must be available                              |
| No real image corpus appears                     | Use the prepared galleries, or prepare an image and use **Load local pair**                     |
| Export is disabled after an edit                 | Apply/update the preview and fix the reported validation error                                  |
| A commerce selection is Reference only           | Choose H01, H03, H04 or A01, or use the implemented component gallery                           |
| A cinematic name fails with `animate --preset`   | Use its prepared scene with `animate-scene` or `cinematic:preview`                              |
| Text does not fit                                | Shorten supplied text, adjust declared layout, or use fitted text within its allowed size range |
| Source/font checksum or dimensions do not match  | Reprepare the scene with the intended dependency bytes; copying a JSON alone is insufficient    |
| A downloaded passage cannot find assets          | Use the correct import base directory or create a portable package                              |
| A 2D result appeared instead of depth motion     | Inspect the result's warnings and fallback status; review the source/depth pair                 |
| An output already exists                         | Choose a new output or use the documented matching-request resume/retry workflow                |
| A required browser, encoder or worker is missing | Revisit [installation](../README.md#install) and run `pnpm toolchain:check`                     |

## Ask an AI about Still Shift

The repository includes the [ask-still-shift skill](../skills/ask-still-shift/SKILL.md).
It uses this guide for discovery and checks implementation sources when exact
support, flags or limits matter.

Example requests:

```text
Use $ask-still-shift to show me the available features and where to try them.
Use $ask-still-shift to choose a workflow for a 4:5 product clip with two callouts.
Use $ask-still-shift to explain how to keep a label attached to a moving object.
Use $ask-still-shift to help me edit cue timing and share a portable passage.
```

To install the skill from another checkout, link its directory into your personal
skills directory (leave any existing installation in place until you inspect it):

```sh
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -s "$PWD/skills/ask-still-shift" "${CODEX_HOME:-$HOME/.codex}/skills/ask-still-shift"
```

Run this from the repository root. The link keeps the installed skill and guide
aligned with this checkout. If you move the checkout, update the link.

For contributors: when a user-visible feature changes, update this guide with
its entry point, required inputs, availability and limits. Keep detailed contracts
in the linked implementation references; check catalog counts against source.

### Render and inspect passages through compositions

Use `pnpm story:passage --plan <plan.json> --output-dir <fresh-directory> --silent
--renderer composition` to compile each story beat to `composition-1` before export.
Add `--backend webgl2` for the WebGL2 backend; Canvas 2D is the default. Narration,
sound cues, frame ranges, cancellation/resume and passage handoffs use the existing
passage pipeline. Choose a fresh output directory when changing renderer/backend.

For the matching Lab preview, open `passage.html?renderer=composition` (or add
`&backend=webgl2`). Beat seeking and editing retain their existing controls. The
compiled beat composition is retained in the passage cache for inspection.

### Use a native composition as a passage beat's picture

Create a companion JSON map, for example `{ "reset": "native-beat.json" }`, then
add `--composition-beats <map.json>` to `story:passage --renderer composition`.
Paths are relative to the map. The picture file must match the resolved beat's size,
frame rate and final source duration. Write native camera/subject continuity into
that file; implicit story carry at a native boundary is rejected. The story template
continues to hold narrative and cue metadata, while the native file owns its visuals.
Retain the companion map, picture files and their assets alongside the story workspace;
the existing workspace packager exports the story plan/templates separately.

For matching passage preview, use
`passage.html?renderer=composition&composition-beats=<workspace-map-path>`.
Native layers appear in the state inspector; edit their motion in the composition
file or composition inspector. Saved Lab workspaces retain the loaded native data.
The acceptance example is `benchmarks/fixtures/composition/ce4a/native-beats.json`.

Map narrative authority explicitly in the native picture:

```json
{
  "metadata": {
    "passage": {
      "cueMarkers": { "strain": "strain" },
      "eventMarkers": { "shared-strain": "shared-strain" },
      "subjectLayers": {
        "house-a": "story-content/house-a",
        "house-b": "story-content/house-b"
      }
    }
  }
}
```

Root markers must match the narration cue frames and linked event windows. Layer
paths may point into an adapted story precomp; share its assets with the containing
composition. The native beat fixture demonstrates this with a new blend overlay.
Missing mappings and unsupported legacy acting tracks return a diagnostic.
