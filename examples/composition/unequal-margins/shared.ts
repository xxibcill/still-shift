import { layer } from "@still-shift/motion";
import { imageAsset, fontAsset } from "@still-shift/motion/node";
import { fileURLToPath } from "node:url";
import {
  PreparedNodeSchema,
  easeMotion,
  type PreparedNode,
  type CompositionLayer,
} from "@still-shift/scene-contract";
export type IllustrationNode = PreparedNode;
export function illustrationArt(data: {
  nodes: unknown[];
  images: { id: string; file: string }[];
  fonts: { id: string; file: string; weight: string }[];
}) {
  return {
    ...data,
    nodes: data.nodes.map((node) => PreparedNodeSchema.parse(node)),
  };
}
export async function illustrationAssets(
  art: ReturnType<typeof illustrationArt>,
  root: URL,
) {
  return Promise.all([
    ...art.images.map((a) =>
      imageAsset(a.id, fileURLToPath(new URL("art/" + a.file, root))),
    ),
    ...art.fonts.map((a) =>
      fontAsset(a.id, fileURLToPath(new URL("fonts/" + a.file, root)), {
        weight: a.weight,
      }),
    ),
  ]);
}
const curves = {
  cubic: "out-cubic",
  quint: "out-quint",
  expo: "out-expo",
  back: "out-back-soft",
  inQuad: "in-quad",
  sine: "in-out-sine",
  inOutQuint: "in-out-quint",
  linear: "linear",
} as const;
export const ramp = (
  frame: number,
  start: number,
  end: number,
  from: number,
  to: number,
  easing: keyof typeof curves = "cubic",
) =>
  from +
  (to - from) * easeMotion((frame - start) / (end - start), curves[easing]);
export function contentParams(
  value: unknown,
): Extract<CompositionLayer, { type: "provider" }>["params"] {
  return JSON.parse(JSON.stringify(value));
}
/** Static geometry conversion only; choreography stays in program.ts. */
export function illustration(
  node: PreparedNode,
  samples: Record<string, number>[],
  depth: number,
) {
  const anchor: [number, number] = [
    node.width * node.origin[0],
    node.height * node.origin[1],
  ];
  const common = {
    id: node.id,
    ...(node.parent ? { parent: node.parent } : { cameraDepth: depth }),
    transform: {
      anchor,
      position: [node.x + anchor[0], node.y + anchor[1]] as [number, number],
    },
  };
  if (node.type === "image")
    return layer<"image" | "group" | "provider">({
      ...common,
      type: "image",
      size: [node.width, node.height],
      sources: node.states,
      fit: node.fit,
      state: 0,
      rasterize: "natural-size",
    });
  if (node.type === "group")
    return layer<"image" | "group" | "provider">({
      ...common,
      type: "group",
      size: [node.width, node.height],
      clip: node.clip,
    });
  if (node.type === "rect")
    throw new Error(
      "The illustration helper accepts image, group, path and text geometry",
    );
  if (node.type === "text" && !node.fontAsset)
    throw new Error("Pin the illustration's text font");
  return layer<"image" | "group" | "provider">({
    ...common,
    type: "provider",
    provider: `story.${node.type}@1.0.0`,
    params: contentParams({ node, samples }),
    ...(node.type === "text"
      ? { assets: [node.fontAsset!], usesSystemFonts: false }
      : {}),
  });
}
