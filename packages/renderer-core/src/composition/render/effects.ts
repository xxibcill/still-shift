import {
  glow,
  directionalBlur,
  sineDisplacement,
} from "../../pixel-effects.ts";
import type { EvaluatedEffect } from "../evaluate/effects.ts";
import type { CanvasSurface } from "./canvas2d.ts";

export type CanvasEffectContext = {
  createSurface(width: number, height: number): CanvasSurface;
  releaseSurface(surface: CanvasSurface): void;
  clear(surface: CanvasSurface, background: null): void;
};
type CanvasEffect = (
  context: CanvasEffectContext,
  target: CanvasSurface,
  params: Record<string, number>,
) => void;

const effects: Readonly<Record<string, CanvasEffect>> = {
  "blur.directional": (context, target, params) =>
    directionalBlur(context, target, {
      length: params.length!,
      angle: params.angle!,
      samples: params.samples!,
    }),
  "light.glow": (context, target, params) =>
    glow(context, target, {
      radius: params.radius!,
      intensity: params.intensity!,
      threshold: params.threshold!,
    }),
  "distort.sine": (context, target, params) =>
    sineDisplacement(context, target, {
      amount: params.amount!,
      wavelength: params.wavelength!,
      phase: params.phase!,
    }),
  "blur.gaussian": (context, target, params) => {
    if (params.radius! <= 0) return;
    const scratch = context.createSurface(target.width, target.height);
    try {
      scratch.ctx.filter = `blur(${params.radius}px)`;
      scratch.ctx.drawImage(target.canvas, 0, 0);
      context.clear(target, null);
      target.ctx.drawImage(scratch.canvas, 0, 0);
    } finally {
      context.releaseSurface(scratch);
    }
  },
};

export function applyCanvasEffects(
  context: CanvasEffectContext,
  target: CanvasSurface,
  stack: EvaluatedEffect[],
) {
  for (const effect of stack) {
    const render = Object.hasOwn(effects, effect.effect)
      ? effects[effect.effect]
      : undefined;
    if (!render)
      throw new Error(
        `comp-effect-unavailable: ${effect.effect} has no Canvas implementation`,
      );
    if (effect.enabled) render(context, target, effect.params);
  }
}
