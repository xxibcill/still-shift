import type { MotionEasing } from "../../scene-contract/src/motion-easing.ts";

export function easeMotion(
  progress: number,
  easing: MotionEasing = "smoothstep",
) {
  const t = Math.max(0, Math.min(1, progress));
  switch (easing) {
    case "linear":
      return t;
    case "smoothstep":
      return t * t * (3 - 2 * t);
    case "out-cubic":
      return 1 - (1 - t) ** 3;
    case "out-quint":
      return 1 - (1 - t) ** 5;
    case "in-cubic":
      return t ** 3;
    case "in-out-quint":
      return t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
  }
}
