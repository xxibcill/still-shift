/**
 * Node-safe mapping of composition text layers onto typography scenes. Font
 * preparation (browser) and exact-copy font coverage (Node, ET1) both read text
 * through these functions, so they inspect the same reachable copy.
 */
import type {
  Composition,
  CompositionLayer,
  CompositionScope,
  TextAnimator,
} from "@still-shift/scene-contract";
import type { prepareTypography } from "../../typography-renderer.ts";
import { resolvedTextStyle, type TextNode } from "../../typography-style.ts";
import {
  collectFontTextRuns,
  type CollectedFontTextRun,
} from "../../font-copy.ts";
import { rgba } from "../evaluate/sample.ts";
import { cssColor } from "./canvas-color.ts";
import type { CompositionTextFrames } from "./text-frames.ts";

export type TypographyScene = Parameters<typeof prepareTypography>[0];

export type TextLayer = Extract<CompositionLayer, { type: "text" }>;
export const scopes = (comp: Composition): [CompositionScope, string][] => [
  [comp, ""],
  ...(comp.precomps ?? []).map((p): [CompositionScope, string] => [
    p,
    `${p.id}/`,
  ]),
];
export const textLayers = (scope: CompositionScope) =>
  scope.layers.filter((l): l is TextLayer => l.type === "text");

/** Initial node colour; drawing supplies the evaluated layer colour. */
export const initialColor = (layer: TextLayer) =>
  cssColor(
    rgba(
      typeof layer.color === "string"
        ? layer.color
        : layer.color.keys[0]!.value,
    ),
  );

/** Map a text layer onto the typography renderer's node shape, in layer space. */
export function textNode(comp: Composition, layer: TextLayer): TextNode {
  const node = {
    id: layer.id,
    type: "text",
    x: 0,
    y: 0,
    width: layer.size?.[0] ?? 0,
    height: layer.size?.[1] ?? 0,
    opacity: 1,
    rotation: 0,
    origin: [0, 0],
    text: layer.text,
    ...(layer.states ? { states: layer.states } : {}),
    ...(layer.container ? { container: layer.container } : {}),
    fontSize: layer.fontSize,
    color: initialColor(layer),
    weight: layer.weight ?? "normal",
    font: layer.font ?? "sans-serif",
    align: layer.align ?? "left",
    ...(layer.fontAsset ? { fontAsset: layer.fontAsset } : {}),
    ...(layer.textRole ? { textRole: layer.textRole } : {}),
    ...(layer.textLayout ? { textLayout: layer.textLayout } : {}),
    ...(layer.textBox ? { textBox: layer.textBox } : {}),
    ...(layer.revealMode ? { revealMode: layer.revealMode } : {}),
    ...(layer.style ? { style: layer.style } : {}),
    ...(layer.spans ? { spans: layer.spans } : {}),
    ...(layer.locale ? { locale: layer.locale } : {}),
    ...(layer.anchor ? { anchor: layer.anchor } : {}),
    ...(layer.wrap ? { wrap: layer.wrap } : {}),
    ...(layer.orphanFraction !== undefined
      ? { orphanFraction: layer.orphanFraction }
      : {}),
    ...(layer.decorations ? { decorations: layer.decorations } : {}),
    ...(layer.transition ? { transition: layer.transition } : {}),
    ...(layer.transitions ? { transitions: layer.transitions } : {}),
    ...(layer.feather !== undefined ? { feather: layer.feather } : {}),
    ...(layer.lineOverlap !== undefined
      ? { lineOverlap: layer.lineOverlap }
      : {}),
  } as TextNode;
  const style = resolvedTextStyle(node, comp.textStyles ?? {});
  // As resolveTypographyNodes does for story scenes: the style decides font and size.
  return {
    ...node,
    fontSize: style.size!,
    ...(style.fontAsset ? { fontAsset: style.fontAsset } : {}),
  };
}

export function pinned(comp: Composition, node: TextNode) {
  return comp.assets.some((a) => a.id === node.fontAsset && a.type === "font");
}

export function typographyScene(
  comp: Composition,
  scope: CompositionScope,
  nodes: TextNode[],
  frames: CompositionTextFrames = {},
): TypographyScene {
  const ids = new Set(nodes.map((n) => n.id));
  const fps = scope.fps ?? comp.fps;
  const prefix = scope === comp ? "" : `${scope.id}/`;
  return {
    nodes,
    fps,
    frameCount: scope.frameCount,
    timeline: {
      fps,
      frameCount: scope.frameCount,
      durationMs: (scope.frameCount * 1000) / fps,
    },
    tracks: {},
    followers: {},
    animationFrames: Object.fromEntries(
      nodes.flatMap((node) =>
        Object.hasOwn(frames, prefix + node.id)
          ? [[node.id, frames[prefix + node.id]!]]
          : [],
      ),
    ),
    typography: "type-1",
    textStyles: comp.textStyles ?? {},
    textEvents: textLayers(scope)
      .filter((layer) => ids.has(layer.id))
      .flatMap((layer) =>
        (layer.corrections ?? []).map((correction) => ({
          verb: "correct" as const,
          node: layer.id,
          at: correction.start,
          duration: correction.end - correction.start,
          replacement: correction.replacement,
          ...(correction.span ? { span: correction.span } : {}),
          ...(correction.color ? { color: correction.color } : {}),
        })),
      ),
    textAnimators: (scope.textAnimators ?? []).filter((a) =>
      ids.has(a.node),
    ) as TextAnimator[],
    signals: comp.signals ?? [],
  } as unknown as TypographyScene;
}

export function compositionFontTextRuns(
  comp: Composition,
  typed: TypographyScene[],
): CollectedFontTextRun[] {
  return scopes(comp).flatMap(([scope], scopeIndex) => {
    const scene = typed[scopeIndex]!;
    const prefix = scope === comp ? "" : `precomps.${scopeIndex - 1}.`;
    const layerPaths = new Map(
      scope.layers.map((layer, index) => [
        layer.id,
        `${prefix}layers.${index}`,
      ]),
    );
    const ids = new Set(scene.nodes.map((node) => node.id));
    const correctionPaths = textLayers(scope)
      .filter((layer) => ids.has(layer.id))
      .flatMap((layer) =>
        (layer.corrections ?? []).map(
          (_, index) =>
            `${layerPaths.get(layer.id)}.corrections.${index}.replacement`,
        ),
      );
    return collectFontTextRuns(scene).map((run) => {
      const event = /^textEvents\.(\d+)\.replacement$/u.exec(run.path ?? "");
      const path = event
        ? correctionPaths[Number(event[1])]
        : run.path?.replace(
            /^nodes\.\d+/u,
            layerPaths.get(run.node ?? "") ?? "layers",
          );
      return { ...run, ...(path ? { path } : {}) };
    });
  });
}
