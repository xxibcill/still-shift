import type {
  Composition,
  CompositionScope,
} from "@still-shift/scene-contract";
import { passageError } from "../../passage-diagnostics.ts";
import { sampleCamera } from "./camera.ts";
import { localBounds } from "./geometry.ts";
import { effectBounds, primitiveBlurEffect } from "./effects.ts";
import {
  affineMatrix4,
  cameraGeometry,
  cameraDepth,
  circleOfConfusion,
  layerMatrix3d,
  projectPlane,
  worldPoint,
  type Point3,
  type Matrix4,
  multiplyWorldMatrices,
} from "./spatial-geometry.ts";
import { cameraFacingWorld } from "./spatial-orient.ts";
import { sampleSpatialTransform } from "./spatial-state.ts";
import { worldLight } from "./lighting.ts";
import type {
  EvaluatedLayer,
  EvaluatedLayerTree,
  EvaluationOptions,
} from "./types.ts";

/** Camera optics remain active while isolating drawable layers with solo. */
function cameraActive(
  state: EvaluatedLayer,
  scope: CompositionScope,
  tree: EvaluatedLayerTree,
  options: EvaluationOptions,
  byId: ReadonlyMap<string, EvaluatedLayer>,
) {
  for (
    let layer: typeof state.layer | undefined = state.layer;
    layer;
    layer = layer.parent ? byId.get(layer.parent)?.layer : undefined
  ) {
    if (layer !== state.layer && layer.type !== "group") continue;
    if (
      layer.enabled === false ||
      (layer.guide && !options.includeGuides) ||
      tree.time < 0 ||
      tree.time >= scope.frameCount ||
      tree.time < (layer.inPoint ?? 0) ||
      tree.time >= (layer.outPoint ?? scope.frameCount)
    )
      return false;
  }
  return true;
}

