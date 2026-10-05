import { accumulateWebglExposure } from "../../packages/renderer-core/src/composition/render/webgl-exposure.ts";
import {
  WebglDevice,
  type WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { Bounds } from "../../packages/renderer-core/src/composition/evaluate/types.ts";

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

/** Bounded GPU snapshots and signed sums equal the original full-frame accumulation. */
export function checkWebglBoundedExposure() {
  const canvas = document.createElement("canvas");
  canvas.width = 37;
  canvas.height = 29;
  const device = new WebglDevice(canvas);
  const dst = device.surface(37, 29, false, true, true);
  const source = device.surface(37, 29);
  let cases = 0;
  let copiedArea = 0;
  const copy = device.copyRegion.bind(device);
  device.copyRegion = (surface, rect) => {
    copiedArea += (rect.right - rect.left) * (rect.bottom - rect.top);
    return copy(surface, rect);
  };
  try {
    for (const kind of [
      "bounded",
      "changing-background",
      "unknown",
      "full",
      "empty",
      "white",
    ])
      for (let count = 2; count <= 64; count++) {
        const samples = Array.from({ length: count }, (_, i) => {
          const background =
            kind === "white"
              ? [255, 255, 255, 255]
              : kind === "changing-background" && i >= Math.floor(count / 2)
                ? [71, 53, 97, 255]
                : [37, 41, 47, 255];
          const painted: Bounds | null =
            kind === "empty" || i % 5 === 0
              ? null
              : kind === "full"
                ? { left: 0, top: 0, right: 37, bottom: 29 }
                : {
                    left: 1 + (i % 7),
                    top: 3 + (i % 9),
                    right: 19 + (i % 7),
                    bottom: 19 + (i % 9),
                  };
          const pixels = new Uint8Array(37 * 29 * 4);
          for (let y = 0; y < 29; y++)
            for (let x = 0; x < 37; x++) {
              const offset = (y * 37 + x) * 4;
              pixels.set(background, offset);
              if (
                painted &&
                x >= painted.left &&
                x < painted.right &&
                y >= painted.top &&
                y < painted.bottom
              ) {
                for (let c = 0; c < 3; c++)
                  pixels[offset + c] =
                    kind === "white"
                      ? i % 2
                      : (offset * 13 + i * 23 + c * 71) % 256;
              }
            }
          return {
            pixels,
            painted,
            background: new Uint32Array(new Uint8Array(background).buffer)[0]!,
          };
        });
        const render = (i: number) => {
          const sample = samples[i]!;
          device.uploadBytes(source, sample.pixels);
          device.pass(
            "void main() { pixel=texelFetch(source,ivec2(gl_FragCoord.xy),0); }",
            dst,
            [source],
          );
          return {
            painted: sample.painted,
            background:
              (kind === "unknown" && i === 1) ||
              (kind === "unknown-first" && i === 0)
                ? undefined
                : sample.background,
          };
        };
        originalExposure(device, dst, count, render);
        const expected = device.read(dst);
        copiedArea = 0;
        accumulateWebglExposure(device, dst, count, render);
        const actual = device.read(dst);
        for (let byte = 0; byte < actual.length; byte++) {
          let sum = 0;
          for (const sample of samples) sum += sample.pixels[byte]!;
          const average = Math.floor(sum / count + 0.5);
          if (actual[byte] !== expected[byte] || actual[byte] !== average)
            throw new Error(
              `bounded exposure ${kind}/${count} byte ${byte}: ${actual[byte]} != original ${expected[byte]} / independent ${average}`,
            );
        }
        if (
          (kind === "bounded" || kind === "white") &&
          copiedArea >= 37 * 29 * count
        )
          throw new Error(
            `bounded exposure ${kind}/${count} did not reduce snapshot area`,
          );
        if (kind === "empty" && copiedArea !== 0)
          throw new Error("Empty exposure copied pixels");
        if (count === 4)
          for (const failAt of [0, 1, 3]) {
            try {
              accumulateWebglExposure(device, dst, count, (i) => {
                if (i === failAt) throw new Error("bounded sample failure");
                return render(i);
              });
              throw new Error("Missing bounded sample failure");
            } catch (error) {
              if (
                !(error instanceof Error) ||
                error.message !== "bounded sample failure"
              )
                throw error;
            }
            accumulateWebglExposure(device, dst, count, render);
            const recovered = device.read(dst);
            if (recovered.some((v, i) => v !== expected[i]))
              throw new Error(
                `bounded exposure ${kind}: stale pooled sum after sample failure ${failAt}`,
              );
            cases++;
          }
        cases++;
      }
  } finally {
    device.dispose();
  }
  return cases;
}
