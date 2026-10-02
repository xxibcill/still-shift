import type {
  CompositionLayer,
  CommerceScene,
  CommerceEffect,
} from "@still-shift/scene-contract";
import { effectProgress, effectPhase } from "../../commerce-effect-motion.ts";
import { baked } from "./prepared.ts";

function effectParameters(scene: CommerceScene, effect: CommerceEffect) {
  switch (effect.type) {
    case "background-light":
      return {
        effect: "light.radial",
        params: {
          x: baked(
            Array.from(
              { length: scene.frameCount },
              (_, frame) =>
                effect.x + Math.sin(effectPhase(effect, frame)) * effect.travel,
            ),
          ),
          y: effect.y,
          radius: effect.radius,
          strength: effect.strength,
          color: effect.color,
        },
      };
    case "particles":
      return {
        effect: "particles.rise",
        params: {
          count: effect.count,
          radius: effect.radius,
          opacity: effect.opacity,
          seed: effect.seed,
          color: effect.color,
          progress: baked(
            Array.from(
              { length: scene.frameCount },
              (_, frame) => effectProgress(effect, frame) * effect.cycles,
            ),
          ),
        },
      };
    case "grain":
      return {
        effect: "stylize.grain",
        params: {
          amount: effect.amount,
          seed: effect.seed,
          evolution: baked(
            Array.from(
              { length: scene.frameCount },
              (_, frame) => frame - (effect.active?.start ?? 0),
            ),
          ),
        },
      };
    case "directional-blur":
      return {
        effect: "blur.directional",
        params: {
          length: effect.length,
          angle: effect.angle,
          samples: effect.samples,
        },
      };
    case "glow":
      return {
        effect: "light.glow",
        params: {
          radius: effect.radius,
          intensity: effect.intensity,
          threshold: effect.threshold,
        },
      };
    case "displacement":
      return {
        effect: "distort.sine",
        params: {
          amount: effect.amount,
          wavelength: effect.wavelength,
          phase: baked(
            Array.from({ length: scene.frameCount }, (_, frame) =>
              effectPhase(effect, frame),
            ),
          ),
        },
      };
    case "focus-blur":
      return {
        effect: "blur.gaussian",
        params: {
          radius: baked(
            Array.from({ length: scene.frameCount }, (_, frame) => {
              const p = effectProgress(effect, frame),
                smooth = p * p * (3 - 2 * p);
              return (
                effect.radius + (effect.endRadius - effect.radius) * smooth
              );
            }),
          ),
        },
      };
    default:
      return null;
  }
}

/** Family effects see already-painted root opacity, then the root's matte. */
export function compileCommerceEffects(
  scene: CommerceScene,
  layers: CompositionLayer[],
) {
  const owners = new Map<string, CompositionLayer>();
  const ids = new Set(layers.map((layer) => layer.id));
  let serial = 0;
  const freshId = () => {
    let id: string;
    do {
      id = `effectGroup${++serial}`;
    } while (ids.has(id));
    ids.add(id);
    return id;
  };
  const environment: NonNullable<CompositionLayer["effects"]> = [];
  const finishing: NonNullable<CompositionLayer["effects"]> = [];
  for (const effect of scene.effects ?? []) {
    const compiled = effectParameters(scene, effect);
    if (!compiled) continue;
    const instance = {
      id: `effect${scene.effects!.indexOf(effect)}`,
      ...compiled,
      ...(effect.active
        ? { inPoint: effect.active.start, outPoint: effect.active.end }
        : {}),
    };
    if (!("target" in effect)) {
      (effect.type === "grain" ? finishing : environment).push(instance);
      continue;
    }
    let owner = owners.get(effect.target);
    if (!owner) {
      const target = layers.find((layer) => layer.id === effect.target)!;
      if (target.type === "group") owner = target;
      else {
        const id = freshId();
        owner = {
          id,
          type: "group",
          size: [scene.width, scene.height],
          transform: { anchor: [0, 0] },
          ...(target.trackMatte ? { trackMatte: target.trackMatte } : {}),
        };
        delete target.trackMatte;
        target.parent = id;
        layers.splice(layers.indexOf(target), 0, owner);
      }
      owners.set(effect.target, owner);
    }
    owner.effects ??= [];
    owner.effects.push(instance);
  }
  const adjustment = (
    effects: NonNullable<CompositionLayer["effects"]>,
  ): CompositionLayer => ({
    id: freshId(),
    type: "adjustment",
    size: [scene.width, scene.height],
    transform: { anchor: [0, 0] },
    effects,
  });
  if (environment.length) layers.unshift(adjustment(environment));
  if (finishing.length) layers.push(adjustment(finishing));
}
