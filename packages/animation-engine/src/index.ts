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

export * from "./mechanism/tape-hook-pack.ts";

export * from "./mechanism/primitive-mesh.ts";
export * from "./mechanism/cable-tie-pack.ts";
export * from "./mechanism/clothespeg-pack.ts";
export * from "./mechanism/camera-recipes.ts";

export * from "./mechanism/gltf-import.ts";
export * from "./mechanism/gltf-file.ts";
export * from "./mechanism/gltf-inspect.ts";
export * from "./mechanism/gltf-types.ts";
export {
  RigidGltfImportError,
  RIGID_GLTF_LIMITS,
} from "./mechanism/gltf-document.ts";
export * from "./mechanism/gltf-pbr.ts";

export * from "./mechanism/native-pbr-files.ts";

export * from "./mechanism/pack-timeline.ts";

export * from "./mechanism/narrated-cycle.ts";

export * from "./mechanism/family-registry.ts";

export * from "./mechanism/family-authoring.ts";

export * from "./mechanism/cue-authoring.ts";

export * from "./mechanism/cue-lifecycle.ts";

export {
  MECHANISM_CUE_NATIVE_PLATES_VERSION,
  MechanismCueNativePlatesSchema,
  prepareMechanismCueNativePlates,
  checkMechanismCueNativePlates,
} from "./mechanism/cue-native-plates.ts";
export type {
  MechanismCueNativePlates,
  MechanismCueNativePlateOptions,
} from "./mechanism/cue-native-plates.ts";
export {
  MECHANISM_CUE_PLATE_EXPORT_VERSION,
  MechanismCuePlateExportSchema,
  renderMechanismCuePlateProject,
  checkMechanismCuePlateOutput,
} from "./mechanism/cue-plate-lifecycle.ts";
export type {
  MechanismCuePlateExport,
  MechanismCuePlateOptions,
} from "./mechanism/cue-plate-lifecycle.ts";
export * from "./mechanism/production-report.ts";
export * from "./mechanism/production-queue.ts";
