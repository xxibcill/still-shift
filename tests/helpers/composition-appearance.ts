import {
  type CommerceScene,
  type StoryScene,
} from "@still-shift/scene-contract";

export function appearanceVariants<T extends CommerceScene | StoryScene>(
  id: string,
  source: T,
): { id: string; scene: T }[] {
  const selected = [
    "commerce/atom-path",
    "commerce/atom-panel",
    "component/story-leader",
    "component/story-state",
    "typography/editorial",
  ];
  if (!selected.includes(id)) return [];
  const styles =
    id === "commerce/atom-path"
      ? (["uniform", "ink", "brush"] as const)
      : (["uniform"] as const);
  return styles.map((style) => {
    const scene = structuredClone(source);
    scene.motionModel = "curves-1";
    const path = scene.nodes.find((node) => node.type === "path");
    const rect = scene.nodes.find((node) => node.type === "rect");
    const text = scene.nodes.find(
      (node) =>
        node.type === "text" &&
        (id !== "component/story-state" || node.id === "behavior__caption"),
    );
    scene.signals = [
      ...(scene.signals ?? []),
      {
        id: "appearance",
        keys: [
          { frame: 0, value: 0 },
          { frame: 100, value: 1 },
        ],
      },
    ];
    scene.drivers = [...(scene.drivers ?? [])];
    if (path?.type === "path") {
      path.lineStyle = style;
      scene.drivers.push(
        {
          target: `${path.id}.strokeWidth`,
          signal: "appearance",
          map: { scale: 14, offset: 2 },
        },
        {
          target: `${path.id}.trimStart`,
          signal: "appearance",
          map: { scale: 0.2 },
        },
        {
          target: `${path.id}.trimEnd`,
          signal: "appearance",
          map: { scale: 0.35, offset: 0.65 },
        },
        {
          target: `${path.id}.trimOffset`,
          signal: "appearance",
          map: { scale: 1.3, offset: -0.4 },
        },
      );
    }
    if (rect?.type === "rect") {
      rect.stroke = "#73472a";
      rect.lineWidth = 2;
      scene.drivers.push({
        target: `${rect.id}.strokeWidth`,
        signal: "appearance",
        map: { scale: 8, offset: 2 },
      });
    }
    if (scene.schemaVersion === "story-scene-1") {
      if (path)
        scene.recipe.moves.push({
          node: path.id,
          window: { start: 10, end: 100, easing: "in-out-cubic" },
          to: { stroke: "#b73963" },
        });
      if (rect)
        scene.recipe.moves.push({
          node: rect.id,
          window: { start: 10, end: 100, easing: "in-out-cubic" },
          to: { fill: "#345abc", stroke: "#eadaca" },
        });
      if (text)
        scene.recipe.moves.push({
          node: text.id,
          keys: [
            { frame: 0, color: "#233b32" },
            { frame: 90, color: "#cb4437", easing: "in-out-cubic" },
            { frame: 140, color: "#334499" },
          ],
        });
      if (
        id === "component/story-state" &&
        scene.componentData &&
        scene.componentData.schemaVersion !== "scene-components-1"
      )
        for (const state of scene.componentData.states)
          for (const cut of state.cuts) cut.ramp = 3;
    }
    return { id: `${id}/appearance-${style}`, scene };
  });
}
