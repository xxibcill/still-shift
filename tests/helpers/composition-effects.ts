import type { CommerceScene } from "@still-shift/scene-contract";
import { commerceMaskVariants } from "./composition-commerce-masks.ts";

export function commerceEffectVariants(id: string, source: CommerceScene) {
  if (id === "commerce/atom-focus-blur") {
    const gated = structuredClone(source);
    for (const effect of gated.effects ?? []) {
      if (effect.type !== "focus-blur") continue;
      effect.active = { start: 15, end: 100 };
      gated.nodes.find((node) => node.id === effect.target)!.opacity = 0.55;
    }
    return [{ id: `${id}/active-opacity`, scene: gated }];
  }
  if (id !== "commerce/atom-matte") return [];
  return commerceMaskVariants(id, source).map(({ id, scene }) => {
    scene.effects = [
      {
        type: "focus-blur",
        target: "product",
        start: 60,
        end: 180,
        radius: 8,
        endRadius: 0,
        active: { start: 60, end: 200 },
      },
    ];
    return { id: `${id}/focus-matte`, scene };
  });
}
