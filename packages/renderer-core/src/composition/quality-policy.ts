import { z } from "zod";
import {
  COMPOSITION_LIMITS,
  type Composition,
} from "@still-shift/scene-contract";
import {
  passageError,
  type PassageDiagnostic,
} from "../passage-diagnostics.ts";
import type { Bounds, EvaluationOptions } from "./evaluate/types.ts";

export const MOTION_LINT_CODES = [
  "frozen-run",
  "frozen-pixels",
  "velocity-discontinuity",
  "easing-monotony",
  "co-start",
  "reading-time",
  "off-canvas",
  "outside-safe-area",
  "text-off-canvas",
  "orphaned-decoration",
  "coverage",
  "scale-pop",
  "opacity-pop",
  "semantic-context-required",
  "semantic-context-incomplete",
  "semantic-copy-changed",
  "semantic-member-reference",
  "text-contrast",
  "x-height-floor",
  "platform-safe-zone",
] as const;
/** ET3 legibility rules; they run only when `textLegibility` is declared. */
export const TEXT_LEGIBILITY_CODES = [
  "text-contrast",
  "x-height-floor",
  "platform-safe-zone",
] as const satisfies readonly (typeof MOTION_LINT_CODES)[number][];
export type TextLegibilityCode = (typeof TEXT_LEGIBILITY_CODES)[number];
/**
 * ET6b lint policy profiles. `editorial-title` is opt-in: it turns on the
 * legibility rules with the treated-edge contrast measure and size-split
 * targets, and counts slow one-direction hold drift as reading time (D-read).
 * `none` lints without a profile, overriding one saved in the composition's
 * `metadata.readingPolicy` (lint merges the policy over it key by key).
 */
export const COMPOSITION_LINT_PROFILES = ["editorial-title", "none"] as const;
export type CompositionLintProfile = (typeof COMPOSITION_LINT_PROFILES)[number];
/** ET3 measures glyph interiors; ET6b's `treated-edge` credits outlines and halos. */
export const TEXT_CONTRAST_METHODS = [
  "glyph-interior",
  "treated-edge",
] as const;
export type TextContrastMethod = (typeof TEXT_CONTRAST_METHODS)[number];
export type MotionLintCode = (typeof MOTION_LINT_CODES)[number];
export type MotionLintDiagnostic = PassageDiagnostic & {
  frames: [number, number];
  nodes: string[];
  measured: number;
  shot?: string;
  readingPurposes?: { id: string; purpose: string }[];
  classification?:
    | "legibility-waiver"
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
  /** ET3: words of a text layer below the contrast target, worst first. */
  words?: { word: string; index: number; contrast: number; frame: number }[];
  /** ET3: the declared per-layer waiver that kept this finding advisory. */
  waiver?: { reason: string };
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
export const CompositionReadingMemberSchema = z
  .object({
    layer: z.string().min(1).max(1024),
    text: z.string().min(1).max(COMPOSITION_LIMITS.maxTextLength),
    kind: z.enum(["value", "unit", "qualification"]),
    locale: z.enum(["en", "th"]).optional(),
  })
  .strict();
export const CompositionReadingDeclarationSchema = z
  .object({
    id: z.string().min(1).max(200),
    purpose: z.string().min(1).max(400),
    start: frame,
    end: frame,
    members: z.array(CompositionReadingMemberSchema).min(1).max(16),
  })
  .strict();
export const CompositionSemanticAssociationSchema = z
  .object({
    id: z.string().min(1).max(200),
    purpose: z.string().min(1).max(400),
    kind: z.enum(["quantity", "phrase"]),
    start: frame,
    end: frame,
    members: z.array(CompositionReadingMemberSchema).min(1).max(16),
    requiredKinds: z
      .array(z.enum(["unit", "qualification"]))
      .max(2)
      .optional(),
  })
  .strict();
export type CompositionSemanticAssociation = z.infer<
  typeof CompositionSemanticAssociationSchema
>;
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
    sourceStartFrame: frame.default(0),
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
const contrastTarget = z.number().finite().min(1).max(21);
/**
 * ET3 text legibility over the rendered frames. Declaring it (even `{}`)
 * enables `text-contrast` (pixel lint only), `x-height-floor` and, when
 * `safeZones` are declared, `platform-safe-zone`. Findings are warnings
 * unless `severities` raises them.
 */
export const CompositionTextLegibilitySchema = z
  .object({
    /** Minimum WCAG 2 contrast per text role. */
    contrast: z
      .object({
        heading: contrastTarget.optional(),
        label: contrastTarget.optional(),
        qualification: contrastTarget.optional(),
        body: contrastTarget.optional(),
      })
      .strict()
      .optional(),
    /** Lower percentile of a word's per-pixel contrasts taken as its contrast. */
    contrastPercentile: fraction.max(0.5).optional(),
    /**
     * ET6b: `glyph-interior` (default) compares each glyph pixel with the
     * frame behind it; `treated-edge` compares the fill with what surrounds
     * its edge (outline, halo, shadow or footage) and the outlined letter
     * with the footage around it, and takes the better of the two.
     */
    contrastMethod: z.enum(TEXT_CONTRAST_METHODS).optional(),
    /**
     * ET6b size-split targets (ET3-D1). Text whose smallest font size is at
     * least `minimumSize` px at the review width uses `contrast`; smaller
     * text uses `small`. Declaring it replaces the per-role targets.
     */
    display: z
      .object({
        minimumSize: positive.max(1000).optional(),
        contrast: contrastTarget.optional(),
        small: contrastTarget.optional(),
        /**
         * Lower percentile of a display word's edge contrasts taken as its
         * contrast (small text keeps `contrastPercentile`): a large word
         * reads when most of its edge is clear.
         */
        percentile: fraction.max(0.5).optional(),
      })
      .strict()
      .optional(),
    /** Output width shown at phone scale, in CSS pixels (default 360). */
    reviewWidth: positive.int().max(COMPOSITION_LIMITS.maxSize).optional(),
    /** Minimum x-height at `reviewWidth`, in pixels (default 6). */
    minimumXHeight: positive.max(1000).optional(),
    /** Platform UI bands that text should avoid, as data; none by default. */
    safeZones: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            edge: z.enum(["top", "bottom", "left", "right"]),
            /** Band depth as a fraction of the frame height (top/bottom) or width. */
            fraction: positive.max(0.5),
          })
          .strict(),
      )
      .max(16)
      .optional(),
    waivers: z
      .array(
        z
          .object({
            layer: z.string().min(1).max(1024),
            reason: z.string().min(1).max(400),
            codes: z
              .array(z.enum(TEXT_LEGIBILITY_CODES))
              .min(1)
              .max(TEXT_LEGIBILITY_CODES.length)
              .optional(),
          })
          .strict(),
      )
      .max(COMPOSITION_LIMITS.maxLayers)
      .optional(),
  })
  .strict();
