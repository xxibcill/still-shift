# Reusable mechanism pack API

MS2 provides **tape-hook, cable-tie and clothespeg candidates**. They have software
evidence for geometry, posed relationships and repeated native cycle exports;
they do not yet count as supported families or accepted production episodes. See the
[MS2 results](./mechanism-shorts-ms2-results.json) for retained failures and
[owning acceptance criteria](./mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring)
for the remaining work.

## Inspect metadata and instantiate

These public Node APIs are exported from `@still-shift/animation-engine`:

```ts
import {
  inspectTapeHookPack,
  createTapeHookPack,
  evaluateTapeHookPackFrame,
} from "@still-shift/animation-engine";

const metadata = inspectTapeHookPack();
const instance = createTapeHookPack({
  parameters: { hookThickness: 0.26, bladeLength: 14, bladeWidth: 2.5 },
  style: { steelRoughness: 0.6, steelMetalness: 0.8 },
});
const expected = evaluateTapeHookPackFrame(
  instance,
  {
    frame: 0,
    width: 320,
    height: 180,
    rigControls: { slider: { type: "slider", value: 0.26 } },
  },
  "inside-push",
);
```

`inspectTapeHookPack()` returns a recursively frozen
`mechanism-pack-metadata-1` receipt with a canonical SHA-256 of its strict
`mechanism-pack-1` document. The receipt is bounded to 32 KiB and contains no
vertex, normal, index, UV or texture pixel arrays. It declares units, default
model bounds and their owning part, hierarchy, pivots, anchor/rig declarations,
material slots, parameter limits, factual variant/detail, neutral/diagnostic
views and rendering compatibility. Default geometry is generated once inside
inspection to derive truthful topology counts and bounds; only metadata is
returned. Inspection is not a claim that no geometry allocation occurred.

The six named targets are `recognition`, `approach`, `macro`, `comparison`,
`orbit` and `return`. Each declares actual part/mesh framing, bounded lens and
view candidates, relationship IDs, motion intent and mesh proof surfaces near
semantic anchors. Metadata includes these descriptions; each instance also binds
its camera descriptions with a canonical SHA-256. The thumbnail declares a
recognition preview recipe at neutral source frame0. Actual candidate PNGs and their
immutable pack/source/recipe/image identities are delivered in the
[thumbnail manifest](../examples/mechanism/pack-thumbnails/manifest.json):
[tape](../examples/mechanism/pack-thumbnails/tape-hook.png) at320×180,
[tie](../examples/mechanism/pack-thumbnails/cable-tie.png) and
[peg](../examples/mechanism/pack-thumbnails/clothespeg.png) at640×360.
The normal package copy includes these under `source/examples/mechanism/pack-thumbnails/`;
final current installed verification remains required. These images are candidate
previews, with no factual, material, human or supported-family approval.

`createTapeHookPack()` returns a frozen `mechanism-pack-instance-1` with a
`mechanism-scene-2` source, its canonical source hash, mesh data hash, current
bounds, parameters and exact pack reference. Pass a previously retained
reference as `expectedPack` to reject a changed revision, variant or detail.
The single declared detail is `teaching`; dimensions are illustrative model
values. The hook-thickness range is 0.04–0.35, blade length 4–20 and blade width
1–3. The tested dimensions are 0.18/10/2 and 0.26/14/2.5. A style change preserves
mesh arrays and their hash while changing the effective material/source identity.

## Rig and composition route

The slider moves `hook` relative to `model` over `[0, hookThickness]`. Its six
rivet meshes remain owned by `blade`. The optional `mount` transform moves the
model and its board/wall/datum reference together. `evaluateTapeHookPackFrame()`
performs fresh expected-state evaluation and rejects wrong travel, rivet
ownership, failed declared relationships or a changed source identity.
`outside-pull` requires the inner hook face to meet the board at position 0;
`inside-push` requires the outer face to meet the wall at position
`hookThickness`. The default `free` mode permits intermediate travel.

