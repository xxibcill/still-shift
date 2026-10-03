import {
  PreparedNodeSchema,
  ComponentDataSchema,
  type CommerceScene,
  type StoryScene,
} from "@still-shift/scene-contract";

export function motionPathVariants<T extends CommerceScene | StoryScene>(
  id: string,
  source: T,
): { id: string; scene: T }[] {
  if (!["commerce/atom-path", "component/story-leader"].includes(id)) return [];
  return ["spatial", "morph", "spatial-morph"].map((kind) => {
    const scene = structuredClone(source);
    scene.motionModel = "curves-1";
    const node = scene.nodes.find((node) => node.type === "path")!;
    if (node.type !== "path") throw new Error("Expected path");
    node.lineStyle =
      kind === "morph" ? "brush" : kind === "spatial-morph" ? "ink" : "uniform";
    node.lineWidth = 9;
    if (kind !== "morph")
      scene.spatialPaths = [
        {
          node: node.id,
          segments: [
            [
              [200, 450],
              [300, 100],
              [600, 950],
              [820, 490],
            ],
          ],
        },
      ];
    if (kind !== "spatial")
      scene.pathMorphs = [
        {
          node: node.id,
          keys: [
            {
              frame: 0,
              points: [
                [220, 780],
                [540, 780],
                [820, 490],
              ],
            },
            {
              frame: 75,
              points: [
                [240, 420],
                [640, 180],
                [860, 710],
              ],
              easing: "in-out-cubic",
            },
            {
              frame: 150,
              points: [
                [200, 580],
                [540, 330],
                [820, 490],
              ],
              easing: "out-cubic",
            },
          ],
        },
      ];
    scene.nodes.push(
      PreparedNodeSchema.parse({
        id: "follower",
        type: "rect",
        width: 40,
        height: 30,
        radius: 5,
        fill: "#ad523d",
      }),
    );
    scene.signals = [
      {
        id: "path-progress",
        keys: [
          { frame: 0, value: 0 },
          { frame: 170, value: 1 },
        ],
      },
    ];
    scene.constraints = [
      {
        type: "follow-path",
        target: "follower",
        path: node.id,
        progress: "path-progress",
        orient: "tangent",
      },
    ];
    if (scene.schemaVersion === "story-scene-1") {
      scene.flows = [
        {
          id: "moving-flow",
          path: node.id,
          direction: 1,
          count: 5,
          shape: "dot",
          size: 7,
          color: "#345d97",
          window: { start: 0, end: 180 },
          speed: [
            { frame: 0, pxPerFrame: 2 },
            { frame: 180, pxPerFrame: 4 },
          ],
        },
      ];
      if (kind === "spatial-morph") {
        node.opacity = 0;
        scene.nodes.push(
          PreparedNodeSchema.parse({
            id: "motion-matte",
            type: "rect",
            x: 400,
            y: 500,
            width: 300,
            height: 300,
            radius: 30,
            fill: "#ffffff",
          }),
        );
        scene.componentData = ComponentDataSchema.parse({
          ...scene.componentData,
          schemaVersion: "scene-components-3",
          masks: [{ target: node.id, mask: "motion-matte", invert: true }],
        });
      }
    }
    return { id: `${id}/${kind}`, scene };
  });
}
