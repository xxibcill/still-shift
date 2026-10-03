import {
  ComponentDataSchema,
  PreparedNodeSchema,
  type CommerceScene,
  type StoryScene,
} from "@still-shift/scene-contract";

export function numericTypographyVariants(source: CommerceScene | StoryScene) {
  const scene = structuredClone(source);
  const id =
    scene.schemaVersion === "commerce-scene-1"
      ? "headline-0"
      : scene.title === "Rich editorial type"
        ? "rag"
        : scene.nodes.some((n) => n.id === "thai")
          ? "thai"
          : undefined;
  if (!id) return [];
  const node = scene.nodes.find((node) => node.id === id)!;
  if (node.type !== "text") throw new Error("Expected numeric text");
  delete node.textLayout;
  node.fontAsset = node.fontAsset ?? scene.textStyles?.[node.style!]?.fontAsset;
  node.text = "0";
  node.width = 850;
  node.height = 200;
  node.textBox = { locale: "en", maxLines: 2, lineHeight: 1.4 };
  node.container = {
    kind: "caption",
    padding: 12,
    radius: 9,
    fill: "#dad4bf",
    stroke: "#453f2b",
    strokeWidth: 0,
  };
  scene.componentData = ComponentDataSchema.parse({
    schemaVersion: "scene-components-1",
    values: [
      {
        id: "amount",
        range: [-2, 3],
        from: id === "thai" ? 1 : -1.2,
        to: id === "thai" ? 1.2 : 2.3,
        window: { start: 0, end: 90, easing: "in-out-cubic" },
      },
    ],
    bindings: [
      {
        kind: "text",
        target: id,
        value: "amount",
        format: {
          decimals: 1,
          prefix: "Total ",
          suffix: " kg",
          decimalSeparator: ",",
        },
      },
    ],
  });
  if (id !== "thai")
    scene.textAnimators = [
      ...(scene.textAnimators ?? []),
      {
        node: id,
        unit: "glyph",
        start: 0,
        end: 60,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: { strokeWidth: 0, offset: [0, 16] },
        to: { strokeWidth: 1 },
      },
    ];
  return [{ id: "numeric", scene }];
}

/** Combine shaped text with the layout and compositing features used by components. */
export function typographyVariants(source: CommerceScene | StoryScene) {
  if (source.schemaVersion === "commerce-scene-1") {
    return ["native-fit", "panel-fit", "component-fit"].map((kind) => {
      const scene = structuredClone(source);
      const label = scene.nodes.find((node) => node.id === "headline-0")!;
      if (label.type !== "text") throw new Error("Expected headline");
      label.width = 620;
      label.height = 220;
      label.container = {
        kind: "speech",
        padding: 16,
        radius: 12,
        fill: "#e2d9bf",
        stroke: "#243e35",
        strokeWidth: 2,
      };
      const fit = { target: label.id, minSize: 30, maxSize: 110 };
      if (kind === "component-fit")
        scene.componentData = ComponentDataSchema.parse({
          schemaVersion: "scene-components-3",
          textFits: [fit],
        });
      else {
        scene.textFits = [{ ...fit, padding: 0 }];
        if (kind === "panel-fit") {
          scene.nodes.unshift(
            PreparedNodeSchema.parse({
              id: "backing",
              type: "rect",
              width: 10,
              height: 10,
              fill: "#afbf9e",
              radius: 10,
              rotation: 4,
            }),
          );
          Object.assign(scene.textFits[0]!, { panel: "backing", padding: 30 });
        }
      }
      return { id: kind, scene };
    });
  }
  if (source.title !== "Rich editorial type") return [];
  const container = structuredClone(source);
  for (const node of container.nodes) {
    if (node.type !== "text") continue;
    node.container = {
      kind: node.id === "headline" ? "thought" : "caption",
      padding: 12,
      radius: 8,
      fill: "#ded8bd",
      stroke: "#453f2b",
      strokeWidth: 2,
    };
    node.opacity = 0.7;
  }
  const fitted = structuredClone(source);
  const label = fitted.nodes.find((node) => node.id === "rag")!;
  if (label.type !== "text") throw new Error("Expected prose");
  delete label.textLayout;
  label.fontAsset = "body";
  label.width = 360;
  label.height = 170;
  label.textBox = { locale: "en", maxLines: 2, lineHeight: 1.4 };
  fitted.componentData = ComponentDataSchema.parse({
    schemaVersion: "scene-components-3",
    textFits: [{ target: label.id, minSize: 20, maxSize: 90 }],
  });
  return [
    { id: "containers", scene: container },
    { id: "component-fit", scene: fitted },
  ];
}
