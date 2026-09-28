import { z } from "zod";

export const SfxGenerationRequestSchema = z
  .object({
    provider: z.literal("elevenlabs"),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    prompt: z.string().trim().min(1).max(2000),
    durationSeconds: z.number().min(0.5).max(30),
    promptInfluence: z.number().min(0).max(1).default(0.3),
    loop: z.boolean().default(false),
  })
  .strict();

export const SfxGenerationProvenanceSchema = SfxGenerationRequestSchema.omit({
  id: true,
})
  .extend({
    model: z.literal("eleven_text_to_sound_v2"),
    generatedAt: z.iso.datetime(),
  })
  .strict();

export type SfxGenerationRequest = z.infer<typeof SfxGenerationRequestSchema>;
