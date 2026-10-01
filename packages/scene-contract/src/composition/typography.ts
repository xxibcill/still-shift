import { z } from "zod";
import {
  FontAxisSchema,
  TextDecorationSchema,
  TextSpanSchema,
  TextStyleSchema,
  TextTransitionSchema,
  typographyNodeFields,
} from "../typography.ts";
import {
  CompositionEasingSchema,
  CompositionScalarCurveSchema,
} from "./curves.ts";
import { bounded, compFrame, compositionId } from "./primitives.ts";

const axisId = z.string().regex(/^[A-Za-z0-9]{4}$/);
export const CompositionFontAxesSchema = z.record(
  axisId,
  FontAxisSchema.safeExtend({ min: bounded, default: bounded, max: bounded }),
);
export const CompositionTextStyleSchema = TextStyleSchema.extend({
  fontAsset: compositionId.optional(),
  axes: z.record(axisId, bounded).optional(),
});
const span = TextSpanSchema.safeExtend({
  id: compositionId.optional(),
  style: compositionId.optional(),
  start: compFrame,
  end: compFrame.positive(),
});
const decoration = TextDecorationSchema.extend({
  span: compositionId.optional(),
  offset: bounded.optional(),
  reveal: CompositionScalarCurveSchema.optional(),
});
const transition = TextTransitionSchema.extend({
  window: TextTransitionSchema.shape.window.safeExtend({
    start: compFrame,
    end: compFrame,
  }),
  easing: CompositionEasingSchema.optional(),
  fromState: compFrame.optional(),
  toState: compFrame.optional(),
});
export const compositionTypographyFields = {
  ...typographyNodeFields,
  style: compositionId.optional(),
  spans: z.array(span).max(128).optional(),
  decorations: z.array(decoration).max(40).optional(),
  transition: transition.optional(),
  transitions: z.array(transition).max(40).optional(),
};
