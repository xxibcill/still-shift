import type {
  CompositionLayer,
  CommerceEffect,
} from "@still-shift/scene-contract";
import { effectProgress, effectPhase } from "../../commerce-effect-motion.ts";
import { baked } from "./prepared.ts";
import type { CommerceRenderScene } from "../../commerce-scene.ts";
import type { StoryRenderScene } from "../../story-scene.ts";
import type { CinematicRenderScene } from "../../cinematic-scene.ts";
import { samplePreparedFamilyState as evaluatePreparedNodeAtTime } from "./family-state.ts";

type EffectScene =
  | CommerceRenderScene
  | StoryRenderScene
  | CinematicRenderScene;

/** Equal source poses share an identity even when an animation returns to a prior pose. */
function echoRevisions(
  scene: EffectScene,
  target: string,
  times: readonly number[],
) {
  const descendants = new Set([target]);
  for (let i = 0; i < scene.nodes.length; i++)
    for (const node of scene.nodes)
      if (node.parent && descendants.has(node.parent)) descendants.add(node.id);
  const nodes = scene.nodes.filter((node) => descendants.has(node.id));
  const identities = new Map<string, number>();
  return baked(
    times.map((frame) => {
      const pose = JSON.stringify(
        nodes.map((node) => evaluatePreparedNodeAtTime(scene, node, frame)),
      );
      if (!identities.has(pose)) identities.set(pose, identities.size);
      return identities.get(pose)!;
    }),
  );
}

function effectParameters(
  scene: EffectScene,
  effect: CommerceEffect,
  times: readonly number[],
) {
  switch (effect.type) {
    case "echo":
      return {
        effect: "time.echo",
        params: {
          spacing: effect.spacing,
          count: effect.count,
          decay: effect.decay,
          skipUnchanged: 1,
          sourceRevision: echoRevisions(scene, effect.target, times),
        },
      };
    case "light-sweep": {
      const node = scene.nodes.find((node) => node.id === effect.target)!;
      return {
        effect: "light.sweep",
        space: effect.target,
        params: {
          width: node.width,
          height: node.height,
          left: effect.region[0],
          top: effect.region[1],
          regionWidth: effect.region[2],
          regionHeight: effect.region[3],
          band: effect.width,
          strength: effect.strength,
          progress: baked(
            times.map(
              (frame) => (1 - Math.cos(effectPhase(effect, frame))) / 2,
            ),
          ),
        },
      };
    }
    case "background-light":
      return {
        effect: "light.radial",
        params: {
          x: baked(
            times.map(
              (frame) =>
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
            times.map((frame) => effectProgress(effect, frame) * effect.cycles),
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
            times.map((frame) => frame - (effect.active?.start ?? 0)),
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
          phase: baked(times.map((frame) => effectPhase(effect, frame))),
        },
      };
    case "focus-blur":
      return {
        effect: "blur.gaussian",
        params: {
          radius: baked(
            times.map((frame) => {
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
export function compileFamilyEffects(
  scene: EffectScene,
  layers: CompositionLayer[],
  roots: ReadonlyMap<string, string> = new Map(),
  times: readonly number[] = Array.from(
    { length: scene.timeline.frameCount },
    (_, frame) => frame,
  ),
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
    const compiled = effectParameters(scene, effect, times);
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
      const target = layers.find(
        (layer) => layer.id === (roots.get(effect.target) ?? effect.target),
      )!;
      if (target.type === "group") owner = target;
      else {
        const id = freshId();
        owner = {
          id,
          type: "group",
          size: [scene.width, scene.height],
          transform: { anchor: [0, 0] },
          ...(target.cameraDepth !== undefined
            ? { cameraDepth: target.cameraDepth }
            : {}),
          ...(target.trackMatte ? { trackMatte: target.trackMatte } : {}),
        };
        delete target.trackMatte;
        delete target.cameraDepth;
        target.parent = id;
        layers.splice(layers.indexOf(target), 0, owner);
      }
      owners.set(effect.target, owner);
    }
    if (effect.type === "echo" && owner.id !== effect.target) {
      const source = scene.nodes.find((node) => node.id === effect.target)!;
      owner.transform!.opacity = baked(
        times.map((frame) =>
          evaluatePreparedNodeAtTime(scene, source, frame).opacity > 0 ? 1 : 0,
        ),
      );
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
    ...(scene.schemaVersion === "story-scene-1" ? { cameraDepth: 0 } : {}),
    effects,
  });
  if (environment.length) layers.unshift(adjustment(environment));
  if (finishing.length) layers.push(adjustment(finishing));
}
