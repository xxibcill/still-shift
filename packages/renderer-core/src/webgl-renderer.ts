import type { createPreparedDepthPreview } from "./composition/adapters/depth-preview.ts";

/** Preparation verifies immutable assets before the shared GPU renderer starts. */
export { createPreparedDepthPreview as createWebGLPreview } from "./composition/adapters/depth-preview.ts";
export { DEPTH_IMAGE_SHADER_VERSION as SHADER_VERSION } from "./composition/render/webgl-depth-image.ts";
export type WebGLPreview = Awaited<
  ReturnType<typeof createPreparedDepthPreview>
>;
