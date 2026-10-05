import { z } from "zod";
import { printExpression } from "./expression-ast.ts";
import {
  COMPOSITION_LIMITS,
  bounded,
  compFrame,
  finite,
} from "./primitives.ts";
import { PropertyPathSchema } from "./property-path.ts";

const L = COMPOSITION_LIMITS;

/** A layer instance: `[precompLayerId "/"]* layerId`. */
export const LayerReferenceSchema = z
  .string()
  .regex(/^(?:[a-zA-Z][\w-]*\/)*[a-zA-Z][\w-]*$/)
  .max(L.maxPropertyPathLength);
/** A property below a layer, such as `transform.position` or `effects[glow].radius`. */
export const PropertySuffixSchema = z
  .string()
  .regex(
    /^[a-zA-Z][\w-]*(?:\[[a-zA-Z][\w-]*\])?(?:\.[a-zA-Z][\w-]*(?:\[[a-zA-Z][\w-]*\])?)*$/,
  )
  .max(256);

const frames = finite.int().min(0).max(600);
const frequency = finite.positive().max(30);
const damping = finite.positive().max(4);
const seed = finite.int().min(0).max(L.maxSeed);

/** Behaviours compile to expressions; each is one line of motion-design intent. */
export const CompositionBehaviourSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("follow-through"),
      /** The keyed property that followers lag, e.g. `lead.transform.position`. */
      leader: PropertyPathSchema,
      followers: z.array(LayerReferenceSchema).min(1).max(32),
      /** Property on each follower; defaults to the leader's property. */
      property: PropertySuffixSchema.optional(),
      /** Extra lag per follower position in the chain. */
      delayFrames: frames.optional(),
      frequency: frequency.optional(),
      damping: damping.optional(),
      /** Frame whose leader value is the followers' authored rest pose. */
      restFrame: compFrame.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("inertial-bounce"),
      target: PropertyPathSchema,
      amplitude: finite.min(0).max(10).optional(),
      frequency: frequency.optional(),
      decay: finite.min(0).max(100).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("squash-stretch"),
      layer: LayerReferenceSchema,
      /** Velocity source; defaults to the layer's own position. */
      source: PropertyPathSchema.optional(),
      /** Stretch per pixel/second of speed. */
      amount: finite.min(0).max(1).optional(),
      /** Largest stretch factor (≥ 1); the cross axis shrinks to keep area. */
      limit: finite.min(1).max(4).optional(),
      /** Stretch along the layer's local x axis (use with auto-orient). */
      aligned: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("anticipation"),
      target: PropertyPathSchema,
      amount: bounded,
      durationFrames: frames.min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("auto-orient"),
      layer: LayerReferenceSchema,
      /** Path whose travel direction sets the rotation; defaults to the layer's position. */
      source: PropertyPathSchema.optional(),
      offset: bounded.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("constant-speed"),
      /** A keyed 2D position; intermediate keys rove so speed is constant. */
      target: PropertyPathSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("camera-shake"),
      target: PropertyPathSchema,
      startFrame: compFrame,
      amplitude: bounded,
      frequency: frequency.optional(),
      /** Exponential decay per second. */
      decay: finite.min(0).max(100).optional(),
      seed: seed.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("stagger"),
      layers: z.array(LayerReferenceSchema).min(2).max(200),
      properties: z.array(PropertySuffixSchema).min(1).max(8),
      offsetFrames: frames.min(1),
      order: z.enum(["forward", "reverse", "center-out", "seeded"]).optional(),
      seed: seed.optional(),
    })
    .strict(),
]);
export type CompositionBehaviour = z.infer<typeof CompositionBehaviourSchema>;

export const BEHAVIOUR_DEFAULTS = {
  followThrough: { delayFrames: 3, frequency: 2.5, damping: 0.45 },
  inertialBounce: { amplitude: 0.05, frequency: 2.5, decay: 6 },
  squashStretch: { amount: 0.0004, limit: 1.35 },
  cameraShake: { frequency: 8, decay: 3, seed: 0 },
} as const;

/** Text of a string literal in expression source. */
const quote = (text: string) => printExpression({ str: text });
const num = (value: number) => printExpression({ num: value });

