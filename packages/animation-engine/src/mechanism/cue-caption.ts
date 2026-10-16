/** Shared caption geometry keeps compiled artwork and annotation exclusions aligned. */
export function mechanismCueCaptionLayout(width: number, height: number) {
  const maxLines = 3,
    lineHeight = 1.2,
    fontSize = Math.min(
      Math.max(8, Math.min(width / 24, height / 13)),
      (height * 0.9) / (maxLines * lineHeight + 1),
    ),
    padding = fontSize * 0.5,
    textHeight = fontSize * maxLines * lineHeight,
    panelHeight = textHeight + padding * 2,
    bottom = height * 0.95,
    top = bottom - panelHeight;
  return {
    fontSize,
    maxLines,
    lineHeight,
    textPosition: [width * 0.08, top + padding] as [number, number],
    textSize: [width * 0.84, textHeight] as [number, number],
    panelPosition: [width * 0.5, bottom - panelHeight / 2] as [number, number],
    panelSize: [width * 0.9, panelHeight] as [number, number],
    exclusion: {
      x: width * 0.05,
      y: top,
      width: width * 0.9,
      height: panelHeight,
    },
  };
}
