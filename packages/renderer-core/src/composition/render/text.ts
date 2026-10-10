import {
  createRenderCanvas,
  releaseRenderCanvas,
} from "../../managed-memory-context.ts";
import type { CanvasPixelSource } from "../../canvas-pixel-source.ts";
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
import type { FontValidationOptions } from "../../font-identity.ts";
import {
  collectFontTextRuns,
  type CollectedFontTextRun,
} from "../../font-copy.ts";
import { loadTextAnimationFonts } from "../../typography-axes.ts";
import {
  drawTypography,
  disposeTypography,
  isSingleImageTypography,
  hasStableTypographyImage,
  prepareTypography,
  prepareTypographyColors,
  type PreparedTypography,
} from "../../typography-renderer.ts";
import { resolvedTextStyle, type TextNode } from "../../typography-style.ts";
import {
  drawTextContainer,
  textContainerContent,
  textContainerBounds,
} from "../../text-container.ts";
import { drawStoryText } from "../../story-text.ts";
import { passageError } from "../../passage-diagnostics.ts";
import { rgba } from "../evaluate/sample.ts";
import type { Bounds, EvaluationOptions } from "../evaluate/types.ts";
import {
  cssColor,
  requiresSoftwareFilters,
  type CanvasTextDrawer,
} from "./canvas2d.ts";
import type { TextContent } from "./graph.ts";
import {
  collectCompositionTextFrames,
  animatedTextNodes,
  type CompositionTextFrames,
} from "./text-frames.ts";
import { preparedTextBounds } from "./text-bounds.ts";
import { nativeTypographyContentBounds } from "./native-text-bounds.ts";
import { typographyClock } from "./text-clock.ts";

type TextLayer = Extract<CompositionLayer, { type: "text" }>;
/** Preparation-only diagnostic draw, used to measure glyph contrast. */
export type TextProbe = { node: string; mode: "ink-only" | "container-only" };
type TypographyScene = Parameters<typeof prepareTypography>[0];

export type CompositionText = {
  dispose(): void;
  /** Local bounds per text state, for `EvaluationOptions.textBounds`. */
  bounds: Record<string, Bounds[]>;
  draw: CanvasTextDrawer;
  preparePixels(content: TextContent): void;
  contentKey(content: TextContent): string | undefined;
  contentBounds(content: TextContent): Bounds | undefined;
  nativeContentBounds(content: TextContent): Bounds | undefined;
  singleImage(content: TextContent): boolean;
  stableImages(content: TextContent): boolean;
};

type Entry =
  | {
      kind: "typography";
      node: TextNode;
      prepared: PreparedTypography;
      clock: (frame: number) => number;
      singleImage: boolean;
      stableImages: boolean;
    }
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

/** Initial node colour; drawing supplies the evaluated layer colour. */
const initialColor = (layer: TextLayer) =>
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

/** Load and verify every pinned font, including style and animated-axis variants. */
export async function loadCompositionFonts(
  comp: Composition,
  assetUrl: (id: string) => string,
  validation?: FontValidationOptions,
  evaluationOptions: EvaluationOptions = {},
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
    validation
      ? {
          ...validation,
          textRuns: validation.textRuns ?? compositionFontTextRuns(comp, typed),
        }
      : undefined,
  );
  const probeCanvas = createRenderCanvas();
  let frames: CompositionTextFrames;
  try {
    frames = compositionTextFrames(
      comp,
      loaded,
      probeCanvas.getContext("2d")!,
      evaluationOptions,
    );
  } finally {
    releaseRenderCanvas(probeCanvas);
  }
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

