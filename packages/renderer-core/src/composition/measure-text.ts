/**
 * ET6a browser entry: load a composition's pinned fonts and prepare its text
 * exactly as rendering does (`loadCompositionFonts`, `prepareCompositionText`),
 * then read the measurement. No frame is evaluated, drawn or encoded, no media
 * is loaded, and glyph rasters are created without painting, as text frame
 * discovery already does for its bounds-only preparation.
 */
import type { Composition } from "@still-shift/scene-contract";
import type { CanvasPixelSource } from "../canvas-pixel-source.ts";
import {
  createRenderCanvas,
  releaseRenderCanvas,
} from "../managed-memory-context.ts";
import { loadCompositionFonts, prepareCompositionText } from "./render/text.ts";
import type { CompositionTextMeasure } from "./text-measure.ts";

export async function measureCompositionText(
  comp: Composition,
  assetUrl: (id: string) => string,
  options: { signal?: AbortSignal } = {},
): Promise<CompositionTextMeasure> {
  options.signal?.throwIfAborted();
  const fonts = await loadCompositionFonts(comp, assetUrl);
  options.signal?.throwIfAborted();
  const canvases: HTMLCanvasElement[] = [];
  const blank = () => {
    const canvas = createRenderCanvas();
    canvases.push(canvas);
    return canvas;
  };
  // Shaping and bounds read layouts only; glyph surfaces keep their sizes.
  const boundsOnly: CanvasPixelSource = ({ width, height }) => {
    const canvas = blank();
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  try {
    const context = blank().getContext("2d")!;
    const text = prepareCompositionText(
      comp,
      fonts,
      context,
      undefined,
      undefined,
      boundsOnly,
      {},
    );
    try {
      return text.measure();
    } finally {
      text.dispose();
    }
  } finally {
    for (const canvas of canvases) releaseRenderCanvas(canvas);
  }
}
