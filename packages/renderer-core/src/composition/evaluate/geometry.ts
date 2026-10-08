import type {
  Composition,
  CompositionLayer,
  CompositionScope,
} from "@still-shift/scene-contract";
import {
  imagePlacement,
  type Matrix,
  type Point,
} from "../../node-transform.ts";
import type {
  Bounds,
  EvaluatedLayer,
  EvaluatedTransform,
  EvaluationOptions,
} from "./types.ts";

export const identity = (): Matrix => [1, 0, 0, 1, 0, 0];

export function transformMatrix(t: EvaluatedTransform): Matrix {
  const angle = (t.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const kx = Math.tan((t.skewX * Math.PI) / 180),
    ky = Math.tan((t.skewY * Math.PI) / 180);
  const a = (cos - sin * ky) * t.scale[0],
    b = (sin + cos * ky) * t.scale[0];
  const c = (cos * kx - sin) * t.scale[1],
    d = (sin * kx + cos) * t.scale[1];
  return [
    a,
    b,
    c,
    d,
    t.position[0] - a * t.anchor[0] - c * t.anchor[1],
    t.position[1] - b * t.anchor[0] - d * t.anchor[1],
  ];
}

export function layerSize(
  comp: Composition,
  scope: CompositionScope,
  layer: CompositionLayer,
): Point {
  if ("size" in layer && layer.size) return [...layer.size];
  if (layer.type === "video" || layer.type === "sequence") {
    const asset = comp.assets.find((a) => a.id === layer.asset)!;
    if (asset.type === "video" || asset.type === "sequence")
      return [asset.width, asset.height];
  }
  if (layer.type === "precomp") {
    const precomp = comp.precomps!.find((p) => p.id === layer.comp)!;
    return [precomp.width, precomp.height];
  }
  if (layer.type === "adjustment") return [scope.width, scope.height];
  return [0, 0];
}

export function projectBounds(bounds: Bounds, matrix: Matrix): Bounds {
  const [a, b, c, d, e, f] = matrix;
  const { left, top, right, bottom } = bounds;
  const x0 = a * left + c * top + e,
    x1 = a * right + c * top + e;
  const x2 = a * right + c * bottom + e,
    x3 = a * left + c * bottom + e;
  const y0 = b * left + d * top + f,
    y1 = b * right + d * top + f;
  const y2 = b * right + d * bottom + f,
    y3 = b * left + d * bottom + f;
  return {
    left: Math.min(x0, x1, x2, x3),
    top: Math.min(y0, y1, y2, y3),
    right: Math.max(x0, x1, x2, x3),
    bottom: Math.max(y0, y1, y2, y3),
  };
}

export function localBounds(
  comp: Composition,
  scope: CompositionScope,
  state: EvaluatedLayer,
  options: EvaluationOptions,
): Bounds | null {
  const layer = state.layer;
  if (layer.type === "null" || layer.type === "audio") return null;
  if (layer.type === "shape") return state.shapes?.bounds ?? null;
  if (layer.type === "provider") {
    const b = layer.bounds;
    return b ? { left: b[0], top: b[1], right: b[2], bottom: b[3] } : null;
  }
  if (layer.type === "text") {
    const key = scope === comp ? layer.id : `${scope.id}/${layer.id}`;
    const measured = Object.hasOwn(options.textBounds ?? {}, key)
      ? options.textBounds![key]
      : undefined;
    const current = measured?.[state.state ?? 0];
    const prior = measured?.[state.stateFrom ?? state.state ?? 0];
    if (!current || !prior) return current ? { ...current } : null;
    return blendedBounds(current, prior, state.stateMix ?? 1);
  }
  const [width, height] = layerSize(comp, scope, layer);
  if (
    (layer.type === "video" || layer.type === "sequence") &&
    (layer.fit ?? "contain") === "contain"
  ) {
    const asset = comp.assets.find((a) => a.id === layer.asset)!;
    if (asset.type === "video" || asset.type === "sequence") {
      const p = imagePlacement({ width, height, fit: "contain" }, [
        0,
        0,
        asset.width,
        asset.height,
      ]);
      return {
        left: p.x,
        top: p.y,
        right: p.x + p.width,
        bottom: p.y + p.height,
      };
    }
  }
  if (layer.type !== "image" || (layer.fit ?? "contain") !== "contain")
    return { left: 0, top: 0, right: width, bottom: height };
  const sourceBounds = (index: number) => {
    const source = layer.sources[index]!;
    const asset = comp.assets.find((a) => a.id === source.asset)!;
    if (asset.type !== "image")
      return { left: 0, top: 0, right: width, bottom: height };
    const placement = imagePlacement(
      { width, height, fit: "contain" },
      source.crop ?? [0, 0, asset.width, asset.height],
      source.registration?.anchor,
    );
    return {
      left: Math.max(0, placement.x),
      top: Math.max(0, placement.y),
      right: Math.min(width, placement.x + placement.width),
      bottom: Math.min(height, placement.y + placement.height),
    };
  };
  const current = sourceBounds(state.state ?? 0);
  if (state.stateFrom === undefined || (state.stateMix ?? 1) >= 1)
    return current;
  const prior = sourceBounds(state.stateFrom);
  if ((state.stateMix ?? 1) <= 0) return prior;
  return blendedBounds(current, prior, state.stateMix ?? 1);
}

function blendedBounds(current: Bounds, prior: Bounds, mix: number): Bounds {
  if (mix >= 1) return { ...current };
  if (mix <= 0) return { ...prior };
  return {
    left: Math.min(current.left, prior.left),
    top: Math.min(current.top, prior.top),
    right: Math.max(current.right, prior.right),
    bottom: Math.max(current.bottom, prior.bottom),
  };
}
