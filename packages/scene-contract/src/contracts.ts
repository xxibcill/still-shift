import { z } from "zod";

export const ANIMATION_API_VERSION = "0.1" as const;
export const ENGINE_VERSION = "0.1" as const;
export const SCENE_SCHEMA_VERSION = "0.1" as const;

export const V0_1_REQUEST_CONSTRAINTS = {
  durationMs: { minimum: 3000, maximum: 8000 },
  fps: 30,
  width: 1920,
  height: 1080,
  seed: { minimum: 0, maximum: 0xffffffff },
} as const;

export const V0_1_REQUEST_DEFAULTS = {
  durationMs: 5000,
  preset: "auto",
  intensity: "standard",
  seed: 1842,
} as const;

export const AnimationPresetSchema = z.enum([
  "auto",
  "slow_push",
  "horizontal_drift",
  "cinematic_float",
]);

export const ResolvedAnimationPresetSchema = AnimationPresetSchema.exclude([
  "auto",
]);
export const AnimationIntensitySchema = z.enum([
  "subtle",
  "standard",
  "strong",
]);

export const calculateFrameCount = (durationMs: number, fps: number): number =>
  (durationMs * fps) / 1000;

const wholeFrameDuration = (durationMs: number, fps: number): boolean =>
  Number.isInteger(calculateFrameCount(durationMs, fps));

export const AnimationRequestSchema = z
  .object({
    inputPath: z.string().trim().min(1),
    outputPath: z.string().trim().min(1),
    durationMs: z
      .number()
      .int()
      .min(V0_1_REQUEST_CONSTRAINTS.durationMs.minimum)
      .max(V0_1_REQUEST_CONSTRAINTS.durationMs.maximum),
    fps: z.literal(V0_1_REQUEST_CONSTRAINTS.fps),
    width: z.literal(V0_1_REQUEST_CONSTRAINTS.width),
    height: z.literal(V0_1_REQUEST_CONSTRAINTS.height),
    preset: AnimationPresetSchema,
    intensity: AnimationIntensitySchema,
    seed: z
      .number()
      .int()
      .min(V0_1_REQUEST_CONSTRAINTS.seed.minimum)
      .max(V0_1_REQUEST_CONSTRAINTS.seed.maximum),
  })
  .superRefine((request, context) => {
    if (!wholeFrameDuration(request.durationMs, request.fps)) {
      context.addIssue({
        code: "custom",
        message:
          "durationMs must resolve to a whole frame count at the requested fps",
        path: ["durationMs"],
      });
    }
  });

export const AnimationWarningCodeSchema = z.enum([
  "MOTION_CLAMPED",
  "DEPTH_RANGE_FLAT",
  "DEPTH_EDGE_RISK_HIGH",
  "LATERAL_MOTION_REDUCED",
  "FALLBACK_2D_USED",
  "PREVIEW_EXPORT_VARIANCE",
]);

const DiagnosticContextValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
]);

export const AnimationWarningSchema = z.object({
  code: AnimationWarningCodeSchema,
  message: z.string().trim().min(1),
  context: z.record(z.string(), DiagnosticContextValueSchema).optional(),
});

export const AnimationErrorCodeSchema = z.enum([
  "INPUT_UNREADABLE",
  "INPUT_FORMAT_UNSUPPORTED",
  "INPUT_DIMENSIONS_INVALID",
  "DEPTH_INFERENCE_FAILED",
  "SCENE_INVALID",
  "RENDER_FAILED",
  "ENCODE_FAILED",
  "OUTPUT_VALIDATION_FAILED",
]);

export const AnimationFailureSchema = z.object({
  status: z.literal("failed"),
  error: z.object({
    code: AnimationErrorCodeSchema,
    message: z.string().trim().min(1),
    context: z.record(z.string(), DiagnosticContextValueSchema).optional(),
  }),
});

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const NonNegativeFiniteNumberSchema = z.number().finite().nonnegative();

export const AnimationMetricsSchema = z.object({
  adapter: z.literal("noop"),
  cacheStatus: z.enum(["not_applicable", "hit", "miss"]),
  inputWidth: z.number().int().positive().nullable(),
  inputHeight: z.number().int().positive().nullable(),
  normalizedWidth: z.number().int().positive().nullable(),
  normalizedHeight: z.number().int().positive().nullable(),
  depthInferenceMs: NonNegativeFiniteNumberSchema,
  depthPostProcessMs: NonNegativeFiniteNumberSchema,
  sceneBuildMs: NonNegativeFiniteNumberSchema,
  frameRenderAverageMs: NonNegativeFiniteNumberSchema,
  frameRenderP95Ms: NonNegativeFiniteNumberSchema,
  encodeMs: NonNegativeFiniteNumberSchema,
  totalWallMs: NonNegativeFiniteNumberSchema,
  peakCpuMemoryBytes: z.number().int().nonnegative().nullable(),
  peakGpuMemoryBytes: z.number().int().nonnegative().nullable(),
  outputBytes: z.number().int().nonnegative(),
  selectedDevice: z.string().trim().min(1),
  hardwareDescription: z.string().trim().min(1),
  versions: z.object({
    engine: z.literal(ENGINE_VERSION),
    pipeline: z.string().trim().min(1),
    renderer: z.string().trim().min(1),
    browser: z.string().trim().min(1).nullable(),
    ffmpeg: z.string().trim().min(1).nullable(),
  }),
});

