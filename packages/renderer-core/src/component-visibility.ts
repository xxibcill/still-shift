import type { ComponentSceneData } from "../../scene-contract/src/component-data.ts";

export function componentVisible(
  scene: Pick<ComponentSceneData, "componentData">,
  target: string,
  frame: number,
) {
  if (scene.componentData?.schemaVersion !== "scene-components-3") return true;
  const gate = scene.componentData.visibility.find((g) => g.target === target);
  return !gate || (frame >= gate.window.start && frame < gate.window.end);
}
export function componentVisibilityCuts(
  scene: Pick<ComponentSceneData, "componentData">,
): number[] {
  return scene.componentData?.schemaVersion === "scene-components-3"
    ? scene.componentData.visibility.flatMap((g) => [
        g.window.start,
        g.window.end,
      ])
    : [];
}
