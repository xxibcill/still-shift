import {
  PreparedNodeSchema,
  type CommerceScene,
} from "@still-shift/scene-contract";

/** Check group flattening, shared alpha sources and visibility beyond the CE0 samples. */
export function commerceMaskVariants(id: string, source: CommerceScene) {
  if (id !== "commerce/atom-matte") return [];
  const inverted = structuredClone(source);
  inverted.mattes![0]!.invert = true;
  const product = inverted.nodes.find((node) => node.id === "product")!;
  product.opacity = 0.65;
  product.rotation = 13;
  if (product.type === "group") product.clip = true;
  inverted.nodes.find((node) => node.id === "alpha-mask")!.opacity = 0.6;
  const art = inverted.nodes.find((node) => node.id === "product-art")!;
  inverted.nodes.push({ ...art, id: "overlap", x: 35, opacity: 0.7 });

  const shared = structuredClone(source);
  const index = shared.nodes.findIndex((node) => node.id === "alpha-mask");
  const mask = shared.nodes[index]!;
  if (mask.type !== "image") throw new Error("Expected image matte");
  shared.nodes[index] = PreparedNodeSchema.parse({
    id: mask.id,
    x: mask.x,
    y: mask.y,
    width: mask.width,
    height: mask.height,
    origin: mask.origin,
    type: "group",
    rotation: 9,
    opacity: 0.55,
    clip: true,
  });
  shared.nodes.push({
    ...mask,
    id: "alpha-image",
    parent: mask.id,
    x: 0,
    y: 0,
  });
  shared.nodes.push({
    ...mask,
    id: "alpha-overlap",
    parent: mask.id,
    x: 75,
    y: 20,
    opacity: 0.5,
  });
  shared.visibility = [{ target: mask.id, start: 20, end: 200 }];
  const target = shared.nodes.find((node) => node.id === "product")!;
  const image = shared.nodes.find((node) => node.id === "product-art")!;
  shared.nodes.push({ ...target, id: "second", x: 60, opacity: 0.6 });
  shared.nodes.push({ ...image, id: "second-art", parent: "second" });
  shared.mattes!.push({
    ...shared.mattes![0]!,
    target: "second",
    invert: true,
  });
  return [
    { id: `${id}/inverted-overlap`, scene: inverted },
    { id: `${id}/shared-group-source`, scene: shared },
  ];
}
