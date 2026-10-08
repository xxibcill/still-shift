import { seededRandom } from "./commerce-effect-motion.ts";
import type { PixelSurface } from "./pixel-effects.ts";
import { renderMemory } from "./managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
} from "./managed-metadata.ts";

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
type RisingParticles = {
  progress: number;
  count: number;
  radius: number;
  opacity: number;
  seed: number;
  color: string;
};

/** Seeded particle geometry shared by painting and conservative bounds. */
export function risingParticles(
  effect: RisingParticles,
  width: number,
  height: number,
) {
  const managed = renderMemory() !== undefined;
  const setup = allocateRenderMetadata<{ random?: (() => number) | undefined }>(
    512,
    () => ({}),
    false,
    (value) => {
      value.random = undefined;
    },
  );
  let particles:
    | { alpha: number; x: number; y: number; radius: number }[]
    | undefined;
  let bytes = 512;
  try {
    const random = (setup.random = seededRandom(effect.seed));
    const progress = effect.progress;
    particles = allocateRenderMetadata(
      bytes,
      () => [],
      false,
      (value) => {
        value.length = 0;
      },
    );
    for (let index = 0; index < effect.count; index++) {
      if (managed) {
        resizeRenderMetadata(particles, bytes + 128);
        bytes += 128;
      }
      const x = random() * width,
        offset = random(),
        radius = effect.radius * (0.35 + random() * 0.65),
        sway = 10 + random() * 30;
      const phase = (offset + progress) % 1;
      particles.push({
        alpha: effect.opacity * Math.sin(phase * Math.PI) ** 2,
        x: x + Math.sin(phase * Math.PI * 2) * sway,
        y: height * (1 - phase),
        radius,
      });
    }
    return particles;
  } catch (error) {
    try {
      if (particles) releaseRenderMetadata(particles);
    } catch {
      /* Preserve original particle/factory/getter failure. */
    }
    throw error;
  } finally {
    setup.random = undefined;
    releaseRenderMetadata(setup);
  }
}

export function paintRisingParticles(
  ctx: CanvasRenderingContext2D,
  effect: RisingParticles,
  width: number,
  height: number,
) {
  ctx.save();
  let particles: ReturnType<typeof risingParticles> | undefined;
  let restored = false;
  try {
    ctx.fillStyle = effect.color;
    particles = risingParticles(effect, width, height);
    for (const particle of particles) {
      ctx.globalAlpha = particle.alpha;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  } catch (error) {
    restored = true;
    try {
      ctx.restore();
    } catch {
      /* Preserve original particle/draw failure. */
    }
    throw error;
  } finally {
    try {
      if (!restored) ctx.restore();
    } finally {
      if (particles) releaseRenderMetadata(particles);
    }
  }
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
