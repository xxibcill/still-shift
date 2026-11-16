/** Internal CGA helper: decimal rounding for reports, with −0 written as 0. */
export function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return Object.is(rounded, -0) ? 0 : rounded;
}
