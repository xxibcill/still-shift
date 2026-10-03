import {
  PreparedNodeSchema,
  type CommerceScene,
} from "@still-shift/scene-contract";
import { commerceMaskVariants } from "./composition-commerce-masks.ts";

export function commerceEffectVariants(id: string, source: CommerceScene) {
  if (id === "commerce/atom-echo") {
    const returning = structuredClone(source);
    returning.events = [];
    returning.motionModel = "curves-1";
    returning.signals = [
      {
        id: "returning",
        keys: [
          { frame: 0, value: -600 },
          { frame: 33, value: 240 },
          { frame: 60, value: 240 },
          { frame: 93, value: -600 },
        ],
      },
    ];
    returning.drivers = [{ target: "product.x", signal: "returning" }];
    returning.nodes.find((node) => node.id === "product")!.opacity = 0.6;
    returning.nodes.push(
      PreparedNodeSchema.parse({
        id: "badge",
        parent: "product",
        type: "rect",
        x: 100,
        y: 120,
        width: 220,
        height: 100,
        fill: "#cf704a",
        opacity: 0.6,
        radius: 12,
      }),
    );
    returning.nodes.push(
      PreparedNodeSchema.parse({
        id: "echoMask",
        type: "rect",
        x: 280,
        y: 400,
        width: 300,
        height: 480,
        fill: "#ffffff",
        opacity: 0.65,
        radius: 20,
      }),
    );
    returning.mattes = [
      {
        target: "product",
        mask: "echoMask",
        invert: true,
        space: "canvas",
        order: "after-effects",
      },
    ];
    returning.effects = [
      { type: "echo", target: "product", spacing: 15, count: 8, decay: 0.65 },
    ];
    const image = structuredClone(source);
    const root = image.nodes.find((node) => node.id === "product")!;
    const art = image.nodes.find((node) => node.id === "product-art")!;
    if (art.type !== "image") throw new Error("Expected image");
    const replacement: Record<string, unknown> = {
      ...root,
      type: "image",
      states: art.states,
      fit: art.fit,
      opacity: 0.65,
      rotation: 11,
    };
    delete replacement.clip;
    image.nodes = [PreparedNodeSchema.parse(replacement)];
    image.events.push({
      node: "product",
      property: "opacity",
      start: 15,
      end: 20,
      to: 0,
      easing: "linear",
    });
    image.events.push({
      node: "product",
      property: "opacity",
      start: 24,
      end: 28,
      to: 0.65,
      easing: "linear",
    });
    image.effects = [
      {
        type: "glow",
        target: "product",
        radius: 5,
        intensity: 0.4,
        threshold: 0.1,
      },
      { ...source.effects![0]!, active: { start: 10, end: 90 } },
    ];
    const zero = structuredClone(source);
    zero.effects = [
      { type: "echo", target: "product", spacing: 3, count: 5, decay: 0 },
    ];
    zero.nodes.find((node) => node.id === "product")!.opacity = 0.55;
    return [
      { id: `${id}/returning-matte`, scene: returning },
      { id: `${id}/image-active-stack`, scene: image },
      { id: `${id}/zero-decay`, scene: zero },
    ];
  }
  if (id === "commerce/atom-light-sweep") {
    const rotated = structuredClone(source);
    const product = rotated.nodes.find((node) => node.id === "product")!;
    product.rotation = 17;
    product.opacity = 0.6;
    rotated.motionModel = "curves-1";
    rotated.signals = [
      {
        id: "skew",
        keys: [
          { frame: 0, value: -8 },
          { frame: 120, value: 12 },
        ],
      },
    ];
    rotated.drivers = [{ target: "product.skewX", signal: "skew" }];
    const image = structuredClone(rotated);
    const root = image.nodes.find((node) => node.id === "product")!;
    const art = image.nodes.find((node) => node.id === "product-art")!;
    if (art.type !== "image") throw new Error("Expected image");
    image.nodes = image.nodes.filter((node) => node.id !== art.id);
    const imageNode: Record<string, unknown> = {
      ...root,
      type: "image",
      states: art.states,
      fit: art.fit,
    };
    delete imageNode.clip;
    image.nodes[image.nodes.indexOf(root)] =
      PreparedNodeSchema.parse(imageNode);
    image.nodes.push(
      PreparedNodeSchema.parse({
        id: "sweepMask",
        type: "rect",
        x: 300,
        y: 320,
        width: 350,
        height: 360,
        fill: "#ffffff",
        opacity: 0.65,
        radius: 22,
      }),
    );
    image.mattes = [
      {
        target: "product",
        mask: "sweepMask",
        invert: true,
        space: "canvas",
        order: "after-effects",
      },
    ];
    const stacked = structuredClone(image);
    stacked.effects = [
      {
        type: "glow",
        target: "product",
        radius: 6,
        intensity: 0.55,
        threshold: 0.2,
      },
      ...stacked.effects!,
    ];
    return [
      { id: `${id}/rotated-skew`, scene: rotated },
      { id: `${id}/image-matte`, scene: image },
      { id: `${id}/glow-first`, scene: stacked },
    ];
  }
  if (id === "commerce/atom-particles") {
    const combined = structuredClone(source);
    combined.nodes.find((node) => node.id === "product")!.opacity = 0.7;
    combined.effects = [
      { ...combined.effects![0]!, active: { start: 10, end: 190 } },
      {
        type: "background-light",
        start: 0,
        end: 200,
        cycles: 2,
        x: 480,
        y: 650,
        radius: 600,
        travel: 130,
        strength: 0.65,
        color: "#c85c23",
        active: { start: 20, end: 170 },
      },
      {
        type: "grain",
        amount: 0.075,
        seed: 246,
        active: { start: 17, end: 210 },
      },
    ];
    const reversed = structuredClone(combined);
    reversed.effects = [
      reversed.effects![1]!,
      reversed.effects![0]!,
      reversed.effects![2]!,
    ];
    return [
      { id: `${id}/environment-stack`, scene: combined },
      { id: `${id}/environment-reversed`, scene: reversed },
    ];
  }
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
