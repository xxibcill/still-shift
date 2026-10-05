import { BuilderError } from "./source.ts";
import { ScalarKeySchema } from "@still-shift/scene-contract";
const CurveEasingSchema = ScalarKeySchema.shape.easing.unwrap();
type MotionEasing = ReturnType<typeof CurveEasingSchema.parse>;
function parse(value: unknown): MotionEasing {
  const result = CurveEasingSchema.safeParse(value);
  if (!result.success)
    throw new BuilderError(
      "comp-builder-easing",
      result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  return result.data;
}
export const ease = {
  linear: "linear",
  smoothstep: "smoothstep",
  outCubic: "out-cubic",
  outQuint: "out-quint",
  inCubic: "in-cubic",
  inOutQuint: "in-out-quint",
  inOutSine: "in-out-sine",
  outExpo: "out-expo",
  outBackSoft: "out-back-soft",
  inQuad: "in-quad",
  inOutCubic: "in-out-cubic",
  inOutExpo: "in-out-expo",
  outBack: "out-back",
  anticipate: "anticipate",
  bezier: (x1: number, y1: number, x2: number, y2: number): MotionEasing =>
    parse({ bezier: [x1, y1, x2, y2] }),
  spring: (
    options: { stiffness?: number; damping?: number; mass?: number } = {},
  ): MotionEasing =>
    parse({
      spring: { stiffness: 180, damping: 18, mass: 1, ...options },
    }),
  overshoot: (amount: number): MotionEasing => parse({ overshoot: amount }),
} as const;
