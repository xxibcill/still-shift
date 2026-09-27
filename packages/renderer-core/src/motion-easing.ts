import type { MotionEasing } from "../../scene-contract/src/motion-easing.ts";

export function easeMotion(
  progress: number,
  easing: MotionEasing = "smoothstep",
  durationSeconds = 1,
) {
  const t = Math.max(0, Math.min(1, progress));
  if (typeof easing === "object") {
    if ("bezier" in easing) return cubicBezierProgress(t, easing.bezier);
    if ("spring" in easing)
      return springProgress(t, easing.spring, durationSeconds);
    return back(t, easing.overshoot);
  }
  switch (easing) {
    case "in-out-cubic":
      return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    case "in-out-expo":
      return t === 0 || t === 1
        ? t
        : t < 0.5
          ? 2 ** (20 * t - 10) / 2
          : (2 - 2 ** (-20 * t + 10)) / 2;
    case "out-back":
      return back(t, 1.70158);
    case "anticipate":
      return t < 0.2
        ? -0.06 * Math.sin((Math.PI * t) / 0.4)
        : -0.06 + 1.06 * (1 - ((1 - t) / 0.8) ** 3);
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

function back(t: number, overshoot: number) {
  return t === 0 || t === 1
    ? t
    : 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

/** Invert the monotone time coordinate; fixed iterations make seeks reproducible. */
export function cubicBezierProgress(
  t: number,
  [x1, y1, x2, y2]: readonly number[],
) {
  if (t <= 0 || t >= 1) return Math.max(0, Math.min(1, t));
  const coordinate = (u: number, a: number, b: number) =>
    3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u ** 2 * b + u ** 3;
  let low = 0,
    high = 1;
  for (let i = 0; i < 52; i++) {
    const middle = (low + high) / 2;
    if (coordinate(middle, x1!, x2!) < t) low = middle;
    else high = middle;
  }
  return coordinate((low + high) / 2, y1!, y2!);
}

export function springProgress(
  t: number,
  spring: { stiffness: number; damping: number; mass: number },
  seconds = 1,
) {
  if (t <= 0 || t >= 1) return Math.max(0, Math.min(1, t));
  const omega = Math.sqrt(spring.stiffness / spring.mass);
  const decay = spring.damping / (2 * spring.mass);
  const response = (time: number) => {
    const discriminant = omega * omega - decay * decay;
    if (Math.abs(discriminant) < 1e-8)
      return 1 - Math.exp(-decay * time) * (1 + decay * time);
    if (discriminant > 0) {
      const frequency = Math.sqrt(discriminant);
      return (
        1 -
        Math.exp(-decay * time) *
          (Math.cos(frequency * time) +
            (decay / frequency) * Math.sin(frequency * time))
      );
    }
    const frequency = Math.sqrt(-discriminant);
    const slow = -decay + frequency,
      fast = -decay - frequency;
    return (
      1 -
      (fast * Math.exp(slow * time) - slow * Math.exp(fast * time)) /
        (fast - slow)
    );
  };
  const residualBlend = Math.max(0, (t - 0.9) / 0.1);
  return (
    response(t * seconds) +
    (1 - response(seconds)) * residualBlend ** 2 * (3 - 2 * residualBlend)
  );
}
