import type { CommerceScene, StoryScene } from "@still-shift/scene-contract";
import { componentCapabilities } from "../../component-capabilities.ts";
import type { LoadedFont } from "../../prepared-fonts.ts";
export type CompositionTextLayout = {
  context: CanvasRenderingContext2D;
  fonts: Map<string, LoadedFont>;
};
/** Geometry depends on measured fonts for fitted panels and shaped text fits. */
export function requiresCompositionTextLayout(
  scene: CommerceScene | StoryScene,
) {
  return (
    (scene.schemaVersion === "commerce-scene-1" &&
      scene.textFits?.some((fit) => fit.panel)) ||
    !!(
      scene.typography &&
      ((scene.schemaVersion === "commerce-scene-1" && scene.textFits?.length) ||
        componentCapabilities(scene.componentData).textFits.length)
    )
  );
}
