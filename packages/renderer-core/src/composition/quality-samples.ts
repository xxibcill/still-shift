import type {
  Composition,
  CompositionLayer,
  PreparedNode,
  TextEvent,
} from "@still-shift/scene-contract";
import { multiplyMatrix, type Matrix } from "../node-transform.ts";
import { evaluateComp } from "./evaluate/index.ts";
import { rgba } from "./evaluate/sample.ts";
import { readProperty } from "./evaluate/properties.ts";
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
import { passageError } from "../passage-diagnostics.ts";
import { typographySourceFrame } from "./typography-source-frame.ts";
import { resolveTextEvents } from "../typography-events.ts";
import {
  correctionReplacementStart,
  resolveDisplayedText,
} from "../typography-transition.ts";
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
  /** Bounds after group and precomp clipping; the viewport is not applied. */
  clippedBounds: Bounds | null;
  opacity: number;
  reveal: number;
  visible: boolean;
  onScreen: boolean;
  /** Includes group modifiers that affect an on-screen descendant. */
  contributesPaint: boolean;
  /** Exact single displayed copy; absent while distinct copies transition. */
  text?: string;
  /** Candidate copies during a partial or mixed text transition. */
  textCopies?: string[];
  role?: "heading" | "label" | "qualification" | "body";
  signature: string;
  textClock?: number;
  /** Glyph coverage clock excluding opaque color-only animators, for explicit reading declarations. */
  readingClock?: number;
  readingPose?: string;
  fullyOnScreen?: boolean;
  scale: [number, number];
  homography?: Homography;
  velocityPoints?: number[];
  ownerViewport?: { width: number; height: number };
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
type TextCopy = { text?: string; textCopies?: string[] };

function combinedTextCopies(copies: readonly string[]): TextCopy {
  const distinct = [...new Set(copies)];
  return distinct.length === 1
    ? { text: distinct[0]! }
    : { textCopies: distinct };
}

function displayedTextCopies(
  node: Parameters<typeof resolveDisplayedText>[0],
  frame: number,
  state: number,
): string[] {
  const displayed = resolveDisplayedText(node, frame, state);
  if (displayed.kind === "single") return [displayed.text];
  if (displayed.transition.kind === "roll")
    return frame === displayed.transition.window.start
      ? [displayed.fromText]
      : [displayed.fromText, displayed.toText];
  if (displayed.progress === 0) return [displayed.fromText];
  if (displayed.progress === 1) return [displayed.toText];
  return [displayed.fromText, displayed.toText];
}

/** A span correction adds artwork; it does not replace the full logical phrase. */
function withCorrectionArtwork(
  copy: TextCopy,
  frame: number,
  events: readonly {
    start: number;
    duration: number;
    replacement?: string | undefined;
    color?: string | undefined;
  }[],
): TextCopy {
  const active = events.filter(
    (event) =>
      frame > correctionReplacementStart(event) &&
      (!event.color || rgba(event.color)[3] > 0),
  );
  return active.length
    ? {
        textCopies: [
          ...(copy.text === undefined ? (copy.textCopies ?? []) : [copy.text]),
          ...active.flatMap((event) =>
            event.replacement === undefined ? [] : [event.replacement],
          ),
        ],
      }
    : copy;
}

/** Use the same local time and display resolver as the prepared text drawer. */
function nativeText(comp: Composition, state: EvaluatedLayer) {
  const layer = state.layer;
  if (layer.type !== "text") return undefined;
  const fontAsset =
    (layer.style ? comp.textStyles?.[layer.style]?.fontAsset : undefined) ??
    layer.fontAsset;
  const typed = comp.assets.some(
    (asset) => asset.id === fontAsset && asset.type === "font",
  );
  const copies = (index: number): string[] => {
    if (!typed) return [layer.states?.[index] ?? layer.text];
    return displayedTextCopies(layer, state.time, index);
  };
  const mix = state.stateMix ?? 1;
  const current = copies(state.state ?? 0);
  const prior = copies(state.stateFrom ?? state.state ?? 0);
  return {
    ...withCorrectionArtwork(
      combinedTextCopies(
        mix === 0 ? prior : mix === 1 ? current : [...prior, ...current],
      ),
      state.time,
      typed
        ? (layer.corrections ?? []).map((correction) => ({
            ...correction,
            duration: correction.end - correction.start,
          }))
        : [],
    ),
    role: layer.textRole,
    reveal: state.reveal ?? 1,
  };
}

