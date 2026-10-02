import {
  PreparedNodeSchema,
  type CommerceScene,
} from "@still-shift/scene-contract";

/** Font-dependent bounds must be resolved before transforms and annotation anchors are baked. */
export function commerceLayoutVariants(id: string, source: CommerceScene) {
  if (id !== "commerce/atom-layout") return [];
  const transformed = structuredClone(source);
  const fit = transformed.textFits![0]!;
  const panel = transformed.nodes.find((node) => node.id === fit.panel)!;
  const text = transformed.nodes.find((node) => node.id === fit.target)!;
  panel.parent = text.parent = "layout-parent";
  panel.rotation = 9;
  panel.opacity = 0.65;
  text.rotation = -5;
  transformed.nodes.push(
    PreparedNodeSchema.parse({
      id: "layout-parent",
      type: "group",
      width: 1080,
      height: 1350,
      x: 17,
      y: -11,
      rotation: 7,
      opacity: 0.7,
    }),
  );
  transformed.events.push({
    node: panel.id,
    property: "y",
    start: 0,
    end: 239,
    to: panel.y + 70,
    easing: "linear",
  });
  transformed.nodes.push(
    PreparedNodeSchema.parse({
      id: "panel-leader",
      type: "path",
      points: [
        [0, 0],
        [1, 1],
      ],
      stroke: "#234567",
      lineWidth: 4,
    }),
  );
  transformed.componentData = {
    schemaVersion: "scene-components-1",
    values: [],
    bindings: [],
    annotations: [
      {
        path: "panel-leader",
        points: [
          { node: panel.id, point: [0, 0], space: "node", offset: [0, 0] },
          { node: panel.id, point: [200, 90], space: "node", offset: [2, -3] },
        ],
        protect: [],
      },
    ],
  };
  const states = structuredClone(source);
  const label = states.nodes.find((node) => node.id === fit.target)!;
  if (label.type !== "text") throw new Error("Expected fitted label");
  label.states = [
    "A clear detail",
    "A longer description of the supplied product",
  ];
  label.text = label.states[0]!;
  label.align = "center";
  return [
    { id: `${id}/transformed-annotation`, scene: transformed },
    { id: `${id}/multiple-states`, scene: states },
  ];
}