export type CompositionTextLegibility = z.infer<
  typeof CompositionTextLegibilitySchema
>;
export const CompositionQualityPolicySchema = z
  .object({
    semanticProfile: z.enum(["legacy", "require-declared-context"]).optional(),
    semanticAssociations: z
      .array(CompositionSemanticAssociationSchema)
      .max(COMPOSITION_LIMITS.maxLayers)
      .optional(),
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
    /**
     * ET5a: share of a text layer's settled glyph-ink area outside the frame
     * at which `text-off-canvas` is reported (default 0.05).
     */
    textOffCanvasFraction: positive.max(1).optional(),
    /**
     * ET6b: an opt-in bundle of defaults, or `none` to lint without a saved
     * one; see `COMPOSITION_LINT_PROFILES`.
     */
    profile: z.enum(COMPOSITION_LINT_PROFILES).optional(),
    /**
     * ET6b reading rule (D-read): slow, steady one-direction motion counts as
     * reading time. Speeds and travel are in letter-heights (cap height at
     * the layer's scale); jitter, back-and-forth and spinning still end it.
     */
    readingMotion: z
      .object({
        /** Largest glyph speed, in letter-heights per second. */
        velocity: positive.max(100).optional(),
        /** Largest glyph travel within one reading run, in letter-heights. */
        displacement: positive.max(1000).optional(),
      })
      .strict()
      .optional(),
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
    textLegibility: CompositionTextLegibilitySchema.optional(),
  })
  .strict();
/**
 * ET6b `editorial-title` defaults. Reading motion follows the owner's D-read
 * rule ("about one letter-height per second or less"); the travel budget and
 * the display contrast level are calibrated in
 * docs/editorial-typography-phase2-results.json.
 */
