# MS1N native composition design freeze

2026-10-10. This document freezes the MS1N interfaces, admission rules and comparison policy. Implementation begins after the MS1 PR opens. It does not claim implementation, verification or human acceptance. The MS1 bridge, source assets and unrelated composition behavior remain unchanged; retained assets/evidence stay outside Git.

## Source identity and admitted rendering

Unedited native E01 references the exact MS1 scene bytes, geometry/hash, rig/control source, physical ids, fonts, audio and dependency hashes. A route change never regenerates geometry or rewrites source bytes. Saved bounded overrides obtain a separate validated effective identity while preserving the original pinned scene, geometry and rig evidence.

The first subset supports bounded indexed meshes with normals/material groups, rigid right-handed Y-up hierarchy, the existing opaque/mask MeshStandardMaterial and environment/light/shadow/profile fields, actual native text/shape/solid world planes, and ordinary screen annotations. Physical source/part override and world binding TRS reuse the existing positive finite scale contract; singular transforms fail. Ordinary local 2D artwork flips remain legal when nonsingular and their real winding/normal and authored front/double side are honored. Native controllers require effective identity placement. No global change narrows ordinary unbound, screen-annotation or outer-precomp transforms.

Limits remain 128 parts, 100000 vertices, 200000 triangles, 64 anchors, 32 materials, two shadow lights and 2048 shadow maps. A native pass admits at most 64 world-graphic leaves, 8192 pixels per axis and 8,388,608 pixels total; existing stricter surface and managed memory limits still apply. The initial export has one worker within the 8GiB application admission policy. Estimated owned allocation and measured process-tree RSS are separate evidence.

One native world may be active per instance-qualified scope/sample. Nine disjoint controllers may share a catalogue. Precomps have isolated depth; depth does not cross their boundary. Native depth does not mix with ordinary composition threeD stacks. Canvas, translucent/transmissive materials, arbitrary texture alpha, sorted transparent world planes, source topology/parent/id rebinding, unsupported material fields and incompatible coupled exposure clocks fail at located fields before output/cache mutation. A transparent root is supported; its transparency does not admit translucent world surfaces.

## Public contracts and effective-source lookup

`scene-contract/src/native3d/{geometry,scene,frame,index}.ts` exports:

- `SolidGeometrySchema` / `SolidGeometry`: shared bounded mesh/material catalogue checks, without tape dimensions or the hookThickness/hookTravel invariant.
- `SolidSceneSchema` / `SolidScene`, `Native3DSourceSchema` / `Native3DSource` (`MechanismScene | SolidScene`): shared hierarchy/references/units/anchors/camera/profile/lights; solid sources need no fake tape rig.
- `SolidFrameResultSchema` / `SolidFrameResult`, `NativeSceneFrame` (`MechanismFrameResult | SolidFrameResult`): the solid frame is `solid-evaluator-1` with frame/seed/camera/parts/anchors. Reuse bounded existing frame types; do not fabricate rig/assertion records.
- `Native3DSourceKeySchema` / `Native3DSourceKey`, `NativeScreenAnchorSchema` / `NativeScreenAnchor`, `NativeFrameSnapshotSchema` / `NativeFrameSnapshot`.

`scene-contract/src/composition/native3d.ts` exports `CompositionNative3DAssetSchema` / type, `CompositionPreparedNative3DSchema` / type, `Native3DSourceOverridesSchema` / type, `NativeWorldGraphicBindingSchema` / type, `NativeScreenBindingSchema` / type and `Native3DBindingSchema` / type. The native asset is `{id,type:"native3d",path,sha256,format:"mechanism-scene-1"|"solid-scene-1",textureFont?:fontAssetId}`. Tape graduations require the pinned font. The transport is data only:

```ts
type CompositionPreparedNative3D = {
  version: "composition-prepared-native3d-1";
  assets: Record<string, { sourceSha256: string; source: Native3DSource }>;
};
```

The authored asset owns its path/font reference; transport has no IO paths, Three objects or GPU handles. IO/resource preparation verifies actual raw source bytes and their hash/transport association before construction. Parsed JSON cannot establish its original raw-byte checksum by reserialization.

`composition/layers.ts` exports `Native3DLayerSchema` / `Native3DLayer` using its existing layerBase and adds the controller to both explicit layer unions. It is not a SIZED_LAYER_TYPE. Fields are `asset`, `sourceStartFrame`, `sourceFps`, optional controls/camera/cameraKeys/hiddenParts/seed and bounded static part/material overrides, plus admitted ordinary interval/time controls. `Native3DSourceOverrides` contains only partOverrides and materialOverrides; the controller reuses those schemas. Override ids must exist; transforms/visibility and admitted material style may change, while topology, parents, ids, mesh arrays, rig definitions, texture kind/seed and arbitrary textures cannot. Add `native3D?: Native3DBinding` and `overlayAfter?: string` to supported artwork/annotation layers.

