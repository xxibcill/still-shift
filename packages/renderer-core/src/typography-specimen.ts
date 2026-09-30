import {
  prepareTypeReview,
  prepareTypeReviewScene,
} from "./typography-review.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { LoadedFont } from "./prepared-fonts.ts";
import { prepareTypography, drawTypography } from "./typography-renderer.ts";
import { measureStoryText } from "./story-text-layout.ts";
import { measureTextLayout } from "./text-layout.ts";
import { resolvedTextStyle } from "./typography-style.ts";

export function renderTypeSpecimen(
  scene: StoryRenderScene | CommerceRenderScene,
  fonts: Map<string, LoadedFont>,
) {
  scene = prepareTypeReviewScene(scene, fonts);
  const prepared = scene.typography
    ? prepareTypography(scene, fonts)
    : undefined;
  const review = prepared ?? prepareTypeReview(scene, fonts);
  const rows = scene.nodes.flatMap((node) =>
    node.type === "text"
      ? (node.states ?? [node.text]).map((text, index) => ({
          node,
          text,
          index,
        }))
      : [],
  );
  const bounds = rows.map(({ node, text }) => {
    const layout = review.nodes.get(node.id)?.get(text)?.layout;
    const corrections = review.corrections.get(node.id) ?? [];
    return {
      left: Math.min(
        layout?.left ?? 0,
        ...corrections.map((c) => c.x + c.raster.layout.left),
      ),
      top: Math.min(
        layout?.top ?? 0,
        ...corrections.map((c) => c.y + c.raster.layout.top),
      ),
    };
  });
  const widths = rows.map(
    ({ node, text }) =>
      review.nodes.get(node.id)?.get(text)?.layout.width ??
      node.textLayout?.width ??
      node.width ??
      scene.width - 120,
  );
  const cellWidth = Math.min(
      1800,
      Math.max(800, ...widths.map((w) => w + 100)),
    ),
    padding = 32;
  const heights = rows.map(({ node, text }, i) =>
    Math.max(
      180,
      (review.nodes.get(node.id)?.get(text)?.layout.height ??
        node.textLayout?.height ??
        node.height ??
        node.fontSize * 2) +
        110 -
        Math.min(0, bounds[i]!.top),
    ),
  );
  const pages: HTMLCanvasElement[] = [];
  let canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    y = 0;
  const newPage = () => {
    canvas = document.createElement("canvas");
    canvas.width = cellWidth;
    canvas.height = Math.min(8192, 100 + heights.reduce((a, b) => a + b, 0));
    ctx = canvas.getContext("2d")!;
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#5d5b55";
    ctx.fillText(
      `${scene.title} · ${scene.width} × ${scene.height} · type specimen`,
      padding,
      36,
    );
    y = 66;
    pages.push(canvas);
  };
  newPage();
  rows.forEach(({ node, text, index }, row) => {
    const height = Math.min(heights[row]!, 8000);
    if (y + height > canvas.height) newPage();
    const style = resolvedTextStyle(node, scene.textStyles ?? {}),
      layout = review.nodes.get(node.id)?.get(text)?.layout;
    ctx.save();
    ctx.fillStyle = "#5d5b55";
    ctx.font = "15px sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      `${node.id} · ${node.textRole ?? "legacy role"} · ${node.style ?? node.fontAsset ?? node.font} · state ${index}`,
      padding,
      y + 18,
    );
    ctx.fillText(
      `${style.size} px · tracking ${layout?.tracking ?? "legacy"} · leading ${layout?.leading ?? node.textLayout?.lineHeight ?? node.textBox?.lineHeight ?? 1.2} · x-height ${layout ? layout.xHeight.toFixed(1) + " px" : "legacy"} · ${node.spans?.length ?? 0} spans · ${node.decorations?.length ?? 0} marks`,
      padding,
      y + 42,
    );
    const scale = Math.min(
      1,
      (cellWidth - padding * 2) / Math.max(1, widths[row]!),
    );
    ctx.translate(
      padding - bounds[row]!.left * scale,
      y + 70 - bounds[row]!.top * scale,
    );
    ctx.scale(scale, scale);
    if (prepared) {
      const specimenNode = {
        ...node,
        text,
        states: undefined,
        decorations: node.decorations?.map((d) => ({
          ...d,
          reveal: undefined,
        })),
        transitions: undefined,
        transition: undefined,
      };
      drawTypography(
        ctx,
        specimenNode,
        { state: 0, reveal: 1 },
        prepared,
        scene.frameCount - 1,
      );
    } else {
      const font = fonts.get(node.fontAsset ?? "");
      ctx.font = font
        ? `${font.weight} ${node.fontSize}px "${font.family}"`
        : `${node.weight} ${node.fontSize}px ${node.font}`;
      ctx.fillStyle = node.color;
      ctx.textAlign = "left";
      ctx.textBaseline = node.textBox ? "alphabetic" : "top";
      const legacy = node.textBox
        ? measureTextLayout(ctx, { ...node, text })
        : measureStoryText(node, text, (s) => ctx.measureText(s).width);
      legacy.lines.forEach((line, i) =>
        ctx.fillText(
          line,
          0,
          ("baseline" in legacy ? legacy.baseline : 0) + i * legacy.lineHeight,
        ),
      );
    }
    ctx.restore();
    y += height;
  });
  return pages;
}
