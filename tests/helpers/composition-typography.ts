import {
  ComponentDataSchema,
  PreparedNodeSchema,
  type CommerceScene,
  type StoryScene,
} from "@still-shift/scene-contract";

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
