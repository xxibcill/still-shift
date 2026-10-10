/** Explicit browser entry; pure renderer imports never reach Three. */
export {
  createNativeThreeWorld,
  createNativeThreeWorldV2,
  createNativeThreeGeometry,
} from "./three-world.ts";
export { createNativeDepthRuntime } from "../composition/render/webgl-native-depth.ts";
export {
  native3DAppearanceModules,
  native3DAppearanceExternalModules,
} from "./appearance-modules.ts";
export type { NativeTextureFont } from "./three-textures.ts";
export type {
  NativeDepthRuntime,
  NativeDepthRuntimeFactory,
  NativeDepthRuntimeOptions,
} from "./runtime.ts";
export { observeNativeThreeWorld } from "./three-observation.ts";
export {
  createNativeThreeShapeObservation,
  NativeUsedStreamMismatchError,
} from "./three-shape-observation.ts";
export type { NativeThreeShapeObservationResult } from "./three-shape-observation.ts";
export {
  createNativeThreeGraphic,
  nativeArtworkCorners,
} from "./three-graphics.ts";
export { NATIVE_DEPTH_RENDERER_VERSION } from "./resolve.ts";
export type {
  NativeThreeWorld,
  NativeThreeWorldV2,
  NativeThreeGeometry,
} from "./three-world.ts";