function providerText(state: EvaluatedLayer) {
  const layer = state.layer;
  if (layer.type !== "provider") return undefined;
  const typed = [
    "component.typography@1.0.0",
    "component.typography@1.1.0",
  ].includes(layer.provider);
  const story = layer.provider === "story.text@1.0.0";
  const commerce = /^commerce\.text@1\.[0-3]\.0$/.test(layer.provider);
  if (!typed && !story && !commerce) return undefined;
  const params = layer.params;
  const node = object(params.node);
  if (node.type !== "text" || typeof node.text !== "string") return undefined;
  const sourceTime = state.sampleIndex === undefined ? undefined : state.time;
  const frame = typed
    ? typographySourceFrame(
        state.sampleIndex ?? state.time,
        Number(params.frameCount),
        sourceTime,
      )
    : Math.max(0, Math.floor(state.sampleIndex ?? state.time));
  const sampleState = { ...state, sampleIndex: frame };
  const sample = object(indexed(params.samples, sampleState));
  const states = Array.isArray(node.states) ? node.states : undefined;
  const numeric = indexed(object(params.numeric).samples, sampleState);
  const contentState =
    !story && (layer.state !== undefined || layer.stateFrom !== undefined)
      ? state.state
      : undefined;
  const copy = (index: number): string[] => {
    const text = typeof numeric === "string" ? numeric : node.text;
    return typed
      ? displayedTextCopies(
          { ...node, text } as Parameters<typeof resolveDisplayedText>[0],
          sourceTime ?? frame,
          index,
        )
      : [
          typeof numeric === "string"
            ? numeric
            : String(states?.[index] ?? text),
        ];
  };
  const current = copy(Number(contentState ?? sample.state ?? 0));
  const prior = story ? current : copy(state.stateFrom ?? state.state ?? 0);
  const mix = state.stateMix ?? 1;
  return {
    ...withCorrectionArtwork(
      combinedTextCopies(
        mix === 0 ? prior : mix === 1 ? current : [...prior, ...current],
      ),
      sourceTime ?? frame,
      typed
        ? resolveTextEvents({
            nodes: [node as PreparedNode],
            fps: Number(params.fps),
            frameCount: Number(params.frameCount),
            textEvents: params.textEvents as TextEvent[] | undefined,
          }).filter((event) => event.verb === "correct")
        : [],
    ),
    role: node.textRole as CompositionQualitySample["role"],
    reveal: typeof sample.reveal === "number" ? sample.reveal : 1,
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
function unionBounds(bounds: readonly (Bounds | null)[]): Bounds | null {
  let union: Bounds | null = null;
  for (const bound of bounds) {
    if (!bound) return null;
    union = union
      ? {
          left: Math.min(union.left, bound.left),
          top: Math.min(union.top, bound.top),
          right: Math.max(union.right, bound.right),
          bottom: Math.max(union.bottom, bound.bottom),
        }
      : bound;
  }
  return union;
}
export const hasArea = (bounds: Bounds) =>
  bounds.right > bounds.left && bounds.bottom > bounds.top;

function inheritScaleSigns(signs: [number, number], scale: readonly number[]) {
  signs[0] *= Math.sign(scale[0]!);
  signs[1] *= Math.sign(scale[1]!);
}

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
    baseHomography?: Homography,
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
      const ancestors = [...scopeAncestors];
      const scaleSigns: [number, number] = [1, 1];
      inheritScaleSigns(scaleSigns, state.transform.scale);
      const host = layers.get(scopeAncestors[0] ?? "");
      if (host) inheritScaleSigns(scaleSigns, host.scale);
      let parent = layer.parent ? byId.get(layer.parent) : undefined;
      while (parent) {
        ancestors.push(route + parent.id);
        inheritScaleSigns(scaleSigns, parent.transform.scale);
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
      const active =
        scope.time >= 0 &&
        scope.time < scopeEnd &&
        scope.time >= (layer.inPoint ?? 0) &&
        scope.time < (layer.outPoint ?? scopeEnd);
      const visible =
        painting &&
        state.drawable &&
        opacity > 1e-8 &&
        (homography
          ? !!inverseHomography(homography) &&
            (!state.projection || !!state.projection.bounds)
          : Math.abs(determinant) > 1e-12) &&
        (state.reveal ?? 1) > 0;
      const onScreen =
        visible &&
        (!clippedBounds || hasArea(intersectBounds(clippedBounds, viewport)));
      const text = nativeText(comp, state) ?? providerText(state);
      const content =
        layer.type === "provider"
          ? [
              indexed(layer.params.samples, state),
              indexed(object(layer.params.geometry).samples, state),
              indexed(object(layer.params.numeric).samples, state),
            ]
          : undefined;
      const scopeAnimators =
        scope === tree
          ? (comp.textAnimators ?? [])
          : (comp.precomps?.find((precomp) => precomp.id === scope.id)
              ?.textAnimators ?? []);
      const opaqueColorOnly = (animator: (typeof scopeAnimators)[number]) => {
        const entries = [
          ...Object.entries(animator.from),
          ...Object.entries(animator.to ?? {}),
        ];
        return (
          (!animator.mask || animator.mask === "none") &&
          entries.length > 0 &&
          entries.every(
            ([key, value]) =>
              ["color", "fill", "stroke"].includes(key) &&
              typeof value === "string" &&
              /^#[0-9a-f]{6}(?:ff)?$/i.test(value),
          )
        );
      };
      const readingClock =
        layer.type === "text"
          ? typographyClock(
              layer,
              scopeAnimators.filter((animator) => !opaqueColorOnly(animator)),
              layer.corrections ?? [],
              comp.signals ?? [],
            )(state.time)
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
        reveal: text?.reveal ?? state.reveal ?? 1,
        visible,
        onScreen,
        fullyOnScreen:
          !!bounds &&
          !!clippedBounds &&
          bounds.left >= 0 &&
          bounds.top >= 0 &&
          bounds.right <= comp.width &&
          bounds.bottom <= comp.height &&
          bounds.left === clippedBounds.left &&
          bounds.right === clippedBounds.right &&
          bounds.top === clippedBounds.top &&
          bounds.bottom === clippedBounds.bottom,
        contributesPaint: onScreen,
        scale: homography
          ? (homographicScale(homography, [
              state.transform.anchor[0],
              state.transform.anchor[1],
            ]).map((value, index) => value * scaleSigns[index]!) as [
              number,
              number,
            ])
          : [
              Math.hypot(matrix[0], matrix[1]) * scaleSigns[0],
              Math.hypot(matrix[2], matrix[3]) * scaleSigns[1],
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
        ...(text?.text !== undefined ? { text: text.text } : {}),
        ...(text?.textCopies ? { textCopies: text.textCopies } : {}),
        ...(text?.role ? { role: text.role } : {}),
        ...(clock === undefined ? {} : { textClock: clock }),
        ...(readingClock === undefined
          ? {}
          : {
              readingClock,
              readingPose: JSON.stringify([
                state.masks,
                effects,
                state.state,
                state.stateFrom,
                state.stateMix,
                state.reveal,
              ]),
            }),
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
          ...(text?.textCopies ? [text.textCopies] : []),
          state.masks,
          effects,
          content,
          ...(state.media?.pair
            ? [[state.media.asset, state.media.sourceHash, state.media.pair]]
            : []),
          clock,
          ...(state.depthMotion ? [state.depthMotion] : []),
          ...(state.imagePlane ? [state.imagePlane] : []),
          ...(layer.receivesLight ? [receiverLightingState(state, scope)] : []),
          ...(homography
            ? [normalizedHomography(homography), state.focusBlur ?? 0]
            : []),
        ]),
      };
      layers.set(id, sample);
      const collapsed =
        layer.type === "precomp" && layer.collapseTransforms === true;
      const paintChildren = collapsed ? visible : onScreen;
      if (
        state.precomp &&
        (paintChildren || (active && matteIds.has(layer.id)))
      ) {
        if (onScreen && !collapsed)
          backgrounds.push([id, state.precomp.background, matrix, opacity]);

        diagnostics.push(...state.precomp.diagnostics);
        const childIndex =
          comp.precomps?.findIndex((p) => p.id === state.precomp!.id) ?? -1;
        visit(
          state.precomp,
          id + "/",
          matrix,
          opacity,
          layer.type === "precomp" && layer.collapseTransforms
            ? clipping
            : (clippedBounds ?? clipping),
          `precomps.${childIndex}`,
          [id, ...ancestors],
          paintChildren,
          homography,
        );
        if (collapsed) {
          const children = [...layers.values()].filter((child) =>
            child.id.startsWith(id + "/"),
          );
          const visibleChildren = children.filter((child) => child.visible);
          const onScreenChildren = children.filter((child) => child.onScreen);
          sample.visible = visible && visibleChildren.length > 0;
          sample.onScreen = visible && onScreenChildren.length > 0;
          sample.contributesPaint = sample.onScreen;
          sample.bounds = unionBounds(
            visibleChildren.map((child) => child.bounds),
          );
          sample.clippedBounds = unionBounds(
            onScreenChildren.map((child) => child.clippedBounds),
          );
        }
      }
    });
  };
  // Clipping tracks groups and precomps only; the viewport applies to onScreen,
  // so framing can still see where clipped content sits relative to the canvas.
  const unclipped = {
    left: -Infinity,
    top: -Infinity,
    right: Infinity,
    bottom: Infinity,
  };
  visit(tree, "", identity(), 1, unclipped, "", [], true);
  for (const sample of layers.values()) {
    const route = sample.id.slice(0, sample.id.lastIndexOf("/") + 1);
    const group = sample.ancestors.find(
      (id) =>
        layers.get(id)?.state.layer.type === "group" &&
        id.slice(0, id.lastIndexOf("/") + 1) === route,
    );
    const container = group ?? (route ? route.slice(0, -1) : undefined);
    if (container) layers.get(container)?.children.push(sample.id);
    if (sample.onScreen)
      for (const id of sample.ancestors) {
        const ancestor = layers.get(id);
        if (ancestor?.state.layer.type === "group")
          ancestor.contributesPaint = true;
      }
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
      [...layers.values()]
        .filter((s) => s.contributesPaint)
        .map((s) => s.signature),
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
  if (!sample.contributesPaint && !matteSource)
    return (
      path.startsWith("transform.") &&
      (path !== "transform.opacity" || sample.state.layer.type === "group")
    );
  const effect = /^effects\.(\d+)\./.exec(path);
  return !effect || sample.state.effects[Number(effect[1])]?.enabled === true;
}

