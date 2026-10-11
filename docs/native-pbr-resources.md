# Native PBR resource preparation

MS2 provides a bounded resource component for imported rigid glTF geometry. It
uses `solid-geometry-2` and `native-pbr-material-1`, with separate encoded-source
and decoded-pixel identities. Existing native source1/source2 parsers remain
strict. Explicit source3 preparation, binary admission and shared-world composition
preview consume this component. Every used mip now has component storage/transfer
validation. A standalone strict frame3 owner now measures actual GPU draws and
Three state with independent validation. Explicit asynchronous composition
observation/output3 capacity now consume it. Normal authenticated source3 exports now consume it. Installed and complete
world/source/body/replay proof remain pending.

## Node preparation

```ts
import {
  importRigidGltf,
  prepareRigidGltfPbr,
} from "@still-shift/animation-engine";

const imported = await importRigidGltf("./assets/machine.glb");
const decoded = await prepareRigidGltfPbr(imported, { signal });
// decoded.geometry has manifests; decoded.images has separate Uint8Array pixels.
```

Preparation verifies the imported canonical identity, geometry/material contract
and complete counted component payload before pixel decoding. It checks image
cardinality, encoded/pixel budgets, exact base64/byte hashes and encoded header
MIME/dimensions. Matching total pixel area is insufficient: width and height must
match individually. Parts/node bases are copied and frozen for the handoff.

The `gltf-rgba-decoder-1` profile requires FFmpeg **8.0.1** and returns
`rgba8-straight-top-left-1`. Its child uses one thread, a 30-second decode timeout,
bounded output/diagnostics and TERM/KILL cancellation; completion waits for closed
pipes. Startup/version probes are also bounded. Failures carry a located
`RigidGltfImportError`; caller cancellation retains its reason.

