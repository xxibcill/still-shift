import type { StoryScene } from "@still-shift/scene-contract";
import {
  loadPreparedFonts,
  passageDiagnostics,
  type PassageDiagnostic,
  compileStoryScene,
  validateStoryTextLayout,
  prepareMeasuredText,
  prepareComponentTextFits,
} from "@still-shift/renderer-core";

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
    const context = document.createElement("canvas").getContext("2d")!;
    prepareMeasuredText(
      prepareComponentTextFits(compiled, context, fonts),
      context,
      fonts,
    );
    return [];
  } catch (error) {
    return passageDiagnostics(error);
  }
};
