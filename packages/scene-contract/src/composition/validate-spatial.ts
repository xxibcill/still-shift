import type { Composition, CompositionScope } from "./composition.ts";
import type { CompositionLayer } from "./layers.ts";
import type { IssueReporter } from "./primitives.ts";
import { expressionEntries } from "./expressions.ts";
import { isResolvedProperty, resolvePropertyPath } from "./resolve.ts";

export function spatialLayer(layer: CompositionLayer, scope: CompositionScope) {
  const seen = new Set<string>();
  for (
    let current: CompositionLayer | undefined = layer;
    current && !seen.has(current.id);
    current = scope.layers.find((candidate) => candidate.id === current!.parent)
  ) {
    seen.add(current.id);
    if (current.threeD || current.type === "camera" || current.type === "light")
      return true;
  }
  return false;
}
export function checkSpatialLayer(
  layer: CompositionLayer,
  scope: CompositionScope,
  path: (string | number)[],
  fail: IssueReporter,
) {
  const spatial = spatialLayer(layer, scope);
  if (
    layer.receivesLight !== undefined &&
    (!layer.threeD ||
      !["image", "solid", "text", "shape", "precomp"].includes(layer.type))
  )
    fail(
      "comp-light-receiver",
      [...path, "receivesLight"],
      "receivesLight requires explicitly 3D image, solid, text, shape or flat precomp artwork",
    );
  if (layer.type === "light") {
    const unsupported =
      layer.lightType === "ambient"
        ? (["range", "falloffStart", "innerCone", "outerCone"] as const)
        : layer.lightType === "point"
          ? (["innerCone", "outerCone"] as const)
          : [];
    for (const name of unsupported)
      if (layer[name] !== undefined)
        fail(
          "comp-light-settings",
          [...path, name],
          `${name} is not a property of an ${layer.lightType} light`,
        );
    if (
      typeof layer.range === "number" &&
      typeof layer.falloffStart === "number" &&
      layer.falloffStart >= layer.range
    )
      fail(
        "comp-light-settings",
        path,
        "Light falloffStart must be less than range",
      );
    if (
      typeof layer.innerCone === "number" &&
      typeof layer.outerCone === "number" &&
      layer.innerCone > layer.outerCone
    )
      fail(
        "comp-light-settings",
        path,
        "Spot innerCone must not exceed outerCone",
      );
  }
  if (layer.type === "camera") {
    if (layer.zoom !== undefined && layer.focalLength !== undefined)
      fail(
        "comp-camera-settings",
        path,
        "Camera zoom and focalLength are mutually exclusive optical controls",
      );
    if (layer.model === "one-node" && layer.pointOfInterest !== undefined)
      fail(
        "comp-camera-settings",
        [...path, "pointOfInterest"],
        "A one-node camera cannot author a point of interest",
      );
    if ((layer.nearClip ?? 0.01) >= (layer.farClip ?? 10_000_000))
      fail(
        "comp-camera-settings",
        [...path, "nearClip"],
        "Camera clip planes must be ordered",
      );
    if (layer.transform?.autoOrient && layer.transform.autoOrient !== "off")
      fail(
        "comp-camera-settings",
        [...path, "transform", "autoOrient"],
        "Camera orientation uses its rotations or two-node point of interest",
      );
  }
  if (
    layer.transform?.autoOrient === "camera" &&
    (!layer.threeD || layer.type === "camera" || layer.type === "light")
  )
    fail(
      "comp-3d-transform",
      [...path, "transform", "autoOrient"],
      "Camera-facing orientation requires an explicitly 3D artwork or parent layer",
    );
  if (spatial && layer.type === "adjustment")
    fail(
      "comp-3d-transform",
      path,
      "Adjustment layers operate in 2D scope pixel space",
    );
  if (spatial && layer.type === "provider" && !layer.bounds)
    fail(
      "comp-3d-surface-budget",
      [...path, "bounds"],
      "A projected provider needs finite declared local bounds",
    );
  if (spatial && layer.type === "precomp" && layer.collapseTransforms)
    fail(
      "comp-3d-collapse",
      [...path, "collapseTransforms"],
      "Projected precomps render as flat surfaces",
    );
  if (spatial)
    layer.effects?.forEach((effect, index) => {
      if (effect.effect === "time.echo")
        fail(
          "comp-3d-effect",
          [...path, "effects", index],
          "Native time echo uses a scope-space adjustment or flat precomp",
        );
    });
  if (
    layer.coverage === "required" &&
    ["camera", "light", "null", "adjustment", "audio"].includes(layer.type)
  )
    fail(
      "comp-camera-coverage",
      [...path, "coverage"],
      "Required coverage needs a drawable artwork layer or group",
    );
  if (layer.type === "camera") {
    const seen = new Set<string>();
    for (
      let current: CompositionLayer | undefined = layer;
      current && !seen.has(current.id);
      current = scope.layers.find(
        (candidate) => candidate.id === current!.parent,
      )
    ) {
      seen.add(current.id);
      if (current.transform?.autoOrient === "camera")
        fail(
          "comp-camera-cycle",
          path,
          "A camera cannot depend on a camera-facing parent",
        );
    }
  }
}
/** Primary optics cannot depend on writer order; POI writes need a two-node model. */
export function checkCameraWriters(comp: Composition, fail: IssueReporter) {
  const modes = new Map<string, Set<string>>();
  const entries = [
    ...(comp.drivers ?? []).map((entry, index) => ({
      target: entry.target,
      path: ["drivers", index, "target"] as (string | number)[],
    })),
    ...(comp.periodic ?? []).map((entry, index) => ({
      target: entry.target ?? `${entry.node}.${entry.property}`,
      path: ["periodic", index, "target"] as (string | number)[],
    })),
    ...expressionEntries(comp).map((entry) => ({
      target: entry.target,
      path: entry.origin,
    })),
  ];
  for (const { target, path } of entries) {
    const resolved = resolvePropertyPath(comp, target);
    if (!isResolvedProperty(resolved) || resolved.layer?.type !== "camera")
      continue;
    const layer = resolved.layer,
      name = resolved.path.slice(resolved.path.lastIndexOf(".") + 1);
    if (
      resolved.path.includes(".pointOfInterest") &&
      (layer.model ?? (layer.pointOfInterest ? "two-node" : "one-node")) !==
        "two-node"
    )
      fail(
        "comp-camera-settings",
        path,
        "Point-of-interest writes require a two-node camera",
      );
    if (name !== "zoom" && name !== "focalLength") continue;
    const node = resolved.path.slice(0, resolved.path.lastIndexOf("."));
    const set =
      modes.get(node) ??
      new Set<string>(
        layer.zoom !== undefined
          ? ["zoom"]
          : layer.focalLength !== undefined
            ? ["focalLength"]
            : [],
      );
    set.add(name);
    modes.set(node, set);
    if (set.size > 1)
      fail(
        "comp-camera-settings",
        path,
        "One camera instance cannot author or drive both zoom and focalLength",
      );
  }
}
