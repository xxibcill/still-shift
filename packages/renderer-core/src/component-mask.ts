import type { ComponentData } from "../../scene-contract/src/component-data.ts";
import { componentCapabilities } from "./component-capabilities.ts";

export type RootMask = { target: string; mask: string; invert: boolean };
export function componentMasks(scene: {
  componentData?: ComponentData | undefined;
}): RootMask[] {
  return componentCapabilities(scene.componentData).masks;
}
