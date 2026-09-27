import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { ComponentData } from "../../scene-contract/src/component-data.ts";

export type RootMask = { target: string; mask: string; invert: boolean };
export type RootPaint = (
  ctx: CanvasRenderingContext2D,
  node: PreparedNode,
  frame: number,
) => void;
export function componentMasks(scene: {
  componentData?: ComponentData | undefined;
}): RootMask[] {
  return scene.componentData?.schemaVersion === "scene-components-3"
    ? scene.componentData.masks
    : [];
}
export function compositeRootMask(
  layer: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
  invert: boolean,
) {
  layer.save();
  layer.globalCompositeOperation = invert
    ? "destination-out"
    : "destination-in";
  layer.drawImage(mask, 0, 0);
  layer.restore();
}
/** Two reusable surfaces, regardless of how many roots share a raw alpha source. */
export function createComponentMaskRenderer(
  scene: {
    width: number;
    height: number;
    nodes: PreparedNode[];
    componentData?: ComponentData | undefined;
  },
  paint: RootPaint,
) {
  const masks = componentMasks(scene),
    sources = new Set(masks.map((m) => m.mask));
  const surface = () => {
    const canvas = document.createElement("canvas");
    canvas.width = scene.width;
    canvas.height = scene.height;
    const ctx = canvas.getContext("2d")!;
    return { canvas, ctx };
  };
  const layer = surface(),
    mask = surface();
  return {
    paint(ctx: CanvasRenderingContext2D, node: PreparedNode, frame: number) {
      if (sources.has(node.id)) return;
      const matte = masks.find((m) => m.target === node.id);
      if (!matte) {
        paint(ctx, node, frame);
        return;
      }
      layer.ctx.clearRect(0, 0, scene.width, scene.height);
      mask.ctx.clearRect(0, 0, scene.width, scene.height);
      paint(layer.ctx, node, frame);
      paint(mask.ctx, scene.nodes.find((n) => n.id === matte.mask)!, frame);
      compositeRootMask(layer.ctx, mask.canvas, matte.invert);
      ctx.drawImage(layer.canvas, 0, 0);
    },
    dispose() {
      layer.canvas.width = mask.canvas.width = 0;
    },
  };
}
