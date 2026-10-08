import type { CinematicScene } from "@still-shift/scene-contract";

/** Each effects-1 operator and fractional shutter clocks are exercised on native camera planes. */
export function cinematicEffectVariants(id: string, source: CinematicScene) {
  if (id !== "cinematic/threshold-push") return [];
  const subject = source.nodes.find(
    (node) => node.id === source.recipe.subject,
  )!;
  const variants: {
    name: string;
    effects: NonNullable<CinematicScene["effects"]>;
  }[] = [
    { name: "grain", effects: [{ type: "grain", amount: 0.03, seed: 4 }] },
    {
      name: "glow",
      effects: [
        {
          type: "glow",
          target: subject.id,
          radius: 3,
          intensity: 0.3,
          threshold: 0.2,
        },
      ],
    },
    {
      name: "directional",
      effects: [
        {
          type: "directional-blur",
          target: subject.id,
          length: 4,
          angle: 35,
          samples: 4,
        },
      ],
    },
    {
      name: "focus",
      effects: [
        {
          type: "focus-blur",
          target: subject.id,
          radius: 1,
          endRadius: 3,
          start: 8,
          end: 40,
        },
      ],
    },
    {
      name: "sweep",
      effects: [
        {
          type: "light-sweep",
          target: subject.id,
          region: [0, 0, 1, 1],
          width: 0.2,
          strength: 0.3,
          start: 0,
          end: 47,
          cycles: 1,
        },
      ],
    },
    {
      name: "shutter",
      effects: [{ type: "motion-blur", shutterAngle: 180, samples: 4 }],
    },
  ];
  variants.push({
    name: "active-stack",
    effects: [
      { type: "motion-blur", shutterAngle: 270, samples: 4 },
      { ...variants[1]!.effects[0]!, active: { start: 12, end: 36 } },
      variants[0]!.effects[0]!,
    ],
  });
  return variants.map((variant) => ({
    id: `${id}/effects-${variant.name}`,
    scene: {
      ...structuredClone(source),
      durationMs: 3000,
      effectsVersion: "effects-1" as const,
      effects: variant.effects,
    },
  }));
}

/** A valid authored focus gap must not exceed the native aperture budget. */
export function cinematicFocusVariants(id: string, source: CinematicScene) {
  if (id !== "cinematic/focus-handoff") return [];
  const scene = structuredClone(source);
  const subject = scene.layers.find(
    (layer) => layer.node === scene.recipe.subject,
  )!;
  scene.layers.find((layer) => layer.node === scene.recipe.foreground)!.depth =
    subject.depth - 1e-12;
  return [{ id: `${id}/close-gap`, scene }];
}
