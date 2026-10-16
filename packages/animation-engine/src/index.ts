export type { AnimationEngine } from "./animation-engine.ts";
export {
  compileCommerceComposition,
  compileStoryComposition,
} from "./composition-compile.ts";
export {
  PreparedAnimationEngine,
  loadPreparedScene,
} from "./prepared-animation-engine.ts";
export { NoopAnimationEngine } from "./noop-animation-engine.ts";
export { WebGLAnimationEngine } from "./webgl-animation-engine.ts";
export {
  loadComposition,
  renderComposition,
  type CompositionRenderResult,
  type LoadedComposition,
} from "./composition-render.ts";

export {
  readStoryPassage,
  prepareStoryPassageInput,
  writePreparedPassage,
  type PreparedPassage,
} from "./story-passage-io.ts";
export {
  renderStoryPassage,
  verifyPassageNarration,
  type PassageRenderOptions,
} from "./story-passage-render.ts";
export { writeStoryWorkspace } from "./story-workspace.ts";
export { generateSfx, type GeneratedSfx } from "./sfx-generation.ts";
export { SfxGenerationError } from "./elevenlabs-sfx.ts";
export { importNarrationFile } from "./narration-import.ts";

export {
  lintCompositionFile,
  type CompositionLintReport,
} from "./composition-lint.ts";

export {
  loadPassageCompositions,
  validatePassageCompositions,
  type PassageCompositions,
} from "./passage-compositions.ts";

export {
  readCompositionSource,
  type CompositionSource,
} from "./composition-source.ts";

export * from "./soundtrack-project-io.ts";

export * from "./soundtrack-render.ts";
export * from "./composition-media-probe.ts";

export * from "./soundtrack-passage.ts";

export * from "./composition-media-cache.ts";

export * from "./composition-media.ts";

export * from "./composition-media-audio.ts";

export * from "./composition-audio-mix.ts";

export * from "./mechanism/io.ts";
export * from "./mechanism/tape-hook.ts";
export * from "./mechanism/lifecycle.ts";
export * from "./mechanism/capture.ts";
export * from "./mechanism/overlays.ts";
export * from "./mechanism/protocol.ts";

export * from "./composition-native3d.ts";
export * from "./native3d-appearance-identity.ts";
export * from "./mechanism/route.ts";

export * from "./native-observation.ts";

export * from "./mechanism/native-lifecycle.ts";
export {
  checkNativeMechanismFrames,
  type NativeMechanismEvidenceFrame,
} from "./mechanism/assertions.ts";

export * from "./mechanism/native-preview.ts";
export * from "./mechanism/native-package.ts";

export * from "./mechanism/native-overlays.ts";
