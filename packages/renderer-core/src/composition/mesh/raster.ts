import type { Point } from "../../node-transform.ts";
import type { DeformedMesh } from "./frame.ts";
import { triangleArea } from "./geometry.ts";

/** Triangle-by-triangle affine reference, in premultiplied byte space.
 * The caller owns and admits both buffers; no per-pixel arrays are allocated.
 */
export function rasterizeMesh(
  mesh: DeformedMesh,
  input: Uint8Array,
  output: Uint8Array,
  width: number,
  height: number,
): void {
  output.fill(0);
  let samples = 0;
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const ia = mesh.indices[triangle]!;
    let ib = mesh.indices[triangle + 1]!,
      ic = mesh.indices[triangle + 2]!;
    if (
      triangleArea(
        mesh.destination[ia]!,
        mesh.destination[ib]!,
        mesh.destination[ic]!,
      ) < 0
    )
      [ib, ic] = [ic, ib];
    const a = mesh.destination[ia]!,
      b = mesh.destination[ib]!,
      c = mesh.destination[ic]!;
    const area = triangleArea(a, b, c),
      sa = mesh.source[ia]!,
      sb = mesh.source[ib]!,
      sc = mesh.source[ic]!;
    const left = Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0]) - 0.5)),
      right = Math.min(width - 1, Math.floor(Math.max(a[0], b[0], c[0]) - 0.5));
    const top = Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1]) - 0.5)),
      bottom = Math.min(
        height - 1,
        Math.floor(Math.max(a[1], b[1], c[1]) - 0.5),
      );
    samples += Math.max(0, right - left + 1) * Math.max(0, bottom - top + 1);
    if (samples > width * height * 32 + 1000000)
      throw Error("comp-mesh-budget: raster sample budget exceeded");
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const wa = edge(b, c, x + 0.5, y + 0.5),
          wb = edge(c, a, x + 0.5, y + 0.5),
          wc = edge(a, b, x + 0.5, y + 0.5);
        if (!inside(wa, b, c) || !inside(wb, c, a) || !inside(wc, a, b))
          continue;
        const sx = (wa * sa[0] + wb * sb[0] + wc * sc[0]) / area,
          sy = (wa * sa[1] + wb * sb[1] + wc * sc[1]) / area;
        const alpha = sample(input, width, height, sx, sy, 3),
          at = (y * width + x) * 4,
          remaining = 1 - alpha / 255;
        for (let channel = 0; channel < 3; channel++)
          output[at + channel] = Math.round(
            sample(input, width, height, sx, sy, channel) +
              output[at + channel]! * remaining,
          );
        output[at + 3] = Math.round(alpha + output[at + 3]! * remaining);
      }
  }
}
function edge(a: Point, b: Point, x: number, y: number): number {
  return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
}
function inside(value: number, a: Point, b: Point): boolean {
  return (
    value > 0 ||
    (value === 0 && (b[1] > a[1] || (b[1] === a[1] && b[0] < a[0])))
  );
}
function sample(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
): number {
  const left = Math.floor(x - 0.5),
    top = Math.floor(y - 0.5),
    fx = x - 0.5 - left,
    fy = y - 0.5 - top;
  let sum = 0;
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const sx = left + dx,
        sy = top + dy;
      if (sx >= 0 && sy >= 0 && sx < width && sy < height)
        sum +=
          pixels[(sy * width + sx) * 4 + channel]! *
          (dx ? fx : 1 - fx) *
          (dy ? fy : 1 - fy);
    }
  return Math.round(sum);
}
