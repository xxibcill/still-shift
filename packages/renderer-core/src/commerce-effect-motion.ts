import type {
  CommerceEffect,
  EffectOf,
} from "../../scene-contract/src/commerce-effects.ts";

export function effectProgress(
  effect: { start: number; end: number },
  frame: number,
) {
  return Math.max(
    0,
    Math.min(1, (frame - effect.start) / (effect.end - effect.start)),
  );
}
export function effectPhase(
  effect: { start: number; end: number; cycles: number },
  frame: number,
) {
  return effectProgress(effect, frame) * effect.cycles * Math.PI * 2;
}
export function exposureFrames(
  frame: number,
  frameCount: number,
  shutterAngle: number,
  samples: number,
) {
  return Array.from({ length: samples }, (_, index) =>
    Math.max(
      0,
      Math.min(
        frameCount - 1,
        frame + (((index + 0.5) / samples - 0.5) * shutterAngle) / 360,
      ),
    ),
  );
}
export function shadowResponse(
  effect: EffectOf<"height-shadow">,
  sourceY: number,
) {
  const height = Math.max(
    0,
    Math.min(1, (effect.restY - sourceY) / effect.travel),
  );
  return {
    scale: 1 + effect.spread * height,
    opacity: 1 - effect.fade * height,
  };
}
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
type MotionState = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
};
export function applyCommerceEffectMotion<T extends MotionState>(
  state: T,
  target: string,
  effects: CommerceEffect[],
  frame: number,
  sourceY: (id: string) => number,
): T {
  const result = { ...state };
  for (const effect of effects) {
    if (!isEffectActive(effect, frame)) continue;
    if (!("target" in effect) || effect.target !== target) continue;
    switch (effect.type) {
      case "drift": {
        const phase = effectPhase(effect, frame);
        result.x += Math.sin(phase) * effect.travelX;
        result.rotation += Math.sin(phase) * effect.tilt;
        break;
      }
      case "parallax": {
        const phase = effectPhase(effect, frame);
        result.x += Math.sin(phase) * effect.travelX * effect.depth;
        result.y += (Math.cos(phase) - 1) * effect.travelY * effect.depth;
        break;
      }
      case "overshoot": {
        const progress = effectProgress(effect, frame);
        result[effect.axis] +=
          effect.amplitude *
          Math.sin(progress * Math.PI * 2 * effect.oscillations) *
          (1 - progress) ** 3;
        break;
      }
      case "height-shadow": {
        const response = shadowResponse(effect, sourceY(effect.source));
        result.scaleX *= response.scale;
        result.scaleY *= response.scale;
        result.opacity *= response.opacity;
        break;
      }
    }
  }
  return result;
}

export function isEffectActive(effect: CommerceEffect, frame: number) {
  return (
    !effect.active ||
    (frame >= effect.active.start && frame < effect.active.end)
  );
}
