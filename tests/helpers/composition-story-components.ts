import {
  ComponentDataSchema,
  PreparedNodeSchema,
  type StoryScene,
} from "@still-shift/scene-contract";

/** Exercise component content under the story camera and shared root masks. */
export function storyComponentVariants(id: string, source: StoryScene) {
  if (id === "component/story-state") {
    const scene = structuredClone(source);
    scene.motionModel = "curves-1";
    const caption = scene.nodes.find(
      (node) => node.id === "behavior__caption",
    )!;
    if (caption.type !== "text") throw new Error("Expected component caption");
    caption.opacity = 0.65;
    caption.container = {
      kind: "thought",
      padding: 12,
      radius: 8,
      fill: "#dce1cf",
      stroke: "#234567",
      strokeWidth: 2,
    };
    const data = scene.componentData!;
    if (data.schemaVersion === "scene-components-1")
      throw new Error("Expected states");
    for (const schedule of data.states)
      for (const cut of schedule.cuts) cut.ramp = 3;
    return [{ id: `${id}/blended-container`, scene }];
  }
  if (id !== "component/story-leader") return [];
  return ["flow", "flow-target-matte", "flow-target-inverted"].map((kind) => {
    const scene = structuredClone(source);
    const path = scene.nodes.find((node) => node.id === "annotation__line")!;
    path.opacity = 0.65;
    scene.flows = [
      {
        id: "annotation-flow",
        path: path.id,
        direction: 1,
        count: 3,
        shape: "dot",
        size: 5,
        color: "#c44526",
        window: { start: 0, end: scene.frameCount - 1 },
        speed: [
          { frame: 0, pxPerFrame: 2 },
          { frame: scene.frameCount - 1, pxPerFrame: 4 },
        ],
      },
    ];
    const masks = [];
    if (kind !== "flow") {
      scene.nodes.push(
        PreparedNodeSchema.parse({
          id: "flow-matte",
          type: "rect",
          x: 300,
          y: 130,
          width: 900,
          height: 500,
          radius: 30,
          fill: "#ffffff",
          opacity: 0.6,
        }),
      );
      masks.push({
        target: path.id,
        mask: "flow-matte",
        invert: kind === "flow-target-inverted",
      });
    }
    if (kind === "flow-target-inverted") path.opacity = 0;
    scene.componentData = ComponentDataSchema.parse({
      ...scene.componentData,
      schemaVersion: "scene-components-3",
      masks,
      visibility: [
        {
          id: "flow-visibility",
          target: path.id,
          window: { start: 10, end: 150 },
        },
      ],
    });
    return { id: `${id}/${kind}`, scene };
  });
}
