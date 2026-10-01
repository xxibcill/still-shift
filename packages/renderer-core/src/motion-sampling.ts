import type {
  MotionBlend,
  PeriodicMotion,
  Signal,
} from "../../scene-contract/src/motion-craft.ts";
import { sampleCurve } from "./curve.ts";
import { easeMotion } from "./motion-easing.ts";
import type { Driver } from "../../scene-contract/src/motion-craft.ts";
const scalarKeys = (keys: Signal["keys"]) =>
  keys.map(({ frame, ...key }) => ({ time: frame, ...key }));
function randomAt(seed: number, cell: number) {
  let h = Math.imul(seed ^ cell, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}
export function samplePeriodic(
  motion: Pick<PeriodicMotion, "oscillate" | "noise">,
  frame: number,
) {
  if (motion.oscillate) {
    const o = motion.oscillate;
    return (
      Math.sin((frame / o.period) * Math.PI * 2 + (o.phase ?? 0)) * o.amplitude
    );
  }
  const n = motion.noise!,
    position = frame / n.period,
    cell = Math.floor(position),
    t = position - cell;
  return (
    (randomAt(n.seed, cell) +
      (randomAt(n.seed, cell + 1) - randomAt(n.seed, cell)) *
        t *
        t *
        (3 - 2 * t)) *
    n.amplitude
  );
}
export function sampleSignal(signal: Signal, frame: number, fps = 30) {
  let value = sampleCurve(scalarKeys(signal.keys), frame, fps);
  for (const addition of signal.add ?? []) {
    if ("pulse" in addition) {
      const { at, half, depth } = addition.pulse;
      const t = Math.abs(frame - at) / half;
      if (t < 1) value += (depth * (1 + Math.cos(t * Math.PI))) / 2;
    } else value += samplePeriodic(addition, frame);
  }
  return value;
}
export function blendValue(
  base: number,
  value: number,
  blend: MotionBlend,
  weight = 1,
) {
  return blend === "add"
    ? base + value * weight
    : blend === "multiply"
      ? base * (1 + (value - 1) * weight)
      : base + (value - base) * weight;
}

/** Yield source times so dependency evaluation can suspend without recursion. */
export function* driverSamples(
  frame: number,
  mapping: NonNullable<Driver["map"]> = {},
): Generator<number, number, number> {
  const time = frame - (mapping.delay ?? 0);
  let value = yield time;
  if (mapping.lag) {
    // Exact critically damped response to piecewise-linear source intervals; no playback state.
    const omega = 2 / mapping.lag;
    let y = yield 0,
      velocity = 0;
    for (let start = 0; start < time; start++) {
      const h = Math.min(1, time - start),
        a = yield start,
        b = yield start + h,
        slope = (b - a) / h;
      const offset = y - a + (2 * slope) / omega,
        tangent = velocity - slope + omega * offset,
        decay = Math.exp(-omega * h);
      y = b - (2 * slope) / omega + (offset + tangent * h) * decay;
      velocity = slope + (tangent - omega * (offset + tangent * h)) * decay;
    }
    value = y;
  }
  if (mapping.range && mapping.to) {
    const t =
      (value - mapping.range[0]) / (mapping.range[1] - mapping.range[0]);
    value =
      mapping.to[0] +
      (mapping.to[1] - mapping.to[0]) *
        easeMotion(t, mapping.easing ?? "linear");
  }
  value *= mapping.scale ?? 1;
  if (mapping.clamp)
    value = Math.max(mapping.clamp[0], Math.min(mapping.clamp[1], value));
  if (mapping.step) value = Math.floor(value / mapping.step) * mapping.step;
  return value + (mapping.offset ?? 0);
}

export function mapDriver(
  read: (time: number) => number,
  frame: number,
  mapping: NonNullable<Driver["map"]> = {},
) {
  const samples = driverSamples(frame, mapping);
  let sample = samples.next();
  while (!sample.done) sample = samples.next(read(sample.value));
  return sample.value;
}