The pure renderer-core API is:

```ts
// Native3DSourceKeySchema validates this exact versioned form:
// native3d-source-1:<64 lower hex original raw SHA>:<64 lower hex effective SHA>
type Native3DSourceKey = string;
type Native3DPreparationOptions = {
  readonly variants?: readonly Native3DSourceOverrides[];
};
type PreparedNative3DVariant = {
  readonly version: "prepared-native3d-variant-1";
  readonly sourceKey: Native3DSourceKey;
  readonly sourceSha256: string;
  readonly originalGeometrySha256: string;
  readonly effectiveSceneSha256: string;
  readonly geometrySha256: string;
  readonly meshDataSha256: string;
  readonly source: DeepReadonly<Native3DSource>; // effective source
  readonly evaluation: PreparedMechanismScene | PreparedSolidScene;
};
type PreparedNative3DScene = {
  readonly version: "prepared-native3d-scene-1";
  readonly sourceSha256: string;
  readonly source: DeepReadonly<Native3DSource>; // original source
  readonly baseSourceKey: Native3DSourceKey;
  readonly variants: Readonly<Record<Native3DSourceKey, PreparedNative3DVariant>>;
  readonly variantKeysByOverrides: Readonly<Record<string, Native3DSourceKey>>;
};
type Native3DVariantReference = Pick<NativeFrameSnapshot,
  "asset" | "sourceKey" | "sourceSha256" | "effectiveSceneSha256" |
  "geometrySha256" | "controller" | "scope">;

prepareNative3DScene(
  source: Native3DSource, sourceSha256: string,
  options?: Native3DPreparationOptions,
): Promise<PreparedNative3DScene>;
resolveNative3DVariant(
  preparedByAsset: Readonly<Record<string, PreparedNative3DScene>>,
  reference: Native3DVariantReference,
): PreparedNative3DVariant;
```

Prepare all current root/precomp controllers' static variants before text discovery, lint/evaluation or rendering. Always include the empty base; normalize empty/missing maps, validate derived sources, update effective geometry hashes, and deduplicate equal effective data keys. `variantKeysByOverrides` maps canonical normalized override JSON to sourceKey. Sorted immutable output does not depend on controller request order. The existing asynchronous resource preparation stage awaits WebCrypto SHA once; sample/lookup/draw stay synchronous. Do not create variants lazily or implement a new synchronous SHA solely for preparation.

`NATIVE3D_VARIANT_LIMIT = 64` is exported from the composition native contract and bounds the sum of per-asset distinct variants including each asset base across the complete composition. Duplicate requests within one asset consume no additional entry. Per-asset preparation and global aggregation enforce the cap before publication/GPU allocation; overflow locates the introducing controller/asset. GPU appearance allocation additionally obeys managed memory limits and need not eagerly instantiate every prepared world.

For original `sourceSha256 = sha256:<raw>` and canonical `effectiveSceneSha256 = sha256:<effective>`, sourceKey is exactly `native3d-source-1:<raw>:<effective>`. Effective SHA hashes UTF-8 `canonicalMechanismJson(validatedEffectiveSource)` including its effective geometrySha256; source geometry is independently checked against its declared canonical hash first. JS lexical key ordering remains deterministic. sourceKey excludes paths, asset/controller/shot names, time/viewport/labels/route provenance/code/font/profile.

Part-only edits change effective-scene SHA but keep geometry SHA. Material-style edits change effective geometry SHA because the catalogue contains materials, then change effective-scene SHA. Original raw/geometry/rig identities remain untouched. `meshDataSha256` hashes UTF-8 canonical `{meshes: validatedOriginalSource.geometry.meshes}`, including ids, group/material references, positions/normals/UVs/indices/bounds but excluding material styles, part transforms and tape dimensions. All admitted variants retain unchanged mesh arrays and share buffers by this actual mesh-data identity. Avoid repeated full-array cloning: factor internal already-validated preparation or reintern immutable mesh objects after complete derived validation; preserve legacy prepareMechanismScene behavior.

`resolveNative3DVariant(resources.native3D, op.frame)` performs own-property lookup by asset then sourceKey and checks original source/effective-scene/effective geometry hashes. B separately requires op.sourceKey equal frame.sourceKey. No scan, base fallback, mutation or per-sample geometry hashing occurs. Absent runtime preparation is `comp-native3d-not-ready`, missing/wrong asset/variant is `comp-native3d-source`, and stale identity is `comp-native3d-checksum`, located at the caller's controller/asset/operation. Tables are deeply frozen records, not frozen mutable Maps. A saved static edit requires a new prepared revision; an unprepared variant fails closed.

