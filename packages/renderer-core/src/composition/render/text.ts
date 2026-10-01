/**
 * The one module that shapes, measures and draws composition text. Every text
 * layout decision (shaping, advances, line breaks) is made here through the
 * typography renderer, so platform-independent layout (Q8 option C) can later
 * replace the operating system's layout without changing the text layer contract.
 */
import type {
  Composition,
  CompositionLayer,
  CompositionScope,
  PreparedScene,
  TextAnimator,
} from "@still-shift/scene-contract";
import { loadPreparedFonts, type LoadedFont } from "../../prepared-fonts.ts";
import { loadTextAnimationFonts } from "../../typography-axes.ts";
import {
  drawTypography,
  prepareTypography,
  type PreparedTypography,
  type TextRaster,
} from "../../typography-renderer.ts";
import { resolvedTextStyle, type TextNode } from "../../typography-style.ts";
import { drawStoryText } from "../../story-text.ts";
import { passageError } from "../../passage-diagnostics.ts";
import { rgba } from "../evaluate/sample.ts";
import type { Bounds } from "../evaluate/types.ts";
import { cssColor, type CanvasTextDrawer } from "./canvas2d.ts";
import type { TextContent } from "./graph.ts";
import {
  collectCompositionTextFrames,
  animatedTextNodes,
  type CompositionTextFrames,
} from "./text-frames.ts";
import { animatedTextBounds } from "./text-bounds.ts";

type TextLayer = Extract<CompositionLayer, { type: "text" }>;
type TypographyScene = Parameters<typeof prepareTypography>[0];

export type CompositionText = {
  /** Local bounds per text state, for `EvaluationOptions.textBounds`. */
  bounds: Record<string, Bounds[]>;
  draw: CanvasTextDrawer;
};

type Entry =
  | { kind: "typography"; node: TextNode; prepared: PreparedTypography }
  | { kind: "system"; node: TextNode };

const scopes = (comp: Composition): [CompositionScope, string][] => [
  [comp, ""],
  ...(comp.precomps ?? []).map((p): [CompositionScope, string] => [
    p,
    `${p.id}/`,
  ]),
];
const textLayers = (scope: CompositionScope) =>
  scope.layers.filter((l): l is TextLayer => l.type === "text");

/** The baked raster colour, in the same normalised form the drawer receives. */
const staticColor = (layer: TextLayer) =>
  cssColor(
    rgba(
      typeof layer.color === "string"
        ? layer.color
        : layer.color.keys[0]!.value,
    ),
  );

/** Map a text layer onto the typography renderer's node shape, in layer space. */
function textNode(comp: Composition, layer: TextLayer): TextNode {
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
    fontSize: layer.fontSize,
    color: staticColor(layer),
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
  return style.fontAsset
    ? { ...node, fontAsset: style.fontAsset, fontSize: style.size! }
    : node;
}

function pinned(comp: Composition, node: TextNode) {
  return comp.assets.some((a) => a.id === node.fontAsset && a.type === "font");
}

function typographyScene(
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
    textEvents: [],
    textAnimators: (scope.textAnimators ?? []).filter((a) =>
      ids.has(a.node),
    ) as TextAnimator[],
    signals: comp.signals ?? [],
  } as unknown as TypographyScene;
}

/** Load and verify every pinned font, including style and animated-axis variants. */
export async function loadCompositionFonts(
  comp: Composition,
  assetUrl: (id: string) => string,
): Promise<Map<string, LoadedFont>> {
  const fonts = comp.assets.flatMap((a) =>
    a.type === "font"
      ? [
          {
            id: a.id,
            path: a.path,
            sha256: a.sha256,
            weight: a.weight,
            ...(a.style ? { style: a.style } : {}),
            ...(a.variable ? { variable: a.variable } : {}),
          },
        ]
      : [],
  ) as NonNullable<PreparedScene["fonts"]>;
  const typed = scopes(comp).map(([scope]) => {
    const nodes = textLayers(scope)
      .map((layer) => textNode(comp, layer))
      .filter((node) => pinned(comp, node));
    return typographyScene(comp, scope, nodes);
  });
  const loaded = await loadPreparedFonts(
    {
      fonts,
      nodes: typed.flatMap((scene) => scene.nodes),
      typography: "type-1",
      textStyles: comp.textStyles ?? {},
    },
    assetUrl,
  );
  const frames = compositionTextFrames(
    comp,
    loaded,
    document.createElement("canvas").getContext("2d")!,
  );
  for (const [scope] of scopes(comp)) {
    const scene = typographyScene(
      comp,
      scope,
      textLayers(scope)
        .map((layer) => textNode(comp, layer))
        .filter((node) => pinned(comp, node)),
      frames,
    );
    await loadTextAnimationFonts(scene, loaded);
  }
  return loaded;
}

