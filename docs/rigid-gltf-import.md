# Rigid glTF import intermediate representation

MS2 exports `importRigidGltf`, `decodeRigidGltf` and `inspectRigidGltf` from
`@still-shift/animation-engine`. They produce a frozen `rigid-gltf-asset-1`
intermediate representation with named parts, baked geometry, original transform
bases, PBR texture roles, encoded images and exact dependency identities.

The IR is **not yet a renderable native composition source**. The new
`prepareRigidGltfPbr` stage decodes and hashes PNG/JPEG pixels and prepares explicit
`solid-geometry-2` material/tangent resources. Standalone rigid `mechanism-scene-3`
preparation now verifies separate RGBA files and drives imported parts through
existing rigs in the shared native Three world, with actual GPU resource and
camera/pose proof. Composition admission, worker/HTTP binary handoff, mip-data
proof and imported-model preview/export remain MS2 work; the owning acceptance
criterion stays unchecked. See [PBR resource preparation](./native-pbr-resources.md).

```ts
import {
  importRigidGltf,
  inspectRigidGltf,
} from "@still-shift/animation-engine";

const asset = await importRigidGltf("./assets/machine.glb", {
  dependencyRoot: "./assets",
  scene: 0,
});
const metadata = inspectRigidGltf(asset);
```

`decodeRigidGltf(bytes, { format, scene, dependencies })` provides the same result
without filesystem access. `format` is `gltf` or `glb`; `dependencies` maps each
exact external URI in the document to its bytes. Unreferenced map entries are
rejected. The file API resolves relative URIs against the source directory and
checks canonical paths against `dependencyRoot`, which defaults to that directory.
It rejects remote/absolute URIs, queries/fragments, backslashes, missing files and
symlinks escaping the root. Parent directories are permitted only within an
explicitly larger root. Regular-file sizes are checked before bounded reads;
changes observed during a read fail. No network fetch occurs.

## Geometry and hierarchy

A selected scene defaults to the authored `scene`, then index 0. Every node needs
a unique nonblank name. Missing references, duplicate parents, cycles and invalid
scene roots fail, including in omitted nodes. The receipt reports omitted node
indices; it does not merge separate scenes. Separate node instances of a shared
mesh become separate bounded meshes with their own transforms.

The synthetic `model` part owns the selected roots. `node.N` retains each source
node's parent and original world origin. Its native frame uses world-aligned axes,
unit scale and zero rotation/pivot; its translation is the difference between its
world origin and its parent's world origin. Mesh positions are transformed by the
complete source world affine matrix and translated about that retained origin.
Normals use inverse transpose; tangents use the linear transform, normalization
and reflected handedness. Reflections reverse triangle winding. Inherited shear
is baked into positions; projective or locally sheared matrices are rejected.
Local matrices must decompose to TRS within a relative `1e-8` tolerance;
quaternion length tolerance is `1e-5`, followed by normalization. Transforms with absolute determinant below `1e-12`, and matrices/origins outside
the finite coordinate budget, fail.

The full asset retains both original local and world matrices. A subsequent rig
must map its source axes into these baked part frames; source local axes are not
implicitly retained as native part axes. The hierarchy and pivot origins survive;
embedded glTF animations are rejected rather than converted to rig behavior.

Only triangle primitives with supplied float positions and unit normals are
admitted. Position bounds must match actual decoded float samples. UVs may be
float or normalized unsigned byte/short values, with valid vertex alignment and
stride. Indices may be unsigned byte/short/int; absent indices imply consecutive
triangles. Indices, bounds, finite samples, tangent orthogonality/handedness and
nondegenerate triangles are checked. Normal maps require supplied tangents and
UVs. Tangents are not generated. Unsupported vertex attributes, sparse accessors,
morph targets, skins, animations, cameras and every declared extension are rejected,
including compression extensions. Buffer views cannot mix vertex, index and image
payload roles. Application `extras` do not become renderer behavior.

## PBR and encoded images

The bounded profile preserves opaque core metallic/roughness factors as linear
floating-point values. Base-color textures carry `srgb`; packed roughness in G,
metalness in B and normal textures carry `linear`. The normal scale and sampler
filter/wrap modes are retained. The absent-material default remains a separate
slot. Mask/blend, emissive/occlusion textures and nonzero emission are rejected.
These conventions follow the
[Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

PNG/JPEG headers are supported; PNG headers must declare eight-bit channels.
Images may use local/data URIs or separate buffer views. Declared MIME and data
URI MIME must match the header. Encoded image bytes are retained unchanged as
base64 and SHA-256. A header match does not establish a valid compressed payload,
pixel color conversion or native texture compatibility. `prepareRigidGltfPbr`
now performs bounded pixel preparation; complete native composition admission
remains pending. It requires pinned FFmpeg8.0.1, checks encoded header dimensions
and MIME again, validates supported PNG structure/CRC, ignores image metadata
and returns straight top-left RGBA8 plus source/pixel hashes. Compressed payload
failures and cancellation settle after the decoder closes its pipes.

## Budgets, identities and inspection

| Resource                                                              |                       Limit |
| --------------------------------------------------------------------- | --------------------------: |
| Source / JSON                                                         |              32 MiB / 4 MiB |
| External and embedded URI dependencies, summed by ledger identity     |                      32 MiB |
| Per encoded image / aggregate encoded image payload                   |              8 MiB / 16 MiB |
| Image dimensions / aggregate declared pixels                          | 1–4096 per axis / 8,388,608 |
| Nodes / baked mesh instances / material slots including default       |               64 / 128 / 32 |
| Aggregate vertices / triangles                                        |           100,000 / 200,000 |
| Counted source and baked Number attribute payloads, before allocation |                      16 MiB |
| Metadata receipt                                                      |                      32 KiB |

These are importer budgets; they do not replace whole native-world/GPU/PMREM or
execution-worker admission. `RIGID_GLTF_LIMITS` also bounds buffers, views,
accessors and images. Structural JSON traversal is bounded to 64 levels.

`sourceSha256` hashes exact source bytes. Each URI dependency and image carries
an exact byte hash. `geometrySha256` binds the baked parts and meshes; each mesh
also has `dataSha256`. `assetSha256` binds the complete representation, including
PBR roles and dependency identities. Filesystem locations do not enter the
identity, so identical relocated source/dependencies reproduce it.

`inspectRigidGltf(asset)` returns frozen `rigid-gltf-metadata-1`: hierarchy,
names/origins, topology counts, bounds, materials/texture roles, image headers and
hashes, source/asset identities and import policy. It excludes vertex/normal/UV/
tangent/index arrays and encoded image payloads. An oversized receipt fails with
a located budget error; the complete asset returned by import remains available.
`RigidGltfImportError.location` contains a stable `gltf-import-*` code and a path
beginning with `gltf`.

Verification and retained failed stages are recorded in
[MS2 results](./mechanism-shorts-ms2-results.json). Native PBR import, whole MS2
acceptance, installed-package verification and human visual/listening acceptance
remain separate pending requirements.
