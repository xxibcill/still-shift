import { z } from "zod";
import {
  curveFields,
  ScalarCurveSchema,
  ScalarKeySchema,
  TemporalHandleSchema,
} from "../motion-craft.ts";
import { CurveEasingSchema } from "../motion-easing.ts";
import { bounded, compFrame, unit } from "./primitives.ts";

const bezier = z.tuple([unit, bounded, unit, bounded]);
export const CompositionEasingSchema = z.union([
  CurveEasingSchema.options[0],
  CurveEasingSchema.options[1],
  CurveEasingSchema.options[2].extend({ bezier }),
  CurveEasingSchema.options[3],
  CurveEasingSchema.options[4],
]);
const temporalHandle = TemporalHandleSchema.extend({
  speed: bounded.optional(),
});
export const compositionCurveFields = {
  ...curveFields,
  easing: CompositionEasingSchema.optional(),
  bezier: bezier.optional(),
  in: temporalHandle.optional(),
  out: temporalHandle.optional(),
};

// Keep the legacy array's ordering/interpolation checks and its 2–100 key limit.
export const CompositionScalarCurveSchema = ScalarCurveSchema.and(
  z.array(
    ScalarKeySchema.extend({
      frame: compFrame,
      value: bounded,
      ...compositionCurveFields,
    }),
  ),
);