## Scope, clock and dynamic screen bindings

```ts
type NativeScopeSample = {
  scope: string; scopeFrame: number; owningScopeFps: number;
  layerTime: number;
  width: number; height: number;
};
type NativeScreenAnchor = Omit<MechanismProjectedAnchor, "visibility"> & {
  visibility: "visible" | "occluded" | "outside-frame" |
    "behind-camera" | "clipped" | "hidden-part";
  visibilityMethod: "native-physical-mesh-segment";
  occluderMesh?: string;
};
type NativeFrameSnapshot = {
  version: "native3d-frame-1";
  controller: string; scope: string;
  asset: string; sourceKey: Native3DSourceKey;
  scopeFrame: number; sourceFrame: number;
  viewport: { width: number; height: number };
  sourceSha256: string; effectiveSceneSha256: string;
  geometrySha256: string; frameKey: string;
  frame: MechanismFrameResult | SolidFrameResult;
  anchors: Readonly<Record<string, NativeScreenAnchor>>;
};
type NativeScreenBinding = {
  role: "screen-anchor"; sceneLayer: string; anchor: string;
  visibilityPolicy: "hide-occluded" | "offscreen-indicator";
  visibleWhen?: "shown" | "indicator"; // default shown
  insetPixels?: number; // default 12
  offsetPixels?: [number, number];
  target: { kind: "visibility" } | { kind: "position" } |
    { kind: "path-endpoint"; contentId: string; endpoint: "last" };
};
type NativeScreenBindingResult = {
  pixel: [number, number] | null;
  shown: boolean; indicator: boolean;
  visibility: NativeScreenAnchor["visibility"];
};
sampleNativeFrame(
  prepared: PreparedNative3DScene, controller: Native3DLayer,
  sample: NativeScopeSample,
): NativeFrameSnapshot;
resolveNativeScreenAnchor(
  snapshot: NativeFrameSnapshot, binding: NativeScreenBinding,
): NativeScreenBindingResult;
```

`NativeScreenBindingResult.shown` is true when the physical state is visible, or when it is outside-frame and visibilityPolicy is offscreen-indicator. `indicator` is true only for that outside-frame/offscreen-indicator case. Thus visibleWhen:shown admits the normal label/leader in both cases, while visibleWhen:indicator restricts the triangle to the offscreen case. hide-occluded never sets shown for outside-frame; hidden-part, behind-camera, clipped and occluded set both booleans false.

The evaluator memoizes one canonical fractional snapshot per controller/effective identity/scope sample. NativeDepthOp and every binding retain that same snapshot object/frameKey; annotations never recompute physical source time from their own startFrame or last rendered frame. It drives current physical camera/parts, pure expected anchors, world placement/depth and bound screen annotations. Scope ids distinguish precomp instances. Source time is `sourceStartFrame + layerTime * sourceFps / owningScopeFps`; existing resolved layerTime already accounts for startFrame. Do not subtract twice or round to capture ordinals. Owning root/precomp dimensions feed evaluator projection/camera aspect and are bound into frameKey; op dimensions must match snapshot viewport. Camera/camera keys, controls, hiddenParts and seed remain per-frame inputs, not source variants. Controller seed changes frame metadata; wood remains driven by `definition.texture.seed ?? 42`, never a rewritten material texture seed.

E01 controllers use cuts `[0,78,163,247,336,418,472,526,603,696]`, half-open inPoint/outPoint, startFrame and sourceStartFrame equal shot start, sourceFps 30. At 78 the second controller maps local 0 to source 78; at 77.75 the first maps to 77.75; 696 is outside. One-active-world admission, cut-aware exposure, complete state application and resource sharing permit nine controllers without nine duplicate full worlds. Generic gaps render no native world; E01 partition rules forbid gaps. Overlap fails even when controller opacity would be zero.

`overlayAfter=controllerID` is an explicit ordering dependency in the same owning scope: source dependencies first, controller evaluation/render before its bound screen annotation subtree. It is not ordinary parenting or cross-scope linkage. The binding's sceneLayer must name that controller. Dependency/cycle/solo scheduling retains the world for a soloed annotation; inactive/disabled controllers hide their annotations. Reading intervals must lie within the controlling interval. No physical id is encoded as a dotted property path.

