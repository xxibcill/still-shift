import {
  CinematicSceneSchema,
  COMPOSITION_LIMITS,
  validateComposition,
  type CinematicScene,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import {
  compileCinematicScene,
  projectCinematicNode,
  sampleCinematicCamera,
  sampleCinematicBlur,
  inspectCinematicCamera,
  type CinematicRenderScene,
} from "../../cinematic-scene.ts";
import { passageError, PassageError } from "../../passage-diagnostics.ts";
import { baked, params } from "./prepared.ts";
import { compileFamilyExposure } from "./exposure.ts";
import { compileFamilyEffects } from "./effects.ts";
import { evaluateComp } from "../evaluate/evaluate.ts";
import { projectLocalPoint } from "../evaluate/spatial-geometry.ts";

export const CINEMATIC_ADAPTER_VERSION = "cinematic-composition-0.1.0";

/** Reuse recipe safety rules against actual evaluated native camera geometry. */
export function inspectCinematicCompositionCamera(
  scene: CinematicRenderScene,
  composition: Composition,
) {
  let previousFrame = NaN,
    tree: ReturnType<typeof evaluateComp>;
  const state = (id: string, frame: number) => {
    if (previousFrame !== frame) {
      tree = evaluateComp(composition, frame);
      previousFrame = frame;
    }
    const layer = tree!.layers.find((layer) => layer.id === id);
    if (!layer?.projection?.affineMatrix)
      passageError(
        "comp-camera-settings",
        "A cinematic plane must have finite affine native camera geometry",
        { node: id, frame },
      );
    return layer;
  };
  return inspectCinematicCamera(
    scene,
    (_, node, frame) => {
      const layer = state(node.id, frame),
        plane = layer.projection!;
      const origin = projectLocalPoint(plane, [0, 0]),
        end = projectLocalPoint(plane, [node.width, node.height]);
      if (!origin || !end)
        passageError(
          "comp-camera-settings",
          "The cinematic camera clips artwork",
          { node: node.id, frame },
        );
      return {
        left: origin[0],
        top: origin[1],
        width: end[0] - origin[0],
        height: end[1] - origin[1],
        scale: plane.affineMatrix![0],
      };
    },
    (_, id, frame) => state(id, frame).focusBlur ?? 0,
  );
}

function focusControls(scene: CinematicRenderScene, times: readonly number[]) {
  if (scene.recipe.preset !== "focus_handoff") return {};
  const depth = (id: string) =>
    scene.layers.find((layer) => layer.node === id)!.depth;
  const near = 1 / depth(scene.recipe.foreground),
    far = 1 / depth(scene.recipe.subject);
  const maximum =
    scene.camera.focus!.maxBlurPx *
    (scene.recipe.intensity === "dramatic"
      ? 1
      : scene.recipe.intensity === "standard"
        ? 0.75
        : 0.5);
  const inverse = times.map(
    (time) =>
      near -
      (sampleCinematicBlur(scene, scene.recipe.foreground, time) / maximum) *
        (near - far),
  );
  return {
    depthOfField: true,
    blurModel: "gaussian" as const,
    maxBlur: maximum,
    focusDistance: baked(inverse.map((value) => 1 / value)),
    aperture: baked(
      inverse.map(
        (value, index) =>
          (2 * 36 * maximum * value) /
          (sampleCinematicCamera(scene, times[index]!).focal * (near - far)),
      ),
    ),
  };
}

/** Compile camera recipes to native data; no family evaluator runs during composition rendering. */
export function cinematicToComposition(
  source: CinematicScene,
  options: { id?: string } = {},
): Composition {
  const input = CinematicSceneSchema.parse(source);
  const scene = compileCinematicScene(input),
    frameCount = scene.timeline.frameCount;
  if (frameCount > COMPOSITION_LIMITS.maxKeys)
    passageError(
      "comp-adapter-limit",
      `Cinematic adaptation supports at most ${COMPOSITION_LIMITS.maxKeys} sampled frames`,
      { path: "durationMs" },
    );
  const exposure = compileFamilyExposure(scene);
  const times =
    exposure?.times ?? Array.from({ length: frameCount }, (_, frame) => frame);
  const cameras = times.map((time) => sampleCinematicCamera(scene, time));
  const centre: [number, number] = [scene.width / 2, scene.height / 2];
  const subject = scene.nodes.find((node) => node.id === scene.recipe.subject)!;
  const subjectDepth = scene.layers.find(
    (layer) => layer.node === subject.id,
  )!.depth;
  const offsets = times.map((time, index) => {
    const camera = cameras[index]!,
      scale = (camera.focal * subjectDepth) / (subjectDepth - camera.z);
    const actual = projectCinematicNode(scene, subject, time);
    return [
      actual.left -
        (centre[0] +
          (subject.x - centre[0]) * scale -
          (camera.x * camera.focal) / (subjectDepth - camera.z)),
      actual.top -
        (centre[1] +
          (subject.y - centre[1]) * scale -
          (camera.y * camera.focal) / (subjectDepth - camera.z)),
    ];
  });
  const ids = new Set(scene.nodes.map((node) => node.id));
  let cameraId = "cinematic-camera";
  while (ids.has(cameraId)) cameraId += "-camera";
  const clock = exposure ? { sampleTimes: times } : {};
  const layers: CompositionLayer[] = [
    {
      id: cameraId,
      type: "camera",
      model: "one-node",
      nearClip: 0.01,
      ...clock,
      source: { family: input.schemaVersion, id: "camera" },
      transform: {
        position: {
          x: baked(cameras.map((camera) => centre[0] + camera.x)),
          y: baked(cameras.map((camera) => centre[1] + camera.y)),
          z: baked(cameras.map((camera) => camera.z)),
        },
      },
      zoom: baked(cameras.map((camera) => camera.focal)),
      viewOffset: {
        x: baked(offsets.map((offset) => offset[0]!)),
        y: baked(offsets.map((offset) => offset[1]!)),
      },
      ...focusControls(scene, times),
    },
    ...scene.nodes.map((node): CompositionLayer => {
      const depth = scene.layers.find((layer) => layer.node === node.id)!.depth;
      const anchor: [number, number, number] = [
        node.width * node.origin[0],
        node.height * node.origin[1],
        0,
      ];
      return {
        id: node.id,
        type: "image",
        threeD: true,
        ...clock,
        source: { family: input.schemaVersion, id: node.id },
        size: [node.width, node.height],
        sources: node.states,
        fit: node.fit,
        rasterize: "natural-size",
        ...(scene.recipe.preset === "focus_handoff"
          ? { focusDepth: depth }
          : {}),
        transform: {
          anchor,
          position: [
            centre[0] + depth * (node.x + anchor[0] - centre[0]),
            centre[1] + depth * (node.y + anchor[1] - centre[1]),
            depth,
          ],
          scale: [depth, depth, 1],
          opacity: node.opacity,
        },
      };
    }),
  ];
  compileFamilyEffects(scene, layers, new Map(), times);
  if (exposure)
    for (const layer of layers) {
      layer.sampleTimes ??= times;
      if (layer.type !== "adjustment") layer.motionBlur = true;
    }
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: options.id ?? "cinematic",
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    frameCount,
    background: scene.background,
    assets: scene.assets.map((asset) => ({ ...asset, type: "image" })),
    layers,
    ...(exposure ? { motionBlur: exposure.motionBlur } : {}),
    ...(scene.format ? { format: scene.format } : {}),
    metadata: params(
      {
        adapter: CINEMATIC_ADAPTER_VERSION,
        title: scene.title,
        provenance: scene.provenance,
        cinematicPreset: scene.recipe.preset,
        sourceCameraValidation: scene.cameraValidation,
      },
      "metadata",
    ),
  };
  const validation = validateComposition(composition);
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  validation.composition.metadata!.nativeCameraValidation = params(
    inspectCinematicCompositionCamera(scene, validation.composition),
    "metadata.nativeCameraValidation",
  );
  return validation.composition;
}
