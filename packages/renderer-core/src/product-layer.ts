import {
  PreparedNodeSchema,
  PreparedSceneFieldsSchema,
  type PreparedScene,
} from "../../scene-contract/src/prepared.ts";
import type {
  CommerceFragment,
  ComponentBounds,
} from "./commerce-composition.ts";

export type ProductLayerOptions = {
  id: string;
  product: PreparedScene["assets"][number];
  x: number;
  y: number;
  width: number;
  pivot?: [number, number];
};

/** Reference one intact image at its original aspect ratio, without owning a clock. */
export function buildProductLayer(
  options: ProductLayerOptions,
): CommerceFragment & {
  target: string;
  bounds: ComponentBounds;
  nodes: PreparedScene["nodes"];
  assets: PreparedScene["assets"];
} {
  const product = PreparedSceneFieldsSchema.shape.assets.element.parse(
    options.product,
  );
  const bounds = {
    x: options.x,
    y: options.y,
    width: options.width,
    height: (options.width * product.height) / product.width,
  };
  const nodes = [
    {
      type: "group",
      id: options.id,
      ...bounds,
      ...(options.pivot ? { origin: options.pivot } : {}),
    },
    {
      type: "image",
      id: `${options.id}-art`,
      parent: options.id,
      width: bounds.width,
      height: bounds.height,
      states: [{ asset: product.id }],
    },
  ].map((node) => PreparedNodeSchema.parse(node));
  return { target: options.id, bounds, nodes, assets: [product], events: [] };
}
