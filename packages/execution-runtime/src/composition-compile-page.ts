import type {
  CommerceScene,
  StoryScene,
  Composition,
} from "@still-shift/scene-contract";
import {
  prepareCommerceComposition,
  prepareStoryComposition,
  passageDiagnostics,
  type PassageDiagnostic,
} from "@still-shift/renderer-core";

declare global {
  interface Window {
    compileStillShiftComposition?: (
      scene: CommerceScene | StoryScene,
      fontUrls: Record<string, string>,
    ) => Promise<
      | { composition: Composition; diagnostics?: never }
      | { composition?: never; diagnostics: PassageDiagnostic[] }
    >;
  }
}

window.compileStillShiftComposition = async (scene, fontUrls) => {
  try {
    return {
      composition:
        scene.schemaVersion === "commerce-scene-1"
          ? await prepareCommerceComposition(scene, (id) => fontUrls[id]!)
          : await prepareStoryComposition(scene, (id) => fontUrls[id]!),
    };
  } catch (error) {
    return { diagnostics: passageDiagnostics(error) };
  }
};
