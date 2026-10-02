import type { CompositionLayer } from "@still-shift/scene-contract";

export const pixelStacks: Record<
  string,
  NonNullable<CompositionLayer["effects"]>
> = {
  directional: [
    {
      id: "direction",
      effect: "blur.directional",
      params: { length: 16, angle: 30, samples: 6 },
    },
  ],
  glow: [
    {
      id: "glow",
      effect: "light.glow",
      params: { radius: 3, intensity: 0.6, threshold: 0.2 },
    },
  ],
  displacement: [
    {
      id: "waves",
      effect: "distort.sine",
      params: { amount: 5, wavelength: 30, phase: 0.8 },
    },
  ],
};
pixelStacks.ordered = [
  ...pixelStacks.directional!,
  ...pixelStacks.glow!,
  ...pixelStacks.displacement!,
];

/** Reference equations, independent of native graph/effect evaluation and kernels. */
export function pixelReference(
  source: HTMLCanvasElement,
  effect: NonNullable<CompositionLayer["effects"]>[number],
) {
  const { width, height } = source;
  const surface = () => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  };
  const canvas = surface(),
    ctx = canvas.getContext("2d")!;
  const p = effect.params as Record<string, number>;
  if (effect.effect === "distort.sine") {
    for (let y = 0; y < height; y++)
      ctx.drawImage(
        source,
        0,
        y,
        width,
        1,
        Math.sin((y / p.wavelength!) * Math.PI * 2 + p.phase!) * p.amount!,
        y,
        width,
        1,
      );
  } else if (effect.effect === "light.glow") {
    const bright = surface(),
      bc = bright.getContext("2d")!;
    const pixels = source.getContext("2d")!.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const luma =
        (pixels.data[i]! * 0.2126 +
          pixels.data[i + 1]! * 0.7152 +
          pixels.data[i + 2]! * 0.0722) /
        255;
      pixels.data[i + 3] = Math.round(
        pixels.data[i + 3]! *
          Math.max(
            0,
            (luma - p.threshold!) / Math.max(0.001, 1 - p.threshold!),
          ),
      );
    }
    bc.putImageData(pixels, 0, 0);
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = p.intensity!;
    ctx.filter = `blur(${p.radius}px)`;
    ctx.drawImage(bright, 0, 0);
  } else if (effect.effect === "blur.directional") {
    const shifted = surface(),
      sc = shifted.getContext("2d")!;
    const sum = new Float32Array(width * height * 4);
    for (let n = 0; n < p.samples!; n++) {
      sc.clearRect(0, 0, width, height);
      const distance = ((n + 0.5) / p.samples! - 0.5) * p.length!;
      sc.drawImage(
        source,
        Math.cos((p.angle! * Math.PI) / 180) * distance,
        Math.sin((p.angle! * Math.PI) / 180) * distance,
      );
      const bytes = sc.getImageData(0, 0, width, height).data;
      for (let i = 0; i < bytes.length; i += 4) {
        const a = bytes[i + 3]! / 255;
        for (let c = 0; c < 3; c++)
          sum[i + c] = sum[i + c]! + bytes[i + c]! * a;
        sum[i + 3] = sum[i + 3]! + a;
      }
    }
    const pixels = ctx.createImageData(width, height);
    for (let i = 0; i < sum.length; i += 4)
      if (sum[i + 3]) {
        for (let c = 0; c < 3; c++)
          pixels.data[i + c] = Math.round(sum[i + c]! / sum[i + 3]!);
        pixels.data[i + 3] = Math.round((sum[i + 3]! * 255) / p.samples!);
      }
    ctx.putImageData(pixels, 0, 0);
  } else throw new Error(`Missing pixel reference: ${effect.effect}`);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  return canvas;
}
