import { z } from "zod";
import { CommerceEffectSchema } from "./commerce-effects.ts";
export const SharedEffectSchema = CommerceEffectSchema.refine(
  (effect) =>
    [
      "motion-blur",
      "directional-blur",
      "focus-blur",
      "glow",
      "grain",
      "light-sweep",
    ].includes(effect.type),
  "Effect is not part of effects-1",
);
export const sharedEffectsFields = {
  effectsVersion: z.literal("effects-1").optional(),
  effects: z.array(SharedEffectSchema).max(24).optional(),
};
