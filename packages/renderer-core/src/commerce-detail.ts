import type { PreparedCommerceAssets } from "../../scene-contract/src/commerce.ts";
import {
  PreparedNodeSchema,
  PreparedSceneFieldsSchema,
} from "../../scene-contract/src/prepared.ts";
import type {
  ComponentBounds,
  CommerceFragment,
} from "./commerce-composition.ts";
export function buildDetailWindow(options: {
  id: string;
  product: PreparedCommerceAssets["product"];
  crop: [number, number, number, number];
  box: ComponentBounds;
  maxUpscale?: number;
}): CommerceFragment {
  const product = PreparedSceneFieldsSchema.shape.assets.element.parse(
    options.product,
  );
  const [x, y, w, h] = options.crop,
    { box } = options;
  if (
    ![x, y, w, h, box.width, box.height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    w <= 0 ||
    h <= 0 ||
    x + w > product.width ||
    y + h > product.height
  )
    throw new Error("Detail crop must fit source bounds");
  const ratio = Math.min(box.width / w, box.height / h),
    limit = options.maxUpscale ?? 1;
  if (!Number.isFinite(limit) || limit <= 0 || ratio > limit)
    throw new Error(
      "Detail exceeds approved source resolution; use a larger original or smaller window",
    );
  const node = PreparedNodeSchema.parse({
    type: "image",
    id: options.id,
    ...box,
    fit: "contain",
    states: [{ asset: product.id, crop: options.crop }],
  });
  return { nodes: [node], assets: [product], bounds: box };
}