For native bound shapes, settle ordinary parent/constraint matrices, obtain the final artwork-to-screen matrix, then apply position/endpoint bindings before shape compilation/bounds/cache identity. Group visibility binding occurs before descendant visibility propagation. A leader is one top-level open two-vertex straight path with no handles, nested content transform, geometry modifier or competing path writer: its authored first point remains fixed in label-group local space; the last point is the current anchor pixel transformed through the inverse settled screenMatrix. Label-group movement moves the first point but preserves the physical screen endpoint. For hide-occluded, show labels/leaders only when the anchor is visible. For offscreen-indicator, also show them outside-frame with the endpoint clamped to inset, and show the real triangle indicator only for visibleWhen:indicator. Behind-camera, clipped, hidden-part and occluded hide both policies; legitimate null projection hides without constructing fake points. Unknown anchors, nonfinite projection, singular screen matrices, invalid endpoint paths, competing writers/derived-path reads and cycles fail at the actual binding field. No graph-only endpoint mutation or stale sidecar hold table is allowed. For position/path-endpoint, add offsetPixels (default[0,0]) in owning-scope output pixels first, then clamp that candidate to the inset rectangle only when the unoffset physical anchor is outside-frame under offscreen-indicator. Visible anchors use the offset candidate without clamping. Visibility targets ignore offset, and offsets never change semantic shown/indicator classification; hidden/behind/clipped/occluded still hide. The physical leader attachment proof uses default zero offset.

The new controller inherits layerBase but admits only effective local/world/screen identity within 1e-12, no ordinary threeD/spatial ancestor, opacity 1, normal blend, no masks/mattes/effects/primitive or focus blur/receivesLight. Identity organizing groups may gate visibility but cannot introduce style/clip/placement. An ordinary camera that changes controller placement fails at that camera field. Interval/time controls remain legal. A finished isolated precomp may have normal outer transforms/effects, applying to its world and labels together; controller opacity/effects after the pass are not admitted.

Pure physical-anchor visibility uses all visible physical catalogue meshes including floor/datum/rivets/anchor-owning parts, excluding world graphics and screen overlays. Projection reasons are resolved first. Test the world camera-to-anchor segment; a surviving hit before `distance - 0.0001` occludes, using scene units after world transforms. Honor inherited visibility, triangle-group material side and uniform mask opacity/cutoff; admitted procedural alpha is opaque. Filter candidate hits by camera-axis near/far depth, not off-axis ray distance. Three Raycaster does not observe shader texture alpha. The original bridge query remains unchanged; native mask/near-plane policy is a declared delta. Expected triangle visibility and actual Three observation remain separate from depth-buffer measurement.

## Local artwork mapping and render graph

L is native untransformed local pixels (right/down), A is L after the settled ordinary local 2D transform, and P is a right-handed world plane (right/up/Z0). Bind P through partWorld times binding TRS; no viewport-to-world stretch or screen homography participates.

```ts
type NativeWorldGraphicBinding = {
  role: "world-graphic";
  sceneLayer: string;
  part?: string;
  transform: MechanismTransform;
  pixelsPerUnit: number;
  originPixels?: [number, number]; // A, default [0,0]
  side?: "front" | "double"; // default double
  alphaMode: "opaque" | "mask";
  alphaCutoff?: number; // default 0.5
};
type NativeWorldGraphicArtwork = {
  layer: string;
  surface: SurfaceNode;
  localBounds: Bounds;
  rasterOriginPixels: [number, number]; // integer L edge coordinate
  artworkMatrix: Matrix; // L to A, applied once
  originPixels: [number, number];
  pixelsPerUnit: number;
  worldMatrix: Matrix4; // P to source world only
  side: "front" | "double";
  opacity: number;
  alphaMode: "opaque" | "mask";
  alphaCutoff: number;
};
type NativeDepthOp = {
  kind: "native-depth";
  layer: string;
  sourceKey: Native3DSourceKey;
  frame: NativeFrameSnapshot;
  width: number;
  height: number;
  graphics: NativeWorldGraphicArtwork[];
};
```

World-bound leaves initially admit solid/shape/text, normal blend, no ordinary parent or attach/aim constraints, no ordinary threeD/lighting/focus/matte/effects; physical parenting is the explicit part. Intrinsic text/shape paint and declared local hard masks remain native artwork. Bindings/transforms are validated before allocation. Do not cull a world plane using ordinary state.bounds; project its transformed corners and camera near/far clipping.

For edge coordinate q within the cropped surface:

```ts
p = rasterOriginPixels + q;
[aX, aY] = applyMatrix(artworkMatrix, p);
plane = [
  (aX - originPixels[0]) / pixelsPerUnit,
  -(aY - originPixels[1]) / pixelsPerUnit,
  0,
];
world = applyMatrix4(worldMatrix, plane);
uv = [qx / surface.width, qy / surface.height]; // row 0 at top
```

