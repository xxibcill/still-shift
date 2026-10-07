import { passageError } from "../../passage-diagnostics.ts";

/** Media-only quantization: Q32 source frames / Q16 PCM samples, never CE0 clocks. */
export function mediaSamplePosition(
  value: number,
  fractionalBits: 16 | 32,
): number {
  const scale = 2 ** fractionalBits;
  if (
    !Number.isFinite(value) ||
    Math.abs(value) * scale > Number.MAX_SAFE_INTEGER
  )
    passageError(
      "comp-media-time",
      "Media sample time exceeds its exact quantization range",
      { path: "timeRemap" },
    );
  return Math.round(value * scale) / scale;
}
