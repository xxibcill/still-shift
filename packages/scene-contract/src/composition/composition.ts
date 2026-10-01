import { z } from "zod";
import { NumericMotionPropertySchema } from "../motion-craft.ts";
import { OutputFormatSchema } from "../output-format.ts";
import { CompositionLayerSchema } from "./layers.ts";
import {
  Camera2dSchema,
  CompositionConstraintSchema,
  CompositionDriverMapSchema,
  compositionMotionLayerFields,
  CompositionNoiseSchema,
  CompositionOscillatorSchema,
  CompositionSignalSchema,
  CompositionTextAnimatorSchema,
} from "./motion.ts";
import {
  CompositionFontAxesSchema,
  CompositionTextStyleSchema,
} from "./typography.ts";
import { PropertyPathSchema } from "./property-path.ts";
import {
  COMPOSITION_LIMITS,
  COMPOSITION_SCHEMA_VERSION,
  compFrame,
  compositionColor,
  compositionId,
  finite,
  label,
  metadata,
  sha256,
  size2,
} from "./primitives.ts";
import { validateCompositionSemantics } from "./validate.ts";

const L = COMPOSITION_LIMITS;
const frame = compFrame;
const dimension = finite.int().min(L.minSize).max(L.maxSize);
const assetPath = z.string().min(1).max(1024);

export const CompositionFpsSchema = z.union([
  z.literal(24),
  z.literal(25),
  z.literal(30),
  z.literal(50),
  z.literal(60),
]);

export const CompositionAssetSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: compositionId,
      type: z.literal("image"),
      path: assetPath,
      sha256,
      width: finite
        .int()
        .positive()
        .max(L.maxSize * 4),
      height: finite
        .int()
        .positive()
        .max(L.maxSize * 4),
    })
    .strict(),
  z
    .object({
      id: compositionId,
      type: z.literal("font"),
      path: assetPath,
      sha256,
      weight: z
        .string()
        .regex(/^(?:[1-8]\d{2}|900)$/, "Font weight must be 100–900"),
      style: z.enum(["normal", "italic"]).optional(),
      variable: CompositionFontAxesSchema.optional(),
    })
    .strict(),
  // Media assets are completed in CE13.
  ...(["video", "sequence", "audio"] as const).map((type) =>
    z
      .object({
        id: compositionId,
        type: z.literal(type),
        path: assetPath,
        sha256,
        size: size2.optional(),
      })
      .strict(),
  ),
]);

export const CompositionMarkerSchema = z
  .object({
    id: compositionId,
    frame: compFrame,
    duration: finite.int().positive().max(L.maxFrameCount).optional(),
    label: label.optional(),
  })
  .strict();

/** Drivers whose target, source and sum terms are property paths. */
export const CompositionDriverSchema = z
  .object({
    target: PropertyPathSchema,
    signal: compositionId.optional(),
    source: PropertyPathSchema.optional(),
    sum: z
      .array(z.union([compositionId, PropertyPathSchema]))
      .min(1)
      .max(16)
      .optional(),
    map: CompositionDriverMapSchema.optional(),
    ...compositionMotionLayerFields,
  })
  .strict()
  .refine(
    (d) =>
      [d.signal, d.source, d.sum].filter((v) => v !== undefined).length === 1,
    {
      message:
        "comp-driver-source: driver needs exactly one of signal, source, sum",
      params: { diagnosticCode: "comp-driver-source" },
    },
  );

/** Periodic motion on a property path, or on the legacy `node` + `property` pair. */
export const CompositionPeriodicSchema = z
  .object({
    target: PropertyPathSchema.optional(),
    node: compositionId.optional(),
    property: NumericMotionPropertySchema.optional(),
    start: frame,
    end: frame,
    cue: compositionId.optional(),
    oscillate: CompositionOscillatorSchema.optional(),
    noise: CompositionNoiseSchema.optional(),
    ...compositionMotionLayerFields,
  })
  .strict()
  .refine(
    (m) =>
      m.end > m.start &&
      !!m.oscillate !== !!m.noise &&
      (m.target === undefined) === (m.node !== undefined) &&
      (m.node === undefined) === (m.property === undefined),
    {
      message:
        "comp-periodic: needs a positive window, exactly one generator, and either target or node with property",
      params: { diagnosticCode: "comp-periodic" },
    },
  );

/**
 * The story camera, applied to unparented root layers in proportion to their
 * `cameraDepth` (parity note 3). Replaced by the CE8 camera.
 */
export { Camera2dSchema } from "./motion.ts";

export const ExpressionSchema = z
  .object({
    source: z.string().min(1).max(L.maxExpressionLength),
    ast: z.json().optional(),
  })
  .strict();

/** Fields shared by the root composition and every precomp. */
const scopeFields = {
  id: compositionId,
  name: label.optional(),
  width: dimension,
  height: dimension,
  frameCount: finite.int().min(1).max(L.maxFrameCount),
  background: compositionColor.nullable().optional(),
  layers: z.array(CompositionLayerSchema).max(L.maxLayers),
  markers: z.array(CompositionMarkerSchema).max(L.maxMarkers).optional(),
  constraints: z
    .array(CompositionConstraintSchema)
    .max(L.maxConstraints)
    .optional(),
  textAnimators: z
    .array(CompositionTextAnimatorSchema)
    .max(L.maxTextAnimators)
    .optional(),
};

export const PrecompSchema = z
  .object({ ...scopeFields, fps: CompositionFpsSchema.optional() })
  .strict();

const compositionShape = z
  .object({
    schemaVersion: z.literal(COMPOSITION_SCHEMA_VERSION),
    ...scopeFields,
    fps: CompositionFpsSchema,
    format: OutputFormatSchema.optional(),
    colorSpace: z.enum(["srgb", "linear-srgb"]).optional(),
    motionBlur: z
      .object({
        enabled: z.boolean(),
        shutterAngle: finite.min(0).max(720),
        shutterPhase: finite.min(-360).max(360),
        samples: finite.int().min(2).max(64),
      })
      .strict()
      .optional(),
    assets: z.array(CompositionAssetSchema).max(L.maxAssets),
    precomps: z.array(PrecompSchema).max(L.maxPrecomps).optional(),
    textStyles: z.record(compositionId, CompositionTextStyleSchema).optional(),
    signals: z.array(CompositionSignalSchema).max(L.maxSignals).optional(),
    drivers: z.array(CompositionDriverSchema).max(L.maxDrivers).optional(),
    periodic: z.array(CompositionPeriodicSchema).max(L.maxPeriodic).optional(),
    expressions: z
      .record(PropertyPathSchema, ExpressionSchema)
      .refine((value) => Object.keys(value).length <= L.maxExpressions, {
        message: `at most ${L.maxExpressions} expressions`,
        params: { diagnosticCode: "comp-limit" },
      })
      .optional(),
    camera2d: Camera2dSchema.optional(),
    metadata: metadata.optional(),
  })
  .strict();

export const CompositionSchema = compositionShape.superRefine(
  validateCompositionSemantics,
);

export type Composition = z.infer<typeof compositionShape>;
export type Precomp = z.infer<typeof PrecompSchema>;
export type CompositionScope = Composition | Precomp;
export type CompositionAsset = z.infer<typeof CompositionAssetSchema>;
export type CompositionMarker = z.infer<typeof CompositionMarkerSchema>;
export type CompositionDriver = z.infer<typeof CompositionDriverSchema>;
export type CompositionPeriodic = z.infer<typeof CompositionPeriodicSchema>;
export type Camera2d = z.infer<typeof Camera2dSchema>;
