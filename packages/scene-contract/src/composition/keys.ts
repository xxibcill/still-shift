import { z } from "zod";
import { TemporalHandleSchema } from "../motion-craft.ts";
import { compositionCurveFields } from "./curves.ts";
import {
  COMPOSITION_LIMITS,
  bounded,
  compositionColor,
  finite,
  keyFrame,
  reporter,
  vec2,
  vec3,
} from "./primitives.ts";

type Handle =
  | {
      speed?: number | number[] | undefined;
      spatialSpeed?: number | undefined;
    }
  | undefined;
type KeyLike = {
  frame: number;
  smooth?: boolean | undefined;
  interpolation?: string | undefined;
  bezier?: unknown;
  spatialIn?: unknown;
  spatialOut?: unknown;
  in?: Handle;
  out?: Handle;
};

/**
 * Temporal handles on vector and colour keys (CE9). `speed` is a tuple with one
 * component per dimension (pixels, scale factors or normalised channels per frame);
 * `spatialSpeed` is the speed along a spatial path in arc-length pixels per frame.
 */
export const GroupedTemporalHandleSchema = TemporalHandleSchema.extend({
  speed: z.union([bounded, z.array(bounded).min(2).max(4)]).optional(),
  spatialSpeed: bounded.optional(),
});

/**
 * Key rules shared by every keyed property. A key's `interpolation`, `easing` and
 * `bezier` describe the segment that ends at that key; `out` shapes the segment that
 * leaves it and `in` the segment that arrives, as in `curve.ts`.
 */
function checkKeys(scalar: boolean, dimensions?: number) {
  return (keys: KeyLike[], ctx: z.RefinementCtx) => {
    const fail = reporter(ctx);
    const spatial = keys.some((key) => key.spatialIn || key.spatialOut);
    keys.forEach((key, i) => {
      if (i && key.frame <= keys[i - 1]!.frame)
        fail("comp-key-order", [i, "frame"], "key frames must increase");
      if (
        (key.smooth || key.interpolation === "smooth") &&
        (!i || i === keys.length - 1)
      )
        fail(
          "comp-key-smooth",
          [i, "smooth"],
          "smooth keys need a key on each side",
        );
      if (key.interpolation === "bezier" && !key.bezier)
        fail(
          "comp-key-bezier",
          [i, "bezier"],
          "bezier interpolation requires bezier handles",
        );
      if (!scalar)
        for (const side of ["in", "out"] as const) {
          const speed = key[side]?.speed;
          if (typeof speed === "number")
            fail(
              "comp-key-speed-vector",
              [i, side, "speed"],
              "a vector or colour speed is a tuple with one value per dimension",
            );
          else if (Array.isArray(speed) && spatial)
            fail(
              "comp-key-speed-spatial",
              [i, side, "speed"],
              "keys with spatial tangents move along their path; use spatialSpeed",
            );
          else if (Array.isArray(speed) && speed.length !== dimensions)
            fail(
              "comp-key-speed-dimension",
              [i, side, "speed"],
              dimensions
                ? `speed needs ${dimensions} components to match the value`
                : "this property does not accept grouped speed",
            );
          if (key[side]?.spatialSpeed !== undefined && !spatial)
            fail(
              "comp-key-speed-spatial",
              [i, side, "spatialSpeed"],
              "spatialSpeed applies to keys with spatial tangents",
            );
        }
    });
  };
}

type KeyedOptions = {
  scalar?: boolean;
  spatial?: z.ZodType;
  /** Components of a vector or colour value, for grouped speed tuples. */
  dimensions?: number;
};

function keyed<T extends z.ZodType>(value: T, options: KeyedOptions = {}) {
  const spatial = options.spatial
    ? {
        spatialIn: options.spatial.optional(),
        spatialOut: options.spatial.optional(),
      }
    : {};
  const handles = options.scalar
    ? {}
    : {
        in: GroupedTemporalHandleSchema.optional(),
        out: GroupedTemporalHandleSchema.optional(),
      };
  return z
    .object({
      keys: z
        .array(
          z
            .object({
              frame: keyFrame,
              value,
              ...compositionCurveFields,
              ...handles,
              ...spatial,
            })
            .strict(),
        )
        .min(1)
        .max(COMPOSITION_LIMITS.maxKeys)
        .superRefine(checkKeys(options.scalar ?? false, options.dimensions)),
    })
    .strict();
}