export const AnimationResultSchema = z
  .object({
    apiVersion: z.literal(ANIMATION_API_VERSION),
    status: z.enum(["rendered", "rendered_with_warnings", "fallback_2d"]),
    outputPath: z.string().trim().min(1),
    sceneManifestPath: z.string().trim().min(1),
    frameCount: z.number().int().positive(),
    durationMs: z.number().int().positive(),
    selectedPreset: ResolvedAnimationPresetSchema,
    warnings: z.array(AnimationWarningSchema),
    metrics: AnimationMetricsSchema,
    checksums: z.object({
      source: Sha256Schema,
      depth: Sha256Schema.optional(),
      scene: Sha256Schema,
      output: Sha256Schema,
    }),
  })
  .superRefine((result, context) => {
    if (
      result.frameCount !==
      calculateFrameCount(result.durationMs, V0_1_REQUEST_CONSTRAINTS.fps)
    ) {
      context.addIssue({
        code: "custom",
        message: "frameCount must match durationMs at the v0.1 fixed 30 fps",
        path: ["frameCount"],
      });
    }
    if (result.status === "rendered" && result.warnings.length > 0) {
      context.addIssue({
        code: "custom",
        message: "rendered status cannot contain warnings",
        path: ["status"],
      });
    }
    if (
      result.status === "rendered_with_warnings" &&
      result.warnings.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "rendered_with_warnings status requires at least one warning",
        path: ["warnings"],
      });
    }
    if (
      result.status === "fallback_2d" &&
      !result.warnings.some((warning) => warning.code === "FALLBACK_2D_USED")
    ) {
      context.addIssue({
        code: "custom",
        message: "fallback_2d status requires a FALLBACK_2D_USED warning",
        path: ["warnings"],
      });
    }
  });

export const SceneManifestSchema = z.object({
  schemaVersion: z.literal(SCENE_SCHEMA_VERSION),
  sourceHash: Sha256Schema,
  pipelineVersion: z.string().trim().min(1),
  rendererVersion: z.string().trim().min(1),
  timeline: z
    .object({
      durationMs: z.number().int().positive(),
      fps: z.literal(V0_1_REQUEST_CONSTRAINTS.fps),
      frameCount: z.number().int().positive(),
    })
    .superRefine((timeline, context) => {
      if (!wholeFrameDuration(timeline.durationMs, timeline.fps)) {
        context.addIssue({
          code: "custom",
          message: "timeline duration must resolve to a whole frame count",
          path: ["durationMs"],
        });
      }
      if (
        timeline.frameCount !==
        calculateFrameCount(timeline.durationMs, timeline.fps)
      ) {
        context.addIssue({
          code: "custom",
          message: "frameCount must match durationMs and fps",
          path: ["frameCount"],
        });
      }
    }),
  canvas: z.object({
    width: z.literal(V0_1_REQUEST_CONSTRAINTS.width),
    height: z.literal(V0_1_REQUEST_CONSTRAINTS.height),
  }),
  depth: z
    .object({
      asset: z.string().trim().min(1),
      strength: z.number().finite().nonnegative(),
      near: z.number().finite(),
      far: z.number().finite(),
    })
    .nullable(),
  motion: z.object({
    preset: ResolvedAnimationPresetSchema,
    intensity: AnimationIntensitySchema,
    seed: z
      .number()
      .int()
      .min(V0_1_REQUEST_CONSTRAINTS.seed.minimum)
      .max(V0_1_REQUEST_CONSTRAINTS.seed.maximum),
    safeCrop: z.number().finite().min(0).max(1),
  }),
  quality: z.object({
    riskScore: z.number().finite().min(0).max(1),
    fallback: z.boolean(),
    warnings: z.array(AnimationWarningSchema),
  }),
  execution: z.object({
    adapter: z.literal("noop"),
    producesVideo: z.literal(false),
  }),
});

export type AnimationRequest = z.infer<typeof AnimationRequestSchema>;
export type AnimationResult = z.infer<typeof AnimationResultSchema>;
export type AnimationWarning = z.infer<typeof AnimationWarningSchema>;
export type AnimationWarningCode = z.infer<typeof AnimationWarningCodeSchema>;
export type AnimationErrorCode = z.infer<typeof AnimationErrorCodeSchema>;
export type AnimationFailure = z.infer<typeof AnimationFailureSchema>;
export type AnimationMetrics = z.infer<typeof AnimationMetricsSchema>;
export type AnimationPreset = z.infer<typeof AnimationPresetSchema>;
export type ResolvedAnimationPreset = z.infer<
  typeof ResolvedAnimationPresetSchema
>;
export type SceneManifest = z.infer<typeof SceneManifestSchema>;
