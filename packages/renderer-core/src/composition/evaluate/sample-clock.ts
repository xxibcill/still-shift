/** Hold the latest explicit sample, including at either end of its range. */
export function compositionSampleIndex(
  times: readonly number[],
  time: number,
): number {
  let low = 0,
    high = times.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (times[mid]! <= time) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
}
