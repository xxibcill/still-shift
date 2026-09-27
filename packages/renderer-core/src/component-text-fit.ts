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
export function prepareTextFits<T extends { nodes: PreparedNode[] }>(
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
    const font = fonts.get(node.fontAsset!);
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
        const layouts = (node.states ?? [node.text]).map((text) =>
          measureTextLayout(ctx, { ...node, fontSize: size, text }),
        );
        height = Math.max(
          ...layouts.map(
            (layout) =>
              layout.baseline +
              layout.descent +
              Math.max(0, layout.lines.length - 1) * layout.lineHeight,
          ),
        );
        node.fontSize = size;
        break;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !/^Text (overflows|does not fit)/.test(error.message)
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
