import type {
  Composition,
  CompositionAsset,
  CompositionScope,
} from "./composition.ts";
import type { CompositionLayer } from "./layers.ts";
import type { IssueReporter } from "./primitives.ts";
import { isResolvedProperty, resolvePropertyPath } from "./resolve.ts";
import { NATIVE3D_VARIANT_LIMIT } from "./native3d.ts";
import { expressionEntries } from "./expressions.ts";
type Path = (string | number)[];

/** Native admission is local to the new subset; legacy layer transforms retain their contract. */
export function checkNative3DScope(
  comp: Composition,
  scope: CompositionScope,
  base: Path,
  assets: Map<string, CompositionAsset>,
  fail: IssueReporter,
): void {
  const byId = new Map(scope.layers.map((layer) => [layer.id, layer]));
  const controllers = scope.layers.filter((layer) => layer.type === "native3d");
  if (
    !controllers.length &&
    !scope.layers.some((layer) => layer.native3D || layer.overlayAfter)
  )
    return;
  if (
    controllers.length &&
    scope.layers.some(
      (layer) =>
        layer.threeD || layer.type === "camera" || layer.type === "light",
    )
  )
    fail(
      "comp-native3d-scope",
      [...base, "layers"],
      "Native depth and ordinary composition threeD cannot share an owning scope",
    );
  const pathOf = (layer: CompositionLayer): Path => [
    ...base,
    "layers",
    scope.layers.indexOf(layer),
  ];
  const style = (layer: CompositionLayer) => {
    const path = pathOf(layer);
    for (const field of [
      "effects",
      "trackMatte",
      "focusDepth",
      "receivesLight",
    ] as const)
      if (
        field === "effects" ? layer.effects?.length : layer[field] !== undefined
      )
        fail(
          "comp-native3d-controller-style",
          [...path, field],
          "Native controllers and their organizing groups cannot introduce effects, matte, focus or lighting",
        );
    if (layer.masks?.length)
      fail(
        "comp-native3d-controller-style",
        [...path, "masks"],
        "Native controller ancestors cannot mask the joint pass",
      );
    if (layer.blendMode !== undefined && layer.blendMode !== "normal")
      fail(
        "comp-native3d-controller-style",
        [...path, "blendMode"],
        "Native controller blend must be normal",
      );
    if (layer.type === "group" && layer.clip)
      fail(
        "comp-native3d-controller-style",
        [...path, "clip"],
        "Native organizing groups cannot clip the joint pass",
      );
  };
  for (const controller of controllers) {
    const path = pathOf(controller),
      asset = assets.get(controller.asset);
    if (asset?.type !== "native3d")
      fail(
        "comp-native3d-source",
        [...path, "asset"],
        "Native controller requires a declared native3d asset",
      );
    if (controller.native3D || controller.overlayAfter)
      fail(
        "comp-native3d-binding",
        [...path, controller.native3D ? "native3D" : "overlayAfter"],
        "A native controller cannot itself be an annotation binding",
      );
    style(controller);
    const seen = new Set<string>();
    for (let id = controller.parent; id && !seen.has(id); ) {
      seen.add(id);
      const parent = byId.get(id);
      if (!parent) break;
      if (parent.type !== "group")
        fail(
          "comp-native3d-controller-transform",
          [...pathOf(parent), "type"],
          "Only identity organizing groups may parent a native controller",
        );
      style(parent);
      id = parent.parent;
    }
    for (const other of controllers) {
      if (scope.layers.indexOf(other) >= scope.layers.indexOf(controller))
        continue;
      if (
        Math.max(controller.inPoint ?? 0, other.inPoint ?? 0) <
        Math.min(
          controller.outPoint ?? scope.frameCount,
          other.outPoint ?? scope.frameCount,
        )
      )
        fail(
          "comp-native3d-overlap",
          [...path, "inPoint"],
          `Native intervals overlap controller ${other.id}, regardless of opacity/visibility`,
        );
    }
  }
  const writers = [
    ...(comp.drivers ?? []).map((writer) => writer.target),
    ...(comp.periodic ?? []).map(
      (writer) => writer.target ?? `${writer.node}.${writer.property}`,
    ),
    ...expressionEntries(comp).map((entry) => entry.target),
  ];
  scope.layers.forEach((layer) => {
    const path = pathOf(layer),
      binding = layer.native3D;
    if (
      layer.overlayAfter !== undefined &&
      byId.get(layer.overlayAfter)?.type !== "native3d"
    )
      fail(
        "comp-native3d-scope",
        [...path, "overlayAfter"],
        "overlayAfter must name a native controller in the same owning scope",
      );
    if (!binding) return;
    const controller = byId.get(binding.sceneLayer);
    if (controller?.type !== "native3d") {
      fail(
        "comp-native3d-scope",
        [...path, "native3D", "sceneLayer"],
        "Binding must name a native controller in the same owning scope",
      );
      return;
    }
    if (
      ![
        "solid",
        "shape",
        "text",
        ...(binding.role === "screen-anchor" ? ["group", "null"] : []),
      ].includes(layer.type)
    )
      fail(
        "comp-native3d-graphic",
        [...path, "native3D"],
        "Native bindings admit solid, shape and text artwork, plus screen annotation groups/nulls",
      );
    if (binding.role === "world-graphic") {
      for (const field of [
        "parent",
        "threeD",
        "receivesLight",
        "focusDepth",
        "trackMatte",
        "effects",
        "overlayAfter",
      ] as const)
        if (
          field === "effects"
            ? layer.effects?.length
            : layer[field] !== undefined && layer[field] !== false
        )
          fail(
            "comp-native3d-graphic",
            [...path, field],
            "World graphics use only explicit physical parenting and local artwork transforms",
          );
      if (layer.blendMode && layer.blendMode !== "normal")
        fail(
          "comp-native3d-graphic",
          [...path, "blendMode"],
          "World graphics require normal blend",
        );
      layer.masks?.forEach((mask, index) => {
        if (
          mask.feather !== undefined ||
          mask.expansion !== undefined ||
          (mask.opacity !== undefined && mask.opacity !== 1)
        )
          fail(
            "comp-native3d-graphic",
            [...path, "masks", index],
            "World graphics admit only local hard masks",
          );
      });
      if (
        binding.alphaMode === "opaque" &&
        (layer.type !== "solid" || layer.masks?.length)
      )
        fail(
          "comp-native3d-graphic",
          [...path, "native3D", "alphaMode"],
          "Opaque graphics require an unmodified fully opaque solid rectangle",
        );
      scope.constraints?.forEach((constraint, index) => {
        if (constraint.target === layer.id)
          fail(
            "comp-native3d-graphic",
            [...base, "constraints", index, "target"],
            "World graphic placement cannot have ordinary constraints",
          );
      });
      return;
    }
    let order: string | undefined = layer.overlayAfter;
    const seen = new Set<string>();
    for (let id = layer.parent; !order && id && !seen.has(id); ) {
      seen.add(id);
      const ancestor = byId.get(id);
      if (!ancestor) break;
      order = ancestor.overlayAfter;
      id = ancestor.parent;
    }
    if (order !== binding.sceneLayer)
      fail(
        "comp-native3d-binding",
        [...path, "overlayAfter"],
        "Bound screen annotation subtree requires matching overlayAfter ordering",
      );
    if (
      (layer.inPoint ?? 0) < (controller.inPoint ?? 0) ||
      (layer.outPoint ?? scope.frameCount) >
        (controller.outPoint ?? scope.frameCount)
    )
      fail(
        "comp-native3d-binding",
        [...path, "native3D"],
        "Bound annotation interval must lie inside its controller interval",
      );
    if (binding.target.kind === "path-endpoint") {
      const target = binding.target;
      const content =
        layer.type === "shape"
          ? layer.contents.find((entry) => entry.id === target.contentId)
          : undefined;
      if (
        content?.type !== "path" ||
        "keys" in content.path ||
        content.path.closed ||
        content.path.vertices.length !== 2 ||
        content.path.inTangents?.some((point) => point.some((v) => v !== 0)) ||
        content.path.outTangents?.some((point) => point.some((v) => v !== 0)) ||
        (layer.type === "shape" &&
          (layer.contents.filter((entry) => entry.type === "path").length !==
            1 ||
            layer.contents.some(
              (entry) =>
                ![
                  "path",
                  "fill",
                  "stroke",
                  "gradient-fill",
                  "gradient-stroke",
                ].includes(entry.type),
            )))
      )
        fail(
          "comp-native3d-binding",
          [...path, "native3D", "target"],
          "Leader requires one top-level open two-vertex straight path, paint only, with no keyed path or handles",
        );
    }
    if (binding.target.kind !== "visibility") {
      scope.constraints?.forEach((constraint, index) => {
        if (
          constraint.target === layer.id &&
          binding.target.kind === "position"
        )
          fail(
            "comp-native3d-binding",
            [...base, "constraints", index, "target"],
            "A screen position binding cannot have a competing constraint writer",
          );
        if (
          "path" in constraint &&
          constraint.path === layer.id &&
          binding.target.kind === "path-endpoint"
        )
          fail(
            "comp-native3d-binding",
            [...base, "constraints", index, "path"],
            "A dynamic native leader cannot be read as a derived path",
          );
      });
      for (const writer of writers) {
        const resolved = resolvePropertyPath(comp, writer);
        if (!isResolvedProperty(resolved) || resolved.layer !== layer) continue;
        const field =
          binding.target.kind === "position"
            ? ".transform.position"
            : `.contents[${binding.target.contentId}].path`;
        if (resolved.path.includes(field))
          fail(
            "comp-native3d-binding",
            [...path, "native3D", "target"],
            `Binding conflicts with property writer ${writer}`,
          );
      }
    }
  });
  for (const [index, asset] of comp.assets.entries())
    if (
      asset.type === "native3d" &&
      asset.textureFont !== undefined &&
      assets.get(asset.textureFont)?.type !== "font"
    )
      fail(
        "comp-native3d-source",
        ["assets", index, "textureFont"],
        "Native procedural graduations require a pinned font asset",
      );
  if (
    comp.assets.filter((asset) => asset.type === "native3d").length >
    NATIVE3D_VARIANT_LIMIT
  )
    fail(
      "comp-native3d-limit",
      ["assets"],
      "Native asset bases exceed the global 64-variant budget",
    );
}
