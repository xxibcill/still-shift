import {
  CompositionSchema,
  SolidSceneSchema,
  type Composition,
  type CompositionLayer,
  type NativeAppearanceCodeIdentity,
  type NativeObservedSample,
  type SolidScene,
} from "@still-shift/scene-contract";
import {
  createCompositionPreview,
  loadCompositionResources,
} from "../../packages/renderer-core/src/composition/render/renderer.ts";
import type { NativeDepthRuntimeFactory } from "../../packages/renderer-core/src/native3d/runtime.ts";
import type { NativeDepthArtifact } from "./native3d-depth-reference.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";

const SIZE = 128;
const transform = (
  position: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) => ({
  position,
  rotation: [0, 0, 0] as [number, number, number],
  scale,
  pivot: [0, 0, 0] as [number, number, number],
});
type Source = { source: SolidScene; sourceSha256: string };
export type NativeCompositionIntegrationInput = Source & {
  appearanceCodeIdentity: NativeAppearanceCodeIdentity;
  font: { url: string; sha256: string };
};
type Retain = (artifact: NativeDepthArtifact) => Promise<void>;
type Rendered = {
  rgba: Uint8ClampedArray;
  observations: readonly NativeObservedSample[];
  artwork: unknown[];
};
function requireFact(value: unknown, description: string): asserts value {
  if (!value) throw Error(`native3d-composition-integration: ${description}`);
}
async function hash(bytes: Uint8Array | Uint8ClampedArray | string) {
  const body =
    typeof bytes === "string"
      ? new TextEncoder().encode(bytes)
      : Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", body);
  return (
    "sha256:" +
    Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("")
  );
}
function maximumDelta(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  requireFact(a.length === b.length, "pixel dimensions differ");
  let delta = 0,
    changed = 0;
  for (let at = 0; at < a.length; at++) {
    const difference = Math.abs(a[at]! - b[at]!);
    delta = Math.max(delta, difference);
    changed += difference > 0 ? 1 : 0;
  }
  return { maximumDelta: delta, changedChannels: changed };
}
function color(pixels: Uint8ClampedArray, x: number, y: number) {
  return Array.from(
    pixels.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4),
  );
}
const red = (rgba: readonly number[]) =>
  rgba[0]! > 180 && rgba[1]! < 100 && rgba[2]! < 100 && rgba[3] === 255;
const yellow = (rgba: readonly number[]) =>
  rgba[0]! > 180 && rgba[1]! > 180 && rgba[2]! < 100 && rgba[3] === 255;
const green = (rgba: readonly number[]) =>
  rgba[1]! > 180 && rgba[0]! < 100 && rgba[2]! < 100 && rgba[3] === 255;
