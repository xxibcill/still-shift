export {
  compositionExposureFrames,
  evaluateCompositionExposure,
} from "./exposure.ts";
export {
  evaluateComp,
  evaluateProperty,
  evaluateStageProperty,
  evaluateStageProperties,
  type StageSample,
  COMPOSITION_EVALUATOR_VERSION,
} from "./evaluate.ts";
export type {
  Bounds,
  Rgba,
  PropertyValue,
  EvaluatedLayer,
  EvaluatedLayerTree,
  EvaluatedTransform,
  EvaluatedMask,
  EvaluationOptions,
} from "./types.ts";
