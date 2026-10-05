import { z } from "zod";
import { PoseAnchorSchema } from "../character-actions.ts";
import { TextContainerSchema } from "../story-acting.ts";
import { PoseRegistrationSchema } from "../story-acting.ts";
import { compositionTypographyFields } from "./typography.ts";
import { ShapeContentsSchema } from "./shapes.ts";
import {
  AnimatableColorSchema,
  AnimatableDiscreteSchema,
  AnimatablePathSchema,
  animatableScalar,
  animatableVector,
} from "./keys.ts";
import {
  bounded,
  boundedJson,
  COMPOSITION_LIMITS,
  compFrame,
  compositionId,
  compositionColor,
  finite,
  keyFrame,
  label,
  metadata,
  size2,
  unit,
} from "./primitives.ts";

const L = COMPOSITION_LIMITS;

export const COMPOSITION_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
  "add",
] as const;
export const CompositionBlendModeSchema = z.enum(COMPOSITION_BLEND_MODES);

export const TrackMatteSchema = z
  .object({
    layer: compositionId,
    mode: z.enum(["alpha", "alpha-inverted", "luma", "luma-inverted"]),
  })
  .strict();

export const MaskSchema = z
  .object({
    id: compositionId,
    path: AnimatablePathSchema,
    mode: z.enum(["add", "subtract", "intersect", "difference", "none"]),
    inverted: z.boolean().optional(),
    feather: animatableScalar(finite.min(0).max(1000)).optional(),
    expansion: animatableScalar(finite.min(-1000).max(1000)).optional(),
    opacity: animatableScalar(unit).optional(),
  })
  .strict();

/** Registry effects sampled in layer time; pixel stacks retain array order. */
export const EffectInstanceSchema = z
  .object({
    id: compositionId,
    effect: z
      .string()
      .regex(/^[a-z][\w.-]*$/)
      .max(64),
    enabled: z.boolean().optional(),
    /** Coordinate layer for effects that use layer space; defaults to the owner. */
    space: compositionId.optional(),
    inPoint: keyFrame.optional(),
    outPoint: keyFrame.optional(),
    params: boundedJson(z.record(compositionId, z.json())).optional(),
  })
  .strict();

const scaleComponent = finite.min(-1000).max(1000);
const angle = bounded;
const skewAngle = finite.min(-85).max(85);

/**
 * Matrix = translate(position) · rotate · skew · scale · translate(−anchor), where
 * skew is the shear `[[1, tan skewX], [tan skewY, 1]]` used by the existing renderer.
 * Every field is optional; defaults are listed in docs/composition-reference.md.
 */
export const TransformSchema = z
  .object({
    anchor: animatableVector(bounded).optional(),
    position: animatableVector(bounded, { spatial: true }).optional(),
    scale: animatableVector(scaleComponent).optional(),
    rotation: animatableScalar(angle).optional(),
    skewX: animatableScalar(skewAngle).optional(),
    skewY: animatableScalar(skewAngle).optional(),
    opacity: animatableScalar(unit).optional(),
    rotationX: animatableScalar(angle).optional(),
    rotationY: animatableScalar(angle).optional(),
    orientation: animatableVector(angle).optional(),
    autoOrient: z.enum(["off", "path", "camera"]).optional(),
  })
  .strict();

const layerBase = {
  id: compositionId,
  name: label.optional(),
  /** Inclusive, in composition frames. Defaults to 0. */
  inPoint: compFrame.optional(),
  /** Exclusive, in composition frames. Defaults to the composition's frameCount. */
  outPoint: compFrame.optional(),
  /** Composition frame at which layer time is 0. Defaults to 0. */
  startFrame: keyFrame.optional(),
  /** AE time stretch: 2 plays at half speed, negative values play in reverse. */
  stretch: finite
    .min(-L.maxStretch)
    .max(L.maxStretch)
    .refine((value) => value !== 0, {
      message: "stretch cannot be 0",
      params: { diagnosticCode: "comp-schema-range" },
    })
    .optional(),
  /** Quantize the local keyed/content clock in frames per source second. */
  posterizeFps: finite.min(0.001).max(240).optional(),
  /** Hold the local keyed/content clock at this fractional source frame. */
  holdFrame: finite.min(-L.maxKeyFrame).max(L.maxKeyFrame).optional(),
  /** Baked samples: map layer-local time to an integer key/provider sample index. */
  sampleTimes: z
    .array(finite.min(-L.maxKeyFrame).max(L.maxKeyFrame))
    .min(1)
    .max(L.maxKeys)
    .optional(),
  parent: compositionId.optional(),
  enabled: z.boolean().optional(),
  solo: z.boolean().optional(),
  guide: z.boolean().optional(),
  threeD: z.boolean().optional(),
  transform: TransformSchema.optional(),
  /** Layer-space point used by attach constraints; moving it does not move artwork. */
  constraintReference: animatableVector(bounded).optional(),
  blendMode: CompositionBlendModeSchema.optional(),
  trackMatte: TrackMatteSchema.optional(),
  masks: z.array(MaskSchema).max(L.maxMasks).optional(),
  effects: z.array(EffectInstanceSchema).max(L.maxEffects).optional(),
  motionBlur: z.boolean().optional(),
  /** How strongly the composition 2D camera moves an unparented layer (0 = fixed to screen). */
  cameraDepth: finite.min(0).max(2).optional(),
  qualification: z.string().min(1).max(400).optional(),
  source: z
    .object({ family: compositionId, id: z.string().min(1).max(200) })
    .strict()
    .optional(),
  metadata: metadata.optional(),
};

