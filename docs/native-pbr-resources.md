# Native PBR resource preparation

MS2 provides a bounded resource component for imported rigid glTF geometry. It
uses `solid-geometry-2` and `native-pbr-material-1`, with separate encoded-source
and decoded-pixel identities. Existing native source1/source2 parsers remain
strict. Explicit rigid source3 preparation and shared-world execution now consume
this component. Composition binary admission, shared graph preview/export and
mip-data proof remain pending.

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

Tiled base-level RGBA8 readback matches every texel against private prepared
pixels. A separate float shader checks every actual base-level transfer sample;
its new profile tolerance is **0.0001**. Existing native tolerances are unchanged.
The component requires WebGL2 and float color-buffer support. It restores GL
state and disposes its verification resources after success or failure.

Run `pnpm test:browser:native3d-pbr-resources` locally. The pinned Three/Chromium
fixture retains three identical baseline/repeat/restored frames and rejects
actual tangent-buffer, texture-byte, color-space and material-factor faults.
[MS2 results](./mechanism-shorts-ms2-results.json) retain all staged inputs,
expected reds, compiler/lint failures and the failed valid-stride browser run;
that run's unavailable terminal receipt is not reconstructed.

The caller owns draw-to-mesh/material association. This receipt certifies the
supplied draw and complete mip0 storage/transfer. It does not certify mip pixel
values, whole-frame camera/world graphics, composition observations, complete
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

Independent source3 GPU/world/anchor/PBR/mip observations remain pending.
`collectNativeObservations: true` and source3 export-request creation reject the
unfinished protocol. Authenticated repeated exports, installed proof, whole-world
accounting and bounded source JSON admission remain required. The importer
criterion stays unchecked. [Staged results](./mechanism-shorts-ms2-pbr-composition-results.json)
retain every failed run, lost terminal receipt and strict aggregate timeout.
