import {
  AnimationEngineError,
  CompositionSchema,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";

const roots = new Set([
  "schemaVersion",
  "id",
  "width",
  "height",
  "frameCount",
  "fps",
  "background",
  "layers",
  "assets",
  "textStyles",
  "markers",
]);
function failure(path: string, message: string): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-cue-native-picture",
    diagnosticCode: "mechanism-cue-native-picture-subset",
    path,
    nextAction:
      "Use the flat composition emitted by the current mechanism cue compiler.",
  });
}
function isolated(layer: CompositionLayer, path: string) {
  if (layer.parent)
    failure(
      path + ".parent",
      "Native picture does not admit a parent outside its isolated physical/world layers",
    );
  if (layer.trackMatte || layer.masks?.length || layer.effects?.length)
    failure(
      path,
      "Native picture does not admit masks, mattes or effects on its physical/world layers",
    );
}

/** Isolate the native picture of a flat compiled cue cycle. This is source data, not a cache receipt. */
export function partitionMechanismCueNativePicture(
  composition: Composition,
): Composition {
  for (const key of Object.keys(composition))
    if (!roots.has(key))
      failure(key, "Unsupported native picture root: " + key);
  const controllers = composition.layers.filter(
    (layer) => layer.type === "native3d",
  );
  if (controllers.length !== 1)
    failure(
      "layers",
      "Native cue picture requires exactly one physical controller",
    );
  const controller = controllers[0]!;
  isolated(controller, "layers." + controller.id);
  const references = new Map<string, "native3d" | "font">([
    [controller.asset, "native3d"],
  ]);
  const physicalAsset = composition.assets.find(
    (asset) => asset.id === controller.asset,
  );
  if (!physicalAsset || physicalAsset.type !== "native3d")
    failure(
      "assets." + controller.asset,
      "Missing or incompatible physical asset: " + controller.asset,
    );
  if (physicalAsset.textureFont)
    references.set(physicalAsset.textureFont, "font");
  const styles: NonNullable<Composition["textStyles"]> = {};
  const layers = composition.layers.filter((layer) => {
    if (layer === controller) return true;
    if (layer.native3D?.role !== "world-graphic") return false;
    const path = "layers." + layer.id;
    isolated(layer, path);
    if (layer.type !== "text" || layer.spans?.length)
      failure(
        path,
        "Native cue world graphics must be compiled pinned-font text without spans",
      );
    if (layer.native3D.sceneLayer !== controller.id)
      failure(
        path + ".native3D.sceneLayer",
        "World text names a different physical controller",
      );
    if (!layer.fontAsset)
      failure(path + ".fontAsset", "World text requires a pinned font asset");
    references.set(layer.fontAsset, "font");
    if (layer.style) {
      const style = composition.textStyles?.[layer.style];
      if (!style)
        failure(path + ".style", "World text names an absent font style");
      styles[layer.style] = structuredClone(style);
      if (style.fontAsset) references.set(style.fontAsset, "font");
    }
    return true;
  });
  const assets = [...references]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, type]) => {
      const asset = composition.assets.find((asset) => asset.id === id);
      if (!asset || asset.type !== type)
        failure(
          "assets." + id,
          "Missing or incompatible native picture asset: " + id,
        );
      return structuredClone(asset);
    });
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "mechanism-native-picture",
    width: composition.width,
    height: composition.height,
    frameCount: composition.frameCount,
    fps: composition.fps,
    ...(composition.background === undefined
      ? {}
      : { background: composition.background }),
    assets,
    layers: structuredClone(layers),
    ...(Object.keys(styles).length ? { textStyles: styles } : {}),
  });
}
