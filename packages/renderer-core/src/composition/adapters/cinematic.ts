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

export const CINEMATIC_ADAPTER_VERSION = "cinematic-composition-0.1.1";

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
  if (scene.recipe.preset !== "focus_handoff") return undefined;
  const depth = (id: string) =>
    scene.layers.find((layer) => layer.node === id)!.depth;
  const near = 1 / depth(scene.recipe.foreground),
    far = 1 / depth(scene.recipe.subject),
    span = near - far;
  const maximum =
    scene.camera.focus!.maxBlurPx *
    (scene.recipe.intensity === "dramatic"
      ? 1
      : scene.recipe.intensity === "standard"
        ? 0.75
        : 0.5);
  const progress = times.map(
    (time) =>
      sampleCinematicBlur(scene, scene.recipe.foreground, time) / maximum,
  );
  const inverse = progress.map((value) => near - value * span);
  let apertures = inverse.map(
    (value, index) =>
      (2 * 36 * maximum * value) /
      (sampleCinematicCamera(scene, times[index]!).focal * span),
  );
  const normalized = apertures.some((value) => value > 1000);
  // A close authored depth gap can require an unbounded physical aperture.
  // An artistic inverse-depth space retains the same capped Gaussian radii.
  const focus = normalized ? progress.map((value) => 2 - value) : inverse;
  if (normalized)
    apertures = focus.map(
      (value, index) =>
        (2 * 36 * maximum * value) /
        sampleCinematicCamera(scene, times[index]!).focal,
    );
  return {
    camera: {
      depthOfField: true,
      blurModel: "gaussian" as const,
      maxBlur: maximum,
      focusDistance: baked(focus.map((value) => 1 / value)),
      aperture: baked(apertures),
    },
    normalized,
    // Focus inverse depth stays in [1,2]; values above 3 are fully blurred.
    // The finite far clamp introduces at most 4e-7px error (source cap is 4px).
    depth: (value: number) =>
      normalized
        ? 1 / Math.max(1e-7, Math.min(3, 2 + (1 / value - near) / span))
        : value,
  };
}

/** Compile camera recipes to native data; no family evaluator runs during composition rendering. */
export function cinematicToComposition(
  source: CinematicScene,
  options: { id?: string } = {},
): Composition {
  return compiledCinematicToComposition(
    compileCinematicScene(CinematicSceneSchema.parse(source)),
    options,
  );
}

/** Compile a prepared camera recipe once, before native frame rendering. */
export function compiledCinematicToComposition(
  scene: CinematicRenderScene,
  options: { id?: string } = {},
): Composition {
  const frameCount = scene.timeline.frameCount;
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
  const focus = focusControls(scene, times);
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
      source: { family: scene.schemaVersion, id: "camera" },
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
      ...focus?.camera,
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
        source: { family: scene.schemaVersion, id: node.id },
        size: [node.width, node.height],
        sources: node.states,
        fit: node.fit,
        rasterize: "natural-size",
        ...(focus ? { focusDepth: focus.depth(depth) } : {}),
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
      layer.motionBlur = true;
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
    layers: layers.reverse(),
    ...(exposure ? { motionBlur: exposure.motionBlur } : {}),
    ...(scene.format ? { format: scene.format } : {}),
    metadata: params(
      {
        adapter: CINEMATIC_ADAPTER_VERSION,
        title: scene.title,
        provenance: scene.provenance,
        cinematicPreset: scene.recipe.preset,
        ...(focus?.normalized
          ? { cinematicFocusSpace: "normalized-inverse-depth" }
          : {}),
        cinematicCoverage: {
          background: scene.recipe.background,
          paintedBounds: scene.layers.find(
            (layer) => layer.node === scene.recipe.background,
          )!.paintedBounds,
          ...(scene.recipe.preset === "foreground_reveal"
            ? {
                reveal: {
                  subject: scene.recipe.subject,
                  occluders: scene.layers
                    .filter((layer) => layer.depth < subjectDepth)
                    .map((layer) => layer.node),
                  region: scene.recipe.revealRegion,
                  settleFrame: scene.cameraFrames[2]!.frame,
                },
              }
            : {}),
        },
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
