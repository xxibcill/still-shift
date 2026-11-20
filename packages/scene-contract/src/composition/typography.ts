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
  /**
   * ET5a: multiply the mark's alpha by the highest text-animator opacity of
   * the glyphs it decorates on each line, so a highlight fades out with its
   * text. Off by default; existing compositions render unchanged.
   */
  fadeWithText: z.boolean().optional(),
  /**
   * Editorial titles Phase 1: on each line, the mark covers only the
   * decorated glyphs the text animators have revealed (opacity and scale
   * above 0), so a highlight grows with a glyph-by-glyph or word-by-word
   * build instead of showing in full behind the first glyph. Off by default;
   * existing compositions render unchanged.
   */
  growWithText: z.boolean().optional(),
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
