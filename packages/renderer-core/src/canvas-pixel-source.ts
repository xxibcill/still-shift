/** Immutable native Canvas preparation pixels; factories preserve their original context policy. */
export type CanvasPixelSource = (
  request: { kind: string; input: unknown; width: number; height: number },
  paint: () => HTMLCanvasElement,
  restore: (pixels: Uint8Array<ArrayBuffer>) => HTMLCanvasElement,
) => HTMLCanvasElement;