const timeRemap = animatableScalar(
  finite.min(-L.maxKeyFrame).max(L.maxKeyFrame),
);

export const SolidLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("solid"),
    size: size2,
    color: AnimatableColorSchema,
  })
  .strict();

export const ImageSourceSchema = z
  .object({
    asset: compositionId,
    crop: z
      .tuple([
        finite.nonnegative(),
        finite.nonnegative(),
        finite.positive(),
        finite.positive(),
      ])
      .optional(),
    pose: compositionId.optional(),
    registration: PoseRegistrationSchema.optional(),
    anchors: z.record(compositionId, PoseAnchorSchema).optional(),
  })
  .strict();

export const ImageLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("image"),
    size: size2,
    fit: z.enum(["contain", "cover", "stretch"]).optional(),
    sources: z.array(ImageSourceSchema).min(1).max(L.maxImageSources),
    /** Index into `sources`; held between keys. Defaults to 0. */
    state: AnimatableDiscreteSchema.optional(),
    /** Previous source and blend amount for a state crossfade; set both or neither. */
    stateFrom: AnimatableDiscreteSchema.optional(),
    stateMix: animatableScalar(unit).optional(),
    /** `natural-size` rasterises vector sources once at their natural size (parity note 5). */
    rasterize: z.enum(["draw", "natural-size"]).optional(),
  })
  .strict();

export const TextLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("text"),
    /** Preserve static opaque run colours; animated/translucent colours use coverage. */
    rasterize: z.enum(["coverage", "source-colors"]).optional(),
    container: TextContainerSchema.optional(),
    corrections: z
      .array(
        z
          .object({
            replacement: z.string().min(1).max(L.maxTextLength),
            span: compositionId.optional(),
            start: compFrame,
            end: compFrame,
            color: compositionColor.optional(),
          })
          .strict()
          .refine((correction) => correction.end > correction.start, {
            message: "Correction end must follow its start",
            params: { diagnosticCode: "comp-schema-range" },
          }),
      )
      .max(100)
      .optional(),
    text: z.string().min(1).max(L.maxTextLength),
    /** Alternative texts selected by `state`, as in story text states. */
    states: z
      .array(z.string().min(1).max(L.maxTextLength))
      .min(1)
      .max(L.maxTextStates)
      .optional(),
    state: AnimatableDiscreteSchema.optional(),
    fontSize: finite.min(1).max(2000),
    stateFrom: AnimatableDiscreteSchema.optional(),
    stateMix: animatableScalar(unit).optional(),
    /** Wrap box `[width, height]` for `textBox` layouts, in layer pixels (CE3). */
    size: size2.optional(),
    color: AnimatableColorSchema,
    weight: z.enum(["normal", "bold"]).optional(),
    font: z.enum(["serif", "sans-serif"]).optional(),
    fontAsset: compositionId.optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    textRole: z.enum(["heading", "label", "qualification", "body"]).optional(),
    textLayout: z
      .object({
        width: finite.positive().max(L.maxCoordinate),
        height: finite.positive().max(L.maxCoordinate),
        lineHeight: finite.min(1).max(3),
        overflow: z.enum(["error", "clip"]),
      })
      .strict()
      .optional(),
    textBox: z
      .object({
        locale: z.enum(["en", "th"]),
        maxLines: finite.int().min(1).max(8),
        lineHeight: finite.min(1).max(2),
      })
      .strict()
      .optional(),
    revealMode: z.enum(["wipe", "words"]).optional(),
    reveal: animatableScalar(unit).optional(),
    ...compositionTypographyFields,
  })
  .strict();

