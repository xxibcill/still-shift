import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { productionFailure } from "./production-queue-files.ts";
export type ProductionReviewProjection = {
  anchor: string;
  pixel: [number, number] | null;
  visibility: string;
};
type Projection = ProductionReviewProjection;
export const productionReviewPngArgs = (
  source: string,
  filter: string,
  frames: number,
  destination: string,
  sequence = false,
) => [
  "-v",
  "error",
  "-nostdin",
  "-threads",
  "1",
  ...(sequence ? ["-start_number", "0"] : []),
  "-i",
  source,
  "-map",
  "0:v:0",
  "-an",
  "-vf",
  filter + ",format=rgba",
  "-fps_mode",
  "passthrough",
  "-frames:v",
  String(frames),
  "-threads",
  "1",
  "-start_number",
  "0",
  destination,
];
export function productionAnchorCrop(
  projections: readonly Projection[],
  width: number,
  height: number,
) {
  const points = projections.flatMap((p) =>
    p.pixel &&
    p.pixel[0] >= 0 &&
    p.pixel[0] < width &&
    p.pixel[1] >= 0 &&
    p.pixel[1] < height
      ? [p.pixel]
      : [],
  );
  if (!points.length) return null;
  const margin = Math.max(16, Math.ceil(Math.min(width, height) * 0.08));
  const x = Math.max(
      0,
      Math.min(
        width - 16,
        Math.floor(Math.min(...points.map((p) => p[0])) - margin),
      ),
    ),
    y = Math.max(
      0,
      Math.min(
        height - 16,
        Math.floor(Math.min(...points.map((p) => p[1])) - margin),
      ),
    );
  return {
    x,
    y,
    width: Math.max(
      16,
      Math.min(
        width - x,
        Math.ceil(Math.max(...points.map((p) => p[0])) + margin) - x,
      ),
    ),
    height: Math.max(
      16,
      Math.min(
        height - y,
        Math.ceil(Math.max(...points.map((p) => p[1])) + margin) - y,
      ),
    ),
  };
}
export async function productionReviewPngShape(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = Buffer.alloc(33);
    const read = await file.read(bytes, 0, 33, 0);
    if (
      read.bytesRead !== 33 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes[24] !== 8 ||
      bytes[25] !== 6
    )
      productionFailure(
        "production-evidence-png",
        "Expected a complete RGBA8 PNG header",
        path,
      );
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } finally {
    await file.close();
  }
}