export const EDITORIAL_TITLE_PROFILE = {
  readingMotion: { velocity: 1, displacement: 2 },
  textLegibility: {
    contrastMethod: "treated-edge" as const,
    // Proposed from the 16 accepted ET7a candidates (lowest 1.63:1 at the
    // median edge) with a margin; untreated or hairline-outlined display text
    // over matching footage measures about 1.2:1. The owner confirmed it on
    // the near-threshold variants (D-level, 2026-11-20: "Confirm 1.5:1").
    display: { minimumSize: 24, contrast: 1.5, small: 4.5, percentile: 0.5 },
  },
} as const;
export type CompositionQualityPolicy = z.infer<
  typeof CompositionQualityPolicySchema
> & {
  pixelHashes?: readonly string[];
  pixelChangedCounts?: readonly number[];
  evaluation?: EvaluationOptions;
  /** ET3 runtime evidence; never part of a saved policy. */
  textLegibilityEvidence?: TextLegibilityEvidence;
  /** ET5a runtime evidence; never part of a saved policy. */
  textFramingEvidence?: TextFramingEvidence;
};
/** ET6b: a text layer's glyphs at one frame, for the reading-motion rule. */
export type TextGlyphMotion = {
  /** Cap height of the shaped layout, in layer-local pixels. */
  capHeight: number;
  /**
   * x, y pairs in layer-local pixels: each visible glyph's centre and the
   * two ends of its advance, where the glyph is drawn after text animators
   * (scaled and turned about the animator's glyph, word or line anchor).
   */
  points: readonly number[];
  /** Lowest opacity of a visible glyph (1 without glyphs). */
  opacity: number;
  /** Largest glyph blur, in layer-local pixels. */
  blur: number;
  /**
   * Thinnest text-animator stroke of a visible glyph, in layer-local pixels
   * (0 when one is unstroked): whether an outline-only layer is drawn.
   */
  strokeWidth?: number;
};
/** Measured inputs for the ET5a framing and decoration rules (pixel lint). */
export type TextFramingEvidence = {
  /**
   * Per text layer key (root id or `precomp-id/layer-id`), per text state: the
   * settled glyph-ink box of each line in layer-local pixels.
   */
  ink?: Record<string, readonly (readonly Bounds[])[]>;
  /**
   * Indices of a text layer's decorations that paint while every glyph they
   * decorate is transparent. Asked for each visible frame of a decorated text
   * layer, from the frames the analysis already sampled.
   */
  orphanedDecorations?: (content: {
    key: string;
    state: number;
    reveal: number;
    time: number;
  }) => readonly number[];
  /**
   * ET6b: glyph positions after text animators, from the prepared layout;
   * undefined for text without a pinned font or while two copies blend.
   */
  glyphMotion?: (content: {
    key: string;
    state: number;
    reveal: number;
    time: number;
  }) => TextGlyphMotion | undefined;
};
/** Measured inputs for the ET3 legibility rules, supplied by the lint runner. */
export type TextLegibilityEvidence = {
  /** Per root text layer: per-frame contrast samples from rendered pixels. */
  contrast?: Record<string, TextContrastLayerEvidence>;
  /** x-height per em for each pinned font asset, read from its OS/2 table. */
  fontXHeights?: Record<string, number>;
  /**
   * Why a pinned font's x-height could not be read (for example a WOFF or
   * WOFF2 font, which the SFNT reader does not parse); its layers are listed
   * as unmeasured.
   */
  fontXHeightErrors?: Record<string, string>;
};
export type TextContrastSample =
  | [number, number]
  | [number, number, number, number | null];
export type TextContrastLayerEvidence = {
  attribution: "word" | "layer";
  /** Present when attribution falls back to the whole layer. */
  attributionReason?: string;
  words: { index: number; word: string }[];
  /** Frames in the layer's reading window, in order. */
  frames: {
    frame: number;
    /**
     * Per word index: [percentile contrast, glyph-interior pixels]; null when
     * unmeasured. ET6b `treated-edge` appends the fill-edge and outer-edge
     * percentiles: [combined, fill-edge pixels, fill edge, outer edge or null].
     */
    words: (TextContrastSample | null)[];
  }[];
};
/**
 * Whether a lint policy (or the composition's saved reading policy) turns on
 * the ET3 legibility rules: by declaring `textLegibility` or, ET6b, the
 * `editorial-title` profile.
 */
export function declaresTextLegibility(
  policy: { textLegibility?: unknown; profile?: unknown },
  saved?: unknown,
) {
  const stored = (saved ?? {}) as {
    textLegibility?: unknown;
    profile?: unknown;
  };
  return Boolean(
    policy.textLegibility ||
      stored.textLegibility ||
      (policy.profile ?? stored.profile) === "editorial-title",
  );
}
/**
 * ET6b: whether lint reads outline-only (hollow) text layers by their
 * outline. One condition for both the reading-time windows and the
 * legibility reading frames: the `treated-edge` contrast measure, the one
 * that can measure such a layer.
 */
