import { z } from "zod";
import {
  MechanismHashSchema,
  MechanismNarratedCycleSchema,
} from "@still-shift/scene-contract";
import { MechanismProductionBindingSchema } from "./production-report.ts";
import { MechanismProductionOwnedFileSchema } from "./production-queue-contract.ts";
import { MechanismCueCompilationSchema } from "./cue-lifecycle.ts";
import { freezeMechanismPack, mechanismPackHash } from "./pack-support.ts";
export const MECHANISM_PRODUCTION_EVIDENCE_LIMITS = {
  samples: 512,
  images: 1024,
  manifestBytes: 4 * 1024 * 1024,
  retainedCapacityBytes: 32 * 1024 * 1024,
  phoneWidth: 360,
  phoneHeight: 640,
  processOutputBytes: 256 * 1024,
  audioBytes: 512 * 1024 * 1024,
} as const;
const frame = z.number().int().nonnegative().max(107999);
const rect = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
const projection = z
  .object({
    anchor: z.string().min(1).max(128),
    pixel: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
    visibility: z.string().min(1).max(64),
  })
  .strict();
export const MechanismProductionEvidenceSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-evidence-1"),
    binding: MechanismProductionBindingSchema,
    output: MechanismProductionOwnedFileSchema,
    decodedReport: MechanismProductionOwnedFileSchema,
    compilation: MechanismCueCompilationSchema,
    plan: z
      .object({
        frameCount: z.number().int().positive().max(108000),
        fps: z.number().int().positive().max(60),
        width: z.number().int().min(16).max(8192),
        height: z.number().int().min(16).max(8192),
        sourceSamples: z.number().int().positive().max(172800000),
        cueRevision: z.number().int().nonnegative(),
        cueProjectHash: MechanismHashSchema,
        samples: z
          .array(
            z
              .object({
                frame,
                roles: z
                  .array(
                    z
                      .object({
                        cue: z.string().min(1).max(256),
                        kind: z.enum([
                          "entry",
                          "mid",
                          "exit",
                          "event-before",
                          "event-at",
                          "event-after",
                          "cut-before",
                          "cut-after",
                        ]),
                      })
                      .strict(),
                  )
                  .min(1)
                  .max(512),
              })
              .strict(),
          )
          .max(512),
        shots: z
          .array(
            z
              .object({
                cue: z.string().min(1).max(256),
                kind: z.enum([
                  "initial",
                  "contact",
                  "release",
                  "return",
                  "reset",
                ]),
                editing: z.enum(["cut", "hold", "transition"]),
                startFrame: frame,
                endFrameExclusive: z.number().int().positive().max(108000),
                midFrame: frame,
                captionCrop: rect,
                anchors: z.array(z.string().min(1).max(128)).max(16),
              })
              .strict(),
          )
          .max(64),
      })
      .strict(),
    nativeCapture: z
      .object({
        nativePictureSha256: MechanismHashSchema,
        sequenceSha256: MechanismHashSchema,
        originalNativeFrames: z.number().int().positive(),
        method: z.literal(
          "verified-original-native-projections-no-fresh-draws",
        ),
      })
      .strict(),
    images: z
      .array(
        z
          .object({
            file: MechanismProductionOwnedFileSchema,
            kind: z.enum(["frame", "phone", "caption-crop", "anchor-crop"]),
            outputFrame: frame,
            cue: z.string().max(256).nullable(),
            width: z.number().int().positive().max(8192),
            height: z.number().int().positive().max(8192),
            pixelsSha256: MechanismHashSchema,
            sourceFramePixelsSha256: MechanismHashSchema,
            crop: rect.nullable(),
            projections: z.array(projection).max(16),
          })
          .strict(),
      )
      .max(1024),
    audio: z
      .object({
        file: MechanismProductionOwnedFileSchema,
        decodedSha256: MechanismHashSchema,
        decodedBytes: z.number().int().positive(),
        samples: z.number().int().positive(),
        channels: z.number().int().min(1).max(2),
        sampleRate: z.literal(48000),
        method: z.literal("unmodified-float32-PCM-from-final-output"),
      })
      .strict(),
    exceptions: z
      .array(
        z
          .object({
            cue: z.string().max(256),
            outputFrame: frame,
            reason: z.string().max(1024),
            projections: z.array(projection).max(16),
          })
          .strict(),
      )
      .max(64),
    qualification: z.string().max(2048),
  })
  .strict();
