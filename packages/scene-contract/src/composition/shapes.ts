import { z } from "zod";
import {
  animatable,
  animatableScalar,
  AnimatableColorSchema,
  AnimatablePathSchema,
} from "./keys.ts";
import {
  bounded,
  compositionId,
  finite,
  label,
  metadata,
  reporter,
  unit,
  vec2,
} from "./primitives.ts";

export const SHAPE_LIMITS = {
  contents: 256,
  depth: 16,
  stops: 16,
  copies: 256,
  paths: 4096,
  generatedVertices: 262144,
  flattenTolerance: 0.25,
  flattenDepth: 12,
  polygonScale: 1024,
  polygonVertices: 1024,
  maxGeneratedCoordinate: 1_000_000_000,
} as const;

/** Shape coordinates are always 2D, including separated animation channels. */
export function shapeVector(component: z.ZodNumber = bounded, spatial = false) {
  return z.union([
    animatable(z.tuple([component, component]), {
      dimensions: 2,
      ...(spatial ? { spatial: vec2 } : {}),
    }),
    z
      .object({
        x: animatableScalar(component),
        y: animatableScalar(component),
      })
      .strict(),
  ]);
}

const distance = finite.min(0).max(1_000_000);
const scalar = animatableScalar;
const common = {
  id: compositionId,
  name: label.optional(),
  metadata: metadata.optional(),
};

export const ShapeTransformSchema = z
  .object({
    anchor: shapeVector().optional(),
    position: shapeVector(bounded, true).optional(),
    scale: shapeVector(finite.min(-1000).max(1000)).optional(),
    rotation: scalar(bounded).optional(),
    skewX: scalar(finite.min(-85).max(85)).optional(),
    skewY: scalar(finite.min(-85).max(85)).optional(),
    opacity: scalar(unit).optional(),
  })
  .strict();

export const ShapeRectSchema = z
  .object({
    ...common,
    type: z.literal("rect"),
    position: shapeVector().optional(),
    size: shapeVector(distance),
    roundness: scalar(distance).optional(),
  })
  .strict();
export const ShapeEllipseSchema = z
  .object({
    ...common,
    type: z.literal("ellipse"),
    position: shapeVector().optional(),
    size: shapeVector(distance),
  })
  .strict();
export const ShapePolystarSchema = z
  .object({
    ...common,
    type: z.literal("polystar"),
    kind: z.enum(["star", "polygon"]),
    position: shapeVector().optional(),
    rotation: scalar(bounded).optional(),
    points: scalar(finite.min(2).max(256)),
    outerRadius: scalar(distance),
    innerRadius: scalar(distance).optional(),
    outerRoundness: scalar(unit).optional(),
    innerRoundness: scalar(unit).optional(),
  })
  .strict();
export const ShapePathSchema = z
  .object({
    ...common,
    type: z.literal("path"),
    path: AnimatablePathSchema,
  })
  .strict();

const paint = { opacity: scalar(unit).optional() };
const stroke = {
  width: scalar(distance),
  cap: z.enum(["butt", "round", "square"]).optional(),
  join: z.enum(["miter", "round", "bevel"]).optional(),
  miterLimit: finite.min(1).max(1000).optional(),
  dashes: z.array(distance).max(32).optional(),
  dashOffset: scalar(bounded).optional(),
  style: z.enum(["plain", "ink", "brush"]).optional(),
  pinch: scalar(unit).optional(),
  pinchAt: scalar(unit).optional(),
  pinchWidth: scalar(finite.min(0.001).max(1)).optional(),
};
export const ShapeFillSchema = z
  .object({
    ...common,
    type: z.literal("fill"),
    ...paint,
    color: AnimatableColorSchema,
    rule: z.enum(["nonzero", "evenodd"]).optional(),
  })
  .strict();
export const ShapeStrokeSchema = z
  .object({
    ...common,
    type: z.literal("stroke"),
    ...paint,
    ...stroke,
    color: AnimatableColorSchema,
  })
  .strict();
export const ShapeGradientStopSchema = z
  .object({
    id: compositionId,
    offset: scalar(unit),
    color: AnimatableColorSchema,
  })
  .strict();
const gradient = {
  gradient: z.enum(["linear", "radial"]),
  start: shapeVector(),
  end: shapeVector(),
  stops: z
    .array(ShapeGradientStopSchema)
    .min(2)
    .max(SHAPE_LIMITS.stops)
    .superRefine((stops, ctx) => uniqueIds(stops, ctx)),
};
export const ShapeGradientFillSchema = z
  .object({
    ...common,
    type: z.literal("gradient-fill"),
    ...paint,
    ...gradient,
    rule: z.enum(["nonzero", "evenodd"]).optional(),
  })
  .strict();
export const ShapeGradientStrokeSchema = z
  .object({
    ...common,
    type: z.literal("gradient-stroke"),
    ...paint,
    ...gradient,
    ...stroke,
  })
  .strict();

export const ShapeTrimSchema = z
  .object({
    ...common,
    type: z.literal("trim-paths"),
    start: scalar(unit).optional(),
    end: scalar(unit).optional(),
    offset: scalar(bounded).optional(),
    mode: z.enum(["simultaneous", "individual"]).optional(),
  })
  .strict();
