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
  if (id === "commerce/atom-displacement") {
    const stack = structuredClone(source);
    const target = stack.effects!.find((e) => e.type === "displacement")!;
    if (target.type !== "displacement")
      throw new Error("Expected displacement");
    stack.nodes.find((n) => n.id === target.target)!.opacity = 0.65;
    stack.effects = [
      {
        type: "directional-blur",
        target: target.target,
        length: 15,
        angle: 37,
        samples: 4,
        active: { start: 30, end: 140 },
      },
      {
        type: "glow",
        target: target.target,
        radius: 6,
        intensity: 0.6,
        threshold: 0.2,
        active: { start: 15, end: 180 },
      },
      {
        type: "displacement",
        target: target.target,
        start: 0,
        end: 239,
        cycles: 2,
        amount: 6,
        wavelength: 80,
      },
      {
        type: "focus-blur",
        target: target.target,
        start: 0,
        end: 90,
        radius: 4,
        endRadius: 0,
      },
    ];
    const reverse = structuredClone(stack);
    reverse.effects!.reverse();
    return [
      { id: `${id}/pixel-stack`, scene: stack },
      { id: `${id}/pixel-reversed`, scene: reverse },
    ];
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
