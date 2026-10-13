# Native Blender asset capture

This is a candidate Node API on the MS3 branch. It is not part of the published
0.1.1 runtime and does not change the channel's current production pointer.

`captureBlenderAsset(job, { blenderExecutable, signal, nodeMemory })` renders an
existing hashed `.blend` collection through one shared worker. The producer
retains native geometry, deformation and material graphs. It returns a bound
capture receipt with numbered PNGs and per-frame evaluated surface hashes,
world matrices/bounds, actual controls and camera information. It never saves
or rebuilds the source model. Blender remains the editable source application.

The host executable is separate from asset content; pass the actual executable
path. Source collection, camera and declared custom-property controls must exist.
Manual jobs provide every declared control for every frame, independently of
previous state. Each property has a finite ordered range. Source-frame sampling
and repeated/backward requests remain absolute. An existing output directory
rejects; partial or failed output stays available for diagnosis.

Jobs are passive JSON up to1MiB, with up to2,000 frames,64 controls,128 hidden
parts,4,096px per dimension and8,388,608 pixels. The prospective16MiB Node
admission and bounded receipt/file reads share the caller's owner; foreign leases
stay active. The separate Blender process has its own resource use; these Node
checks do not certify Blender/driver/physical host RSS. Cancellation uses the
existing process controller and settles after the child exits.

The worker/job are frozen before execution. The capture records the actual
Blender version/build, source hash, engine/sample settings and baked PNG color
interpretation. A source change, camera/control change or native material change
requires affected new frames. Downstream text edits can reuse exact captured
PNG/observation bytes, with zero additional Blender calls. Geometry/projection,
encoded picture, continuous playback and listening remain separate evidence.

The current receiver is Still Shift's native sequence/text composition. Create an
ordered `composition-sequence-1` source manifest from captured PNG hashes and use
a pinned sequence asset at the same clock. Native PNG source is display sRGB;
explicit Still Shift delivery profiles emit BT.709 PNGs, which require source
normalization before reimport. Preserve the captured color/alpha declaration.
This route does not transfer Blender drivers, procedural shaders or editable
mesh rigs into Three.js or the Lab. It preserves native `.blend` editability
and a verified cached receiving subset.

The [current evidence](./mechanism-shorts-ms3-blender-capture-results.json) retains
all ten native contract/geometry probes and a full129,768-vertex zipper capture.
Its four control states and repeated pose match; two lossless Still Shift exports
change only the text area, with all captured bytes unchanged. H.264 comparison
is separately retained because lossy output is not region-byte-identical.
No narrated episode or whole/pilot acceptance follows from this prototype.

## Production queue versions

The candidate engine now exposes `BlenderProductionQueueSchema` and its matching
item, product, checkpoint and episode-report schemas/types. A Blender queue uses
`mechanism-production-queue-2`; every item requires `backend: "blender-native"`.
Its `family` is a descriptive native-object identifier such as `zipper` or
`keyhole-slot`. It supplies no qualification in the older three-family registry.
`familyPath` identifies the native source binding document, and `cuePath` the
native episode plan. Both documents and any declared QA plan must have unique
file pins. Inspecting their complete dependency set belongs to the backend.

Version 2 products and episode reports use their corresponding `-2` versions;
reports also retain the explicit backend. The version dispatch schemas feed the
same durable controller, targeted retry API and report reader. They retain owned
artifact hashes, current input/output/code/profile/clocks, sealed completion,
original attempts, independent failures and the six separate QA dimensions.
The common report bundle keeps its version-1 envelope and accepts either explicit
episode-report version. Generic unit artifacts prove this lifecycle only.

The existing version-1 queue/product/report schemas and family admission stay
strict. Legacy item identity hashes stay exact; a Blender identity includes its
backend. A completed legacy question cannot be relabeled as a Blender item or
reuse a legacy product under the new manifest. The Three.js native executor
rejects Blender items before source admission. The production CLI and declarative
queue factory still use that executor. The candidate [native episode adapter](./mechanism-blender-episode.md) now supplies
a Node executor and absolute cue compiler with separately bound narrated-draft
evidence. Native QA-plan/handoff/CLI integration and all-ten HD delivery remain
in progress.
