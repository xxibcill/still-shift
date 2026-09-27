import { PreparedNodeSchema } from "../../scene-contract/src/prepared.ts";
import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { LoadedFont } from "./prepared-fonts.ts";
import { prepareTextFits } from "./component-text-fit.ts";
import { buildTextBlock } from "./commerce-text.ts";
import type {
  ComponentBounds,
  CommerceFragment,
} from "./commerce-composition.ts";
export function buildFittedTextPanel(
  options: Parameters<typeof buildTextBlock>[0] & {
    minSize: number;
    maxSize: number;
    padding: number;
    fill: string;
  },
): CommerceFragment {
  const text = buildTextBlock(options),
    panelId = options.id + "-panel";
  return {
    ...text,
    nodes: [
      PreparedNodeSchema.parse({
        type: "rect",
        id: panelId,
        x: options.box.x - options.padding,
        y: options.box.y - options.padding,
        width: options.box.width + options.padding * 2,
        height: options.box.height + options.padding * 2,
        radius: 12,
        fill: options.fill,
      }),
      ...text.nodes!,
    ],
    textFits: [
      {
        target: options.id,
        panel: panelId,
        minSize: options.minSize,
        maxSize: options.maxSize,
        padding: options.padding,
      },
    ],
  };
}
export function stackBoxes(
  box: ComponentBounds,
  heights: number[],
  gap: number,
): ComponentBounds[] {
  if (
    ![box.x, box.y, box.width, box.height, gap, ...heights].every(
      Number.isFinite,
    ) ||
    box.width <= 0 ||
    box.height <= 0 ||
    gap < 0 ||
    heights.some((h) => h <= 0) ||
    heights.reduce((s, h) => s + h, 0) + Math.max(0, heights.length - 1) * gap >
      box.height
  )
    throw new Error("Stack does not fit available layout");
  let y = box.y;
  return heights.map((height) => {
    const result = { x: box.x, y, width: box.width, height };
    y += height + gap;
    return result;
  });
}
/** Resolve once after pinned fonts load; the input contract remains immutable for bundles. */
export function prepareCommerceTextFits(
  scene: CommerceRenderScene,
  ctx: CanvasRenderingContext2D,
  fonts: Map<string, LoadedFont>,
): CommerceRenderScene {
  return prepareTextFits(scene, scene.textFits ?? [], ctx, fonts);
}