originPixels is authored A-space data; rasterOriginPixels is derived storage and never replaces it. Crop changes never move the artwork. Define plane front as +Z; account once for the y flip and any negative local artwork determinant, preserving real winding and authored side. Binding/source TRS remain positive. A centered 200×80 solid at 100px/unit remains 2×0.8 world units; a negative local glyph coordinate remains negative after a crop.

Factor the existing local SurfaceNode builder in `render/graph.ts` and the floor/ceil allocation in `projective-placement.ts`. Draw real prepared shapes/text at local coordinates inside one outer translation by minus rasterOriginPixels, opacity 1 and transparent background. Internal shape matrices, glyph poses, corrections and local masks remain inside. Do not apply state.screenMatrix, ordinary camera/homography, binding transform or layer opacity inside that raster. Text crop uses actual contentBounds/current-prior union including all positively drawn copies/corrections, never a viewport fallback. Reuse b4 displayed-copy sampling, pinned fonts, raw text time and stateFrom/stateMix; keep CE12 reading policy and its semantic/readability limits.

Each local text/shape animation keeps its own resolved layer clock at the same scope exposure sample; physical placement uses the controller snapshot. A coupled native pass rejects independently shifted exposure sampling. Existing explicitly declared center-sample screen-overlay behavior remains separate. Measure fonts after native lookup readiness: `render/text-frames.ts` and `render/text.ts` discovery receive native EvaluationOptions, rather than hiding controller dependencies to prepare text.

Opaque graphics initially require an unmodified fully opaque solid rectangle, opacity 1 and no transparent crop guard. Text/silhouettes/soft artwork alpha use mask mode: apply layer opacity once to sampled alpha, discard below cutoff, make surviving fragments alpha 1/depth-writing; MSAA supplies geometric coverage. This is a hard-cutout limitation, not transparent blending. Native graphics are unlit world surfaces sharing source fog/exposure/ACES; screen overlays keep ordinary authored sRGB behavior.

`RenderBackend.renderNativeDepth(op,target,renderArtwork:(SurfaceNode)=>S):void` is implemented by WebGL2. `render/backend.ts` owns executeGraph: it allocates a cleared temporary, invokes the joint pass, composites the resolved surface over existing destination content, then releases it. Every renderArtwork surface remains executor-owned and is released in finally after success/failure; B borrows/copies it into owned, memory-accounted textures and never releases it itself. Full geometry is looked up from the prepared table, never copied into every op. A single native boundary consumes each world graphic once; screen subtrees follow their controller boundary. Legacy spatialStackOrder remains unchanged. Disable unsafe native root/prefix/damage reuse until source/frame/artwork/code/profile dependencies are represented.

## Shared Three, HDR depth and transfer

Pinned Three is 0.186.0, verified from manifests and resolved bytes. The shared synchronous `createNativeThreeWorld(renderer,preparedSource,{textureFont})` consumes a validated source and already loaded `{family,weight}` binding plus pinned identity. The bridge wrapper keeps verified asynchronous font loading; the factory performs no fetch/FontFace ownership or forceContextLoss. Share existing PBR materials, PMREM/RoomEnvironment blur 0.04, environment intensity, fog, hemisphere colors, lights/shadow camera/bias/radius, procedural texture dimensions/seeds/bump, matrix/visibility and cast/receive policy. The floor does not cast shadows but remains physical geometry/anchor occlusion. Factor-only bridge captures retain exact hashes.

Freeze profile `native-three-aces-hdr-msaa4-1`: RGBA16F linear HDR color plus DEPTH_COMPONENT24, actual four-sample support, opaque/hard-mask physical meshes and real graphic planes sharing one owned depth attachment. Check actual formats/sample counts/resolve support before allocation/publication; no unrecorded fallback. Clear HDR to zero RGBA and suppress the flat source background only during this pass without rewriting source data.

In Three 0.186.0 ordinary offscreen output selects the linear working color space and NoToneMapping, regardless of renderer.toneMapping or an ordinary target's sRGB annotation; only default/XR targets adopt renderer output transfer. The pinned opaque shader forces surviving normal-blend, nontransparent, non-alphaToCoverage fragments to alpha 1 after alpha test. Thus MSAA stores coverage-premultiplied linear radiance and alpha. Do not enable alphaToCoverage under that opaque-survivor assumption.

