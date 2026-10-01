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
  maxMetadataDepth: 64,
  maxCoordinate: 1_000_000,
  maxStretch: 100,
  maxSeed: 2_147_483_647,
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
 * Bound container depth before recursive JSON parsing. Size is checked during
 * semantic validation.
 */
export const metadata = z
  .unknown()
  .superRefine((value, ctx) => {
    type Entry = {
      value: unknown;
      depth: number;
      path: (string | number)[];
      exit?: boolean;
    };
    const stack: Entry[] = [{ value, depth: 0, path: [] }];
    const ancestors = new WeakSet<object>();
    const fail = (code: string, path: (string | number)[], message: string) =>
      ctx.addIssue({
        code: "custom",
        path,
        message: `${code}: ${message}`,
        params: { diagnosticCode: code },
        fatal: true,
      });
    while (stack.length) {
      const entry = stack.pop()!;
      if (entry.value === null || typeof entry.value !== "object") continue;
      if (entry.exit) {
        ancestors.delete(entry.value);
        continue;
      }
      if (ancestors.has(entry.value)) {
        fail(
          "comp-schema-type",
          entry.path,
          "metadata must contain JSON values without cycles",
        );
        return;
      }
      if (entry.depth > L.maxMetadataDepth) {
        fail(
          "comp-metadata-depth",
          entry.path,
          `metadata may nest at most ${L.maxMetadataDepth} container levels below its root`,
        );
        return;
      }
      ancestors.add(entry.value);
      stack.push({ ...entry, exit: true });
      const children = Array.isArray(entry.value)
        ? entry.value.entries()
        : Object.entries(entry.value);
      for (const [key, child] of children) {
        if (child === null || typeof child !== "object") continue;
        stack.push({
          value: child,
          depth: entry.depth + 1,
          path: [...entry.path, key],
        });
      }
    }
  })
  .pipe(z.record(z.string().max(128), z.json()));

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
