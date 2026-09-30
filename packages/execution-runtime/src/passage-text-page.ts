import type { StoryScene } from "@still-shift/scene-contract";
import {
  loadPreparedFonts,
  prepareTypography,
  validateTypographySafeArea,
  loadTextAnimationFonts,
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
      options?: { validateSafeZones?: boolean },
    ) => Promise<PassageDiagnostic[]>;
  }
}

window.validateStillShiftPassageText = async (
  scene,
  fontUrls,
  options = {},
) => {
  try {
    const compiled = compileStoryScene(scene, options);
    const fonts = await loadPreparedFonts(compiled, (id) => fontUrls[id]!);
    if (compiled.typography) {
      await loadTextAnimationFonts(compiled, fonts);
      const prepared = prepareTypography(compiled, fonts);
      if (options.validateSafeZones !== false)
        validateTypographySafeArea(compiled, prepared);
      return [];
    }
    validateStoryTextLayout(compiled, fonts, options);
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