export function assertCompositionQualityCapacity(layerFrames: number) {
  if (layerFrames > 2_000_000)
    passageError(
      "comp-lint-limit",
      "Motion lint exceeds its 2,000,000 layer-frame budget; split the composition into shots",
      { path: "layers" },
    );
}

export function sampleCompositionQuality(
  comp: Composition,
  options: EvaluationOptions = {},
) {
  assertCompositionQualityCapacity(comp.frameCount * comp.layers.length);
  const frames: CompositionQualityFrame[] = [];
  let samples = 0;
  for (let frame = 0; frame < comp.frameCount; frame++) {
    const sample = compositionQualityFrame(comp, frame, options);
    samples += sample.layers.size;
    assertCompositionQualityCapacity(samples);
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
/** Read the final evaluated property, including expressions and constraints. */
export function qualityTrackSignature(
  sample: CompositionQualitySample,
  path: string,
) {
  if (
    /^(?:transform\.(?:anchor|position|scale|orientation)|constraintReference)\.[xyz]$/.test(
      path,
    )
  )
    return JSON.stringify(
      readProperty(
        sample.state,
        path.split(".").map((name) => ({ name })),
      ),
    );
  let value: unknown = sample.state;
  for (const segment of path.split(".")) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value === undefined ? undefined : JSON.stringify(value);
}
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