function compositionFontTextRuns(
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

function compositionTextFrames(
  comp: Composition,
  fonts: Map<string, LoadedFont>,
  context: CanvasRenderingContext2D,
  evaluation: EvaluationOptions,
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
  // Frame discovery consumes shaped layout and measured bounds only. Its
  // temporary raster headers preserve dimensions without painting glyphs.
  const probes: HTMLCanvasElement[] = [];
  const boundsOnly: CanvasPixelSource = ({ width, height }) => {
    const canvas = createRenderCanvas();
    probes.push(canvas);
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  try {
    const measured = prepareCompositionText(
      staticComp,
      fonts,
      context,
      {},
      undefined,
      boundsOnly,
      evaluation,
    );
    try {
      return collectCompositionTextFrames(comp, measured.bounds, evaluation);
    } finally {
      measured.dispose();
    }
  } finally {
    for (const canvas of probes) releaseRenderCanvas(canvas);
  }
}

function rectBounds(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Bounds {
  return {
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
  };
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
  frames: CompositionTextFrames | undefined = undefined,
  textProbe?: TextProbe,
  sourceCanvas?: CanvasPixelSource,
  evaluation: EvaluationOptions = {},
): CompositionText {
  frames ??= compositionTextFrames(comp, fonts, measureContext, evaluation);
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
      ? prepareTypography(scene, fonts, {
          softwareRaster: requiresSoftwareFilters(comp),
          ...(sourceCanvas ? { sourceCanvas } : {}),
          strokeCoverage: true,
          colorCoverage: true,
          sourceColorNodes: new Set(
            typed
              .filter(
                ({ layer }) =>
                  layer.rasterize === "source-colors" &&
                  typeof layer.color === "string" &&
                  rgba(initialColor(layer))[3] === 1,
              )
              .map(({ node }) => node.id),
          ),
        })
      : undefined;
    for (const { layer, node } of nodes) {
      const key = prefix + layer.id;
      const texts = layer.states ?? [layer.text];
      if (prepared && pinned(comp, node)) {
        const measured = preparedTextBounds(node, prepared);
        const perState = texts.map((text) => measured.get(text)!);
        // Transitions and counts show other texts in between: use their union.
        const transitions = layer.transition ?? layer.transitions?.length;
        const all = transitions
          ? pad(union([...measured.values()]), node.fontSize)
          : undefined;
        bounds[key] = perState.map((box) => all ?? box);
        entries.set(key, {
          kind: "typography",
          node,
          prepared,
          singleImage: isSingleImageTypography(node, prepared),
          stableImages: hasStableTypographyImage(node, prepared),
          clock: typographyClock(
            node,
            prepared.scene.textAnimators ?? [],
            prepared.corrections.get(node.id) ?? [],
            prepared.scene.signals ?? [],
          ),
        });
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
        if (node.container)
          bounds[key] = bounds[key]!.map((box, i) =>
            union([
              box,
              rectBounds(
                textContainerBounds(
                  textContainerContent(
                    node,
                    texts[i]!,
                    (text) => ctx.measureText(text).width,
                  ),
                  node.container!,
                ),
              ),
            ]),
          );
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
    const probe = textProbe?.node === node.id ? textProbe.mode : undefined;
    if (entry.kind === "typography") {
      drawTypography(
        ctx,
        node,
        { state: content.state, reveal: content.reveal },
        entry.prepared,
        content.time,
        probe,
      );
      return;
    }
    const text = node.states?.[content.state] ?? node.text;
    ctx.fillStyle = color;
    ctx.font = `${node.weight} ${node.fontSize}px ${node.font}`;
    ctx.textAlign = node.align;
    ctx.textBaseline = "top";
    if (node.container && content.reveal > 0 && probe !== "ink-only")
      drawTextContainer(ctx, node, text);
    if (probe === "container-only") return;
    drawStoryText(ctx, node, text, content.reveal);
  };
  return {
    dispose() {
      const prepared = new Set<PreparedTypography>();
      for (const entry of entries.values())
        if (entry.kind === "typography") prepared.add(entry.prepared);
      for (const value of prepared) disposeTypography(value);
    },
    bounds,
    draw,
    preparePixels(content) {
      const entry = entries.get(content.key);
      if (entry?.kind !== "typography") return;
      const color = cssColor(content.color);
      const node =
        color === entry.node.color ? entry.node : { ...entry.node, color };
      for (const state of new Set([
        content.state,
        ...(content.stateFrom === undefined ? [] : [content.stateFrom]),
      ]))
        prepareTypographyColors(
          node,
          { state, reveal: content.reveal },
          entry.prepared,
          content.time,
        );
    },
    singleImage(content) {
      const entry = entries.get(content.key);
      if (textProbe?.node === entry?.node.id) return false;
      return entry?.kind === "typography" && entry.singleImage;
    },
    stableImages(content) {
      const entry = entries.get(content.key);
      return entry?.kind === "typography" && entry.stableImages;
    },
    contentKey(content) {
      const entry = entries.get(content.key);
      if (!entry) return undefined;
      const probe =
        textProbe?.node === entry.node.id ? textProbe.mode : undefined;
      const key =
        entry.kind === "system" ? "static" : String(entry.clock(content.time));
      return probe ? `${probe}:${key}` : key;
    },
    nativeContentBounds(content) {
      const entry = entries.get(content.key);
      if (!entry) return undefined;
      const mix = content.stateMix ?? 1;
      const states =
        content.stateFrom === undefined ||
        mix === 1 ||
        content.stateFrom === content.state
          ? [content.state]
          : mix === 0
            ? [content.stateFrom]
            : [content.stateFrom, content.state];
      if (entry.kind === "typography")
        return union(
          states.map((state) =>
            nativeTypographyContentBounds(
              entry.node,
              entry.prepared,
              state,
              content.reveal,
              content.time,
            ),
          ),
        );
      return union(states.map((state) => bounds[content.key]![state]!));
    },
    contentBounds(content) {
      const states = bounds[content.key];
      if (!states) return undefined;
      return union([
        states[content.state]!,
        ...(content.stateFrom === undefined
          ? []
          : [states[content.stateFrom]!]),
      ]);
    },
  };
}