Graph surfaces are premultiplied encoded sRGB RGBA8 with texture row 0 at top, not SRGB8_ALPHA8. Input artwork transfer recovers straight encoded RGB from alpha before sRGB-to-linear; automatic decoding of already premultiplied RGB is insufficient. Apply input conversion once, preserve cutoff/opacity, and verify UV/Y orientation. Reuse bounded public GPU transfer and local raster caches; no SVG approximation, PNG plates, per-frame CPU readback or full-canvas artwork scaling.

After MSAA resolve, one explicit shader recovers straight linear radiance from coverage, applies pinned ACES/exposure then sRGB, and premultiplies encoded RGB by coverage. RGB is zero when alpha is zero. Disable depth/write and blending for this replacement resolve. For an opaque profile, composite authored encoded background into remaining coverage and output alpha 1; transparent profile retains coverage. The standard OutputPass lacks required unpremultiply/repremultiply handling and cannot be used blindly. Test over both black and white. World graphic toneMapped:false does not exempt it from the common final transfer.

Use public Three/WebGL APIs only: resetState before interop; use device-owned source FBO and public FramebufferTexture/copyFramebufferToTexture or another proven public bounded transfer; bind the final Three target with setRenderTarget, obtain its current DRAW_FRAMEBUFFER_BINDING through WebGL, and GPU-blit color to the device surface with proven row orientation. No private renderer.properties handles or untyped target setter casts. In finally restore compositor FBO/VAO/viewport, depth/stencil/cull/scissor/blend/color mask, pixel-store and texture assumptions; dispose only owned resources and retain the shared context/pooled surfaces. Verify subsequent ordinary compositor draws after both success and failure.

## Actual observer and pixel transport

Pure expected snapshots are not render measurements. B inspects the actual shared world after its native pass succeeds and before another update/disposal/state restoration replaces it:

```ts
type NativeObservedFrame = {
  version: "native3d-observed-frame-1";
  frameKey: string;
  controller: string;
  scope: string;
  scopeFrame: number;
  sourceFrame: number;
  sourceSha256: string;
  effectiveSceneSha256: string;
  geometrySha256: string;
  appearanceCodeSha256: string;
  viewport: [number, number, number, number];
  camera: {
    worldMatrix: readonly number[];
    viewMatrix: readonly number[];
    projectionMatrix: readonly number[];
    near: number;
    far: number;
    aspect: number;
    fovDegrees: number;
  };
  parts: Record<
    string,
    {
      parent?: string;
      localMatrix: readonly number[];
      worldMatrix: readonly number[];
      localVisible: boolean;
      inheritedVisible: boolean;
    }
  >;
  anchors: Record<
    string,
    {
      part: string;
      world: [number, number, number];
      pixel: [number, number] | null;
      depth: number;
      visibility: NativeScreenAnchor["visibility"];
      visibilityMethod: "three-physical-mesh-segment";
      occluderMesh?: string;
    }
  >;
  pass: { completed: true; calls: number; triangles: number };
};
type NativeObservedSample = {
  sampleIndex: number;
  sampleFrame: number;
  observed: NativeObservedFrame;
};
type NativeObservedOutputFrame = {
  version: "native3d-observed-output-frame-1";
  outputFrame: number;
  executionSha256: string;
  passes: NativeObservedSample[];
};
```

Schemas bound matrices to exactly 16 finite numbers, dictionaries to declared part/anchor limits, viewport to the actual pass rectangle matching snapshot dimensions, and identity/clock fields to their exact pass association. Read actual Object3D local/world matrices/inherited visibility and camera matrices/near/far. Transform each source-local anchor through the actual part, project it through the actual camera, and independently query actual physical meshes under the declared mask/near/endpoint rule. Keep null projection null. Never copy expected matrices/pixels/visibility/rig/assertion values into measurements. This is Three state plus analytic physical visibility, not GPU matrix/depth-buffer readback. Bind actual uploaded-buffer identity once per prepared world; report source Float64 versus GPU Float32 quantization separately.

Root exposes `CompositionFrameReport.nativeObservations?: readonly NativeObservedSample[]` and a bounded frame-local backend collector. Reset on each renderFrame and return observations only after the complete frame succeeds; the pure graph stores no callbacks. renderNativeDepth remains void. When actual-observation acceptance is requested, native root/prefix/isolate/exposure reuse cannot skip a pass and fabricate a fresh observation. Unblurred E01 requires one actual observation per integer output with the expected controller/time. Blurred or isolated exports retain every actual contributing pass/scope/fractional sample; any identical-sample collapse records contributions explicitly. Local raster/buffer caches remain legal. A future cache replay must identify its original pass and cannot count as newly observed rendering.

