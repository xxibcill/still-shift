import {
  CommerceSceneSchema,
  PreparedNodeSchema,
  type CommerceScene,
} from "@still-shift/scene-contract";

/** Portrait repair changes layout only; the source product and named cap target stay pinned. */
export function mechanismPortraitProof(
  source: CommerceScene,
  corrected = true,
): CommerceScene {
  const input = structuredClone(source);
  input.width = 1080;
  input.height = 1920;
  input.frameCount = 61;
  input.typography = "type-1";
  input.motionModel = "curves-1";
  input.metadata.profile = "portrait";
  input.events = [
    {
      node: "product",
      property: "y",
      start: 0,
      end: 30,
      to: 310,
      easing: "smoothstep",
    },
    {
      node: "product",
      property: "y",
      start: 30,
      end: 60,
      to: 300,
      easing: "smoothstep",
    },
  ];
  const product = input.nodes.find((node) => node.id === "product")!;
  Object.assign(product, {
    parent: "model-plane",
    x: 510,
    y: 300,
    rotation: 12,
  });
  const image = input.nodes.find((node) => node.id === "product-art")!;
  if (image.type !== "image")
    throw new Error("Portrait proof needs the pinned product image");
  image.states[0]!.crop = [200, 0, 850, 1250];
  const label = input.nodes.find((node) => node.id === "feature")!;
  Object.assign(label, {
    x: corrected ? 72 : -320,
    y: 280,
    text: "Attached\ncap",
    textRole: "label",
  });
  const path = input.nodes.find((node) => node.id === "attached-line")!;
  Object.assign(path, { x: 12, y: -8, width: 100, height: 80, rotation: -11 });
  input.nodes.push(
    PreparedNodeSchema.parse({
      id: "model-plane",
      type: "group",
      x: 0,
      y: 0,
      width: 1080,
      height: 1920,
      rotation: 4,
    }),
  );
  input.attachments = [];
  const target = input.geometry![0]!.anchors.cap!;
  input.componentData = {
    schemaVersion: "scene-components-1",
    values: [],
    bindings: [],
    annotations: [
      {
        path: path.id,
        points: [
          { node: label.id, point: [230, 35], space: "node", offset: [0, 0] },
          {
            node: image.id,
            point: [...target],
            space: "source",
            offset: [0, 0],
          },
        ],
        protect: [image.id],
      },
    ],
  };
  return CommerceSceneSchema.parse(input);
}