/** Independent perspective for the authored camera [0,0,10], target origin. */
function project(point: readonly number[], fov = 60) {
  const focal = SIZE / (2 * Math.tan((fov * Math.PI) / 360));
  return [
    Math.round(SIZE / 2 + (point[0]! * focal) / (10 - point[2]!)),
    Math.round(SIZE / 2 - (point[1]! * focal) / (10 - point[2]!)),
  ];
}
function world(id = "world"): CompositionLayer {
  return {
    id,
    type: "native3d",
    asset: "solid",
    sourceStartFrame: 0,
    sourceFps: 30,
  };
}
function makeComposition(
  input: NativeCompositionIntegrationInput,
  source: Source,
  layers: CompositionLayer[],
  extra: Record<string, unknown> = {},
): Composition {
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "native-integration",
    width: SIZE,
    height: SIZE,
    fps: 30,
    frameCount: 12,
    background: "#000000",
    colorSpace: "srgb",
    assets: [
      {
        id: "solid",
        type: "native3d",
        format: "solid-scene-1",
        path: "solid.json",
        sha256: source.sourceSha256,
      },
      {
        id: "font",
        type: "font",
        path: input.font.url,
        sha256: input.font.sha256,
        weight: "600",
        style: "normal",
      },
    ],
    layers,
    ...extra,
  });
}
/** Actual schema-normalized source bytes, not a substituted graph or expected observation. */
async function sourceVariant(
  input: Source,
  change: (source: SolidScene) => void,
  id: string,
  retain: Retain,
): Promise<Source> {
  const value = structuredClone(input.source);
  change(value);
  let source = SolidSceneSchema.parse(value);
  source.geometrySha256 = await hash(canonicalMechanismJson(source.geometry));
  source = SolidSceneSchema.parse(source);
  const bytes = JSON.stringify(source, null, 2) + "\n";
  const sourceSha256 = await hash(bytes);
  await retain({
    id: id + "-source",
    facts: {
      sourceSha256,
      sourceBytes: bytes,
      geometrySha256: source.geometrySha256,
    },
  });
  return { source, sourceSha256 };
}
async function renderer(
  input: NativeCompositionIntegrationInput,
  source: Source,
  composition: Composition,
  retain: Retain,
) {
  const resources = await loadCompositionResources(
    composition,
    (id) => {
      requireFact(
        id === "font",
        "only the declared pinned font may be fetched",
      );
      return input.font.url;
    },
    {
      preparedNative3D: {
        version: "composition-prepared-native3d-1",
        assets: { solid: source },
      },
      appearanceCodeIdentity: input.appearanceCodeIdentity,
    },
  );
  let artwork: unknown[] = [];
  const factory = resources.nativeDepthFactory;
  requireFact(
    factory,
    "prepared resources must inject the actual native runtime",
  );
  // Observe real compiled draw inputs without replacing surfaces, depth or pixels.
  const instrument: NativeDepthRuntimeFactory = (device, options) => {
    const runtime = factory(device, options);
    return {
      get allocated() {
        return runtime.allocated;
      },
      validate: (op) => runtime.validate(op),
      render(op, target, renderArtwork) {
        artwork.push({
          controller: op.layer,
          sampleFrame: op.sampleFrame,
          scopeFrame: op.frame.scopeFrame,
          viewport: [op.width, op.height],
          graphics: op.graphics.map((graphic) => ({
            layer: graphic.layer,
            localBounds: graphic.localBounds,
            rasterOriginPixels: graphic.rasterOriginPixels,
            width: graphic.surface.width,
            height: graphic.surface.height,
            artworkMatrix: graphic.artworkMatrix,
            worldMatrix: graphic.worldMatrix,
            originPixels: graphic.originPixels,
            pixelsPerUnit: graphic.pixelsPerUnit,
            alphaMode: graphic.alphaMode,
            alphaCutoff: graphic.alphaCutoff,
            actualArtworkOps: graphic.surface.ops,
          })),
        });
        runtime.render(op, target, renderArtwork);
      },
      dispose: () => runtime.dispose(),
    };
  };
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const preview = createCompositionPreview(
    canvas,
    composition,
    { ...resources, nativeDepthFactory: instrument },
    { backend: "webgl2", collectNativeObservations: true },
  );
  return {
    async render(id: string, frame: number): Promise<Rendered> {
      artwork = [];
      await preview.prepareFrame(frame);
      const report = preview.renderFrame(frame);
      const rgba = Uint8ClampedArray.from(preview.readPixels());
      // A real output readback and its actual same-call passes are retained before assertions.
      await retain({
        id,
        width: SIZE,
        height: SIZE,
        rgba: Array.from(rgba),
        facts: {
          outputFrame: frame,
          pixelSha256: await hash(rgba),
          pixelEncoding: "rgba8-straight-top-first",
          sourceSha256: source.sourceSha256,
          geometrySha256: source.source.geometrySha256,
          composition,
          appearanceCodeSha256: resources.nativeAppearanceCodeSha256,
          nativeObservations: report.nativeObservations,
          samples: report.samples,
          diagnostics: report.diagnostics,
          culled: report.culled,
          artwork,
        },
      });
      requireFact(
        report.nativeObservations?.length,
        "completed native passes must actually be observed",
      );
      requireFact(
        !report.diagnostics.some((value) => value.severity === "error"),
        "render report contains an error",
      );
      return { rgba, observations: report.nativeObservations, artwork };
    },
    dispose() {
      preview.dispose();
      canvas.width = canvas.height = 0;
    },
  };
}
async function renderOnce(
  input: NativeCompositionIntegrationInput,
  source: Source,
  composition: Composition,
  retain: Retain,
  id: string,
  frame = 0,
) {
  const preview = await renderer(input, source, composition, retain);
  try {
    return await preview.render(id, frame);
  } finally {
    preview.dispose();
  }
}

