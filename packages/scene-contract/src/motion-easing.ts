import { z } from "zod";

export const MotionEasingSchema = z.enum([
  "linear",
  "smoothstep",
  "out-cubic",
  "out-quint",
  "in-cubic",
  "in-out-quint",
]);
export type MotionEasing = z.infer<typeof MotionEasingSchema>;
