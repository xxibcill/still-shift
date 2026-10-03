import {
  PreparedNodeSchema,
  type CommerceScene,
} from "@still-shift/scene-contract";

/** Exercise coordinate spaces and stroke styles beyond the unchanged CE0 fixtures. */
export function commerceGeometryVariants(id: string, source: CommerceScene) {
  if (id === "commerce/atom-attachment") {
    const scene = structuredClone(source);
    const art = scene.nodes.find((node) => node.id === "product-art")!;
    const path = scene.nodes.find((node) => node.id === "attached-line")!;
    if (art.type !== "image" || path.type !== "path")
      throw new Error("Expected attachment nodes");
    art.states[0]!.crop = [300, 0, 700, 600];
    scene.geometry![0]!.protectedRegions = [];
    scene.geometry![0]!.anchors.left = [420, 150];
    scene.attachments![0]!.offset = [7, -4];
    scene.attachments!.push({
      path: path.id,
      endpoint: "start",
      source: art.id,
      anchor: "left",
      offset: [-12, 9],
      protect: true,
    });
    Object.assign(path, {
      parent: "path-plane",
      x: 12,
      y: -8,
      width: 100,
      height: 80,
      rotation: -11,
      lineStyle: "brush",
      endArrow: true,
    });
    scene.nodes.push(
      PreparedNodeSchema.parse({
        id: "path-plane",
        type: "group",
        x: 35,
        y: 42,
        width: 400,
        height: 400,
        rotation: 21,
      }),
    );
    scene.events.push(
      {
        node: "product",
        property: "rotation",
        start: 0,
        end: 239,
        from: 8,
        to: 18,
        easing: "linear",
      },
      {
        node: "path-plane",
        property: "scaleX",
        start: 0,
        end: 180,
        from: 1,
        to: 1.1,
        easing: "smoothstep",
      },
      {
        node: path.id,
        property: "reveal",
        start: 0,
        end: 100,
        from: 0,
        to: 1,
        easing: "linear",
      },
    );
    return [{ id: `${id}/nested-crop-brush`, scene }];
  }
  if (id === "component/commerce-leader") {
    const scene = structuredClone(source);
    const art = scene.nodes.find((node) => node.id === "subject-art")!;
    const path = scene.nodes.find((node) => node.id === "annotation__line")!;
    if (art.type !== "image" || path.type !== "path")
      throw new Error("Expected annotation nodes");
    art.states[0]!.crop = [300, 0, 700, 600];
    scene.nodes.find((node) => node.id === "subject-a")!.rotation = 12;
    scene.componentData!.annotations[0]!.points[1] = {
      node: art.id,
      point: [561, 168.24],
      space: "source",
      offset: [9, 3],
    };
    Object.assign(path, {
      x: 13,
      y: -9,
      width: 300,
      height: 200,
      rotation: -6,
      lineStyle: "ink",
      endArrow: true,
    });
    return [{ id: `${id}/source-crop-ink`, scene }];
  }
  return [];
}