/** Actual graph/text/shape→cropped surfaces→shared mesh depth. No prepainted artwork upload. */
export async function checkNativeCompositionIntegration(
  input: NativeCompositionIntegrationInput,
  retain: Retain,
) {
  const cases: { id: string; facts: unknown }[] = [];
  const finish = async (id: string, facts: unknown) => {
    await retain({ id: id + "-acceptance", facts });
    cases.push({ id, facts });
  };
  const source = await sourceVariant(
    input,
    (scene) => {
      const mesh = scene.geometry.meshes[0]!;
      mesh.positions = [-4, -4, 0, 4, -4, 0, 4, 4, 0, -4, 4, 0];
      mesh.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
      mesh.indices = [0, 1, 2, 0, 2, 3];
      mesh.bounds = { min: [-4, -4, 0], max: [4, 4, 0] };
      scene.camera = { ...scene.camera, near: 1, far: 12 };
      scene.profile = {
        ...scene.profile,
        background: "#000000",
        transparent: false,
        environmentIntensity: 0,
      };
    },
    "composition-depth",
    retain,
  );
  const binding = (y: number) => ({
    role: "world-graphic" as const,
    sceneLayer: "world",
    transform: {
      ...transform([0, y, 0]),
      rotation: [0, Math.PI / 4, 0] as [number, number, number],
    },
    pixelsPerUnit: 32,
    alphaMode: "mask" as const,
    alphaCutoff: 0.5,
    side: "double" as const,
  });
  const text: CompositionLayer = {
    id: "word",
    type: "text",
    text: "HH",
    fontAsset: "font",
    fontSize: 128,
    color: "#ff0000",
    align: "center",
    anchor: "top",
    transform: { anchor: [0, 0], position: [0, -64] },
    native3D: binding(1.8),
  };
  const shape: CompositionLayer = {
    id: "shape",
    type: "shape",
    native3D: binding(-2),
    contents: [
      { id: "box", type: "rect", size: [96, 48] },
      { id: "paint", type: "fill", color: "#ffff00" },
    ],
    masks: [
      {
        id: "hard-half",
        mode: "add",
        path: {
          closed: true,
          vertices: [
            [-48, -24],
            [48, -24],
            [48, 0],
            [-48, 0],
          ],
        },
      },
    ],
  };
  const forward = await renderOnce(
    input,
    source,
    makeComposition(input, source, [world(), text, shape]),
    retain,
    "graph-crossing-forward",
  );
  const backward = await renderOnce(
    input,
    source,
    makeComposition(input, source, [shape, text, world()]),
    retain,
    "graph-crossing-backward",
  );
  const hidden = world();
  if (hidden.type !== "native3d") throw Error("native controller");
  hidden.hiddenParts = ["root"];
  const artworkOnly = await renderOnce(
    input,
    source,
    makeComposition(input, source, [hidden, text, shape]),
    retain,
    "graph-crossing-artwork-only",
  );
  requireFact(
    maximumDelta(forward.rgba, backward.rgba).maximumDelta === 0,
    "both authored orders must have identical joint-depth pixels",
  );
  const crop = forward.artwork as {
    graphics: {
      layer: string;
      rasterOriginPixels: number[];
      width: number;
      height: number;
      actualArtworkOps: unknown[];
    }[];
  }[];
  requireFact(
    crop.length === 1 && crop[0]!.graphics.length === 2,
    "one actual pass must consume both authored graphic leaves",
  );
  for (const graphic of crop[0]!.graphics) {
    requireFact(
      graphic.rasterOriginPixels[0]! < 0,
      "centered text and shape crops retain negative local coordinates",
    );
    requireFact(
      !(graphic.width === SIZE && graphic.height === SIZE),
      "artwork must use actual local crop, not the viewport",
    );
    requireFact(
      graphic.actualArtworkOps.length > 0 &&
        graphic.width <= 256 &&
        graphic.height <= 160,
      "bounded compiled draw operations must own real artwork surfaces",
    );
  }
  const counts = { frontText: 0, behindText: 0, frontShape: 0, behindShape: 0 };
  for (let y = 15; y < 110; y++)
    for (let x = 32; x < 96; x++) {
      if (Math.abs(x + 0.5 - SIZE / 2) < 3) continue;
      const reference = color(artworkOnly.rgba, x, y);
      const kind = red(reference) ? "Text" : yellow(reference) ? "Shape" : null;
      if (!kind) continue;
      // For rotation Y45, worldZ=-worldX. The independent camera ray crosses
      // the physical z0 mesh before the positive-X (right-hand) graphic half.
      if (x < SIZE / 2) {
        requireFact(
          (kind === "Text" ? red : yellow)(color(forward.rgba, x, y)),
          "front graphic ink must survive physical mesh depth",
        );
        counts[kind === "Text" ? "frontText" : "frontShape"]++;
      } else {
        requireFact(
          green(color(forward.rgba, x, y)),
          "behind graphic ink must be occluded by the physical mesh in the same frame",
        );
        counts[kind === "Text" ? "behindText" : "behindShape"]++;
      }
    }
  requireFact(
    Object.values(counts).every((value) => value >= 8),
    "both real glyph/shape halves must provide independently measured crossing ink",
  );
  const maskMissing = project([0, -2 - 12 / 32, 0]);
  requireFact(
    color(artworkOnly.rgba, maskMissing[0]!, maskMissing[1]!)[0] === 0,
    "declared local hard mask must remove the lower shape half",
  );
  await finish("compiled-cropped-text-shape-joint-depth", {
    counts,
    exactBothLayerOrders: true,
    hardMaskExcludedPixel: maskMissing,
    crop,
  });

  const base = await renderOnce(
    input,
    source,
    makeComposition(input, source, [world()]),
    retain,
    "clip-base",
  );
  const graphic = (id: string, z: number): CompositionLayer => ({
    id,
    type: "solid",
    size: [64, 64],
    color: "#ff0000",
    transform: { anchor: [32, 32] },
    native3D: {
      ...binding(0),
      transform: transform([0, 0, z]),
      alphaMode: "opaque",
    },
  });
  const clippedGraphics = await renderOnce(
    input,
    source,
    makeComposition(input, source, [
      world(),
      graphic("near", 9.5),
      graphic("far", -5),
    ]),
    retain,
    "clip-near-far-graphics",
  );
  requireFact(
    maximumDelta(base.rgba, clippedGraphics.rgba).maximumDelta === 0,
    "wholly near/far-clipped world graphics cannot alter a surviving mesh",
  );
  // The far-plane oracle must not be hidden by the surviving z=0 mesh.
  // Hide a separate physical child while its explicitly bound owner stays visible.
  const farSource = await sourceVariant(
    source,
    (scene) => {
      scene.parts.push({
        id: "clip-mesh",
        parent: "root",
        transform: transform(),
        visible: true,
      });
      for (const mesh of scene.geometry.meshes) mesh.partId = "clip-mesh";
    },
    "far-graphic-visible-owner",
    retain,
  );
  const hiddenMesh = world();
  if (hiddenMesh.type !== "native3d") throw Error("native controller");
  hiddenMesh.hiddenParts = ["clip-mesh"];
  const ownerGraphic = (id: string, z: number): CompositionLayer => {
    const layer = graphic(id, z);
    if (layer.native3D?.role !== "world-graphic") throw Error("native graphic");
    layer.native3D.part = "root";
    return layer;
  };
  const emptyWorld = await renderOnce(
    input,
    farSource,
    makeComposition(input, farSource, [hiddenMesh]),
    retain,
    "clip-far-empty-visible-owner",
  );
  const inRangeWorld = await renderOnce(
    input,
    farSource,
    makeComposition(input, farSource, [
      hiddenMesh,
      ownerGraphic("in-range", 1),
    ]),
    retain,
    "clip-far-in-range-positive",
  );
  const farWorld = await renderOnce(
    input,
    farSource,
    makeComposition(input, farSource, [
      hiddenMesh,
      ownerGraphic("far-only", -5),
    ]),
    retain,
    "clip-far-no-occluding-mesh",
  );
  let visibleRedPixels = 0;
  for (let at = 0; at < inRangeWorld.rgba.length; at += 4)
    visibleRedPixels += red(Array.from(inRangeWorld.rgba.subarray(at, at + 4)))
      ? 1
      : 0;
  requireFact(
    visibleRedPixels >= 64 &&
      maximumDelta(emptyWorld.rgba, inRangeWorld.rgba).changedChannels > 0,
    "the in-range positive graphic must actually show against the empty world",
  );
  requireFact(
    farWorld.observations[0]!.observed.parts.root!.inheritedVisible &&
      !farWorld.observations[0]!.observed.parts["clip-mesh"]!.inheritedVisible,
    "far clipping control must preserve the graphic owner while hiding only physical geometry",
  );
  requireFact(
    maximumDelta(emptyWorld.rgba, farWorld.rgba).maximumDelta === 0,
    "the far-clipped graphic must equal the empty world without an occluding mesh",
  );
  const visibleGraphic = graphic("visible", 1);
  const noMesh = await renderOnce(
    input,
    source,
    makeComposition(input, source, [hidden, visibleGraphic]),
    retain,
    "clip-physical-reference",
  );
  for (const [id, z] of [
    ["near", 9.5],
    ["far", -5],
  ] as const) {
    const controller = world();
    if (controller.type !== "native3d") throw Error("native controller");
    controller.partOverrides = { root: { transform: transform([0, 0, z]) } };
    const actual = await renderOnce(
      input,
      source,
      makeComposition(input, source, [controller, visibleGraphic]),
      retain,
      "clip-physical-" + id,
    );
    requireFact(
      maximumDelta(noMesh.rgba, actual.rgba).maximumDelta === 0,
      "camera-clipped physical mesh must leave the in-range graphic visible",
    );
    requireFact(
      actual.observations[0]!.observed.anchors.face!.visibility === "clipped",
      "actual physical anchor observation must report camera-axis clipping",
    );
  }
  await finish("mixed-camera-near-far-clipping", {
    near: 1,
    far: 12,
    nearDepth: 0.5,
    farDepth: 15,
    exactSurvivingPixels: true,
    farWorldWithoutOccluder: {
      graphicOwner: "root",
      hiddenPhysicalPart: "clip-mesh",
      visibleRedPixels,
      exactEmptyPixels: true,
    },
  });

  const normalSource = await sourceVariant(
    source,
    (scene) => {
      const q = Math.SQRT1_2,
        mesh = scene.geometry.meshes[0]!;
      mesh.positions = [
        -1.5, -1, -1.5, 1.5, -1, 1.5, 1.5, 1, 1.5, -1.5, 1, -1.5,
      ];
      mesh.normals = [-q, 0, q, -q, 0, q, -q, 0, q, -q, 0, q];
      mesh.bounds = { min: [-1.5, -1, -1.5], max: [1.5, 1, 1.5] };
      scene.parts[0]!.transform = transform([0, 0, 0], [2, 1, 0.5]);
      scene.geometry.materials[0] = {
        ...scene.geometry.materials[0]!,
        color: "#cccccc",
        emissive: "#000000",
        emissiveIntensity: 0,
        roughness: 1,
        metalness: 0,
      };
      scene.lights = [
        {
          id: "normal-light",
          type: "directional",
          position: [10, 0, 10],
          target: [0, 0, 0],
          color: "#ffffff",
          intensity: 2,
          castShadow: false,
          shadowMapSize: 128,
          shadowBias: 0,
          shadowNormalBias: 0,
          shadowRadius: 1,
          angle: Math.PI / 4,
          penumbra: 0.2,
        },
      ];
    },
    "scaled-normal",
    retain,
  );
  const inverseLength = Math.hypot(-0.5, 2);
  const expectedNormal = [-0.5 / inverseLength, 0, 2 / inverseLength];
  const baked = await sourceVariant(
    normalSource,
    (scene) => {
      const mesh = scene.geometry.meshes[0]!;
      mesh.positions = mesh.positions.map(
        (value, at) => value * [2, 1, 0.5][at % 3]!,
      );
      mesh.normals = Array.from({ length: 4 }, () => expectedNormal).flat();
      mesh.bounds = { min: [-3, -1, -0.75], max: [3, 1, 0.75] };
      scene.parts[0]!.transform = transform();
    },
    "baked-normal",
    retain,
  );
  const wrong = await sourceVariant(
    baked,
    (scene) => {
      scene.geometry.meshes[0]!.normals = Array.from({ length: 4 }, () => [
        -Math.SQRT1_2,
        0,
        Math.SQRT1_2,
      ]).flat();
    },
    "wrong-normal-negative",
    retain,
  );
  const scaledPixels = await renderOnce(
    input,
    normalSource,
    makeComposition(input, normalSource, [world()]),
    retain,
    "normal-scaled",
  );
  const bakedPixels = await renderOnce(
    input,
    baked,
    makeComposition(input, baked, [world()]),
    retain,
    "normal-baked-independent",
  );
  const wrongPixels = await renderOnce(
    input,
    wrong,
    makeComposition(input, wrong, [world()]),
    retain,
    "normal-wrong-negative",
  );
  const normalDelta = maximumDelta(scaledPixels.rgba, bakedPixels.rgba),
    wrongDelta = maximumDelta(scaledPixels.rgba, wrongPixels.rgba);
  requireFact(
    normalDelta.maximumDelta <= 1,
    "inverse-transpose scaled normals must match independently baked geometry within one code step",
  );
  requireFact(
    wrongDelta.maximumDelta >= 20 && wrongDelta.changedChannels >= 100,
    "wrong normal negative control must alter measured direct-light pixels",
  );
  await finish("nonuniform-positive-scale-normal-transform", {
    scale: [2, 1, 0.5],
    independentInverseTransposeNormal: expectedNormal,
    normalDelta,
    wrongDelta,
    tolerance:
      "one RGBA8 code step for identical geometry/profile; Float32 shader quantization only",
  });

  const seekComp = makeComposition(
    input,
    source,
    [
      {
        id: "instance",
        type: "precomp",
        comp: "inner",
        transform: { anchor: [0, 0] },
        timeRemap: {
          keys: [
            { frame: 0, value: 0.25 },
            { frame: 7, value: 7.25, interpolation: "linear" },
          ],
        },
      },
    ],
    {
      precomps: [
        {
          id: "inner",
          width: SIZE,
          height: SIZE,
          fps: 30,
          frameCount: 16,
          layers: [
            {
              ...world("before"),
              outPoint: 4,
              cameraKeys: [
                {
                  frame: 0,
                  position: [0, 0, 10],
                  target: [0, 0, 0],
                  fovDegrees: 60,
                  easing: "hold",
                },
                {
                  frame: 3,
                  position: [0, 0, 10],
                  target: [0, 0, 0],
                  fovDegrees: 45,
                  easing: "hold",
                },
              ],
            },
            {
              ...world("after"),
              inPoint: 4,
              camera: { ...source.source.camera, fovDegrees: 75 },
              hiddenParts: ["root"],
            },
          ],
        },
      ],
    },
  );
  const seek = await renderer(input, source, seekComp, retain),
    seen = new Map<number, Uint8ClampedArray>();
  const sequence = [0, 6, 3, 7, 1, 6, 0, 3];
  try {
    for (const [index, frame] of sequence.entries()) {
      const actual = await seek.render("seek-" + index, frame),
        observed = actual.observations[0]!.observed;
      requireFact(
        actual.observations.length === 1,
        "unblurred reused renderer must observe one current pass per output",
      );
      requireFact(
        Math.abs(observed.sourceFrame - (frame + 0.25)) <= 1e-12,
        "fractional nested clock must survive arbitrary seek order",
      );
      requireFact(
        observed.scope === "instance",
        "actual observer scope must identify the precomp instance",
      );
      requireFact(
        observed.controller === (frame < 4 ? "before" : "after"),
        "current disjoint controller must follow the cut",
      );
      const fov = frame >= 4 ? 75 : frame >= 3 ? 45 : 60;
      requireFact(
        Math.abs(observed.camera.fovDegrees - fov) < 1e-12,
        "actual camera must reset across reverse/random seeks and cuts",
      );
      requireFact(
        observed.parts.root!.inheritedVisible === frame < 4,
        "actual visibility must reset across reverse/random seeks",
      );
      if (frame < 4)
        requireFact(
          actual.rgba.some((value, at) => at % 4 === 1 && value > 180),
          "visible physical mesh must contribute real green pixels",
        );
      else
        requireFact(
          actual.rgba.every((value, at) => value === (at % 4 === 3 ? 255 : 0)),
          "hidden physical mesh must contribute no stale pixels",
        );
      const previous = seen.get(frame);
      if (previous)
        requireFact(
          maximumDelta(previous, actual.rgba).maximumDelta === 0,
          "repeated absolute seek must recover exact pixels",
        );
      seen.set(frame, actual.rgba);
    }
  } finally {
    seek.dispose();
  }
  await finish("reused-world-fractional-random-reverse-cut-seeks", {
    sequence,
    fractionalOffset: 0.25,
    exactRepeatedPixels: true,
    actualVisibilityAndCamera: true,
  });

  const shutter = makeComposition(
    input,
    source,
    [
      {
        id: "instance",
        type: "precomp",
        comp: "inner",
        transform: { anchor: [0, 0], position: [16, 16] },
        motionBlur: true,
      },
    ],
    {
      motionBlur: {
        enabled: true,
        samples: 3,
        shutterAngle: 180,
        shutterPhase: 0,
      },
      precomps: [
        {
          id: "inner",
          width: 96,
          height: 96,
          fps: 24,
          frameCount: 16,
          layers: [
            {
              ...world(),
              motionBlur: true,
              cameraKeys: [
                {
                  frame: 0,
                  position: [0, 0, 10],
                  target: [0, 0, 0],
                  fovDegrees: 40,
                  easing: "linear",
                },
                {
                  frame: 8,
                  position: [0, 0, 10],
                  target: [0, 0, 0],
                  fovDegrees: 80,
                  easing: "hold",
                },
              ],
            },
          ],
        },
      ],
    },
  );
  const blurred = await renderOnce(
    input,
    source,
    shutter,
    retain,
    "nested-shutter-output",
    4,
  );
  const times = [4 - 1 / 6, 4, 4 + 1 / 6];
  requireFact(
    blurred.observations.length === 3,
    "all three actual contributing native passes must remain observed",
  );
  const direct: Uint8ClampedArray[] = [];
  for (const [index, time] of times.entries()) {
    const sample = structuredClone(shutter);
    sample.motionBlur!.enabled = false;
    const instance = sample.layers[0]!;
    if (instance.type !== "precomp") throw Error("precomp");
    instance.timeRemap = (time * 24) / 30;
    const single = await renderOnce(
      input,
      source,
      sample,
      retain,
      "nested-shutter-direct-" + index,
      4,
    );
    direct.push(single.rgba);
    const actual = blurred.observations[index]!,
      expected = single.observations[0]!.observed;
    requireFact(
      actual.sampleIndex === index &&
        Math.abs(actual.sampleFrame - time) <= 1e-12,
      "actual root shutter invocation order/time must match independent uniform midpoint samples",
    );
    requireFact(
      actual.observed.scope === "instance" &&
        Math.abs(actual.observed.scopeFrame - (time * 24) / 30) <= 1e-12,
      "nested scope clock must use24fps without replacing root sampleFrame",
    );
    requireFact(
      Math.abs(actual.observed.sourceFrame - time) <= 1e-12,
      "physical source30fps must retain fractional root time",
    );
    requireFact(
      JSON.stringify(actual.observed.viewport) ===
        JSON.stringify([0, 0, 96, 96]),
      "native camera must use actual owning-precomp viewport",
    );
    requireFact(
      Math.abs(actual.observed.camera.fovDegrees - (40 + 5 * time)) <= 1e-8,
      "actual FOV must use the fractional physical source clock",
    );
    for (const field of [
      "worldMatrix",
      "viewMatrix",
      "projectionMatrix",
    ] as const)
      requireFact(
        actual.observed.camera[field].every(
          (value, at) => Math.abs(value - expected.camera[field][at]!) <= 1e-8,
        ),
        "actual contributing camera must match separately rendered same-time sample",
      );
  }
  requireFact(
    maximumDelta(direct[0]!, direct[2]!).changedChannels > 0,
    "moving-camera samples must provide a nonstationary pixel control",
  );
  const averaged = Uint8ClampedArray.from(direct[0]!, (_, at) =>
    Math.floor((direct[0]![at]! + direct[1]![at]! + direct[2]![at]!) / 3 + 0.5),
  );
  await retain({
    id: "nested-shutter-independent-average",
    width: SIZE,
    height: SIZE,
    rgba: Array.from(averaged),
    facts: {
      times,
      weights: [1 / 3, 1 / 3, 1 / 3],
      accumulationDomain:
        "authored srgb packed byte samples; opaque alpha255; one final nearest-integer byte resolve",
      pixelSha256: await hash(averaged),
    },
  });
  const shutterDelta = maximumDelta(blurred.rgba, averaged);
  requireFact(
    shutterDelta.maximumDelta <= 1,
    "actual nested shutter output must match independently averaged direct sample bytes within one code step",
  );
  await finish("nested-fractional-shutter-observation-pixel-pairing", {
    times,
    weights: [1 / 3, 1 / 3, 1 / 3],
    rootFps: 30,
    scopeFps: 24,
    sourceFps: 30,
    viewport: [96, 96],
    shutterDelta,
    tolerance:
      "one final RGBA8 code quantization step; no perceptual similarity tolerance",
  });
  return {
    version: "native-composition-integration-proof-1",
    cases,
    overallReadability: "unassessed",
    humanVisualListeningAcceptance: "pending",
  };
}
