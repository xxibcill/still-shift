import {
  ComponentDataSchema,
  PreparedNodeSchema,
  type CommerceScene,
  type StoryScene,
} from "@still-shift/scene-contract";

export function primitiveBlurVariants<T extends CommerceScene | StoryScene>(
  id: string,
  source: T,
): { id: string; scene: T }[] {
  if (
    ![
      "component/commerce-state",
      "component/story-state",
      "commerce/atom-path",
      "typography/editorial",
    ].includes(id)
  )
    return [];
  const scene = structuredClone(source);
  scene.motionModel = "curves-1";
  scene.signals = [
    ...(scene.signals ?? []),
    {
      id: "primitiveBlur",
      keys: [
        { frame: 0, value: 0 },
        { frame: 40, value: 4 },
        { frame: 80, value: 0 },
        { frame: 120, value: 6 },
      ],
    },
  ];
  scene.drivers = [...(scene.drivers ?? [])];
  if (!id.startsWith("component/")) {
    const target = scene.nodes.find(
      (node) => node.type === (id === "commerce/atom-path" ? "path" : "text"),
    )!;
    scene.drivers.push({
      target: `${target.id}.blur`,
      signal: "primitiveBlur",
    });
    return (
      target.type === "path"
        ? (["uniform", "ink", "brush"] as const)
        : (["text"] as const)
    ).map((style) => {
      const result = structuredClone(scene);
      const node = result.nodes.find((node) => node.id === target.id)!;
      if (node.type === "path" && style !== "text") node.lineStyle = style;
      return { id: `${id}/primitive-blur-${style}`, scene: result };
    });
  }
  const group = scene.nodes.find((node) => node.id === "behavior__detail")!;
  if (group.type !== "group") throw new Error("Expected group");
  group.clip = true;
  group.opacity = 0.65;
  group.rotation = 7;
  const caption = scene.nodes.find((node) => node.id === "behavior__caption")!;
  if (caption.type !== "text") throw new Error("Expected caption");
  caption.opacity = 0.65;
  caption.container = {
    kind: "thought",
    padding: 12,
    radius: 8,
    fill: "#dce1cf",
    stroke: "#234567",
    strokeWidth: 2,
  };
  for (const node of [
    group,
    caption,
    scene.nodes.find((node) => node.id === "behavior__route")!,
  ])
    scene.drivers.push({ target: `${node.id}.blur`, signal: "primitiveBlur" });
  scene.signals.push({
    id: "childBlur",
    keys: [
      { frame: 0, value: 0 },
      { frame: 40, value: 0 },
      { frame: 60, value: 2 },
      { frame: 84, value: 0 },
    ],
  });
  scene.drivers.push({ target: "behavior__inset.blur", signal: "childBlur" });
  if (scene.componentData?.schemaVersion !== "scene-components-1")
    for (const state of scene.componentData!.states)
      for (const cut of state.cuts) cut.ramp = 3;
  const masked = structuredClone(scene);
  masked.nodes.push(
    PreparedNodeSchema.parse({
      id: "blurMask",
      type: "rect",
      x: group.x + 80,
      y: group.y,
      width: group.width / 2,
      height: group.height,
      fill: "#ffffff",
      opacity: 0.7,
      radius: 15,
    }),
  );
  masked.componentData = ComponentDataSchema.parse({
    ...masked.componentData,
    schemaVersion: "scene-components-3",
    masks: [{ target: group.id, mask: "blurMask", invert: true }],
  });
  const stacked = structuredClone(masked);
  stacked.effects = [
    {
      type: "focus-blur",
      target: group.id,
      start: 0,
      end: 150,
      radius: 2,
      endRadius: 0,
    },
  ];
  if (stacked.schemaVersion === "story-scene-1")
    stacked.effectsVersion = "effects-1";
  return [
    { id: `${id}/primitive-blur`, scene },
    { id: `${id}/primitive-blur-matte`, scene: masked },
    { id: `${id}/primitive-blur-stack`, scene: stacked },
  ];
}
