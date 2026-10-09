export {
  COMPOSITION_LIMITS,
  COMPOSITION_SCHEMA_VERSION,
} from "./primitives.ts";
export {
  AnimatableColorSchema,
  AnimatableDiscreteSchema,
  AnimatablePathSchema,
  BezierPathSchema,
  isKeyed,
  type Animatable,
  type BezierPath,
  type Keyed,
} from "./keys.ts";
export * from "./layers.ts";
export * from "./depth-image.ts";
export * from "./media.ts";
export * from "./audio.ts";
export * from "./audio-clock.ts";
export * from "./audio-pcm.ts";
export * from "./shapes.ts";
export * from "./shape-properties.ts";
export * from "./property-path.ts";
export * from "./composition.ts";
export * from "./resolve.ts";
export { compositionWarnings, type CompositionWarning } from "./validate.ts";
export * from "./diagnostics.ts";
export * from "./effects.ts";
export * from "./expression-ast.ts";
export * from "./expression-check.ts";
export * from "./behaviours.ts";
export * from "./expressions.ts";
export * from "./camera-dependencies.ts";

export {
  compositionProtectedNarration,
  type CompositionProtectedNarration,
} from "./validate-media.ts";
