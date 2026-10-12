import {
  AnimationEngineError,
  COMPOSITION_LIMITS,
  CompositionSchema,
  CompositionSequenceAssetSchema,
  type Composition,
  type BezierPath,
} from "@still-shift/scene-contract";
import type { EvaluationOptions } from "../../../renderer-core/src/composition/evaluate/types.ts";
import { evaluateComp } from "../../../renderer-core/src/composition/evaluate/evaluate.ts";
import { partitionMechanismCueNativePicture } from "./cue-native-picture.ts";
type SequenceAsset = Extract<
  Composition["assets"][number],
  { type: "sequence" }
>;
type Track<T> = { keys: { frame: number; value: T; interpolation: "hold" }[] };
type Samples = {
  opacity: Track<number>;
  position: Track<[number, number]>;
  paths: Map<string, Track<BezierPath>>;
};
function failure(path: string, message: string): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-cue-plate-overlays",
    diagnosticCode: "mechanism-cue-plate-overlays-subset",
    path,
    nextAction:
      "Use matching retained native plates and the current flat cue composition on its integer frame grid.",
  });
}
function append<T>(track: Track<T>, frame: number, value: T) {
  const last = track.keys.at(-1);
  if (last && JSON.stringify(last.value) === JSON.stringify(value)) return;
  track.keys.push({
    frame,
    value: structuredClone(value),
    interpolation: "hold",
  });
}
function property<T>(track: Track<T>): T | Track<T> {
  if (!track.keys.length) throw Error("Missing admitted overlay samples");
  return track.keys.length === 1 ? track.keys[0]!.value : track;
}
/** Lower native screen bindings onto ordinary integer-held 2D data. The caller must verify retained plate bytes and original provenance; this helper does not authorize reuse. */
export function lowerMechanismCuePlateOverlays(
  composition: Composition,
  preparedNative3D: NonNullable<EvaluationOptions["preparedNative3D"]>,
  input: SequenceAsset,
): Composition {
  if (composition.frameCount > COMPOSITION_LIMITS.maxKeys)
    failure(
      "frameCount",
      "Native plate overlay frameCount exceeds the existing 2000-key admission bound",
    );
  const plates = CompositionSequenceAssetSchema.parse(input);
  for (const field of ["width", "height", "frameCount"] as const)
    if (plates[field] !== composition[field])
      failure(
        field,
        "Native plate " + field + " does not match the current cue composition",
      );
  if (
    plates.frameRate.numerator !==
    composition.fps * plates.frameRate.denominator
  )
    failure(
      "fps",
      "Native plate fps does not match the current cue composition",
    );
  if (composition.assets.some((asset) => asset.id === plates.id))
    failure(
      "assets." + plates.id,
      "Native plate asset ID collides with a current source asset",
    );
  const picture = partitionMechanismCueNativePicture(composition);
  const controller = picture.layers.find((layer) => layer.type === "native3d")!;
  const bound = composition.layers.filter(
    (layer) => layer.native3D?.role === "screen-anchor",
  );
  const samples = new Map<string, Samples>();
  for (const layer of bound) {
    for (const field of [
      "startFrame",
      "stretch",
      "posterizeFps",
      "holdFrame",
      "sampleTimes",
    ] as const)
      if (layer[field] !== undefined)
        failure(
          "layers." + layer.id + "." + field,
          "Native overlay lowering requires the unmodified cue layer clock",
        );
    samples.set(layer.id, {
      opacity: { keys: [] },
      position: { keys: [] },
      paths: new Map(),
    });
  }
  for (let frame = 0; frame < composition.frameCount; frame++) {
    const tree = evaluateComp(composition, frame, { preparedNative3D });
    if (tree.diagnostics.some((d) => d.severity === "error"))
      failure("frame." + frame, "Current cue overlay evaluation has errors");
    for (const state of tree.layers) {
      const sample = samples.get(state.id);
      if (!sample) continue;
      append(
        sample.opacity,
        frame,
        state.visible ? state.transform.opacity : 0,
      );
      const binding = state.layer.native3D!;
      if (binding.role !== "screen-anchor")
        throw Error("Expected screen binding");
      if (binding.target.kind === "position") {
        if (state.transform.position.length !== 2)
          failure(
            "layers." + state.id + ".position",
            "Native screen overlay requires a 2D position",
          );
        append(
          sample.position,
          frame,
          state.transform.position as [number, number],
        );
      }
      for (const content of state.contents ?? []) {
        if (content.type !== "path") continue;
        let path = sample.paths.get(content.id);
        if (!path) {
          path = { keys: [] };
          sample.paths.set(content.id, path);
        }
        append(path, frame, content.path);
      }
    }
  }
  const layers: Composition["layers"] = [];
  for (const original of composition.layers) {
    if (original.native3D?.role === "world-graphic") continue;
    if (original.id === controller.id) {
      layers.push({
        id: controller.id,
        type: "sequence",
        asset: plates.id,
        size: [composition.width, composition.height],
        fit: "stretch",
        inPoint: 0,
        outPoint: composition.frameCount,
        frameBlending: "hold",
        sourceInFrame: 0,
        sourceOutFrame: composition.frameCount,
        transform: { anchor: [0, 0], position: [0, 0] },
      });
      continue;
    }
    const layer = structuredClone(original);
    delete layer.overlayAfter;
    const sample = samples.get(layer.id);
    if (sample) {
      delete layer.native3D;
      layer.transform = {
        ...layer.transform,
        opacity: property(sample.opacity),
        ...(sample.position.keys.length
          ? { position: property(sample.position) }
          : {}),
      };
      if (layer.type === "shape")
        for (const content of layer.contents) {
          if (content.type !== "path") continue;
          const track = sample.paths.get(content.id);
          if (track) content.path = property(track);
        }
    }
    layers.push(layer);
  }
  return CompositionSchema.parse({
    ...composition,
    assets: [
      ...composition.assets.filter((asset) => asset.type !== "native3d"),
      plates,
    ],
    layers,
  });
}
