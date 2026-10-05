import { accumulateWebglExposure } from "../../packages/renderer-core/src/composition/render/webgl-exposure.ts";
import {
  WebglDevice,
  type WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";

/** Retained pre-fusion algorithm for byte-level A/B, independent of the candidate. */
function originalExposure(
  device: WebglDevice,
  dst: WebglSurface,
  count: number,
  render: (index: number) => void,
) {
  if (count === 1) return render(0);
  const sum = device.surface(dst.width, dst.height, true);
  const next = device.surface(dst.width, dst.height, true);
  try {
    for (let i = 0; i < count; i++) {
      render(i);
      device.pass(
        "void main() { pixel = texture(backdrop,uv) + floor(texture(source,uv)*255.0+0.5); }",
        next,
        [dst, sum],
      );
      device.swap(sum, next);
    }
    device.pass(
      "uniform float count; void main() { pixel = floor(texture(source,uv)/count+0.5)/255.0; }",
      dst,
      [sum],
      { count },
    );
  } finally {
    device.release(sum);
    device.release(next);
  }
}

export function checkWebglExposureFusion() {
  let cases = 0;
  for (const kind of ["screen", "opaque", "transparent"] as const) {
    const canvas = document.createElement("canvas");
    canvas.width = 37;
    canvas.height = 29;
    const device = new WebglDevice(canvas);
    const dst = device.surface(
      37,
      29,
      false,
      kind !== "transparent",
      kind === "screen",
    );
    const source = device.surface(37, 29);
    const samples = Array.from({ length: 64 }, (_, sample) => {
      const pixels = new Uint8Array(37 * 29 * 4);
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha =
          kind === "transparent" ? (i * 17 + sample * 37) % 256 : 255;
        pixels[i + 3] = alpha;
        for (let c = 0; c < 3; c++)
          pixels[i + c] = Math.min(
            alpha,
            (i * 13 + sample * 23 + c * 71) % 256,
          );
        // Half-byte average ties, zero/max sums and opposite sample ordering.
        if (i < 32) pixels.fill((sample + i / 4) % 2 ? alpha : 0, i, i + 3);
      }
      return pixels;
    });
    const render = (i: number) => {
      device.uploadBytes(source, samples[i]!);
      device.pass(
        "void main() { pixel=texelFetch(source,ivec2(gl_FragCoord.xy),0); }",
        dst,
        [source],
      );
    };
    try {
      for (let count = 1; count <= 64; count++) {
        originalExposure(device, dst, count, render);
        const original = device.read(dst);
        const start = device.passes;
        accumulateWebglExposure(device, dst, count, render);
        const actual = device.read(dst);
        if (device.passes - start !== count + (count > 1 ? count : 0))
          throw new Error(`exposure ${kind}/${count}: unexpected pass count`);
        for (let i = 0; i < actual.length; i++) {
          let sum = 0;
          for (let s = 0; s < count; s++) sum += samples[s]![i]!;
          const expected = Math.floor(sum / count + 0.5);
          if (actual[i] !== original[i] || actual[i] !== expected)
            throw new Error(
              `exposure ${kind}/${count} byte ${i}: ${actual[i]} != original ${original[i]} / independent ${expected}`,
            );
        }
        const repeat = device.read(dst);
        if (repeat.some((v, i) => v !== actual[i]))
          throw new Error(`exposure ${kind}/${count}: repeated read changed`);
        cases++;
      }
      for (const failAt of [0, 1, 3]) {
        let threw = false;
        try {
          accumulateWebglExposure(device, dst, 4, (i) => {
            if (i === failAt) throw new Error("sample failure");
            render(i);
          });
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "sample failure")
            throw error;
          threw = true;
        }
        if (!threw) throw new Error("Missing sample failure");
        accumulateWebglExposure(device, dst, 4, render);
        const recovered = device.read(dst);
        originalExposure(device, dst, 4, render);
        if (device.read(dst).some((v, i) => v !== recovered[i]))
          throw new Error(
            `exposure ${kind}: stale pooled sums after sample failure ${failAt}`,
          );
        cases++;
      }
    } finally {
      device.dispose();
    }
  }
  return cases;
}
