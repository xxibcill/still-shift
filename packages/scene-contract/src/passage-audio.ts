import { z } from "zod";
import { SfxGenerationProvenanceSchema } from "./sfx-generation.ts";

const name = z.string().trim().min(1);
const frame = z.number().int().nonnegative();
const gain = z.number().min(-60).max(0).default(0);
export const PassageAnchorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cue"), id: name }).strict(),
  z
    .object({
      type: z.literal("event"),
      id: name,
      edge: z.enum(["start", "end"]),
    })
    .strict(),
]);
export const PassageAudioAssetSchema = z
  .object({
    id: name,
    path: name,
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    generation: SfxGenerationProvenanceSchema.optional(),
  })
  .strict();
export const PassageSoundSchema = z
  .object({
    id: name,
    beat: name,
    asset: name,
    anchor: PassageAnchorSchema,
    offset: z.number().int().default(0),
    sourceStartFrame: frame.default(0),
    durationFrames: z.number().int().positive(),
    gainDb: gain,
    fadeInFrames: frame.default(0),
    fadeOutFrames: frame.default(0),
  })
  .strict()
  .refine(
    (s) => s.fadeInFrames + s.fadeOutFrames <= s.durationFrames,
    "Sound fades must fit inside its duration",
  );
export const PassageAudioSchema = z
  .object({
    schemaVersion: z.literal("passage-audio-1"),
    assets: z.array(PassageAudioAssetSchema).max(100),
    sounds: z.array(PassageSoundSchema).max(500),
    masterGainDb: gain,
    narrationGainDb: gain,
  })
  .strict()
  .superRefine((audio, ctx) => {
    for (const key of ["assets", "sounds"] as const) {
      const ids = new Set<string>();
      audio[key].forEach((item, index) => {
        if (ids.has(item.id))
          ctx.addIssue({
            code: "custom",
            message: "Duplicate sound " + key + " id: " + item.id,
            path: [key, index, "id"],
          });
        ids.add(item.id);
      });
    }
  });
export type PassageAudio = z.infer<typeof PassageAudioSchema>;
export type PassageSound = z.infer<typeof PassageSoundSchema>;
export type PassageAudioAsset = z.infer<typeof PassageAudioAssetSchema>;