export function readsOutlinedText(policy: {
  textLegibility?:
    | { contrastMethod?: TextContrastMethod | undefined }
    | undefined;
}) {
  return policy.textLegibility?.contrastMethod === "treated-edge";
}
export function resolveCompositionQualityPolicy(
  comp: Composition,
  input: CompositionQualityPolicy,
) {
  const {
    pixelHashes,
    pixelChangedCounts,
    evaluation,
    textLegibilityEvidence,
    textFramingEvidence,
    ...settings
  } = input;
  const savedPolicy = comp.metadata?.readingPolicy;
  if (
    savedPolicy !== undefined &&
    (!savedPolicy ||
      typeof savedPolicy !== "object" ||
      Array.isArray(savedPolicy))
  )
    passageError("comp-lint-policy", "Saved readingPolicy must be an object", {
      path: "metadata.readingPolicy",
    });
  const policy = CompositionQualityPolicySchema.parse({
    ...savedPolicy,
    ...settings,
  });
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
  const associationIds = new Set<string>();
  for (const [index, association] of (
    policy.semanticAssociations ?? []
  ).entries()) {
    const path = `semanticAssociations.${index}`;
    if (associationIds.has(association.id))
      passageError("comp-lint-semantic-id", "Semantic IDs must be unique", {
        path: path + ".id",
      });
    associationIds.add(association.id);
    if (
      association.end <= association.start ||
      association.end > comp.frameCount
    )
      passageError(
        "comp-lint-semantic-range",
        "Semantic interval must be positive and stay inside the composition timeline",
        { path: path + ".end" },
      );
    const memberIds = new Set<string>();
    for (const [memberIndex, member] of association.members.entries()) {
      if (memberIds.has(member.layer))
        passageError(
          "comp-lint-semantic-member",
          "Members cannot repeat a layer",
          {
            path: path + `.members.${memberIndex}.layer`,
          },
        );
      memberIds.add(member.layer);
    }
    const required = new Set([
      "value",
      ...(association.kind === "quantity" ? ["unit"] : []),
      ...(association.requiredKinds ?? []),
    ]);
    for (const kind of required)
      if (!association.members.some((member) => member.kind === kind))
        passageError(
          "comp-lint-semantic-member",
          `Semantic association requires an explicit ${kind} member`,
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
        // The final output frame may contain a partial unchanged source tail.
        // Every displayed frame still requires at least one source sample.
        Math.ceil(
          ((cue.end - 1 - (audio.inPoint ?? 0)) * asset.sampleRate) / comp.fps,
        ) +
          1
    )
      passageError(
        "comp-lint-speech-caption",
        "Speech captions require pinned narration samples covering their complete cue",
        { path: path + ".audioLayer" },
      );
  }
  const editorial = policy.profile === "editorial-title";
  const readingMotion =
    policy.readingMotion || editorial
      ? {
          velocity:
            policy.readingMotion?.velocity ??
            EDITORIAL_TITLE_PROFILE.readingMotion.velocity,
          displacement:
            policy.readingMotion?.displacement ??
            EDITORIAL_TITLE_PROFILE.readingMotion.displacement,
        }
      : undefined;
  const textLegibility = editorial
    ? {
        ...policy.textLegibility,
        contrastMethod:
          policy.textLegibility?.contrastMethod ??
          EDITORIAL_TITLE_PROFILE.textLegibility.contrastMethod,
        display: {
          ...EDITORIAL_TITLE_PROFILE.textLegibility.display,
          ...policy.textLegibility?.display,
        },
      }
    : policy.textLegibility;
  return {
    ...policy,
    readingMotion,
    textLegibility,
    semanticProfile: policy.semanticProfile ?? "legacy",
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
    ...(textLegibilityEvidence ? { textLegibilityEvidence } : {}),
    ...(textFramingEvidence ? { textFramingEvidence } : {}),
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
      "text-off-canvas",
      "orphaned-decoration",
      "scale-pop",
      "opacity-pop",
      "semantic-context-required",
      "semantic-context-incomplete",
      "semantic-copy-changed",
      "semantic-member-reference",
    ].includes(code)
      ? "error"
      : "warning")
  );
}
