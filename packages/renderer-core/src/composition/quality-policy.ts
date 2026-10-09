import { z } from "zod";
import {
  COMPOSITION_LIMITS,
  type Composition,
} from "@still-shift/scene-contract";
import {
  passageError,
  type PassageDiagnostic,
} from "../passage-diagnostics.ts";
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
  readingPurposes?: { id: string; purpose: string }[];
  classification?:
    | "declared-reading-hold"
    | "speech-following-caption"
    | "declared-physical-proof-hold";
  speechCaption?: {
    cueId: string;
    sourceSha256: string;
    audioLayer: string;
    wordsPerSecond: number;
  };
  proofPurposes?: { id: string; purpose: string; evidenceSha256: string }[];
  rawSeverity?: "error" | "warning";
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
export const CompositionReadingDeclarationSchema = z
  .object({
    id: z.string().min(1).max(200),
    purpose: z.string().min(1).max(400),
    start: frame,
    end: frame,
    members: z
      .array(
        z
          .object({
            layer: z.string().min(1).max(1024),
            text: z.string().min(1).max(COMPOSITION_LIMITS.maxTextLength),
            kind: z.enum(["value", "unit", "qualification"]),
            locale: z.enum(["en", "th"]).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict();
export type CompositionReadingDeclaration = z.infer<
  typeof CompositionReadingDeclarationSchema
>;
export const CompositionSpeechCaptionSchema = z
  .object({
    id: z.string().min(1).max(200),
    cueId: z.string().min(1).max(200),
    purpose: z.string().min(1).max(400),
    layer: z.string().min(1).max(1024),
    text: z.string().min(1).max(COMPOSITION_LIMITS.maxTextLength),
    start: frame,
    end: frame,
    sourceSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    audioLayer: z.string().min(1).max(1024),
    audioSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    locale: z.enum(["en", "th"]).optional(),
  })
  .strict();
export type CompositionSpeechCaption = z.infer<
  typeof CompositionSpeechCaptionSchema
>;
export const CompositionPhysicalProofHoldSchema = z
  .object({
    id: z.string().min(1).max(200),
    purpose: z.string().min(1).max(400),
    layer: z.string().min(1).max(1024),
    start: frame,
    end: frame,
    evidenceSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    frames: z
      .array(
        z
          .object({
            frame,
            plateSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            physicalSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(COMPOSITION_LIMITS.maxFrameCount),
  })
  .strict();
export type CompositionPhysicalProofHold = z.infer<
  typeof CompositionPhysicalProofHoldSchema
>;
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
    readingDeclarations: z
      .array(CompositionReadingDeclarationSchema)
      .max(COMPOSITION_LIMITS.maxLayers)
      .optional(),
    physicalProofHolds: z
      .array(CompositionPhysicalProofHoldSchema)
      .max(1000)
      .optional(),
    speechCaptions: z
      .array(CompositionSpeechCaptionSchema)
      .max(COMPOSITION_LIMITS.maxLayers)
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
    passageError(
      "comp-lint-pixel-evidence",
      "Pixel evidence requires one nonempty hash per composition frame",
      { path: "pixelHashes" },
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
    passageError(
      "comp-lint-pixel-evidence",
      "Pixel evidence requires one bounded changed-pixel count per frame",
      { path: "pixelChangedCounts" },
    );
  if (pixelHashes && pixelChangedCounts)
    passageError(
      "comp-lint-pixel-evidence",
      "Provide hashes or changed-pixel counts, not both",
      { path: "pixelChangedCounts" },
    );
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
  const declaredCuts = [
    ...(policy.intentionalCuts ?? []).map((at, i) => ({
      at,
      path: `intentionalCuts.${i}`,
    })),
    ...(comp.motionBlur?.cuts ?? []).map((at, i) => ({
      at,
      path: `motionBlur.cuts.${i}`,
    })),
    ...(comp.markers ?? []).flatMap((marker, i) =>
      marker.label?.toLowerCase() === "cut" ||
      marker.id === "cut" ||
      marker.id.startsWith("cut-")
        ? [{ at: marker.frame, path: `markers.${i}.frame` }]
        : [],
    ),
  ];
  for (const { at, path } of declaredCuts)
    if (at >= comp.frameCount)
      passageError(
        "comp-lint-cut-range",
        "Intentional cut outside composition timeline",
        { path },
      );
  const cuts = new Set(declaredCuts.map(({ at }) => at));
  const shots = policy.shots ?? [
    { id: comp.id, start: 0, end: comp.frameCount },
  ];
  const names = new Set<string>();
  shots.forEach((shot, i) => {
    if (names.has(shot.id))
      passageError("comp-lint-shot-id", "Shots must have unique ids", {
        path: `shots.${i}.id`,
      });
    if (shot.end <= shot.start || shot.end > comp.frameCount)
      passageError(
        "comp-lint-shot-range",
        "Shot end must follow its start and stay within the composition timeline",
        { path: `shots.${i}.end` },
      );
    if (shot.start !== (i ? shots[i - 1]!.end : 0))
      passageError(
        "comp-lint-shot-partition",
        "Shots must partition the complete timeline in order",
        { path: `shots.${i}.start` },
      );
    names.add(shot.id);
    if (shot.start > 0) cuts.add(shot.start);
  });
  if (shots.at(-1)!.end !== comp.frameCount)
    passageError(
      "comp-lint-shot-partition",
      "Shots must cover the complete composition timeline",
      { path: `shots.${shots.length - 1}.end` },
    );
  const declarationIds = new Set<string>();
  for (const [index, declaration] of (
    policy.readingDeclarations ?? []
  ).entries()) {
    const path = `readingDeclarations.${index}`;
    if (declarationIds.has(declaration.id))
      passageError(
        "comp-lint-reading-id",
        "Reading declarations must have unique IDs",
        { path: path + ".id" },
      );
    declarationIds.add(declaration.id);
    if (
      declaration.end <= declaration.start ||
      declaration.end > comp.frameCount
    )
      passageError(
        "comp-lint-reading-range",
        "Reading interval must be positive and stay inside the composition timeline",
        { path: path + ".end" },
      );
    const members = new Set<string>();
    for (const [memberIndex, member] of declaration.members.entries()) {
      if (members.has(member.layer))
        passageError(
          "comp-lint-reading-member",
          "A phrase cannot repeat a layer",
          { path: path + `.members.${memberIndex}.layer` },
        );
      members.add(member.layer);
    }
    if (!declaration.members.some((member) => member.kind === "value"))
      passageError(
        "comp-lint-reading-value",
        "A reading declaration requires an explicit value or whole phrase",
        { path: path + ".members" },
      );
  }
  const proofIds = new Set<string>();
  let proofFrames = 0;
  for (const [index, proof] of (policy.physicalProofHolds ?? []).entries()) {
    const path = `physicalProofHolds.${index}`;
    const layer = comp.layers.find((layer) => layer.id === proof.layer);
    const metadata = layer?.metadata?.physicalProof;
    const captured =
      metadata && typeof metadata === "object"
        ? CompositionPhysicalProofHoldSchema.safeParse(metadata)
        : undefined;
    proofFrames += proof.frames.length;
    if (
      proofIds.has(proof.id) ||
      proof.end <= proof.start ||
      proof.end > comp.frameCount ||
      proof.frames.length !== proof.end - proof.start ||
      proof.frames.some((row, index) => row.frame !== proof.start + index) ||
      proofFrames > comp.frameCount
    )
      passageError(
        "comp-lint-proof-hold",
        "Physical proof holds require unique IDs and bounded complete ordered samples",
        { path },
      );
    proofIds.add(proof.id);
    if (
      layer?.type !== "sequence" ||
      layer.inPoint !== proof.start ||
      layer.outPoint !== proof.end ||
      !captured?.success ||
      JSON.stringify(captured.data) !== JSON.stringify(proof)
    )
      passageError(
        "comp-lint-proof-hold",
        "Physical proof declarations must match native capture evidence and its complete shot range",
        { path: path + ".layer" },
      );
  }
  const speechIds = new Set<string>();
  for (const [index, cue] of (policy.speechCaptions ?? []).entries()) {
    const path = `speechCaptions.${index}`;
    const text = comp.layers.find((layer) => layer.id === cue.layer);
    const audio = comp.layers.find((layer) => layer.id === cue.audioLayer);
    const asset =
      audio?.type === "audio"
        ? comp.assets.find((asset) => asset.id === audio.asset)
        : undefined;
    if (
      speechIds.has(cue.id) ||
      cue.end <= cue.start ||
      cue.end > comp.frameCount
    )
      passageError(
        "comp-lint-speech-caption",
        "Speech cue IDs and complete source intervals must be valid",
        { path },
      );
    speechIds.add(cue.id);
    const sourceCue = CompositionSpeechCaptionSchema.safeParse(
      text?.metadata?.speechCue,
    );
    if (
      text?.type !== "text" ||
      text.textRole !== "body" ||
      !sourceCue.success ||
      JSON.stringify(sourceCue.data) !== JSON.stringify(cue) ||
      text.text !== cue.text ||
      text.inPoint !== cue.start ||
      text.outPoint !== cue.end
    )
      passageError(
        "comp-lint-speech-caption",
        "Speech captions require exact copy and unchanged source cue boundaries",
        { path: path + ".layer" },
      );
    if (
      audio?.type !== "audio" ||
      audio.role !== "narration" ||
      asset?.type !== "audio" ||
      asset.sha256 !== cue.audioSha256 ||
      (audio.inPoint ?? 0) > cue.start ||
      (audio.outPoint ?? comp.frameCount) < cue.end ||
      (audio.sourceEndSample ?? asset.sampleCount) -
        (audio.sourceStartSample ?? 0) <
        ((cue.end - (audio.inPoint ?? 0)) * asset.sampleRate) / comp.fps
    )
      passageError(
        "comp-lint-speech-caption",
        "Speech captions require pinned narration samples covering their complete cue",
        { path: path + ".audioLayer" },
      );
  }
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
