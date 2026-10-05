export { comp, CompositionBuilder, type CompOptions } from "./comp.ts";
export * from "./layers.ts";
export {
  Property,
  type Easing,
  type Motion,
  type AnimationKey,
} from "./properties.ts";
export {
  seq,
  par,
  stagger,
  delay,
  after,
  at,
  frames,
  type Duration,
  type Timeline,
} from "./timeline.ts";
export { ease } from "./ease.ts";
export {
  expr,
  expression,
  ref,
  instance,
  type Expression,
} from "./expressions.ts";
export { BuilderError, type SourceLocation } from "./source.ts";

export { builderSource } from "./source-map.ts";

export { authoredFontDiagnostics } from "./fonts.ts";

export {
  presets,
  type MotionPresetOptions,
  type TextPresetOptions,
} from "./presets.ts";
