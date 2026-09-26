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
    case "in-out-sine":
      return (1 - Math.cos(Math.PI * t)) / 2;
    case "out-expo":
      return t === 0 || t === 1 ? t : 1 - 2 ** (-10 * t);
    case "out-back-soft":
      return t === 0 || t === 1
        ? t
        : 1 + 1.6 * (t - 1) ** 3 + 0.6 * (t - 1) ** 2;
    case "in-quad":
      return t * t;
    case "in-cubic":
      return t ** 3;
    case "in-out-quint":
      return t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
  }
}