These are pure expected-state checks, not actual GPU observations, collision
simulation, continuous-motion acceptance or human visual/listening approval.
The floating-hook explanation follows
[STANLEY's description](https://support.stanleytools.com/hc/en-us/articles/360012677558-Why-does-the-hook-on-my-tape-measure-move).
No manufacturer dimensions are asserted.

Write the instance scene to a native asset file and use the standard composition
`native3d` layer with `format: "mechanism-scene-2"` and `rigControls`. A
composition asset's `sha256` must hash the **actual serialized file bytes**;
the instance's canonical source hash does not substitute for that transport hash.
`inPoint`/`outPoint` delimit visibility. Set `startFrame` explicitly when a later
layer's rig keys should use a local clock starting at zero.

Tape graduations require a real verified font asset. The native asset's
`textureFont` must name that font; the metadata compatibility declaration pins
its SHA-256 and weight. The repository example uses
`assets/story-motion/fonts/plex-sans-semibold.ttf`, weight `600`, SHA-256
`a20caf8286023a6a7a85e40b1d2a4ae9fc3e3b1f9eda8f4c542dd4986af67bb1`.
The browser and normal renderer verify and decode these bytes; no system-font
substitution is used. Installed-package font delivery remains to be verified.

## Cable-tie and clothespeg candidates

The public `inspectCableTiePack`, `createCableTiePack`,
`evaluateCableTiePackFrame`, `inspectClothespegPack`, `createClothespegPack` and
`evaluateClothespegPackFrame` APIs use the same metadata/instance/native2 routes.

| Family     | Parameters (default)                                       | Physical owners                                           | Teaching shape                                        |
| ---------- | ---------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Cable tie  | `pitch` (0.5), `strapWidth` (1), `toothCount` (8)          | Strap moves relative to model; pawl root remains on head  | Closed fixed-root pawl driven by ratchet lift         |
| Clothespeg | `armLength` (6), `armWidth` (0.8), `clothThickness` (0.16) | Two opposing hinges relative to model; cloth shares mount | Closed central spring with ends seated on moving arms |

Both accept `mount`, `style: { color, roughness }` and `expectedPack`. A style
change preserves mesh streams/topology; parameter changes regenerate declared
geometry. Invalid dimensions retain parameter paths. Every declaration remains
illustrative, including spring bias and tooth lift; no force/stiffness simulation
or manufacturer dimension is asserted.

The tie is an exposed head cutaway with a straight toothed tail. Its front head
wall and roof are omitted, rather than arbitrary section-plane support. The
selected outside-serrated plastic-pawl variant follows the
[OS-series product declaration](https://www.hellermanntyton.com/products/cable-ties-outside-serrated/t50sos/118-00062)
and the [manufacturer's integral-pawl explanation](https://www.hellermanntyton.com/competences/cable-ties-and-fixings).
It has no release closure. The native ratchet compiler rejects a `released`
latch key even if that key is after the requested frame, locating the first
invalid interval. Existing generic ratchets default to `teaching-release`.
Engaged reverse motion remains illegal.

An engagement relationship can explicitly declare `requiredAt: "ratchet-seated"`.
Its Frame2 result always retains `measured`, `residual`, `tolerance` and `required`;
advancing/released generic teaching poses retain their gap measurements while
that seated contact is inactive. Omitted policy retains `all-frames`. This
condition does not invent an observed pass flag or enlarge contact tolerance.
The tie also requires its fixed pawl root at every frame.

The peg follows the conventional construction in
[US4063333 Figure 7](https://patentimages.storage.googleapis.com/b8/0c/a4/998ed323d4412d/US4063333.pdf)
and the [central-spring assembly description](https://patents.google.com/patent/FR2676949A1/en).
The improved retention pin/apertures are excluded; the model has no manufactured
hinge pin. Its explanatory rotation axis follows the coil. `upper.hinge` opens
with a negative angle and `lower.hinge` with a positive angle. Their respective
`upper.return`/`lower.return` controls return toward unloaded closing rest, with
`stopValue: 0` for contact on the selected cloth. The contact state is before
unloaded rest, preserving declared closing bias without a load calculation.
Required gap relationships reject a sampled pose through the cloth with frame,
parts and relationship location. Continuous collision/event-order validation is
still part of the remaining milestone work.

Shared spring sampling cancels the common part hierarchy before multiplying seat
coordinates. A translated, rotated or nonuniformly scaled mount therefore does
not perturb the exact neutral mesh buffers. Forward, reverse and random seeks
sample the same local shape/rig state.

All three metadata documents now include `generator.defaultSourceSha256` and
`parameterSchemaSha256`, per-mesh digests, bounded teaching-shape summaries and
relationship declarations. Summaries expose landmark counts and rig/seat links,
never vertex membership or mesh/texture payloads. Unknown references, duplicate
landmarks, changing topology budgets, incomplete/default-mismatched neutral poses
and out-of-range diagnostic poses are rejected. The default scene digest binds
its actual mesh buffers even when counts/bounds remain the same. It is a digest
of the default definition and parameter schema, **not an exhaustive digest of
all generator code branches**; versioned source/archive and full registry/import
closure remain required.

`pnpm test:browser:mechanism-family-packs` instantiates two dimensions per new
family, captures ten actual native preview states per variant, and makes two
independent 24-frame complete-cycle normal exports per variant. Strict observed
packets, exact repeat pixels/movie hashes and independent retained-journal replay
are checked. Replay uses the existing exporter metadata quota; its measured peak
is 11,280,448 bytes and all reservations are released. This is proof-replay
storage, not a whole-world/GPU memory claim.

## Retained software evidence and limits

`pnpm test:browser:mechanism-packs` runs the actual native renderer for both
sizes, including forward/backward repeat seeks, local travel sampling and strict
independent observed-frame checks. Each size has two independent nine-frame
normal final exports, with exact repeat movie hashes and independent retained
journal replay. The fixture's replay uses the existing exporter metadata
partition (128 MiB), records its approximately 31.4 MB peak and asserts every
reservation is released. The standalone verifier retains its 16 MiB default;
that smaller caller quota rejected the candidate and the failed run is retained.

The seventeenth slice adds executed camera recipes for all three candidates and
both tested dimensions. Tape reference props now end at an exposed contact edge;
the original scene1 generator is unchanged. Tie nylon is darker for contrast.
Clothespeg front and rear comparison views show the two spring seat exits. The
contact landmarks still measure the seated ends; visibility probes bind to
actual posed mesh triangles, rather than using buried wire centroids as visible
surface evidence. Current software/native receipts and retained failures are in
[the MS2 results](./mechanism-shorts-ms2-results.json).

Current scoped glTF/GLB/PBR, labels/cues/cache, count-fit and classified ten-question
board evidence is recorded in the [finite acceptance matrix](./mechanism-shorts-ms2-acceptance.md).
Whole resource accounting, final full/archive/installed and pack disposition remain
open. Finer Thai motion stays unadopted. Supported-family/pilot counts stay zero;
human factual, visual and listening acceptance remains separate.

## Execute camera recipes

The public Node APIs `createMechanismCameraRecipeFrame()` and
`compileMechanismCameraRecipeClip()` accept an existing pack instance. They
validate source/camera identity, fresh posed bounds, declared required
relationships, safe insets and reserved pixel rectangles. Directions are tried
in declaration order. An explicit authored camera is preserved and checked; an
invalid override returns a located error. A clip chooses one direction for all
its samples, preventing per-frame fallback jumps.

```ts
import {
  createCableTiePack,
  compileMechanismCameraRecipeClip,
} from "@still-shift/animation-engine";

const instance = createCableTiePack();
const clip = compileMechanismCameraRecipeClip(instance, {
  target: "macro",
  width: 640,
  height: 360,
  sourceFrames: [0, 1, 2, 3],
  editing: "hold",
  reservedRegions: [
    { id: "caption", rect: { left: 12, top: 282, right: 628, bottom: 348 } },
  ],
});
// Use clip.camera and clip.cameraKeys on a native3d composition controller.
```

Cut, hold and transition are explicit editing decisions independent of camera
intent. A transition requires `fromCamera`; a controlled orbit can supply
`orbitDegrees: [-8, 8]`. Every clip returns `endCamera`. Supplying it as the next
hold's `fromCamera` preserves that camera and rejects a target that no longer fits;
use an explicit cut or transition to change it. A cut ignores a preceding camera's
up direction; each new track still has one constant up direction. A standalone clip without a
preceding camera does not certify its join. Authored cameras and generated orbits
cannot be combined silently. Motion uses elapsed source frames, so unevenly spaced
samples retain their timing. Camera tracks retain one up direction and common
near/far planes, matching what native camera keys actually serialize. Changing
up during a track fails instead of silently losing that property.

A hold fits the union of the supplied posed envelope bounds. The available
region is the largest empty rectangle after safe insets and reservations,
with fixed area/center/top/left tie-breaking and padding. Failure includes the
camera target, frame, failed surface/mesh or region IDs. Physical closed pack
meshes participate in camera-inside and actual near-plane segment checks; masked
fragments below cutoff do not. There is no history, hysteresis or cached camera
choice, so random seeks produce the same result.

Proof bindings contain a triangle index and barycentric coordinates on each
freshly posed physical mesh. They may change triangle as a spring bends; the
semantic surface ID remains fixed. Expected-state projection and front-side
physical rays must pass at every supplied sample. The API checks up to 64 source
samples, eight rectangles and eight proof surfaces, with an 8 MiB world-position
storage limit and 32 KiB clip receipt. It does not certify unsupplied times or
arbitrary imported/open meshes. Supply the actual output source frames for
short clips; longer clips require bounded sampling and additional frame QA.

`pnpm test:browser:mechanism-cameras` executes six four-frame shots for each
family at both sizes, plus repeat seeks and two complete 24-frame exports per
variant. Browser proof rays independently use Float32 positions, observed part
matrices and the observed Three camera. Strict native2 validation binds those
streams to the buffers actually submitted to the GPU before the proof results
are accepted. These fixture proofs cover the opaque candidate materials; they
are separate from generic import/material admission and human acceptance.

## Rigid glTF import foundation

`importRigidGltf`, `decodeRigidGltf` and `inspectRigidGltf` preserve named rigid
hierarchy, transform bases, baked mesh attributes, encoded PBR image bytes and
texture color-space roles in `rigid-gltf-asset-1`. The native image/material/tangent
consumer now has source3 standalone/composition observation, normal/mixed export
and scoped installed proof; aggregate admission and final milestone support remain
open. See the [import API and bounded profile](./rigid-gltf-import.md)
for dependency roots, supported encodings, identities, limits and located errors.
