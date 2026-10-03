import type { CommerceEffect, StoryScene } from "@still-shift/scene-contract";
import { storyComponentVariants } from "./composition-story-components.ts";

export function storyEffectVariants(id: string, source: StoryScene) {
  const enable = (scene: StoryScene, effects: CommerceEffect[]) => {
    scene.motionModel = "curves-1";
    scene.effectsVersion = "effects-1";
    scene.effects = effects;
    return scene;
  };
  const sweep = (target: string): CommerceEffect => ({
    type: "light-sweep",
    target,
    start: 0,
    end: source.frameCount - 1,
    cycles: 2,
    region: [0, 0, 1, 1],
    width: 0.15,
    strength: 0.7,
  });
  if (id === "component/story-state") {
    const grouped = structuredClone(source);
    grouped.nodes.find((node) => node.id === "house-art-a")!.opacity = 0.6;
    enable(grouped, [
      {
        type: "focus-blur",
        target: "house-a",
        start: 0,
        end: 150,
        radius: 5,
        endRadius: 0,
      },
      {
        type: "grain",
        amount: 0.08,
        seed: 42,
        active: { start: 20, end: 170 },
      },
    ]);
    const image = structuredClone(source);
    const inset = image.nodes.find((node) => node.id === "behavior__inset")!;
    const parent = image.nodes.find((node) => node.id === inset.parent)!;
    inset.x += parent.x;
    inset.y += parent.y;
    delete inset.parent;
    inset.opacity = 0.55;
    inset.rotation = 12;
    image.camera!.depth[inset.id] = 0.35;
    enable(image, [
      {
        type: "directional-blur",
        target: inset.id,
        length: 16,
        angle: 25,
        samples: 4,
        active: { start: 10, end: 160 },
      },
      sweep(inset.id),
    ]);
    const text = storyComponentVariants(id, source)[0]!.scene;
    text.camera!.depth.behavior__caption = 0.5;
    enable(text, [
      {
        type: "glow",
        target: "behavior__caption",
        radius: 3,
        intensity: 0.5,
        threshold: 0.2,
      },
      sweep("behavior__caption"),
    ]);
    return [
      { id: `${id}/effects-group-grain`, scene: grouped },
      { id: `${id}/effects-image-sweep`, scene: image },
      { id: `${id}/effects-text-sweep`, scene: text },
    ];
  }
  if (id === "component/story-leader")
    return storyComponentVariants(id, source).map((item) => {
      // Attached annotations own their geometry and prohibit effects; use a free path.
      item.scene.componentData!.annotations = [];
      const path = item.scene.nodes.find(
        (node) => node.id === "annotation__line",
      )!;
      if (path.type !== "path") throw new Error("Expected path");
      path.points = [
        [820, 310],
        [670, 355],
      ];
      return {
        id: `${id}/effects-${item.id.split("/").at(-1)}`,
        scene: enable(item.scene, [
          {
            type: "directional-blur",
            target: "annotation__line",
            length: 12,
            angle: -20,
            samples: 4,
            active: { start: 10, end: 160 },
          },
          {
            type: "glow",
            target: "annotation__line",
            radius: 3,
            intensity: 0.7,
            threshold: 0.1,
          },
          sweep("annotation__line"),
        ]),
      };
    });
  return [];
}
