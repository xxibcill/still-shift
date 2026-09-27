/** Keep the legacy 480×270 cell for 16:9 while preserving other aspect ratios. */
export function reviewProbeSize(width: number, height: number) {
  const area = 480 * 270;
  const cellWidth = Math.round(Math.sqrt((area * width) / height));
  const cellHeight = Math.round(area / cellWidth);
  return `${cellWidth}:${cellHeight}`;
}
