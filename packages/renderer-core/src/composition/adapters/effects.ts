import type {
  CompositionLayer,
  CommerceScene,
} from "@still-shift/scene-contract";
import { effectProgress } from "../../commerce-effect-motion.ts";
import { baked } from "./prepared.ts";

/** Family effects see already-painted root opacity, then the root's matte. */
export function compileCommerceEffects(
  scene: CommerceScene,
  layers: CompositionLayer[],
) {
  const owners = new Map<string, CompositionLayer>();
  const ids = new Set(layers.map((layer) => layer.id));
  let serial = 0;
  for (const effect of scene.effects ?? []) {
    if (effect.type !== "focus-blur") continue;
    let owner = owners.get(effect.target);
    if (!owner) {
      const target = layers.find((layer) => layer.id === effect.target)!;
      if (target.type === "group") owner = target;
      else {
        let id: string;
        do {
          id = `effectGroup${++serial}`;
        } while (ids.has(id));
        ids.add(id);
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
    owner.effects.push({
      id: `effect${scene.effects!.indexOf(effect)}`,
      effect: "blur.gaussian",
      ...(effect.active
        ? { inPoint: effect.active.start, outPoint: effect.active.end }
        : {}),
      params: {
        radius: baked(
          Array.from({ length: scene.frameCount }, (_, frame) => {
            const p = effectProgress(effect, frame);
            const smooth = p * p * (3 - 2 * p);
            return effect.radius + (effect.endRadius - effect.radius) * smooth;
          }),
        ),
      },
    });
  }
}
