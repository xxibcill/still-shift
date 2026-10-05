import { renderCanvasEffect } from "./effect-plugins.ts";
import type { RenderEffect } from "./graph.ts";
import {
  paintRadialLight,
  paintRisingParticles,
  paintFilmGrain,
} from "../../pixel-generators.ts";
import { cssColor } from "./canvas2d.ts";
import type { Rgba } from "../evaluate/types.ts";
import {
  glow,
  directionalBlur,
  sineDisplacement,
  lightSweep,
  type LightSweepParams,
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
  params: EvaluatedEffect["params"],
  placement: RenderEffect["placement"],
) => void;

const effects: Readonly<Record<string, CanvasEffect>> = {
  "light.sweep": (context, target, params, placement) => {
    if (!placement)
      throw new Error(
        "comp-effect-space: light.sweep requires layer coordinates",
      );
    lightSweep(context, target, params as LightSweepParams, placement);
  },
  "light.radial": (_context, target, params) =>
    paintRadialLight(
      target.ctx,
      {
        x: params.x as number,
        y: params.y as number,
        radius: params.radius as number,
        strength: params.strength as number,
        color: cssColor(params.color as Rgba),
      },
      target.width,
      target.height,
    ),
  "particles.rise": (_context, target, params) =>
    paintRisingParticles(
      target.ctx,
      {
        progress: params.progress as number,
        count: params.count as number,
        radius: params.radius as number,
        opacity: params.opacity as number,
        seed: params.seed as number,
        color: cssColor(params.color as Rgba),
      },
      target.width,
      target.height,
    ),
  "stylize.grain": (context, target, params) => {
    const grain = context.createSurface(128, 128);
    try {
      paintFilmGrain(
        target.ctx,
        {
          amount: params.amount as number,
          seed: params.seed as number,
          evolution: params.evolution as number,
        },
        grain,
        target.width,
        target.height,
      );
    } finally {
      context.releaseSurface(grain);
    }
  },

  "blur.directional": (context, target, params) =>
    directionalBlur(context, target, {
      length: params.length as number,
      angle: params.angle as number,
      samples: params.samples as number,
    }),
  "light.glow": (context, target, params) =>
    glow(context, target, {
      radius: params.radius as number,
      intensity: params.intensity as number,
      threshold: params.threshold as number,
    }),
  "distort.sine": (context, target, params) =>
    sineDisplacement(context, target, {
      amount: params.amount as number,
      wavelength: params.wavelength as number,
      phase: params.phase as number,
    }),
  "blur.gaussian": (context, target, params) => {
    if ((params.radius as number) <= 0) return;
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
  stack: RenderEffect[],
) {
  for (const effect of stack) {
    if (!effect.enabled) continue;
    if (renderCanvasEffect(context, target, effect)) continue;
    const render = Object.hasOwn(effects, effect.effect)
      ? effects[effect.effect]
      : undefined;
    if (!render)
      throw new Error(
        `comp-effect-unavailable: ${effect.effect} has no Canvas implementation`,
      );
    if (effect.enabled)
      render(context, target, effect.params, effect.placement);
  }
}
