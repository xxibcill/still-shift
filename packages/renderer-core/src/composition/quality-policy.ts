import { z } from "zod";
import {
  COMPOSITION_LIMITS,
  type Composition,
} from "@still-shift/scene-contract";
import type { PassageDiagnostic } from "../passage-diagnostics.ts";
import type { EvaluationOptions } from "./evaluate/types.ts";

export const MOTION_LINT_CODES = [
  "frozen-run",
  "frozen-pixels",
  "velocity-discontinuity",
  "easing-monotony",
  "co-start",
  "reading-time",
  "off-canvas",
  "outside-safe-area",
  "coverage",
  "scale-pop",
  "opacity-pop",
] as const;
export type MotionLintCode = (typeof MOTION_LINT_CODES)[number];
export type MotionLintDiagnostic = PassageDiagnostic & {
  frames: [number, number];
  nodes: string[];
  measured: number;
  shot?: string;
};
const nonnegative = z.number().finite().nonnegative();
const positive = z.number().finite().positive();
const fraction = nonnegative.max(1);
const frame = nonnegative.int().max(COMPOSITION_LIMITS.maxFrameCount);
const reading = z
  .object({
    wordsPerSecond: positive.max(100),
    minimumSeconds: nonnegative.max(60),
  })
  .strict();
export const CompositionQualityPolicySchema = z
  .object({
    maxFrozenFrames: frame.optional(),
    pixelChannelThreshold: nonnegative.int().max(255).optional(),
    pixelMinimumChanges: positive
      .int()
      .max(COMPOSITION_LIMITS.maxSize ** 2)
      .optional(),
    velocityJumpRatio: nonnegative.optional(),
    easingMonotonyShare: fraction.optional(),
    minimumMovingProperties: positive.int().max(10000).optional(),
    coStartLayers: positive
      .int()
      .min(2)
      .max(COMPOSITION_LIMITS.maxLayers)
      .optional(),
    safeAreaFraction: nonnegative.max(0.49).optional(),
    opacityPop: fraction.optional(),
    scalePop: nonnegative.optional(),
    popNeighbourRatio: fraction.optional(),
    readingOpacity: fraction.optional(),
    readingReveal: fraction.optional(),
    readingVelocity: nonnegative.optional(),
    reading: z
      .object({
        heading: reading.optional(),
        label: reading.optional(),
        qualification: reading.optional(),
        body: reading.optional(),
      })
      .strict()
      .optional(),
    coverageLayers: z
      .array(z.string().min(1).max(1024))
      .max(COMPOSITION_LIMITS.maxLayers)
      .optional(),
    intentionalCuts: z.array(frame).max(COMPOSITION_LIMITS.maxKeys).optional(),
    shots: z
      .array(
        z
          .object({ id: z.string().min(1).max(200), start: frame, end: frame })
          .strict(),
      )
      .min(1)
      .max(1000)
      .optional(),
    severities: z
      .partialRecord(z.enum(MOTION_LINT_CODES), z.enum(["error", "warning"]))
      .optional(),
  })
  .strict();
export type CompositionQualityPolicy = z.infer<
  typeof CompositionQualityPolicySchema
> & {
  pixelHashes?: readonly string[];
  pixelChangedCounts?: readonly number[];
  evaluation?: EvaluationOptions;
};
export function resolveCompositionQualityPolicy(
  comp: Composition,
  input: CompositionQualityPolicy,
) {
  const { pixelHashes, pixelChangedCounts, evaluation, ...settings } = input;
  const policy = CompositionQualityPolicySchema.parse(settings);
  if (
    pixelHashes &&
    (pixelHashes.length !== comp.frameCount ||
      pixelHashes.some((hash) => typeof hash !== "string" || !hash.length))
  )
    throw new Error(
      "Pixel evidence requires one nonempty hash per composition frame",
    );
  if (
    pixelChangedCounts &&
    (pixelChangedCounts.length !== comp.frameCount ||
      pixelChangedCounts.some(
        (count) =>
          !Number.isInteger(count) ||
          count < 0 ||
          count > comp.width * comp.height,
      ))
  )
    throw new Error(
      "Pixel evidence requires one bounded changed-pixel count per frame",
    );
  if (pixelHashes && pixelChangedCounts)
    throw new Error("Provide hashes or changed-pixel counts, not both");
  const pixelSignatures = pixelChangedCounts
    ? pixelChangedCounts.reduce<string[]>((signatures, count, i) => {
        signatures.push(
          i && count < (policy.pixelMinimumChanges ?? 200)
            ? signatures[i - 1]!
            : String(i),
        );
        return signatures;
      }, [])
    : pixelHashes;
  const cuts = new Set([
    ...(policy.intentionalCuts ?? []),
    ...(comp.motionBlur?.cuts ?? []),
    ...(comp.markers ?? [])
      .filter(
        (m) =>
          m.label?.toLowerCase() === "cut" ||
          m.id === "cut" ||
          m.id.startsWith("cut-"),
      )
      .map((m) => m.frame),
  ]);
  if ([...cuts].some((at) => at >= comp.frameCount))
    throw new Error("Intentional cut outside composition timeline");
  const shots = policy.shots ?? [
    { id: comp.id, start: 0, end: comp.frameCount },
  ];
  const names = new Set<string>();
  shots.forEach((shot, i) => {
    if (
      names.has(shot.id) ||
      shot.end <= shot.start ||
      shot.end > comp.frameCount ||
      shot.start !== (i ? shots[i - 1]!.end : 0)
    )
      throw new Error(
        "Shots must have unique ids and partition the complete timeline in order",
      );
    names.add(shot.id);
    if (shot.start > 0) cuts.add(shot.start);
  });
  if (shots.at(-1)!.end !== comp.frameCount)
    throw new Error("Shots must cover the complete composition timeline");
  return {
    ...policy,
    maxFrozenFrames: policy.maxFrozenFrames ?? 6,
    pixelChannelThreshold: policy.pixelChannelThreshold ?? 4,
    pixelMinimumChanges: policy.pixelMinimumChanges ?? 200,
    velocityJumpRatio: policy.velocityJumpRatio ?? 0.02,
    easingMonotonyShare: policy.easingMonotonyShare ?? 0.9,
    minimumMovingProperties: policy.minimumMovingProperties ?? 4,
    coStartLayers: policy.coStartLayers ?? 3,
    safeAreaFraction: policy.safeAreaFraction ?? 0.05,
    opacityPop: policy.opacityPop ?? 0.25,
    scalePop: policy.scalePop ?? 0.2,
    popNeighbourRatio: policy.popNeighbourRatio ?? 0.25,
    readingOpacity: policy.readingOpacity ?? 0.9,
    readingReveal: policy.readingReveal ?? 0.95,
    readingVelocity: policy.readingVelocity ?? 20,
    shots,
    cuts,
    evaluation: evaluation ?? {},
    pixelHashes: pixelSignatures,
    pixelMethod: pixelChangedCounts
      ? ("grayscale-energy" as const)
      : pixelHashes
        ? ("exact-hashes" as const)
        : ("unmeasured" as const),
  };
}
export type ResolvedCompositionQualityPolicy = ReturnType<
  typeof resolveCompositionQualityPolicy
>;
export function lintSeverity(
  code: MotionLintCode,
  policy: ResolvedCompositionQualityPolicy,
) {
  return (
    policy.severities?.[code] ??
    ([
      "frozen-run",
      "frozen-pixels",
      "reading-time",
      "coverage",
      "scale-pop",
      "opacity-pop",
    ].includes(code)
      ? "error"
      : "warning")
  );
}
