import { z } from "zod";
import {
  ConstraintSchema,
  DriverMapSchema,
  layerFields,
  NoiseSchema,
  OscillatorSchema,
  SignalSchema,
  TextAnimatorPropertiesSchema,
  TextAnimatorSchema,
  TextSelectorSchema,
} from "../motion-craft.ts";
import { StoryCameraSchema } from "../story-motion.ts";
import {
  CompositionEasingSchema,
  CompositionScalarCurveSchema,
} from "./curves.ts";
import {
  bounded,
  COMPOSITION_LIMITS,
  compFrame,
  compositionId,
  finite,
  vec2,
} from "./primitives.ts";

const L = COMPOSITION_LIMITS;
export const compositionMotionLayerFields = {
  ...layerFields,
  weight: CompositionScalarCurveSchema.refine(
    (keys) => keys.every((key) => key.value >= 0 && key.value <= 1),
    {
      message: "weights must be between 0 and 1",
      params: { diagnosticCode: "comp-schema-range" },
    },
  ).optional(),
};
export const CompositionOscillatorSchema = OscillatorSchema.extend({
  period: compFrame.positive(),
  amplitude: bounded,
  phase: bounded.optional(),
});
export const CompositionNoiseSchema = NoiseSchema.extend({
  seed: finite.int().min(0).max(L.maxSeed),
  period: compFrame.positive(),
  amplitude: bounded,
});
export const CompositionSignalSchema = SignalSchema.extend({
  id: compositionId,
  cue: compositionId.optional(),
  keys: CompositionScalarCurveSchema,
  add: z
    .array(
      z.union([
        z
          .object({
            pulse: z
              .object({
                at: compFrame,
                half: compFrame.positive(),
                depth: bounded,
              })
              .strict(),
          })
          .strict(),
        z.object({ oscillate: CompositionOscillatorSchema }).strict(),
        z.object({ noise: CompositionNoiseSchema }).strict(),
      ]),
    )
    .max(40)
    .optional(),
});
export const CompositionDriverMapSchema = DriverMapSchema.safeExtend({
  offset: bounded.optional(),
  scale: bounded.optional(),
  range: vec2.optional(),
  to: vec2.optional(),
  clamp: vec2.optional(),
  easing: CompositionEasingSchema.optional(),
  step: finite.positive().max(L.maxCoordinate).optional(),
  delay: compFrame.optional(),
});

const constraintFields = {
  target: compositionId,
  ...compositionMotionLayerFields,
};
export const CompositionConstraintSchema = z.discriminatedUnion("type", [
  ConstraintSchema.options[0].extend({
    ...constraintFields,
    anchor: compositionId,
    offset: vec2.optional(),
  }),
  ConstraintSchema.options[1].extend({
    ...constraintFields,
    surface: compositionId,
  }),
  ConstraintSchema.options[2].extend({
    ...constraintFields,
    toward: compositionId,
    offset: bounded.optional(),
  }),
  ConstraintSchema.options[3].extend({
    ...constraintFields,
    path: compositionId,
    progress: compositionId,
  }),
  ConstraintSchema.options[4].extend({
    ...constraintFields,
    inset: finite.min(0).max(L.maxCoordinate),
  }),
]);

const selectorValue = z.union([
  bounded,
  CompositionScalarCurveSchema,
  z
    .object({
      signal: compositionId,
      scale: bounded.optional(),
      offset: bounded.optional(),
    })
    .strict(),
]);
const selector = TextSelectorSchema.extend({
  start: selectorValue,
  end: selectorValue,
  offset: selectorValue.optional(),
  easing: CompositionEasingSchema.optional(),
  seed: finite.int().min(0).max(L.maxSeed).optional(),
});
const textProperties = TextAnimatorPropertiesSchema.extend({
  offset: vec2.optional(),
  rotation: bounded.optional(),
  baselineShift: bounded.optional(),
  axes: z.record(z.string().regex(/^[A-Za-z0-9]{4}$/), bounded).optional(),
});
export const CompositionTextAnimatorSchema = TextAnimatorSchema.safeExtend({
  node: compositionId,
  start: compFrame,
  end: compFrame,
  selector,
  selectors: z.array(selector).max(8).optional(),
  from: textProperties,
  to: textProperties.optional(),
  span: compositionId.optional(),
  cue: compositionId.optional(),
  signal: compositionId.optional(),
  ...compositionMotionLayerFields,
});

const cameraKey = StoryCameraSchema.shape.keys.element.extend({
  frame: compFrame,
  x: bounded,
  y: bounded,
  zoom: finite.min(1).max(L.maxCoordinate),
});
const cameraTangent = StoryCameraSchema.shape.startTangent.unwrap().extend({
  x: bounded,
  y: bounded,
  zoom: bounded,
});
const cameraJolt = StoryCameraSchema.shape.jolts.unwrap().element.extend({
  frame: compFrame,
  dx: bounded,
  dy: bounded,
  decayFrames: compFrame.positive(),
});
/** Story camera semantics with composition-specific bounds. */
export const Camera2dSchema = StoryCameraSchema.omit({
  depth: true,
  cover: true,
}).extend({
  keys: z.array(cameraKey).min(2).max(100),
  startTangent: cameraTangent.optional(),
  endTangent: cameraTangent.optional(),
  jolts: z.array(cameraJolt).max(32).optional(),
});
