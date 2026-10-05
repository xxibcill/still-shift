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
import { typographyClock } from "./render/text-clock.ts";

export type CompositionQualitySample = {
  id: string;
  path: string;
  ancestors: string[];
  children: string[];
  matte?: string;
  active: boolean;
  state: EvaluatedLayer;
  effects: EvaluatedLayer["effects"];
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
};
export type CompositionQualityFrame = {
  signature: string;
  textClock?: number;
  layers: Map<string, CompositionQualitySample>;
  matteSources: Set<string>;
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
    scopeAncestors: readonly string[],
    painting: boolean,
  ) => {
    const byId = new Map(scope.layers.map((s) => [s.id, s]));
    const matteIds = new Set(
      scope.layers.flatMap((s) =>
        s.layer.trackMatte ? [s.layer.trackMatte.layer] : [],
      ),
    );
    const scopeEnd =
      scope === tree
        ? comp.frameCount
        : comp.precomps!.find((p) => p.id === scope.id)!.frameCount;
    scope.layers.forEach((state, index) => {
      const id = route + state.id,
        layer = state.layer;
      const matrix = multiplyMatrix(base, state.screenMatrix);
      const bounds = state.bounds ? projectBounds(state.bounds, base) : null;
      let clipping = clip;
      const ancestors = [...scopeAncestors];
      let parent = layer.parent ? byId.get(layer.parent) : undefined;
      while (parent) {
        ancestors.push(route + parent.id);
        if (parent.layer.type === "group" && parent.layer.clip && parent.bounds)
          clipping = intersectBounds(
            clipping,
            projectBounds(parent.bounds, base),
          );
        parent = parent.layer.parent
          ? byId.get(parent.layer.parent)
          : undefined;
      }
      const clippedBounds = bounds ? intersectBounds(bounds, clipping) : null;
      const opacity = parentOpacity * state.opacity * (state.color?.[3] ?? 1);
      const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
      const active =
        scope.time >= 0 &&
        scope.time < scopeEnd &&
        scope.time >= (layer.inPoint ?? 0) &&
        scope.time < (layer.outPoint ?? scopeEnd);
      const visible =
        painting &&
        state.drawable &&
        opacity > 1e-8 &&
        Math.abs(determinant) > 1e-12 &&
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
      const effects = state.effects.filter((effect) => effect.enabled);
      const sample: CompositionQualitySample = {
        id,
        path: `${sourcePath ? sourcePath + "." : ""}layers.${index}`,
        ancestors,
        children: [],
        active,
        ...(layer.trackMatte ? { matte: route + layer.trackMatte.layer } : {}),
        state,
        effects,
        matrix,
        bounds,
        clippedBounds,
        opacity,
        visible,
        onScreen,
        scale: [
          Math.hypot(matrix[0], matrix[1]),
          Math.hypot(matrix[2], matrix[3]),
        ],
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
          effects,
          content,
          clock,
        ]),
      };
      layers.set(id, sample);
      if (state.precomp && (onScreen || (active && matteIds.has(layer.id)))) {
        if (onScreen)
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
          [id, ...ancestors],
          onScreen,
        );
      }
    });
  };
  visit(tree, "", identity(), 1, viewport, "", [], true);
  for (const sample of layers.values()) {
    const route = sample.id.slice(0, sample.id.lastIndexOf("/") + 1);
    const group = sample.ancestors.find(
      (id) =>
        layers.get(id)?.state.layer.type === "group" &&
        id.slice(0, id.lastIndexOf("/") + 1) === route,
    );
    const container = group ?? (route ? route.slice(0, -1) : undefined);
    if (container) layers.get(container)?.children.push(sample.id);
  }
  const paintsContent = (sample: CompositionQualitySample) =>
    sample.state.drawable ||
    (sample.state.layer.type === "group" && sample.state.visible);
  const matteSources = new Set<string>();
  const collectMatte = (id: string) => {
    const sample = layers.get(id);
    if (!sample?.active || matteSources.has(id)) return;
    matteSources.add(id);
    if (sample.matte) collectMatte(sample.matte);
    for (const childId of sample.children) {
      const child = layers.get(childId);
      if (child && paintsContent(child)) collectMatte(childId);
    }
  };
  for (const sample of layers.values())
    if (sample.onScreen && sample.matte) collectMatte(sample.matte);
  const signatures = new Map(
    [...layers].map(([id, sample]) => [id, sample.signature]),
  );
  const matteSignature = (id: string, seen = new Set<string>()): unknown => {
    const sample = layers.get(id);
    if (!sample?.active || seen.has(id)) return null;
    const next = new Set(seen).add(id);
    return [
      signatures.get(id),
      sample.state.precomp?.background,
      sample.matte ? matteSignature(sample.matte, next) : null,
      sample.children
        .filter((id) => {
          const child = layers.get(id);
          return child && paintsContent(child);
        })
        .map((id) => matteSignature(id, next)),
    ];
  };
  for (const sample of layers.values())
    if (sample.matte)
      sample.signature = JSON.stringify([
        sample.signature,
        matteSignature(sample.matte),
      ]);
  return {
    layers,
    matteSources,
    diagnostics,
    signature: JSON.stringify([
      backgrounds,
      [...layers.values()].filter((s) => s.onScreen).map((s) => s.signature),
    ]),
  };
}
/** Visible paint, its ancestors and active matte content supply motion evidence. */
export function contributingMotionLayers(frame: CompositionQualityFrame) {
  const sources = new Map<string, CompositionQualitySample>();
  for (const sample of frame.layers.values()) {
    if (!sample.onScreen && !frame.matteSources.has(sample.id)) continue;
    sources.set(sample.id, sample);
    for (const id of sample.ancestors) {
      const ancestor = frame.layers.get(id);
      if (ancestor) sources.set(id, ancestor);
    }
  }
  return sources;
}

export function qualityTrackContributes(
  sample: CompositionQualitySample,
  path: string,
  matteSource = false,
) {
  if (!sample.onScreen && !matteSource)
    return (
      path.startsWith("transform.") &&
      (path !== "transform.opacity" || sample.state.layer.type === "group")
    );
  const effect = /^effects\.(\d+)\./.exec(path);
  return !effect || sample.state.effects[Number(effect[1])]?.enabled === true;
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
      if (
        key === "metadata" ||
        key === "source" ||
        (key === "params" && !path && layer.type === "provider")
      )
        continue;
      visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(layer, "");
  return tracks;
}
