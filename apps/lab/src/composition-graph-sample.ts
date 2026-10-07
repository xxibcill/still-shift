export type GraphPoint = { frame: number; value: number[]; speed: number[] };

export function sampleCurveGraph(
  sample: (frame: number) => number[],
  range: { start: number; end: number; count: number },
): GraphPoint[] {
  const { start, end, count } = range;
  return Array.from({ length: count }, (_, index) => {
    const frame = start + (index * (end - start)) / (count - 1),
      left = Math.max(start, frame - 0.01),
      right = Math.min(end, frame + 0.01),
      value = sample(frame),
      a = sample(left),
      b = sample(right);
    return {
      frame,
      value,
      speed: value.map((_, axis) =>
        right > left ? (b[axis]! - a[axis]!) / (right - left) : 0,
      ),
    };
  });
}
