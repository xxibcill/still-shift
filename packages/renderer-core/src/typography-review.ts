import type { StoryRenderScene } from "./story-scene.ts";
import type { CommerceRenderScene } from "./commerce-scene.ts";
import {
  prepareTypography,
  resolveTypographyNodes,
  type PreparedTypography,
} from "./typography-renderer.ts";
import type { LoadedFont } from "./prepared-fonts.ts";
import { readFontMetrics } from "./font-metrics.ts";
import { measureStoryText } from "./story-text-layout.ts";
import { measureTextLayout } from "./text-layout.ts";
import { prepareCommerceTextFits } from "./commerce-layout.ts";
import { prepareComponentTextFits } from "./component-text-fit.ts";
import { shapeText } from "./shaped-text.ts";

export function prepareTypeReviewScene(
  scene: StoryRenderScene | CommerceRenderScene,
  fonts: Map<string, LoadedFont>,
) {
  const ctx = document.createElement("canvas").getContext("2d")!;
  if (scene.typography) scene = resolveTypographyNodes(scene);
  if (scene.schemaVersion === "commerce-scene-1")
    scene = prepareCommerceTextFits(scene, ctx, fonts);
  return prepareComponentTextFits(scene, ctx, fonts);
}

/** Review legacy text with its original breaks; this never changes its rendering path. */
export function prepareTypeReview(
  scene: StoryRenderScene | CommerceRenderScene,
  fonts: Map<string, LoadedFont>,
): PreparedTypography {
  scene = prepareTypeReviewScene(scene, fonts);
  if (scene.typography) return prepareTypography(scene, fonts);
  const reviewFonts = new Map(
    [...fonts].map(([id, font]) => [
      id,
      {
        ...font,
        ...(font.bytes && !font.metrics
          ? { metrics: readFontMetrics(font.bytes) }
          : {}),
      },
    ]),
  );
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!;
  const nodes: PreparedTypography["nodes"] = new Map();
  for (const node of scene.nodes) {
    if (node.type !== "text") continue;
    const font = reviewFonts.get(node.fontAsset ?? "");
    if (!font?.metrics) continue;
    ctx.font = `${font.weight} ${node.fontSize}px "${font.family}"`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const states: NonNullable<ReturnType<typeof nodes.get>> = new Map();
    for (const text of node.states ?? [node.text]) {
      const original = node.textBox
        ? measureTextLayout(ctx, { ...node, text })
        : measureStoryText(node, text, (s) => ctx.measureText(s).width);
      const style = `${node.id}-review`,
        lines = original.lines.join("\n");
      const layout = shapeText(
        ctx,
        {
          ...node,
          textLayout: undefined,
          textBox: undefined,
          style,
          anchor: "top",
          textRole: node.textRole ?? "body",
        },
        lines,
        reviewFonts,
        {
          [style]: {
            fontAsset: node.fontAsset!,
            size: node.fontSize,
            leading: original.lineHeight / node.fontSize,
          },
        },
      );
      layout.text = text;
      states.set(text, {
        layout,
        canvas,
        left: layout.left,
        top: layout.top,
        colors: new Map(),
        strokes: new Map(),
        fonts: reviewFonts,
        variants: new Map(),
      });
    }
    nodes.set(node.id, states);
  }
  return {
    nodes,
    corrections: new Map(),
    pairs: new Map(),
    slideLimits: new Map(),
    scene,
    layer: canvas,
    maskLayer: canvas,
    transitionLayer: canvas,
  };
}