export type MechanismProductionEvidence = z.infer<
  typeof MechanismProductionEvidenceSchema
>;
export type MechanismProductionEvidencePlan =
  MechanismProductionEvidence["plan"];
/** Output-frame boundaries use the compiler's exact ceil-at-or-after source-sample clock. */
export function planMechanismProductionEvidence(
  input: unknown,
): MechanismProductionEvidencePlan {
  const doc = MechanismNarratedCycleSchema.parse(input);
  const at = (sample: number) =>
    Number((BigInt(sample) * BigInt(doc.output.fps) + 47999n) / 48000n);
  const frameCount = at(doc.narration.sampleCount),
    samples = new Map<
      number,
      MechanismProductionEvidencePlan["samples"][number]["roles"]
    >();
  if (frameCount < 1 || frameCount > 108000)
    throw Error("Evidence output clock exceeds the mechanism frame bounds");
  const add = (
    frame: number,
    cue: string,
    kind: MechanismProductionEvidencePlan["samples"][number]["roles"][number]["kind"],
  ) => {
    if (frame < 0 || frame >= frameCount) return;
    const roles = samples.get(frame) ?? [];
    roles.push({ cue, kind });
    samples.set(frame, roles);
  };
  const shots = doc.cues.map((cue, index) => {
    const startFrame = at(cue.startSample),
      endFrameExclusive = doc.cues[index + 1]
        ? at(doc.cues[index + 1]!.startSample)
        : frameCount;
    if (
      (index === 0 && startFrame !== 0) ||
      startFrame >= endFrameExclusive ||
      endFrameExclusive > frameCount ||
      cue.endSampleExclusive > doc.narration.sampleCount
    )
      throw Error(
        "Evidence cue has an empty, unordered or outside-output interval",
      );
    const midFrame = Math.floor((startFrame + endFrameExclusive - 1) / 2);
    add(startFrame, cue.id, "entry");
    add(midFrame, cue.id, "mid");
    add(endFrameExclusive - 1, cue.id, "exit");
    if (cue.kind !== "initial")
      for (const [delta, kind] of [
        [-1, "event-before"],
        [0, "event-at"],
        [1, "event-after"],
      ] as const)
        add(startFrame + delta, cue.id, kind);
    if (index > 0 && cue.editing === "cut") {
      add(startFrame - 1, cue.id, "cut-before");
      add(startFrame, cue.id, "cut-after");
    }
    const x = Math.floor(doc.output.width * 0.04),
      y = Math.floor(doc.output.height * 0.75);
    return {
      cue: cue.id,
      kind: cue.kind,
      editing: cue.editing,
      startFrame,
      endFrameExclusive,
      midFrame,
      captionCrop: {
        x,
        y,
        width: doc.output.width - 2 * x,
        height: doc.output.height - y,
      },
      anchors: [
        ...new Set([
          ...(cue.layout?.protectedAnchors.map((p) => p.anchor) ?? []),
          ...cue.annotations.map((a) => a.anchor),
        ]),
      ],
    };
  });
  if (samples.size > MECHANISM_PRODUCTION_EVIDENCE_LIMITS.samples)
    throw Error("Evidence sample budget exceeded");
  // Match the normalized cue project identity used by the authoring compiler.
  return freezeMechanismPack({
    frameCount,
    ...doc.output,
    sourceSamples: doc.narration.sampleCount,
    cueRevision: doc.revision,
    cueProjectHash: mechanismPackHash(doc),
    samples: [...samples]
      .sort(([a], [b]) => a - b)
      .map(([frame, roles]) => ({ frame, roles })),
    shots,
  });
}
