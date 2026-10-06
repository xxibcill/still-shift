import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { multiplyMatrix, type Matrix } from "../node-transform.ts";
import { evaluateComp } from "./evaluate/index.ts";
import { identity, projectBounds } from "./evaluate/geometry.ts";
import type {
  Bounds,
  EvaluatedLayer,
  EvaluatedLayerTree,
  EvaluationOptions,
} from "./evaluate/types.ts";
import {
  affineHomography,
  inverseHomography,
  multiplyHomographies,
  type Homography,
} from "./evaluate/spatial-geometry.ts";
import {
  homographicBounds,
  homographicScale,
  homographicVelocityPoints,
  normalizedHomography,
} from "./projective-quality.ts";
import { receiverLightingState } from "./quality-lighting.ts";
import { typographyClock } from "./render/text-clock.ts";

export type CompositionQualitySample = {
  id: string;
  path: string;
  state: EvaluatedLayer;
  matrix: Matrix;
  bounds: Bounds | null;
  clippedBounds: Bounds | null;
  opacity: number;
  visible: boolean;
  onScreen: boolean;
  text?: string;
  role?: "heading" | "label" | "qualification" | "body";
  signature: string;
  textClock?: number;
  scale: [number, number];
  homography?: Homography;
  velocityPoints?: number[];
  ownerViewport?: { width: number; height: number };
};
export type CompositionQualityFrame = {
  signature: string;
  textClock?: number;
  layers: Map<string, CompositionQualitySample>;
  diagnostics: EvaluatedLayerTree["diagnostics"];
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const indexed = (values: unknown, state: EvaluatedLayer) =>
  Array.isArray(values)
    ? values[
        Math.max(
          0,
          Math.min(
            values.length - 1,
            Math.floor(state.sampleIndex ?? state.time),
          ),
        )
      ]
    : undefined;
function providerText(state: EvaluatedLayer) {
  if (state.layer.type !== "provider") return undefined;
  const params = state.layer.params,
    node = object(params.node);
  if (node.type !== "text" || typeof node.text !== "string") return undefined;
  const sample = object(indexed(params.samples, state));
  const states = Array.isArray(node.states) ? node.states : undefined;
  const numeric = indexed(object(params.numeric).samples, state);
  return {
    text:
      typeof numeric === "string"
        ? numeric
        : String(
            states?.[Number(sample.state ?? state.state ?? 0)] ?? node.text,
          ),
    role: node.textRole as CompositionQualitySample["role"],
  };
}
export function intersectBounds(a: Bounds, b: Bounds): Bounds {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}
export const hasArea = (bounds: Bounds) =>
  bounds.right > bounds.left && bounds.bottom > bounds.top;

/** Pure samples exclude clock bookkeeping and invisible dependency motion. Pixels remain separate evidence. */
export function compositionQualityFrame(
  comp: Composition,
  frame: number,
  options: EvaluationOptions = {},
): CompositionQualityFrame {
  const tree = evaluateComp(comp, frame, options);
  const layers = new Map<string, CompositionQualitySample>();
  const diagnostics = [...tree.diagnostics];
  const backgrounds: unknown[] = [tree.background];
  const viewport = { left: 0, top: 0, right: comp.width, bottom: comp.height };
  const visit = (
    scope: EvaluatedLayerTree,
    route: string,
    base: Matrix,
    parentOpacity: number,
    clip: Bounds,
    sourcePath: string,
    baseHomography?: Homography,
  ) => {
    const byId = new Map(scope.layers.map((s) => [s.id, s]));
    scope.layers.forEach((state, index) => {
      const id = route + state.id,
        layer = state.layer;
      const matrix = multiplyMatrix(base, state.screenMatrix);
      const homography =
        state.projection || baseHomography
          ? multiplyHomographies(
              baseHomography ?? affineHomography(base),
              state.projection?.homography ??
                affineHomography(state.screenMatrix),
            )
          : undefined;
      const bounds = state.bounds
        ? baseHomography
          ? homographicBounds(state.bounds, baseHomography, viewport)
          : projectBounds(state.bounds, base)
        : null;
      let clipping = clip;
      let parent = layer.parent ? byId.get(layer.parent) : undefined;
      while (parent) {
        if (parent.layer.type === "group" && parent.layer.clip && parent.bounds)
          clipping = intersectBounds(
            clipping,
            baseHomography
              ? homographicBounds(parent.bounds, baseHomography, viewport)
              : projectBounds(parent.bounds, base),
          );
        parent = parent.layer.parent
          ? byId.get(parent.layer.parent)
          : undefined;
      }
      const clippedBounds = bounds ? intersectBounds(bounds, clipping) : null;
      const opacity = parentOpacity * state.opacity * (state.color?.[3] ?? 1);
      const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
      const visible =
        state.drawable &&
        opacity > 1e-8 &&
        (homography
          ? !!inverseHomography(homography) &&
            (!state.projection || !!state.projection.bounds)
          : Math.abs(determinant) > 1e-12) &&
        (state.reveal ?? 1) > 0;
      const onScreen = visible && (!clippedBounds || hasArea(clippedBounds));
      const text =
        layer.type === "text"
          ? { text: state.text ?? layer.text, role: layer.textRole }
          : providerText(state);
      const content =
        layer.type === "provider"
          ? [
              indexed(layer.params.samples, state),
              indexed(object(layer.params.geometry).samples, state),
              indexed(object(layer.params.numeric).samples, state),
            ]
          : undefined;
      const clock =
        layer.type === "text"
          ? typographyClock(
              layer,
              scope === tree
                ? (comp.textAnimators ?? [])
                : (comp.precomps?.find((p) => p.id === scope.id)
                    ?.textAnimators ?? []),
              layer.corrections ?? [],
              comp.signals ?? [],
            )(state.time)
          : undefined;
      const sample: CompositionQualitySample = {
        id,
        path: `${sourcePath ? sourcePath + "." : ""}layers.${index}`,
        state,
        matrix,
        bounds,
        clippedBounds,
        opacity,
        visible,
        onScreen,
        scale: homography
          ? homographicScale(homography, [
              state.transform.anchor[0],
              state.transform.anchor[1],
            ])
          : [
              Math.hypot(matrix[0], matrix[1]),
              Math.hypot(matrix[2], matrix[3]),
            ],
        ...(homography
          ? {
              homography,
              velocityPoints: homographicVelocityPoints(homography, [
                state.transform.anchor[0],
                state.transform.anchor[1],
              ]),
            }
          : {}),
        ...(state.layer.coverage === "required"
          ? { ownerViewport: { width: scope.width, height: scope.height } }
          : {}),
        ...(text?.text ? { text: text.text } : {}),
        ...(text?.role ? { role: text.role } : {}),
        ...(clock === undefined ? {} : { textClock: clock }),
        signature: JSON.stringify([
          id,
          matrix,
          opacity,
          state.color,
          state.state,
          state.stateFrom,
          state.stateMix,
          state.reveal,
          text?.text,
          state.masks,
          state.effects,
          content,
          clock,
          ...(layer.receivesLight ? [receiverLightingState(state, scope)] : []),
          ...(homography
            ? [normalizedHomography(homography), state.focusBlur ?? 0]
            : []),
        ]),
      };
      layers.set(id, sample);
      if (state.precomp && onScreen) {
        backgrounds.push([id, state.precomp.background, matrix, opacity]);
        diagnostics.push(...state.precomp.diagnostics);
        const childIndex =
          comp.precomps?.findIndex((p) => p.id === state.precomp!.id) ?? -1;
        visit(
          state.precomp,
          id + "/",
          matrix,
          opacity,
          clippedBounds ?? clipping,
          `precomps.${childIndex}`,
          homography,
        );
      }
    });
  };
  visit(tree, "", identity(), 1, viewport, "");
  for (const sample of layers.values()) {
    const matteId = sample.state.layer.trackMatte?.layer;
    if (matteId) {
      const route = sample.id.includes("/")
        ? sample.id.slice(0, sample.id.lastIndexOf("/") + 1)
        : "";
      sample.signature = JSON.stringify([
        sample.signature,
        layers.get(route + matteId)?.signature,
      ]);
    }
  }
  return {
    layers,
    diagnostics,
    signature: JSON.stringify([
      backgrounds,
      [...layers.values()].filter((s) => s.onScreen).map((s) => s.signature),
    ]),
  };
}
export function sampleCompositionQuality(
  comp: Composition,
  options: EvaluationOptions = {},
) {
  const frames: CompositionQualityFrame[] = [];
  let samples = 0;
  for (let frame = 0; frame < comp.frameCount; frame++) {
    const sample = compositionQualityFrame(comp, frame, options);
    samples += sample.layers.size;
    if (samples > 2_000_000)
      throw new Error(
        "Motion lint exceeds its 2,000,000 layer-frame budget; split the composition into shots",
      );
    frames.push(sample);
  }
  return frames;
}
export function numericValues(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (
    typeof value === "string" &&
    /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)
  )
    return [1, 3, 5, 7].map((at) =>
      at === 7 && value.length === 7
        ? 1
        : parseInt(value.slice(at, at + 2), 16) / 255,
    );
  if (Array.isArray(value)) return value.flatMap(numericValues);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(numericValues);
  return [];
}
export type QualityTrack = {
  path: string;
  keys: Record<string, unknown>[];
  layer: CompositionLayer;
};
export function layerQualityTracks(layer: CompositionLayer): QualityTrack[] {
  const tracks: QualityTrack[] = [];
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(object(value).keys)) {
      tracks.push({
        layer,
        path,
        keys: object(value).keys as QualityTrack["keys"],
      });
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (["params", "metadata", "source"].includes(key)) continue;
      visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(layer, "");
  return tracks;
}