export const ShapeRepeaterSchema = z
  .object({
    ...common,
    type: z.literal("repeater"),
    copies: scalar(finite.min(0).max(SHAPE_LIMITS.copies)),
    offset: scalar(bounded).optional(),
    transform: ShapeTransformSchema.omit({ opacity: true }).optional(),
    startOpacity: scalar(unit).optional(),
    endOpacity: scalar(unit).optional(),
    order: z.enum(["above", "below"]).optional(),
  })
  .strict();
export const ShapeMergeSchema = z
  .object({
    ...common,
    type: z.literal("merge-paths"),
    mode: z.enum(["union", "subtract", "intersect", "exclude"]),
  })
  .strict();
export const ShapeOffsetSchema = z
  .object({
    ...common,
    type: z.literal("offset-path"),
    amount: scalar(bounded),
    join: z.enum(["miter", "round", "bevel"]).optional(),
    miterLimit: finite.min(1).max(1000).optional(),
  })
  .strict();
export const ShapeRoundSchema = z
  .object({
    ...common,
    type: z.literal("round-corners"),
    radius: scalar(distance),
  })
  .strict();
export const ShapeWiggleSchema = z
  .object({
    ...common,
    type: z.literal("wiggle-paths"),
    size: scalar(distance),
    detail: scalar(finite.min(0).max(64)).optional(),
    frequency: scalar(finite.min(0).max(100)).optional(),
    evolution: scalar(bounded).optional(),
    seed: finite.int().min(0).max(2147483647),
    smooth: z.boolean().optional(),
  })
  .strict();
export const ShapeZigzagSchema = z
  .object({
    ...common,
    type: z.literal("zig-zag"),
    size: scalar(distance),
    ridges: scalar(finite.min(0).max(128)),
    points: z.enum(["corner", "smooth"]).optional(),
  })
  .strict();
export const ShapePuckerSchema = z
  .object({
    ...common,
    type: z.literal("pucker-bloat"),
    amount: scalar(finite.min(-1).max(1)),
  })
  .strict();
export const ShapeTwistSchema = z
  .object({
    ...common,
    type: z.literal("twist"),
    angle: scalar(bounded),
    center: shapeVector().optional(),
  })
  .strict();

const leafSchemas = [
  ShapeRectSchema,
  ShapeEllipseSchema,
  ShapePolystarSchema,
  ShapePathSchema,
  ShapeFillSchema,
  ShapeStrokeSchema,
  ShapeGradientFillSchema,
  ShapeGradientStrokeSchema,
  ShapeTrimSchema,
  ShapeRepeaterSchema,
  ShapeMergeSchema,
  ShapeOffsetSchema,
  ShapeRoundSchema,
  ShapeWiggleSchema,
  ShapeZigzagSchema,
  ShapePuckerSchema,
  ShapeTwistSchema,
] as const;
export const ShapeLeafSchema = z.discriminatedUnion("type", leafSchemas);
export type ShapeLeaf = z.infer<typeof ShapeLeafSchema>;
export type ShapeGroup = z.infer<z.ZodObject<typeof common>> & {
  type: "group";
  contents: ShapeContent[];
  transform?: z.infer<typeof ShapeTransformSchema> | undefined;
};
export type ShapeContent = ShapeLeaf | ShapeGroup;

function uniqueIds(values: { id: string }[], ctx: z.RefinementCtx) {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    if (ids.has(value.id))
      reporter(ctx)(
        "comp-shape-id",
        [index, "id"],
        "shape IDs must be unique within their collection",
      );
    ids.add(value.id);
  });
}

export const ShapeContentSchema: z.ZodType<ShapeContent> = z.lazy(() =>
  z.discriminatedUnion("type", [
    ...leafSchemas,
    z
      .object({
        ...common,
        type: z.literal("group"),
        transform: ShapeTransformSchema.optional(),
        contents: z
          .array(ShapeContentSchema)
          .max(SHAPE_LIMITS.contents)
          .superRefine(uniqueIds),
      })
      .strict(),
  ]),
);

/** JSON preflight must run before this recursive schema. */
export const ShapeContentsSchema = z
  .array(ShapeContentSchema)
  .max(SHAPE_LIMITS.contents)
  .superRefine((contents, ctx) => {
    uniqueIds(contents, ctx);
    const pending = contents.map((value, i) => ({
      value,
      depth: 1,
      path: [i] as (string | number)[],
    }));
    let count = 0;
    while (pending.length) {
      const { value, depth, path } = pending.pop()!;
      if (++count > SHAPE_LIMITS.contents || depth > SHAPE_LIMITS.depth) {
        reporter(ctx)(
          "comp-shape-limit",
          path,
          "shape tree exceeds its content or group-depth budget",
        );
        return;
      }
      if (value.type === "group")
        value.contents.forEach((child, i) =>
          pending.push({
            value: child,
            depth: depth + 1,
            path: [...path, "contents", i],
          }),
        );
    }
  });