/** A fixed value or `{ keys: [...] }`. */
export const animatable = <T extends z.ZodType>(
  value: T,
  options: KeyedOptions = {},
) => z.union([value, keyed(value, options)]);

export const animatableScalar = (value: z.ZodNumber = finite) =>
  animatable(value, { scalar: true });
export const AnimatableColorSchema = animatable(compositionColor, {
  dimensions: 4,
});

/**
 * A vector as one value (`[x, y]`, keyed together) or as separate dimensions
 * (`{ x, y }`, each keyed on its own), the form the family adapters need.
 */
export const separated = (component: z.ZodNumber) =>
  z
    .object({
      x: animatableScalar(component),
      y: animatableScalar(component),
      z: animatableScalar(component).optional(),
    })
    .strict();
export const animatableVector = (
  component: z.ZodNumber,
  options: { spatial?: boolean } = {},
) => {
  const two = z.tuple([component, component]);
  const three = z.tuple([component, component, component]);
  return z.union([
    two,
    three,
    keyed(two, {
      dimensions: 2,
      ...(options.spatial ? { spatial: vec2 } : {}),
    }),
    keyed(three, {
      dimensions: 3,
      ...(options.spatial ? { spatial: vec3 } : {}),
    }),
    separated(component),
  ]);
};

/**
 * Discrete properties (image and text state) hold each key's value until the next
 * key. They carry no curve fields.
 */
export const DiscreteKeySchema = z
  .object({ frame: keyFrame, value: finite.int().min(0).max(255) })
  .strict();
export const AnimatableDiscreteSchema = z.union([
  DiscreteKeySchema.shape.value,
  z
    .object({
      keys: z
        .array(DiscreteKeySchema)
        .min(1)
        .max(COMPOSITION_LIMITS.maxKeys)
        .superRefine(checkKeys(true)),
    })
    .strict(),
]);

/**
 * A cubic bezier path. Tangents are offsets from their vertex, as in AE; omitted
 * tangents are zero (straight segments).
 */
export const BezierPathSchema = z
  .object({
    closed: z.boolean(),
    /** Source vertex used as index zero for a closed path's morph correspondence. */
    firstVertex: finite
      .int()
      .min(0)
      .max(COMPOSITION_LIMITS.maxPathVertices - 1)
      .optional(),
    vertices: z.array(vec2).min(2).max(COMPOSITION_LIMITS.maxPathVertices),
    inTangents: z
      .array(vec2)
      .max(COMPOSITION_LIMITS.maxPathVertices)
      .optional(),
    outTangents: z
      .array(vec2)
      .max(COMPOSITION_LIMITS.maxPathVertices)
      .optional(),
  })
  .strict()
  .superRefine((path, ctx) => {
    const fail = reporter(ctx);
    if (
      (path.firstVertex ?? 0) >= path.vertices.length ||
      (!path.closed && (path.firstVertex ?? 0) !== 0)
    )
      fail(
        "comp-path-first-vertex",
        ["firstVertex"],
        "firstVertex must name a vertex of a closed path; open paths use 0",
      );
    for (const side of ["inTangents", "outTangents"] as const)
      if (path[side] && path[side].length !== path.vertices.length)
        fail(
          "comp-path-tangents",
          [side],
          "tangent count must match the vertex count",
        );
  });
export const AnimatablePathSchema = z
  .union([BezierPathSchema, keyed(BezierPathSchema)])
  .superRefine((value, ctx) => {
    if (!("keys" in value) || !value.keys.length) return;
    const count = value.keys[0]!.value.vertices.length;
    value.keys.forEach((key, i) => {
      if (key.value.vertices.length !== count)
        reporter(ctx)(
          "comp-path-vertex-count",
          ["keys", i, "value", "vertices"],
          `every key of a path needs the same vertex count (${count})`,
        );
    });
  });

export type Keyed<T> = {
  keys: ({ frame: number; value: T } & Record<string, unknown>)[];
};
export type Animatable<T> = T | Keyed<T>;
export type BezierPath = z.infer<typeof BezierPathSchema>;

export const isKeyed = (value: unknown): value is Keyed<unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "keys" in value;