function compositionTextFrames(
  comp: Composition,
  fonts: Map<string, LoadedFont>,
  context: CanvasRenderingContext2D,
): CompositionTextFrames {
  const animated = [comp, ...(comp.precomps ?? [])].some(
    (scope) => animatedTextNodes(scope).size > 0,
  );
  if (!animated) return {};
  const staticComp: Composition = {
    ...comp,
    textAnimators: [],
    ...(comp.precomps
      ? {
          precomps: comp.precomps.map((scope) => ({
            ...scope,
            textAnimators: [],
          })),
        }
      : {}),
  };
  const { bounds } = prepareCompositionText(staticComp, fonts, context, {});
  return collectCompositionTextFrames(comp, bounds);
}

function markBaseColor(raster: TextRaster, color: string) {
  raster.baseColor = color;
  for (const variant of raster.variants.values()) variant.baseColor = color;
}

function union(boxes: Bounds[]): Bounds {
  return {
    left: Math.min(...boxes.map((b) => b.left)),
    top: Math.min(...boxes.map((b) => b.top)),
    right: Math.max(...boxes.map((b) => b.right)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
}
const pad = (b: Bounds, by: number): Bounds => ({
  left: b.left - by,
  top: b.top - by,
  right: b.right + by,
  bottom: b.bottom + by,
});

/**
 * Shape every text layer once with its pinned fonts, measure local bounds per
 * text state and return the Canvas drawer. Layers without a pinned font draw with
 * the browser's generic `serif`/`sans-serif` faces (not reproducible across
 * machines), as legacy story text does.
 */
export function prepareCompositionText(
  comp: Composition,
  fonts: Map<string, LoadedFont>,
  measureContext: CanvasRenderingContext2D,
  frames: CompositionTextFrames = compositionTextFrames(
    comp,
    fonts,
    measureContext,
  ),
): CompositionText {
  const entries = new Map<string, Entry>();
  const bounds: Record<string, Bounds[]> = {};
  for (const [scope, prefix] of scopes(comp)) {
    const nodes = textLayers(scope).map((layer) => ({
      layer,
      node: textNode(comp, layer),
    }));
    const typed = nodes.filter(({ node }) => pinned(comp, node));
    const scene = typographyScene(
      comp,
      scope,
      typed.map(({ node }) => node),
      frames,
    );
    const prepared = typed.length
      ? prepareTypography(scene, fonts, { strokeCoverage: true })
      : undefined;
    for (const { layer, node } of nodes) {
      const key = prefix + layer.id;
      const texts = layer.states ?? [layer.text];
      if (prepared && pinned(comp, node)) {
        const rasters = prepared.nodes.get(node.id)!;
        for (const raster of rasters.values())
          markBaseColor(raster, node.color);
        const measured = new Map(
          [...rasters].map(([text, raster]) => [
            text,
            animatedTextBounds(node, raster, prepared.scene),
          ]),
        );
        const perState = texts.map((text) => measured.get(text)!);
        // Transitions and counts show other texts in between: use their union.
        const transitions = layer.transition ?? layer.transitions?.length;
        const all = transitions
          ? pad(union([...measured.values()]), node.fontSize)
          : undefined;
        bounds[key] = perState.map((box) => all ?? box);
        entries.set(key, { kind: "typography", node, prepared });
      } else {
        const ctx = measureContext;
        ctx.save();
        ctx.font = `${node.weight} ${node.fontSize}px ${node.font}`;
        ctx.textAlign = node.align;
        ctx.textBaseline = "top";
        bounds[key] = texts.map((text) => {
          if (node.textLayout) {
            const width = node.textLayout.width;
            const left =
              node.align === "center"
                ? -width / 2
                : node.align === "right"
                  ? -width
                  : 0;
            return {
              left,
              top: 0,
              right: left + width,
              bottom: node.textLayout.height,
            };
          }
          const m = ctx.measureText(text);
          // Word reveals rise by up to 10 px into place.
          return {
            left: -m.actualBoundingBoxLeft,
            top: -m.actualBoundingBoxAscent,
            right: m.actualBoundingBoxRight,
            bottom: m.actualBoundingBoxDescent + 10,
          };
        });
        ctx.restore();
        entries.set(key, { kind: "system", node });
      }
    }
  }

  const draw: CanvasTextDrawer = (ctx, content: TextContent) => {
    const entry = entries.get(content.key);
    if (!entry)
      passageError("comp-text-layout-missing", "Text layer was not prepared", {
        path: content.key,
      });
    const color = cssColor(content.color);
    const node =
      color === entry.node.color ? entry.node : { ...entry.node, color };
    if (entry.kind === "typography") {
      drawTypography(
        ctx,
        node,
        { state: content.state, reveal: content.reveal },
        entry.prepared,
        content.time,
      );
      return;
    }
    const text = node.states?.[content.state] ?? node.text;
    ctx.fillStyle = color;
    ctx.font = `${node.weight} ${node.fontSize}px ${node.font}`;
    ctx.textAlign = node.align;
    ctx.textBaseline = "top";
    drawStoryText(ctx, node, text, content.reveal);
  };
  return { bounds, draw };
}
