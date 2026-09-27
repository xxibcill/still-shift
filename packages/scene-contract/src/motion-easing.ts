import { z } from "zod";

export const MotionEasingSchema = z.enum([
  "linear",
  "smoothstep",
  "out-cubic",
  "out-quint",
  "in-cubic",
  "in-out-quint",
  "in-out-sine",
  "out-expo",
  "out-back-soft",
  "in-quad",
]);
export const CurveEasingSchema = z.union([
  MotionEasingSchema,
  z.enum(["in-out-cubic", "in-out-expo", "out-back", "anticipate"]),
  z
    .object({
      bezier: z.tuple([
        z.number().min(0).max(1),
        z.number().finite(),
        z.number().min(0).max(1),
        z.number().finite(),
      ]),
    })
    .strict(),
  z
    .object({
      spring: z
        .object({
          stiffness: z.number().min(1).max(1000),
          damping: z.number().min(0.1).max(100),
          mass: z.number().min(0.1).max(20),
        })
        .strict(),
    })
    .strict(),
  z.object({ overshoot: z.number().min(0).max(5) }).strict(),
]);
export type MotionEasing = z.infer<typeof CurveEasingSchema>;
