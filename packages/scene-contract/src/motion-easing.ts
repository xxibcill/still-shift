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
export type MotionEasing = z.infer<typeof MotionEasingSchema>;
