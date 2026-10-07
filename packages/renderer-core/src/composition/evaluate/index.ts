export {
  compositionExposureFrames,
  evaluateCompositionExposure,
} from "./exposure.ts";
export {
  evaluateComp,
  evaluateCompositionAudio,
  type EvaluatedCompositionAudio,
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

export { sourceFramePair, type SourceFramePair } from "./time-controls.ts";