C streams one authenticated output-frame packet before its assigned pixel upload. Node commits a pending packet only when that exact assigned pixel body is accepted, records incremental transport-body SHA, and writes hashed NDJSON shards plus a compact execution-bound manifest. One pending packet per worker; frame-local collector/pending metadata participate in managed reservations. CLI/BrowserExportResult retain scalar counts/closure references, not all-frame matrices. Limits are 1MiB per packet, 64 pass records, 128 parts/64 anchors per pass, at most 32MiB per shard, at most 16 shards and at most 512MiB total. Shards stream with only frame-local, pending-packet and bounded write-buffer reservations. Conservative source/scope/exposure preflight occurs before output creation; existing stricter metadata/result/receipt limits apply. E01 coverage is exact output 0..695 over all nine half-open controllers, without last-frame/cached replay.

Execution binding contains current saved composition-file SHA and path-independent effective identity, original source/geometry/rig, prepared transport/effective overrides, route/backend/profile and actual appearance-code closure. Independently reconstructed mechanical expectations consume observed matrices/anchors without invented assertion flags. After encoder completion, revalidate source/code and atomically publish final output plus manifest/shards. Cancellation, truncated coverage, stale identity, failed frame/pixel association or invalid closure prevents publication. Portable checks verify every bounded shard and current-edit/execution/final association.

## Route, save/package and appearance identity

Add optional `route:"bridge"|"native3d"` to strict MechanismEpisodeSchema, retaining mechanism-episode-1. Never default it in parsed/authored data, insert it on load/save or normalize absence to authored bridge: absent-route parsed documents/project hashes stay unchanged; explicit route is an ordinary guarded revision edit.

```ts
type MechanismRouteSelection = {
  sourceRoute: "bridge" | "native3d" | null;
  effectiveRoute: "bridge" | "native3d";
  selectionOrigin: "source" | "cli-override" | "default";
};
```

One shared helper chooses explicit CLI override, then authored route, then runtime bridge. An explicit flag remains cli-override even if it equals source. It changes execution selection, not source/revision/dependency/project hash. Native selects WebGL2 and rejects explicit Canvas before output/cache mutation. Newly route-aware preparation/check/result/package records copy selection unchanged, with actual backend/profile.

Check/package with a prepared artifact follows its effectiveRoute after checking current project hash, exact sourceRoute, current saved composition/override identity, backend/profile and closure. An explicit --route there is an assertion, not reselection/repreparation. Preserve original selectionOrigin. An authored/current composition edit requires new preparation even if the effective route stays equal. Legacy bridge receipts without selection are accepted only with matching absent/explicit bridge authored source; explicit native plus CLI bridge requires a newly route-aware receipt. Default absent/no-override bridge responses remain unchanged. Source-only check/package may retain existing scoped mechanical/portable behavior, but cannot claim prepared/observed/encoded/final native acceptance; native final output requires preparation.

Freeze these native versions; retain existing bridge versions and generic composition-render-1/composition-result-1:

| Artifact               | Native version                      |
| ---------------------- | ----------------------------------- |
| Prepared receipt       | mechanism-prepared-native-episode-1 |
| Check result           | mechanism-native-check-result-1     |
| Episode render result  | mechanism-native-render-result-1    |
| Package manifest       | mechanism-native-project-package-1  |
| Package verification   | mechanism-native-package-check-1    |
| Package command result | mechanism-native-package-result-1   |

Native receipts bind current compiled composition, project/route/source/effective/prepared/code/profile identities and actual evidence. They invent no plate/capture manifests or capture-cache statistics. Relocation updates actual composition-file checksums after path rebasing, while preserving documented path-independent semantic/original source identities. Selection provenance is receipt identity, not a physical visual-cache input. Save/reload rebuilds the prepared revision atomically after readiness, refreshing dynamic bindings, quality/reading checks and final associations. No validation relies solely on an unchanged episode hash after a saved composition edit.

Builder/CLI/Lab use existing composition/session proposals and save guards for camera/part/material/label edits. C generates native label groups/leaders/indicators in mechanism/overlays.ts while preserving the captured bridge route. Prepared transport crosses CompositionSource/browser/export/Lab envelopes; runtime evaluators/GPU handles do not. CompositionResources.preparedNative3D carries transport and resources.native3D / EvaluationOptions.preparedNative3D carry the immutable asset lookup. Both pixel/nonpixel lint use that lookup through existing policy.evaluation and preserve measured textBounds/metadata.readingPolicy; runtime objects never enter persisted policy. Native readiness must run through resources/prepareFrame even without media/surfaceCache, before synchronous drawing/text discovery.

Freeze appearance identity:

