import {
  createRenderCanvas,
  releaseRenderCanvas,
} from "./managed-memory-context.ts";
import type { TextStyle } from "../../scene-contract/src/typography.ts";
import { loadTextStyleFont, type LoadedFont } from "./prepared-fonts.ts";
import { shapeText, type ShapedLayout } from "./shaped-text.ts";
import {
  evaluateTextPoses,
  textAnimationFrames,
  type TextAnimationContext,
} from "./typography-animation.ts";
import {
  resolvedTextStyle,
  styleFontKey,
  type TextNode,
} from "./typography-style.ts";
import type { TextEventScene } from "./typography-events.ts";
import { typographyTextValues } from "./typography-text-values.ts";

export const axisKey = (axes: Record<string, number>) =>
  JSON.stringify(
    Object.entries(axes)
      .filter(([, v]) => Math.abs(v) > 1e-8)
      .sort()
      .map(([k, v]) => [k, Math.round(v * 1e6) / 1e6]),
  );
export function applyAxisDeltas(
  style: TextStyle,
  deltas: Record<string, number>,
  fonts: Map<string, LoadedFont>,
): TextStyle {
  const axes = { ...style.axes },
    ranges = fonts.get(style.fontAsset ?? "")?.metrics?.axes ?? {};
  for (const [axis, delta] of Object.entries(deltas)) {
    const range = ranges[axis];
    if (!range)
      throw new Error(`font-axis-range: ${style.fontAsset} has no ${axis}`);
    axes[axis] =
      Math.round(((axes[axis] ?? range.default) + delta) * 1e6) / 1e6;
    if (axes[axis]! < range.min || axes[axis]! > range.max)
      throw new Error(`font-axis-range: animated ${axis}=${axes[axis]}`);
  }
  return { ...style, axes };
}
export function nodeAxisVariants(
  scene: TextEventScene & TextAnimationContext,
  node: TextNode,
  layouts: ShapedLayout[],
  fonts: Map<string, LoadedFont>,
) {
  const animators =
    scene.textAnimators?.filter((a) => a.node === node.id) ?? [];
  const variants = new Map<string, Record<string, number>>();
  if (!animators.some((a) => a.from.axes || a.to?.axes)) return variants;
  for (const layout of layouts)
    for (const frame of textAnimationFrames(scene, node)) {
      for (const [i, pose] of evaluateTextPoses(
        node,
        layout,
        animators,
        frame,
        scene,
      ).entries()) {
        const key = axisKey(pose.axes);
        if (key !== "[]") {
          applyAxisDeltas(
            layout.runs[layout.clusters[i]!.runIndex]!.style,
            pose.axes,
            fonts,
          );
          variants.set(key, pose.axes);
        }
      }
      if (variants.size > 2048)
        throw new Error(
          "text-axis-budget: more than 2048 axis combinations; reduce stagger or duration",
        );
    }
  return variants;
}
export async function loadTextAnimationFonts(
  scene: TextEventScene & TextAnimationContext,
  fonts: Map<string, LoadedFont>,
) {
  if (!scene.typography) return;
  const canvas = createRenderCanvas();
  try {
    const ctx = canvas.getContext("2d")!;
    for (const node of scene.nodes) {
      if (
        node.type !== "text" ||
        !scene.textAnimators?.some(
          (a) => a.node === node.id && (a.from.axes || a.to?.axes),
        )
      )
        continue;
      const layouts = [...typographyTextValues(scene, node)].map((text) =>
        shapeText(ctx, node, text, fonts, scene.textStyles),
      );
      const variants = nodeAxisVariants(scene, node, layouts, fonts);
      const styles = new Map<string, TextStyle>();
      for (const deltas of variants.values())
        for (const span of [undefined, ...(node.spans ?? [])]) {
          const style = supportedAxisStyle(
            resolvedTextStyle(node, scene.textStyles ?? {}, span?.style),
            deltas,
            fonts,
          );
          styles.set(styleFontKey(style), style);
        }
      for (const style of styles.values())
        await loadTextStyleFont(style, fonts);
    }
  } finally {
    releaseRenderCanvas(canvas);
  }
}
// An axis variant includes other runs for consistent shaping; only selected clusters are painted
// from it. A neighboring static font need not support the selected span's variable axes.
function supportedAxisStyle(
  style: TextStyle,
  axes: Record<string, number>,
  fonts: Map<string, LoadedFont>,
) {
  const ranges = fonts.get(style.fontAsset ?? "")?.metrics?.axes ?? {};
  return Object.keys(axes).every((axis) => ranges[axis])
    ? applyAxisDeltas(style, axes, fonts)
    : style;
}
export function axisLayout(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  text: string,
  styles: Record<string, TextStyle>,
  fonts: Map<string, LoadedFont>,
  axes: Record<string, number>,
) {
  const base = `${node.id}-axis-base`,
    varied: Record<string, TextStyle> = {
      ...styles,
      [base]: supportedAxisStyle(resolvedTextStyle(node, styles), axes, fonts),
    };
  const spans = node.spans?.map((span, i) => {
    const id = `${node.id}-axis-span-${i}`;
    varied[id] = supportedAxisStyle(
      resolvedTextStyle(node, styles, span.style),
      axes,
      fonts,
    );
    return { ...span, style: id };
  });
  return shapeText(
    ctx,
    { ...node, style: base, ...(spans ? { spans } : {}) },
    text,
    fonts,
    varied,
  );
}