PNG preparation checks CRCs, chunk bounds/order, eight-bit supported color types,
palettes and transparency structure. Pixel-bearing chunks remain; color-profile,
aspect, EXIF and animation metadata are ignored. JPEG decoding ignores EXIF
orientation. Exact PNG controls retain RGB beneath zero alpha, including palette
transparency. These policies follow the
[glTF image rules](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
and [PNG structure/transparency rules](https://www.w3.org/TR/png-3/#11tRNS).

## Browser ownership

```ts
import {
  prepareNativePbrResources,
  createNativePbrResources,
} from "@still-shift/renderer-core/native3d-browser";

const prepared = await prepareNativePbrResources(geometry, pixelInputs);
const resources = createNativePbrResources(prepared);
try {
  // Consume resources.geometries/materials in the admitted world integration.
} finally {
  resources.dispose();
}
```

`geometry` and `pixelInputs` must arrive through a verified binary handoff; that
composition transport is pending. The test fixture's tiny numeric-array handoff
is test-only. It does not establish admission for production image payloads in
existing JSON worker packets.

Browser preparation parses the strict contract, copies/re-hashes each RGBA input
and retains private pixels. The factory requires an owned prepared object. It
creates float position/normal/UV/tangent attributes, bounded indices/groups and
opaque `MeshStandardMaterial` resources. Linear factors are assigned explicitly;
OPAQUE ignores source alpha. Base-color maps use sRGB RGB with linear alpha;
packed G roughness/B metalness and tangent-space normal maps use linear data.
Supplied tangent XYZW, normal scale, double-sided setting and numeric samplers
survive. No tangent generation or unsupported-material approximation occurs.

Textures pool by image, color space, UV channel and sampler. Identical packed
metal/roughness and normal bindings share a texture; sRGB and linear roles remain
separate. Disposal owns the original geometries/materials/textures even when
public collections change, releases texture data and is idempotent.

## Counted payload admission

| Component bound                   |             Limit |
| --------------------------------- | ----------------: |
| Images / unique texture bindings  |           16 / 96 |
| Image axis / aggregate pixels     | 4,096 / 8,388,608 |
| Aggregate RGBA / typed attributes |   32 MiB / 16 MiB |
| Counted component payload         |            64 MiB |

The pure `preflightNativePbrResources` calculator receives already validated
geometry and is shared by Node and browser preparation. It counts source Number
array payloads, CPU/GPU typed attributes, private RGBA, each binding's CPU texture
copy and every GPU mip level. Non-power-of-two dimensions halve with floor and
clamp to one. Allocation stops before decode/Three creation when the bill fails.

This is a component payload bill. Caller-owned copies, object overhead,
decoder/verification scratch, process RSS and complete world/GPU/PMREM admission
remain outside it. Existing world, packet and replay limits are unchanged.

## Actual GPU evidence

`captureNativePbrGpuDraw` runs synchronously at the indexed draw boundary. It
checks declared material/ranges, actual GPU attribute/index bytes and pointers,
factor/UV-transform/normal-scale uniforms, blend/cull enablement, owned texture
handles and filter/wrap parameters. It retains copied vertex/shader bytes;
`sealNativePbrGpuDraw` hashes those copies afterward.

Tiled RGBA8 readback matches every used mip texel against a separate WebGL
reference derived from private prepared pixels. The reference uses the declared
minification/magnification/wrap sampler and sized linear or sRGB storage in the
same context. Every level queries actual component bit widths, normalized type
and color encoding; a float shader checks its dimensions and every transfer sample;
its existing transfer tolerance is **0.0001**. Existing native tolerances are unchanged.
The component requires WebGL2 and float color-buffer support. Mip generation has
implementation-dependent filtering ([GLES3 section 3.8.10.5](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf));
this reference establishes current-environment derivation without imposing a CPU
filter formula or cross-driver equality. `native-pbr-gpu-draw-2` returns bounded
per-level dimensions, sized storage, sample counts and error maxima. Pixels do
not enter its sealed receipt. Verification requires the live private prepared
reference; releasing that reference fails closed rather than reading mutable
Three texture data. Owned mip/LOD/compare defaults are checked and foreign sampler
objects rejected.

The verifier admits reference/output GPU textures and tiled byte/float backing
before allocation, then restores GL pixel-store/PBO/sampler/program/VAO/framebuffer
state and releases its owners on success or failure. This scoped bill does not
certify complete world/metadata/vertex-receipt/driver accounting.

Run `pnpm test:browser:native3d-pbr-resources` locally. The pinned Three/Chromium
fixture retains 18 frames across all six minification filters, both magnification
modes, every wrap mode and a 300×257 tiled NPOT case. It rejects 10 actual corruption/
quota faults and verifies 28 restorations with deliberately foreign PBO/pixel-store
state. Failed quota admission creates zero reference textures. Each case retains
zero verifier owners after disposal. [Mip results](./mechanism-shorts-ms2-pbr-mip-results.json)
record the current pass and all preceding typing/format failures.
[MS2 results](./mechanism-shorts-ms2-results.json) retain all staged inputs,
expected reds, compiler/lint failures and the failed valid-stride browser run;
that run's unavailable terminal receipt is not reconstructed.

The caller owns draw-to-mesh/material association. This receipt certifies the
supplied draw and complete used-mip storage/transfer/derivation. It does not certify
whole-frame camera/world graphics, composition observations, complete
imported mechanisms, exports, installation or human appearance acceptance.
The owning [MS2 importer criterion](./mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring)
remains unchecked until those integration requirements are complete.

## Explicit rigid source3 and shared world

`MechanismSceneV3Schema` adds `mechanism-scene-3` for rigid PBR geometry. Its
`solid-geometry-2` meshes retain imported parts, UVs, supplied tangents and linear
PBR factors. Named anchors and the existing slider, hinge and spring-return
kinematics use the imported part frames; embedded glTF animation does not become
rig behavior. Changing teaching shapes and the deforming ratchet/pawl route are
excluded. Source1/source2 parsers, materials and shape paths remain compatible.
The generated [source3 field schema](./schemas/mechanism/scene-3.schema.json)
accompanies authoritative semantic validation in the Zod contract.

Each image has exactly one `resources` reference with image ID, local relative
path, exact RGBA byte count and SHA-256 matching its pixel manifest. Pixels remain
outside the source JSON. `loadNativePbrSourceResources(input, sourceDirectory,
{ signal })` parses the contract, verifies canonical geometry and preflights the
counted component payload before opening resources. It resolves a canonical local
root, rejects escapes/URI/traversal paths, requires regular exact-sized files,
uses no-follow/nonblocking opens and bounded reads, rechecks file state and hashes bytes.
Failures identify the resource field; cancellation retains the caller's reason.
The returned `paths` identify actual local dependencies for future integration.

`prepareNative3DSceneV3(input, sourceSha256)` produces immutable source/pose
preparation and a `native3d-source-3` identity binding verified raw source bytes
and the canonical parsed scene. The caller must hash/verify the raw source file;
this function cannot reconstruct original JSON bytes from a parsed object.
`prepareNativePbrResources` accepts its readonly geometry with separate verified
pixel inputs. `createNativeThreeWorldV3(renderer, preparedSource, preparedPixels)`
requires matching geometry identities and owns the created PBR resources. It uses
the existing shared hierarchy, camera, lights, environment and output profile.
Part arrays may list children before parents: groups are created before parent
links are attached. Disposal releases both world and resource ownership and is idempotent.

```ts
import {
  prepareNative3DSceneV3,
  evaluateMechanismFrameV2,
} from "@still-shift/renderer-core";
import {
  prepareNativePbrResources,
  createNativeThreeWorldV3,
} from "@still-shift/renderer-core/native3d-browser";

const source = await prepareNative3DSceneV3(sourceMetadata, rawSourceSha256);
const pixels = await prepareNativePbrResources(
  source.source.geometry,
  pixelInputs,
);
const world = createNativeThreeWorldV3(renderer, source, pixels);
try {
  const frame = evaluateMechanismFrameV2(source.evaluation, frameRequest);
  world.applyFrame(frame, width, height);
  renderer.render(world.world, world.camera);
} finally {
  world.dispose();
}
```

Run `pnpm test:browser:native3d-pbr-world` serially with other browser groups.
The pinned imported lever fixture uses child-before-parent source metadata and
performs neutral, midpoint, rotated, repeated,
reverse and restored captures. It compares actual GPU model-view/projection
uniforms against independent camera/pose math, checks the PBR draw resources and
rejects a seeded incorrect world pose. Literal pivot/anchor references and repeated
pixel hashes constrain this diagnostic. It is not a human appearance review.
Detailed staged receipts are in [source3 world results](./mechanism-shorts-ms2-pbr-world-results.json).

## Source3 composition preview

`CompositionSchema` admits explicit `mechanism-scene-3` native assets. Node
`readCompositionSource` verifies canonical binary dependencies and issues
`composition-prepared-native3d-3`. Source entries carry `binaryResources` with an
image ID, opaque `native-pbr/<hash>` route, exact byte count and pixel SHA-256.
Mixed source1/source2/source3 metadata is bounded to 64 assets and 32 MiB of binary
references. Individual source/transport/frame1 and2 parsers remain strict.

Source3 controllers use `rigControls` and `pbrMaterialOverrides`: linear
`baseColorFactor`, `metallicFactor`, `roughnessFactor` and `doubleSided`.
Static styles preserve submitted meshes and mesh-data identity while updating
effective source/geometry identities. `native3d-frame-3` samples the existing
rigid evaluator in absolute source time, including reverse/random seeks and
physical anchor projection. Generated [frame3](./schemas/mechanism/native-frame-3.schema.json)
and [transport3](./schemas/mechanism/prepared-native3d-3.schema.json) schemas accompany
semantic validators.

Browser `loadCompositionResources` fetches separate binary routes with exact
`Content-Length`. Short, oversized, missing or checksum-mismatched bodies fail
before publication. Private pixel copies and world storage are admitted by managed
contexts before allocation; failed phases release their owners. Resource maps
remain runtime-only. Three loads dynamically; importing the pure renderer does
not resolve Three. The Lab serves verified opaque routes and supports PBR
material/part inspection.

Create a WebGL2 preview, await `preview.prepareFrame(frame)` and call
`renderCompositionFrameAsync(preview, frame)`. Source3 uses the existing shared
HDR/MSAA/depth/world-artwork/ACES resolve path. Run
`pnpm test:browser:native3d-pbr-composition` serially. Current proof covers six
lever frames, repeated/reverse pixel equality, one style, five actual HTTP stream
and checksum faults, and zero retained managed owners after disposal. Pixel arrays
never enter production transport JSON.

The preview slice did not prove independent source3 frame/world/anchor/draw
observations. Later standalone evidence is documented below; used-mip component
validation remains a separate proof boundary.
`collectNativeObservations: true` now uses the explicit output3 integration below.
Explicit source3 export requests now use execution3 and normal dispatch below.
Installed proof, whole-world
accounting and bounded source JSON admission remain required. The importer
criterion stays unchecked. [Staged results](./mechanism-shorts-ms2-pbr-composition-results.json)
retain every failed run, lost terminal receipt and strict aggregate timeout.

## Standalone source3 observations

`@still-shift/renderer-core/native3d/browser` exports
`createNativeThreeQueuedFrameObservationV3`. It requires the exact prepared
variant and its owned Three world, live private PBR preparation and the verified
appearance SHA. Apply the assigned snapshot and local visibility to that world
before capture. Capture performs the actual color render; all GPU and numeric
queries finish synchronously before its immutable hashes finalize.

The strict `native3d-observed-frame-3` receipt records mesh/group coverage,
GPU attribute/index digests, submitted model/view/projection/normal matrices,
material identity and every used mip. Hidden and culled meshes require explicit,
independently checked reasons. Custom material shaders, undeclared emissive/maps,
foreign meshes, mutated hierarchy/geometry, unsupported write/discard/depth state
and missing or duplicate draws reject the capture. Parts, camera and part-local
anchors come from the current Three world; physical occluder witnesses require a
verified drawn mesh.

The pure renderer export `assertNativeObservedFrameV3` checks the receipt against
the trusted prepared variant, assigned sampled frame and appearance identity. It
packs expected Float32/index bytes independently and verifies mesh/material/mip
coverage and anchor projection/physical visibility. Existing matrix1e-8,
pixel0.5 and mip-transfer0.0001 profiles remain fixed. Receipt owners must be
disposed after use; owner disposal and aborts invalidate pending finalization.

This API began as a standalone source3 observation boundary. The composition
collector now consumes it through the explicit output3 integration below.
Authenticated normal exports and standalone journals now have explicit proof
below; installed consumer proof remains pending. Original frame1/frame2/output2 parsers retain their strict behavior.
The scoped allocator proof covers observation copies, metadata and hashing;
world/PMREM/source JSON/body and aggregate multi-pass admission are still separate.

The [retained observation results](./mechanism-shorts-ms2-pbr-observation-results.json)
include actual repeated/reverse/hidden/outside frames, queued captures, corruption
and lifecycle controls, failed runs and current source identities.

## Explicit output3 contract and standalone collector

`@still-shift/scene-contract` exposes `NativeObservedOutputFrameV3Schema`,
`NativeObservedSampleV3Schema` and `NativeObservedFrameVersionsV3Schema`. The
explicit `native3d-observed-output-frame-3` envelope accepts strict frame1/frame2/
frame3 passes with contiguous invocation indices, a bounded output frame and an
execution SHA. The original output1/output2 parsers still reject source3.

The pure `@still-shift/renderer-core` export `createNativeObservationCollectorV3`
provides `begin(maximumPacketBytes)`, `observe(receiptOrPromise, sampleFrame)`,
`finish()`, `abort()` and `dispose()`. Assign invocations synchronously before
awaiting capture hashes. Completion preserves that order and the earliest assigned
failure; abort, restart and disposal invalidate an outstanding completion.
Admission retains the fixed 64-pass/1MiB ceilings and owns metadata before
collection. `finish()` validates receipt structure and returns frozen samples;
the independent expected-source checker remains required. Parsed object fields
are private, while validated matrix arrays retain their existing borrowed ownership
and are frozen. Metadata ownership lasts until the next begin, abort or disposal.

The collector is now wired into composition rendering through conservative
capacity admission and explicit asynchronous runtime hooks described below.
Authenticated transport/export now uses explicit protocol3 below; installed
proof remains pending. [Collector results](./mechanism-shorts-ms2-output3-collector-results.json)
retain mixed completion, byte/pass admission, original protocol rejection and
lifecycle tests, staged failures and existing native2 composition/export checks.

## Conservative standalone output3 capacity

`nativeCompositionObservationCapacityV3(composition, outputFrame, options)` sizes
all discovered source1/source2/source3 passes before collector/GPU admission. It
retains the original 64-pass/1MiB packet ceiling and reserves sizing scratch before
graph evaluation. Source3 counts the bounded common/part/anchor record and then
individual mesh/group/material/vertex/shader/texture-mip receipts. It rejects byte
overflow incrementally without building a complete large pass template. The quoted
finite-number upper bound is a sizing device and never measured evidence.
`nativeCompositionObservationCapacityV2` still rejects source3.

Fresh standalone actual GPU receipts, including hidden/outside-frustum cases,
produce 2,512–10,133B output3 packets inside 28,165B capacity, with zero collector
owners after disposal. These diagnostic envelopes do not prove authenticated
execution identity or composition rendering. [Capacity results](./mechanism-shorts-ms2-output3-capacity-results.json)
retain invalid new fixtures, type failures, the original strict aggregate timeout
and the unchanged default-worker unit/Node/browser continuation. Later composition
integration and compositor-owned world-artwork admission are documented below.
Authenticated transport/export/installed proof and whole world/source/body/replay
budgets remain pending.

## Explicit asynchronous output3 composition collection

For prepared source3, create the WebGL2 preview with
`collectNativeObservations: true` and complete frames using
`renderCompositionFrameAsync(preview, frame)`. The report exposes only
`nativeObservationsV3`, which accepts strict frame1/frame2/frame3 passes for mixed
compositions. Original source1/source2 reports retain their respective fields.
Source3 requires asynchronous frame completion even without collection; synchronous
render, concurrent frame submission and premature pixel reads reject. Conservative
output3 capacity is checked before graph execution, and collected frames bypass
frame caching. Queued GL captures complete their numeric/GPU queries synchronously,
then independent expected-source validation awaits hashes before report completion.
Receipt and pending-control owners release at that boundary; collector storage
releases at next begin, abort or disposal.

Source3 physical captures remain closed to foreign meshes. Compositor-owned world
artwork has a separate admitted Scene and draws afterward onto the same HDR/depth
target without clearing. It receives physical occlusion and stays outside the
physical receipt inventory. Both collected and uncollected source3 rendering use
this artwork path. Actual front/behind controls verify differing depth occlusion
and exact collected/uncollected pixels. The allocator covers the added Scene,
artwork resources, observation copies and collector metadata; complete world,
source/body and replay budgets remain separate unfinished requirements.

[Composition results](./mechanism-shorts-ms2-output3-composition-results.json)
retain six repeated/reverse frames, two artwork controls, five HTTP binary faults,
four async API faults, zero owners after disposal, legacy/native2 regressions,
held inputs and earlier type failures/qualified lost terminal receipts. Diagnostic
output3 envelopes use the actual appearance digest in the execution field; they
are not authenticated export ledgers. Installed consumer proof and remaining MS2 criteria remain pending. No human visual/listening acceptance follows
from these software checks.

## Strict standalone source3 execution and journal replay

`@still-shift/execution-runtime/export` exposes
`NativeObservationExecutionV3Schema`, `NativeObservationSinkV3`,
`admitNativeObservationManifestV3` and `verifyNativeObservationClosureV3`.
Execution3 requires at least one explicit source3, its source3 key, verified source/
geometry/effective-scene/mesh-data identities and matching appearance descriptor
hash. Mixed declarations retain original source1/source2 formats and shape
associations. Extra fields, duplicate variants/shape associations, old source3 key
prefixes and unbound appearance identities reject.

Supply trusted freshly sampled expected passes and an admitted scratch allocator.
Await sink acceptance before authorizing pixels. Source3 checks the declared source
and sampled clock, then independently validates actual GPU receipt matrices,
materials, draws, used bytes/mips and anchors. Original pass1/pass2 checks retain
their protocols. Packet3 writes row3 shards, manifest3 and closure3 through the
existing durable core; replay rechecks identities and receipt evidence. Original
sinks still use their original strict packet schemas. All existing packet/pass/
shard/total limits remain fixed. Checker admission sizes the admitted receipt plus
bounded frame-key/geometry scratch; replay keeps its default16MiB metadata quota.

[Journal results](./mechanism-shorts-ms2-output3-journal-results.json) cover two
repeated real composed one-frame raw journals, successful replay, five forged
receipts rejected before pixel authorization, lifecycle/admission controls,
ordinary Node loader compatibility and original native2 regressions. Admission
scratch peaks863,592B and releases to0; full world/source/body/replay accounting
remains pending. Earlier type/schema/source-key/quota/helper failures are retained.
These are standalone journal artifacts. Normal source3 request/upload/page/worker dispatch now has the separate evidence
below. Actual mixed export proof is documented below; installed proof remains pending. These
standalone journal controls do not themselves prove MP4s or human acceptance.

## Normal authenticated source3 exports

The standard `renderComposition` route now creates explicit trusted execution3
requests for prepared source3. It binds the exact loaded composition/source,
preparation and verified appearance identity, samples fresh expected frame1/frame2/
frame3 passes and admits conservative capacity over the complete output timeline.
Version dispatch keeps prepared source, browser envelope, report, upload, journal
and closure consistent. Page rendering awaits `nativeObservationsV3`; upload owns
all packet representations through authenticated acknowledgement, and the sink
checks independently before authorizing pixels. Durable replay revalidates staged
artifacts before normal output publication. Original APIs retain strict versions1/2.

Run `pnpm test:browser:native3d-pbr-export` serially. Current software proof produces
two normal11-frame MP4s, each with11 actual independently validated source3 passes
and matching final output checksums, plus an unused-source3 export that retains
protocol3 with0 passes. The shared real glTF/PNG fixture prepares fresh verified
binary resources. [Normal export results](./mechanism-shorts-ms2-output3-export-results.json)
retain command/type failures, current scoped local checks and held source inputs.
Actual mixed exposure/export/fault controls are documented below. Installed source3 consumer proof,
whole world/source/body/replay accounting and remaining MS2 full/pack gates remain
pending. Software checks do not establish human appearance/listening acceptance.

## Actual mixed exposure and authenticated endpoint controls

`pnpm test:browser:native3d-pbr-mixed-export` runs the actual source1/source2/source3
fixture serially. Source3 has its own precomposition, preserving the existing
one-native-controller-per-scope rule. The trusted producer assigns fresh fractional
passes; a six-frame output3 export contains54 actual passes across all three frame
protocols. Actual HTTP packet and raw pixel bodies are captured, then their hashes
and complete packet rows are checked through independent durable replay.

Seven actual authenticated first-observation faults downgrade the packet, forge
its frame3 key/sample clock/pass coverage or alter worker/credential/origin. Each
rejection occurs before any pixel request and leaves no published output or manifest.
Producer cancellation and unbound appearance also reject. [Mixed results](./mechanism-shorts-ms2-output3-mixed-results.json)
retain the initial invalid overlapping fixture, current checks and held inputs.
Production source is unchanged from the normal export slice. Installed consumer
proof, complete world/source/body/replay accounting and remaining MS2 criteria
remain pending; no human appearance/listening acceptance follows from these checks.
