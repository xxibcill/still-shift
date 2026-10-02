import type { Matrix } from "./node-transform.ts";
/** Deterministic pixel kernels shared by family and composition renderers. */
export type PixelSurface = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};
export type PixelEffectContext<S extends PixelSurface> = {
  createSurface(width: number, height: number): S;
  releaseSurface(surface: S): void;
  clear(surface: S, background: null): void;
};

export function glow<S extends PixelSurface>(
  context: PixelEffectContext<S>,
  layer: S,
  effect: { radius: number; intensity: number; threshold: number },
) {
  if (!effect.intensity || !effect.radius) return;
  const { width, height } = layer.canvas;
  const scratch = context.createSurface(width, height);
  try {
    context.clear(scratch, null);
    const pixels = layer.ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const luminance =
        (0.2126 * pixels.data[i]! +
          0.7152 * pixels.data[i + 1]! +
          0.0722 * pixels.data[i + 2]!) /
        255;
      pixels.data[i + 3] = Math.round(
        pixels.data[i + 3]! *
          Math.max(
            0,
            (luminance - effect.threshold) /
              Math.max(0.001, 1 - effect.threshold),
          ),
      );
    }
    scratch.ctx.putImageData(pixels, 0, 0);
    layer.ctx.save();
    layer.ctx.globalCompositeOperation = "screen";
    layer.ctx.globalAlpha = effect.intensity;
    layer.ctx.filter = `blur(${effect.radius}px)`;
    layer.ctx.drawImage(scratch.canvas, 0, 0);
    layer.ctx.restore();
  } finally {
    context.releaseSurface(scratch);
  }
}
export function directionalBlur<S extends PixelSurface>(
  context: PixelEffectContext<S>,
  layer: S,
  effect: { length: number; angle: number; samples: number },
) {
  if (effect.length === 0) return;
  const { width, height } = layer.canvas;
  const scratch = context.createSurface(width, height);
  try {
    const sum = new Float32Array(width * height * 4);
    for (let i = 0; i < effect.samples; i++) {
      context.clear(scratch, null);
      const distance = ((i + 0.5) / effect.samples - 0.5) * effect.length;
      scratch.ctx.drawImage(
        layer.canvas,
        Math.cos((effect.angle * Math.PI) / 180) * distance,
        Math.sin((effect.angle * Math.PI) / 180) * distance,
      );
      const pixels = scratch.ctx.getImageData(0, 0, width, height).data;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const alpha = pixels[offset + 3]! / 255;
        sum[offset] = sum[offset]! + pixels[offset]! * alpha;
        sum[offset + 1] = sum[offset + 1]! + pixels[offset + 1]! * alpha;
        sum[offset + 2] = sum[offset + 2]! + pixels[offset + 2]! * alpha;
        sum[offset + 3] = sum[offset + 3]! + alpha;
      }
    }
    const output = layer.ctx.createImageData(width, height);
    for (let offset = 0; offset < sum.length; offset += 4) {
      const alpha = sum[offset + 3]!;
      if (alpha === 0) continue;
      output.data[offset] = Math.round(sum[offset]! / alpha);
      output.data[offset + 1] = Math.round(sum[offset + 1]! / alpha);
      output.data[offset + 2] = Math.round(sum[offset + 2]! / alpha);
      output.data[offset + 3] = Math.round((alpha * 255) / effect.samples);
    }
    context.clear(layer, null);
    layer.ctx.putImageData(output, 0, 0);
  } finally {
    context.releaseSurface(scratch);
  }
}

export function sineDisplacement<S extends PixelSurface>(
  context: PixelEffectContext<S>,
  layer: S,
  effect: { amount: number; wavelength: number; phase: number },
) {
  if (effect.amount === 0) return;
  const { width, height } = layer.canvas;
  const scratch = context.createSurface(width, height);
  try {
    context.clear(scratch, null);
    const phase = effect.phase;
    for (let y = 0; y < height; y++) {
      const shift =
        Math.sin((y / effect.wavelength) * Math.PI * 2 + phase) * effect.amount;
      scratch.ctx.drawImage(layer.canvas, 0, y, width, 1, shift, y, width, 1);
    }
    context.clear(layer, null);
    layer.ctx.drawImage(scratch.canvas, 0, 0);
  } finally {
    context.releaseSurface(scratch);
  }
}

export type PixelEffectPlacement = { matrix: Matrix; transforms?: Matrix[] };
export type LightSweepParams = {
  width: number;
  height: number;
  left: number;
  top: number;
  regionWidth: number;
  regionHeight: number;
  band: number;
  progress: number;
  strength: number;
};

/** Paint in layer coordinates, intersect source alpha, then mix with source-atop. */
export function lightSweep<S extends PixelSurface>(
  context: PixelEffectContext<S>,
  layer: S,
  params: LightSweepParams,
  placement: PixelEffectPlacement,
) {
  const scratch = context.createSurface(
    layer.canvas.width,
    layer.canvas.height,
  );
  try {
    context.clear(scratch, null);
    const ctx = scratch.ctx;
    ctx.save();
    if (placement.transforms)
      for (const transform of placement.transforms) ctx.transform(...transform);
    else ctx.transform(...placement.matrix);
    ctx.beginPath();
    ctx.rect(
      params.left * params.width,
      params.top * params.height,
      params.regionWidth * params.width,
      params.regionHeight * params.height,
    );
    ctx.clip();
    const center =
      (params.left -
        params.band +
        (params.regionWidth + params.band * 2) * params.progress) *
      params.width;
    const radius = params.band * params.width;
    const gradient = ctx.createLinearGradient(
      center - radius,
      0,
      center + radius,
      0,
    );
    gradient.addColorStop(0, "#FFFFFF00");
    gradient.addColorStop(0.5, "#FFFFFF");
    gradient.addColorStop(1, "#FFFFFF00");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, params.width, params.height);
    ctx.restore();
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(layer.canvas, 0, 0);
    layer.ctx.save();
    layer.ctx.globalCompositeOperation = "source-atop";
    layer.ctx.globalAlpha = params.strength;
    layer.ctx.drawImage(scratch.canvas, 0, 0);
    layer.ctx.restore();
  } finally {
    context.releaseSurface(scratch);
  }
}
