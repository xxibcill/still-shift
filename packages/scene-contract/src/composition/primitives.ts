import { z } from "zod";

export const COMPOSITION_SCHEMA_VERSION = "composition-1" as const;

/** Every bound in the contract, so tools and docs can quote them. */
export const COMPOSITION_LIMITS = {
  minSize: 16,
  maxSize: 8192,
  maxFrameCount: 108_000,
  /** Keys are in layer time and may lie before the layer starts or after it ends. */
  maxKeyFrame: 216_000,
  maxKeys: 2_000,
  /** Total across the root composition and every precomp. */
  maxLayers: 2_000,
  maxPrecomps: 200,
  maxPrecompDepth: 8,
  maxParentDepth: 32,
  maxAssets: 500,
  maxMarkers: 500,
  maxMasks: 32,
  maxEffects: 32,
  maxPathVertices: 1_024,
  maxImageSources: 32,
  maxTextLength: 4_000,
  maxTextStates: 12,
  maxSignals: 200,
  maxDrivers: 500,
  maxConstraints: 200,
  maxPeriodic: 200,
  maxTextAnimators: 200,
  maxExpressions: 2_000,
  maxExpressionLength: 2_000,
  maxPropertyPathLength: 512,
  maxMetadataBytes: 65_536,
  maxCoordinate: 1_000_000,
  maxStretch: 100,
} as const;

const L = COMPOSITION_LIMITS;

export const finite = z.number().finite();
/** Any authored number that is not otherwise constrained. */
export const bounded = finite.min(-L.maxCoordinate).max(L.maxCoordinate);
export const unit = finite.min(0).max(1);
export const compositionId = z
  .string()
  .regex(/^[a-zA-Z][\w-]*$/)
  .max(128);
/** Integer composition frame, as used by in/out points and markers. */
export const compFrame = finite.int().min(0).max(L.maxKeyFrame);
/** Integer frame in layer time, as used by keys. */
export const keyFrame = finite.int().min(-L.maxKeyFrame).max(L.maxKeyFrame);
export const compositionColor = z
  .string()
  .regex(/^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/);
export const vec2 = z.tuple([bounded, bounded]);
export const vec3 = z.tuple([bounded, bounded, bounded]);
export const size2 = z.tuple([
  finite.positive().max(L.maxCoordinate),
  finite.positive().max(L.maxCoordinate),
]);
export const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const label = z.string().min(1).max(200);

/**
 * Free-form JSON carried through unchanged (registration, claims, review notes).
 * Size is checked during semantic validation.
 */
export const metadata = z.record(z.string().max(128), z.json());

/** Reported on semantic issues so validation can return stable codes. */
export type IssueReporter = (
  code: string,
  path: (string | number)[],
  message: string,
) => void;

export const reporter =
  (ctx: z.RefinementCtx, base: (string | number)[] = []): IssueReporter =>
  (code, path, message) =>
    ctx.addIssue({
      code: "custom",
      path: [...base, ...path],
      message: `${code}: ${message}`,
      params: { diagnosticCode: code },
    });
