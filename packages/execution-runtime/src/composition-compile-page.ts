import type { CommerceScene, Composition } from "@still-shift/scene-contract";
import {
  prepareCommerceComposition,
  passageDiagnostics,
  type PassageDiagnostic,
} from "@still-shift/renderer-core";

declare global {
  interface Window {
    compileStillShiftCommerce?: (
      scene: CommerceScene,
      fontUrls: Record<string, string>,
    ) => Promise<
      | { composition: Composition; diagnostics?: never }
      | { composition?: never; diagnostics: PassageDiagnostic[] }
    >;
  }
}

window.compileStillShiftCommerce = async (scene, fontUrls) => {
  try {
    return {
      composition: await prepareCommerceComposition(
        scene,
        (id) => fontUrls[id]!,
      ),
    };
  } catch (error) {
    return { diagnostics: passageDiagnostics(error) };
  }
};