/** Attach actual scoped geometry only after all parent world states have settled. */
export function projectSpatialScope(
  comp: Composition,
  scope: CompositionScope,
  tree: EvaluatedLayerTree,
  options: EvaluationOptions,
  route: readonly string[] = [],
  rootFrame = tree.time,
) {
  const byId = new Map(tree.layers.map((state) => [state.id, state]));
  const active = tree.layers.find(
    (state) => state.camera && cameraActive(state, scope, tree, options, byId),
  );
  const width = scope.width,
    height = scope.height;
  const location = { frame: rootFrame, path: route.join("/") || "layers" };
  try {
    if (active?.camera) {
      const controls = active.camera;
      const parent = active.layer.parent
        ? byId.get(active.layer.parent)!
        : undefined;
      const pointOfInterest =
        controls.model === "two-node"
          ? parent?.worldMatrix3d
            ? worldPoint(parent.worldMatrix3d, controls.pointOfInterest)
            : controls.pointOfInterest
          : undefined;
      tree.camera = {
        ...cameraGeometry({
          width,
          height,
          world: active.worldMatrix3d ?? affineMatrix4(active.worldMatrix),
          zoom: controls.zoom,
          viewOffset: controls.viewOffset,
          filmSize: controls.filmSize,
          nearClip: controls.nearClip,
          farClip: controls.farClip,
          focusDistance: controls.focusDistance,
          blurLevel: controls.blurLevel,
          blurModel: controls.blurModel,
          maxBlur: controls.maxBlur,
          ...(pointOfInterest ? { pointOfInterest } : {}),
          aperture: controls.depthOfField ? controls.aperture : 0,
        }),
        id: active.id,
        source: "native",
      };
    } else {
      const legacy =
        scope === comp && comp.camera2d
          ? sampleCamera(comp, tree.time)
          : undefined;
      const transform = sampleSpatialTransform(
        { id: "default-camera", type: "camera" },
        0,
        tree.fps,
        [width, height],
        [0, 0],
      ).transform;
      if (legacy) transform.position = [legacy.x, legacy.y, -width];
      tree.camera = {
        ...cameraGeometry({
          width,
          height,
          world: layerMatrix3d(transform),
          zoom: legacy ? width * legacy.zoom : width,
        }),
        id: null,
        source: legacy ? "legacy2d" : "default",
      };
    }
  } catch (error) {
    passageError(
      "comp-camera-geometry",
      error instanceof Error ? error.message : String(error),
      {
        ...location,
        ...(active
          ? { node: active.id, path: [...route, active.id].join("/") }
          : {}),
      },
    );
  }
  const camera = tree.camera!;
  if (
    tree.layers.some((state) => state.layer.transform?.autoOrient === "camera")
  ) {
    for (
      let parent = active;
      parent;
      parent = parent.layer.parent ? byId.get(parent.layer.parent) : undefined
    )
      if (parent.layer.transform?.autoOrient === "camera")
        passageError(
          "comp-camera-cycle",
          "An active camera cannot depend on a camera-facing parent",
          { ...location, node: parent.id },
        );
    const settled = new Set<string>(),
      unmirrored = new Map<string, Matrix4>();
    const orient = (state: EvaluatedLayer): Matrix4 => {
      if (settled.has(state.id)) return state.worldMatrix3d!;
      const parent = state.layer.parent
        ? orient(byId.get(state.layer.parent)!)
        : undefined;
      const t = state.transform;
      try {
        const local =
          state.layer.threeD || state.camera || state.light
            ? layerMatrix3d({
                anchor: [t.anchor[0], t.anchor[1], t.anchor[2] ?? 0],
                position: [t.position[0], t.position[1], t.position[2] ?? 0],
                scale: [t.scale[0], t.scale[1], t.scale[2] ?? 1],
                orientation: t.orientation ?? [0, 0, 0],
                rotation: t.rotation,
                rotationX: t.rotationX ?? 0,
                rotationY: t.rotationY ?? 0,
                skewX: t.skewX,
                skewY: t.skewY,
              })
            : affineMatrix4(state.localMatrix);
        let world = parent ? multiplyWorldMatrices(parent, local) : local;
        const parentBasis = state.layer.parent
          ? unmirrored.get(state.layer.parent)
          : undefined;
        const anchor: Point3 = [t.anchor[0], t.anchor[1], t.anchor[2] ?? 0];
        let basis = layerMatrix3d(
          {
            anchor,
            position: [t.position[0], t.position[1], t.position[2] ?? 0],
            scale: [
              Math.abs(t.scale[0]),
              Math.abs(t.scale[1]),
              Math.abs(t.scale[2] ?? 1),
            ],
            orientation: t.orientation ?? [0, 0, 0],
            rotation: t.rotation,
            rotationX: t.rotationX ?? 0,
            rotationY: t.rotationY ?? 0,
            skewX: t.skewX,
            skewY: t.skewY,
          },
          parentBasis,
        );
        if (state.layer.transform?.autoOrient === "camera") {
          const look = worldPoint(world, anchor);
          world = cameraFacingWorld(world, parentBasis, anchor, camera);
          basis = cameraFacingWorld(basis, parentBasis, anchor, camera, look);
        }
        unmirrored.set(state.id, basis);
        state.worldMatrix3d = world;
        settled.add(state.id);
        return world;
      } catch (error) {
        passageError(
          "comp-3d-transform",
          error instanceof Error ? error.message : String(error),
          { ...location, node: state.id, path: [...route, state.id].join("/") },
        );
      }
    };
    tree.layers.forEach(orient);
  }
  if (tree.layers.some((state) => state.light)) {
    tree.lights = [];
    for (const authored of scope.layers) {
      const state = byId.get(authored.id)!;
      if (!state.light) continue;
      try {
        // Validate all authored light relations, including inactive dependency states.
        const light = worldLight(
          state.id,
          state.light,
          state.color!,
          state.worldMatrix3d!,
        );
        if (cameraActive(state, scope, tree, options, byId))
          tree.lights.push(light);
      } catch (error) {
        passageError(
          "comp-light-settings",
          error instanceof Error ? error.message : String(error),
          {
            ...location,
            node: state.id,
            path: [...route, state.id].join("/"),
          },
        );
      }
    }
  }
  for (const state of tree.layers) {
    if (
      (!state.layer.threeD && !state.spatialWorld) ||
      !state.worldMatrix3d ||
      state.camera ||
      state.layer.type === "light"
    )
      continue;
    const anchor = state.transform.anchor;
    state.cameraDepth = cameraDepth(
      camera,
      worldPoint(state.worldMatrix3d, [
        anchor[0],
        anchor[1],
        anchor[2] ?? 0,
      ] as Point3),
    );
    state.focusBlur = circleOfConfusion(
      camera,
      state.layer.focusDepth ?? state.cameraDepth,
    );
    const bounds = localBounds(comp, scope, state, options);
    if (!bounds) continue;
    const path = [...route, state.id].join("/");
    const paintBlur = primitiveBlurEffect(state, byId);
    const boundsEffects = state.effects.filter(
      (effect) => effect.effect !== "blur.primitive",
    );
    if (paintBlur) boundsEffects.unshift(paintBlur);
    const expanded = effectBounds(bounds, boundsEffects, {
      node: state.id,
      path,
      frame: rootFrame,
    });
    // Unbounded generators operate within this flat layer's declared artwork domain.
    const plane = projectPlane(state.worldMatrix3d, camera, expanded ?? bounds);
    state.projection = plane;
    const focusPadding =
      state.focusBlur * (camera.blurModel === "gaussian" ? 3 : 1) + 1;
    state.bounds =
      plane.bounds && state.focusBlur
        ? {
            left: plane.bounds.left - focusPadding,
            top: plane.bounds.top - focusPadding,
            right: plane.bounds.right + focusPadding,
            bottom: plane.bounds.bottom + focusPadding,
          }
        : plane.bounds;
    if (plane.affineMatrix) state.screenMatrix = plane.affineMatrix;
  }
}
