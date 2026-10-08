import { createCanvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { WebglBounds } from "../../packages/renderer-core/src/composition/render/webgl-bounds.ts";
import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { WebglDisjointPaints } from "../../packages/renderer-core/src/composition/render/webgl-disjoint-paints.ts";
import { WebglPaint } from "../../packages/renderer-core/src/composition/render/webgl-paint.ts";
import type {
  Bounds,
  Rgba,
} from "../../packages/renderer-core/src/composition/evaluate/types.ts";

/** Packed copies and instanced coverage must match the original per-region paints exactly. */
export function checkWebglDisjointPaints() {
  const raster = createCanvas2dBackend({
    images: { images: new Map(), sizes: new Map() },
    drawText: () => {},
  });
  const canvas = document.createElement("canvas");
  canvas.width = 129;
  canvas.height = 99;
  const device = new WebglDevice(canvas);
  const target = device.surface(129, 99, false, true, true);
  const bounds = new WebglBounds(target);
  const paints = new WebglPaint(device, bounds);
  const atlas = new WebglDisjointPaints(device, raster, bounds);
  const source = raster.createSurface(129, 99);
  const image = source.ctx.createImageData(129, 99);
  const alphas = [0, 1, 2, 63, 127, 128, 129, 191, 254, 255];
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = (i * 37 + 13) & 255;
    image.data[i + 1] = (i * 71 + 197) & 255;
    image.data[i + 2] = (i * 113 + 61) & 255;
    image.data[i + 3] = alphas[(i / 4) % alphas.length]!;
  }
  source.ctx.putImageData(image, 0, 0);
  const rects: Bounds[] = Array.from({ length: 12 }, (_, index) => {
    const left = (index % 4) * 31,
      top = Math.floor(index / 4) * 29;
    return { left, top, right: left + 31, bottom: top + 29 };
  });
  let checked = 0;
  try {
    for (const color of [
      [0, 0, 0, 1],
      [1, 1, 1, 1],
      [38 / 255, 49 / 255, 59 / 255, 1],
      [0.371, 0.593, 0.127, 0.633],
    ] as Rgba[])
      for (const painted of [false, true])
        for (const clip of [
          undefined,
          { left: 13, top: 17, right: 101, bottom: 77 },
          { left: 126, top: 96, right: 129, bottom: 99 },
        ]) {
          const reset = () => {
            device.setFrameClip();
            device.clear(target, color);
            bounds.clear(target, color);
            if (painted) {
              device.pass(
                "void main() { pixel=vec4(uv.x,uv.y,0.375,1.0); }",
                target,
                [],
              );
              bounds.full(target);
            }
            device.setFrameClip(clip);
          };
          reset();
          for (const rect of rects) {
            const texture = device.surface(
              rect.right - rect.left,
              rect.bottom - rect.top,
            );
            try {
              device.uploadRegion(texture, source.canvas, rect.left, rect.top);
              paints.draw(texture, target, rect, true);
            } finally {
              device.release(texture);
            }
          }
          const expected = device.read(target);
          reset();
          const passes = device.passes;
          if (!atlas.draw(source, target, rects))
            throw new Error("Eligible disjoint paints fell back");
          const count = device.passes - passes;
          if (count !== (clip?.left === 126 ? 0 : 1))
            throw new Error(`Expected one instanced pass; got ${count}`);
          const actual = device.read(target);
          const differing = expected.findIndex(
            (byte, index) => byte !== actual[index],
          );
          if (differing >= 0)
            throw new Error(
              `Disjoint paints ${JSON.stringify({ color, painted, clip })} differ at ${differing}: ${expected[differing]} != ${actual[differing]}`,
            );
          checked++;
        }
    device.setFrameClip();
    const extension = device.gl.getExtension.bind(device.gl);
    device.gl.getExtension = ((name: string) =>
      name === "EXT_color_buffer_float"
        ? null
        : extension(name)) as typeof device.gl.getExtension;
    try {
      const unsupported = new WebglDisjointPaints(device, raster, bounds);
      const passes = device.passes;
      if (unsupported.draw(source, target, rects) || device.passes !== passes)
        throw new Error(
          "Missing float capability must fall back without drawing",
        );
    } finally {
      device.gl.getExtension = extension;
    }
    for (const failAt of [1, 2, 3]) {
      const surface = device.surface.bind(device),
        release = device.release.bind(device),
        releaseRaster = raster.releaseSurface;
      let allocations = 0,
        releases = 0,
        rasterReleases = 0;
      device.surface = (...args: Parameters<typeof surface>) => {
        if (++allocations === failAt)
          throw new Error("injected allocation failure");
        return surface(...args);
      };
      device.release = (value) => {
        releases++;
        return release(value);
      };
      raster.releaseSurface = (value) => {
        rasterReleases++;
        return releaseRaster(value);
      };
      try {
        let rejected = false;
        try {
          atlas.draw(source, target, rects);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "injected allocation failure"
          )
            throw error;
          rejected = true;
        }
        if (!rejected || releases !== failAt - 1 || rasterReleases !== 1)
          throw new Error(
            `Allocation ${failAt} did not clean up its predecessors`,
          );
      } finally {
        device.surface = surface;
        device.release = release;
        raster.releaseSurface = releaseRaster;
      }
    }
    if (atlas.draw(source, target, [...rects, rects[0]!]))
      throw new Error("Overlapping coverage must fall back");
    if (atlas.draw(source, target, rects.slice(0, 7)))
      throw new Error("Small batches must fall back");
    const offscreen = device.surface(129, 99);
    try {
      if (atlas.draw(source, offscreen, rects))
        throw new Error("Offscreen target must fall back");
    } finally {
      device.release(offscreen);
    }
    return { checked, maxDelta: 0, independentClips: 3 };
  } finally {
    raster.releaseSurface(source);
    raster.dispose();
    device.dispose();
  }
}
