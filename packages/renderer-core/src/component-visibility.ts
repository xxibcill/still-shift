import type { ComponentSceneData } from "../../scene-contract/src/component-data.ts";
import { componentCapabilities } from "./component-capabilities.ts";

export function componentVisible(
  scene: Pick<ComponentSceneData, "componentData">,
  target: string,
  frame: number,
) {
  if (!scene.componentData) return true;
  const gate = componentCapabilities(scene.componentData).visibility.find(
    (g) => g.target === target,
  );
  return !gate || (frame >= gate.window.start && frame < gate.window.end);
}
export function componentVisibilityCuts(
  scene: Pick<ComponentSceneData, "componentData">,
): number[] {
  return componentCapabilities(scene.componentData).visibility.flatMap((g) => [
    g.window.start,
    g.window.end,
  ]);
}