export const NullLayerSchema = z
  .object({ ...layerBase, type: z.literal("null") })
  .strict();

/** Inspectable adapter content; executable draw functions live in the renderer registry. */
export const ProviderLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("provider"),
    provider: z
      .string()
      .max(128)
      .regex(/^[a-z][a-z0-9.-]*@\d+\.\d+\.\d+$/),
    params: boundedJson(z.record(z.string().max(128), z.json())),
    /** Optional discrete content states; the backend composites crossfades. */
    state: AnimatableDiscreteSchema.optional(),
    stateFrom: AnimatableDiscreteSchema.optional(),
    stateMix: animatableScalar(unit).optional(),
    /** Assets the provider may consume; checked against the composition asset namespace. */
    assets: z.array(compositionId).max(L.maxAssets).optional(),
    /** Provider text that intentionally depends on the browser's generic fonts. */
    usesSystemFonts: z.boolean().optional(),
    /** Conservative layer-space [left, top, right, bottom]; omitted means no culling. */
    bounds: z.tuple([bounded, bounded, bounded, bounded]).optional(),
  })
  .strict();

/**
 * Children multiply this layer's opacity and, with `clip`, are clipped to its bounds.
 * Unlike a null, opacity reaches the children; unlike a precomp, it applies per child
 * rather than to a flattened result (parity note 1).
 */
export const GroupLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("group"),
    size: size2,
    clip: z.boolean().optional(),
  })
  .strict();

export const PrecompLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("precomp"),
    comp: compositionId,
    collapseTransforms: z.boolean().optional(),
    /** Precomp frame shown at each layer frame; overrides start and stretch. */
    timeRemap: timeRemap.optional(),
    loop: z.enum(["cycle", "pingpong"]).optional(),
    loopCount: finite.int().min(1).max(10_000).optional(),
  })
  .strict();

export const AdjustmentLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("adjustment"),
    /** Defaults to the composition size. */
    size: size2.optional(),
  })
  .strict();

/** Native vector contents; JSON preflight precedes recursive shape validation. */
export const ShapeLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("shape"),
    contents: boundedJson(ShapeContentsSchema),
  })
  .strict();

export const CameraLayerSchema = z
  .object({ ...layerBase, type: z.literal("camera") })
  .strict();

export const LightLayerSchema = z
  .object({ ...layerBase, type: z.literal("light") })
  .strict();

const mediaLayer = <T extends string>(type: T) =>
  z
    .object({
      ...layerBase,
      type: z.literal(type),
      asset: compositionId,
      timeRemap: timeRemap.optional(),
    })
    .strict();
const visualFrameBlending = z.enum(["hold", "linear"]).optional();
export const VideoLayerSchema = mediaLayer("video").extend({
  frameBlending: visualFrameBlending,
});
export const SequenceLayerSchema = mediaLayer("sequence").extend({
  frameBlending: visualFrameBlending,
});
export const AudioLayerSchema = mediaLayer("audio");

export const CompositionLayerSchema = z.discriminatedUnion("type", [
  SolidLayerSchema,
  ImageLayerSchema,
  TextLayerSchema,
  NullLayerSchema,
  ProviderLayerSchema,
  GroupLayerSchema,
  PrecompLayerSchema,
  AdjustmentLayerSchema,
  ShapeLayerSchema,
  CameraLayerSchema,
  LightLayerSchema,
  VideoLayerSchema,
  SequenceLayerSchema,
  AudioLayerSchema,
]);

export type CompositionLayer = z.infer<typeof CompositionLayerSchema>;
export type CompositionLayerType = CompositionLayer["type"];
export type CompositionTransform = z.infer<typeof TransformSchema>;
export type CompositionMask = z.infer<typeof MaskSchema>;
export type CompositionBlendMode = z.infer<typeof CompositionBlendModeSchema>;
export type TrackMatte = z.infer<typeof TrackMatteSchema>;

/** Layer types that are part of the contract but not yet implemented. */
export const UNAVAILABLE_LAYER_TYPES: Partial<
  Record<CompositionLayerType, string>
> = {
  camera: "CE8",
  light: "a later plan (Q6)",
  video: "CE13",
  sequence: "CE13",
  audio: "CE13",
};

/** Layer types with a size, whose anchor defaults to their centre. */
export const SIZED_LAYER_TYPES = new Set<CompositionLayerType>([
  "solid",
  "image",
  "group",
  "precomp",
  "adjustment",
]);
