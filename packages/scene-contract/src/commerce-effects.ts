import { z } from "zod";

const finite = z.number().finite();
const unit = finite.min(0).max(1);
const target = z.string().regex(/^[a-zA-Z][\w-]*$/);
const window = {
  start: finite.int().nonnegative(),
  end: finite.int().positive(),
};
const loop = { ...window, cycles: finite.int().min(1).max(8) };
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
const seed = finite.int().min(0).max(2147483647);
export const CommerceEffectSchema = z.discriminatedUnion("type", [
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("motion-blur"),
      shutterAngle: finite.min(0).max(360),
      samples: finite.int().min(2).max(32),
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("directional-blur"),
      target,
      length: finite.min(0).max(100),
      angle: finite.min(-180).max(180),
      samples: finite.int().min(2).max(32),
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("overshoot"),
      target,
      ...window,
      axis: z.enum(["x", "y"]),
      amplitude: finite.min(-100).max(100),
      oscillations: finite.int().min(1).max(4),
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("drift"),
      target,
      ...loop,
      travelX: finite.min(0).max(100),
      tilt: finite.min(0).max(5),
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("height-shadow"),
      target,
      source: target,
      restY: finite,
      travel: finite.positive(),
      spread: finite.min(0).max(0.5),
      fade: unit,
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("focus-blur"),
      target,
      ...window,
      radius: finite.min(0).max(40),
      endRadius: finite.min(0).max(40),
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("parallax"),
      target,
      ...loop,
      travelX: finite.min(-100).max(100),
      travelY: finite.min(-100).max(100),
      depth: finite.min(0).max(2),
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("light-sweep"),
      target,
      ...loop,
      region: z.tuple([unit, unit, unit.positive(), unit.positive()]),
      width: finite.min(0.02).max(0.5),
      strength: unit,
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("glow"),
      target,
      radius: finite.min(0).max(50),
      intensity: unit,
      threshold: unit,
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("echo"),
      target,
      spacing: finite.int().min(1).max(15),
      count: finite.int().min(1).max(8),
      decay: finite.min(0).max(0.8),
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("grain"),
      amount: finite.min(0).max(0.15),
      seed,
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("particles"),
      ...loop,
      count: finite.int().min(1).max(100),
      radius: finite.min(0.5).max(8),
      opacity: unit,
      seed,
      color,
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("background-light"),
      ...loop,
      x: finite,
      y: finite,
      radius: finite.min(50).max(2000),
      travel: finite.min(0).max(400),
      strength: unit,
      color,
    })
    .strict(),
  z
    .object({
      active: z
        .object({
          start: finite.int().nonnegative(),
          end: finite.int().positive(),
        })
        .strict()
        .optional(),
      type: z.literal("displacement"),
      target,
      ...loop,
      amount: finite.min(0).max(40),
      wavelength: finite.min(50).max(1000),
    })
    .strict(),
]);
export type CommerceEffect = z.infer<typeof CommerceEffectSchema>;
export type EffectOf<T extends CommerceEffect["type"]> = Extract<
  CommerceEffect,
  { type: T }
>;
export const COMMERCE_EFFECTS_VERSION = "commerce-effects-1";

export const EffectDemoKindSchema = z.enum([
  "motion-blur",
  "directional-blur",
  "overshoot",
  "drift",
  "height-shadow",
  "focus-blur",
  "parallax",
  "light-sweep",
  "glow",
  "echo",
  "grain",
  "particles",
  "background-light",
  "displacement",
  "effects-studio",
]);
export type EffectDemoKind = z.infer<typeof EffectDemoKindSchema>;
export const EffectDemoSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    amount: finite.min(0).max(2).default(1),
    shutterAngle: finite.min(0).max(360).default(180),
    samples: finite.int().min(2).max(32).default(16),
    seed: seed.default(37),
  })
  .strict();
export type EffectDemoSettings = z.infer<typeof EffectDemoSettingsSchema>;
export const EFFECT_DEMOS: {
  id: EffectDemoKind;
  name: string;
  group: string;
  description: string;
  amountLabel: string;
}[] = [
  {
    id: "motion-blur",
    name: "Motion Blur",
    group: "Exposure",
    description:
      "A fast entrance sampled across the shutter exposure, followed by a sharp hold.",
    amountLabel: "Exposure multiplier",
  },
  {
    id: "directional-blur",
    name: "Directional Blur",
    group: "Image effect",
    description:
      "An authored horizontal smear. Compare this graphic treatment with true exposure blur.",
    amountLabel: "Smear length",
  },
  {
    id: "overshoot",
    name: "Overshoot + Settle",
    group: "Motion",
    description:
      "A rigid entrance continues briefly beyond its destination, then settles.",
    amountLabel: "Overshoot distance",
  },
  {
    id: "drift",
    name: "Drift + Rock",
    group: "Motion",
    description:
      "A small sideways arc and in-plane tilt accompany the vertical float.",
    amountLabel: "Drift and tilt",
  },
  {
    id: "height-shadow",
    name: "Responsive Shadow",
    group: "Relationship",
    description:
      "The studio shadow grows wider and lighter as the intact product rises.",
    amountLabel: "Shadow response",
  },
  {
    id: "focus-blur",
    name: "Focus Handoff",
    group: "Image effect",
    description:
      "Focus moves from the rear studio panels to a sharp product, then holds.",
    amountLabel: "Focus separation",
  },
  {
    id: "parallax",
    name: "Layered Parallax",
    group: "Relationship",
    description:
      "Separate studio planes move at different rates. The bottle retains its original view.",
    amountLabel: "Depth travel",
  },
  {
    id: "light-sweep",
    name: "Material Highlight",
    group: "Lighting",
    description:
      "A soft sweep is confined to an authored cap region and the product’s alpha.",
    amountLabel: "Highlight intensity",
  },
  {
    id: "glow",
    name: "Highlight Bloom",
    group: "Lighting",
    description:
      "A restrained bloom spreads from bright product pixels above a threshold.",
    amountLabel: "Bloom intensity",
  },
  {
    id: "echo",
    name: "Echo Trail",
    group: "Image effect",
    description:
      "Fading copies trace the entrance and disappear once the product settles.",
    amountLabel: "Trail opacity",
  },
  {
    id: "grain",
    name: "Film Grain",
    group: "Texture",
    description: "Seeded monochrome texture adds a light photographic finish.",
    amountLabel: "Grain strength",
  },
  {
    id: "particles",
    name: "Atmosphere",
    group: "Texture",
    description:
      "Sparse, seeded particles drift behind the product without changing its image.",
    amountLabel: "Particle opacity",
  },
  {
    id: "background-light",
    name: "Moving Studio Light",
    group: "Lighting",
    description:
      "A broad pool of light moves across the background behind the product.",
    amountLabel: "Light intensity",
  },
  {
    id: "displacement",
    name: "Background Distortion",
    group: "Image effect",
    description:
      "A gentle wave bends the studio graphics while the product stays rigid.",
    amountLabel: "Wave amplitude",
  },
  {
    id: "effects-studio",
    name: "Composed Studio",
    group: "Composition",
    description:
      "Float, responsive shadow, subtle drift and background light share one clock.",
    amountLabel: "Treatment strength",
  },
];
