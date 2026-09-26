import type { StoryScene } from "../../../packages/scene-contract/src/story.ts";
import { loadPreparedFonts } from "../../../packages/renderer-core/src/prepared-fonts.ts";
import {
  passageDiagnostics,
  type PassageDiagnostic,
} from "../../../packages/renderer-core/src/passage-diagnostics.ts";
import { compileStoryScene } from "../../../packages/renderer-core/src/story-scene.ts";
import { validateStoryTextLayout } from "../../../packages/renderer-core/src/story-text-layout.ts";

declare global {
  interface Window {
    validateStillShiftPassageText?: (
      scene: StoryScene,
      fontUrls: Record<string, string>,
    ) => Promise<PassageDiagnostic[]>;
  }
}

window.validateStillShiftPassageText = async (scene, fontUrls) => {
  try {
    const compiled = compileStoryScene(scene);
    const fonts = await loadPreparedFonts(compiled, (id) => fontUrls[id]!);
    validateStoryTextLayout(compiled, fonts);
    return [];
  } catch (error) {
    return passageDiagnostics(error);
  }
};
