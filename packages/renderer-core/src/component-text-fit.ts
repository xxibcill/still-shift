import { shapeText } from "./shaped-text.ts";
import type { TextStyle } from "../../scene-contract/src/typography.ts";
import { resolvedTextStyle } from "./typography-style.ts";
import { PassageError } from "./passage-diagnostics.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { ComponentData } from "../../scene-contract/src/component-data.ts";
import type { LoadedFont } from "./prepared-fonts.ts";
import { measureTextLayout } from "./text-layout.ts";
import { componentCapabilities } from "./component-capabilities.ts";

type Fit = {
  target: string;
  minSize: number;
  maxSize: number;
  panel?: string | undefined;
  padding?: number | undefined;
};
/** Font metrics and all supplied states decide one stable size, on a prepared copy. */
export function prepareTextFits<
  T extends {
    nodes: PreparedNode[];
    typography?: "type-1" | undefined;
    textStyles?: Record<string, TextStyle> | undefined;
  },
>(
  scene: T,
  fits: Fit[],
  ctx: CanvasRenderingContext2D,
  fonts: Map<string, LoadedFont>,
): T {
  if (!fits.length) return scene;
  const nodes = scene.nodes.map((node) => ({ ...node }));
  for (const fit of fits) {
    const node = nodes.find((n) => n.id === fit.target);
    if (node?.type !== "text")
      throw new Error("Text fit requires a text target: " + fit.target);
    const style = scene.typography
      ? resolvedTextStyle(node, scene.textStyles ?? {})
      : undefined;
    const font = fonts.get(style?.fontAsset ?? node.fontAsset!);
    if (!font)
      throw new Error(
        "Text fitting requires loaded pinned font " + node.fontAsset,
      );
    let height: number | undefined;
    for (let size = fit.maxSize; size >= fit.minSize; size--) {
      ctx.font = `${font.weight} ${size}px "${font.family}"`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      try {
        const fittedStyles = { ...scene.textStyles };
        if (node.style && style) fittedStyles[node.style] = { ...style, size };
        const heights = (node.states ?? [node.text]).map((text) => {
          if (!scene.typography) {
            const layout = measureTextLayout(ctx, {
              ...node,
              fontSize: size,
              text,
            });
            return (
              layout.baseline +
              layout.descent +
              Math.max(0, layout.lines.length - 1) * layout.lineHeight
            );
          }
          return shapeText(
            ctx,
            { ...node, fontSize: size },
            text,
            fonts,
            fittedStyles,
          ).height;
        });
        height = Math.max(...heights);
        node.fontSize = size;
        if (scene.typography && style) {
          // A fitted node gets its own style so siblings sharing the role keep their size.
          const id = `${node.id}-fitted`;
          scene = {
            ...scene,
            textStyles: { ...scene.textStyles, [id]: { ...style, size } },
          };
          node.style = id;
        }
        break;
      } catch (error) {
        const layoutOverflow =
          error instanceof PassageError &&
          error.diagnostics.every(
            (diagnostic) => diagnostic.code === "text-overflow",
          );
        if (
          !layoutOverflow &&
          (!(error instanceof Error) ||
            !/^Text (overflows|does not fit)/.test(error.message))
        )
          throw error;
      }
    }
    if (height === undefined)
      throw new Error("Text cannot fit at minimum size: " + node.id);
    if (fit.panel) {
      const panel = nodes.find((n) => n.id === fit.panel)!;
      const padding = fit.padding ?? 0;
      Object.assign(panel, {
        x: node.x - padding,
        y: node.y - padding,
        width: node.width + padding * 2,
        height: height + padding * 2,
      });
    }
  }
  return { ...scene, nodes };
}
export function prepareComponentTextFits<
  T extends {
    nodes: PreparedNode[];
    typography?: "type-1" | undefined;
    textStyles?: Record<string, TextStyle> | undefined;
    componentData?: ComponentData | undefined;
  },
>(scene: T, ctx: CanvasRenderingContext2D, fonts: Map<string, LoadedFont>): T {
  return prepareTextFits(
    scene,
    componentCapabilities(scene.componentData).textFits,
    ctx,
    fonts,
  );
}