function staggerRanks(
  count: number,
  order: NonNullable<
    Extract<CompositionBehaviour, { type: "stagger" }>["order"]
  >,
  seed: number,
) {
  const indices = Array.from({ length: count }, (_, i) => i);
  if (order === "reverse") return indices.map((i) => count - 1 - i);
  if (order === "center-out")
    return indices.map((i) => Math.floor(Math.abs(2 * i - (count - 1)) / 2));
  if (order === "seeded") {
    // Fisher–Yates with the same integer hash as noise and random().
    const permutation = [...indices];
    for (let i = count - 1; i > 0; i--) {
      let h = Math.imul(seed ^ (i + 0x9e3779b9), 0x45d9f3b);
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
      const j = ((h ^ (h >>> 16)) >>> 0) % (i + 1);
      [permutation[i], permutation[j]] = [permutation[j]!, permutation[i]!];
    }
    const ranks: number[] = [];
    permutation.forEach((layer, rank) => (ranks[layer] = rank));
    return ranks;
  }
  return indices;
}

export type CompiledBehaviourExpression = { target: string; source: string };

const propertyOf = (path: string) => path.slice(path.indexOf(".") + 1);

/** Expressions a behaviour stands for, with targets as property paths. */
export function behaviourExpressions(
  behaviour: CompositionBehaviour,
  fps: number,
): CompiledBehaviourExpression[] {
  switch (behaviour.type) {
    case "follow-through": {
      const d = BEHAVIOUR_DEFAULTS.followThrough;
      const property = behaviour.property ?? propertyOf(behaviour.leader);
      const leader = quote(behaviour.leader);
      const rest = num((behaviour.restFrame ?? 0) / fps);
      return behaviour.followers.map((follower, i) => ({
        target: `${follower}.${property}`,
        source: `value + spring(${leader}, ${num(behaviour.frequency ?? d.frequency)}, ${num(behaviour.damping ?? d.damping)}, ${num(((i + 1) * (behaviour.delayFrames ?? d.delayFrames)) / fps)}) - valueAtTime(${leader}, ${rest})`,
      }));
    }
    case "inertial-bounce": {
      const d = BEHAVIOUR_DEFAULTS.inertialBounce;
      return [
        {
          target: behaviour.target,
          source: `value + inertia(${num(behaviour.amplitude ?? d.amplitude)}, ${num(behaviour.frequency ?? d.frequency)}, ${num(behaviour.decay ?? d.decay)})`,
        },
      ];
    }
    case "squash-stretch": {
      const d = BEHAVIOUR_DEFAULTS.squashStretch;
      const source = quote(
        behaviour.source ?? `${behaviour.layer}.transform.position`,
      );
      return [
        {
          target: `${behaviour.layer}.transform.scale`,
          source: `value * squash(velocityAtTime(${source}, time), ${num(behaviour.amount ?? d.amount)}, ${num(behaviour.limit ?? d.limit)}${behaviour.aligned ? ", true" : ""})`,
        },
      ];
    }
    case "anticipation":
      return [
        {
          target: behaviour.target,
          source: `value + anticipate(${printExpression(
            behaviour.amount < 0
              ? { op: "neg", args: [{ num: -behaviour.amount }] }
              : { num: behaviour.amount },
          )}, ${num(behaviour.durationFrames / fps)})`,
        },
      ];
    case "auto-orient": {
      const offset = behaviour.offset ?? 0;
      return [
        {
          target: `${behaviour.layer}.transform.rotation`,
          source: `value + heading(${quote(behaviour.source ?? `${behaviour.layer}.transform.position`)})${offset ? ` ${offset < 0 ? "-" : "+"} ${num(Math.abs(offset))}` : ""}`,
        },
      ];
    }
    case "constant-speed":
      return [{ target: behaviour.target, source: "rove()" }];
    case "camera-shake": {
      const d = BEHAVIOUR_DEFAULTS.cameraShake;
      const amplitude = printExpression({ num: Math.abs(behaviour.amplitude) });
      const start = num(behaviour.startFrame);
      return [
        {
          target: behaviour.target,
          source: `frame >= ${start} ? wiggle(${num(behaviour.frequency ?? d.frequency)}, ${amplitude} * exp(-${num(behaviour.decay ?? d.decay)} * (frame - ${start}) / fps), ${num(behaviour.seed ?? d.seed)}, 2) : value`,
        },
      ];
    }
    case "stagger": {
      const ranks = staggerRanks(
        behaviour.layers.length,
        behaviour.order ?? "forward",
        behaviour.seed ?? 0,
      );
      return behaviour.layers.flatMap((layer, i) =>
        behaviour.properties.map((property) => ({
          target: `${layer}.${property}`,
          source:
            ranks[i] === 0
              ? "value"
              : `valueAtTime((frame - ${num(ranks[i]! * behaviour.offsetFrames)}) / fps)`,
        })),
      );
    }
  }
}
