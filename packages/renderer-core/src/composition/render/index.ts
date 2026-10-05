export { COMPOSITION_RENDERER_VERSION } from "./version.ts";
export { renderCompositionExposure } from "./exposure.ts";
export {
  buildRenderGraph,
  type AdjustOp,
  type ClipRect,
  type DrawOp,
  type ImageContent,
  type IsolateOp,
  type LayerContent,
  type MaskOp,
  type MatteOp,
  type RenderGraph,
  type RenderGraphOptions,
  type RenderOp,
  type RenderEffect,
  type SolidContent,
  type ShapeContent as NativeShapeContent,
  type SurfaceContent,
  type SurfaceNode,
  type TextContent,
  type ProviderContent,
} from "./graph.ts";
export {
  executeGraph,
  type RenderBackend,
  type Surface,
  type SolidDraw,
} from "./backend.ts";
export {
  createCanvas2dBackend,
  cssColor,
  type Canvas2dBackend,
  type Canvas2dBackendOptions,
  type CanvasSurface,
} from "./canvas2d.ts";
export {
  loadCompositionFonts,
  prepareCompositionText,
  type CompositionText,
} from "./text.ts";
export {
  compositionScene,
  createCompositionPreview,
  loadCompositionResources,
  type CompositionFrameReport,
  type CompositionPreview,
  type CompositionResources,
  type CompositionScene,
} from "./renderer.ts";
export {
  prepareCompositionProviders,
  type CanvasContentProvider,
  type CanvasProviderDrawer,
  type ProviderLayer,
  type ProviderResources,
} from "./providers.ts";
export {
  createWebgl2Backend,
  COMPOSITION_WEBGL_RENDERER_VERSION,
  type Webgl2Backend,
} from "./webgl2.ts";
export {
  compositionRendererVersion,
  type CompositionBackend,
  type CompositionRendererVersion,
} from "./renderer.ts";

export type {
  ShapeDraw,
  CompiledShapes,
  SampledShapeContent,
} from "../shapes/types.ts";
