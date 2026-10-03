import { seededRandom } from "./commerce-effect-motion.ts";
import type { PixelSurface } from "./pixel-effects.ts";

export function paintRadialLight(
  ctx: CanvasRenderingContext2D,
  effect: {
    x: number;
    y: number;
    radius: number;
    strength: number;
    color: string;
  },
  width: number,
  height: number,
) {
  const x = effect.x;
  const gradient = ctx.createRadialGradient(
    x,
    effect.y,
    0,
    x,
    effect.y,
    effect.radius,
  );
  gradient.addColorStop(0, effect.color);
  gradient.addColorStop(1, effect.color.slice(0, 7) + "00");
  ctx.save();
  ctx.globalAlpha = effect.strength;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
export function paintRisingParticles(
  ctx: CanvasRenderingContext2D,
  effect: {
    progress: number;
    count: number;
    radius: number;
    opacity: number;
    seed: number;
    color: string;
  },
  width: number,
  height: number,
) {
  const random = seededRandom(effect.seed);
  const progress = effect.progress;
  ctx.save();
  ctx.fillStyle = effect.color;
  for (let index = 0; index < effect.count; index++) {
    const x = random() * width,
      offset = random(),
      radius = effect.radius * (0.35 + random() * 0.65),
      sway = 10 + random() * 30;
    const phase = (offset + progress) % 1;
    ctx.globalAlpha = effect.opacity * Math.sin(phase * Math.PI) ** 2;
    ctx.beginPath();
    ctx.arc(
      x + Math.sin(phase * Math.PI * 2) * sway,
      height * (1 - phase),
      radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
export function paintFilmGrain(
  ctx: CanvasRenderingContext2D,
  effect: { amount: number; seed: number; evolution: number },
  grain: PixelSurface,
  width: number,
  height: number,
) {
  const random = seededRandom(
    effect.seed + Math.floor(effect.evolution) * 7919,
  );
  const pixels = grain.ctx.createImageData(
    grain.canvas.width,
    grain.canvas.height,
  );
  for (let index = 0; index < pixels.data.length; index += 4) {
    const value = random() < 0.5 ? 0 : 255;
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
    pixels.data[index + 3] = Math.round(random() * effect.amount * 255);
  }
  grain.ctx.putImageData(pixels, 0, 0);
  ctx.save();
  ctx.fillStyle = ctx.createPattern(grain.canvas, "repeat")!;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