```ts
type NativeAppearanceCodeIdentity = {
  runtimeFormat: "source-ts" | "installed-js";
  modules: readonly { name: string; sha256: string }[];
  threeRuntime: {
    version: string;
    sources: readonly { name: string; sha256: string }[];
  };
};
```

Names are stable package-relative identifiers without collisions/absolute roots, sorted lexically. Hash actual loaded bytes or a verified build closure: complete transitive first-party world/material/texture/graphic/evaluator/matrix/resolve bytes plus pinned Three runtime. Source.ts is not installed.js identity; declaration/installed rewrite consumers prove public paths. Both capture key creation and pre-publication revalidation gain the shared factory closure. Native appearance keys add loaded font/profile/code to sourceKey plus applicable frame/artwork identity. Label edits invalidate actual artwork/reading evidence while reusing unchanged physical captures. Source/code change between preparation and publication aborts publication.

## Ownership and verification

| Owner                            | Files and boundary                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: contract/evaluation/graph     | scene-contract native3d and composition/native3d/layers/validation/reference scheduling; renderer-core native3d types/prepare/variants/evaluate/visibility/bindings; composition evaluate types/compile/evaluate/exposure; graph/backend, source/text-frame/graph/surface/dependency visitors, prefix-dependencies and capability/cache admission. Preserve time-controls unless a demonstrated gap requires change. |
| B: shared Three/WebGL            | native3d three-world/materials/textures/graphics/browser; render webgl-native-depth.ts, webgl-device.ts and webgl2.ts integration, webgl-visual-key/damage; engine mechanism/browser extraction; sorted first-party/Three module/source closure descriptors; fresh world inspection and independent depth/transfer/state oracle. GPU resources/buffer sharing are explicitly owned/released.                         |
| C: lifecycle/authoring/transport | engine composition-native3d/composition-source and mechanism overlays; native source IO and preparation/episode lifecycle/portable closure, importing root’s appearance identity helper; existing builder/CLI/Lab edit/session routes; authenticated packet/pixel sink and independent check adapter. Coordinate execution-runtime export-worker/export-browser-worker changes with root.                            |
| Parent                           | renderer.ts resource/options/collector/report and text.ts discovery plumbing; appearance identity IO hashing/helper from B’s sorted closure descriptors and both capture.ts closure-key/publication sites; observation schemas/barrels/diagnostic limits, package manifests/versions, capture cache versions, engine lint/quality-render wiring and release package layout/public installed entries.                 |

Add renderer-core direct pinned three 0.186.0 and browser-only public `@still-shift/renderer-core/native3d-browser`, installed `still-shift/renderer/native3d-browser`; export shared factory/observation/browser graphics there. Pure root/native barrels import no Three/DOM/IO. Each owner retains immutable session resources until in-flight readers finish; no LRU mutation changes a live prepared table.

Registry codes are comp-native3d-{source,checksum,not-ready,topology,limit,controller-transform,controller-style,binding,scope,overlap,cycle,clock,material,graphic,backend,profile,observation,protocol}, with located JSON paths and frame/controller/scope where relevant, bounded sanitized failure transport and unchanged legacy codes.

Freeze comparison thresholds before code: physical source/evaluated state within 1e-8 scene units; independent anchors within 0.5px; endpoint epsilon 0.0001 scene units; repeated pinned route/profile exports exact hashes; independent native preview/export at most one 8-bit channel step. Source Float64/GPU Float32 quantization is separate. Bridge extraction remains exact. Native/bridge material/reflection/shadow/fog/alpha-edge/background/framing differences are declared profile deltas; broad similarity cannot hide local mechanical/depth failure. Historical v008 without driver identity remains silhouette/contact/anchor/rubric comparison. This subset does not complete CE8-L-F or deferred CE6-P.

Verification proceeds: unchanged bridge factoring; one-frame independently authored tilted graphic partially before/behind a mesh in the same frame in both layer orders; flipped local artwork/front/double orientation; four-corner color/alpha/UV and public transfer; black/white/transparent/background/ACES; clipping/scaled normals/hard mask and physical visibility endpoint/floor/near cases; ordinary compositor state after success/failure; nine cut/fractional/random/reverse samples and located unsupported/stale/cycle/overlap failures; saved camera/part/material/label changes plus short contact export; all 696 native E01 frames with original audio/mechanics/eligible reading holds; repeated export/independent preview; relocation/installed source/native E01 lifecycle; allocation/RSS/cache/timing evidence; complete local gate preserving 176 existing baselines; PR to main. Retain failed runs/reruns/deferred requirements. Continuous human visual/listening acceptance stays pending until received. No merge, npm publication, release promotion or GitHub Actions is implied.

Implementation and capability/acceptance evidence remain pending after the MS1 PR prerequisite.
