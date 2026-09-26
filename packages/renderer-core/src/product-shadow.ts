import {
  PreparedNodeSchema,
  PreparedSceneFieldsSchema,
  type PreparedScene,
} from "../../scene-contract/src/prepared.ts";
import type { CommerceFragment } from "./commerce-composition.ts";

export function buildProductShadow(options: {
  id: string;
  texture: PreparedScene["assets"][number];
  center: [number, number];
  width: number;
  height: number;
  opacity: number;
}): CommerceFragment {
  const texture = PreparedSceneFieldsSchema.shape.assets.element.parse(
    options.texture,
  );
  // The texture has 10% transparent padding on every side.
  const width = options.width / 0.8,
    height = options.height / 0.8;
  const bounds = {
    x: options.center[0] - width / 2,
    y: options.center[1] - height / 2,
    width,
    height,
  };
  const node = PreparedNodeSchema.parse({
    type: "image",
    id: options.id,
    ...bounds,
    opacity: options.opacity,
    fit: "stretch",
    states: [{ asset: texture.id }],
  });
  return { nodes: [node], assets: [texture], events: [], bounds };
}
