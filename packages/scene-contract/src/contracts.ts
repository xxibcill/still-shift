import { z } from "zod";

export const ANIMATION_API_VERSION = "0.1" as const;
export const ENGINE_VERSION = "0.10" as const;
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
  "DEPTH_RANGE_EXTREME",
  "DEPTH_EDGE_RISK_HIGH",
  "DEPTH_PREPARATION_FAILED",
  "DEPTH_SAFETY_ANALYSIS_FAILED",
  "LATERAL_MOTION_REDUCED",
  "INTENSITY_DOWNGRADED",
  "FALLBACK_2D_USED",
  "PREVIEW_EXPORT_VARIANCE",
  "SOURCE_NORMALIZATION_WARNING",
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
  "INPUT_DECODE_FAILED",
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

export const DepthModelSchema = z.object({
  adapter: z.string().trim().min(1),
  id: z.string().trim().min(1),
  revision: z.string().trim().min(1),
  weightsChecksum: Sha256Schema,
  license: z.string().trim().min(1),
});

export const AnimationMetricsSchema = z.object({
  adapter: z.enum(["noop", "webgl"]),
  frameTransport: z.enum(["png_pipe", "jpeg_pipe"]).optional(),
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
    model: DepthModelSchema.nullable().optional(),
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
    assetPaths: z
      .object({
        normalizedSource: z.string().trim().min(1),
        depth: z.string().trim().min(1).nullable(),
      })
      .optional(),
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

const SceneTimelineSchema = z
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
  });

const SceneCanvasSchema = z.object({
  width: z.literal(V0_1_REQUEST_CONSTRAINTS.width),
  height: z.literal(V0_1_REQUEST_CONSTRAINTS.height),
});

export const RenderSceneSchema = z.object({
  rendererVersion: z.string().trim().min(1),
  presetVersion: z.string().trim().min(1),
  timeline: SceneTimelineSchema,
  source: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  canvas: SceneCanvasSchema,
  motion: z.object({
    mode: z.enum(["depth", "fallback_2d"]),
    preset: ResolvedAnimationPresetSchema,
    intensity: AnimationIntensitySchema,
    seed: z
      .number()
      .int()
      .min(V0_1_REQUEST_CONSTRAINTS.seed.minimum)
      .max(V0_1_REQUEST_CONSTRAINTS.seed.maximum),
    travel: z.number().finite().nonnegative(),
    depthStrength: z.number().finite().nonnegative(),
    lateralTravel: z.number().finite().nonnegative(),
    rollDegrees: z.number().finite(),
    overscan: z.number().finite().min(0).max(1),
    maximumCrop: z.number().finite().min(0).max(1),
  }),
  quality: z
    .object({
      analysisVersion: z.string().trim().min(1),
      riskScore: z.number().finite().min(0).max(1),
      fallback: z.boolean(),
      fallbackReason: AnimationWarningCodeSchema.nullable(),
      signals: z.record(z.string(), z.number().finite()),
    })
    .nullable(),
  warnings: z.array(AnimationWarningSchema),
});

export const SceneManifestSchema = z
  .object({
    schemaVersion: z.literal(SCENE_SCHEMA_VERSION),
    sourceHash: Sha256Schema,
    normalizedSourceHash: Sha256Schema.optional(),
    sourceAssetPath: z.string().min(1).optional(),
    pipelineVersion: z.string().trim().min(1),
    model: DepthModelSchema.nullable().optional(),
    rendererVersion: z.string().trim().min(1),
    timeline: SceneTimelineSchema,
    canvas: SceneCanvasSchema,
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
    renderScene: RenderSceneSchema.optional(),
    execution: z.discriminatedUnion("adapter", [
      z.object({ adapter: z.literal("noop"), producesVideo: z.literal(false) }),
      z.object({
        adapter: z.literal("webgl"),
        producesVideo: z.literal(true),
        frameTransport: z.enum(["png_pipe", "jpeg_pipe"]).optional(),
      }),
    ]),
  })
  .superRefine((manifest, context) => {
    const scene = manifest.renderScene;
    if (manifest.execution.adapter === "webgl" && !scene) {
      context.addIssue({
        code: "custom",
        message: "WebGL manifests require a resolved renderer scene",
        path: ["renderScene"],
      });
      return;
    }
    if (!scene) return;

    const mismatches = [
      ["rendererVersion", scene.rendererVersion !== manifest.rendererVersion],
      [
        "timeline",
        JSON.stringify(scene.timeline) !== JSON.stringify(manifest.timeline),
      ],
      [
        "canvas",
        JSON.stringify(scene.canvas) !== JSON.stringify(manifest.canvas),
      ],
      ["motion.preset", scene.motion.preset !== manifest.motion.preset],
      [
        "motion.intensity",
        scene.motion.intensity !== manifest.motion.intensity,
      ],
      ["motion.seed", scene.motion.seed !== manifest.motion.seed],
      [
        "motion.maximumCrop",
        scene.motion.maximumCrop !== manifest.motion.safeCrop,
      ],
      [
        "quality",
        scene.quality?.riskScore !== manifest.quality.riskScore ||
          scene.quality.fallback !== manifest.quality.fallback,
      ],
      [
        "warnings",
        JSON.stringify(scene.warnings) !==
          JSON.stringify(manifest.quality.warnings),
      ],
      [
        "depth.strength",
        manifest.depth !== null &&
          scene.motion.depthStrength !== manifest.depth.strength,
      ],
      ["depth", scene.motion.mode === "depth" && manifest.depth === null],
    ] as const;
    for (const [field, mismatch] of mismatches) {
      if (mismatch) {
        context.addIssue({
          code: "custom",
          message: `Renderer scene ${field} does not match the manifest`,
          path: ["renderScene", ...field.split(".")],
        });
      }
    }
  });

export type AnimationRequest = z.infer<typeof AnimationRequestSchema>;
export type AnimationResult = z.infer<typeof AnimationResultSchema>;
export type AnimationWarning = z.infer<typeof AnimationWarningSchema>;
export type AnimationWarningCode = z.infer<typeof AnimationWarningCodeSchema>;
export type AnimationErrorCode = z.infer<typeof AnimationErrorCodeSchema>;
export type AnimationFailure = z.infer<typeof AnimationFailureSchema>;
export type AnimationMetrics = z.infer<typeof AnimationMetricsSchema>;
export type DepthModel = z.infer<typeof DepthModelSchema>;
export type AnimationPreset = z.infer<typeof AnimationPresetSchema>;
export type ResolvedAnimationPreset = z.infer<
  typeof ResolvedAnimationPresetSchema
>;
export type SceneManifest = z.infer<typeof SceneManifestSchema>;
